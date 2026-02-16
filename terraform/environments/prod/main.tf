# ============================================================
# 西联平台 — Production 环境 Terraform 入口
# ============================================================

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "s3" {
    bucket         = "xilian-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "ap-east-1"
    dynamodb_table = "xilian-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "xilian-platform"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "ap-east-1"
}

variable "project_name" {
  type    = string
  default = "xilian"
}

variable "environment" {
  type    = string
  default = "production"
}

# ── VPC ──
module "vpc" {
  source       = "../../modules/vpc"
  project_name = var.project_name
  environment  = var.environment
  vpc_cidr     = "10.0.0.0/16"
}

# ── EKS ──
module "eks" {
  source              = "../../modules/eks"
  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnet_ids
  kubernetes_version  = "1.29"
}

# ── RDS (Aurora MySQL) ──
module "rds" {
  source               = "../../modules/rds"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  database_subnet_ids  = module.vpc.database_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

# ── ElastiCache (Redis) ──
module "elasticache" {
  source               = "../../modules/elasticache"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

# ── MSK (Kafka) ──
module "msk" {
  source               = "../../modules/msk"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24", "10.0.12.0/24"]
}

# ── S3 ──
module "s3" {
  source       = "../../modules/s3"
  project_name = var.project_name
  environment  = var.environment
}

# ── Kubernetes Provider ──
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# ── Helm Provider ──
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_ca_certificate)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# ── 输出 ──
output "eks_cluster_name" { value = module.eks.cluster_name }
output "rds_endpoint" { value = module.rds.cluster_endpoint }
output "redis_endpoint" { value = module.elasticache.primary_endpoint }
output "kafka_brokers" { value = module.msk.bootstrap_brokers }
output "s3_models_bucket" { value = module.s3.models_bucket }
