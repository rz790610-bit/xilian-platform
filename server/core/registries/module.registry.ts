/**
 * ============================================================================
 * L1 契约基层 — 模块注册中心 (ModuleRegistry)
 * ============================================================================
 * 
 * v3.1 自适应智能架构 · Alpha 阶段 · A-01
 * 
 * 职责：
 *   1. 为平台全部 28 个模块提供 Single Source of Truth 的 Manifest 注册
 *   2. 每个 Manifest 声明模块的能力清单、完整度、依赖关系、桩函数计数
 *   3. 提供按域聚合的完整度报告 — 供 L2 自省层和前端看板消费
 *   4. 提供模块间依赖图谱 — 供 DataFlowTracer 和 Grok 平台 Agent 使用
 * 
 * 设计原则（xAI 现实主义）：
 *   - 每个 capability 的 status 必须如实标注 done/partial/stub/planned
 *   - completionPct 由 capability 状态自动计算，不允许手动覆写
 *   - 依赖声明必须双向可验证
 * 
 * 架构位置: server/core/registries/module.registry.ts
 * 依赖: server/core/registry.ts (BaseRegistry)
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';
import { createModuleLogger } from '../logger';

const log = createModuleLogger('module-registry');

// ============ 类型定义 ============

/** 能力状态 — 严格四级 */
export type CapabilityStatus = 'done' | 'partial' | 'stub' | 'planned';

/** 单个能力声明 */
export interface ModuleCapability {
  /** 能力 ID（如 'crud', 'realtime-sync', 'export-csv'） */
  id: string;
  /** 显示名称 */
  label: string;
  /** 实现状态 */
  status: CapabilityStatus;
  /** 关联的 tRPC 端点（可选） */
  trpcEndpoint?: string;
  /** 关联的前端路由（可选） */
  frontendRoute?: string;
  /** 备注 */
  note?: string;
}

/** 模块域分类 */
export type ModuleDomain = 'core' | 'data' | 'orchestration' | 'intelligence' | 'security' | 'infra';

/** 模块 Manifest — 扩展 RegistryItemMeta */
export interface ModuleManifest extends RegistryItemMeta {
  /** 所属业务域 */
  domain: ModuleDomain;
  /** 能力清单 */
  capabilities: ModuleCapability[];
  /** 依赖的模块 ID 列表 */
  dependencies: string[];
  /** tRPC Router 名称（如 'device', 'pipeline'） */
  trpcRouter?: string;
  /** 前端主路由 */
  frontendRoute?: string;
  /** 关联的数据库表数量 */
  dbTableCount: number;
  /** 关联的数据库表名列表 */
  dbTables?: string[];
  /** 版本号 */
  version: string;
  /** 最后审计时间 */
  lastAuditedAt?: string;
}

/** 域聚合的完整度报告 */
export interface DomainCompletenessReport {
  domain: ModuleDomain;
  domainLabel: string;
  moduleCount: number;
  avgCompleteness: number;
  modules: Array<{
    id: string;
    label: string;
    completeness: number;
    totalCapabilities: number;
    doneCount: number;
    partialCount: number;
    stubCount: number;
    plannedCount: number;
  }>;
}

// ============ 完整度计算权重 ============
const STATUS_WEIGHT: Record<CapabilityStatus, number> = {
  done: 1.0,
  partial: 0.5,
  stub: 0.1,
  planned: 0,
};

// ============ 域分类元数据 ============
const DOMAIN_CATEGORIES: CategoryMeta[] = [
  { id: 'core', label: '核心业务', icon: '🏗️', description: '设备、告警、网关、接入层、知识库、模型', order: 1, color: '#3B82F6' },
  { id: 'data', label: '数据治理', icon: '📊', description: '数据治理、采集、标注、资产', order: 2, color: '#10B981' },
  { id: 'orchestration', label: '编排引擎', icon: '⚙️', description: 'Pipeline、插件、算法、知识图谱、ER设计', order: 3, color: '#F59E0B' },
  { id: 'intelligence', label: '智能分析', icon: '🧠', description: '融合诊断、Grok Agent、蒸馏、进化', order: 4, color: '#8B5CF6' },
  { id: 'security', label: '安全审计', icon: '🔒', description: '监控、审计日志、密钥管理', order: 5, color: '#EF4444' },
  { id: 'infra', label: '基础设施', icon: '🔧', description: '调度器、事件总线、Saga、Outbox、去重、采样', order: 6, color: '#6B7280' },
];

// ============ ModuleRegistry 类 ============

export class ModuleRegistry extends BaseRegistry<ModuleManifest> {
  constructor() {
    super('ModuleRegistry');
    // 注册域分类
    this.registerCategories(DOMAIN_CATEGORIES);
  }

