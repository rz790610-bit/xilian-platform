/**
 * ============================================================================
 * 插件引擎注册中心
 * ============================================================================
 * 
 * 职责：
 *   1. 管理平台支持的插件类型（协议适配、算法、可视化、存储等）
 *   2. 定义每种插件类型的能力声明、配置 Schema、生命周期钩子
 *   3. 支持运行时动态注册新插件类型
 *   4. 自动同步到前端插件管理界面
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';

// ============ 插件能力声明 ============

export interface PluginCapability {
  /** 能力标识 */
  id: string;
  /** 能力名称 */
  label: string;
  /** 能力描述 */
  description: string;
}

// ============ 插件配置字段 ============

export interface PluginConfigField {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'password' | 'url' | 'file';
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  group?: string;
}

// ============ 插件类型注册项 ============

export interface PluginTypeRegistryItem extends RegistryItemMeta {
  /** 插件类型代码 */
  id: string;
  /** 支持的能力列表 */
  capabilities: PluginCapability[];
  /** 配置字段定义 */
  configFields: PluginConfigField[];
  /** 生命周期钩子 */
  lifecycle: {
    /** 是否支持热重载 */
    hotReload: boolean;
    /** 是否需要初始化 */
    requiresInit: boolean;
    /** 是否支持健康检查 */
    healthCheck: boolean;
    /** 是否支持优雅停止 */
    gracefulStop: boolean;
  };
  /** 资源限制 */
  resourceLimits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
    maxInstances?: number;
    timeoutMs?: number;
  };
  /** 依赖的平台服务 */
  dependencies?: string[];
  /** 示例代码模板 */
  templateCode?: string;
}

// ============ 插件分类 ============

const PLUGIN_CATEGORIES: CategoryMeta[] = [
  { id: 'connector', label: '连接器', icon: '🔌', order: 1, description: '协议适配和数据源连接', color: '#3B82F6' },
  { id: 'processor', label: '处理器', icon: '⚙️', order: 2, description: '数据处理和算法插件', color: '#10B981' },
  { id: 'visualization', label: '可视化', icon: '📊', order: 3, description: '图表和仪表盘组件', color: '#8B5CF6' },
  { id: 'integration', label: '集成', icon: '🔗', order: 4, description: '第三方系统集成', color: '#F59E0B' },
  { id: 'utility', label: '工具', icon: '🛠️', order: 5, description: '通用工具和辅助功能', color: '#64748B' },
];

// ============ 内置插件类型定义 ============

