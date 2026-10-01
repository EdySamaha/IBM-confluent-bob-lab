# Participant runbook — 90 minutes

**Goal:** describe a streaming system in plain English, have IBM Bob (an AI SDLC
tool) generate it, deploy it to Confluent Cloud with Terraform, feed it live data,
and watch it flag a high-spending account in real time.

**Before you start:** finish [PREREQUISITES-CHECKLIST.md](PREREQUISITES-CHECKLIST.md).

| Time | You do |
|---|---|
| 0:00–0:10 | **Intro & concepts.** Kafka (streams), Flink (stream processing), Schema Registry (governance), Terraform (IaC), Bob (AI writes the IaC). Confirm prereqs. |
| 0:10–0:30 | **Bob generates the system.** Open the Bob workspace with the skill; paste the standard prompt from [BOB-PROMPT.md](BOB-PROMPT.md). Review the `terraform/` and `python/` it produces; skim the Flink SQL. |
| 0:30–0:45 | **Deploy.** `cd terraform`, copy `terraform.tfvars.example` → `terraform.tfvars`, paste your Cloud API key/secret, keep region `us-east-1`. `terraform init && terraform apply`. Wait for it to finish and write `python/.env`. |
| 0:45–1:00 | **Produce data.** `cd ../python`, make a venv, `pip install -r requirements.txt`, `python produce_messages.py`. Watch the `✅ Delivered` lines. |
| 1:00–1:20 | **Get the result.** Confluent Cloud → Flink → SQL workspace. Run the 4 queries in [fraud-streaming-reference/TESTING-APPROACH.md](fraud-streaming-reference/TESTING-APPROACH.md). The `fraud_alerts` table showing `ACC-001` is the payoff. Explore topics + Schema Registry to see governance. |
| 1:20–1:30 | **Iterate & tear down.** Ask Bob for one change (e.g. lower threshold to 500), re-apply, re-query. Then **`terraform destroy`** — this stops all spend. Q&A. |

## The commands, in order

```bash
# 1. In Bob: paste the prompt from BOB-PROMPT.md, let it generate the project.

# 2. Deploy
cd terraform
cp terraform.tfvars.example terraform.tfvars   # paste your Cloud API key + secret
terraform init
terraform apply                                 # review, type 'yes'

# 3. Produce
cd ../python
python -m venv .venv
. .venv/Scripts/activate      # Windows Git Bash;  macOS/Linux: . .venv/bin/activate
pip install -r requirements.txt
python produce_messages.py

# 4. Query: run TESTING-APPROACH.md queries in the Flink SQL workspace.

# 5. Tear down — DO NOT SKIP
cd ../terraform
terraform destroy             # type 'yes'
```

## If something breaks

See the troubleshooting table in
[fraud-streaming-reference/SETUP.md](fraud-streaming-reference/SETUP.md).
Most common: forgot the payment method (→ `402`), or `jsonschema` missing
(→ `pip install -r requirements.txt`), or a query is empty (→ re-run the producer).

## The one rule

**Always finish with `terraform destroy`** so you don't leave resources billing
against your credit.
