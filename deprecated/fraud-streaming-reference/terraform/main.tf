# ---------------------------------------------------------------------------
# Real-time payment fraud monitoring on Confluent Cloud
#
# org (data) -> environment -> Basic Kafka cluster -> service account
#            -> Schema Registry (data) -> Flink compute pool + region (data)
#            -> 3 API keys (Kafka / Schema Registry / Flink)
#            -> 3 role bindings -> 30s settle -> Flink SQL tables + pipelines
# ---------------------------------------------------------------------------

data "confluent_organization" "main" {}

# --- Environment ------------------------------------------------------------
resource "confluent_environment" "main" {
  display_name = var.environment_name

  stream_governance {
    package = "ESSENTIALS"
  }
}

# --- Basic Kafka cluster (no hourly base fee) -------------------------------
resource "confluent_kafka_cluster" "main" {
  display_name = var.cluster_name
  availability = "SINGLE_ZONE"
  cloud        = var.cloud_provider
  region       = var.region

  basic {}

  environment {
    id = confluent_environment.main.id
  }
}

# --- Service account that owns keys and runs the pipelines ------------------
resource "confluent_service_account" "app" {
  display_name = "${var.cluster_name}-app-manager"
  description  = "Service account for the fraud-monitoring streaming stack"
}

# --- Schema Registry (auto-provisioned by Stream Governance Essentials) -----
data "confluent_schema_registry_cluster" "main" {
  environment {
    id = confluent_environment.main.id
  }

  depends_on = [confluent_kafka_cluster.main]
}

# --- Flink compute pool + region -------------------------------------------
resource "confluent_flink_compute_pool" "main" {
  display_name = "${var.cluster_name}-flink-pool"
  cloud        = var.cloud_provider
  region       = var.region
  max_cfu      = var.flink_max_cfu

  environment {
    id = confluent_environment.main.id
  }
}

data "confluent_flink_region" "main" {
  cloud  = var.cloud_provider
  region = var.region
}

# --- Role bindings (broad rights for a single-user workshop) ----------------
resource "confluent_role_binding" "env_admin" {
  principal   = "User:${confluent_service_account.app.id}"
  role_name   = "EnvironmentAdmin"
  crn_pattern = confluent_environment.main.resource_name
}

resource "confluent_role_binding" "cluster_admin" {
  principal   = "User:${confluent_service_account.app.id}"
  role_name   = "CloudClusterAdmin"
  crn_pattern = confluent_kafka_cluster.main.rbac_crn
}

resource "confluent_role_binding" "flink_developer" {
  principal   = "User:${confluent_service_account.app.id}"
  role_name   = "FlinkDeveloper"
  crn_pattern = confluent_environment.main.resource_name
}

# --- API keys ---------------------------------------------------------------
resource "confluent_api_key" "kafka" {
  display_name = "${var.cluster_name}-kafka-key"
  description  = "Kafka API key for the producer"

  owner {
    id          = confluent_service_account.app.id
    api_version = confluent_service_account.app.api_version
    kind        = confluent_service_account.app.kind
  }

  managed_resource {
    id          = confluent_kafka_cluster.main.id
    api_version = confluent_kafka_cluster.main.api_version
    kind        = confluent_kafka_cluster.main.kind

    environment {
      id = confluent_environment.main.id
    }
  }

  depends_on = [confluent_role_binding.cluster_admin]
}

resource "confluent_api_key" "schema_registry" {
  display_name = "${var.cluster_name}-sr-key"
  description  = "Schema Registry API key for the producer"

  owner {
    id          = confluent_service_account.app.id
    api_version = confluent_service_account.app.api_version
    kind        = confluent_service_account.app.kind
  }

  managed_resource {
    id          = data.confluent_schema_registry_cluster.main.id
    api_version = data.confluent_schema_registry_cluster.main.api_version
    kind        = data.confluent_schema_registry_cluster.main.kind

    environment {
      id = confluent_environment.main.id
    }
  }

  depends_on = [confluent_role_binding.env_admin]
}

resource "confluent_api_key" "flink" {
  display_name = "${var.cluster_name}-flink-key"
  description  = "Flink API key for running SQL statements"

  owner {
    id          = confluent_service_account.app.id
    api_version = confluent_service_account.app.api_version
    kind        = confluent_service_account.app.kind
  }

  managed_resource {
    id          = data.confluent_flink_region.main.id
    api_version = data.confluent_flink_region.main.api_version
    kind        = data.confluent_flink_region.main.kind

    environment {
      id = confluent_environment.main.id
    }
  }

  depends_on = [confluent_role_binding.flink_developer]
}

# --- Let RBAC propagate before running Flink statements ---------------------
resource "time_sleep" "wait_for_rbac" {
  create_duration = "30s"

  depends_on = [
    confluent_role_binding.env_admin,
    confluent_role_binding.cluster_admin,
    confluent_role_binding.flink_developer,
  ]
}

