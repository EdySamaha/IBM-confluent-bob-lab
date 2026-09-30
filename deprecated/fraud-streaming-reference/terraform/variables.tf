variable "confluent_cloud_api_key" {
  description = "Confluent Cloud API key (Cloud resource management scope, 'My account')."
  type        = string
  sensitive   = true
}

variable "confluent_cloud_api_secret" {
  description = "Confluent Cloud API secret paired with confluent_cloud_api_key."
  type        = string
  sensitive   = true
}

variable "environment_name" {
  description = "Display name for the Confluent Cloud environment created by this stack."
  type        = string
  default     = "fraud-streaming-env"
}

variable "cluster_name" {
  description = "Display name for the Basic Kafka cluster."
  type        = string
  default     = "fraud-cluster"
}

variable "cloud_provider" {
  description = "Cloud provider for the cluster and Flink region (AWS, GCP, or AZURE)."
  type        = string
  default     = "AWS"
}

variable "region" {
  description = "Cloud region for the cluster and Flink compute pool."
  type        = string
  default     = "us-east-1"
}

variable "flink_max_cfu" {
  description = "Maximum CFUs for the Flink compute pool. Pool bills only while statements run."
  type        = number
  default     = 5
}

variable "fraud_window_minutes" {
  description = "Tumbling window size (minutes) used to flag high-spend accounts."
  type        = number
  default     = 5
}

variable "fraud_amount_threshold" {
  description = "Total spend within one window above which an account is flagged."
  type        = number
  default     = 1000
}
