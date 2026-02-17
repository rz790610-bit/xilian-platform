/**
 * 插件 Manifest 解析与签名验证
 * 
 * 安全策略：
 * - manifest.yaml 必须通过 JSON Schema 校验
 * - 插件包必须携带 SHA256 完整性校验
 * - 可选 RSA 签名验证（生产环境强制）
 * - 权限声明白名单机制
 */
import * as crypto from 'crypto';
import * as path from 'path';
import { EventEmitter } from 'events';

// ==================== 类型定义 ====================

/** 插件权限声明 */
export type PluginPermission =
  | 'storage:read'        // 读取插件专属存储
  | 'storage:write'       // 写入插件专属存储
  | 'network:http'        // HTTP 出站请求
  | 'network:ws'          // WebSocket 连接
  | 'event:subscribe'     // 订阅平台事件
  | 'event:publish'       // 发布平台事件
  | 'data:device:read'    // 读取设备数据
  | 'data:sensor:read'    // 读取传感器数据
  | 'data:alert:read'     // 读取告警数据
  | 'data:alert:write'    // 创建/更新告警
  | 'data:kg:read'        // 读取知识图谱
  | 'data:kg:write'       // 写入知识图谱
  | 'model:inference'     // 调用模型推理
  | 'model:embed'         // 调用向量嵌入
  | 'ui:notification'     // 发送 UI 通知
  | 'ui:widget'           // 注册 UI 组件
  | 'system:config:read'  // 读取系统配置
  | 'system:log';         // 写入系统日志

/** 所有合法权限列表 */
export const ALL_PERMISSIONS: PluginPermission[] = [
  'storage:read', 'storage:write',
  'network:http', 'network:ws',
  'event:subscribe', 'event:publish',
  'data:device:read', 'data:sensor:read',
  'data:alert:read', 'data:alert:write',
  'data:kg:read', 'data:kg:write',
  'model:inference', 'model:embed',
  'ui:notification', 'ui:widget',
  'system:config:read', 'system:log',
];

/** 高风险权限（需要管理员审批） */
export const HIGH_RISK_PERMISSIONS: PluginPermission[] = [
  'data:alert:write', 'data:kg:write',
  'network:http', 'network:ws',
  'system:config:read',
];

/** 资源限制配置 */
export interface ResourceLimits {
  /** 最大内存 (MB) */
  maxMemoryMB: number;
  /** 最大 CPU 时间 (ms) */
  maxCpuTimeMs: number;
  /** 单次执行超时 (ms) */
  executionTimeoutMs: number;
  /** 最大并发执行数 */
  maxConcurrency: number;
  /** 最大存储空间 (MB) */
  maxStorageMB: number;
  /** 最大网络请求数/分钟 */
  maxNetworkRequestsPerMin: number;
  /** 最大事件发布数/分钟 */
  maxEventsPerMin: number;
}

/** 默认资源限制 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemoryMB: 128,
  maxCpuTimeMs: 5000,
  executionTimeoutMs: 30000,
  maxConcurrency: 3,
  maxStorageMB: 50,
  maxNetworkRequestsPerMin: 60,
  maxEventsPerMin: 100,
};

/** 资源限制等级预设 */
export const RESOURCE_LIMIT_PRESETS: Record<string, ResourceLimits> = {
  minimal: {
    maxMemoryMB: 32,
    maxCpuTimeMs: 1000,
    executionTimeoutMs: 5000,
    maxConcurrency: 1,
    maxStorageMB: 10,
    maxNetworkRequestsPerMin: 10,
    maxEventsPerMin: 20,
  },
  standard: DEFAULT_RESOURCE_LIMITS,
  performance: {
    maxMemoryMB: 512,
    maxCpuTimeMs: 30000,
    executionTimeoutMs: 120000,
    maxConcurrency: 10,
    maxStorageMB: 200,
    maxNetworkRequestsPerMin: 300,
    maxEventsPerMin: 500,
  },
  unlimited: {
    maxMemoryMB: 2048,
    maxCpuTimeMs: 0, // 0 = 无限制
    executionTimeoutMs: 0,
    maxConcurrency: 50,
    maxStorageMB: 1024,
    maxNetworkRequestsPerMin: 0,
    maxEventsPerMin: 0,
  },
};

