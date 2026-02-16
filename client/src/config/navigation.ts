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
    id: 'data-center',
    label: '数据中心',
    icon: '💾',
    children: [
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
    ]
  },

  // ━━━ 智能引擎 ━━━
  {
    id: 'model-center',
    label: '模型中心',
    icon: '🧠',
    section: '智能引擎',
    children: [
      { id: 'ai-chat', label: 'AI对话', icon: '💬', path: '/chat' },
      { id: 'model-main', label: '模型管理', icon: '🤖', path: '/model/center' },
      { id: 'model-inference', label: '模型推理', icon: '💬', path: '/model/inference' },
      { id: 'model-finetune', label: '模型微调', icon: '🔧', path: '/model/finetune' },
      { id: 'model-eval', label: '模型评估', icon: '📊', path: '/model/eval' },
      { id: 'model-repo', label: '模型仓库', icon: '📦', path: '/model/repo' }
    ]
  },
  {
    id: 'algorithm-library',
    label: '算法库',
    icon: '⚙️',
    children: [
      { id: 'algo-overview', label: '算法总览', icon: '📊', path: '/algorithm/overview' },
      { id: 'algo-mechanical', label: '机械算法', icon: '⚙️', path: '/algorithm/mechanical' },
      { id: 'algo-electrical', label: '电气算法', icon: '⚡', path: '/algorithm/electrical' },
      { id: 'algo-structural', label: '结构算法', icon: '🏗️', path: '/algorithm/structural' },
      { id: 'algo-anomaly', label: '异常检测', icon: '🚨', path: '/algorithm/anomaly' },
      { id: 'algo-optimization', label: '优化算法', icon: '📈', path: '/algorithm/optimization' },
      { id: 'algo-comprehensive', label: '综合算法', icon: '🔗', path: '/algorithm/comprehensive' },
      { id: 'algo-feature', label: '特征提取', icon: '📊', path: '/algorithm/feature' },
      { id: 'algo-agent', label: 'Agent插件', icon: '🤖', path: '/algorithm/agent' },
      { id: 'algo-model', label: '模型迭代', icon: '🔄', path: '/algorithm/model' },
      { id: 'algo-rule', label: '规则自动学习', icon: '📝', path: '/algorithm/rule' },
      { id: 'algo-compose', label: '算法编排', icon: '🧩', path: '/algorithm/compose' },
      { id: 'algo-execution', label: '执行记录', icon: '📋', path: '/algorithm/execution' },
    ]
  },
  {
    id: 'diagnosis',
    label: '智能诊断',
    icon: '🔬',
    children: [
      { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents' },
      { id: 'diag-analysis', label: '诊断分析', icon: '🔍', path: '/diagnosis/analysis' },
      { id: 'diag-report', label: '诊断报告', icon: '📝', path: '/diagnosis/report' },
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


  // ━━━ 平台管理 ━━━
  {
    id: 'design-tools',
    label: '设计工具',
    icon: '🛠️',
    section: '平台管理',
    children: [
      { id: 'design-pipeline', label: 'Pipeline 编排', icon: '🔗', path: '/settings/design/pipeline' },
      { id: 'design-kg-orchestrator', label: '知识图谱编排', icon: '🕸️', path: '/settings/design/kg-orchestrator' },
      { id: 'design-db-workbench', label: '数据库工作台', icon: '🛠️', path: '/settings/design/workbench' }
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
      { id: 'status-microservices', label: '微服务监控', icon: '🔗', path: '/settings/status/microservices' },
      { id: 'status-performance', label: '性能总览', icon: '🚀', path: '/settings/status/performance' },
      { id: 'status-clickhouse', label: 'ClickHouse 监控', icon: '📊', path: '/monitoring/clickhouse' },
      { id: 'status-datastream', label: '数据流监控', icon: '⚡', path: '/settings/design/datastream' },
      { id: 'status-graph-query', label: '图查询优化', icon: '🗂️', path: '/settings/design/graph-query' },
      { id: 'status-mysql', label: 'MySQL 状态', icon: '🐬', path: '/settings/status/mysql' }
    ]
  },
  {
    id: 'security-ops',
    label: '安全运维',
    icon: '🛡️',
    children: [
      { id: 'security-falco', label: '安全中心', icon: '🔍', path: '/settings/security/falco' }
    ]
  },

];

export const quickLinks = [
  { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents' },
  { id: 'pipeline', label: 'Pipeline', icon: '🔗', path: '/settings/design/pipeline' },
  { id: 'ai-chat', label: 'AI对话', icon: '💬', path: '/chat' },
  { id: 'knowledge', label: '知识管理', icon: '📁', path: '/knowledge/manager' }
];
