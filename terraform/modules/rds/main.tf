# ============================================================
# RDS 模块 — MySQL 8.0（平台主数据库）
# ============================================================

variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "database_subnet_ids" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }

resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.environment}"
  subnet_ids = var.database_subnet_ids
  tags       = { Name = "${var.project_name}-db-subnet" }
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-rds-"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs
  }

  tags = { Name = "${var.project_name}-rds-sg" }
}

resource "aws_rds_cluster" "main" {
  cluster_identifier     = "${var.project_name}-${var.environment}"
  engine                 = "aurora-mysql"
  engine_version         = "8.0.mysql_aurora.3.06.0"
  database_name          = "xilian_platform"
  master_username        = "xilian"
  manage_master_user_password = true
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 14
  preferred_backup_window = "03:00-04:00"
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.project_name}-final-snapshot"

  serverlessv2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 16
  }

  tags = {
    Name        = "${var.project_name}-aurora"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier         = "${var.project_name}-writer"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

resource "aws_rds_cluster_instance" "reader" {
  identifier         = "${var.project_name}-reader"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

output "cluster_endpoint" {
  value = aws_rds_cluster.main.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.main.reader_endpoint
}
