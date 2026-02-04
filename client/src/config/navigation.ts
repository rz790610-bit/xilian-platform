import type { NavItem } from '@/types';

export const navigationConfig: NavItem[] = [
  {
    id: 'dashboard',
    label: '首页概览',
    icon: '🏠',
    path: '/dashboard'
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
    id: 'pipeline',
    label: 'Pipeline',
    icon: '🔗',
    path: '/pipeline'
  },
  {
    id: 'device-management',
    label: '设备管理',
    icon: '🔧',
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
    icon: '📊',
    children: [
      { id: 'data-access', label: '数据接入', icon: '🔌', path: '/data/access' },
      { id: 'data-standard', label: '数据标准化', icon: '📏', path: '/data/standard' },
      { id: 'data-manage', label: '数据管理', icon: '📁', path: '/data/manage' },
      { id: 'data-label', label: '数据标注', icon: '🏷️', path: '/data/label' },
      { id: 'data-insight', label: '数据洞察', icon: '📈', path: '/data/insight' }
    ]
  },
  {
    id: 'model-center',
    label: '模型中心',
    icon: '🧠',
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
    id: 'security-center',
    label: '安全中心',
    icon: '🛡️',
    children: [
      { id: 'security-falco', label: 'Falco 监控', icon: '🔍', path: '/security/falco' },
      { id: 'security-scanner', label: '安全扫描', icon: '🔬', path: '/security/scanner' },
      { id: 'security-vault', label: '密钥管理', icon: '🔐', path: '/security/vault' },
      { id: 'security-pki', label: 'PKI 证书', icon: '📜', path: '/security/pki' }
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
  {
    id: 'microservices',
    label: '微服务',
    icon: '🔗',
    children: [
      { id: 'service-ingestion', label: '数据摄入', icon: '📥', path: '/services/ingestion' },
      { id: 'service-aggregator', label: '实时聚合', icon: '📊', path: '/services/aggregator' },
      { id: 'service-dispatcher', label: '事件分发', icon: '📤', path: '/services/dispatcher' },
      { id: 'service-performance', label: '性能模块', icon: '⚡', path: '/services/performance' }
    ]
  },
  {
    id: 'settings',
    label: '系统设置',
    icon: '⚙️',
    children: [
      { id: 'settings-resources', label: '资源总览', icon: '📊', path: '/settings/resources' },
      { id: 'settings-databases', label: '数据库管理', icon: '🗄️', path: '/settings/databases' },
      { id: 'settings-plugins', label: '插件管理', icon: '🧩', path: '/settings/plugins' },
      { id: 'settings-engines', label: '引擎模块', icon: '🔧', path: '/settings/engines' },
      { id: 'settings-topology', label: '系统拓扑', icon: '📊', path: '/settings/topology' },
      { id: 'settings-datastream', label: '数据流监控', icon: '⚡', path: '/settings/datastream' },
      { id: 'settings-kafka', label: 'Kafka 监控', icon: '📡', path: '/settings/kafka' },
      { id: 'settings-infrastructure', label: '基础设施', icon: '🏛️', path: '/settings/infrastructure' },
      { id: 'settings-observability', label: '可观测性', icon: '📊', path: '/settings/observability' },
      { id: 'settings-ops', label: '运维管理', icon: '🛠️', path: '/settings/ops' },
      { id: 'settings-models', label: '模型库', icon: '📦', path: '/settings/models' }
    ]
  }
];

export const quickLinks = [
  { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents' },
  { id: 'pipeline', label: 'Pipeline', icon: '🔗', path: '/pipeline' },
  { id: 'ai-chat', label: 'AI对话', icon: '💬', path: '/chat' },
  { id: 'docs', label: '文档管理', icon: '📄', path: '/docs' }
];