const BUILTIN_PLUGIN_TYPES: PluginTypeRegistryItem[] = [
  {
    id: 'protocol', label: '协议适配插件', icon: '🔌', description: '扩展平台支持的通信协议（如自定义工业协议、私有 API）',
    category: 'connector', order: 1,
    tags: ['protocol', 'adapter', 'connector', 'iot'],
    capabilities: [
      { id: 'connect', label: '连接管理', description: '建立和管理与外部系统的连接' },
      { id: 'discover', label: '资源发现', description: '自动发现可用的数据资源' },
      { id: 'subscribe', label: '数据订阅', description: '实时订阅数据变更' },
      { id: 'write', label: '数据写入', description: '向外部系统写入数据' },
    ],
    configFields: [
      { name: 'protocolName', label: '协议名称', type: 'string', required: true, placeholder: 'my-custom-protocol' },
      { name: 'connectionClass', label: '连接类入口', type: 'string', required: true, placeholder: 'MyProtocolAdapter' },
      { name: 'defaultPort', label: '默认端口', type: 'number', placeholder: '8080' },
      { name: 'supportsTLS', label: '支持 TLS', type: 'boolean', default: false },
      { name: 'authMethods', label: '认证方式', type: 'select', options: [
        { value: 'none', label: '无认证' }, { value: 'basic', label: 'Basic Auth' },
        { value: 'token', label: 'Token' }, { value: 'certificate', label: '证书' },
      ]},
    ],
    lifecycle: { hotReload: false, requiresInit: true, healthCheck: true, gracefulStop: true },
    resourceLimits: { maxMemoryMB: 256, maxInstances: 10, timeoutMs: 30000 },
    dependencies: ['access-layer'],
  },
  {
    id: 'algorithm', label: '算法插件', icon: '🧮', description: '自定义数据处理算法（异常检测、预测、分类等）',
    category: 'processor', order: 2,
    tags: ['algorithm', 'ml', 'processing', 'analytics'],
    capabilities: [
      { id: 'train', label: '模型训练', description: '支持在线/离线模型训练' },
      { id: 'predict', label: '推理预测', description: '基于训练模型进行预测' },
      { id: 'evaluate', label: '模型评估', description: '评估模型性能指标' },
      { id: 'explain', label: '可解释性', description: '提供预测结果的解释' },
    ],
    configFields: [
      { name: 'algorithmType', label: '算法类型', type: 'select', required: true, options: [
        { value: 'classification', label: '分类' }, { value: 'regression', label: '回归' },
        { value: 'clustering', label: '聚类' }, { value: 'anomaly', label: '异常检测' },
        { value: 'timeseries', label: '时序预测' }, { value: 'nlp', label: 'NLP' },
        { value: 'custom', label: '自定义' },
      ]},
      { name: 'framework', label: '运行框架', type: 'select', default: 'onnx', options: [
        { value: 'onnx', label: 'ONNX Runtime' }, { value: 'tensorflow', label: 'TensorFlow' },
        { value: 'pytorch', label: 'PyTorch' }, { value: 'sklearn', label: 'Scikit-learn' },
        { value: 'custom', label: '自定义' },
      ]},
      { name: 'modelPath', label: '模型文件路径', type: 'file', placeholder: '/models/my_model.onnx' },
      { name: 'batchSize', label: '批处理大小', type: 'number', default: 32 },
      { name: 'gpuEnabled', label: '启用 GPU', type: 'boolean', default: false },
    ],
    lifecycle: { hotReload: true, requiresInit: true, healthCheck: true, gracefulStop: true },
    resourceLimits: { maxMemoryMB: 2048, maxCpuPercent: 80, maxInstances: 5, timeoutMs: 60000 },
    dependencies: ['pipeline-engine'],
  },
  {
    id: 'visualization', label: '可视化插件', icon: '📊', description: '自定义图表组件和仪表盘面板',
    category: 'visualization', order: 3,
    tags: ['chart', 'dashboard', 'visualization', 'ui'],
    capabilities: [
      { id: 'render', label: '图表渲染', description: '渲染自定义图表类型' },
      { id: 'interact', label: '交互控制', description: '支持缩放、过滤等交互' },
      { id: 'export', label: '导出', description: '支持导出为图片/PDF' },
      { id: 'realtime', label: '实时更新', description: '支持 WebSocket 实时数据推送' },
    ],
    configFields: [
      { name: 'chartType', label: '图表类型', type: 'string', required: true, placeholder: 'my-custom-chart' },
      { name: 'renderer', label: '渲染引擎', type: 'select', default: 'echarts', options: [
        { value: 'echarts', label: 'ECharts' }, { value: 'd3', label: 'D3.js' },
        { value: 'plotly', label: 'Plotly' }, { value: 'custom', label: '自定义 Canvas/SVG' },
      ]},
      { name: 'componentEntry', label: '组件入口', type: 'string', required: true, placeholder: 'MyChart.tsx' },
      { name: 'defaultWidth', label: '默认宽度', type: 'number', default: 400 },
      { name: 'defaultHeight', label: '默认高度', type: 'number', default: 300 },
    ],
    lifecycle: { hotReload: true, requiresInit: false, healthCheck: false, gracefulStop: false },
    resourceLimits: { maxMemoryMB: 128, maxInstances: 50 },
    dependencies: [],
  },
  {
    id: 'storage', label: '存储插件', icon: '💾', description: '扩展平台支持的存储后端（自定义文件系统、云存储）',
    category: 'connector', order: 4,
    tags: ['storage', 'filesystem', 'cloud', 's3'],
    capabilities: [
      { id: 'read', label: '读取', description: '从存储后端读取数据' },
      { id: 'write', label: '写入', description: '向存储后端写入数据' },
      { id: 'list', label: '列举', description: '列举存储中的对象' },
      { id: 'delete', label: '删除', description: '删除存储中的对象' },
    ],
    configFields: [
      { name: 'storageType', label: '存储类型', type: 'select', required: true, options: [
        { value: 'local', label: '本地文件系统' }, { value: 's3', label: 'S3 兼容' },
        { value: 'azure_blob', label: 'Azure Blob' }, { value: 'gcs', label: 'Google Cloud Storage' },
        { value: 'hdfs', label: 'HDFS' }, { value: 'custom', label: '自定义' },
      ]},
      { name: 'endpoint', label: '服务端点', type: 'url', placeholder: 'https://storage.example.com' },
      { name: 'accessKey', label: 'Access Key', type: 'password' },
      { name: 'secretKey', label: 'Secret Key', type: 'password' },
      { name: 'region', label: '区域', type: 'string', placeholder: 'us-east-1' },
    ],
    lifecycle: { hotReload: false, requiresInit: true, healthCheck: true, gracefulStop: true },
    resourceLimits: { maxMemoryMB: 512, maxInstances: 10, timeoutMs: 30000 },
    dependencies: ['access-layer'],
  },
  {
    id: 'notification', label: '通知插件', icon: '🔔', description: '扩展告警通知渠道（自定义 Webhook、企业 IM）',
    category: 'integration', order: 5,
    tags: ['notification', 'alert', 'webhook', 'im'],
    capabilities: [
      { id: 'send', label: '发送通知', description: '向指定渠道发送通知' },
      { id: 'template', label: '模板管理', description: '管理通知消息模板' },
      { id: 'batch', label: '批量发送', description: '支持批量通知' },
    ],
    configFields: [
      { name: 'channel', label: '通知渠道', type: 'select', required: true, options: [
        { value: 'webhook', label: 'Webhook' }, { value: 'email', label: '邮件 (SMTP)' },
        { value: 'dingtalk', label: '钉钉' }, { value: 'feishu', label: '飞书' },
        { value: 'wechat', label: '企业微信' }, { value: 'slack', label: 'Slack' },
        { value: 'telegram', label: 'Telegram' }, { value: 'custom', label: '自定义' },
      ]},
      { name: 'webhookUrl', label: 'Webhook URL', type: 'url', placeholder: 'https://hooks.example.com/...' },
      { name: 'retryCount', label: '重试次数', type: 'number', default: 3 },
      { name: 'timeoutMs', label: '超时(ms)', type: 'number', default: 10000 },
    ],
    lifecycle: { hotReload: true, requiresInit: false, healthCheck: true, gracefulStop: false },
    resourceLimits: { maxInstances: 20, timeoutMs: 10000 },
    dependencies: [],
  },
  {
    id: 'auth', label: '认证插件', icon: '🔐', description: '扩展平台认证方式（LDAP、OAuth2、SAML）',
    category: 'integration', order: 6,
    tags: ['auth', 'ldap', 'oauth', 'saml', 'sso'],
    capabilities: [
      { id: 'authenticate', label: '身份认证', description: '验证用户身份' },
      { id: 'authorize', label: '权限校验', description: '检查用户权限' },
      { id: 'sync', label: '用户同步', description: '从外部系统同步用户信息' },
    ],
    configFields: [
      { name: 'authType', label: '认证类型', type: 'select', required: true, options: [
        { value: 'ldap', label: 'LDAP / Active Directory' }, { value: 'oauth2', label: 'OAuth 2.0' },
        { value: 'saml', label: 'SAML 2.0' }, { value: 'oidc', label: 'OpenID Connect' },
        { value: 'custom', label: '自定义' },
      ]},
      { name: 'serverUrl', label: '服务器地址', type: 'url', required: true },
      { name: 'clientId', label: 'Client ID', type: 'string' },
      { name: 'clientSecret', label: 'Client Secret', type: 'password' },
      { name: 'baseDN', label: 'Base DN', type: 'string', placeholder: 'dc=example,dc=com', group: 'LDAP' },
      { name: 'userFilter', label: '用户过滤器', type: 'string', placeholder: '(uid={{username}})', group: 'LDAP' },
    ],
    lifecycle: { hotReload: false, requiresInit: true, healthCheck: true, gracefulStop: true },
    resourceLimits: { maxInstances: 3, timeoutMs: 15000 },
    dependencies: ['user-service'],
  },
  {
    id: 'utility', label: '工具插件', icon: '🛠️', description: '通用工具（数据格式转换、加解密、压缩等）',
    category: 'utility', order: 7,
    tags: ['utility', 'tool', 'converter', 'crypto'],
    capabilities: [
      { id: 'transform', label: '数据转换', description: '格式转换和编码' },
      { id: 'encrypt', label: '加解密', description: '数据加密和解密' },
      { id: 'compress', label: '压缩', description: '数据压缩和解压' },
      { id: 'validate', label: '校验', description: '数据格式校验' },
    ],
    configFields: [
      { name: 'utilityType', label: '工具类型', type: 'select', required: true, options: [
        { value: 'format_converter', label: '格式转换' }, { value: 'crypto', label: '加解密' },
        { value: 'compress', label: '压缩/解压' }, { value: 'validator', label: '数据校验' },
        { value: 'scheduler', label: '定时任务' }, { value: 'custom', label: '自定义' },
      ]},
      { name: 'entryFunction', label: '入口函数', type: 'string', required: true, placeholder: 'process' },
    ],
    lifecycle: { hotReload: true, requiresInit: false, healthCheck: false, gracefulStop: false },
    resourceLimits: { maxMemoryMB: 128, maxInstances: 100 },
    dependencies: [],
  },
];

