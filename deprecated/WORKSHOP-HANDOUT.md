# Confluent + IBM Bob hands-on workshop — participant handout

**What you'll do (90 min):** describe a streaming system in plain English, have
**IBM Bob** (an AI SDLC tool) generate it, deploy it to **Confluent Cloud** with
Terraform, feed it live data, and watch **Flink flag a high-spending account in
real time** — then tear it down. An optional bonus adds a **watsonx Orchestrate**
agent on top.

Everything runs in Confluent Cloud; on your laptop you only need Terraform + Python.

---

# Part 0 — Before the workshop (do this a day ahead, ~30 min)

**Not counted in the 90 minutes.** The account/card/API-key steps trip people up,
so finish them early.

## Accounts

- [ ] **Confluent Cloud account** — `confluent.cloud/signup` (new sign-ups get
      **$400 free credit / 30 days**).
- [ ] **Payment method on file** — Console → Billing & payment. *Required even with
      credits* (credit is spent first, so the workshop costs you nothing).
- [ ] **Cloud API key** — Console → Settings → **API keys** → *Cloud resource
      management*, scope "My account". Save the **key and secret**.
      ⚠️ **Do NOT create a Kafka cluster in the onboarding wizard** — Terraform makes it.
- [ ] **IBM Bob access** — confirm Bob opens and works.

## Local tools

| Tool | Version | Install |
|---|---|---|
| Git | any recent | https://git-scm.com |
| Python | ≥ 3.11 | https://python.org (tick "Add to PATH") |
| Terraform | ≥ 1.0 | `winget install Hashicorp.Terraform` (Windows) · `brew install terraform` (mac) |

Verify:

```bash
git --version
python --version
terraform -version
```

> **Windows:** after installing Terraform, open a **new** terminal (winget
> registers it as an app-execution alias). If still not found, sign out/in or use
> the full path under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Hashicorp.Terraform_*\`.

## Get the Bob skill

```bash
git clone https://github.com/bleporini/fraud-confluent-terraform-bob.git
```

This workspace contains the skill `data-streaming-confluent-terraform` at
`.bob/skills/confluent-iac-terraform/` that teaches Bob the Confluent + Terraform
patterns.

**You're ready when** all three `--version` commands work, you can see your Cloud
API key in the Console, billing shows a payment method + credit, and Bob opens.

---

# Part 1 — Intro & concepts (0:00–0:10)

- **Kafka** — the streaming backbone (topics of events).
- **Flink** — processes streams continuously (running totals, windows).
- **Schema Registry** — governs the shape of every message (JSON Schema here).
- **Terraform** — infrastructure as code; builds all of the above.
- **IBM Bob** — the AI SDLC tool that *writes* the Terraform + SQL + producer for you.

The system you'll build: card transactions → Kafka → Flink keeps a **running spend
total per account** and **flags accounts spending over 1000 in a 5-minute window**.

---

# Part 2 — Bob generates the system (0:10–0:30)

1. Open the cloned Bob workspace in Bob so it picks up the skill at
   `.bob/skills/confluent-iac-terraform/`.
2. Paste this **exact prompt** (everyone uses the same one):

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

3. Bob produces a `terraform/` folder (environment → Basic cluster → service
   account → Schema Registry → Flink pool → API keys → role bindings → Flink
   tables + streaming INSERTs, plus an auto-generated `python/.env`) and a
   `python/` producer. Skim the Flink SQL.

**Sanity-check Bob's output** (the reference project shows the exact form):
- Flink tables set `'key.format'`/`'value.format' = 'json-registry'` and
  `'kafka.consumer.isolation-level' = 'read-uncommitted'`.
- Source table has a `WATERMARK`; the windowed query uses `TABLE(TUMBLE(...))`.
- Producer keys are objects `{"account_id": ...}`, timestamps are integer ms, and
  it uses `JSONSerializer`.
- `requirements.txt` includes **`jsonschema`** (a common missing dependency).

---

# Part 3 — Deploy with Terraform (0:30–0:45)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars    # paste your Cloud API key + secret
# keep region = us-east-1
terraform init
terraform apply                                  # review the plan, type 'yes'
```

