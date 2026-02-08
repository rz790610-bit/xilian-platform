import type { NavItem } from '@/types';

export const navigationConfig: NavItem[] = [
  // ━━━ 核心业务 ━━━
  {
    id: 'dashboard',
    label: '首页概览',
    icon: '🏠',
    path: '/dashboard',
    section: '核心业务'
  },
  {
    id: 'agents',
    label: '智能体诊断',
    icon: '🤖',
    path: '/agents'
  },
  {
    id: 'ai-chat',
    label: 'AI对话',
    icon: '💬',
    path: '/chat'
  },
  {
    id: 'docs',
    label: '文档中心',
    icon: '📄',
    path: '/docs'
  },

  // ━━━ 资产与数据 ━━━
  {
    id: 'device-management',
    label: '设备管理',
    icon: '🔧',
    section: '资产与数据',
    children: [
      { id: 'device-list', label: '设备列表', icon: '📋', path: '/device/list' },
      { id: 'device-maintenance', label: '维护记录', icon: '🔨', path: '/device/maintenance' },
      { id: 'device-alerts', label: '告警历史', icon: '🚨', path: '/device/alerts' },
      { id: 'device-kpi', label: 'KPI 指标', icon: '📊', path: '/device/kpi' }
    ]
  },
  {
    id: 'knowledge',
    label: '知识库',
    icon: '📚',
    children: [
      { id: 'knowledge-manager', label: '知识管理', icon: '📁', path: '/knowledge/manager' },
      { id: 'knowledge-graph', label: '知识图谱', icon: '🕸️', path: '/knowledge/graph' },
      { id: 'knowledge-vectors', label: '向量管理', icon: '📊', path: '/knowledge/vectors' }
    ]
  },
  {
    id: 'base-data',
    label: '基础数据',
    icon: '📦',
    children: [
      { id: 'base-rules', label: '基础规则配置', icon: '⚙️', path: '/base/rules' },
      { id: 'base-library', label: '基础库', icon: '🗃️', path: '/base/library' }
    ]
  },
  {
    id: 'data-center',
    label: '数据中心',
    icon: '💾',
    children: [
      { id: 'data-access', label: '数据接入', icon: '🔌', path: '/data/access' },
      { id: 'data-standard', label: '数据标准化', icon: '📏', path: '/data/standard' },
      { id: 'data-manage', label: '数据管理', icon: '📁', path: '/data/manage' },
      { id: 'data-label', label: '数据标注', icon: '🏷️', path: '/data/label' },
      { id: 'data-insight', label: '数据洞察', icon: '📈', path: '/data/insight' }
    ]
  },
  {
    id: 'database-module',
    label: '数据库',
    icon: '🗄️',
    children: [
      { id: 'db-overview', label: '数据库总览', icon: '📊', path: '/database/overview' },
      { id: 'db-assets', label: '设备档案', icon: '🏭', path: '/database/assets' },
      { id: 'db-config', label: '基础配置', icon: '⚙️', path: '/database/config' },
      { id: 'db-slices', label: '数据切片', icon: '✂️', path: '/database/slices' },
      { id: 'db-clean', label: '数据清洗', icon: '🧹', path: '/database/clean' },
      { id: 'db-events', label: '事件溯源', icon: '📜', path: '/database/events' },
      { id: 'db-storage', label: '存储状态', icon: '💾', path: '/database/storage' },
      { id: 'db-workbench', label: '数据库工作台', icon: '🛠️', path: '/database/workbench' }
    ]
  },

  // ━━━ 智能引擎 ━━━
  {
    id: 'model-center',
    label: '模型中心',
    icon: '🧠',
    section: '智能引擎',
    children: [
      { id: 'model-main', label: '模型管理', icon: '🤖', path: '/model/center' },
      { id: 'model-inference', label: '模型推理', icon: '💬', path: '/model/inference' },
      { id: 'model-finetune', label: '模型微调', icon: '🔧', path: '/model/finetune' },
      { id: 'model-eval', label: '模型评估', icon: '📊', path: '/model/eval' },
      { id: 'model-repo', label: '模型仓库', icon: '📦', path: '/model/repo' }
    ]
  },
  {
    id: 'diagnosis',
    label: '智能诊断',
    icon: '🔬',
    children: [
      { id: 'diag-analysis', label: '诊断分析', icon: '🔍', path: '/diagnosis/analysis' },
      { id: 'diag-report', label: '诊断报告', icon: '📝', path: '/diagnosis/report' },
      { id: 'knowledge-base', label: '知识库', icon: '📚', path: '/diagnosis/knowledge' }
    ]
  },
  {
    id: 'evolution',
    label: '进化引擎',
    icon: '🔄',
    children: [
      { id: 'feedback-center', label: '反馈中心', icon: '📥', path: '/evolution/feedback' },
      { id: 'active-learning', label: '主动学习', icon: '🎯', path: '/evolution/learning' },
      { id: 'auto-train', label: '自动训练', icon: '⚡', path: '/evolution/train' },
      { id: 'evolution-board', label: '进化看板', icon: '📊', path: '/evolution/board' }
    ]
  },
  {
    id: 'edge-computing',
    label: '边缘计算',
    icon: '🌐',
    children: [
      { id: 'edge-nodes', label: '边缘节点', icon: '📡', path: '/edge/nodes' },
      { id: 'edge-inference', label: '边缘推理', icon: '🧠', path: '/edge/inference' },
      { id: 'edge-gateway', label: '边缘网关', icon: '🚪', path: '/edge/gateway' },
      { id: 'edge-tsn', label: '5G TSN', icon: '📶', path: '/edge/tsn' }
    ]
  },

  // ━━━ 平台管理 ━━━
  {
    id: 'design-tools',
    label: '设计工具',
    icon: '🛠️',
    section: '平台管理',
    children: [
      { id: 'design-pipeline', label: 'Pipeline 编排', icon: '🔗', path: '/settings/design/pipeline' },
      { id: 'design-datastream', label: '数据流监控', icon: '⚡', path: '/settings/design/datastream' },
      { id: 'design-graph-query', label: '图查询优化', icon: '🗂️', path: '/settings/design/graph-query' }
    ]
  },
  {
    id: 'config-center',
    label: '配置中心',
    icon: '⚙️',
    children: [
      { id: 'config-infrastructure', label: '基础设施', icon: '🏛️', path: '/settings/config/infrastructure' },
      { id: 'config-kafka', label: 'Kafka 监控', icon: '📡', path: '/settings/config/kafka' }
    ]
  },
  {
    id: 'status-monitor',
    label: '状态监控',
    icon: '📡',
    children: [
      { id: 'status-topology', label: '系统拓扑', icon: '📊', path: '/settings/status/topology' },
      { id: 'status-observability', label: '可观测性', icon: '👁️', path: '/settings/status/observability' },
      { id: 'status-performance', label: '性能总览', icon: '🚀', path: '/settings/status/performance' }
    ]
  },
  {
    id: 'security-ops',
    label: '安全运维',
    icon: '🛡️',
    children: [
      { id: 'security-ops-dashboard', label: '运维概览', icon: '🛠️', path: '/settings/security/ops' },
      { id: 'security-falco', label: '安全中心', icon: '🔍', path: '/settings/security/falco' }
    ]
  }
];

export const quickLinks = [
  { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents' },
  { id: 'pipeline', label: 'Pipeline', icon: '🔗', path: '/settings/design/pipeline' },
  { id: 'ai-chat', label: 'AI对话', icon: '💬', path: '/chat' },
  { id: 'docs', label: '文档管理', icon: '📄', path: '/docs' }
];