// ============ 创建并初始化注册中心实例 ============

class PluginTypeRegistry extends BaseRegistry<PluginTypeRegistryItem> {
  constructor() {
    super('PluginTypeRegistry');
    this.registerCategories(PLUGIN_CATEGORIES);
    this.registerAll(BUILTIN_PLUGIN_TYPES);
  }

  /** 获取插件类型的能力列表 */
  getCapabilities(pluginTypeId: string): PluginCapability[] {
    return this.get(pluginTypeId)?.capabilities || [];
  }

  /** 获取插件类型的配置 Schema */
  getConfigSchema(pluginTypeId: string): PluginConfigField[] | null {
    const item = this.get(pluginTypeId);
    return item ? item.configFields : null;
  }

  /** 检查插件类型是否支持某个能力 */
  hasCapability(pluginTypeId: string, capabilityId: string): boolean {
    const caps = this.getCapabilities(pluginTypeId);
    return caps.some(c => c.id === capabilityId);
  }

  /** 按能力搜索插件类型 */
  findByCapability(capabilityId: string): PluginTypeRegistryItem[] {
    return this.listItems().filter(item =>
      item.capabilities.some(c => c.id === capabilityId)
    );
  }
}

// ============ 导出单例 ============

export const pluginTypeRegistry = new PluginTypeRegistry();
