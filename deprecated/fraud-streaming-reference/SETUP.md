# Setup — deploy and run the fraud-monitoring stack

End-to-end this takes ~15–25 minutes. All heavy lifting runs in Confluent Cloud;
locally you only need Terraform and Python.

## Prerequisites

- Confluent Cloud account with a **payment method on file** (credits are spent
  first; a card is required even so).
- A **Cloud API key** (Console → Settings → **API keys** → *Cloud resource
  management*, scope "My account"). **Do not create a cluster in the wizard** —
  Terraform creates it.
- Terraform ≥ 1.0, Python ≥ 3.11, Git.

## 1. Configure credentials

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: paste confluent_cloud_api_key / confluent_cloud_api_secret
# defaults: region us-east-1, AWS, Basic cluster
```

## 2. Deploy

```bash
terraform init
terraform apply      # review the plan, type 'yes'
```

This provisions: environment → Basic Kafka cluster → service account → Schema
Registry → Flink compute pool → 3 API keys → 3 role bindings → (30s RBAC settle)
→ Flink tables (`transactions`, `account_activity`, `fraud_alerts`) and the two
streaming pipelines. It also **auto-writes `python/.env`** with the runtime keys.
Expect ~5–12 minutes.

## 3. Produce data

```bash
cd ../python
python -m venv .venv
# Windows (Git Bash):   . .venv/Scripts/activate
# macOS/Linux:          . .venv/bin/activate
pip install -r requirements.txt
python produce_messages.py
```

You should see `✅ Delivered → Partition N @ Offset M` lines and a summary.

## 4. See the result

Open the **Flink SQL workspace** and run the queries in
[TESTING-APPROACH.md](TESTING-APPROACH.md). The `fraud_alerts` table returning
`ACC-001` is the end-to-end success signal.

## 5. Tear down (do this — it stops all spend)

```bash
cd ../terraform
terraform destroy   # type 'yes'
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `402` / "No credit card on file" on apply | Add a payment method in Billing & payment, then re-apply. |
| `403 forbidden` creating resources | The Cloud API key must be *Cloud resource management* scope on an account that can create environments. |
| Flink statement fails right after apply | RBAC not propagated yet; the 30s `time_sleep` usually covers it — re-run `terraform apply`. |
| Producer: `ModuleNotFoundError: jsonschema` | `pip install -r requirements.txt` (it is listed; the confluent-kafka extra alone does not include it). |
| Query 2/3/4 empty | Re-run the producer; windowed rows need the late `WATERMARK-TRIGGER` event to close the window. |
| `SASL` auth error in producer | `.env` was not regenerated — re-run `terraform apply`, or check `KAFKA_BOOTSTRAP_SERVERS` has no `SASL_SSL://` prefix. |