/** 网络策略 */
export interface NetworkPolicy {
  /** 允许的出站域名白名单 */
  allowedHosts: string[];
  /** 允许的出站端口 */
  allowedPorts: number[];
  /** 是否允许访问内网 */
  allowPrivateNetwork: boolean;
  /** 是否允许 DNS 解析 */
  allowDnsResolution: boolean;
}

/** 默认网络策略 */
export const DEFAULT_NETWORK_POLICY: NetworkPolicy = {
  allowedHosts: [],
  allowedPorts: [80, 443],
  allowPrivateNetwork: false,
  allowDnsResolution: true,
};

/** 插件 Manifest 完整定义 */
export interface PluginManifest {
  /** Manifest 版本 */
  manifestVersion: '1.0' | '1.1';
  /** 插件唯一标识 */
  id: string;
  /** 插件名称 */
  name: string;
  /** 插件版本 (semver) */
  version: string;
  /** 插件描述 */
  description: string;
  /** 作者信息 */
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  /** 许可证 */
  license: string;
  /** 插件类型 */
  type: 'source' | 'processor' | 'sink' | 'analyzer' | 'visualizer' | 'integration' | 'utility';
  /** 入口文件（相对于插件根目录） */
  main: string;
  /** 图标路径 */
  icon?: string;
  /** 最低平台版本要求 */
  platformVersion: string;
  /** 依赖的其他插件 */
  dependencies?: Record<string, string>;
  /** 权限声明 */
  permissions: PluginPermission[];
  /** 资源限制等级或自定义配置 */
  resourceLimits?: string | Partial<ResourceLimits>;
  /** 网络策略 */
  networkPolicy?: Partial<NetworkPolicy>;
  /** 配置 Schema（JSON Schema 格式） */
  configSchema?: Record<string, unknown>;
  /** 事件声明 */
  events?: {
    subscribes?: string[];
    publishes?: string[];
  };
  /** UI 扩展点 */
  ui?: {
    widgets?: Array<{
      id: string;
      name: string;
      component: string;
      position: 'dashboard' | 'sidebar' | 'toolbar' | 'detail-panel';
    }>;
    pages?: Array<{
      id: string;
      name: string;
      path: string;
      component: string;
    }>;
  };
  /** 签名信息 */
  signature?: {
    algorithm: 'sha256-rsa' | 'sha256-ecdsa';
    publicKey: string;
    digest: string;
    signedAt: string;
  };
}

// ==================== Manifest 校验 ====================

/** 校验错误 */
export interface ManifestValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/** 校验结果 */
export interface ManifestValidationResult {
  valid: boolean;
  errors: ManifestValidationError[];
  warnings: ManifestValidationError[];
  manifest?: PluginManifest;
}

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const PLUGIN_ID_REGEX = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

