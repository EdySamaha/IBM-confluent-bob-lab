# Lab — Trade Forecasting with Confluent Intelligence

**What this is:** a runnable, verified build of the
[`confluentinc/confluent-intelligence-trade-forecasting`](https://github.com/confluentinc/confluent-intelligence-trade-forecasting)
lab, provisioned end‑to‑end **inside Confluent Cloud** — no Terraform, no watsonx
Orchestrate. Two mock data streams (users + stock trades) are joined, windowed,
and fed to the built‑in **`ML_FORECAST`** function to predict each stock's trade
volume in its next 10‑second window.

- **Built:** 2026‑09‑30 · **Environment:** `env-k225o6` (bob-workshop-test-env) · **Region:** AWS `us-east-2` (Ohio)
- **Driven by:** the Confluent Cloud **REST API** (the CLI can't authenticate with an API key alone; a Global Cloud API key + REST does everything).
- **Status:** built, **verified with a live forecast**, then **stopped to save credit — nothing deleted.**

---

## Architecture

```
 Datagen: Users ─────────►  sample_data_users ──┐
 (AVRO, Schema Registry)                        │  (temporal join,
                                                 ▼   latest user per trade)
                            users_keyed  ──►  trades_enriched
 Datagen: Stock trades ─►  sample_data_stock_trades ▲
 (AVRO, Schema Registry) ───────────────────────────┘
                                                 │  TUMBLE 10s + COUNT per symbol
                                                 ▼
                                          trades_forecast  ◄── ML_FORECAST()
                                                 │
                                                 ▼
                              "latest forecast per stock" query  ← the payoff
```

Three artifacts are **materialized tables** (a table + its continuous query in one
object): `users_keyed`, `trades_enriched`, `trades_forecast`.

---

## Resources provisioned

| Resource | ID | Notes |
|---|---|---|
| Kafka cluster | `lkc-yo9mj0p` | **Basic**, AWS `us-east-2`, single‑zone |
| Flink compute pool | `lfcp-12djo8j` | max 10 CFU, AWS `us-east-2` |
| Topics | `sample_data_users`, `sample_data_stock_trades` | 1 partition each |
| Materialized tables (auto‑topics) | `users_keyed`, `trades_enriched`, `trades_forecast` | created by Flink |
| Datagen connector | `datagen_users` | quickstart `USERS`, AVRO |
| Datagen connector | `datagen_stock_trades` | quickstart `STOCK_TRADES`, AVRO |
| Kafka API key | `TCQMAYDPQAE7G622` | for topics + connectors |
| Flink API key | `5M7SF6HFWMXJNPCM` | region‑scoped, for SQL statements |

> **Deliberate deviation from the source lab:** the lab specifies a **Standard**
> cluster; this build uses **Basic**. Reason: Basic has **no hourly base fee** (Standard
> bills a base rate every hour it exists, even idle), while still supporting everything
> here — topics, Datagen connectors, Flink, Schema Registry, and `ML_FORECAST`. This
> keeps a stopped‑but‑not‑deleted environment at ~$0/hr. Nothing else changed.

---

## Two things that make or break this build

1. **Flink catalog/database = your names.** In Confluent Cloud Flink the **catalog is
   the environment name** and the **database is the cluster name**. The source lab shows
   `default` / `cluster_0` because those are *their* names. Here:
   - catalog = `bob-workshop-test-env`
   - database = `trade-forecasting`

2. **Datagen format must be AVRO, not JSON.** For Flink to see typed columns
   (`userid`, `symbol`, `price`, …) instead of an opaque blob, the topics need schemas
   in **Schema Registry**. The `AVRO` output format registers them automatically;
   schemaless JSON would leave Flink with nothing to join on.

---

## Build steps (REST API)

All calls use HTTP Basic auth with a Confluent Cloud API key. Secrets live in
`build/.env` (git‑ignored) and helper functions in `build/flink.sh`.

### 1. Cluster + compute pool
`POST /cmk/v2/clusters` (Basic, AWS us-east-2) and
`POST /fcpm/v2/compute-pools` (max_cfu 10, AWS us-east-2). Poll each until
`status.phase = PROVISIONED`.

### 2. Credentials
- Kafka API key: `POST /iam/v2/api-keys` with `resource.id = <cluster>`.
- Flink API key: `POST /iam/v2/api-keys` with `resource = { id: "aws.us-east-2", environment: "<env>" }`
  (a Flink key **requires** the environment or you get `missing_user_info`).

### 3. Topics + Datagen connectors
- `POST /kafka/v3/clusters/<cluster>/topics` for both source topics.
- `POST /connect/v1/environments/<env>/clusters/<cluster>/connectors` twice, e.g.:
  ```json
  {
    "name": "datagen_stock_trades",
    "config": {
      "connector.class": "DatagenSource",
      "kafka.auth.mode": "KAFKA_API_KEY",
      "kafka.api.key": "<kafka key>",
      "kafka.api.secret": "<kafka secret>",
      "kafka.topic": "sample_data_stock_trades",
      "output.data.format": "AVRO",
      "quickstart": "STOCK_TRADES",
      "tasks.max": "1"
    }
  }
  ```
  Poll `/connectors/<name>/status` until `RUNNING`.
  *(One connector hit a transient `Error registering Avro schema` on first launch;
  deleting and recreating it fixed it — worth knowing if you see it.)*

### 4. Flink statements
`POST https://flink.us-east-2.aws.confluent.cloud/sql/v1/organizations/<org>/environments/<env>/statements`
with a body carrying the SQL, `compute_pool_id`, `principal` (the API key's owner user,
`u-63r0533` here), and properties `sql.current-catalog` / `sql.current-database`.
Read output from `GET .../statements/<name>/results`, following `metadata.next` for
streaming results.

#### Step 1 — key users into a lookup table
```sql
CREATE MATERIALIZED TABLE users_keyed (
  userid STRING NOT NULL,
  regionid STRING,
  gender STRING,
  PRIMARY KEY (userid) NOT ENFORCED
) AS
SELECT COALESCE(userid, '') AS userid, regionid, gender FROM sample_data_users;
```

#### Step 2 — enrich each trade with its user (temporal join)
```sql
CREATE MATERIALIZED TABLE trades_enriched AS
SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.`$rowtime` AS u
  ON t.userid = u.userid;
```
> The join emits nothing for the first few seconds while watermarks warm up — this is
> normal, not a bug. Once `users_keyed` has committed rows with `$rowtime` at/behind the
> trades, rows flow.

#### Step 3 — window per stock and forecast
```sql
CREATE MATERIALIZED TABLE trades_forecast AS
SELECT symbol, ts,
  trade_count                AS current_count,
  forecast[1].forecast_value AS forecast_count,
  forecast[1].upper_bound    AS upper_bound
FROM (
  SELECT symbol, window_end AS ts, trade_count,
    ML_FORECAST(
      CAST(trade_count AS DOUBLE),
      window_end,
      JSON_OBJECT('minTrainingSize' VALUE 10, 'horizon' VALUE 5)
    ) OVER (PARTITION BY symbol ORDER BY window_time) AS forecast
  FROM (
    SELECT symbol, window_end, window_time, COUNT(*) AS trade_count
    FROM TABLE(TUMBLE(TABLE trades_enriched, DESCRIPTOR(`$rowtime`), INTERVAL '10' SECONDS))
    GROUP BY symbol, window_start, window_end, window_time
  )
)
WHERE CARDINALITY(forecast) >= 1;
```
> `ML_FORECAST` returns an **array**; `forecast[1]` is the next‑window prediction.
> `minTrainingSize = 10` means a stock produces its first forecast only after ~10
> closed windows (~100 s) of its own history.

#### Verification query — latest forecast per stock
```sql
SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY `$rowtime` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;
```

---

## Verified result (live, 2026‑09‑30)

`current_count` = trades in the latest 10 s window · `forecast_count` = model's
prediction for the next window · `upper_bound` = top of the confidence range.
`forecast_count > current_count` ⇒ the stock is **heating up**.

| symbol | current | forecast | upper | trend |
|--------|--------:|---------:|------:|-------|
| ZJZZT  | 13 | 15.0 | 23.0 | heating up |
| ZTEST  | 18 | 19.0 | 35.0 | heating up |
| ZVV    | 16 | 20.0 | 34.0 | heating up |
| ZVZZT  | 11 | 12.0 | 32.0 | heating up |
| ZWZZT  | 13 | 15.0 | 34.0 | heating up |
| ZXZZT  | 13 | 15.0 | 34.0 | heating up |

The full pipeline was confirmed stage by stage: `users_keyed` (1000+ rows), the
temporal join (340 enriched rows in a sample), the tumbling window counts (72 window
rows across ~10 symbols), and finally the `ML_FORECAST` output above.

---

## Current state — stopped, nothing deleted

| Resource | State | Cost while in this state |
|---|---|---|
| Basic cluster `lkc-yo9mj0p` | PROVISIONED | **No hourly base fee.** Only storage of a few MB of retained data — fractions of a cent/day. |
| Compute pool `lfcp-12djo8j` | PROVISIONED, **0 CFU** | **$0/hr** while idle (Flink bills only for CFU in use). |
| `datagen_users`, `datagen_stock_trades` | **PAUSED** | **$0** — Datagen connectors bill only while `RUNNING`. |
| `users_keyed`, `trades_enriched`, `trades_forecast` | **SUSPENDED** | **$0** — refresh statements stopped; table data retained. |
| All topics + data | retained | negligible storage |

**Net ongoing cost ≈ $0/hr** — essentially just a few MB of Basic‑cluster storage.
Nothing was deleted; everything can be resumed.

> How "stop" was achieved without deleting: connectors were **paused**
> (`PUT /connectors/<name>/pause`); the three materialized tables' hidden system
> refresh statements can't be edited directly, so each table was frozen with
> `ALTER MATERIALIZED TABLE <name> SUSPEND;`. With no input and no running statements,
> the pool auto‑scaled to **0 CFU**.

---

## Resume the demo

1. Resume connectors: `PUT /connect/v1/environments/env-k225o6/clusters/lkc-yo9mj0p/connectors/<name>/resume` (both).
2. Resume tables (run in the SQL workspace or via the statements API):
   ```sql
   ALTER MATERIALIZED TABLE users_keyed RESUME;
   ALTER MATERIALIZED TABLE trades_enriched RESUME;
   ALTER MATERIALIZED TABLE trades_forecast RESUME;
   ```
3. Wait ~2 min for windows to refill, then run the verification query.

## Full teardown (only if you want zero footprint — this **deletes**)

```sql
DROP MATERIALIZED TABLE trades_forecast;
DROP MATERIALIZED TABLE trades_enriched;
DROP MATERIALIZED TABLE users_keyed;
```
Then delete both connectors, then the compute pool, then the cluster (REST `DELETE`
on each), and finally the two API keys. The environment `env-k225o6` can stay.

---

## Files in this repo

- `build/` — build scripts and captured API responses (`build/.env` holds live secrets, git‑ignored).
- `build/flink.sh` — reusable Flink SQL REST helper (`flink_submit`, `flink_status`, `flink_results`, `flink_wait`, `flink_delete`).
- `old/lab_terraform_orchestrate/` — the earlier Bob + Terraform + Orchestrate workshop material (kept, not deleted).
