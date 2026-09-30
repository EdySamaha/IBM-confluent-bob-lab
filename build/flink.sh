#!/usr/bin/env bash
# Flink SQL REST helper for Confluent Cloud.
# Usage: source build/.env first, then source build/flink.sh
set -uo pipefail

FLINK_BASE="${FLINK_EP}/sql/v1/organizations/${ORG}/environments/${ENV_ID}"
CATALOG="bob-workshop-test-env"   # = environment display name
DATABASE="trade-forecasting"      # = cluster display name

# flink_submit <name> <sql>
flink_submit () {
  local NAME="$1"; shift
  local SQL="$1"; shift
  # JSON-encode the SQL safely with python
  local BODY
  BODY=$(SQL="$SQL" NAME="$NAME" CP="$POOL_ID" PR="$PRINCIPAL" CAT="$CATALOG" DB="$DATABASE" python -c '
import json, os
print(json.dumps({
  "name": os.environ["NAME"],
  "spec": {
    "statement": os.environ["SQL"],
    "properties": {
      "sql.current-catalog": os.environ["CAT"],
      "sql.current-database": os.environ["DB"]
    },
    "compute_pool_id": os.environ["CP"],
    "principal": os.environ["PR"]
  }
}))')
  curl -s -u "$FLINK_KEY:$FLINK_SECRET" -X POST "$FLINK_BASE/statements" \
    -H "Content-Type: application/json" -d "$BODY"
}

# flink_status <name>
flink_status () {
  curl -s -u "$FLINK_KEY:$FLINK_SECRET" "$FLINK_BASE/statements/$1"
}

# flink_results <name>  [page_token]
flink_results () {
  local NAME="$1"; local TOK="${2:-}"
  local URL="$FLINK_BASE/statements/$NAME/results"
  [ -n "$TOK" ] && URL="$URL?page_token=$TOK"
  curl -s -u "$FLINK_KEY:$FLINK_SECRET" "$URL"
}

# flink_delete <name>
flink_delete () {
  curl -s -u "$FLINK_KEY:$FLINK_SECRET" -X DELETE "$FLINK_BASE/statements/$1" -w "HTTP %{http_code}\n"
}

# flink_wait <name>  -> waits until phase RUNNING/COMPLETED/FAILED
flink_wait () {
  local NAME="$1"; local i
  for i in $(seq 1 30); do
    local P
    P=$(flink_status "$NAME" | grep -oE '"phase":"[^"]*"' | head -1)
    echo "  [$i] $NAME $P"
    case "$P" in
      *RUNNING*|*COMPLETED*|*FAILED*) return 0 ;;
    esac
    sleep 4
  done
}
