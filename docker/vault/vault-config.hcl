# ============================================================
# HashiCorp Vault 服务器配置
# 
# 模式：开发/测试环境使用 file 存储
# 生产环境应使用 Consul/Raft 后端
# ============================================================

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true  # 开发环境禁用 TLS；生产环境必须启用
}

api_addr = "http://0.0.0.0:8200"

# UI
ui = true

# 遥测 — Prometheus 指标
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# 默认 lease TTL
default_lease_ttl = "1h"
max_lease_ttl     = "24h"
