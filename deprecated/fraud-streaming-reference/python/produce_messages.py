"""
Produce sample card transactions into the Confluent Cloud `transactions` topic.

The Flink `transactions` table (created by Terraform) registers JSON Schemas in
Schema Registry under the subjects `transactions-key` and `transactions-value`.
This script RETRIEVES those schemas and serializes to match them exactly, so the
payload always lines up with what Flink expects.

Data is generated at runtime and aligned to the next 5-minute window boundary so
that the windowed fraud-alert pipeline produces a result in this run:
  - ACC-001 spends far above the threshold within one window  -> flagged
  - ACC-002/003/004 stay below the threshold                  -> not flagged
  - a late WATERMARK-TRIGGER event advances the watermark past the window end,
    which is what makes Flink emit the closed-window rows.
"""

import os
import json
import random
from datetime import datetime, timedelta

from dotenv import load_dotenv
from confluent_kafka import Producer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.json_schema import JSONSerializer
from confluent_kafka.serialization import SerializationContext, MessageField

load_dotenv()

TOPIC = os.getenv("TOPIC", "transactions")
WINDOW_MINUTES = 5
FRAUD_THRESHOLD = 1000  # keep in sync with terraform var fraud_amount_threshold

MERCHANTS = [
    "Amazon", "Walmart", "Shell", "Apple Store", "Steam",
    "Uber", "Best Buy", "Netflix", "Delta Air", "Target",
]
TXN_TYPES = ["PURCHASE", "WITHDRAWAL", "TRANSFER", "PAYMENT"]


def next_window_base_ms() -> int:
    """Milliseconds since epoch for :10s into the next 5-minute window boundary."""
    now = datetime.now()
    minute = ((now.minute // WINDOW_MINUTES) + 1) * WINDOW_MINUTES
    base = now.replace(minute=minute if minute < 60 else 0, second=10, microsecond=0)
    if minute >= 60:
        base += timedelta(hours=1)
    return int(base.timestamp() * 1000)


def build_transactions() -> list:
    """Build a batch aligned to a single tumbling window plus a watermark trigger."""
    base_ms = next_window_base_ms()
    # Leave a 20s buffer inside the window; spread events across the remainder.
    window_span_ms = (WINDOW_MINUTES * 60 - 20) * 1000

    txns = []

    # ACC-001: high spend -> should be flagged (8 x ~200 = ~1600 > 1000).
    n_fraud = 8
    spacing = window_span_ms // (n_fraud - 1)
    for i in range(n_fraud):
        txns.append({
            "account_id": "ACC-001",
            "merchant": random.choice(MERCHANTS),
            "amount": round(random.uniform(180, 230), 2),
            "transaction_type": random.choice(TXN_TYPES),
            "transaction_time": base_ms + i * spacing,
        })

    # ACC-002/003/004: normal spend, comfortably below the threshold.
    for acct in ("ACC-002", "ACC-003", "ACC-004"):
        for i in range(random.randint(2, 4)):
            txns.append({
                "account_id": acct,
                "merchant": random.choice(MERCHANTS),
                "amount": round(random.uniform(15, 120), 2),
                "transaction_type": random.choice(TXN_TYPES),
                "transaction_time": base_ms + random.randint(0, window_span_ms),
            })

    # WATERMARK-TRIGGER: a late event 6 minutes past the base so the watermark
    # advances beyond the window end and Flink emits the closed window.
    txns.append({
        "account_id": "ACC-999",
        "merchant": "Watermark-Trigger",
        "amount": 1.00,
        "transaction_type": "PAYMENT",
        "transaction_time": base_ms + 6 * 60 * 1000,
    })

    return txns


def delivery_callback(err, msg):
    """msg.key()/msg.value() are Schema-Registry-encoded bytes; do not UTF-8 decode."""
    if err:
        print(f"❌ Failed: {err}")
    else:
        print(f"✅ Delivered → Partition {msg.partition()} @ Offset {msg.offset()}")


def main() -> None:
    sr_client = SchemaRegistryClient({
        "url": os.getenv("SCHEMA_REGISTRY_URL"),
        "basic.auth.user.info":
            f"{os.getenv('SCHEMA_REGISTRY_API_KEY')}:{os.getenv('SCHEMA_REGISTRY_API_SECRET')}",
    })

    # Retrieve the schemas Flink registered when it created the table.
    key_schema = sr_client.get_latest_version(f"{TOPIC}-key").schema
    value_schema = sr_client.get_latest_version(f"{TOPIC}-value").schema

    key_serializer = JSONSerializer(key_schema.schema_str, sr_client)
    value_serializer = JSONSerializer(value_schema.schema_str, sr_client)

    producer = Producer({
        "bootstrap.servers": os.getenv("KAFKA_BOOTSTRAP_SERVERS"),
        "security.protocol": "SASL_SSL",
        "sasl.mechanisms": "PLAIN",
        "sasl.username": os.getenv("KAFKA_API_KEY"),
        "sasl.password": os.getenv("KAFKA_API_SECRET"),
    })

    transactions = build_transactions()

    success, failure = 0, 0
    for txn in transactions:
        try:
            key = {"account_id": txn["account_id"]}          # object key, per json-registry
            value = {k: v for k, v in txn.items() if k != "account_id"}  # key col excluded from value

            producer.produce(
                topic=TOPIC,
                key=key_serializer(key, SerializationContext(TOPIC, MessageField.KEY)),
                value=value_serializer(value, SerializationContext(TOPIC, MessageField.VALUE)),
                callback=delivery_callback,
            )
            success += 1
        except Exception as e:  # noqa: BLE001 - report and continue
            print(f"❌ Error producing message: {e}")
            failure += 1

    producer.flush()
    print(f"\n📊 Summary: {success} produced, {failure} failed")
    print(f"   Window base (local): "
          f"{datetime.fromtimestamp(next_window_base_ms() / 1000):%H:%M:%S} "
          f"— expect ACC-001 in fraud_alerts once the window closes.")


if __name__ == "__main__":
    main()
