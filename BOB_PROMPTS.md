# Driving IBM Bob — the AI co-pilot for the Trade Forecasting lab

This is the **AI-assisted path** through the lab. Instead of hand-writing Flink
SQL, you describe each step to **IBM Bob** in plain English, Bob generates the
SQL, you run it in Confluent Cloud, and you **verify before moving on**.

Every step below has four parts:

- **🗣 Prompt to Bob** — copy-paste it verbatim (standardized so everyone's
  output matches and support is easy).
- **🤖 Expected from Bob** — roughly what a good answer looks like.
- **▶️ Run** — what you paste into the Confluent Cloud SQL workspace.
- **✅ Checkpoint** — the thing to confirm *before* you continue. If it fails,
  use the **🛠 Debug with Bob** prompt.

> Compare Bob's SQL against the verified reference in [`LAB.md`](LAB.md). Deeper
> pass/fail signals per stage are in [`VALIDATE_OUTPUT.md`](VALIDATE_OUTPUT.md).

---

## Timing — fits a 60-minute workshop

| Time | Part | Bob's job |
|------|------|-----------|
| 0:00–0:05 | 0 · Prime Bob | Agree the plan; Bob becomes your pair-programmer |
| 0:05–0:10 | 1 · Load the skill & size resources | Recommend cheapest working setup |
| 0:10–0:18 | 2 · Cluster + compute pool | Basic vs Standard call |
| 0:18–0:26 | 3 · Datagen connectors | Why AVRO, not JSON |
| 0:26–0:30 | 4 · Flink workspace | Map catalog/database to your names |
| 0:30–0:36 | 5 · `users_keyed` | Generate the lookup table |
| 0:36–0:44 | 6 · `trades_enriched` | Generate the temporal join; debug warm-up |
| 0:44–0:54 | 7 · `trades_forecast` | Generate `ML_FORECAST`; explain it |
| 0:54–0:58 | 8 · Iterate | Regenerate SQL for a new requirement |
| 0:58–1:00 | 9 · Interpret & park | Generate suspend/resume steps |

---

## Load the skill (do this once, before the clock starts)

Bob writes sharper Confluent SQL when it has the companion **skill** loaded:

```bash
git clone https://github.com/bleporini/fraud-confluent-terraform-bob.git
```

- **Open that folder as your Bob workspace** so Bob discovers the skill at
  `.bob/skills/confluent-iac-terraform/SKILL.md`, **or**
- copy that `.bob/skills/` folder into your own Bob workspace.

> No skill? Bob can still produce correct Flink SQL from the prompts below — the
> skill mainly tightens its Confluent-specific conventions. Load it if you can.

---

## Part 0 — Prime Bob  ·  0:00–0:05

**🗣 Prompt to Bob**
```
You are my pair-programmer for a Confluent Cloud Flink SQL lab. We will build a
real-time stock-trade forecasting pipeline:
  1. ingest two streams — users and stock trades (Datagen, AVRO)
  2. keep a keyed lookup of users
  3. enrich each trade with its user's region/gender via a temporal join
  4. count trades per stock symbol in 10-second tumbling windows
  5. forecast each symbol's next-window count with the built-in ML_FORECAST
For each step I will describe the intent; you reply with the exact Flink SQL for
Confluent Cloud (not open-source Flink), then explain it in two or three lines.
Keep statements runnable as-is. Confirm the plan and we'll start.
```

**🤖 Expected from Bob** — restates the five steps and confirms it will target
Confluent Cloud Flink SQL.

**✅ Checkpoint** — Bob has the full plan in context. You're ready.

---

## Part 1 — Size the resources  ·  0:05–0:10

**🗣 Prompt to Bob**
```
Before I provision anything: what Confluent Cloud resources does this lab need
(cluster type, Flink compute pool, Schema Registry), and what is the CHEAPEST
configuration that still supports Datagen connectors and ML_FORECAST? I'll tear
it down the same day.
```

**🤖 Expected from Bob** — a Kafka cluster, a Flink compute pool, and Schema
Registry; and that a **Basic** cluster is sufficient (no hourly base fee) while
**Standard** adds cost you don't need here.

**✅ Checkpoint** — you know you'll create a **Basic** cluster + a Flink pool in
one region. (Account prerequisites — login, payment method, free credit — are in
[`VALIDATE_OUTPUT.md` Stage 0](VALIDATE_OUTPUT.md).)

---

## Part 2 — Cluster + compute pool  ·  0:10–0:18

**🗣 Prompt to Bob**
```
Confirm the exact choices for the cluster and the Flink compute pool: cloud
provider, region, and why the pool and cluster must share a region. I'm using
AWS us-east-2 (Ohio).
```

**🤖 Expected from Bob** — Basic cluster on AWS **us-east-2**; a Flink compute
pool in the **same** region (max ~10 CFU; idles to 0 CFU = $0/hour).

