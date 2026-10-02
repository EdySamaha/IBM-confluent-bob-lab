---
name: trade-forecasting-flink
description: Expert guidance for building the real-time Trade Forecasting lab on Confluent Cloud using Flink SQL only — Datagen source connectors (AVRO), materialized tables, a temporal join, tumbling-window aggregation, and the built-in ML_FORECAST function. No Terraform, no Python producer, no watsonx Orchestrate. Everything runs inside the Confluent Cloud console / Flink SQL workspace.
---

# Confluent Cloud Trade Forecasting (Flink SQL) Builder

## Purpose
This skill defines how to help a learner build the **Trade Forecasting lab**
end to end **inside Confluent Cloud using Flink SQL only**. The pipeline ingests
two mock streams (users + stock trades), enriches trades with user profiles via
a temporal join, counts trades per stock symbol in 10-second tumbling windows,
and forecasts each symbol's next-window volume with the built-in `ML_FORECAST`
function.

This is a **Flink-SQL-only** lab. It deliberately does **not** use Terraform, a
Python producer, Schema Registry serializers in code, or watsonx Orchestrate.
Data is produced by **Datagen Source connectors**, and every table is a
**materialized table** created in the Flink SQL workspace.

> If a learner asks for Terraform / a Python producer / Infrastructure-as-Code,
> that is a *different* lab (see `old/lab_terraform_orchestrate/` in this repo).
> For THIS lab, stay in Flink SQL.

## Objective
Turn plain-English intent into **runnable Confluent Cloud Flink SQL** for each
step of the lab, explain it briefly, and help the learner verify each stage
before moving on. Statements must run as-is in the Confluent Cloud SQL
workspace.

---

## Scope

Applies to:
- Confluent Cloud **Flink SQL** stream processing
- **Datagen Source** (Sample Data) connectors as the data source
- **Materialized tables** (`CREATE MATERIALIZED TABLE ... AS`)
- **Temporal joins** (`FOR SYSTEM_TIME AS OF`)
- **Tumbling-window** aggregation via the `TUMBLE` table-valued function
- **`ML_FORECAST`** (Confluent Intelligence built-in time-series forecasting)
- Stop/resume lifecycle (`ALTER MATERIALIZED TABLE ... SUSPEND | RESUME`)

Out of scope (route to the other lab or decline): Terraform, Python producers,
`confluent_*` resources, JSONSerializer code, Bedrock, Orchestrate.

---

## The target architecture

```
Datagen: Users ─────────►  sample_data_users ──┐
(AVRO + Schema Registry)                        │  temporal join
                                                ▼  (latest user per trade)
                            users_keyed  ──►  trades_enriched
Datagen: Stock trades ─►  sample_data_stock_trades ▲
(AVRO + Schema Registry) ───────────────────────────┘
                                                │  TUMBLE 10s + COUNT per symbol
                                                ▼
                                         trades_forecast  ◄── ML_FORECAST()
                                                │
                                                ▼
                             "latest forecast per stock"  ← the result
```

Three artifacts are **materialized tables** (a table + its always-on refresh
query, in one object): `users_keyed`, `trades_enriched`, `trades_forecast`.

---

## Procedure

You are a Confluent Cloud Flink SQL co-pilot. When the learner describes a step,
reply with the exact Flink SQL for that step, then explain it in two or three
lines, and tell them how to verify it. Follow this order.

### 1. Resources (advise, don't over-build)
- A **Basic** Kafka cluster is sufficient and has **no hourly base fee**;
  Standard adds cost this lab does not need. Recommend **Basic**.
- One **Flink compute pool** in the **same region** as the cluster. It idles to
  **0 CFU** ($0/hour) when nothing runs.
- Schema Registry is auto-provisioned with the environment.
- Region used by this lab: **AWS `us-east-2` (Ohio)**.

### 2. Data in via Datagen connectors (AVRO — not JSON)
Two **Sample Data (Datagen Source)** connectors:
- **Users** template → topic `sample_data_users`
- **Stock trades** template → topic `sample_data_stock_trades`

**CRITICAL — output value format must be AVRO.** AVRO registers a schema in
Schema Registry, so Flink sees **typed columns** (`userid`, `symbol`, `side`,
`quantity`, `price`, `regionid`, `gender`, …). Schemaless JSON leaves Flink with
one opaque column and nothing to join on. If a learner used JSON, have them
delete and recreate the connector as AVRO.

