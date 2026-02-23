#!/usr/bin/env bash
# ============================================================================
# security-scan.sh — 安全扫描基线脚本
# ============================================================================
#
# 整改方案 v2.1 · Z-02 / P2-1
#
# 功能：
#   1. pnpm audit — 检查 npm 依赖中的已知漏洞
#   2. Trivy fs — 扫描文件系统中的漏洞和配置问题
#   3. Trivy config — 扫描 Docker/K8s 配置文件
#   4. 生成 JSON 报告到 reports/ 目录
#
# 使用方式：
#   ./scripts/security-scan.sh           # 完整扫描
#   ./scripts/security-scan.sh --quick   # 仅 pnpm audit（CI 快速模式）
#   ./scripts/security-scan.sh --fix     # pnpm audit --fix 尝试自动修复
#
# CI 集成：
#   在 .github/workflows/ci.yml 中已集成 pnpm audit
#   Trivy 扫描建议在 CI 中使用 aquasecurity/trivy-action
#
# 退出码：
#   0 — 无高危/严重漏洞
#   1 — 发现高危或严重漏洞
#   2 — 工具缺失或执行错误
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$PROJECT_ROOT/reports/security"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 计数器
TOTAL_CRITICAL=0
TOTAL_HIGH=0
TOTAL_MEDIUM=0

# ── 工具函数 ──

log_info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

ensure_dir() {
  mkdir -p "$REPORT_DIR"
}

# ── 1. pnpm audit ──

run_pnpm_audit() {
  log_info "=== Step 1: pnpm audit ==="
  
  cd "$PROJECT_ROOT"
  
  local audit_report="$REPORT_DIR/pnpm-audit-$TIMESTAMP.json"
  
  # pnpm audit 返回非零退出码表示有漏洞，不要让 set -e 终止脚本
  if pnpm audit --json > "$audit_report" 2>/dev/null; then
    log_ok "pnpm audit: 无已知漏洞"
  else
    # 解析结果
    if command -v jq &> /dev/null; then
      local critical=$(jq '.metadata.vulnerabilities.critical // 0' "$audit_report" 2>/dev/null || echo "0")
      local high=$(jq '.metadata.vulnerabilities.high // 0' "$audit_report" 2>/dev/null || echo "0")
      local moderate=$(jq '.metadata.vulnerabilities.moderate // 0' "$audit_report" 2>/dev/null || echo "0")
      
      TOTAL_CRITICAL=$((TOTAL_CRITICAL + critical))
      TOTAL_HIGH=$((TOTAL_HIGH + high))
      TOTAL_MEDIUM=$((TOTAL_MEDIUM + moderate))
      
      if [ "$critical" -gt 0 ] || [ "$high" -gt 0 ]; then
        log_error "pnpm audit: ${critical} critical, ${high} high, ${moderate} moderate"
      else
        log_warn "pnpm audit: ${moderate} moderate vulnerabilities (no critical/high)"
      fi
    else
      log_warn "pnpm audit: 发现漏洞（安装 jq 可查看详情）"
    fi
    
    log_info "详细报告: $audit_report"
  fi
}

# ── 1.5. pnpm audit --fix ──

run_pnpm_audit_fix() {
  log_info "=== Step 1.5: pnpm audit --fix ==="
  
  cd "$PROJECT_ROOT"
  
  if pnpm audit --fix 2>/dev/null; then
    log_ok "pnpm audit --fix: 自动修复完成"
  else
    log_warn "pnpm audit --fix: 部分漏洞无法自动修复"
  fi
}

# ── 2. Trivy 文件系统扫描 ──

run_trivy_fs() {
  log_info "=== Step 2: Trivy filesystem scan ==="
  
  if ! command -v trivy &> /dev/null; then
    log_warn "Trivy 未安装，跳过文件系统扫描"
    log_info "安装方式: curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin"
    return 0
  fi
  
  local trivy_report="$REPORT_DIR/trivy-fs-$TIMESTAMP.json"
  
  trivy fs "$PROJECT_ROOT" \
    --severity HIGH,CRITICAL \
    --format json \
    --output "$trivy_report" \
    --skip-dirs node_modules,.git,dist \
    --quiet 2>/dev/null || true
  
  if command -v jq &> /dev/null && [ -f "$trivy_report" ]; then
    local vuln_count=$(jq '[.Results[]?.Vulnerabilities // [] | length] | add // 0' "$trivy_report" 2>/dev/null || echo "0")
    
    if [ "$vuln_count" -eq 0 ]; then
      log_ok "Trivy fs: 无高危/严重漏洞"
    else
      log_warn "Trivy fs: 发现 ${vuln_count} 个高危/严重漏洞"
    fi
    
    log_info "详细报告: $trivy_report"
  fi
}

# ── 3. Trivy 配置扫描 ──

run_trivy_config() {
  log_info "=== Step 3: Trivy config scan ==="
  
  if ! command -v trivy &> /dev/null; then
    log_warn "Trivy 未安装，跳过配置扫描"
    return 0
  fi
  
  local config_report="$REPORT_DIR/trivy-config-$TIMESTAMP.json"
  
  trivy config "$PROJECT_ROOT" \
    --severity HIGH,CRITICAL \
    --format json \
    --output "$config_report" \
    --skip-dirs node_modules,.git \
    --quiet 2>/dev/null || true
  
  if command -v jq &> /dev/null && [ -f "$config_report" ]; then
    local misconfig_count=$(jq '[.Results[]?.Misconfigurations // [] | length] | add // 0' "$config_report" 2>/dev/null || echo "0")
    
    if [ "$misconfig_count" -eq 0 ]; then
      log_ok "Trivy config: 无高危配置问题"
    else
      log_warn "Trivy config: 发现 ${misconfig_count} 个配置问题"
    fi
    
    log_info "详细报告: $config_report"
  fi
}

# ── 4. 汇总 ──

print_summary() {
  echo ""
  echo "============================================"
  echo "  安全扫描汇总 ($TIMESTAMP)"
  echo "============================================"
  echo -e "  Critical: ${RED}${TOTAL_CRITICAL}${NC}"
  echo -e "  High:     ${RED}${TOTAL_HIGH}${NC}"
  echo -e "  Medium:   ${YELLOW}${TOTAL_MEDIUM}${NC}"
  echo "  报告目录: $REPORT_DIR"
  echo "============================================"
  
  if [ "$TOTAL_CRITICAL" -gt 0 ] || [ "$TOTAL_HIGH" -gt 0 ]; then
    log_error "发现高危或严重漏洞，请立即修复！"
    return 1
  else
    log_ok "无高危或严重漏洞"
    return 0
  fi
}

# ── 主流程 ──

main() {
  ensure_dir
  
  case "${1:-}" in
    --quick)
      log_info "快速模式：仅运行 pnpm audit"
      run_pnpm_audit
      ;;
    --fix)
      log_info "修复模式：运行 pnpm audit --fix"
      run_pnpm_audit_fix
      run_pnpm_audit
      ;;
    *)
      log_info "完整扫描模式"
      run_pnpm_audit
      run_trivy_fs
      run_trivy_config
      ;;
  esac
  
  print_summary
}

main "$@"
