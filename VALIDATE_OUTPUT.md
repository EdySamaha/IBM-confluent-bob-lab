# Trade Forecasting Lab — Environment Validation & Smoke Test

This guide tells you **what to look for and what to test** to confirm the
Real-Time Trade Forecasting lab is actually working in *your* Confluent Cloud
environment — stage by stage, from account setup through the final forecast.

Work top to bottom. Each stage has:

- **✅ What to look for** — the signal in the UI that the stage is healthy.
- **🧪 Test** — a concrete action or query you run yourself.
- **🎯 Expected** — what a passing result looks like.
- **🛠 If it fails** — the most common cause and the fix.

If every stage passes, the pipeline is working end to end.

> **Related files in this repo:** [`README.md`](README.md) is the overview and
> start-here map; [`LAB.md`](LAB.md) is the full REST-built walkthrough;
> [`lab/`](lab/) contains the student-facing 60-minute Word lab (Confluent + IBM
> Bob). This document is the checklist to *verify* a build.

---

## Pipeline at a glance

```
Datagen: Users ─────────►  sample_data_users ──┐
(AVRO + Schema Registry)                        │  temporal join
                                                ▼
                            users_keyed  ──►  trades_enriched
Datagen: Stock trades ─►  sample_data_stock_trades ▲
(AVRO + Schema Registry) ───────────────────────────┘
                                                │  TUMBLE 10s + COUNT per symbol
                                                ▼
                                         trades_forecast  ◄── ML_FORECAST()
                                                │
                                                ▼
                             "latest forecast per stock"  ← the payoff
```

You are verifying that data flows all the way to that last box.

---

## Stage 0 — Account, billing, and access

**✅ What to look for**
- You can sign in to the Confluent Cloud console.
- **Billing & payment** shows a payment method on file and available free credit
  (new accounts get $400 for 30 days).

**🧪 Test**
- Open **Billing & payment → Payment details**. Confirm a card is listed.

**🎯 Expected**
- A payment method is present. Credit is spent before any charge, so the lab
  runs at effectively $0 out of pocket.

**🛠 If it fails**
- No card → cluster/connector creation returns **402 Payment Required**. Add a
  card before continuing. (This was a real blocker in earlier runs.)

---

## Stage 1 — Kafka cluster is Running

**✅ What to look for**
- In your environment, the cluster shows status **Running** (green).

**🧪 Test**
- **Environments → your env → Clusters** and read the status badge.

**🎯 Expected**
- Status **Running**. Cloud = **AWS**, region = **us-east-2 (Ohio)**, type
  **Basic** (Basic has no hourly base fee — cheaper than Standard for this lab).

**🛠 If it fails**
- Stuck **Provisioning** for more than a few minutes → refresh; if it errors,
  recheck Stage 0 (billing).
- Wrong region → the Flink pool and connectors must be in the **same** region;
  recreate the cluster in us-east-2 if it isn't.

---

## Stage 2 — Flink compute pool is ready

**✅ What to look for**
- Under **Flink → Compute pools**, your pool shows a usable state and lists a
  **max CFU** (e.g. 10).

**🧪 Test**
- Open the compute pool; confirm it is in the **same region as the cluster**.

**🎯 Expected**
- Pool is provisioned and idles at **0 CFU** when nothing is running
  (0 CFU = $0/hour). It only bills while statements execute.

**🛠 If it fails**
- Region mismatch → SQL statements will not see your cluster. Recreate the pool
  in the cluster's region (us-east-2).

---

## Stage 3 — Datagen connectors are Running (and emitting AVRO)

You need **two** Sample Data (Datagen Source) connectors.

**✅ What to look for**
- **Connectors** lists both connectors with status **Running**.
  - Users template → topic **`sample_data_users`**
  - Stock trades template → topic **`sample_data_stock_trades`**
- Output value format is **AVRO** (not JSON).

**🧪 Test**
1. **Connectors** → confirm both are **Running** (not Failed / Provisioning).
2. **Schema Registry** (or Topics → a topic → **Schema** tab) → confirm a schema
   is registered for each topic's value.

**🎯 Expected**
- Both connectors **Running**; a value schema exists for each topic.

**🛠 If it fails**
- **AVRO matters and is not optional.** If a connector was created with
  schemaless JSON, Flink sees one opaque blob and later joins fail with "column
  not found." Delete and recreate the connector with **AVRO**.
- Connector **Failed** on first launch is sometimes a transient schema-
  registration hiccup → delete and recreate with the same config.

---

## Stage 4 — Topics are receiving live messages

**✅ What to look for**
- Both topics show a rising message count and live records.

**🧪 Test**
- **Topics → `sample_data_stock_trades` → Messages** tab. Watch new records
  arrive. Repeat for **`sample_data_users`**.

**🎯 Expected**
- New messages stream in continuously. Trade records carry fields like
  `userid`, `symbol`, `side`, `quantity`, `price`; user records carry `userid`,
  `regionid`, `gender`.

**🛠 If it fails**
- No messages → the connector isn't actually Running (Stage 3), or you're
  looking at the wrong topic name.

---

## Stage 5 — Flink SQL workspace points at the right catalog/database

This is the **single most common mistake** in this lab.

**✅ What to look for**
- In the SQL workspace, **Use catalog** = your **environment name**, and
  **Use database** = your **cluster name**.

**🧪 Test**
- Run:
  ```sql
  SHOW TABLES;
  ```

**🎯 Expected**
- You see `sample_data_users` and `sample_data_stock_trades` listed.

**🛠 If it fails**
- Empty list or "table not found" → **catalog = environment name**, **database =
  cluster name**. Tutorials that show `default` / `cluster_0` are just using
  *their* names. Select **your** environment and **your** cluster
  (e.g. database `trade-forecasting`), then re-run `SHOW TABLES;`.

