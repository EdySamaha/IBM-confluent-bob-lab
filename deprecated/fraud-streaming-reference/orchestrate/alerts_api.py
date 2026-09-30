"""
Minimal REST API over the `fraud_alerts` Kafka topic, so a watsonx Orchestrate
agent can call it as a tool. FastAPI auto-publishes an OpenAPI spec at /openapi.json
— that spec is what you import into Orchestrate to create the tool/skill.

This is an OPTIONAL bonus. It reuses python/.env (same keys the producer uses).

Run:
    pip install -r requirements.txt
    uvicorn alerts_api:app --host 0.0.0.0 --port 8000
    # then expose it publicly (e.g. `ngrok http 8000`) so cloud Orchestrate can reach it.

Endpoints:
    GET /fraud-alerts            -> latest flagged accounts (deduped by account+window)
    GET /fraud-alerts/{account}  -> alerts for one account
"""

import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel
from confluent_kafka import Consumer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.json_schema import JSONDeserializer
from confluent_kafka.serialization import SerializationContext, MessageField

load_dotenv()

ALERTS_TOPIC = "fraud_alerts"
POLL_SECONDS = 3.0

app = FastAPI(
    title="Fraud Alerts API",
    description="Read-only view of accounts flagged by the Flink fraud pipeline.",
    version="1.0.0",
)


class FraudAlert(BaseModel):
    account_id: str
    window_start: Optional[int] = None
    window_end: Optional[int] = None
    window_spend: Optional[float] = None
    txn_count: Optional[int] = None


def _read_alerts() -> List[dict]:
    """Poll the fraud_alerts topic from the beginning and dedupe by (account, window)."""
    sr = SchemaRegistryClient({
        "url": os.getenv("SCHEMA_REGISTRY_URL"),
        "basic.auth.user.info":
            f"{os.getenv('SCHEMA_REGISTRY_API_KEY')}:{os.getenv('SCHEMA_REGISTRY_API_SECRET')}",
    })
    value_deser = JSONDeserializer(
        sr.get_latest_version(f"{ALERTS_TOPIC}-value").schema.schema_str,
        schema_registry_client=sr,
    )
    key_deser = JSONDeserializer(
        sr.get_latest_version(f"{ALERTS_TOPIC}-key").schema.schema_str,
        schema_registry_client=sr,
    )

    consumer = Consumer({
        "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP_SERVERS"),
        "security.protocol": "SASL_SSL",
        "sasl.mechanisms": "PLAIN",
        "sasl.username": os.getenv("KAFKA_API_KEY"),
        "sasl.password": os.getenv("KAFKA_API_SECRET"),
        "group.id": "fraud-alerts-api",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
    })
    consumer.subscribe([ALERTS_TOPIC])

    latest: dict = {}
    try:
        deadline = POLL_SECONDS
        while deadline > 0:
            msg = consumer.poll(0.5)
            deadline -= 0.5
            if msg is None or msg.error():
                continue
            key = key_deser(msg.key(), SerializationContext(ALERTS_TOPIC, MessageField.KEY)) or {}
            val = value_deser(msg.value(), SerializationContext(ALERTS_TOPIC, MessageField.VALUE)) or {}
            row = {**key, **val}
            latest[(row.get("account_id"), row.get("window_start"))] = row
            deadline = POLL_SECONDS  # keep reading while messages arrive
    finally:
        consumer.close()

    return list(latest.values())


@app.get("/fraud-alerts", response_model=List[FraudAlert], operation_id="listFraudAlerts")
def list_fraud_alerts() -> List[dict]:
    """Return every account currently flagged for high spend in a window."""
    return _read_alerts()


@app.get("/fraud-alerts/{account_id}", response_model=List[FraudAlert], operation_id="getFraudAlertsForAccount")
def alerts_for_account(account_id: str) -> List[dict]:
    """Return the flagged windows for a single account."""
    return [a for a in _read_alerts() if a.get("account_id") == account_id]