  /** 计算单个模块的完整度百分比 (0~100) */
  getCompleteness(moduleId: string): number {
    const m = this.get(moduleId);
    if (!m || m.capabilities.length === 0) return 0;
    const totalWeight = m.capabilities.reduce((sum, c) => sum + STATUS_WEIGHT[c.status], 0);
    return Math.round((totalWeight / m.capabilities.length) * 100);
  }

  /** 获取按域聚合的完整度报告 */
  getCompletenessReport(): DomainCompletenessReport[] {
    const domainMap = new Map<ModuleDomain, ModuleManifest[]>();
    for (const m of this.listItems()) {
      const list = domainMap.get(m.domain) || [];
      list.push(m);
      domainMap.set(m.domain, list);
    }

    const report: DomainCompletenessReport[] = [];
    for (const cat of DOMAIN_CATEGORIES) {
      const modules = domainMap.get(cat.id as ModuleDomain) || [];
      const moduleDetails = modules.map(m => {
        const caps = m.capabilities;
        return {
          id: m.id,
          label: m.label,
          completeness: this.getCompleteness(m.id),
          totalCapabilities: caps.length,
          doneCount: caps.filter(c => c.status === 'done').length,
          partialCount: caps.filter(c => c.status === 'partial').length,
          stubCount: caps.filter(c => c.status === 'stub').length,
          plannedCount: caps.filter(c => c.status === 'planned').length,
        };
      });

      report.push({
        domain: cat.id as ModuleDomain,
        domainLabel: cat.label,
        moduleCount: modules.length,
        avgCompleteness: moduleDetails.length > 0
          ? Math.round(moduleDetails.reduce((s, m) => s + m.completeness, 0) / moduleDetails.length)
          : 0,
        modules: moduleDetails,
      });
    }

    return report;
  }

  /** 获取模块间依赖图谱 */
  getDependencyGraph(): {
    nodes: Array<{ id: string; label: string; domain: ModuleDomain; completeness: number }>;
    edges: Array<{ source: string; target: string }>;
    orphans: string[];
    cycles: string[][];
  } {
    const allModules = this.listItems();
    const nodes = allModules.map(m => ({
      id: m.id,
      label: m.label,
      domain: m.domain,
      completeness: this.getCompleteness(m.id),
    }));

    const edges: Array<{ source: string; target: string }> = [];
    const depTargets = new Set<string>();
    const depSources = new Set<string>();

    for (const m of allModules) {
      for (const dep of m.dependencies) {
        edges.push({ source: m.id, target: dep });
        depSources.add(m.id);
        depTargets.add(dep);
      }
    }

    // 孤立模块：既不依赖别人，也不被别人依赖
    const allIds = new Set(allModules.map(m => m.id));
    const orphans = Array.from(allIds).filter(id => !depSources.has(id) && !depTargets.has(id));

    // 简单环检测 (DFS)
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const adjacency = new Map<string, string[]>();
    for (const m of allModules) {
      adjacency.set(m.id, m.dependencies.filter(d => allIds.has(d)));
    }

    function dfs(node: string, path: string[]): void {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart).concat(node));
        }
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      for (const neighbor of (adjacency.get(node) || [])) {
        dfs(neighbor, [...path, node]);
      }
      stack.delete(node);
    }

    for (const id of Array.from(allIds)) {
      if (!visited.has(id)) dfs(id, []);
    }

    return { nodes, edges, orphans, cycles };
  }

  /** 获取平台总体完整度 */
  getOverallCompleteness(): { total: number; done: number; partial: number; stub: number; planned: number; percentage: number } {
    let done = 0, partial = 0, stub = 0, planned = 0;
    for (const m of this.listItems()) {
      for (const c of m.capabilities) {
        switch (c.status) {
          case 'done': done++; break;
          case 'partial': partial++; break;
          case 'stub': stub++; break;
          case 'planned': planned++; break;
        }
      }
    }
    const total = done + partial + stub + planned;
    const weightedSum = done * 1.0 + partial * 0.5 + stub * 0.1;
    return {
      total,
      done,
      partial,
      stub,
      planned,
      percentage: total > 0 ? Math.round((weightedSum / total) * 100) : 0,
    };
  }
}

// ============ 全局单例 ============
export const moduleRegistry = new ModuleRegistry();

// ============ 注册 28 个模块 Manifest ============

/**
 * 模块 Manifest 注册
 * 
 * 数据来源：
 *   - tRPC Router 端点扫描 (683 endpoints / 72 routers)
 *   - 前端页面审计 (55 pages)
 *   - 数据库表统计 (121 tables)
 *   - 平台审计报告 (xilian-platform-optimization-roadmap.md)
 * 
 * capability.status 标注规则：
 *   done    — 端到端可用，有 tRPC 端点 + 前端 UI + 数据库持久化
 *   partial — 有代码但部分功能缺失（如只有 CRUD 无实时同步）
 *   stub    — 有函数签名但返回 mock/placeholder 数据
 *   planned — 仅在设计文档中，无任何代码
 */

