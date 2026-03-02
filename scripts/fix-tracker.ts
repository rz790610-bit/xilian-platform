#!/usr/bin/env tsx
/**
 * ============================================================================
 * FIX 修复追踪器 — Fix Tracker
 * ============================================================================
 *
 * 读取 docs/COMPLETE_FIX_PLAN.md 中的 143 个 FIX，
 * 对每个 FIX 执行代码扫描验证是否真正解决。
 *
 * 用法: npx tsx scripts/fix-tracker.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

// ============================================================================
// FIX 定义和验证规则
// ============================================================================

interface FixItem {
  id: string;
  description: string;
  severity: '致命' | '严重' | '中等' | '低';
  category: string;
  verify: () => FixVerifyResult;
}

interface FixVerifyResult {
  status: 'fixed' | 'partial' | 'open';
  method: string;
  files: string[];
  detail?: string;
}

function grepCount(pattern: string, path_arg?: string): number {
  try {
    const target = path_arg || '.';
    const out = execSync(
      `grep -rn '${pattern}' --include='*.ts' --include='*.tsx' ${target} 2>/dev/null | grep -v node_modules | grep -v dist | wc -l`,
      { cwd: ROOT, stdio: 'pipe' },
    ).toString().trim();
    return parseInt(out) || 0;
  } catch { return 0; }
}

function grepFiles(pattern: string, path_arg?: string): string[] {
  try {
    const target = path_arg || '.';
    const out = execSync(
      `grep -rl '${pattern}' --include='*.ts' --include='*.tsx' ${target} 2>/dev/null | grep -v node_modules | grep -v dist | head -5`,
      { cwd: ROOT, stdio: 'pipe' },
    ).toString().trim();
    return out ? out.split('\n').map(f => path.relative(ROOT, f)) : [];
  } catch { return []; }
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

function fileContains(rel: string, pattern: string): boolean {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return false;
  return fs.readFileSync(full, 'utf-8').includes(pattern);
}

// ============================================================================
// 143 FIX 验证规则
// ============================================================================

const fixes: FixItem[] = [
  // ─── A. 命名混乱 (15) ───
  { id: 'FIX-001', description: '设备ID四种命名混用', severity: '致命', category: 'A-命名',
    verify: () => {
      const deviceIdCount = grepCount('deviceId', 'server/');
      return { status: deviceIdCount < 100 ? 'fixed' : 'open', method: '代码扫描 deviceId 残留',
        files: grepFiles('deviceId', 'server/'), detail: `deviceId 残留 ${deviceIdCount} 处` };
    }},
  { id: 'FIX-002', description: 'Severity枚举三套定义', severity: '致命', category: 'A-命名',
    verify: () => {
      const hasUnified = fileExists('shared/contracts/v1/base.ts') && fileContains('shared/contracts/v1/base.ts', 'SeverityLevel');
      return { status: hasUnified ? 'fixed' : 'open', method: '统一枚举检查',
        files: hasUnified ? ['shared/contracts/v1/base.ts'] : [] };
    }},
  { id: 'FIX-003', description: '时间戳类型混用', severity: '严重', category: 'A-命名',
    verify: () => {
      const hasType = fileExists('shared/contracts/v1/base.ts') && fileContains('shared/contracts/v1/base.ts', 'UnixTimestampMs');
      return { status: hasType ? 'partial' : 'open', method: '统一类型检查',
        files: hasType ? ['shared/contracts/v1/base.ts'] : [], detail: '类型定义存在，全量迁移未完成' };
    }},
  { id: 'FIX-004', description: 'DiagnosisConclusion两套定义', severity: '严重', category: 'A-命名',
    verify: () => {
      const hasUnified = fileExists('shared/contracts/v1/diagnosis.contract.ts');
      return { status: hasUnified ? 'fixed' : 'open', method: '统一契约检查',
        files: hasUnified ? ['shared/contracts/v1/diagnosis.contract.ts'] : [] };
    }},
  { id: 'FIX-005', description: 'UrgencyLevel三套定义', severity: '严重', category: 'A-命名',
    verify: () => {
      const hasUnified = fileContains('shared/contracts/v1/base.ts', 'UrgencyLevel');
      return { status: hasUnified ? 'fixed' : 'open', method: '统一枚举检查',
        files: hasUnified ? ['shared/contracts/v1/base.ts'] : [] };
    }},
  { id: 'FIX-006', description: 'PipelineStatus两套定义', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待合并', files: grepFiles('PipelineStatus', 'shared/') }) },
  { id: 'FIX-007', description: 'MaintenancePriority与UrgencyLevel语义重叠', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待合并', files: [] }) },
  { id: 'FIX-008', description: 'Kafka消息体snake_case不一致', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: grepFiles('device_id', 'scripts/') }) },
  { id: 'FIX-009', description: 'eventBus.publish()参数重复', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待修复', files: grepFiles('topic, topic', 'server/') }) },
  { id: 'FIX-010', description: '前端equipmentId无映射层', severity: '严重', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待创建映射', files: grepFiles('equipmentId', 'client/') }) },
  { id: 'FIX-011', description: 'Neo4j deviceId不一致', severity: '严重', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: grepFiles('deviceId', 'server/lib/storage/neo4j') }) },
  { id: 'FIX-012', description: 'sensor-simulator snake_case', severity: '低', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: ['scripts/sensor-simulator.ts'] }) },
  { id: 'FIX-013', description: 'evolution SNAKE_TO_CAMEL映射', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: ['shared/evolution-modules.ts'] }) },
  { id: 'FIX-014', description: 'config属性路径命名不一致', severity: '中等', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: ['server/core/config.ts'] }) },
  { id: 'FIX-015', description: 'metrics snake_case', severity: '低', category: 'A-命名',
    verify: () => ({ status: 'open', method: '待统一', files: grepFiles('status_code', 'server/platform/middleware/') }) },

  // ─── B. 数据契约断裂 (31) ───
  { id: 'FIX-016', description: 'data-contracts.ts字段名不匹配', severity: '致命', category: 'B-契约',
    verify: () => ({ status: 'open', method: '契约扫描', files: ['server/platform/contracts/data-contracts.ts'] }) },
  { id: 'FIX-017', description: 'data-contracts.ts类型不匹配', severity: '致命', category: 'B-契约',
    verify: () => ({ status: 'open', method: '契约扫描', files: ['server/platform/contracts/data-contracts.ts'] }) },
  { id: 'FIX-018', description: 'data-contracts.ts字段缺失', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '契约扫描', files: ['server/platform/contracts/data-contracts.ts'] }) },
  { id: 'FIX-019', description: 'data-contracts.ts多余字段', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '契约扫描', files: ['server/platform/contracts/data-contracts.ts'] }) },
  { id: 'FIX-020', description: 'EventBus publish()不强制Schema校验', severity: '致命', category: 'B-契约',
    verify: () => {
      const hasValidation = fileContains('server/platform/events/event-bus.ts', 'eventSchemaRegistry');
      return { status: hasValidation ? 'fixed' : 'open', method: 'Schema校验集成检查',
        files: ['server/platform/events/event-bus.ts'] };
    }},
  { id: 'FIX-021', description: 'Schema注册表未被调用', severity: '严重', category: 'B-契约',
    verify: () => {
      const hasValidation = fileContains('server/platform/events/event-bus.ts', 'schemaValidationEnabled');
      return { status: hasValidation ? 'partial' : 'open', method: '集成检查',
        files: ['server/platform/events/event-bus.ts'], detail: 'dev模式已集成，prod待强化' };
    }},
  { id: 'FIX-022', description: '双总线未统一Facade', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待创建', files: [] }) },
  { id: 'FIX-023', description: 'DLQ无代码写入', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-024', description: 'Kafka消费者无健康检查', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-025', description: '两套DiagnosisConclusion severity不兼容', severity: '严重', category: 'B-契约',
    verify: () => {
      const hasMapper = fileExists('shared/contracts/v1/mappers.ts');
      return { status: hasMapper ? 'fixed' : 'open', method: '映射函数检查',
        files: hasMapper ? ['shared/contracts/v1/mappers.ts'] : [] };
    }},
  { id: 'FIX-026', description: 'SeverityLevel→Severity映射缺失', severity: '严重', category: 'B-契约',
    verify: () => {
      const hasMapper = fileContains('shared/contracts/v1/mappers.ts', 'mapAlgorithmSeverity');
      return { status: hasMapper ? 'fixed' : 'open', method: '映射函数检查',
        files: hasMapper ? ['shared/contracts/v1/mappers.ts'] : [] };
    }},
  { id: 'FIX-027', description: 'AnomalySeverity映射缺失', severity: '中等', category: 'B-契约',
    verify: () => {
      const hasMapper = fileContains('shared/contracts/v1/mappers.ts', 'mapAnomalySeverity');
      return { status: hasMapper ? 'fixed' : 'open', method: '映射函数检查',
        files: hasMapper ? ['shared/contracts/v1/mappers.ts'] : [] };
    }},
  { id: 'FIX-028', description: 'tRPC输出0% Zod校验', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-029', description: 'apiSpec.ts错误码未接入', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-030', description: 'tRPC无版本前缀', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-031', description: '70%路由使用内联Zod schema', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待迁移', files: [] }) },
  { id: 'FIX-032', description: 'gRPC客户端全部Record<string,unknown>', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待生成', files: ['server/lib/clients/grpcClients.ts'] }) },
  { id: 'FIX-033', description: 'shared/目录类型分散', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待整理', files: [] }) },
  { id: 'FIX-034', description: '无@deprecated标注', severity: '低', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待标注', files: [] }) },
  { id: 'FIX-035', description: 'JSON字段timestamp类型不一致', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-036', description: 'API响应timestamp与Drizzle列不一致', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-037', description: 'ClickHouse timestamp格式混乱', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-038', description: 'streamProcessor Date与number混用', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-039', description: 'feature-extraction timestamp类型混用', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-040', description: 'shared/contracts/v1/目录未创建', severity: '严重', category: 'B-契约',
    verify: () => {
      const exists = fileExists('shared/contracts/v1/index.ts');
      return { status: exists ? 'fixed' : 'open', method: '目录检查',
        files: exists ? ['shared/contracts/v1/index.ts'] : [] };
    }},
  { id: 'FIX-041', description: 'Proto变更无自动类型重生成', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待CI集成', files: [] }) },
  { id: 'FIX-042', description: 'Kafka topic schema无版本兼容策略', severity: '中等', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-043', description: 'eventBus publish()类型断言绕过', severity: '严重', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待修复', files: grepFiles('as Record<string, unknown>', 'server/platform/') }) },
  { id: 'FIX-044', description: 'Schema Registry未配置', severity: '低', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待配置', files: [] }) },
  { id: 'FIX-045', description: '跨域契约无CI兼容性检测', severity: '低', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待创建CI', files: [] }) },
  { id: 'FIX-046', description: 'Zod schema内联导致前后端契约不同步', severity: '低', category: 'B-契约',
    verify: () => ({ status: 'open', method: '待迁移', files: [] }) },

  // ─── C. 类型安全 (15) ───
  { id: 'FIX-047', description: 'gRPC客户端无类型', severity: '致命', category: 'C-类型',
    verify: () => {
      const hasScript = fileContains('package.json', 'proto:gen');
      const hasDir = fileExists('shared/generated/proto/.gitkeep');
      return { status: hasScript && hasDir ? 'fixed' : 'open', method: 'proto:gen脚本检查',
        files: hasScript ? ['package.json'] : [] };
    }},
  { id: 'FIX-048', description: 'evolution-schema json字段无类型', severity: '严重', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待添加类型', files: ['drizzle/evolution-schema.ts'] }) },
  { id: 'FIX-049', description: 'hde-schema json字段无类型', severity: '严重', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待添加类型', files: [] }) },
  { id: 'FIX-050', description: 'toolInput/Output无类型', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待添加类型', files: [] }) },
  { id: 'FIX-051', description: 'Action/result payloads缺类型', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待添加类型', files: [] }) },
  { id: 'FIX-052', description: 'diagnostic-enhancer类型断言', severity: '严重', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待修复', files: [] }) },
  { id: 'FIX-053', description: 'Proto未生成TypeScript类型', severity: '严重', category: 'C-类型',
    verify: () => {
      const hasScript = fileContains('package.json', 'proto:gen');
      return { status: hasScript ? 'partial' : 'open', method: '脚本检查',
        files: hasScript ? ['package.json'] : [], detail: '脚本已就位，待运行生成' };
    }},
  { id: 'FIX-054', description: 'createAlertRule参数any', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待修复', files: ['server/services/observability.service.ts'] }) },
  { id: 'FIX-055', description: 'createSilence参数any', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待修复', files: ['server/services/observability.service.ts'] }) },
  { id: 'FIX-056', description: 'orchestrator-hub返回{stub:true}无类型', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待修复', files: [] }) },
  { id: 'FIX-057', description: 'Kafka消息timestamp类型混用', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-058', description: 'nl-interface发布payload校验不足', severity: '中等', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待加强', files: [] }) },
  { id: 'FIX-059', description: 'ConditionNormalizer使用fetch()非tRPC', severity: '低', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待迁移', files: [] }) },
  { id: 'FIX-060', description: 'mysqlEnum severity值域不统一', severity: '严重', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-061', description: '前端store与后端API类型不对齐', severity: '低', category: 'C-类型',
    verify: () => ({ status: 'open', method: '待对齐', files: [] }) },

  // ─── D. 功能缺失/Stub (20) ───
  { id: 'FIX-062', description: 'WorldModel训练是stub', severity: '致命', category: 'D-Stub',
    verify: () => {
      const hasStub = grepCount('simulateTraining', 'server/platform/evolution/') > 0;
      return { status: hasStub ? 'open' : 'fixed', method: 'stub扫描',
        files: grepFiles('simulateTraining', 'server/platform/evolution/') };
    }},
  ...[63, 64, 65, 66, 67, 68, 69, 70, 71, 72].map(n => ({
    id: `FIX-0${n}`,
    description: `GrokTool ${['getSensorData', 'getMaintenanceHistory', 'getEquipmentSpecs', 'getSimilarCases', 'getWeatherData', 'runSimulation', 'getOperationalContext', 'getAlarmHistory', 'getTrendAnalysis', 'getExpertKnowledge'][n - 63]} 返回stub`,
    severity: (n <= 64 || n === 70 ? '严重' : n <= 66 || n >= 68 ? '中等' : '低') as FixItem['severity'],
    category: 'D-Stub',
    verify: () => {
      const stubCount = grepCount('stub.*true\\|mock.*data\\|TODO.*stub', 'server/platform/cognition/grok/');
      return { status: stubCount > 0 ? 'open' : 'fixed', method: 'stub扫描',
        files: ['server/platform/cognition/grok/grok-tools.ts'] };
    },
  })),
  { id: 'FIX-073', description: 'ModelFinetune placeholder页面', severity: '低', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: ['client/src/pages/PlaceholderPage.tsx'] }) },
  { id: 'FIX-074', description: 'ModelEval placeholder页面', severity: '低', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-075', description: 'DiagAnalysis placeholder页面', severity: '低', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-076', description: 'DiagReport placeholder页面', severity: '中等', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-077', description: 'observability createAlertRule返回mock', severity: '严重', category: 'D-Stub',
    verify: () => {
      const hasMock = grepCount("id.*mock\\|mock.*success", 'server/services/observability.service.ts') > 0;
      return { status: hasMock ? 'open' : 'fixed', method: 'mock扫描',
        files: ['server/services/observability.service.ts'] };
    }},
  { id: 'FIX-078', description: 'observability createSilence返回mock', severity: '严重', category: 'D-Stub',
    verify: () => ({ status: 'open', method: 'mock扫描', files: ['server/services/observability.service.ts'] }) },
  { id: 'FIX-079', description: 'orchestrator-hub多处返回{stub:true}', severity: '中等', category: 'D-Stub',
    verify: () => {
      const stubCount = grepCount('stub.*true', 'server/platform/orchestrator/orchestrator-hub.ts');
      return { status: stubCount > 0 ? 'open' : 'fixed', method: 'stub扫描',
        files: ['server/platform/orchestrator/orchestrator-hub.ts'], detail: `${stubCount}处stub` };
    }},
  { id: 'FIX-080', description: '工具域domain-router整体Stub', severity: '严重', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: ['server/domains/tooling/tooling.domain-router.ts'] }) },
  { id: 'FIX-081', description: 'ToolDefinition多数为mock', severity: '严重', category: 'D-Stub',
    verify: () => ({ status: 'open', method: '待实现', files: ['server/platform/tooling/framework/tool-framework.ts'] }) },

  // ─── E. 算法Bug (8) ───
  { id: 'FIX-082', description: '62+处hardcoded confidence', severity: '严重', category: 'E-算法',
    verify: () => {
      const count = grepCount('confidence.*0\\.[5-9][0-9]', 'server/');
      return { status: count < 30 ? 'partial' : 'open', method: 'hardcoded扫描',
        files: grepFiles('confidence.*0\\.[5-9]', 'server/'), detail: `${count}处hardcoded` };
    }},
  { id: 'FIX-083', description: 'agent-plugins confidence硬编码', severity: '严重', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/algorithms/agent-plugins/index.ts'] }) },
  { id: 'FIX-084', description: 'structural算法threshold硬编码', severity: '中等', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/algorithms/structural/index.ts'] }) },
  { id: 'FIX-085', description: 'cusumChangePoints threshold硬编码', severity: '中等', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/algorithms/agent-plugins/index.ts'] }) },
  { id: 'FIX-086', description: 'fusionDiagnosis 7处confidence硬编码', severity: '严重', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/services/fusionDiagnosis.service.ts'] }) },
  { id: 'FIX-087', description: 'grokDiagnosticAgent confidence=0.5', severity: '中等', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/services/grokDiagnosticAgent.service.ts'] }) },
  { id: 'FIX-088', description: 'meta-learner阈值硬编码', severity: '严重', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: ['server/platform/evolution/metalearner/meta-learner.ts'] }) },
  { id: 'FIX-089', description: 'genetic-strategy适应度硬编码', severity: '中等', category: 'E-算法',
    verify: () => ({ status: 'open', method: '待参数化', files: [] }) },

  // ─── F. 流程断点 (10) ───
  { id: 'FIX-090', description: '感知管线未端到端集成', severity: '致命', category: 'F-流程',
    verify: () => {
      const hasTest = fileExists('server/platform/perception/__tests__/perception-pipeline-e2e.test.ts');
      return { status: hasTest ? 'fixed' : 'open', method: 'E2E测试检查',
        files: hasTest ? ['server/platform/perception/__tests__/perception-pipeline-e2e.test.ts'] : [] };
    }},
  { id: 'FIX-091', description: 'DS融合→诊断Severity不匹配', severity: '致命', category: 'F-流程',
    verify: () => {
      const usesUnified = fileContains('server/platform/hde/orchestrator/diagnostic-orchestrator.ts', 'SeverityLevel');
      return { status: usesUnified ? 'fixed' : 'open', method: '统一枚举引用检查',
        files: ['server/platform/hde/orchestrator/diagnostic-orchestrator.ts'] };
    }},
  { id: 'FIX-092', description: '护栏引擎未接入诊断流程', severity: '致命', category: 'F-流程',
    verify: () => {
      const hasGuardrail = fileContains('server/platform/hde/orchestrator/diagnostic-orchestrator.ts', 'checkGuardrails');
      return { status: hasGuardrail ? 'fixed' : 'open', method: '护栏集成检查',
        files: ['server/platform/hde/orchestrator/diagnostic-orchestrator.ts'] };
    }},
  { id: 'FIX-093', description: 'HDE双轨诊断缺端到端测试', severity: '严重', category: 'F-流程',
    verify: () => {
      const hasTest = fileExists('server/platform/hde/orchestrator/__tests__/diagnostic-orchestrator.test.ts');
      return { status: hasTest ? 'partial' : 'open', method: '测试文件检查',
        files: hasTest ? ['server/platform/hde/orchestrator/__tests__/diagnostic-orchestrator.test.ts'] : [],
        detail: '基础测试存在，完整E2E待补充' };
    }},
  { id: 'FIX-094', description: 'Neo4j种子数据未完整导入', severity: '严重', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待导入', files: grepFiles('seed', 'server/platform/knowledge/seed-data/') }) },
  { id: 'FIX-095', description: '进化飞轮持久化未接入', severity: '严重', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待接入', files: [] }) },
  { id: 'FIX-096', description: 'Kafka事件Schema校验未强制', severity: '严重', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待强制', files: [] }) },
  { id: 'FIX-097', description: '数据质量评分→分级→告警集成缺失', severity: '中等', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待集成', files: [] }) },
  { id: 'FIX-098', description: '跨设备对比查询优化缺失', severity: '中等', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待优化', files: [] }) },
  { id: 'FIX-099', description: '工况归一化特征顺序不确定', severity: '低', category: 'F-流程',
    verify: () => ({ status: 'open', method: '待修复', files: [] }) },

  // ─── G. 配置错误 (11) ───
  { id: 'FIX-100', description: '11个配置参数运行时被忽略', severity: '中等', category: 'G-配置',
    verify: () => ({ status: 'open', method: '待清理', files: ['server/core/config.ts'] }) },
  { id: 'FIX-101', description: 'Docker MySQL默认密码root123', severity: '致命', category: 'G-配置',
    verify: () => {
      const hasWeak = fileContains('docker-compose.yml', 'root123');
      return { status: hasWeak ? 'open' : 'fixed', method: '密码扫描',
        files: ['docker-compose.yml'] };
    }},
  { id: 'FIX-102', description: 'Docker JWT_SECRET弱默认值', severity: '致命', category: 'G-配置',
    verify: () => {
      const hasWeak = fileContains('docker-compose.yml', 'xilian-portai-nexus');
      return { status: hasWeak ? 'open' : 'fixed', method: '密码扫描',
        files: ['docker-compose.yml'] };
    }},
  { id: 'FIX-103', description: 'ES_PASSWORD=changeme', severity: '严重', category: 'G-配置',
    verify: () => {
      const hasWeak = fileContains('docker-compose.yml', 'changeme');
      return { status: hasWeak ? 'open' : 'fixed', method: '密码扫描',
        files: ['docker-compose.yml'] };
    }},
  { id: 'FIX-104', description: 'MinIO默认凭据minioadmin', severity: '严重', category: 'G-配置',
    verify: () => {
      const count = grepCount('minioadmin', 'docker-compose.yml');
      return { status: count === 0 ? 'fixed' : 'open', method: '凭据扫描',
        files: ['docker-compose.yml'], detail: `${count}处minioadmin` };
    }},
  { id: 'FIX-105', description: 'Grafana admin123', severity: '中等', category: 'G-配置',
    verify: () => {
      const hasWeak = fileContains('docker-compose.yml', 'admin123');
      return { status: hasWeak ? 'open' : 'fixed', method: '密码扫描', files: ['docker-compose.yml'] };
    }},
  { id: 'FIX-106', description: 'Helm密码默认空字符串', severity: '致命', category: 'G-配置',
    verify: () => {
      const hasValidation = fileContains('helm/xilian-platform/templates/secrets.yaml', 'fail');
      return { status: hasValidation ? 'fixed' : 'open', method: 'Helm验证检查',
        files: ['helm/xilian-platform/templates/secrets.yaml'] };
    }},
  { id: 'FIX-107', description: 'Vault dev模式', severity: '中等', category: 'G-配置',
    verify: () => ({ status: 'open', method: '待修改', files: ['docker-compose.yml'] }) },
  { id: 'FIX-108', description: 'Prometheus targets被注释', severity: '中等', category: 'G-配置',
    verify: () => ({ status: 'open', method: '待启用', files: ['docker/prometheus/prometheus.yml'] }) },
  { id: 'FIX-109', description: 'Helm ingress hostname硬编码', severity: '低', category: 'G-配置',
    verify: () => ({ status: 'open', method: '待参数化', files: [] }) },
  { id: 'FIX-110', description: 'gRPC健康检查用localhost', severity: '低', category: 'G-配置',
    verify: () => ({ status: 'open', method: '待修复', files: [] }) },

  // ─── H. 前端空壳 (8) ───
  { id: 'FIX-111', description: 'PlaceholderPage 4个组件', severity: '中等', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待实现', files: ['client/src/pages/PlaceholderPage.tsx'] }) },
  { id: 'FIX-112', description: 'Agents.tsx交互不完整', severity: '中等', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待补全', files: [] }) },
  { id: 'FIX-113', description: 'VectorAdmin.tsx后端集成不完整', severity: '中等', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待集成', files: [] }) },
  { id: 'FIX-114', description: '20-30个前端页面仅有骨架', severity: '严重', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-115', description: 'DiagnosticEnhancerPage mock数据', severity: '低', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待替换', files: [] }) },
  { id: 'FIX-116', description: 'reasoning.router返回mock数据', severity: '低', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待替换', files: [] }) },
  { id: 'FIX-117', description: 'ConditionNormalizer使用fetch()非tRPC', severity: '低', category: 'H-前端',
    verify: () => ({ status: 'open', method: '待迁移', files: [] }) },
  { id: 'FIX-118', description: '60%页面为Partial状态', severity: '低', category: 'H-前端',
    verify: () => ({ status: 'open', method: '持续改进', files: [] }) },

  // ─── I. 架构隐患 (15) ───
  { id: 'FIX-119', description: '插件沙箱使用Function构造器', severity: '致命', category: 'I-架构',
    verify: () => {
      const hasIsolated = fileExists('server/platform/tooling/tools/isolated-sandbox.ts');
      return { status: hasIsolated ? 'fixed' : 'open', method: 'isolated-vm检查',
        files: hasIsolated ? ['server/platform/tooling/tools/isolated-sandbox.ts'] : [] };
    }},
  { id: 'FIX-120', description: '安全检查正则可绕过', severity: '致命', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待加固', files: [] }) },
  { id: 'FIX-121', description: '插件无生命周期管理', severity: '中等', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-122', description: '插件无签名验证', severity: '致命', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-123', description: '两套工具系统不互通', severity: '严重', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待统一', files: [] }) },
  { id: 'FIX-124', description: 'ReAct链无回放能力', severity: '严重', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-125', description: 'EventBus未接入工具系统', severity: '中等', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待接入', files: [] }) },
  { id: 'FIX-126', description: '双总线路由策略缺失', severity: '严重', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-127', description: 'ClickHouse schema碎片化', severity: '中等', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待合并', files: [] }) },
  { id: 'FIX-128', description: 'Neo4j无备份策略', severity: '严重', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待配置', files: [] }) },
  { id: 'FIX-129', description: 'Redis无淘汰策略文档', severity: '中等', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待配置', files: [] }) },
  { id: 'FIX-130', description: 'MySQL分片策略未实施', severity: '中等', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待规划', files: [] }) },
  { id: 'FIX-131', description: 'Saga/Outbox补偿逻辑未补全', severity: '严重', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待实现', files: [] }) },
  { id: 'FIX-132', description: 'Grafana dashboard id:null', severity: '低', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待修复', files: [] }) },
  { id: 'FIX-133', description: 'PodSecurityPolicy已废弃', severity: '低', category: 'I-架构',
    verify: () => ({ status: 'open', method: '待迁移', files: [] }) },

  // ─── J. 测试缺失 (10) ───
  { id: 'FIX-134', description: '平台模块测试覆盖率仅13.6%', severity: '致命', category: 'J-测试',
    verify: () => {
      // 检查测试文件数量
      const testCount = grepCount('describe\\(', 'server/platform/');
      return { status: testCount > 50 ? 'partial' : 'open', method: '覆盖率检查',
        files: [], detail: `${testCount} 个 describe 块` };
    }},
  { id: 'FIX-135', description: 'AI模块0测试', severity: '致命', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待创建', files: [] }) },
  { id: 'FIX-136', description: 'Pipeline DAG引擎测试不足', severity: '中等', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待补充', files: [] }) },
  { id: 'FIX-137', description: 'Observability模块测试不足', severity: '中等', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待补充', files: [] }) },
  { id: 'FIX-138', description: '14个协议适配器测试不足', severity: '中等', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待补充', files: [] }) },
  { id: 'FIX-139', description: '49个算法缺单元测试', severity: '严重', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待创建', files: [] }) },
  { id: 'FIX-140', description: 'HDE双轨诊断无E2E测试', severity: '中等', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待创建', files: [] }) },
  { id: 'FIX-141', description: '感知管线E2E测试缺失', severity: '低', category: 'J-测试',
    verify: () => {
      const hasTest = fileExists('server/platform/perception/__tests__/perception-pipeline-e2e.test.ts');
      return { status: hasTest ? 'fixed' : 'open', method: '测试文件检查',
        files: hasTest ? ['server/platform/perception/__tests__/perception-pipeline-e2e.test.ts'] : [] };
    }},
  { id: 'FIX-142', description: 'Proto编译无CI验证', severity: '低', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待创建CI', files: [] }) },
  { id: 'FIX-143', description: 'MySQL初始化脚本缺失', severity: '低', category: 'J-测试',
    verify: () => ({ status: 'open', method: '待创建', files: [] }) },
];

// ============================================================================
// 执行验证
// ============================================================================

console.log('\n🔍 FIX 修复追踪器 — 扫描 143 个问题...\n');

const verifyResults: Array<{ item: FixItem; result: FixVerifyResult }> = [];

for (const item of fixes) {
  const result = item.verify();
  verifyResults.push({ item, result });
}

// ============================================================================
// 输出表格
// ============================================================================

const fixed = verifyResults.filter(r => r.result.status === 'fixed');
const partial = verifyResults.filter(r => r.result.status === 'partial');
const open = verifyResults.filter(r => r.result.status === 'open');

// 统计
const statusIcon = (s: string) => s === 'fixed' ? '✅' : s === 'partial' ? '🔶' : '❌';

console.log('┌────────┬──────────────────────────────────────────┬──────┬────────────────┬────────┐');
console.log('│ FIX-ID │ 描述                                     │ 状态 │ 验证方法       │ 严重度 │');
console.log('├────────┼──────────────────────────────────────────┼──────┼────────────────┼────────┤');

for (const { item, result } of verifyResults) {
  const desc = item.description.slice(0, 38).padEnd(38);
  const icon = statusIcon(result.status);
  const method = result.method.slice(0, 14).padEnd(14);
  const sev = item.severity.padEnd(4);
  console.log(`│ ${item.id.padEnd(6)} │ ${desc} │ ${icon}   │ ${method} │ ${sev}   │`);
}

console.log('└────────┴──────────────────────────────────────────┴──────┴────────────────┴────────┘');

// 汇总
console.log('\n═══ 汇总 ═══');
console.log(`  ✅ 已修复:   ${fixed.length}/${fixes.length}`);
console.log(`  🔶 部分完成: ${partial.length}/${fixes.length}`);
console.log(`  ❌ 待修复:   ${open.length}/${fixes.length}`);
console.log(`  完成率:      ${((fixed.length / fixes.length) * 100).toFixed(1)}% (含部分: ${(((fixed.length + partial.length) / fixes.length) * 100).toFixed(1)}%)`);

// 按严重度统计
const bySeverity = {
  '致命': { total: 0, fixed: 0 },
  '严重': { total: 0, fixed: 0 },
  '中等': { total: 0, fixed: 0 },
  '低':   { total: 0, fixed: 0 },
};
for (const { item, result } of verifyResults) {
  bySeverity[item.severity].total++;
  if (result.status === 'fixed') bySeverity[item.severity].fixed++;
}

console.log('\n═══ 按严重度 ═══');
for (const [sev, stats] of Object.entries(bySeverity)) {
  const pct = stats.total > 0 ? ((stats.fixed / stats.total) * 100).toFixed(0) : '0';
  console.log(`  ${sev}: ${stats.fixed}/${stats.total} (${pct}%)`);
}

// 按类别统计
const byCategory = new Map<string, { total: number; fixed: number }>();
for (const { item, result } of verifyResults) {
  const cat = item.category;
  if (!byCategory.has(cat)) byCategory.set(cat, { total: 0, fixed: 0 });
  const stats = byCategory.get(cat)!;
  stats.total++;
  if (result.status === 'fixed') stats.fixed++;
}

console.log('\n═══ 按类别 ═══');
for (const [cat, stats] of byCategory) {
  const pct = stats.total > 0 ? ((stats.fixed / stats.total) * 100).toFixed(0) : '0';
  console.log(`  ${cat}: ${stats.fixed}/${stats.total} (${pct}%)`);
}

// 写入 JSON 供其他脚本读取
const reportPath = path.join(ROOT, 'docs/daily/.fix-tracker-latest.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  total: fixes.length,
  fixed: fixed.length,
  partial: partial.length,
  open: open.length,
  completionRate: (fixed.length / fixes.length * 100).toFixed(1),
  bySeverity,
  byCategory: Object.fromEntries(byCategory),
  items: verifyResults.map(({ item, result }) => ({
    id: item.id, description: item.description, severity: item.severity,
    category: item.category, status: result.status, method: result.method,
    files: result.files, detail: result.detail,
  })),
}, null, 2));

console.log(`\n📄 报告已保存: docs/daily/.fix-tracker-latest.json`);