**▶️ Run** — in the console: create the Basic cluster, then create the Flink
compute pool (same region). Name the cluster e.g. `trade-forecasting`.

**✅ Checkpoint**
- Cluster status **Running** (Basic, AWS us-east-2).
- Compute pool provisioned in the same region.

**🛠 Debug with Bob**
```
My Flink compute pool is in a different region from my Kafka cluster. What breaks,
and what's the fix?
```

---

## Part 3 — Datagen connectors (AVRO)  ·  0:18–0:26

**🗣 Prompt to Bob**
```
I'll add two Datagen Source (Sample Data) connectors: the "Users" template to a
topic sample_data_users, and the "Stock trades" template to sample_data_stock_trades.
Why should the output value format be AVRO instead of JSON, and what exactly
breaks in Flink later if I pick schemaless JSON?
```

**🤖 Expected from Bob** — AVRO registers a schema in Schema Registry, so Flink
sees **typed columns** (`userid`, `symbol`, `price`, …); schemaless JSON leaves
Flink with an opaque blob and nothing to join on.

**▶️ Run** — create both connectors with the templates/topics above, value
format **AVRO**, and launch.

**✅ Checkpoint**
- Both connectors show **Running**.
- A value schema exists for each topic (Topics → topic → Schema tab).
- Live messages arrive in both topics (Messages tab).

**🛠 Debug with Bob**
```
One of my Datagen connectors is Failed on first launch. Is this usually a
transient schema-registration issue, and what's the safe way to recover without
changing the config?
```

---

## Part 4 — Flink workspace: catalog & database  ·  0:26–0:30

> The single most common mistake in this lab.

**🗣 Prompt to Bob**
```
In Confluent Cloud Flink SQL, what do "catalog" and "database" map to? My
environment is named "bob-workshop-test-env" and my cluster is "trade-forecasting".
What should I set the current catalog and database to, and give me a one-line
query to confirm my two source topics are visible.
```

**🤖 Expected from Bob** — **catalog = environment name**, **database = cluster
name** (not `default`/`cluster_0`); confirm with `SHOW TABLES;`.

**▶️ Run**
```sql
SHOW TABLES;
```

**✅ Checkpoint** — the list includes `sample_data_users` and
`sample_data_stock_trades`.

**🛠 Debug with Bob**
```
SHOW TABLES is empty / my tables won't resolve in Flink SQL. Walk me through the
catalog and database settings to fix it.
```

---

## Part 5 — Build `users_keyed`  ·  0:30–0:36

**🗣 Prompt to Bob**
```
Create a Confluent Cloud Flink MATERIALIZED TABLE called users_keyed from
sample_data_users. It should hold userid (primary key, never null), regionid, and
gender, so I can join trades to the latest profile per user. Give me the exact
CREATE MATERIALIZED TABLE statement.
```

**🤖 Expected from Bob** — equivalent to:
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

**▶️ Run** — the statement above, then verify:
```sql
SELECT * FROM users_keyed;
```

**✅ Checkpoint** — rows accumulate (User_1 … User_9) with `regionid`/`gender`.

**🛠 Debug with Bob**
```
Creating users_keyed fails saying regionid/gender don't exist. What does that tell
me about my sample_data_users topic, and how do I fix it?
```

---

## Part 6 — Build `trades_enriched` (temporal join)  ·  0:36–0:44

**🗣 Prompt to Bob**
```
Create a MATERIALIZED TABLE trades_enriched that joins sample_data_stock_trades
(fields: userid, symbol, side, quantity, price) to my users_keyed table, attaching
each user's regionid and gender as of the trade's event time. Use a temporal join
on the trade's $rowtime.
```

**🤖 Expected from Bob** — equivalent to:
```sql
CREATE MATERIALIZED TABLE trades_enriched AS
SELECT t.userid, t.symbol, t.side, t.quantity, t.price, u.regionid, u.gender
FROM sample_data_stock_trades t
JOIN users_keyed FOR SYSTEM_TIME AS OF t.`$rowtime` AS u
  ON t.userid = u.userid;
```

**▶️ Run** — the statement above, then verify:
```sql
SELECT * FROM trades_enriched;
```

**✅ Checkpoint** — after a short warm-up, rows show trade fields **plus**
`regionid`/`gender`.