### 3. Point the SQL workspace at the right catalog/database
**CRITICAL — the #1 mistake in this lab:**
- **catalog = your environment name** (e.g. `bob-workshop-test-env`)
- **database = your cluster name** (e.g. `trade-forecasting`)

NOT `default` / `cluster_0` — those are just names other tutorials happen to
use. Verify with `SHOW TABLES;` → it must list `sample_data_users` and
`sample_data_stock_trades`.

### 4. `users_keyed` — a keyed lookup of users
```sql
CREATE MATERIALIZED TABLE users_keyed (
  userid STRING NOT NULL,
  regionid STRING,
  gender STRING,
  PRIMARY KEY (userid) NOT ENFORCED
) AS
SELECT COALESCE(userid, '') AS userid, regionid, gender
FROM sample_data_users;
```
- A primary key is required for the temporal (lookup) join in the next step.
- Verify: `SELECT * FROM users_keyed;` → user rows accumulate.

### 5. `trades_enriched` — temporal join
```sql
CREATE MATERIALIZED TABLE trades_enriched AS
SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.`$rowtime` AS u
  ON t.userid = u.userid;
```
- `FOR SYSTEM_TIME AS OF t.`$rowtime`` joins each trade to the user profile as
  of the trade's own event time (a temporal / event-time lookup join).
- `` `$rowtime` `` is the system event-time column; keep the backticks.
- Verify: `SELECT * FROM trades_enriched;` → trade rows now carry
  `regionid`/`gender`.
- **Warm-up is normal:** a temporal join emits nothing for the first few seconds
  while watermarks advance. Wait ~30–60s and re-run before troubleshooting.

### 6. `trades_forecast` — tumbling count + ML_FORECAST
```sql
CREATE MATERIALIZED TABLE trades_forecast AS
SELECT
  symbol, ts,
  trade_count                AS current_count,
  forecast[1].forecast_value AS forecast_count,
  forecast[1].upper_bound    AS upper_bound
FROM (
  SELECT
    symbol, window_end AS ts, trade_count,
    ML_FORECAST(
      CAST(trade_count AS DOUBLE),
      window_end,
      JSON_OBJECT('minTrainingSize' VALUE 10, 'horizon' VALUE 5)
    ) OVER (PARTITION BY symbol ORDER BY window_time) AS forecast
  FROM (
    SELECT symbol, window_end, window_time, COUNT(*) AS trade_count
    FROM TABLE(
      TUMBLE(TABLE trades_enriched, DESCRIPTOR(`$rowtime`), INTERVAL '10' SECONDS)
    )
    GROUP BY symbol, window_start, window_end, window_time
  )
)
WHERE CARDINALITY(forecast) >= 1;
```
- Inner query: tumbling 10-second windows per `symbol` via the `TUMBLE`
  table-valued function on `` `$rowtime` ``, producing `trade_count` per window.
- `ML_FORECAST(CAST(trade_count AS DOUBLE), window_end, JSON_OBJECT(...))` over a
  `PARTITION BY symbol ORDER BY window_time` returns an **array** of future
  predictions; `forecast[1]` is the **next** window.
- `minTrainingSize = 10` → a symbol needs ~10 closed 10-second windows (~100s)
  of its own history before it forecasts. `horizon = 5` → up to 5 windows ahead.
- `CAST(... AS DOUBLE)` is required — `ML_FORECAST` expects a double.
- Verify: the statement submits and runs; forecast rows appear after each symbol
  has ~10 windows of history (give it ~2 minutes).

### 7. The result — latest forecast per stock
```sql
SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY `$rowtime` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;
```
- `ROW_NUMBER() ... ORDER BY `$rowtime` DESC` + `WHERE row_num = 1` keeps only
  the most recent row per symbol (a standard dedup / latest-per-key pattern).
- Reading: `current_count` = latest 10s window count; `forecast_count` =
  predicted next-window count; `upper_bound` = top of the confidence range. When
  `forecast_count > current_count`, the stock is **heating up**.

### 8. Stop without deleting (save credit)
```sql
ALTER MATERIALIZED TABLE trades_forecast SUSPEND;
ALTER MATERIALIZED TABLE trades_enriched SUSPEND;
ALTER MATERIALIZED TABLE users_keyed SUSPEND;
```
Then **pause both Datagen connectors** in the Connectors UI. The Flink pool
idles to 0 CFU; a Basic cluster has no base fee ⇒ ≈ $0/hour, nothing deleted.
Resume = resume connectors + `ALTER MATERIALIZED TABLE <name> RESUME;` on all
three (`users_keyed` first), then wait ~2 minutes for windows to refill.

