# Real-Time Trade Forecasting — Confluent Cloud + IBM Bob

A hands-on streaming lab: two mock data streams (users and stock trades) are
joined, windowed, and fed to Confluent Intelligence's built-in **`ML_FORECAST`**
to predict each stock's trade volume in its next 10-second window — all in
**Flink SQL**, entirely inside **Confluent Cloud**. No Terraform, no local
installs.

Packaged for **in-person labs and interviews**: a verified reference build, a
student guide, and a stage-by-stage validation checklist.

---

## The pipeline

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

`users_keyed`, `trades_enriched`, and `trades_forecast` are **materialized
tables** — a table plus its always-on refresh query, in one object.

**The payoff:** one row per stock showing its current trade count, its predicted
next-window count, and a confidence bound. When `forecast > current`, the stock
is *heating up*.

| symbol | current | forecast | upper | reading    |
|--------|--------:|---------:|------:|------------|
| ZVV    | 16      | 20.0     | 34.0  | heating up |
| ZTEST  | 18      | 19.0     | 35.0  | heating up |

*(Reference run — your symbols and numbers will differ.)*

---

## Two ways to use this repo

| Goal | Start here |
|------|------------|
| **Run / teach the lab** (60 min, Confluent + Bob) | [`lab/`](lab/) — the student Word guide |
| **Drive it with the AI co-pilot** (copy-paste Bob prompts) | [`BOB_PROMPTS.md`](BOB_PROMPTS.md) — granular, checkpointed, 60 min |
| **See the exact verified build** (SQL, resources, REST) | [`LAB.md`](LAB.md) |
| **Confirm your own build works** | [`VALIDATE_OUTPUT.md`](VALIDATE_OUTPUT.md) — smoke test |

---

## Repository map

| Path | What's inside |
|------|---------------|
| [`README.md`](README.md) | This overview (start here) |
| [`BOB_PROMPTS.md`](BOB_PROMPTS.md) | AI co-pilot path: copy-paste IBM Bob prompts for every step, each with a verify-before-you-continue checkpoint, timed to 60 minutes |
| [`.bob/skills/trade-forecasting-flink/`](.bob/skills/trade-forecasting-flink/SKILL.md) | The IBM Bob **skill** for this lab — teaches Bob this lab's Flink SQL patterns (Datagen AVRO, materialized tables, temporal join, TUMBLE, `ML_FORECAST`). Open the repo as a Bob workspace to load it. |
| [`LAB.md`](LAB.md) | Full REST-driven walkthrough: architecture, resources, the 5 Flink SQL statements, verified result |
| [`VALIDATE_OUTPUT.md`](VALIDATE_OUTPUT.md) | Stage-by-stage checklist to verify a build end to end (what to look for · test · expected · fix) |
| [`lab/`](lab/) | Student-facing 60-minute Word lab (`.docx`) weaving Confluent Cloud + IBM Bob, plus its generator |
| [`build/`](build/) | Automation artifacts from the verified build: Flink REST helper, API responses, captured forecast rows. **Secrets are git-ignored.** |
| [`old/lab_terraform_orchestrate/`](old/lab_terraform_orchestrate/) | Earlier IBM Bob + Terraform + watsonx Orchestrate workshop, kept for history (superseded) |

---

## Core concepts the lab demonstrates

- **Managed Kafka + Flink SQL** on Confluent Cloud — streams as tables.
- **Temporal join** (`FOR SYSTEM_TIME AS OF`) to enrich each trade with the
  user profile as of the trade's event time.
- **Tumbling-window aggregation** (`TUMBLE`, 10s) to count trades per symbol.
- **`ML_FORECAST`** — built-in time-series forecasting over the windowed counts.
- **Schema governance** — AVRO + Schema Registry give Flink typed columns.

---

## Three things people get wrong

1. **Catalog / database naming** — in Confluent Cloud Flink, catalog = your
   **environment name**, database = your **cluster name** (not `default` /
   `cluster_0`).
2. **Connector format** — Datagen must output **AVRO**, not JSON, or Flink can't
   see typed columns and joins fail.
3. **Warm-up is not a bug** — temporal joins need ~30–60s of watermark warm-up;
   `ML_FORECAST` needs ~10 windows (~2 min) per symbol before it emits.

Full troubleshooting is in [`VALIDATE_OUTPUT.md`](VALIDATE_OUTPUT.md).

---

## Cost & safety

Built on a **Basic** Kafka cluster (no hourly base fee) in AWS `us-east-2`,
inside the free credit. When idle, connectors are paused, materialized tables
are suspended, and the Flink pool scales to 0 CFU — roughly **$0/hour**, with
nothing deleted. Live API keys stay local and git-ignored (`build/.env`,
`build/*-key.json`); never commit them.
