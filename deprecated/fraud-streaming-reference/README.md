# Reference: real-time payment fraud monitoring on Confluent Cloud

A small, fully-working streaming stack: card transactions flow into Kafka, Flink
keeps a **running spend total per account** and **flags accounts whose spend in a
5-minute window exceeds a threshold**. Infrastructure is defined in Terraform; a
Python producer feeds sample data.

This is the **gold copy** for the workshop — the thing an AI SDLC tool (IBM Bob)
is asked to generate. Use it to (a) test the whole flow yourself before running
the workshop, and (b) compare against what Bob produces on the day.

## Architecture

```
produce_messages.py ──▶ Kafka topic `transactions` ──▶ Flink
                                                         ├─▶ account_activity  (running total per account)
                                                         └─▶ fraud_alerts       (windowed, spend > threshold)
                          Schema Registry (json-registry) governs all payloads
```

- **Cluster:** Basic Kafka (no hourly base fee), region `us-east-1`, AWS.
- **Governance:** Schema Registry (Stream Governance Essentials), JSON Schema.
- **Compute:** one Flink pool (bills only while statements run).
- **Cost:** whole thing built and destroyed in a session ≈ $1–5, inside free credit.

## Layout

```
terraform/   providers, variables, main (all resources), outputs (+ auto .env), tfvars example
python/      requirements, produce_messages.py, sample-transactions.json, .env.example
SETUP.md            deploy + run + tear down, with troubleshooting
TESTING-APPROACH.md the 4 Flink queries that show the result
```

## Quick start

See [SETUP.md](SETUP.md). Short version:

```bash
cd terraform && cp terraform.tfvars.example terraform.tfvars   # add your Cloud API key
terraform init && terraform apply
cd ../python && python -m venv .venv && . .venv/Scripts/activate && pip install -r requirements.txt
python produce_messages.py
# then run TESTING-APPROACH.md queries in the Flink SQL workspace
cd ../terraform && terraform destroy
```

## Validated so far (offline, no cluster)

- `terraform init` + `terraform validate` pass (confluent provider 2.86.0).
- `terraform fmt` clean.
- Producer compiles; `JSONSerializer` import chain resolves; data-generation logic
  produces a flagged `ACC-001` (~1600) and below-threshold normal accounts.

Not yet run against a live cluster (`terraform apply` / producing / querying) —
that needs a working Cloud API key. See the workshop docs one level up.