**🛠 Debug with Bob** (use this if you see zero rows — read it, don't panic)
```
My Flink temporal join trades_enriched returns 0 rows even though both source
topics have data. Explain the watermark warm-up, and list the other usual causes
(key mismatch, catalog/database) and how to check each. How long should I wait
before deciding something is actually wrong?
```
*Expected: a temporal join emits nothing during watermark warm-up — wait ~30–60s
and re-run before troubleshooting.*

---

## Part 7 — Build `trades_forecast` with `ML_FORECAST`  ·  0:44–0:54

### 7a — Generate the forecast table

**🗣 Prompt to Bob**
```
Create a MATERIALIZED TABLE trades_forecast that, per stock symbol, counts trades
in 10-second tumbling windows over trades_enriched, then applies ML_FORECAST over
that count ordered by window time (minTrainingSize 10, horizon 5). Output symbol,
the window end as ts, the current count, and the next forecast value and its upper
bound. Use the TUMBLE table-valued function on $rowtime.
```

**🤖 Expected from Bob** — equivalent to:
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

**✅ Checkpoint** — the statement submits and starts running (no syntax error).

### 7b — Have Bob explain it (so you can teach it back)

**🗣 Prompt to Bob**
```
Explain in plain terms what this ML_FORECAST is doing: what do minTrainingSize=10
and horizon=5 mean, why do we read forecast[1], and why won't a stock produce a
forecast until it has about 10 closed windows of history?
```

**🤖 Expected from Bob** — `ML_FORECAST` returns an array of future predictions;
`forecast[1]` is the next window; a symbol needs ~10 closed 10-second windows
(~100s) before it forecasts; `horizon=5` projects up to 5 windows ahead.

### 7c — The result query (the payoff)

**🗣 Prompt to Bob**
```
Give me a Flink SQL query over trades_forecast that returns only the most recent
row per symbol (latest by $rowtime), showing symbol, current_count, forecast_count,
and upper_bound.
```

**▶️ Run** — expected:
```sql
SELECT symbol, current_count, forecast_count, upper_bound
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY `$rowtime` DESC) AS row_num
  FROM trades_forecast
)
WHERE row_num = 1;
```

**✅ Checkpoint — "the lab works"** — one row per symbol with current, forecast,
and upper bound. Reference run:

| symbol | current | forecast | upper | reading    |
|--------|--------:|---------:|------:|------------|
| ZJZZT  | 13      | 15.0     | 23.0  | heating up |
| ZTEST  | 18      | 19.0     | 35.0  | heating up |
| ZVV    | 16      | 20.0     | 34.0  | heating up |

When `forecast_count > current_count`, the stock is **heating up**.

**🛠 Debug with Bob**
```
trades_forecast exists but my result query returns no rows yet. Is it still
warming up, and how long until each symbol has enough history to forecast?
```

---

## Part 8 — Iterate with Bob (the AI-SDLC loop)  ·  0:54–0:58

Pick **one** and let Bob regenerate the SQL — you change the *requirement*, not
the syntax.

**Option A — break the forecast down by region**
```
Extend the pipeline: I want the trade-surge forecast per stock AND per regionid
(from trades_enriched). Give me the modified trades_forecast definition and tell
me what I must drop/recreate to apply it.
```

**Option B — turn it into an alert**
```
Give me a Flink SQL query over trades_forecast that returns only the stocks where
forecast_count is at least 25% higher than current_count — a real-time watch list
of stocks clearly heating up.
```

**✅ Checkpoint** — you ran Bob's new statement and saw the changed result,
without hand-editing SQL yourself.

**🏆 Stretch (if time allows)**
```
Generate Terraform (Infrastructure-as-Code) that provisions this whole pipeline:
the Kafka cluster, Schema Registry, Flink compute pool, API keys, role bindings,
and the Flink statements.
```

---

## Part 9 — Interpret & park the resources  ·  0:58–1:00

**🗣 Prompt to Bob**
```
I'm done. Give me the exact steps to stop everything WITHOUT deleting it so it
costs about $0/hour: how to pause the Datagen connectors and how to suspend the
three materialized tables (users_keyed, trades_enriched, trades_forecast). Then
give me the steps to resume later and how long to wait before the result query
returns rows again.
```

**🤖 Expected from Bob** — pause both connectors; suspend each table; the Flink
pool idles to 0 CFU; Basic cluster has no base fee ⇒ ≈ $0/hour. Resume = resume
connectors + `RESUME` all three tables (`users_keyed` first), wait ~2 min.

**▶️ Run**
```sql
ALTER MATERIALIZED TABLE trades_forecast SUSPEND;
ALTER MATERIALIZED TABLE trades_enriched SUSPEND;
ALTER MATERIALIZED TABLE users_keyed SUSPEND;
```
Then pause both connectors in the Connectors UI.

**✅ Checkpoint** — connectors **Paused**, tables **Suspended**, pool at **0
CFU** ⇒ roughly **$0/hour**, nothing deleted.

---

## Standardize on these prompts

For a group, give everyone the **same** prompts above so outputs match and
support is easy. The three things to watch across the room:

1. **Catalog = environment name, database = cluster name** (Part 4).
2. **Datagen must be AVRO** (Part 3).
3. **Warm-up is normal** — temporal join ~30–60s, `ML_FORECAST` ~2 min (Parts 6–7).