# --- Flink SQL: source table ------------------------------------------------
resource "confluent_flink_statement" "create_transactions" {
  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = confluent_environment.main.id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.app.id
  }

  statement = <<-EOT
    CREATE TABLE transactions (
      account_id STRING,
      merchant STRING,
      amount DOUBLE,
      transaction_type STRING,
      transaction_time TIMESTAMP(3),
      WATERMARK FOR transaction_time AS transaction_time - INTERVAL '5' SECONDS
    ) DISTRIBUTED BY (account_id) INTO 4 BUCKETS
    WITH (
      'key.format' = 'json-registry',
      'value.format' = 'json-registry',
      'kafka.consumer.isolation-level' = 'read-uncommitted'
    );
  EOT

  properties = {
    "sql.current-catalog"  = confluent_environment.main.display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
  }

  rest_endpoint = data.confluent_flink_region.main.rest_endpoint

  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [time_sleep.wait_for_rbac]
}

# --- Flink SQL: running-total destination table -----------------------------
resource "confluent_flink_statement" "create_account_activity" {
  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = confluent_environment.main.id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.app.id
  }

  statement = <<-EOT
    CREATE TABLE account_activity (
      account_id STRING,
      total_spend DOUBLE,
      txn_count BIGINT,
      PRIMARY KEY (account_id) NOT ENFORCED
    ) WITH (
      'key.format' = 'json-registry',
      'value.format' = 'json-registry',
      'kafka.consumer.isolation-level' = 'read-uncommitted'
    );
  EOT

  properties = {
    "sql.current-catalog"  = confluent_environment.main.display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
  }

  rest_endpoint = data.confluent_flink_region.main.rest_endpoint

  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [time_sleep.wait_for_rbac]
}

# --- Flink SQL: windowed fraud-alert destination table ----------------------
resource "confluent_flink_statement" "create_fraud_alerts" {
  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = confluent_environment.main.id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.app.id
  }

  statement = <<-EOT
    CREATE TABLE fraud_alerts (
      account_id STRING,
      window_start TIMESTAMP(3),
      window_end TIMESTAMP(3),
      window_spend DOUBLE,
      txn_count BIGINT,
      PRIMARY KEY (account_id, window_start) NOT ENFORCED
    ) WITH (
      'key.format' = 'json-registry',
      'value.format' = 'json-registry',
      'kafka.consumer.isolation-level' = 'read-uncommitted'
    );
  EOT

  properties = {
    "sql.current-catalog"  = confluent_environment.main.display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
  }

  rest_endpoint = data.confluent_flink_region.main.rest_endpoint

  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [time_sleep.wait_for_rbac]
}

# --- Flink SQL: running-total aggregation pipeline --------------------------
resource "confluent_flink_statement" "insert_account_activity" {
  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = confluent_environment.main.id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.app.id
  }

  statement = <<-EOT
    INSERT INTO account_activity
    SELECT
      account_id,
      SUM(amount) AS total_spend,
      COUNT(*) AS txn_count
    FROM transactions
    GROUP BY account_id;
  EOT

  properties = {
    "sql.current-catalog"  = confluent_environment.main.display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
  }

  rest_endpoint = data.confluent_flink_region.main.rest_endpoint

  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [
    confluent_flink_statement.create_transactions,
    confluent_flink_statement.create_account_activity,
  ]
}

# --- Flink SQL: windowed fraud-alert pipeline -------------------------------
resource "confluent_flink_statement" "insert_fraud_alerts" {
  organization {
    id = data.confluent_organization.main.id
  }
  environment {
    id = confluent_environment.main.id
  }
  compute_pool {
    id = confluent_flink_compute_pool.main.id
  }
  principal {
    id = confluent_service_account.app.id
  }

  statement = <<-EOT
    INSERT INTO fraud_alerts
    SELECT
      account_id,
      window_start,
      window_end,
      SUM(amount) AS window_spend,
      COUNT(*) AS txn_count
    FROM TABLE(
      TUMBLE(TABLE transactions, DESCRIPTOR(transaction_time), INTERVAL '${var.fraud_window_minutes}' MINUTES)
    )
    GROUP BY account_id, window_start, window_end
    HAVING SUM(amount) > ${var.fraud_amount_threshold};
  EOT

  properties = {
    "sql.current-catalog"  = confluent_environment.main.display_name
    "sql.current-database" = confluent_kafka_cluster.main.display_name
  }

  rest_endpoint = data.confluent_flink_region.main.rest_endpoint

  credentials {
    key    = confluent_api_key.flink.id
    secret = confluent_api_key.flink.secret
  }

  depends_on = [
    confluent_flink_statement.create_transactions,
    confluent_flink_statement.create_fraud_alerts,
  ]
}
