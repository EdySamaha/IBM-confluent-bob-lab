# Bonus segment — watsonx Orchestrate agent on top of the stream

**Optional, ~20–30 min.** Only run this if you already have watsonx Orchestrate
access set up. It layers an AI agent on the streaming result: instead of reading
`fraud_alerts` in the Flink workspace, a participant asks an Orchestrate agent in
plain English — *"which accounts are flagged and what should we do?"* — and the
agent calls a tool, fetches the flagged accounts, and recommends an action.

## Why it's built this way

watsonx Orchestrate agents use **tools defined by an OpenAPI spec** (REST) — they
do **not** consume Kafka directly. So the bridge is a tiny REST API in front of the
`fraud_alerts` topic. We ship one: `fraud-streaming-reference/orchestrate/alerts_api.py`
(FastAPI). FastAPI auto-generates the OpenAPI spec Orchestrate imports.

```
Flink fraud_alerts topic ──▶ alerts_api.py (FastAPI, /fraud-alerts)
                                   │  OpenAPI at /openapi.json
                                   ▼
                        watsonx Orchestrate agent  ──▶  "ACC-001 flagged: $1,635 in 5 min → freeze card, notify customer"
```

## Steps

### 1. Run the alerts API (after the core lab is deployed and producing)

```bash
cd fraud-streaming-reference/orchestrate
python -m venv .venv && . .venv/Scripts/activate   # macOS/Linux: . .venv/bin/activate
pip install -r requirements.txt
uvicorn alerts_api:app --host 0.0.0.0 --port 8000
```

It reuses `python/.env` (same keys as the producer). Check it:

```bash
curl http://localhost:8000/fraud-alerts        # should return ACC-001
# OpenAPI spec (what Orchestrate imports):
curl http://localhost:8000/openapi.json
```

### 2. Make it reachable by Orchestrate

watsonx Orchestrate runs in IBM Cloud and cannot reach `localhost`. Expose it:

```bash
ngrok http 8000        # gives a public https URL, e.g. https://xxxx.ngrok-free.app
```

Use that public URL as the server URL in the OpenAPI spec you import. (For a real
deployment you'd host the API as a Code Engine app / container instead.)

### 3. Build the agent in watsonx Orchestrate

1. Create/import a **tool** from the OpenAPI spec (`/openapi.json` at your public
   URL). It exposes `listFraudAlerts` and `getFraudAlertsForAccount`.
2. Create an **agent** and give it that tool, with instructions like:
   > "You monitor payment fraud. When asked about flagged or suspicious accounts,
   > call the fraud-alerts tool, summarize each flagged account (account id, total
   > window spend, transaction count), and recommend an action such as freezing the
   > card and notifying the customer."
3. In the agent chat, ask: **"Which accounts are flagged for fraud right now?"**
   The agent calls the tool and answers in natural language, citing `ACC-001`.

> The exact Orchestrate UI (tool import, agent builder, publish) depends on your
> Orchestrate version — confirm the click path in your instance. The contract the
> agent needs (an OpenAPI tool returning flagged accounts) is what matters and is
> provided here.

## How to frame it in the workshop

This closes the loop from **infrastructure written by AI** (Bob) to **decisions
made by AI** (Orchestrate) over the same live stream: Kafka + Flink detect, the
agent explains and recommends. Keep it as a demo/bonus so the core 90 minutes
(the guaranteed "get a result" outcome) never depends on Orchestrate being ready.

## What you need to confirm / provide

- watsonx Orchestrate access with permission to create tools + agents.
- A way to expose the API publicly (`ngrok`, or deploy to IBM Code Engine).
- The core lab already deployed and producing (so `fraud_alerts` has rows).