---

## Flink SQL conventions for this lab

✅ **Do**
- Use `CREATE MATERIALIZED TABLE <name> AS <query>` for derived tables — the
  table and its continuous refresh are one object.
- Keep the backticks on `` `$rowtime` `` (the system event-time column).
- Use the **TVF** window form: `TABLE(TUMBLE(TABLE src, DESCRIPTOR(`$rowtime`), INTERVAL '10' SECONDS))`.
- `CAST(count AS DOUBLE)` before `ML_FORECAST`.
- Define a `PRIMARY KEY (...) NOT ENFORCED` on the table you temporally join to.
- Select the catalog (environment) and database (cluster) before running DDL.

❌ **Don't (these belong to the other lab, not this one)**
- No `'connector' = 'kafka'`, `'topic' = ...`, `'bootstrap.servers' = ...`,
  `key.format`/`value.format` WITH clauses — the Datagen connectors + Schema
  Registry already define the source topics; you read them directly by name.
- No Terraform, no `confluent_*` resources, no Python producer / JSONSerializer.
- No `GROUP BY TUMBLE(...)` legacy syntax — use the TVF form above.

---

## Common pitfalls to avoid

1. ❌ **Wrong catalog/database** → "table not found". catalog = environment
   name, database = cluster name (not `default`/`cluster_0`).
2. ❌ **Datagen emitting JSON instead of AVRO** → Flink sees one opaque column;
   `regionid`/`gender`/`symbol` "don't exist". Recreate connectors as AVRO.
3. ❌ **Panicking at an empty temporal join** → warm-up is expected; wait
   ~30–60s and re-run.
4. ❌ **Expecting forecasts immediately** → `ML_FORECAST` needs ~10 windows
   (~2 min) of per-symbol history first.
5. ❌ **Dropping the backticks** on `` `$rowtime` `` → parse/resolve errors.
6. ❌ **Forgetting `CAST(... AS DOUBLE)`** in `ML_FORECAST`.
7. ❌ **Missing `PRIMARY KEY` on `users_keyed`** → the temporal lookup join
   won't resolve.
8. ❌ Trying to `DROP`/stop the system-generated `sys-...` refresh statements of
   a materialized table directly → use `ALTER MATERIALIZED TABLE ... SUSPEND`
   instead; they appear under `SHOW JOBS`, not the normal statements list.

---

## Quick reference

| Concept | Form |
|---|---|
| Derived table | `CREATE MATERIALIZED TABLE x AS SELECT ...` |
| Event-time column | `` `$rowtime` `` (keep backticks) |
| Temporal join | `JOIN t FOR SYSTEM_TIME AS OF a.`$rowtime` AS b ON ...` |
| Tumbling window | `TABLE(TUMBLE(TABLE src, DESCRIPTOR(`$rowtime`), INTERVAL '10' SECONDS))` |
| Forecast | `ML_FORECAST(CAST(c AS DOUBLE), window_end, JSON_OBJECT('minTrainingSize' VALUE 10,'horizon' VALUE 5)) OVER (PARTITION BY k ORDER BY window_time)` |
| Next window | `forecast[1].forecast_value`, `forecast[1].upper_bound` |
| Latest per key | `ROW_NUMBER() OVER (PARTITION BY k ORDER BY `$rowtime` DESC) = 1` |
| Pause / resume | `ALTER MATERIALIZED TABLE x SUSPEND;` / `RESUME;` |
| catalog / database | environment name / cluster name |

---

## Usage

1. **Describe one step** in plain English (e.g. "join each trade to its user's
   region as of the trade time").
2. Bob returns the **exact Flink SQL** for Confluent Cloud + a short explanation.
3. **Run it** in the SQL workspace and **verify** with the matching `SELECT`
   before moving on.
4. If a result is empty, ask Bob to **debug** — most often it's warm-up,
   AVRO/JSON, or catalog/database.
5. **Iterate**: change the requirement (e.g. forecast per region, or an alert
   watch list) and Bob re-derives the SQL.

The step-by-step prompts for a 60-minute run are in `BOB_PROMPTS.md`; the
verified reference build and result are in `LAB.md`; the per-stage pass/fail
checklist is in `VALIDATE_OUTPUT.md`.

---

## End of Skill Document
