# Facilitator guide

## What this workshop proves

In 90 minutes each participant, on their own laptop and their own Confluent Cloud
account, uses an AI SDLC tool (IBM Bob) to **generate** a real streaming system,
**deploys** it, feeds it data, and **watches Flink flag a fraudulent account in
real time** — then tears it down. It showcases Kafka, Flink, Schema Registry, IaC,
and AI-assisted development in one flow.

## Why this design

- **Repo 3 (IBM Bob + Terraform) was chosen** over the two other candidate
  tutorials because it is the only one where the AI SDLC tool *configures
  Confluent* (the stated point), and it needs only accounts you have (Confluent +
  Bob) — not AWS Bedrock, which the fraud-agent demo requires.
- **Everyone uses their own account + free credit** — no shared cluster, no
  contention, trivial to run for a small group.
- **Basic cluster, single region (us-east-1), one standard prompt** — keeps every
  participant's output near-identical so you can support the room.

## Run it yourself first

Do a full dry run with [fraud-streaming-reference/SETUP.md](fraud-streaming-reference/SETUP.md).
That folder is the validated reference — deploy it, produce, query, destroy. Doing
this once means you can unblock anyone during the live session.

## Timing & facilitation notes

- **Prereqs are the real risk.** Send [PREREQUISITES-CHECKLIST.md](PREREQUISITES-CHECKLIST.md)
  a day ahead and check billing/API-key completion before the clock starts. The
  card-on-file step trips people up (credits still require a card).
- **The 0:30–0:45 deploy** is mostly waiting (~5–12 min). Use it to walk the room
  and explain what Terraform is creating (open the Confluent Console live).
- **Standardize the Bob prompt** ([BOB-PROMPT.md](BOB-PROMPT.md)). If someone's Bob
  output diverges, have them compare against `fraud-streaming-reference/` rather
  than debugging from scratch.
- **The result moment** (0:00–1:20): make everyone run query 4 and see `ACC-001`
  in `fraud_alerts` together. That is the "aha".
- **Enforce `terraform destroy`** at the end — walk the room and confirm each
  person's Console shows no environment left.

## Cost & safety

- Basic Kafka has no hourly base fee; Flink bills only while statements run; tiny
  data. Built + destroyed same session ≈ **$1–5 per person**, inside the $400
  free credit. The only real cost risk is *leaving it running* — hence the
  mandatory destroy.
- `terraform.tfvars` and `python/.env` hold live secrets — they are git-ignored;
  tell participants not to share or commit them.

## Known gotchas (already handled in the reference)

| Gotcha | Handling |
|---|---|
| `jsonschema` not pulled by `confluent-kafka[schema-registry]` | Listed explicitly in `requirements.txt`. |
| `bootstrap_endpoint` carries a `SASL_SSL://` prefix | Stripped in `outputs.tf` before writing `.env`. |
| RBAC not propagated when Flink statements run | 30s `time_sleep` before statements; re-apply if needed. |
| Windowed query returns nothing | Producer emits a late `WATERMARK-TRIGGER` event to close the window. |
| Terraform not on PATH after winget (Windows) | Open a new shell; note in the prereq checklist. |

## Open items to confirm against your live tools

- **Exact Bob "load skill" click path** in your Bob UI. The skill is file-based
  (`.bob/skills/confluent-iac-terraform/`); opening the workspace that contains it
  is normally enough, but verify in your build.
- The **watsonx Orchestrate bonus** ([ORCHESTRATE-BONUS.md](ORCHESTRATE-BONUS.md))
  is optional and additive. Keep it strictly after the core result so the
  guaranteed 90-minute outcome never depends on Orchestrate being ready. Its exact
  UI (tool import, agent builder) needs confirming in your Orchestrate instance.
- A **live `terraform apply`** has not been run from here (needs a working Cloud
  API key). Your dry run is what confirms the end-to-end path in your account.

## Deliverables in this folder

```
WORKSHOP-HANDOUT.md          ⭐ combined participant handout (give this to the group)
PREREQUISITES-CHECKLIST.md   send ahead (also folded into the handout)
PARTICIPANT-RUNBOOK.md       the 90-minute flow + commands (source for the handout)
BOB-PROMPT.md                how to drive Bob + the standard prompt
ORCHESTRATE-BONUS.md         optional watsonx Orchestrate agent segment
FACILITATOR-GUIDE.md         this file
fraud-streaming-reference/   the validated gold-copy project
  ├─ terraform/              providers, variables, main, outputs (+ auto .env)
  ├─ python/                 producer + requirements + sample data
  ├─ orchestrate/            FastAPI alerts API for the Orchestrate bonus
  ├─ SETUP.md · TESTING-APPROACH.md · README.md
bob-workspace/               cloned skill for reference
```
