# ============================================================
# EKS 模块 — 西联平台 Kubernetes 集群
# ============================================================

variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "kubernetes_version" {
  type    = string
  default = "1.29"
}

# EKS 集群
resource "aws_eks_cluster" "main" {
  name     = "${var.project_name}-${var.environment}"
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.cluster.id]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = {
    Name        = "${var.project_name}-eks"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# 工作节点组 — 通用
resource "aws_eks_node_group" "general" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-general"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = ["m6i.xlarge"]

  scaling_config {
    desired_size = 3
    min_size     = 2
    max_size     = 10
  }

  update_config {
    max_unavailable = 1
  }

  labels = {
    workload = "general"
  }

  tags = {
    Name = "${var.project_name}-general-nodes"
  }
}

# 工作节点组 — 算法（CPU 密集型）
resource "aws_eks_node_group" "algorithm" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-algorithm"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = ["c6i.2xlarge"]

  scaling_config {
    desired_size = 2
    min_size     = 1
    max_size     = 8
  }

  labels = {
    workload = "algorithm"
  }

  taint {
    key    = "workload"
    value  = "algorithm"
    effect = "NO_SCHEDULE"
  }

  tags = {
    Name = "${var.project_name}-algorithm-nodes"
  }
}

# 工作节点组 — 数据管道（内存密集型）
resource "aws_eks_node_group" "data_pipeline" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.project_name}-data-pipeline"
  node_role_arn   = aws_iam_role.node.arn
  subnet_ids      = var.private_subnet_ids
  instance_types  = ["r6i.xlarge"]

  scaling_config {
    desired_size = 2
    min_size     = 1
    max_size     = 6
  }

  labels = {
    workload = "data-pipeline"
  }

  taint {
    key    = "workload"
    value  = "data-pipeline"
    effect = "NO_SCHEDULE"
  }

  tags = {
    Name = "${var.project_name}-data-pipeline-nodes"
  }
}

# IAM 角色 — 集群
resource "aws_iam_role" "cluster" {
  name = "${var.project_name}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# IAM 角色 — 节点
resource "aws_iam_role" "node" {
  name = "${var.project_name}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "node_worker" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_cni" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node.name
}

resource "aws_iam_role_policy_attachment" "node_ecr" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node.name
}

# 安全组
resource "aws_security_group" "cluster" {
  name_prefix = "${var.project_name}-eks-"
  vpc_id      = var.vpc_id

  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-eks-sg" }
}

# 输出
output "cluster_name" {
  value = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_ca_certificate" {
  value = aws_eks_cluster.main.certificate_authority[0].data
}