/**
 * 校验 Manifest 对象
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: ManifestValidationError[] = [];
  const warnings: ManifestValidationError[] = [];

  if (!raw || typeof raw !== 'object') {
    errors.push({ field: 'root', message: 'Manifest 必须是一个对象', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  const m = raw as Record<string, unknown>;

  // manifestVersion
  if (!m.manifestVersion || !['1.0', '1.1'].includes(m.manifestVersion as string)) {
    errors.push({ field: 'manifestVersion', message: '必须为 "1.0" 或 "1.1"', severity: 'error' });
  }

  // id
  if (!m.id || typeof m.id !== 'string') {
    errors.push({ field: 'id', message: '插件 ID 不能为空', severity: 'error' });
  } else if (!PLUGIN_ID_REGEX.test(m.id)) {
    errors.push({ field: 'id', message: '插件 ID 格式无效，应为 lowercase.dot.separated', severity: 'error' });
  }

  // name
  if (!m.name || typeof m.name !== 'string' || m.name.length < 2 || m.name.length > 100) {
    errors.push({ field: 'name', message: '插件名称必须为 2-100 个字符', severity: 'error' });
  }

  // version
  if (!m.version || typeof m.version !== 'string' || !SEMVER_REGEX.test(m.version)) {
    errors.push({ field: 'version', message: '版本号必须符合 semver 规范', severity: 'error' });
  }

  // description
  if (!m.description || typeof m.description !== 'string') {
    errors.push({ field: 'description', message: '描述不能为空', severity: 'error' });
  }

  // author
  if (!m.author || typeof m.author !== 'object') {
    errors.push({ field: 'author', message: '作者信息不能为空', severity: 'error' });
  } else {
    const author = m.author as Record<string, unknown>;
    if (!author.name || typeof author.name !== 'string') {
      errors.push({ field: 'author.name', message: '作者名称不能为空', severity: 'error' });
    }
    if (author.email && typeof author.email === 'string' && !author.email.includes('@')) {
      warnings.push({ field: 'author.email', message: '邮箱格式可能无效', severity: 'warning' });
    }
  }

  // license
  if (!m.license || typeof m.license !== 'string') {
    warnings.push({ field: 'license', message: '建议声明许可证', severity: 'warning' });
  }

  // type
  const validTypes = ['source', 'processor', 'sink', 'analyzer', 'visualizer', 'integration', 'utility'];
  if (!m.type || !validTypes.includes(m.type as string)) {
    errors.push({ field: 'type', message: `类型必须为: ${validTypes.join(', ')}`, severity: 'error' });
  }

  // main
  if (!m.main || typeof m.main !== 'string') {
    errors.push({ field: 'main', message: '入口文件路径不能为空', severity: 'error' });
  } else {
    const mainPath = m.main as string;
    if (mainPath.includes('..') || path.isAbsolute(mainPath)) {
      errors.push({ field: 'main', message: '入口文件路径不能包含 .. 或绝对路径（路径遍历攻击防护）', severity: 'error' });
    }
  }

  // platformVersion
  if (!m.platformVersion || typeof m.platformVersion !== 'string') {
    warnings.push({ field: 'platformVersion', message: '建议声明最低平台版本', severity: 'warning' });
  }

  // permissions
  if (!m.permissions || !Array.isArray(m.permissions)) {
    errors.push({ field: 'permissions', message: '权限声明必须为数组', severity: 'error' });
  } else {
    const perms = m.permissions as string[];
    for (const perm of perms) {
      if (!ALL_PERMISSIONS.includes(perm as PluginPermission)) {
        errors.push({ field: `permissions.${perm}`, message: `未知权限: ${perm}`, severity: 'error' });
      }
    }
    const highRisk = perms.filter(p => HIGH_RISK_PERMISSIONS.includes(p as PluginPermission));
    if (highRisk.length > 0) {
      warnings.push({
        field: 'permissions',
        message: `包含高风险权限（需管理员审批）: ${highRisk.join(', ')}`,
        severity: 'warning',
      });
    }
  }

  // resourceLimits
  if (m.resourceLimits) {
    if (typeof m.resourceLimits === 'string') {
      if (!RESOURCE_LIMIT_PRESETS[m.resourceLimits]) {
        errors.push({
          field: 'resourceLimits',
          message: `未知预设: ${m.resourceLimits}，可选: ${Object.keys(RESOURCE_LIMIT_PRESETS).join(', ')}`,
          severity: 'error',
        });
      }
    } else if (typeof m.resourceLimits === 'object') {
      const limits = m.resourceLimits as Record<string, unknown>;
      if (limits.maxMemoryMB && (typeof limits.maxMemoryMB !== 'number' || limits.maxMemoryMB < 16)) {
        errors.push({ field: 'resourceLimits.maxMemoryMB', message: '最小内存限制为 16MB', severity: 'error' });
      }
      if (limits.maxMemoryMB && (limits.maxMemoryMB as number) > 2048) {
        warnings.push({ field: 'resourceLimits.maxMemoryMB', message: '内存超过 2GB，建议优化', severity: 'warning' });
      }
    }
  }

  // networkPolicy
  if (m.networkPolicy && typeof m.networkPolicy === 'object') {
    const np = m.networkPolicy as Record<string, unknown>;
    if (np.allowPrivateNetwork === true) {
      warnings.push({ field: 'networkPolicy.allowPrivateNetwork', message: '允许访问内网是高风险操作', severity: 'warning' });
    }
  }

  // configSchema
  if (m.configSchema && typeof m.configSchema !== 'object') {
    errors.push({ field: 'configSchema', message: 'configSchema 必须为 JSON Schema 对象', severity: 'error' });
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    warnings,
    manifest: valid ? (m as unknown as PluginManifest) : undefined,
  };
}

// ==================== 签名验证 ====================

/** 签名验证结果 */
export interface SignatureVerificationResult {
  verified: boolean;
  algorithm?: string;
  signedAt?: string;
  error?: string;
}

