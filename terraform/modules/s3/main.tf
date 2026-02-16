# ============================================================
# S3 模块 — 对象存储（模型/数据集/备份/日志归档）
# ============================================================

variable "project_name" { type = string }
variable "environment" { type = string }

# 模型存储桶
resource "aws_s3_bucket" "models" {
  bucket = "${var.project_name}-${var.environment}-models"
  tags   = { Name = "${var.project_name}-models", Purpose = "ML模型存储" }
}

resource "aws_s3_bucket_versioning" "models" {
  bucket = aws_s3_bucket.models.id
  versioning_configuration { status = "Enabled" }
}

# 数据集存储桶
resource "aws_s3_bucket" "datasets" {
  bucket = "${var.project_name}-${var.environment}-datasets"
  tags   = { Name = "${var.project_name}-datasets", Purpose = "训练数据集" }
}

resource "aws_s3_bucket_lifecycle_configuration" "datasets" {
  bucket = aws_s3_bucket.datasets.id

  rule {
    id     = "archive-old-datasets"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = 365
    }
  }
}

# 备份存储桶
resource "aws_s3_bucket" "backups" {
  bucket = "${var.project_name}-${var.environment}-backups"
  tags   = { Name = "${var.project_name}-backups", Purpose = "数据库备份" }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    expiration {
      days = 365
    }
  }
}

# 日志归档桶
resource "aws_s3_bucket" "logs" {
  bucket = "${var.project_name}-${var.environment}-logs"
  tags   = { Name = "${var.project_name}-logs", Purpose = "日志归档" }
}

# 统一加密策略
resource "aws_s3_bucket_server_side_encryption_configuration" "models" {
  bucket = aws_s3_bucket.models.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "datasets" {
  bucket = aws_s3_bucket.datasets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

# 统一阻止公共访问
resource "aws_s3_bucket_public_access_block" "models" {
  bucket                  = aws_s3_bucket.models.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "datasets" {
  bucket                  = aws_s3_bucket.datasets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "models_bucket" { value = aws_s3_bucket.models.bucket }
output "datasets_bucket" { value = aws_s3_bucket.datasets.bucket }
output "backups_bucket" { value = aws_s3_bucket.backups.bucket }
output "logs_bucket" { value = aws_s3_bucket.logs.bucket }
