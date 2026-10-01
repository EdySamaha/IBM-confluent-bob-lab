# Deprecated

These files are from the earlier workshop approach (IBM Bob + Terraform +
watsonx Orchestrate, fraud-monitoring domain). They were superseded on
2026-09-30 when the demo switched to the **Confluent Intelligence — Trade
Forecasting** lab (`confluentinc/confluent-intelligence-trade-forecasting`),
which runs **entirely inside Confluent Cloud with no Terraform and no
Orchestrate**.

Nothing here is deleted — kept for reference only. The current demo lives in the
project root.

Contents:
- `fraud-streaming-reference/` — Terraform + Python producer + FastAPI Orchestrate bridge (validated offline, never deployed)
- `bob-workspace/` — cloned IBM Bob skill (`data-streaming-confluent-terraform`)
- `BOB-PROMPT.md`, `ORCHESTRATE-BONUS.md`, `FACILITATOR-GUIDE.md`,
  `PARTICIPANT-RUNBOOK.md`, `PREREQUISITES-CHECKLIST.md`, `WORKSHOP-HANDOUT.md`
  — docs for the old Bob/Terraform workshop