/**
 * 计算插件包的 SHA256 摘要
 */
export function computeDigest(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 生成插件签名（用于插件开发者打包时）
 */
export function signPlugin(
  content: Buffer,
  privateKeyPem: string,
  algorithm: 'sha256-rsa' | 'sha256-ecdsa' = 'sha256-rsa'
): { digest: string; signature: string; signedAt: string } {
  const digest = computeDigest(content);
  const signedAt = new Date().toISOString();

  const dataToSign = `${digest}:${signedAt}`;
  const signer = crypto.createSign(algorithm === 'sha256-rsa' ? 'RSA-SHA256' : 'SHA256');
  signer.update(dataToSign);
  const signature = signer.sign(privateKeyPem, 'base64');

  return { digest, signature, signedAt };
}

/**
 * 验证插件签名
 */
export function verifyPluginSignature(
  content: Buffer,
  manifest: PluginManifest
): SignatureVerificationResult {
  if (!manifest.signature) {
    return { verified: false, error: '插件未包含签名信息' };
  }

  const { algorithm, publicKey, digest, signedAt } = manifest.signature;

  // 1. 验证摘要完整性
  const actualDigest = computeDigest(content);
  if (actualDigest !== digest) {
    return {
      verified: false,
      algorithm,
      error: `内容摘要不匹配: 期望 ${digest.substring(0, 16)}..., 实际 ${actualDigest.substring(0, 16)}...`,
    };
  }

  // 2. 验证签名时间（不超过 1 年）
  const signedDate = new Date(signedAt);
  const now = new Date();
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (now.getTime() - signedDate.getTime() > oneYear) {
    return {
      verified: false,
      algorithm,
      signedAt,
      error: '签名已过期（超过 1 年）',
    };
  }

  // 3. 验证 RSA/ECDSA 签名
  try {
    const dataToVerify = `${digest}:${signedAt}`;
    const verifyAlgo = algorithm === 'sha256-rsa' ? 'RSA-SHA256' : 'SHA256';
    const verifier = crypto.createVerify(verifyAlgo);
    verifier.update(dataToVerify);

    // publicKey 可以是 PEM 格式或 Base64 编码的 DER
    let pubKey: string;
    if (publicKey.startsWith('-----BEGIN')) {
      pubKey = publicKey;
    } else {
      pubKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
    }

    const isValid = verifier.verify(pubKey, digest, 'base64');
    if (!isValid) {
      return { verified: false, algorithm, signedAt, error: '签名验证失败：签名无效' };
    }

    return { verified: true, algorithm, signedAt };
  } catch (err) {
    return {
      verified: false,
      algorithm,
      signedAt,
      error: `签名验证异常: ${err instanceof Error ? err.message : 'Unknown'}`,
    };
  }
}

// ==================== Manifest 解析器 ====================

/**
 * 从 YAML 字符串解析 Manifest
 * 注意：使用简化的 YAML 解析器，避免引入额外依赖
 */
export function parseManifestYaml(yamlContent: string): Record<string, unknown> {
  // 简化 YAML 解析（支持基本的 key: value、数组、嵌套对象）
  // 生产环境建议使用 js-yaml 库
  const lines = yamlContent.split('\n');
  const result: Record<string, unknown> = {};
  const stack: Array<{ obj: Record<string, unknown>; indent: number }> = [{ obj: result, indent: -1 }];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // 跳过空行和注释
    if (!trimmed || trimmed.trim().startsWith('#')) continue;

    const indent = line.length - line.trimStart().length;
    const content = trimmed.trim();

    // 数组项
    if (content.startsWith('- ')) {
      const value = content.substring(2).trim();
      // 找到当前层级的父对象
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].obj;
      const lastKey = Object.keys(parent).pop();
      if (lastKey) {
        if (!Array.isArray(parent[lastKey])) {
          parent[lastKey] = [];
        }
        (parent[lastKey] as unknown[]).push(parseYamlValue(value));
      }
      continue;
    }

    // key: value
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) continue;

    const key = content.substring(0, colonIdx).trim();
    const rawValue = content.substring(colonIdx + 1).trim();

    // 回退到正确的层级
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].obj;

    if (rawValue === '' || rawValue === '{}') {
      // 嵌套对象
      const nested: Record<string, unknown> = {};
      current[key] = rawValue === '{}' ? {} : nested;
      if (rawValue !== '{}') {
        stack.push({ obj: nested, indent });
      }
    } else {
      current[key] = parseYamlValue(rawValue);
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  // 去除引号
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // 布尔
  if (value === 'true') return true;
  if (value === 'false') return false;
  // null
  if (value === 'null' || value === '~') return null;
  // 数字
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  // 字符串
  return value;
}