// ── 核心业务域 (core) ──

moduleRegistry.register({
  id: 'topology',
  label: '系统拓扑',
  icon: '🗺️',
  description: '52 微服务拓扑可视化、健康状态监控、服务依赖关系图',
  category: 'core',
  domain: 'core',
  version: '1.2.0',
  trpcRouter: 'topology',
  frontendRoute: '/settings/status/topology',
  dbTableCount: 3,
  dbTables: ['microservices', 'service_dependencies', 'health_checks'],
  dependencies: ['microservice'],
  capabilities: [
    { id: 'topology-view', label: '拓扑图渲染', status: 'done', trpcEndpoint: 'topology.getTopology', frontendRoute: '/settings/status/topology' },
    { id: 'topology-health', label: '健康状态轮询', status: 'done', trpcEndpoint: 'topology.getServiceHealth' },
    { id: 'topology-fitToView', label: '自适应缩放', status: 'done', note: 'v3.1 canvas fix' },
    { id: 'topology-multiSelect', label: '多选拖拽', status: 'done', note: 'v3.1 canvas fix' },
    { id: 'topology-save', label: '布局持久化', status: 'partial', note: '前端保存已修复，后端 API 待对接' },
    { id: 'topology-drill', label: '节点下钻详情', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'device',
  label: '设备管理',
  icon: '📡',
  description: '设备注册、遥测数据接收、设备类型管理、批量操作',
  category: 'core',
  domain: 'core',
  version: '2.0.0',
  trpcRouter: 'device',
  frontendRoute: '/device',
  dbTableCount: 12,
  dbTables: ['devices', 'device_types', 'device_groups', 'device_telemetry', 'device_commands', 'device_events', 'device_configs', 'device_firmware', 'sensors', 'sensor_readings', 'device_templates', 'device_tags'],
  dependencies: ['gateway', 'accessLayer', 'eventBus'],
  capabilities: [
    { id: 'device-crud', label: '设备 CRUD', status: 'done', trpcEndpoint: 'device.list' },
    { id: 'device-telemetry', label: '遥测数据接收', status: 'done', trpcEndpoint: 'device.getTelemetry' },
    { id: 'device-type-mgmt', label: '设备类型管理', status: 'done', trpcEndpoint: 'device.getDeviceTypes' },
    { id: 'device-batch-ops', label: '批量操作', status: 'partial', note: '批量删除已实现，批量配置下发为 stub' },
    { id: 'device-firmware', label: '固件管理', status: 'stub' },
    { id: 'device-digital-twin', label: '数字孪生', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'alert',
  label: '告警中心',
  icon: '🚨',
  description: '告警规则配置、告警触发与通知、告警历史查询',
  category: 'core',
  domain: 'core',
  version: '1.0.0',
  trpcRouter: 'observability',
  frontendRoute: '/alert',
  dbTableCount: 3,
  dbTables: ['alert_rules', 'alert_history', 'alert_notifications'],
  dependencies: ['device', 'eventBus', 'monitoring'],
  capabilities: [
    { id: 'alert-rules', label: '告警规则 CRUD', status: 'done', trpcEndpoint: 'observability.getAlertRules' },
    { id: 'alert-trigger', label: '告警触发引擎', status: 'partial', note: '基于阈值触发已实现，复合条件待完善' },
    { id: 'alert-notify', label: '通知推送', status: 'stub', note: '邮件/webhook 通道为 stub' },
    { id: 'alert-history', label: '告警历史查询', status: 'done', trpcEndpoint: 'observability.getAlertHistory' },
    { id: 'alert-ack', label: '告警确认/静默', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'gateway',
  label: '网关管理',
  icon: '🌐',
  description: '协议网关配置、连接管理、数据路由',
  category: 'core',
  domain: 'core',
  version: '1.0.0',
  trpcRouter: 'infrastructure',
  frontendRoute: '/settings/config/gateway',
  dbTableCount: 2,
  dbTables: ['gateways', 'gateway_routes'],
  dependencies: ['accessLayer'],
  capabilities: [
    { id: 'gateway-crud', label: '网关 CRUD', status: 'done', trpcEndpoint: 'infrastructure.getGateways' },
    { id: 'gateway-protocol', label: '协议适配', status: 'partial', note: 'MQTT/HTTP 已实现，Modbus/OPC-UA 为 stub' },
    { id: 'gateway-routing', label: '数据路由规则', status: 'stub' },
    { id: 'gateway-monitoring', label: '网关监控', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'accessLayer',
  label: '接入层',
  icon: '🔌',
  description: '15 种协议适配器统一管理、设备接入认证',
  category: 'core',
  domain: 'core',
  version: '1.5.0',
  trpcRouter: 'accessLayer',
  frontendRoute: '/settings/config/access',
  dbTableCount: 3,
  dbTables: ['protocol_adapters', 'access_credentials', 'access_logs'],
  dependencies: ['gateway'],
  capabilities: [
    { id: 'access-adapter-list', label: '协议适配器列表', status: 'done', trpcEndpoint: 'accessLayer.listAdapters' },
    { id: 'access-adapter-config', label: '适配器配置', status: 'done', trpcEndpoint: 'accessLayer.configureAdapter' },
    { id: 'access-auth', label: '设备接入认证', status: 'partial', note: 'Token 认证已实现，证书认证为 stub' },
    { id: 'access-test', label: '连接测试', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'knowledgeBase',
  label: '知识库',
  icon: '📚',
  description: '知识图谱存储、知识检索、RAG 增强生成',
  category: 'core',
  domain: 'core',
  version: '1.0.0',
  trpcRouter: 'knowledge',
  frontendRoute: '/knowledge',
  dbTableCount: 8,
  dbTables: ['knowledge_nodes', 'knowledge_edges', 'knowledge_categories', 'knowledge_tags', 'knowledge_versions', 'knowledge_embeddings', 'knowledge_sources', 'knowledge_queries'],
  dependencies: ['model', 'kgOrchestrator'],
  capabilities: [
    { id: 'kb-crud', label: '知识条目 CRUD', status: 'done', trpcEndpoint: 'knowledge.list' },
    { id: 'kb-search', label: '知识检索', status: 'done', trpcEndpoint: 'knowledge.search' },
    { id: 'kb-graph', label: '知识图谱可视化', status: 'partial', note: 'Canvas 已修复，关系编辑部分完成' },
    { id: 'kb-rag', label: 'RAG 增强生成', status: 'stub', note: '向量检索 + LLM 生成为 stub' },
    { id: 'kb-import', label: '批量导入', status: 'stub' },
    { id: 'kb-versioning', label: '知识版本管理', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'model',
  label: '模型管理',
  icon: '🤖',
  description: 'AI 模型注册、版本管理、部署、推理调用',
  category: 'core',
  domain: 'core',
  version: '1.0.0',
  trpcRouter: 'model',
  frontendRoute: '/model',
  dbTableCount: 8,
  dbTables: ['models', 'model_versions', 'model_deployments', 'model_metrics', 'model_configs', 'model_datasets', 'model_experiments', 'model_artifacts'],
  dependencies: ['algorithm'],
  capabilities: [
    { id: 'model-crud', label: '模型 CRUD', status: 'done', trpcEndpoint: 'model.list' },
    { id: 'model-version', label: '版本管理', status: 'done', trpcEndpoint: 'model.getVersions' },
    { id: 'model-deploy', label: '模型部署', status: 'stub', note: '部署 API 存在但实际不触发容器' },
    { id: 'model-inference', label: '推理调用', status: 'stub' },
    { id: 'model-monitoring', label: '模型监控', status: 'planned' },
  ],
});

// ── 数据治理域 (data) ──

moduleRegistry.register({
  id: 'dataGovernance',
  label: '数据治理',
  icon: '🏛️',
  description: '数据质量规则、血缘追踪、合规检查',
  category: 'data',
  domain: 'data',
  version: '0.5.0',
  trpcRouter: 'dataPipeline',
  frontendRoute: '/data/governance',
  dbTableCount: 6,
  dbTables: ['data_quality_rules', 'data_lineage', 'data_catalogs', 'data_policies', 'data_classifications', 'data_compliance_logs'],
  dependencies: ['pipeline', 'eventBus'],
  capabilities: [
    { id: 'dg-quality-rules', label: '数据质量规则', status: 'partial', note: '规则定义已实现，自动执行为 stub' },
    { id: 'dg-lineage', label: '血缘追踪', status: 'stub' },
    { id: 'dg-catalog', label: '数据目录', status: 'stub' },
    { id: 'dg-compliance', label: '合规检查', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'dataCollection',
  label: '数据采集',
  icon: '📥',
  description: '多源数据采集、采集任务调度、数据预处理',
  category: 'data',
  domain: 'data',
  version: '1.0.0',
  trpcRouter: 'dataPipeline',
  frontendRoute: '/data/collection',
  dbTableCount: 3,
  dbTables: ['collection_tasks', 'collection_sources', 'collection_logs'],
  dependencies: ['device', 'accessLayer', 'scheduler'],
  capabilities: [
    { id: 'dc-task-mgmt', label: '采集任务管理', status: 'done', trpcEndpoint: 'dataPipeline.listTasks' },
    { id: 'dc-multi-source', label: '多源采集', status: 'partial', note: 'DB/API 源已实现，文件/流式源为 stub' },
    { id: 'dc-scheduling', label: '采集调度', status: 'stub', note: '依赖 Airflow，当前 feature flag 关闭' },
    { id: 'dc-preprocessing', label: '数据预处理', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'dataLabel',
  label: '数据标注',
  icon: '🏷️',
  description: '数据标注任务、标注工具、标注质量管理',
  category: 'data',
  domain: 'data',
  version: '0.3.0',
  frontendRoute: '/data/label',
  dbTableCount: 4,
  dbTables: ['label_tasks', 'label_items', 'label_categories', 'label_quality_checks'],
  dependencies: ['dataCollection'],
  capabilities: [
    { id: 'dl-task-mgmt', label: '标注任务管理', status: 'stub' },
    { id: 'dl-annotation', label: '标注工具', status: 'planned' },
    { id: 'dl-quality', label: '标注质量检查', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'dataAsset',
  label: '数据资产',
  icon: '💎',
  description: '数据资产目录、数据集管理、数据共享',
  category: 'data',
  domain: 'data',
  version: '0.3.0',
  frontendRoute: '/data/asset',
  dbTableCount: 2,
  dbTables: ['data_assets', 'data_shares'],
  dependencies: ['dataGovernance'],
  capabilities: [
    { id: 'da-catalog', label: '资产目录', status: 'stub' },
    { id: 'da-dataset', label: '数据集管理', status: 'stub' },
    { id: 'da-sharing', label: '数据共享', status: 'planned' },
  ],
});

// ── 编排引擎域 (orchestration) ──

moduleRegistry.register({
  id: 'pipeline',
  label: 'Pipeline 编排',
  icon: '🔗',
  description: '数据管道可视化编排、50+ 节点类型、执行引擎',
  category: 'orchestration',
  domain: 'orchestration',
  version: '2.0.0',
  trpcRouter: 'pipeline',
  frontendRoute: '/pipeline',
  dbTableCount: 5,
  dbTables: ['pipelines', 'pipeline_nodes', 'pipeline_edges', 'pipeline_runs', 'pipeline_logs'],
  dependencies: ['eventBus', 'scheduler'],
  capabilities: [
    { id: 'pipe-crud', label: 'Pipeline CRUD', status: 'done', trpcEndpoint: 'pipeline.list' },
    { id: 'pipe-canvas', label: '可视化编排画布', status: 'done', frontendRoute: '/pipeline/edit', note: 'v3.1 canvas fix' },
    { id: 'pipe-save', label: '画布持久化', status: 'done', note: 'v3.1 修复真实保存' },
    { id: 'pipe-execute', label: '执行引擎', status: 'partial', note: '同步执行已实现，异步/流式为 stub' },
    { id: 'pipe-schedule', label: '定时调度', status: 'stub', note: '依赖 Airflow' },
    { id: 'pipe-monitor', label: '运行监控', status: 'stub' },
    { id: 'pipe-version', label: '版本管理', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'plugin',
  label: '插件引擎',
  icon: '🧩',
  description: '插件注册、沙箱隔离、生命周期管理、状态持久化',
  category: 'orchestration',
  domain: 'orchestration',
  version: '1.5.0',
  trpcRouter: 'plugin',
  frontendRoute: '/plugin',
  dbTableCount: 4,
  dbTables: ['plugins', 'plugin_configs', 'plugin_states', 'plugin_logs'],
  dependencies: ['eventBus'],
  capabilities: [
    { id: 'plugin-crud', label: '插件 CRUD', status: 'done', trpcEndpoint: 'plugin.list' },
    { id: 'plugin-sandbox', label: '沙箱隔离', status: 'partial', note: '基础隔离已实现，资源限制为 stub' },
    { id: 'plugin-lifecycle', label: '生命周期管理', status: 'partial' },
    { id: 'plugin-state', label: '状态持久化', status: 'stub', note: '审计中发现的问题' },
    { id: 'plugin-marketplace', label: '插件市场', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'algorithm',
  label: '算法赋能',
  icon: '🧮',
  description: '算法元数据管理、智能推荐、组合编排、桥接执行',
  category: 'orchestration',
  domain: 'orchestration',
  version: '1.0.0',
  trpcRouter: 'algorithm',
  frontendRoute: '/algorithm',
  dbTableCount: 5,
  dbTables: ['algorithms', 'algorithm_versions', 'algorithm_configs', 'algorithm_runs', 'algorithm_metrics'],
  dependencies: ['model', 'pipeline'],
  capabilities: [
    { id: 'algo-crud', label: '算法 CRUD', status: 'done', trpcEndpoint: 'algorithm.list' },
    { id: 'algo-recommend', label: '智能推荐', status: 'partial', note: '基于标签推荐已实现，协同过滤为 stub' },
    { id: 'algo-compose', label: '组合编排', status: 'stub' },
    { id: 'algo-execute', label: '桥接执行', status: 'stub' },
    { id: 'algo-benchmark', label: '性能基准测试', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'kgOrchestrator',
  label: '知识图谱编排',
  icon: '🕸️',
  description: '知识图谱构建流水线、30+ 算子、可视化编排',
  category: 'orchestration',
  domain: 'orchestration',
  version: '1.0.0',
  trpcRouter: 'kgOrchestrator',
  frontendRoute: '/knowledge/orchestrator',
  dbTableCount: 3,
  dbTables: ['kg_pipelines', 'kg_nodes', 'kg_edges'],
  dependencies: ['knowledgeBase', 'pipeline'],
  capabilities: [
    { id: 'kg-crud', label: 'KG Pipeline CRUD', status: 'done', trpcEndpoint: 'kgOrchestrator.list' },
    { id: 'kg-canvas', label: '可视化编排画布', status: 'done', note: 'v3.1 canvas fix' },
    { id: 'kg-save', label: '画布持久化', status: 'done', note: 'v3.1 修复真实保存' },
    { id: 'kg-execute', label: '执行引擎', status: 'stub' },
    { id: 'kg-preview', label: '结果预览', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'erDiagram',
  label: 'ER 设计工作台',
  icon: '📐',
  description: '数据库 ER 图可视化设计、DDL 生成、架构版本管理',
  category: 'orchestration',
  domain: 'orchestration',
  version: '1.0.0',
  frontendRoute: '/settings/design/workbench',
  dbTableCount: 0,
  dependencies: ['database'],
  capabilities: [
    { id: 'er-canvas', label: 'ER 图画布', status: 'done', frontendRoute: '/settings/design/workbench' },
    { id: 'er-ddl', label: 'DDL 生成', status: 'done' },
    { id: 'er-version', label: '架构版本管理', status: 'planned' },
  ],
});

// ── 智能分析域 (intelligence) ──

moduleRegistry.register({
  id: 'fusionDiagnosis',
  label: '融合诊断',
  icon: '🔬',
  description: 'DS 证据理论融合诊断、专家注册、冲突处理',
  category: 'intelligence',
  domain: 'intelligence',
  version: '1.0.0',
  trpcRouter: 'fusionDiagnosis',
  frontendRoute: '/diagnosis/fusion',
  dbTableCount: 3,
  dbTables: ['diagnosis_experts', 'diagnosis_rules', 'diagnosis_results'],
  dependencies: ['device', 'model', 'knowledgeBase'],
  capabilities: [
    { id: 'fd-expert-registry', label: '专家注册', status: 'done', trpcEndpoint: 'fusionDiagnosis.listExperts' },
    { id: 'fd-ds-fusion', label: 'DS 证据融合', status: 'done', trpcEndpoint: 'fusionDiagnosis.diagnose' },
    { id: 'fd-conflict', label: '冲突处理', status: 'partial' },
    { id: 'fd-history', label: '诊断历史', status: 'done' },
    { id: 'fd-auto-trigger', label: '自动触发诊断', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'grokAgent',
  label: 'Grok 诊断 Agent',
  icon: '🤖',
  description: 'xAI Grok 驱动的设备故障诊断、多轮对话、Tool Calling',
  category: 'intelligence',
  domain: 'intelligence',
  version: '1.0.0',
  trpcRouter: 'grokDiagnostic',
  frontendRoute: '/diagnosis/grok',
  dbTableCount: 0,
  dependencies: ['device', 'fusionDiagnosis'],
  capabilities: [
    { id: 'grok-chat', label: '多轮对话', status: 'done', trpcEndpoint: 'grokDiagnostic.chat' },
    { id: 'grok-tool-calling', label: 'Tool Calling', status: 'done' },
    { id: 'grok-device-diag', label: '设备故障诊断', status: 'done' },
    { id: 'grok-platform-diag', label: '平台自诊断', status: 'planned', note: 'A-05 将实现' },
  ],
});

moduleRegistry.register({
  id: 'distillation',
  label: '知识蒸馏',
  icon: '🧪',
  description: '高级知识蒸馏：动态温度、特征/关系/融合蒸馏、多模态',
  category: 'intelligence',
  domain: 'intelligence',
  version: '0.5.0',
  trpcRouter: 'advancedDistillation',
  frontendRoute: '/model/distillation',
  dbTableCount: 2,
  dbTables: ['distillation_tasks', 'distillation_results'],
  dependencies: ['model', 'algorithm'],
  capabilities: [
    { id: 'distill-config', label: '蒸馏配置', status: 'done', trpcEndpoint: 'advancedDistillation.configure' },
    { id: 'distill-execute', label: '蒸馏执行', status: 'stub', note: '配置保存但实际不执行训练' },
    { id: 'distill-monitor', label: '蒸馏监控', status: 'stub' },
    { id: 'distill-multimodal', label: '多模态蒸馏', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'evolution',
  label: '自主进化',
  icon: '🧬',
  description: 'L5 自主进化层：影子评估、舰队学习、进化管道',
  category: 'intelligence',
  domain: 'intelligence',
  version: '0.1.0',
  frontendRoute: '/settings/status/evolution',
  dbTableCount: 0,
  dependencies: ['moduleRegistry', 'grokAgent', 'fusionDiagnosis'],
  capabilities: [
    { id: 'evo-shadow', label: '影子评估', status: 'planned' },
    { id: 'evo-fleet', label: '舰队学习', status: 'planned' },
    { id: 'evo-pipeline', label: '进化管道', status: 'planned' },
  ],
});

// ── 安全审计域 (security) ──

moduleRegistry.register({
  id: 'monitoring',
  label: '平台监控',
  icon: '📈',
  description: 'Prometheus 指标、ClickHouse 仪表盘、系统健康',
  category: 'security',
  domain: 'security',
  version: '1.0.0',
  trpcRouter: 'observability',
  frontendRoute: '/monitoring',
  dbTableCount: 3,
  dbTables: ['monitoring_dashboards', 'monitoring_panels', 'monitoring_alerts'],
  dependencies: ['eventBus'],
  capabilities: [
    { id: 'mon-prometheus', label: 'Prometheus 指标', status: 'done', trpcEndpoint: 'observability.getMetrics' },
    { id: 'mon-dashboard', label: 'ClickHouse 仪表盘', status: 'partial', note: '基础图表已实现，自定义面板为 stub' },
    { id: 'mon-system-health', label: '系统健康检查', status: 'done' },
    { id: 'mon-alerting', label: '监控告警', status: 'partial' },
  ],
});

moduleRegistry.register({
  id: 'auditLog',
  label: '审计日志',
  icon: '📋',
  description: '操作审计日志记录、查询、合规报告',
  category: 'security',
  domain: 'security',
  version: '0.5.0',
  frontendRoute: '/settings/security/audit',
  dbTableCount: 2,
  dbTables: ['audit_logs', 'audit_logs_sensitive'],
  dependencies: ['eventBus'],
  capabilities: [
    { id: 'audit-record', label: '日志记录', status: 'partial', note: '基础记录已实现，敏感操作审计为 stub' },
    { id: 'audit-query', label: '日志查询', status: 'stub' },
    { id: 'audit-report', label: '合规报告', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'secretManager',
  label: '密钥管理',
  icon: '🔑',
  description: '密钥存储、轮换、访问控制',
  category: 'security',
  domain: 'security',
  version: '0.1.0',
  frontendRoute: '/settings/security/secrets',
  dbTableCount: 0,
  dependencies: [],
  capabilities: [
    { id: 'secret-store', label: '密钥存储', status: 'stub' },
    { id: 'secret-rotation', label: '密钥轮换', status: 'planned' },
    { id: 'secret-acl', label: '访问控制', status: 'planned' },
  ],
});

// ── 基础设施域 (infra) ──

moduleRegistry.register({
  id: 'scheduler',
  label: '任务调度',
  icon: '⏰',
  description: '定时任务调度、Cron 管理、任务依赖',
  category: 'infra',
  domain: 'infra',
  version: '0.5.0',
  frontendRoute: '/settings/config/scheduler',
  dbTableCount: 1,
  dbTables: ['scheduled_tasks'],
  dependencies: [],
  capabilities: [
    { id: 'sched-cron', label: 'Cron 任务管理', status: 'stub', note: '依赖 Airflow' },
    { id: 'sched-dependency', label: '任务依赖', status: 'planned' },
    { id: 'sched-monitoring', label: '调度监控', status: 'planned' },
  ],
});

moduleRegistry.register({
  id: 'eventBus',
  label: '事件总线',
  icon: '📨',
  description: '内存事件总线 + Redis Pub/Sub + Kafka 集成',
  category: 'infra',
  domain: 'infra',
  version: '2.0.0',
  trpcRouter: 'eventBus',
  dbTableCount: 3,
  dbTables: ['event_logs', 'event_subscriptions', 'event_dead_letters'],
  dependencies: [],
  capabilities: [
    { id: 'eb-publish', label: '事件发布', status: 'done', trpcEndpoint: 'eventBus.publish' },
    { id: 'eb-subscribe', label: '事件订阅', status: 'done', trpcEndpoint: 'eventBus.subscribe' },
    { id: 'eb-replay', label: '事件重放', status: 'partial' },
    { id: 'eb-dead-letter', label: '死信队列', status: 'stub' },
    { id: 'eb-kafka', label: 'Kafka 集成', status: 'partial', note: '依赖 feature flag' },
  ],
});

moduleRegistry.register({
  id: 'saga',
  label: 'Saga 编排',
  icon: '🔄',
  description: '分布式事务 Saga 模式、补偿逻辑、状态机',
  category: 'infra',
  domain: 'infra',
  version: '1.0.0',
  trpcRouter: 'saga',
  dbTableCount: 3,
  dbTables: ['sagas', 'saga_steps', 'saga_logs'],
  dependencies: ['eventBus', 'outbox'],
  capabilities: [
    { id: 'saga-define', label: 'Saga 定义', status: 'done', trpcEndpoint: 'saga.list' },
    { id: 'saga-execute', label: 'Saga 执行', status: 'partial' },
    { id: 'saga-compensate', label: '补偿逻辑', status: 'stub' },
    { id: 'saga-monitor', label: '状态监控', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'outbox',
  label: 'Outbox 模式',
  icon: '📤',
  description: '事务性消息发送、可靠投递保证',
  category: 'infra',
  domain: 'infra',
  version: '1.0.0',
  trpcRouter: 'outbox',
  dbTableCount: 2,
  dbTables: ['outbox_messages', 'outbox_processed'],
  dependencies: ['eventBus'],
  capabilities: [
    { id: 'outbox-send', label: '消息发送', status: 'done', trpcEndpoint: 'outbox.send' },
    { id: 'outbox-relay', label: '消息中继', status: 'partial' },
    { id: 'outbox-retry', label: '失败重试', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'deduplication',
  label: '消息去重',
  icon: '🔂',
  description: '幂等性保证、消息去重、布隆过滤器',
  category: 'infra',
  domain: 'infra',
  version: '1.0.0',
  trpcRouter: 'deduplication',
  dbTableCount: 1,
  dbTables: ['dedup_records'],
  dependencies: ['eventBus'],
  capabilities: [
    { id: 'dedup-check', label: '去重检查', status: 'done', trpcEndpoint: 'deduplication.check' },
    { id: 'dedup-bloom', label: '布隆过滤器', status: 'stub' },
  ],
});

moduleRegistry.register({
  id: 'adaptiveSampling',
  label: '自适应采样',
  icon: '📉',
  description: '动态采样率调整、数据压缩、带宽优化',
  category: 'infra',
  domain: 'infra',
  version: '0.5.0',
  trpcRouter: 'adaptiveSampling',
  dbTableCount: 1,
  dbTables: ['sampling_configs'],
  dependencies: ['device', 'monitoring'],
  capabilities: [
    { id: 'as-config', label: '采样配置', status: 'done', trpcEndpoint: 'adaptiveSampling.getConfig' },
    { id: 'as-dynamic', label: '动态调整', status: 'stub' },
    { id: 'as-compression', label: '数据压缩', status: 'planned' },
  ],
});

// ── 额外模块（跨域） ──

moduleRegistry.register({
  id: 'microservice',
  label: '微服务管理',
  icon: '🐳',
  description: 'Docker 容器管理、服务发现、断路器、Prometheus',
  category: 'infra',
  domain: 'infra',
  version: '1.0.0',
  trpcRouter: 'microservice',
  frontendRoute: '/settings/status/microservice',
  dbTableCount: 2,
  dbTables: ['microservices', 'service_dependencies'],
  dependencies: ['monitoring'],
  capabilities: [
    { id: 'ms-discovery', label: '服务发现', status: 'done', trpcEndpoint: 'microservice.list' },
    { id: 'ms-circuit-breaker', label: '断路器', status: 'done' },
    { id: 'ms-docker', label: 'Docker 管理', status: 'partial', note: '依赖 Docker daemon' },
    { id: 'ms-prometheus', label: 'Prometheus 集成', status: 'done' },
  ],
});

moduleRegistry.register({
  id: 'database',
  label: '数据库管理',
  icon: '🗄️',
  description: '数据库连接管理、Schema 浏览、SQL 执行、读写分离',
  category: 'infra',
  domain: 'infra',
  version: '1.5.0',
  trpcRouter: 'database',
  frontendRoute: '/settings/design/workbench',
  dbTableCount: 0,
  dependencies: [],
  capabilities: [
    { id: 'db-connection', label: '连接管理', status: 'done', trpcEndpoint: 'database.getConnections' },
    { id: 'db-schema', label: 'Schema 浏览', status: 'done' },
    { id: 'db-sql', label: 'SQL 执行', status: 'done' },
    { id: 'db-read-replica', label: '读写分离', status: 'partial' },
    { id: 'db-migration', label: '迁移管理', status: 'planned' },
  ],
});

// ============ 启动日志 ============
log.info(`[ModuleRegistry] Initialized with ${moduleRegistry.size} modules across ${DOMAIN_CATEGORIES.length} domains`);

const overall = moduleRegistry.getOverallCompleteness();
log.info(`[ModuleRegistry] Overall completeness: ${overall.percentage}% (${overall.done} done, ${overall.partial} partial, ${overall.stub} stub, ${overall.planned} planned out of ${overall.total} capabilities)`);
