# ============================================================
# ElastiCache 模块 — Redis 7.x（缓存 + 分布式锁 + Pub/Sub）
# ============================================================

variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-redis-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs
  }

  tags = { Name = "${var.project_name}-redis-sg" }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}"
  description          = "西联平台 Redis — 缓存/分布式锁/Pub-Sub"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.r7g.large"
  num_cache_clusters   = 2
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = 7
  snapshot_window          = "04:00-05:00"
  maintenance_window       = "sun:05:00-sun:06:00"

  parameter_group_name = aws_elasticache_parameter_group.main.name

  tags = {
    Name        = "${var.project_name}-redis"
    Environment = var.environment
  }
}

resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-redis7"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"
  }
}

output "primary_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "reader_endpoint" {
  value = aws_elasticache_replication_group.main.reader_endpoint_address
}