// ==================== 受信任签名者管理 ====================

/** 受信任的签名者 */
export interface TrustedSigner {
  id: string;
  name: string;
  publicKeyPem: string;
  addedAt: string;
  addedBy: string;
  fingerprint: string;
}

class TrustedSignerStore extends EventEmitter {
  private signers: Map<string, TrustedSigner> = new Map();

  /** 添加受信任签名者 */
  addSigner(name: string, publicKeyPem: string, addedBy: string): TrustedSigner {
    const fingerprint = crypto.createHash('sha256').update(publicKeyPem).digest('hex').substring(0, 16);
    const id = `signer-${fingerprint}`;

    const signer: TrustedSigner = {
      id,
      name,
      publicKeyPem,
      addedAt: new Date().toISOString(),
      addedBy,
      fingerprint,
    };

    this.signers.set(id, signer);
    this.emit('signer:added', signer);
    return signer;
  }

  /** 移除受信任签名者 */
  removeSigner(id: string): boolean {
    const removed = this.signers.delete(id);
    if (removed) this.emit('signer:removed', { id });
    return removed;
  }

  /** 获取所有受信任签名者 */
  getAllSigners(): TrustedSigner[] {
    return Array.from(this.signers.values());
  }

  /** 检查公钥是否受信任 */
  isTrusted(publicKey: string): boolean {
    const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);
    for (const signer of this.signers.values()) {
      if (signer.fingerprint === fingerprint) return true;
    }
    return false;
  }
}

export const trustedSignerStore = new TrustedSignerStore();

// ==================== 导出汇总 ====================

export const manifestUtils = {
  validate: validateManifest,
  parseYaml: parseManifestYaml,
  computeDigest,
  signPlugin,
  verifySignature: verifyPluginSignature,
  trustedSigners: trustedSignerStore,
};