Takes ~5–12 min. It builds everything and **auto-writes `python/.env`** with the
runtime keys. While it runs, open the Confluent Console and watch the environment,
cluster, and Flink pool appear.

---

# Part 4 — Produce live data (0:45–1:00)

```bash
cd ../python
python -m venv .venv
. .venv/Scripts/activate        # Windows Git Bash;  macOS/Linux: . .venv/bin/activate
pip install -r requirements.txt
python produce_messages.py
```

You'll see `✅ Delivered → Partition N @ Offset M` for each event and a summary.
The data includes one high-spending account (`ACC-001`) plus a late
"watermark trigger" event that makes Flink close the window.

---

# Part 5 — Get the result (1:00–1:20)

Open **Confluent Cloud → your environment → Flink → SQL workspace** (set catalog =
your environment, database = your cluster). Run these:

**1. Raw stream — data is arriving:**
```sql
SELECT * FROM transactions LIMIT 20;
```

**2. Running total per account:**
```sql
SELECT * FROM account_activity;
```
`ACC-001` climbs toward ~1600; others stay small.

**3. Windowed spend per 5 minutes:**
```sql
SELECT account_id, window_start, window_end,
       SUM(amount) AS window_spend, COUNT(*) AS txn_count
FROM TABLE(TUMBLE(TABLE transactions, DESCRIPTOR(transaction_time), INTERVAL '5' MINUTES))
GROUP BY account_id, window_start, window_end;
```

**4. The flagged accounts — the payoff:**
```sql
SELECT * FROM fraud_alerts ORDER BY window_spend DESC;
```
**`ACC-001` appears here with window_spend > 1000; the normal accounts don't.**
That's the end-to-end result — infrastructure written by AI, detecting fraud live.

Also open the **topics** and **Schema Registry** views to see governance in action.

---

# Part 6 — Iterate & tear down (1:20–1:30)

Show the AI-SDLC loop — ask Bob for one change, e.g.:

```
Lower the fraud threshold to 500 and add the merchant name to the fraud_alerts output.
```

Re-apply, re-query. Then **stop all spend**:

```bash
cd ../terraform
terraform destroy       # type 'yes'
```

Confirm the Console shows no environment left.

> **The one rule:** always finish with `terraform destroy` so nothing keeps
> billing against your credit.

---

# Troubleshooting

| Symptom | Fix |
|---|---|
| `402` / "No credit card on file" | Add a payment method in Billing & payment, re-apply. |
| `403 forbidden` on apply | Cloud API key must be *Cloud resource management* scope on an account that can create environments. |
| Flink statement fails right after apply | RBAC still propagating; re-run `terraform apply`. |
| `ModuleNotFoundError: jsonschema` | `pip install -r requirements.txt`. |
| Query 2/3/4 empty | Re-run the producer; windowed rows need the late watermark-trigger event. |
| `SASL` auth error | `.env` not regenerated — re-run `terraform apply`; ensure `KAFKA_BOOTSTRAP_SERVERS` has no `SASL_SSL://` prefix. |
| `terraform` not found (Windows) | Open a new terminal after install. |

---

# Bonus — watsonx Orchestrate agent (optional, +20–30 min)

Only if you have watsonx Orchestrate set up. Put an AI agent in front of the
stream: ask *"which accounts are flagged and what should we do?"* and it calls a
tool, reads `fraud_alerts`, and recommends an action.

Because Orchestrate consumes **REST/OpenAPI tools** (not Kafka directly), run the
small provided API over the alerts topic, expose it publicly, and import its
OpenAPI spec into Orchestrate as a tool:

```bash
cd fraud-streaming-reference/orchestrate
python -m venv .venv && . .venv/Scripts/activate
pip install -r requirements.txt
uvicorn alerts_api:app --host 0.0.0.0 --port 8000
ngrok http 8000        # public URL for cloud Orchestrate to reach
```

Then in Orchestrate: create a tool from `<public-url>/openapi.json`, attach it to
an agent instructed to summarize flagged accounts and recommend freezing the
card / notifying the customer, and ask it about flagged accounts. Full steps and
caveats: see `ORCHESTRATE-BONUS.md`.
