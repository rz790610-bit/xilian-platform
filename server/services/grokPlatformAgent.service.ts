/**
 * ============================================================================
 * L2 自省层 — Grok 平台诊断 Agent
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-05
 * 
 * 职责：
 *   1. 复用 xAI Grok Tool Calling 协议，创建平台自诊断版本
 *   2. 提供 6 个平台诊断工具（模块状态/完整度报告/桩函数热点/基础设施健康/Feature Flags/依赖图谱）
 *   3. Grok 基于工具返回的真实数据，生成诊断报告和优先级建议
 *   4. 当 xAI API 不可用时，降级为本地规则引擎
 * 
 * 设计原则（xAI 现实主义）：
 *   - 诊断结论必须基于真实数据，不允许编造
 *   - 降级模式下使用确定性规则，不使用 LLM
 *   - 所有工具调用结果可审计
 * 
 * 架构位置: server/services/grokPlatformAgent.service.ts
 * 依赖: 
 *   - server/core/registries/module.registry.ts (ModuleRegistry)
 *   - server/core/stub.ts (StubTracker)
 *   - server/core/moduleFeatureFlags.ts (ModuleFeatureFlags)
 *   - server/core/featureFlags.ts (外部服务 flags)
 */

import { createModuleLogger } from '../core/logger';
import { moduleRegistry } from '../core/registries/module.registry';
import { stubTracker } from '../core/stub';
import { moduleFeatureFlags } from '../core/moduleFeatureFlags';
import { featureFlags } from '../core/featureFlags';

const log = createModuleLogger('grok-platform-agent');

// ============ 配置 ============

interface PlatformAgentConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  timeout: number;
  maxTokens: number;
  temperature: number;
}

function loadConfig(): PlatformAgentConfig {
  return {
    apiUrl: process.env.XAI_API_URL || 'https://api.x.ai',
    apiKey: process.env.XAI_API_KEY || '',
    model: process.env.XAI_PLATFORM_MODEL || process.env.XAI_MODEL || 'grok-4.1-fast',
    enabled: featureFlags.grok,
    timeout: parseInt(process.env.XAI_TIMEOUT || '60000', 10),
    maxTokens: parseInt(process.env.XAI_MAX_TOKENS || '4096', 10),
    temperature: 0.1, // 诊断场景低温度
  };
}

// ============ 平台诊断 Tool 定义 ============