---

## Stage 6 — `users_keyed` lookup table

**🧪 Test — create it**
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
**🧪 Test — verify**
```sql
SELECT * FROM users_keyed;
```

**🎯 Expected**
- Statement submits without error; the query returns user rows
  (User_1 … User_9) that accumulate over a few seconds.

**🛠 If it fails**
- "Column not found" for `regionid`/`gender` → the users topic is **not AVRO**
  (Stage 3). Recreate the connector as AVRO.

---

## Stage 7 — `trades_enriched` (temporal join)

**🧪 Test — create it**
```sql
CREATE MATERIALIZED TABLE trades_enriched AS
SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.`$rowtime` AS u
  ON t.userid = u.userid;
```
**🧪 Test — verify**
```sql
SELECT * FROM trades_enriched;
```

**🎯 Expected**
- After a short warm-up, rows appear with both trade fields **and**
  `regionid` / `gender` attached.

**🛠 If it fails — read this before assuming it's broken**
- **Zero rows for the first several seconds is normal.** A temporal join emits
  nothing while watermarks warm up. **Wait 30–60 seconds and re-run the
  `SELECT`** before troubleshooting.
- Still empty after a minute → check (a) `users_keyed` actually has rows
  (Stage 6), (b) `userid` values overlap on both sides, (c) you're on the right
  catalog/database (Stage 5).

---

## Stage 8 — `trades_forecast` (ML_FORECAST) — the core check

**🧪 Test — create it**
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

**🎯 Expected**
- The statement submits and starts running. Forecast rows begin appearing
  **once each symbol has ~10 closed 10-second windows** of history.

**🛠 If it fails / no rows yet**
- **This needs history.** `minTrainingSize = 10` means a symbol needs roughly
  **10 windows × 10 seconds ≈ 100 seconds** of its own data before it forecasts.
  **Give it ~2 minutes** after `trades_enriched` is flowing.
- Error on `ML_FORECAST` → confirm you're in a region/environment where
  Confluent Intelligence built-in ML functions are available, and that
  `trade_count` is cast to `DOUBLE` (as above).

---

## Stage 9 — The payoff: latest forecast per stock

**🧪 Test**
```sql
SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY `$rowtime` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;
```

**🎯 Expected — this is "the lab works"**
- One row per stock symbol, each with a current count, a predicted next-window
  count, and an upper bound. A reference run looked like:

| symbol | current_count | forecast_count | upper_bound | reading      |
|--------|--------------:|---------------:|------------:|--------------|
| ZJZZT  | 13            | 15.0           | 23.0        | heating up   |
| ZTEST  | 18            | 19.0           | 35.0        | heating up   |
| ZVV    | 16            | 20.0           | 34.0        | heating up   |
| ZVZZT  | 11            | 12.0           | 32.0        | heating up   |
| ZWZZT  | 13            | 15.0           | 34.0        | heating up   |
| ZXZZT  | 13            | 15.0           | 34.0        | heating up   |

Your symbols and numbers will differ. **How to read it:** `current_count` =
trades in the latest 10s window; `forecast_count` = predicted trades next
window; `upper_bound` = top of the confidence range. When
`forecast_count > current_count`, that stock is **heating up**.

**🛠 If it fails**
- Empty result but `trades_forecast` exists → still warming up (Stage 8); wait
  and re-run.

---

## Stage 10 — Cost / at-rest check (so nothing bills unexpectedly)

**✅ What to look for after you're done testing**
- Connectors **Paused**, materialized tables **Suspended**, compute pool idled
  to **0 CFU**, Basic cluster left running (no hourly base fee) ⇒ **≈ $0/hour**.

**🧪 Test — park it without deleting**
```sql
ALTER MATERIALIZED TABLE trades_forecast SUSPEND;
ALTER MATERIALIZED TABLE trades_enriched SUSPEND;
ALTER MATERIALIZED TABLE users_keyed SUSPEND;
```
Then **Connectors → each connector → Pause**.

**🎯 Expected**
- No statements running; pool auto-scales to 0 CFU; connectors show **Paused**
  and bill $0. Nothing is deleted — resume any time with connector **Resume**
  and `ALTER MATERIALIZED TABLE <name> RESUME;` (bring up `users_keyed` first,
  then wait ~2 minutes for windows to refill before re-running Stage 9).

---

## One-screen checklist

| # | Stage | Pass signal |
|---|-------|-------------|
| 0 | Billing | Payment method on file; credit available |
| 1 | Cluster | Status **Running**, AWS us-east-2, Basic |
| 2 | Flink pool | Provisioned, same region, idles to 0 CFU |
| 3 | Connectors | Both **Running**, output **AVRO**, schemas registered |
| 4 | Topics | Live messages in both topics |
| 5 | Workspace | `SHOW TABLES;` lists both `sample_data_*` topics |
| 6 | users_keyed | `SELECT *` returns user rows |
| 7 | trades_enriched | Rows with region/gender (after warm-up) |
| 8 | trades_forecast | Runs; rows after ~2 min of history |
| 9 | Result query | One forecast row per symbol — **the payoff** |
| 10 | At rest | Paused/Suspended/0 CFU ⇒ ≈ $0/hour |

---

## Top failure modes (memorize these three)

1. **Catalog/database wrong** → nothing resolves. Catalog = **environment
   name**, database = **cluster name** (not `default`/`cluster_0`).
2. **Connectors not AVRO** → Flink can't see typed columns; joins fail. Recreate
   as **AVRO**.
3. **Empty joins/forecasts too early** → not a bug. Temporal joins need a
   watermark warm-up (~30–60s); `ML_FORECAST` needs ~10 windows (~2 min) per
   symbol. **Wait, then re-run.**
