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

  // ━━━ 应用平台 ━━━
  {
    id: 'app-platform',
    label: '应用平台',
    icon: '📱',
    section: '应用平台',
    children: [
      { id: 'app-health', label: '设备健康', icon: '💚', path: '/app' },
      { id: 'app-diagnosis', label: '智能诊断', icon: '🩺', path: '/app/diagnosis' },
      { id: 'app-alerts', label: '预警处置', icon: '🔔', path: '/app/alerts' },
    ]
  },

  // ━━━ 资产与数据 ━━━

  {
    id: 'knowledge',
    label: '知识库',
    icon: '📚',
    section: '资产与数据',
    children: [
      { id: 'knowledge-manager', label: '知识管理', icon: '📁', path: '/knowledge/manager' },
      { id: 'knowledge-graph', label: '知识图谱', icon: '🕸️', path: '/knowledge/graph' },
      { id: 'knowledge-vectors', label: '向量管理', icon: '📊', path: '/knowledge/vectors' },
      { id: 'knowledge-federated', label: '联邦知识蒸馏', icon: '🌐', path: '/knowledge/federated' },
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
      { id: 'data-insight', label: '数据洞察', icon: '📈', path: '/data/insight' },
      { id: 'data-clickhouse', label: '时序数据查询', icon: '📊', path: '/data/clickhouse' },
      { id: 'data-pipeline', label: '数据管道', icon: '🔗', path: '/data/pipeline' },
    ]
  },
  {
    id: 'database-module',
    label: '数据库',
    icon: '🗄️',
    children: [
      { id: 'db-overview', label: '数据库总览', icon: '📊', path: '/database/overview' },
      { id: 'db-config', label: '基础配置', icon: '⚙️', path: '/database/config' },
      { id: 'db-slices', label: '数据切片', icon: '✂️', path: '/database/slices' },
      { id: 'db-clean', label: '数据清洗', icon: '🧹', path: '/database/clean' },
      { id: 'db-events', label: '事件溯源', icon: '📜', path: '/database/events' },
      { id: 'db-storage', label: '存储状态', icon: '💾', path: '/database/storage' },
    ]
  },

  {
    id: 'equipment',
    label: '设备资产',
    icon: '📡',
    children: [
      { id: 'equipment-sensors', label: '传感器管理', icon: '📡', path: '/equipment/sensors' },
    ]
  },

  // ━━━ 基础设置 ━━━
  {
    id: 'basic-settings',
    label: '基础设置',
    icon: '⚙️',
    section: '基础设置',
    children: [
      { id: 'basic-dict', label: '字典管理', icon: '📖', path: '/basic/dictionary' },
      { id: 'basic-org', label: '组织机构', icon: '🏢', path: '/basic/organization' },
      { id: 'basic-device', label: '设备管理', icon: '⚙️', path: '/basic/device' },
      { id: 'basic-mechanism', label: '机构管理', icon: '🔧', path: '/basic/mechanism' },
      { id: 'basic-component', label: '部件管理', icon: '📦', path: '/basic/component' },
      { id: 'basic-parts', label: '零件库', icon: '🔩', path: '/basic/parts' },
      { id: 'basic-encoding', label: '编码管理', icon: '#️⃣', path: '/settings/encoding' },
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
      { id: 'algo-distillation', label: '高级知识蒸馏', icon: '🧪', path: '/algorithm/distillation' },
      { id: 'algo-condition-norm', label: '工况归一化', icon: '🎯', path: '/algorithm/condition-normalizer' },
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
      { id: 'fusion-diagnosis', label: '融合诊断', icon: '🧠', path: '/diagnosis/fusion' },
      { id: 'diag-analysis', label: '诊断分析', icon: '🔍', path: '/diagnosis/analysis' },
      { id: 'diag-report', label: '诊断报告', icon: '📝', path: '/diagnosis/report' },
      { id: 'diag-grok', label: 'Grok AI诊断', icon: '🤖', path: '/diagnosis/grok' },
    ]
  },
  {
    id: 'ai-value',
    label: 'AI 价值发挥',
    icon: '🤖',
    children: [
      { id: 'ai-diag-enhancer', label: '诊断增强', icon: '🔬', path: '/ai/diagnostic-enhancer' },
      { id: 'ai-nl-interaction', label: '自然语言交互', icon: '💬', path: '/ai/nl-interaction' },
      { id: 'ai-tech-intel', label: '技术情报', icon: '📡', path: '/ai/tech-intelligence' },
      { id: 'ai-evolution-lab', label: '进化实验室', icon: '🧪', path: '/ai/evolution-lab' },
    ]
  },
  {
    id: 'evaluation',
    label: '评估优化',
    icon: '📊',
    children: [
      { id: 'eval-dashboard', label: '评估仪表盘', icon: '📈', path: '/evaluation/dashboard' },
    ]
  },
  {
    id: 'evolution',
    label: '进化引擎',
    icon: '🔄',
    section: '自主进化',
    children: [
      { id: 'evolution-dashboard', label: '进化总览', icon: '📊', path: '/evolution/dashboard' },
      { id: 'shadow-fleet', label: '影子车队', icon: '👻', path: '/evolution/shadow' },
      { id: 'champion-challenger', label: '冠军挑战者', icon: '🏆', path: '/evolution/champion' },
      { id: 'canary-deploy', label: '金丝雀部署', icon: '🐦', path: '/evolution/canary' },
      { id: 'ota-fleet', label: 'OTA 车队', icon: '🚗', path: '/evolution/ota' },
      { id: 'flywheel-report', label: '飞轮报告', icon: '⚡', path: '/evolution/flywheel' },
      { id: 'domain-router', label: '领域路由', icon: '🛣️', path: '/evolution/domain-router' },
      { id: 'feedback-center', label: '反馈中心', icon: '📥', path: '/evolution/feedback' },
      { id: 'active-learning', label: '主动学习', icon: '🎯', path: '/evolution/learning' },
      { id: 'auto-train', label: '自动训练', icon: '🔧', path: '/evolution/train' },
      { id: 'evolution-board', label: '进化看板', icon: '📋', path: '/evolution/board' },
      { id: 'fsd-intervention', label: 'FSD 干预', icon: '🎮', path: '/evolution/fsd' },
      { id: 'knowledge-crystal', label: '知识结晶', icon: '💎', path: '/evolution/crystals' },
      { id: 'evolution-observability', label: '可观测性中心', icon: '📡', path: '/evolution/observability' },
      { id: 'evolution-self-healing', label: '自愈与自优化', icon: '🛡️', path: '/evolution/self-healing' },
      { id: 'evolution-world-model', label: '神经世界模型', icon: '🧠', path: '/evolution/world-model' },
      { id: 'evolution-model-comparison', label: '多模型对比', icon: '⚖️', path: '/evolution/model-comparison' },
      { id: 'evolution-adaptive-params', label: '自适应参数推荐', icon: '🎯', path: '/evolution/adaptive-params' },
      { id: 'evolution-control-center', label: '总控中心', icon: '🎛️', path: '/evolution/control-center' }
    ]
  },


  // ━━━ 深度进化（v5.0） ━━━
  {
    id: 'v5-guardrail-console',
    label: '护栏控制台',
    icon: '🛡️',
    path: '/v5/guardrail',
    section: '深度进化',
  },
  {
    id: 'digital-twin',
    label: '数字孪生',
    icon: '🔮',
    children: [
      { id: 'twin-status', label: '设备状态', icon: '📊', path: '/digital-twin' },
      { id: 'twin-simulation', label: '仿真推演', icon: '🎲', path: '/digital-twin/simulation' },
      { id: 'twin-replay', label: '历史回放', icon: '⏪', path: '/digital-twin/replay' },
      { id: 'twin-worldmodel', label: '世界模型', icon: '🌐', path: '/digital-twin/worldmodel' },
    ]
  },
  {
    id: 'v5-perception-enhance',
    label: '感知层增强',
    icon: '📡',
    children: [
      { id: 'v5-bpa-builder', label: 'BPA 构建器', icon: '🎯', path: '/v5/perception/bpa-builder' },
      { id: 'v5-state-vector', label: '状态向量合成器', icon: '📐', path: '/v5/perception/state-vector' },
      { id: 'v5-ds-fusion', label: 'DS 融合引擎', icon: '🔀', path: '/v5/perception/ds-fusion' },
      { id: 'v5-persistence', label: '持久化服务', icon: '💾', path: '/v5/perception/persistence' },
    ]
  },
  {
    id: 'v5-cognition-reasoning',
    label: '认知推理引擎',
    icon: '⚡',
    children: [
      { id: 'v5-causal-graph', label: '因果图', icon: '🕸️', path: '/v5/cognition/causal-graph' },
      { id: 'v5-experience-pool', label: '经验池', icon: '🧠', path: '/v5/cognition/experience-pool' },
      { id: 'v5-physics-verifier', label: '物理验证器', icon: '⚖️', path: '/v5/cognition/physics-verifier' },
      { id: 'v5-orchestrator', label: '混合编排器', icon: '🎼', path: '/v5/cognition/orchestrator' },
      { id: 'v5-feedback-loop', label: '知识反馈环', icon: '🔄', path: '/v5/cognition/feedback-loop' },
      { id: 'v5-observability', label: '可观测性', icon: '📊', path: '/v5/cognition/observability' },
    ]
  },
  {
    id: 'v5-cognitive',
    label: '认知中枢',
    icon: '🧠',
    children: [
      { id: 'v5-cognitive-dashboard', label: '认知仪表盘', icon: '📊', path: '/v5/cognitive' },
      { id: 'v5-perception-monitor', label: '感知层监控', icon: '📡', path: '/v5/perception' },
      { id: 'v5-knowledge-explorer', label: '知识探索器', icon: '🕸️', path: '/v5/knowledge' },
      { id: 'v5-cognition-engine', label: '认知引擎', icon: '⚡', path: '/v5/engine' },
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
    id: 'status-monitor',
    label: '状态监控',
    icon: '📡',
    children: [
      { id: 'observability-hub', label: '统一观测中枢', icon: '🔭', path: '/monitoring/hub' },
      { id: 'observability-detail', label: '可观测性详情', icon: '📡', path: '/monitoring/observability' },
      { id: 'status-infrastructure', label: '基础设施', icon: '🏛️', path: '/settings/config/infrastructure' },
      { id: 'status-access-layer', label: '接入层管理', icon: '🔌', path: '/settings/config/access-layer' },
      { id: 'status-topology', label: '系统拓扑', icon: '📊', path: '/settings/status/topology' },
      { id: 'status-gateway', label: '网关概览', icon: '🛣️', path: '/settings/gateway/dashboard' },
      { id: 'status-plugin-sandbox', label: '沙箱概览', icon: '🧩', path: '/settings/plugin-sandbox' },
      { id: 'status-microservices', label: '微服务监控', icon: '🔗', path: '/settings/status/microservices' },
      { id: 'status-performance', label: '性能总览', icon: '🚀', path: '/settings/status/performance' },
      { id: 'status-kafka', label: 'Kafka 监控', icon: '📡', path: '/settings/config/kafka' },
      { id: 'status-clickhouse', label: 'ClickHouse 监控', icon: '📊', path: '/monitoring/clickhouse' },
      { id: 'status-datastream', label: '数据流监控', icon: '⚡', path: '/settings/design/datastream' },
      { id: 'status-diagnostic', label: '平台诊断', icon: '🧠', path: '/settings/status/diagnostic' }
    ]
  },
  {
    id: 'perception-config',
    label: '感知配置',
    icon: '🎯',
    children: [
      { id: 'perception-condition', label: '工况归一化', icon: '🎯', path: '/perception/condition' },
    ]
  },
  {
    id: 'platform-tools',
    label: '平台工具',
    icon: '🔧',
    children: [
      { id: 'platform-plugins', label: '插件管理', icon: '🧩', path: '/platform/plugins' },
      { id: 'platform-orchestrator', label: '编排调度', icon: '🎼', path: '/platform/orchestrator' },
      { id: 'platform-registry', label: '注册中心', icon: '📋', path: '/platform/registry' },
      { id: 'platform-tooling', label: '工具域', icon: '🔧', path: '/platform/tooling' },
      { id: 'platform-domain', label: '平台域', icon: '🏢', path: '/platform/domain' },
      { id: 'platform-quality', label: '质量看板', icon: '📊', path: '/platform/quality' },
      { id: 'settings-business', label: '业务配置', icon: '⚙️', path: '/settings/business' },
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