const PLATFORM_DIAGNOSTIC_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_module_status',
      description: '获取指定模块的完整状态：完整度、能力列表、桩函数、依赖状态',
      parameters: {
        type: 'object',
        properties: {
          moduleId: { type: 'string', description: '模块 ID，如 topology、pipeline、evolution' },
        },
        required: ['moduleId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_completeness_report',
      description: '获取平台所有模块的完整度报告，按域聚合',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_stub_hotspots',
      description: '获取调用频率最高的桩函数列表，用于确定实现优先级',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回数量，默认 10' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_infra_health',
      description: '检查基础设施连接状态：PostgreSQL、Redis、Kafka、ClickHouse 等',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_feature_flags',
      description: '获取所有模块和外部服务的 FeatureFlag 启停状态',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_dependency_graph',
      description: '获取模块间的依赖关系图谱，识别循环依赖和孤立模块',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ============ Tool 执行器 ============

async function executePlatformTool(toolName: string, args: Record<string, any>): Promise<string> {
  const startTime = Date.now();

  try {
    let result: any;

    switch (toolName) {
      case 'get_module_status': {
        const m = moduleRegistry.get(args.moduleId);
        if (!m) {
          result = { error: `Module '${args.moduleId}' not found. Available: ${moduleRegistry.listItems().map(i => i.id).join(', ')}` };
        } else {
          result = {
            ...m,
            completeness: moduleRegistry.getCompleteness(args.moduleId),
            stubCount: m.capabilities.filter(c => c.status === 'stub').length,
            plannedCount: m.capabilities.filter(c => c.status === 'planned').length,
            featureEnabled: moduleFeatureFlags.isEnabled(args.moduleId),
          };
        }
        break;
      }

      case 'get_completeness_report':
        result = {
          overall: moduleRegistry.getOverallCompleteness(),
          byDomain: moduleRegistry.getCompletenessReport(),
        };
        break;

      case 'get_stub_hotspots':
        result = stubTracker.getStats(args.limit || 10);
        break;

      case 'get_infra_health':
        result = await checkInfraHealth();
        break;

      case 'get_feature_flags':
        result = {
          moduleFlags: moduleFeatureFlags.getSummary(),
          moduleDetails: moduleFeatureFlags.getAll(),
          serviceFlags: {
            airflow: featureFlags.airflow,
            kafkaConnect: featureFlags.kafkaConnect,
            elasticsearch: featureFlags.elasticsearch,
            flink: featureFlags.flink,
            grok: featureFlags.grok,
          },
        };
        break;

      case 'get_dependency_graph':
        result = moduleRegistry.getDependencyGraph();
        break;

      default:
        result = { error: `Unknown tool: ${toolName}` };
    }

    const latency = Date.now() - startTime;
    log.debug(`[Tool] ${toolName} executed in ${latency}ms`);
    return JSON.stringify(result);
  } catch (err: any) {
    log.error(`[Tool] ${toolName} failed:`, err);
    return JSON.stringify({ error: err.message });
  }
}

// ============ 基础设施健康检查 ============

async function checkInfraHealth(): Promise<Record<string, { status: string; latency?: number; error?: string }>> {
  const results: Record<string, { status: string; latency?: number; error?: string }> = {};

  // PostgreSQL
  try {
    const start = Date.now();
    const { getDb } = await import('../lib/db');
    const db = await getDb();
    if (!db) throw new Error('Database not initialized');
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1`);
    results.postgres = { status: 'healthy', latency: Date.now() - start };
  } catch (err: any) {
    results.postgres = { status: 'unreachable', error: err.message };
  }

  // Redis
  try {
    const start = Date.now();
    const { redisClient } = await import('../lib/clients/redis.client');
    const connected = redisClient.getConnectionStatus();
    if (!connected) throw new Error('Redis not connected');
    results.redis = { status: 'healthy', latency: Date.now() - start };
  } catch (err: any) {
    results.redis = { status: 'unreachable', error: err.message };
  }

  // Kafka (via feature flag)
  if (featureFlags.kafkaConnect) {
    try {
      results.kafka = { status: 'enabled-not-checked' };
    } catch {
      results.kafka = { status: 'unreachable' };
    }
  } else {
    results.kafka = { status: 'disabled-by-feature-flag' };
  }

  // ClickHouse
  try {
    const start = Date.now();
    const { clickhouseClient } = await import('../lib/clients/clickhouse.client');
    const chOk = await clickhouseClient.checkConnection();
    if (!chOk) throw new Error('ClickHouse not connected');
    results.clickhouse = { status: 'healthy', latency: Date.now() - start };
  } catch (err: any) {
    results.clickhouse = { status: 'unreachable', error: err.message };
  }

  return results;
}

// ============ xAI API 调用（简化版，复用 grokDiagnosticAgent 的模式） ============

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

async function callPlatformApi(
  messages: ChatMessage[],
  tools: typeof PLATFORM_DIAGNOSTIC_TOOLS,
  config: PlatformAgentConfig
): Promise<ChatMessage> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const payload: Record<string, unknown> = {
      model: config.model,
      messages: messages.map(m => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      tools,
      tool_choice: 'auto',
    };

    const response = await fetch(`${config.apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`xAI API error: ${response.status} — ${errorText}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];
    if (!choice) throw new Error('xAI API returned empty choices');

    return choice.message as ChatMessage;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============ 本地降级诊断引擎（无需 LLM） ============

// ============ 问题意图分类 ============
type DiagnosticIntent = 'full' | 'stub' | 'infra' | 'dependency' | 'flags' | 'dataflow' | 'module' | 'general';

function classifyQuestion(question?: string): { intent: DiagnosticIntent; moduleId?: string } {
  if (!question) return { intent: 'full' };
  const q = question.toLowerCase();
  // 桩函数相关
  if (q.includes('桩函数') || q.includes('stub') || q.includes('热点') || q.includes('频繁调用') || q.includes('优先实现')) {
    return { intent: 'stub' };
  }
  // 基础设施相关
  if (q.includes('基础设施') || q.includes('mysql') || q.includes('redis') || q.includes('kafka') || q.includes('clickhouse') || q.includes('健康') || q.includes('连接')) {
    return { intent: 'infra' };
  }
  // 依赖分析
  if (q.includes('依赖') || q.includes('循环') || q.includes('孤立') || q.includes('图谱')) {
    return { intent: 'dependency' };
  }
  // 功能开关
  if (q.includes('功能开关') || q.includes('禁用') || q.includes('启用') || q.includes('flag') || q.includes('开关')) {
    return { intent: 'flags' };
  }
  // 数据流
  if (q.includes('数据流') || q.includes('瓶颈') || q.includes('异常路径')) {
    return { intent: 'dataflow' };
  }
  // 特定模块查询
  const moduleMatch = q.match(/m\d{2}|模块\s*([\u4e00-\u9fa5]+)/);
  if (moduleMatch) {
    return { intent: 'module', moduleId: moduleMatch[0] };
  }
  // 全面诊断
  if (q.includes('全面') || q.includes('诊断') || q.includes('报告') || q.includes('完整度')) {
    return { intent: 'full' };
  }
  return { intent: 'general' };
}

// ============ 本地规则引擎（增强版，支持按意图生成针对性报告） ============

async function localDiagnose(question?: string): Promise<string> {
  const { intent, moduleId } = classifyQuestion(question);
  const lines: string[] = [];
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  lines.push('# 平台自诊断报告（本地规则引擎）\n');
  lines.push(`> 生成时间: ${ts}`);
  lines.push(`> 模式: 本地规则引擎\n`);

  switch (intent) {
    case 'full':
    case 'general': {
      // 全面诊断
      const overall = moduleRegistry.getOverallCompleteness();
      const report = moduleRegistry.getCompletenessReport();
      const stubStats = stubTracker.getStats(10);
      const depGraph = moduleRegistry.getDependencyGraph();
      const flagSummary = moduleFeatureFlags.getSummary();

      lines.push(`## 1. 总体完整度: ${overall.percentage}%`);
      lines.push(`- 能力总数: ${overall.total}`);
      lines.push(`- 已完成: ${overall.done} | 部分完成: ${overall.partial} | 桩函数: ${overall.stub} | 规划中: ${overall.planned}\n`);

      lines.push('## 2. 域完整度排名');
      for (const d of [...report].sort((a, b) => a.avgCompleteness - b.avgCompleteness)) {
        const emoji = d.avgCompleteness >= 70 ? '🟢' : d.avgCompleteness >= 40 ? '🟡' : '🔴';
        lines.push(`${emoji} **${d.domainLabel}**: ${d.avgCompleteness}% (${d.moduleCount} 模块)`);
      }
      lines.push('');

      const allModules = report.flatMap(d => d.modules).sort((a, b) => a.completeness - b.completeness);
      lines.push('## 3. 最低完整度模块 Top 5');
      for (const m of allModules.slice(0, 5)) {
        lines.push(`- **${m.label}**: ${m.completeness}% (${m.stubCount} 个桩函数, ${m.plannedCount} 个规划中)`);
      }
      lines.push('');

      if (stubStats.calledStubs > 0) {
        lines.push('## 4. 桩函数调用热点');
        for (const s of stubStats.topCalled.slice(0, 5)) {
          lines.push(`- **${s.functionName}** (${s.filePath}): ${s.callCount} 次调用`);
        }
        lines.push('');
      }

      if (depGraph.cycles.length > 0) {
        lines.push('## 5. ⚠️ 循环依赖');
        for (const cycle of depGraph.cycles) {
          lines.push(`- ${cycle.join(' → ')}`);
        }
        lines.push('');
      }
      if (depGraph.orphans.length > 0) {
        lines.push(`## 6. 孤立模块: ${depGraph.orphans.join(', ')}\n`);
      }

      lines.push('## 优先修复建议');
      lines.push('1. 优先实现被频繁调用的桩函数（用户实际在使用这些功能）');
      lines.push('2. 提升最低完整度域的核心模块');
      if (flagSummary.disabled > 0) {
        lines.push(`3. ${flagSummary.disabled} 个模块已禁用，确认是否需要启用`);
      }
      break;
    }

    case 'stub': {
      const stubStats = stubTracker.getStats(20);
      lines.push(`## 桩函数热点分析\n`);
      lines.push(`- 已注册桩函数总数: **${stubStats.totalStubs}**`);
      lines.push(`- 已被调用的桩函数: **${stubStats.calledStubs}**`);
      lines.push(`- 从未被调用的桩函数: **${stubStats.neverCalledStubs}**`);
      lines.push(`- 总调用次数: **${stubStats.totalCalls}**\n`);

      if (stubStats.topCalled.length > 0) {
        lines.push('### 调用频率最高的桩函数 Top 20');
        lines.push('| 排名 | 函数名 | 文件路径 | 调用次数 | 最近调用 |');
        lines.push('|------|--------|----------|----------|----------|');
        for (let i = 0; i < stubStats.topCalled.length; i++) {
          const s = stubStats.topCalled[i];
          const lastCall = s.lastCalledAt ? new Date(s.lastCalledAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '-';
          lines.push(`| ${i + 1} | **${s.functionName}** | ${s.filePath} | ${s.callCount} | ${lastCall} |`);
        }
        lines.push('');
      }

      lines.push('### 优先实现建议');
      lines.push('以下桩函数被频繁调用，说明用户正在使用这些功能，应优先实现：\n');
      for (const s of stubStats.topCalled.slice(0, 5)) {
        lines.push(`1. **${s.functionName}** — 已被调用 ${s.callCount} 次，位于 \`${s.filePath}\``);
      }
      if (stubStats.neverCalledStubs > 0) {
        lines.push(`\n> 💡 另有 ${stubStats.neverCalledStubs} 个桩函数从未被调用，可降低优先级。`);
      }
      break;
    }

    case 'infra': {
      lines.push('## 基础设施健康检查\n');
      try {
        const health = await checkInfraHealth();
        for (const [name, info] of Object.entries(health)) {
          const emoji = info.status === 'healthy' ? '🟢' : info.status.includes('disabled') ? '⚪' : '🔴';
          const latencyStr = info.latency != null ? ` (延迟: ${info.latency}ms)` : '';
          const errorStr = info.error ? ` — 错误: ${info.error}` : '';
          lines.push(`${emoji} **${name.toUpperCase()}**: ${info.status === 'healthy' ? '正常' : info.status === 'unreachable' ? '不可达' : info.status}${latencyStr}${errorStr}`);
        }
      } catch (err: any) {
        lines.push(`❌ 健康检查执行失败: ${err.message}`);
      }
      lines.push('');

      const flagInfo = {
        kafka: featureFlags.kafkaConnect,
        elasticsearch: featureFlags.elasticsearch,
        flink: featureFlags.flink,
        airflow: featureFlags.airflow,
      };
      lines.push('### 外部服务开关状态');
      for (const [name, enabled] of Object.entries(flagInfo)) {
        lines.push(`- **${name}**: ${enabled ? '✅ 已启用' : '⬚ 未启用'}`);
      }
      lines.push('');
      lines.push('### 建议');
      lines.push('- 确保核心基础设施（数据库、Redis）始终保持健康状态');
      lines.push('- 未启用的外部服务可按需开启，不影响平台核心功能');
      break;
    }

    case 'dependency': {
      const depGraph = moduleRegistry.getDependencyGraph();
      lines.push('## 模块依赖关系分析\n');
      lines.push(`- 模块总数: **${depGraph.nodes.length}**`);
      lines.push(`- 依赖边数: **${depGraph.edges.length}**`);
      lines.push(`- 孤立模块数: **${depGraph.orphans.length}**`);
      lines.push(`- 循环依赖数: **${depGraph.cycles.length}**\n`);

      if (depGraph.cycles.length > 0) {
        lines.push('### ⚠️ 循环依赖（需要重点关注）');
        for (const cycle of depGraph.cycles) {
          lines.push(`- ${cycle.join(' → ')} → ${cycle[0]}`);
        }
        lines.push('');
        lines.push('> 循环依赖会导致模块耦合度过高，建议通过引入中间抽象层或事件驱动解耦。\n');
      } else {
        lines.push('✅ 未检测到循环依赖\n');
      }

      if (depGraph.orphans.length > 0) {
        lines.push('### 孤立模块（无依赖关系）');
        for (const orphan of depGraph.orphans) {
          const mod = moduleRegistry.get(orphan);
          lines.push(`- **${orphan}** (${mod?.label || '未知'}) — 既不依赖其他模块，也不被其他模块依赖`);
        }
        lines.push('');
        lines.push('> 孤立模块可能是独立功能，也可能是依赖关系未正确声明。\n');
      }

      // 依赖最多的模块
      const depCount = new Map<string, number>();
      for (const edge of depGraph.edges) {
        depCount.set(edge.source, (depCount.get(edge.source) || 0) + 1);
      }
      const sorted = Array.from(depCount.entries()).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        lines.push('### 依赖最多的模块 Top 5');
        for (const [id, count] of sorted.slice(0, 5)) {
          const mod = moduleRegistry.get(id);
          lines.push(`- **${mod?.label || id}** (${id}): 依赖 ${count} 个模块`);
        }
      }
      break;
    }

    case 'flags': {
      const flagSummary = moduleFeatureFlags.getSummary();
      const allFlags = moduleFeatureFlags.getAll();
      lines.push('## 功能开关审计报告\n');
      lines.push(`- 模块总数: **${flagSummary.total}**`);
      lines.push(`- 已启用: **${flagSummary.enabled}**`);
      lines.push(`- 已禁用: **${flagSummary.disabled}**\n`);

      lines.push('### 配置来源分布');
      for (const [source, count] of Object.entries(flagSummary.bySource)) {
        lines.push(`- **${source}**: ${count} 个模块`);
      }
      lines.push('');

      const disabledFlags = allFlags.filter(f => !f.enabled);
      if (disabledFlags.length > 0) {
        lines.push('### ⚠️ 已禁用的模块');
        lines.push('| 模块 ID | 配置来源 | 更新者 | 更新时间 |');
        lines.push('|---------|----------|--------|----------|');
        for (const f of disabledFlags) {
          const updatedAt = new Date(f.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
          lines.push(`| **${f.moduleId}** | ${f.source} | ${f.updatedBy} | ${updatedAt} |`);
        }
        lines.push('');
        lines.push('### 影响分析');
        for (const f of disabledFlags) {
          const mod = moduleRegistry.get(f.moduleId);
          if (mod) {
            lines.push(`- **${f.moduleId}** (${mod.label}): 禁用后该模块的 ${mod.capabilities.length} 个能力将不可用`);
          }
        }
      } else {
        lines.push('✅ 所有模块均已启用，无禁用模块。');
      }
      break;
    }

    case 'dataflow': {
      const depGraph = moduleRegistry.getDependencyGraph();
      lines.push('## 数据流分析\n');

      // 找出死端模块（有入边但无出边）
      const hasOutEdge = new Set(depGraph.edges.map(e => e.source));
      const hasInEdge = new Set(depGraph.edges.map(e => e.target));
      const deadEnds = depGraph.nodes.filter(n => hasInEdge.has(n.id) && !hasOutEdge.has(n.id));
      const sources = depGraph.nodes.filter(n => hasOutEdge.has(n.id) && !hasInEdge.has(n.id));

      if (sources.length > 0) {
        lines.push('### 数据源头模块（仅输出）');
        for (const s of sources) {
          lines.push(`- **${s.label}** (${s.id}) — 完整度: ${s.completeness}%`);
        }
        lines.push('');
      }

      if (deadEnds.length > 0) {
        lines.push('### ⚠️ 数据死端模块（仅输入，无输出）');
        for (const d of deadEnds) {
          lines.push(`- **${d.label}** (${d.id}) — 完整度: ${d.completeness}%`);
        }
        lines.push('');
        lines.push('> 死端模块可能存在数据流瓶颈，建议检查是否需要向下游传递数据。\n');
      }

      // 低完整度的关键路径模块
      const criticalModules = depGraph.nodes
        .filter(n => (hasOutEdge.has(n.id) || hasInEdge.has(n.id)) && n.completeness < 50);
      if (criticalModules.length > 0) {
        lines.push('### ⚠️ 低完整度关键路径模块');
        for (const m of criticalModules.sort((a, b) => a.completeness - b.completeness)) {
          lines.push(`- **${m.label}** (${m.id}): ${m.completeness}% — 位于数据流关键路径上，建议优先提升`);
        }
      }
      break;
    }

    case 'module': {
      // 查询特定模块
      const allModules = moduleRegistry.listItems();
      const target = moduleId ? allModules.find(m => m.id.toLowerCase().includes(moduleId.toLowerCase())) : undefined;
      if (target) {
        const completeness = moduleRegistry.getCompleteness(target.id);
        const flagStatus = moduleFeatureFlags.isEnabled(target.id);
        lines.push(`## 模块详情: ${target.label} (${target.id})\n`);
        lines.push(`- 所属域: **${target.domain}**`);
        lines.push(`- 版本: **${target.version}**`);
        lines.push(`- 完整度: **${completeness}%**`);
        lines.push(`- 功能开关: **${flagStatus ? '已启用' : '已禁用'}**`);
        lines.push(`- 能力数: **${target.capabilities.length}**`);
        lines.push(`- 依赖模块: **${target.dependencies.length > 0 ? target.dependencies.join(', ') : '无'}**\n`);

        lines.push('### 能力清单');
        lines.push('| 能力 | 状态 | 说明 |');
        lines.push('|------|------|------|');
        for (const cap of target.capabilities) {
          const statusEmoji = cap.status === 'done' ? '✅' : cap.status === 'partial' ? '🟡' : cap.status === 'stub' ? '🔧' : '📋';
          const statusText = cap.status === 'done' ? '已完成' : cap.status === 'partial' ? '部分完成' : cap.status === 'stub' ? '桩函数' : '规划中';
          lines.push(`| ${statusEmoji} ${cap.label} | ${statusText} | ${cap.note || '-'} |`);
        }
      } else {
        lines.push(`## 未找到匹配的模块\n`);
        lines.push(`可用的模块 ID: ${allModules.map(m => m.id).join(', ')}`);
      }
      break;
    }
  }

  return lines.join('\n');
}

// ============ GrokPlatformAgent 类 ============

export class GrokPlatformAgent {
  private systemPrompt = `你是西联智能平台的自诊断 Agent（v3.1 自适应智能架构 · L2 自省层）。

你的职责是：
1. 分析平台各模块的健康状态和完整度
2. 识别桩函数热点（被频繁调用但未实现的功能）
3. 检查基础设施连接状态
4. 识别模块间依赖问题（循环依赖、孤立模块）
5. 给出优先级排序的、可操作的优化建议

规则：
- 必须先调用工具获取真实数据，再给出结论
- 不允许编造数据或猜测状态
- 建议必须具体到模块 ID 和能力 ID
- 使用中文回答`;

  /** 执行一轮平台自诊断 */
  async diagnose(userQuestion?: string): Promise<{
    diagnosis: string;
    mode: 'grok' | 'local';
    timestamp: Date;
    toolCallCount: number;
  }> {
    const cfg = loadConfig();

    // 如果 Grok 不可用，降级到本地规则引擎
    if (!cfg.enabled || !cfg.apiKey) {
      log.info('[PlatformAgent] Grok unavailable, using local rule engine');
      const diagnosis = await localDiagnose(userQuestion);
      return {
        diagnosis,
        mode: 'local',
        timestamp: new Date(),
        toolCallCount: 0,
      };
    }

    // Grok Tool Calling 循环
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userQuestion || '请对平台进行全面诊断，报告各模块完整度和优先修复建议。' },
    ];

    let toolCallCount = 0;
    const MAX_ITERATIONS = 8; // 防止无限循环

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await callPlatformApi(messages, PLATFORM_DIAGNOSTIC_TOOLS, cfg);
        messages.push(response);

        // 如果没有 tool_calls，说明 Grok 已生成最终回答
        if (!response.tool_calls || response.tool_calls.length === 0) {
          return {
            diagnosis: response.content || '诊断完成，无异常。',
            mode: 'grok',
            timestamp: new Date(),
            toolCallCount,
          };
        }

        // 执行所有 tool calls
        for (const tc of response.tool_calls) {
          toolCallCount++;
          const args = JSON.parse(tc.function.arguments || '{}');
          log.debug(`[PlatformAgent] Tool call: ${tc.function.name}(${JSON.stringify(args)})`);
          const toolResult = await executePlatformTool(tc.function.name, args);
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: tc.id,
          });
        }
      }

      // 达到最大迭代次数
      log.warn('[PlatformAgent] Max iterations reached, returning partial result');
      const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
      return {
        diagnosis: lastAssistant?.content || (await localDiagnose(userQuestion)),
        mode: 'grok',
        timestamp: new Date(),
        toolCallCount,
      };
    } catch (err: any) {
      log.error('[PlatformAgent] Grok API failed, falling back to local:', err.message);
      return {
        diagnosis: (await localDiagnose(userQuestion)) + `\n\n> ⚠️ Grok API 调用失败: ${err.message}，已降级为本地规则引擎`,
        mode: 'local',
        timestamp: new Date(),
        toolCallCount,
      };
    }
  }

  /** 获取 Agent 状态 */
  getStatus(): {
    grokEnabled: boolean;
    mode: 'grok' | 'local';
    model: string;
  } {
    const cfg = loadConfig();
    return {
      grokEnabled: cfg.enabled && !!cfg.apiKey,
      mode: cfg.enabled && cfg.apiKey ? 'grok' : 'local',
      model: cfg.model,
    };
  }
}

// ============ 全局单例 ============
export const grokPlatformAgent = new GrokPlatformAgent();

log.info('[GrokPlatformAgent] Initialized');
