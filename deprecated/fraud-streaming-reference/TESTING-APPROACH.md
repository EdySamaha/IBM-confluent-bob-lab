# Getting the result — Flink SQL queries

Run these in **Confluent Cloud → your environment → Flink → SQL workspace**
(set the catalog to your environment and the database to your cluster in the
workspace dropdowns). This is the payoff of the workshop: real-time aggregation
you can watch update live.

Run the producer first (`python/produce_messages.py`) so there is data to see.

---

## 1. Raw stream — is data arriving?

```sql
SELECT * FROM transactions LIMIT 20;
```

**Expect:** individual card transactions with `account_id`, `merchant`, `amount`,
`transaction_type`, `transaction_time`. Confirms the producer → Kafka → Flink path works.

---

## 2. Aggregated state — running total per account

```sql
SELECT * FROM account_activity;
```

**Expect:** one row per account that updates as events arrive — `total_spend` and
`txn_count` climbing. `ACC-001` should reach ~1600 across 8 transactions; the
others stay small. This is a continuous materialized aggregation, not a batch job.

---

## 3. Windowed — spend per 5-minute window

```sql
SELECT
  account_id,
  window_start,
  window_end,
  SUM(amount) AS window_spend,
  COUNT(*)    AS txn_count
FROM TABLE(
  TUMBLE(TABLE transactions, DESCRIPTOR(transaction_time), INTERVAL '5' MINUTES)
)
GROUP BY account_id, window_start, window_end;
```

**Expect:** one row per (account, window) with `window_start`/`window_end`. Rows
appear once the watermark advances past the window end — which the producer's late
`WATERMARK-TRIGGER` event forces within this run.

---

## 4. Filtered / business rule — the flagged accounts

The `fraud_alerts` table is fed by the pipeline that keeps only windows exceeding
the threshold, so simply reading it shows the fraud decisions:

```sql
SELECT * FROM fraud_alerts ORDER BY window_spend DESC;
```

**Expect:** `ACC-001` present with `window_spend` > 1000; the normal accounts
absent. **Seeing ACC-001 here is "the result"** — the system flagged a high-spend
account in real time, end to end, from infrastructure that an AI SDLC tool wrote.

---

## Verification checklist

- [ ] Query 1 returns raw events.
- [ ] Query 2 shows running totals that grow.
- [ ] Query 3 returns rows with window boundaries.
- [ ] Query 4 returns `ACC-001` (and not the normal accounts).
