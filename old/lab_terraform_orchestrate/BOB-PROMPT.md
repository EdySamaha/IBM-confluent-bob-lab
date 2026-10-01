# Driving IBM Bob — the AI SDLC step

This is the heart of the workshop: participants describe the system in plain
English and Bob generates the Terraform + Flink SQL + Python producer. The
`fraud-streaming-reference/` folder is what a good result looks like.

## 1. Load the skill

Bob uses a "skill" that teaches it the Confluent + Terraform patterns. It lives at
`.bob/skills/confluent-iac-terraform/SKILL.md` (skill id
`data-streaming-confluent-terraform`).

Get it into your Bob workspace one of two ways:

- **Clone the companion workspace** and open it in Bob:
  ```bash
  git clone https://github.com/bleporini/fraud-confluent-terraform-bob.git
  ```
  (Already cloned locally under `bob-workspace/` for reference.)
- **Or** copy the `.bob/skills/confluent-iac-terraform/` folder into your own Bob
  workspace so Bob discovers the skill.

> Open item to confirm in your live Bob UI: the exact "load/activate skill" click
> path. The skill is file-based (`.bob/skills/...`), so opening the workspace that
> contains it is normally enough for Bob to pick it up.

## 2. The standardized prompt

Give everyone the **same** prompt so outputs match and support is easy:

```
Build a real-time payment fraud monitoring system on Confluent Cloud that:
- ingests card transactions with fields: account_id, merchant, amount,
  transaction_type, transaction_time
- keeps a running total spend and transaction count per account
- flags any account whose total spend within a 5-minute tumbling window
  exceeds 1000

Generate:
- Terraform for a Basic Kafka cluster in AWS region us-east-1, Schema Registry,
  a Flink compute pool, service account, API keys and role bindings, and the
  Flink SQL tables and streaming INSERT statements
- a Python producer that reads schemas from Schema Registry and sends realistic
  sample transactions (millisecond timestamps, object keys), including data that
  triggers the fraud alert
- setup and testing docs

Use region us-east-1 and a Basic cluster. Do not use AWS Bedrock or any
non-Confluent cloud service.
```

## 3. What Bob should produce (two phases)

1. **Infrastructure:** `terraform/` (providers, variables, `main.tf` with
   environment → Basic cluster → service account → Schema Registry → Flink pool →
   API keys → role bindings → 30s `time_sleep` → Flink tables + INSERTs),
   `outputs.tf` that auto-writes `python/.env`.
2. **Producer:** `python/` with `requirements.txt`, `produce_messages.py`
   (JSONSerializer, object keys, ms timestamps), sample data, and docs.

## 4. Compare against the reference

Skim Bob's output next to `fraud-streaming-reference/`. Key things that must be
right (see the reference for exact form):

- All Flink tables set `'key.format'` and `'value.format' = 'json-registry'` and
  `'kafka.consumer.isolation-level' = 'read-uncommitted'`.
- Source table has a `WATERMARK`; windowed query uses the TVF `TUMBLE(...)` form.
- Producer keys are **objects** (`{"account_id": ...}`), timestamps are **integer
  milliseconds**, and it uses `JSONSerializer`.
- `requirements.txt` includes `jsonschema` (the confluent-kafka extra alone does
  not pull it in — a common failure).
- Flink statements `depends_on` the `time_sleep`.

## 5. Iterate (shows the AI-SDLC loop)

Ask Bob for one change to demonstrate iteration, e.g.:

```
Lower the fraud threshold to 500 and add the merchant name to the fraud_alerts
output.
```

Regenerate, `terraform apply` the change, re-query. Then `terraform destroy`.
