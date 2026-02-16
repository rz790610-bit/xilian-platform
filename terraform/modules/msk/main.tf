# ============================================================
# MSK 模块 — Kafka 集群（事件驱动 + 数据管道）
# ============================================================

variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }

resource "aws_security_group" "msk" {
  name_prefix = "${var.project_name}-msk-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 9092
    to_port     = 9098
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-msk-sg" }
}

resource "aws_msk_cluster" "main" {
  cluster_name           = "${var.project_name}-${var.environment}"
  kafka_version          = "3.6.0"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = "kafka.m7g.large"
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 200
        provisioned_throughput {
          enabled           = true
          volume_throughput  = 250
        }
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS_PLAINTEXT"
      in_cluster    = true
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
    }
  }

  tags = {
    Name        = "${var.project_name}-msk"
    Environment = var.environment
  }
}

resource "aws_msk_configuration" "main" {
  name              = "${var.project_name}-config"
  kafka_versions    = ["3.6.0"]
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
default.replication.factor=3
min.insync.replicas=2
num.partitions=6
log.retention.hours=168
log.retention.bytes=107374182400
message.max.bytes=10485760
PROPERTIES
}

resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${var.project_name}-${var.environment}"
  retention_in_days = 30
}

output "bootstrap_brokers" {
  value = aws_msk_cluster.main.bootstrap_brokers
}

output "bootstrap_brokers_tls" {
  value = aws_msk_cluster.main.bootstrap_brokers_tls
}

output "zookeeper_connect_string" {
  value = aws_msk_cluster.main.zookeeper_connect_string
}
