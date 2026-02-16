/**
 * 插件引擎
 * 提供插件的加载、生命周期管理、依赖管理等功能
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('plugin');

// ============ 类型定义 ============

// 插件状态
export type PluginStatus = 'installed' | 'enabled' | 'disabled' | 'error' | 'uninstalled';

// 插件类型
export type PluginType = 'source' | 'processor' | 'sink' | 'analyzer' | 'visualizer' | 'integration' | 'utility';

// 插件元数据
export interface PluginMetadata {

  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  type: PluginType;
  tags?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  config?: {
    schema: Record<string, unknown>;
    defaults?: Record<string, unknown>;
  };
  permissions?: string[];
  entryPoint: string;
}

// 插件实例接口
export interface Plugin {
  metadata: PluginMetadata;
  
  // 生命周期钩子
  onInstall?(): Promise<void>;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  onUninstall?(): Promise<void>;
  onConfigChange?(config: Record<string, unknown>): Promise<void>;
  
  // 插件功能
  execute?(context: PluginContext): Promise<unknown>;
  
  // 健康检查
  healthCheck?(): Promise<{ healthy: boolean; message?: string }>;
}

// 插件上下文
export interface PluginContext {
  pluginId: string;
  config: Record<string, unknown>;
  logger: {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
  };
  services: {
    http: typeof fetch;
    storage: {
      get(key: string): Promise<unknown>;
      set(key: string, value: unknown): Promise<void>;
      delete(key: string): Promise<void>;
    };
    events: {
      emit(event: string, data: unknown): void;
      on(event: string, handler: (data: unknown) => void): void;
      off(event: string, handler: (data: unknown) => void): void;
    };
  };
}

// 插件运行时
interface PluginRuntime {
  metadata: PluginMetadata;
  instance: Plugin;
  status: PluginStatus;
  config: Record<string, unknown>;
  loadedAt: number;
  enabledAt?: number;
  lastError?: string;
  stats: {
    executionCount: number;
    errorCount: number;
    totalExecutionTimeMs: number;
  };
}

// 插件仓库项
export interface PluginRegistryItem {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  type: PluginType;
  tags?: string[];
  downloadUrl?: string;
  installed: boolean;
  enabled: boolean;
}

// ============ 内置插件实现 ============

/**
 * 日志分析插件
 */
export class LogAnalyzerPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'builtin-log-analyzer',
    name: '日志分析器',
    version: '1.0.0',
    description: '分析系统日志，提取关键信息和异常',
    type: 'analyzer',
    tags: ['log', 'analysis', 'monitoring'],
    entryPoint: 'builtin',
  };

  async onEnable(): Promise<void> {
    log.debug('[LogAnalyzerPlugin] Enabled');
  }

  async onDisable(): Promise<void> {
    log.debug('[LogAnalyzerPlugin] Disabled');
  }

  async execute(context: PluginContext): Promise<{
    patterns: Array<{ pattern: string; count: number }>;
    errors: Array<{ message: string; timestamp: number }>;
    summary: { totalLines: number; errorCount: number; warnCount: number };
  }> {
    const logs = (context.config.logs as string[]) || [];
    const patterns = new Map<string, number>();
    const errors: Array<{ message: string; timestamp: number }> = [];
    let errorCount = 0;
    let warnCount = 0;

    for (const log of logs) {
      // 提取错误
      if (log.toLowerCase().includes('error')) {
        errorCount++;
        errors.push({ message: log, timestamp: Date.now() });
      }
      if (log.toLowerCase().includes('warn')) {
        warnCount++;
      }

      // 提取模式（简化实现）
      const words = log.split(/\s+/).slice(0, 3).join(' ');
      patterns.set(words, (patterns.get(words) || 0) + 1);
    }

    return {
      patterns: Array.from(patterns.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      errors: errors.slice(0, 20),
      summary: {
        totalLines: logs.length,
        errorCount,
        warnCount,
      },
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
}

/**
 * 数据验证插件
 */
export class DataValidatorPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'builtin-data-validator',
    name: '数据验证器',
    version: '1.0.0',
    description: '验证数据格式和完整性',
    type: 'processor',
    tags: ['validation', 'data-quality'],
    config: {
      schema: {
        rules: { type: 'array', items: { type: 'object' } },
      },
      defaults: {
        rules: [],
      },
    },
    entryPoint: 'builtin',
  };

  async execute(context: PluginContext): Promise<{
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    validatedData: unknown;
  }> {
    const data = context.config.data as Record<string, unknown>;
    const rules = (context.config.rules as Array<{
      field: string;
      type: string;
      required?: boolean;
      min?: number;
      max?: number;
      pattern?: string;
    }>) || [];

    const errors: Array<{ field: string; message: string }> = [];

    for (const rule of rules) {
      const value = data[rule.field];

      // 必填检查
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ field: rule.field, message: '字段必填' });
        continue;
      }

      if (value === undefined || value === null) continue;

      // 类型检查
      if (rule.type === 'number' && typeof value !== 'number') {
        errors.push({ field: rule.field, message: '必须是数字' });
      } else if (rule.type === 'string' && typeof value !== 'string') {
        errors.push({ field: rule.field, message: '必须是字符串' });
      } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
        errors.push({ field: rule.field, message: '必须是布尔值' });
      }

      // 范围检查
      if (typeof value === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push({ field: rule.field, message: `不能小于 ${rule.min}` });
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push({ field: rule.field, message: `不能大于 ${rule.max}` });
        }
      }

      // 正则检查
      if (rule.pattern && typeof value === 'string') {
        if (!new RegExp(rule.pattern).test(value)) {
          errors.push({ field: rule.field, message: '格式不正确' });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedData: data,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
}

/**
 * 告警通知插件
 */
export class AlertNotifierPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'builtin-alert-notifier',
    name: '告警通知器',
    version: '1.0.0',
    description: '发送告警通知到多个渠道',
    type: 'integration',
    tags: ['alert', 'notification', 'webhook'],
    config: {
      schema: {
        webhookUrl: { type: 'string' },
        emailEnabled: { type: 'boolean' },
        emailRecipients: { type: 'array', items: { type: 'string' } },
      },
      defaults: {
        emailEnabled: false,
        emailRecipients: [],
      },
    },
    entryPoint: 'builtin',
  };

  async execute(context: PluginContext): Promise<{
    sent: boolean;
    channels: Array<{ channel: string; success: boolean; error?: string }>;
  }> {
    const alert = context.config.alert as {
      title: string;
      message: string;
      severity: string;
      timestamp: number;
    };

    const channels: Array<{ channel: string; success: boolean; error?: string }> = [];

    // Webhook 通知
    const webhookUrl = context.config.webhookUrl as string;
    if (webhookUrl) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alert),
        });
        channels.push({
          channel: 'webhook',
          success: response.ok,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        });
      } catch (error) {
        channels.push({
          channel: 'webhook',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 邮件通知（模拟）
    if (context.config.emailEnabled) {
      const recipients = context.config.emailRecipients as string[];
      if (recipients.length > 0) {
        // 实际实现需要邮件服务
        channels.push({
          channel: 'email',
          success: true,
        });
        context.logger.info(`Alert sent to ${recipients.length} email recipients`);
      }
    }

    return {
      sent: channels.some(c => c.success),
      channels,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
}

/**
 * 数据转换插件
 */
export class DataTransformerPlugin implements Plugin {
  metadata: PluginMetadata = {
    id: 'builtin-data-transformer',
    name: '数据转换器',
    version: '1.0.0',
    description: '通用数据格式转换',
    type: 'processor',
    tags: ['transform', 'format', 'conversion'],
    entryPoint: 'builtin',
  };

  async execute(context: PluginContext): Promise<{
    transformed: unknown;
    format: string;
  }> {
    const data = context.config.data;
    const targetFormat = (context.config.targetFormat as string) || 'json';

    let transformed: unknown;

    switch (targetFormat) {
      case 'json':
        transformed = JSON.stringify(data, null, 2);
        break;
      case 'csv':
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0] as object);
          const rows = data.map((item: unknown) => {
            const obj = item as Record<string, unknown>;
            return headers.map(h => String(obj[h] ?? '')).join(',');
          });
          transformed = [headers.join(','), ...rows].join('\n');
        } else {
          transformed = '';
        }
        break;
      case 'xml':
        transformed = this.toXml(data);
        break;
      default:
        transformed = data;
    }

    return {
      transformed,
      format: targetFormat,
    };
  }

  private toXml(data: unknown, rootName: string = 'root'): string {
    const convert = (obj: unknown, name: string): string => {
      if (obj === null || obj === undefined) {
        return `<${name}/>`;
      }
      if (typeof obj !== 'object') {
        return `<${name}>${String(obj)}</${name}>`;
      }
      if (Array.isArray(obj)) {
        return obj.map((item, i) => convert(item, `item`)).join('');
      }
      const entries = Object.entries(obj as Record<string, unknown>);
      const children = entries.map(([k, v]) => convert(v, k)).join('');
      return `<${name}>${children}</${name}>`;
    };
    return `<?xml version="1.0" encoding="UTF-8"?>${convert(data, rootName)}`;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }
}

// ============ 插件引擎 ============

/**
 * 插件引擎类
 */
export class PluginEngine extends EventEmitter {
  private plugins: Map<string, PluginRuntime> = new Map();
  private pluginStorage: Map<string, Map<string, unknown>> = new Map();
  private builtinPlugins: Plugin[] = [];

  constructor() {
    super();
    this.registerBuiltinPlugins();
  }

  /**
   * 注册内置插件
   */
  private registerBuiltinPlugins(): void {
    this.builtinPlugins = [
      new LogAnalyzerPlugin(),
      new DataValidatorPlugin(),
      new AlertNotifierPlugin(),
      new DataTransformerPlugin(),
    ];

    // 自动安装内置插件
    for (const plugin of this.builtinPlugins) {
      this.installPlugin(plugin).catch(err => {
        log.error(`[PluginEngine] Failed to install builtin plugin ${plugin.metadata.id}:`, err);
      });
    }
  }

  /**
   * 创建插件上下文
   */
  private createContext(pluginId: string, config: Record<string, unknown>): PluginContext {
    // 获取或创建插件存储
    if (!this.pluginStorage.has(pluginId)) {
      this.pluginStorage.set(pluginId, new Map());
    }
    const storage = this.pluginStorage.get(pluginId)!;

    return {
      pluginId,
      config,
      logger: {
        info: (msg: string, ...args: unknown[]) => log.debug(`[Plugin:${pluginId}] ${msg}`, ...args),
        warn: (msg: string, ...args: unknown[]) => log.warn(`[Plugin:${pluginId}] ${msg}`, ...args),
        error: (msg: string, ...args: unknown[]) => log.error(`[Plugin:${pluginId}] ${msg}`, ...args),
        debug: (msg: string, ...args: unknown[]) => log.debug(`[Plugin:${pluginId}] ${msg}`, ...args),
      },
      services: {
        http: fetch,
        storage: {
          get: async (key: string) => storage.get(key),
          set: async (key: string, value: unknown) => { storage.set(key, value); },
          delete: async (key: string) => { storage.delete(key); },
        },
        events: {
          emit: (event: string, data: unknown) => this.emit(`plugin:${pluginId}:${event}`, data),
          on: (event: string, handler: (data: unknown) => void) => this.on(`plugin:${pluginId}:${event}`, handler),
          off: (event: string, handler: (data: unknown) => void) => this.off(`plugin:${pluginId}:${event}`, handler),
        },
      },
    };
  }

  /**
   * 安装插件
   */
  async installPlugin(plugin: Plugin): Promise<void> {
    const { id } = plugin.metadata;

    if (this.plugins.has(id)) {
      throw new Error(`Plugin ${id} is already installed`);
    }

    // 检查依赖
    if (plugin.metadata.dependencies) {
      for (const [depId, version] of Object.entries(plugin.metadata.dependencies)) {
        const dep = this.plugins.get(depId);
        if (!dep) {
          throw new Error(`Missing dependency: ${depId}@${version}`);
        }
      }
    }

    // 调用安装钩子
    if (plugin.onInstall) {
      await plugin.onInstall();
    }

    const runtime: PluginRuntime = {
      metadata: plugin.metadata,
      instance: plugin,
      status: 'installed',
      config: plugin.metadata.config?.defaults || {},
      loadedAt: Date.now(),
      stats: {
        executionCount: 0,
        errorCount: 0,
        totalExecutionTimeMs: 0,
      },
    };

    this.plugins.set(id, runtime);
    this.emit('plugin:installed', { pluginId: id });
    log.debug(`[PluginEngine] Plugin ${id} installed`);
  }

  /**
   * 启用插件
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (runtime.status === 'enabled') {
      return;
    }

    try {
      if (runtime.instance.onEnable) {
        await runtime.instance.onEnable();
      }

      runtime.status = 'enabled';
      runtime.enabledAt = Date.now();
      this.emit('plugin:enabled', { pluginId });
      log.debug(`[PluginEngine] Plugin ${pluginId} enabled`);
    } catch (error) {
      runtime.status = 'error';
      runtime.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * 禁用插件
   */
  async disablePlugin(pluginId: string): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (runtime.status === 'disabled') {
      return;
    }

    try {
      if (runtime.instance.onDisable) {
        await runtime.instance.onDisable();
      }

      runtime.status = 'disabled';
      this.emit('plugin:disabled', { pluginId });
      log.debug(`[PluginEngine] Plugin ${pluginId} disabled`);
    } catch (error) {
      runtime.lastError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    // 检查是否有其他插件依赖此插件
    for (const [id, p] of Array.from(this.plugins.entries())) {
      if (p.metadata.dependencies && pluginId in p.metadata.dependencies) {
        throw new Error(`Cannot uninstall: Plugin ${id} depends on ${pluginId}`);
      }
    }

    // 先禁用
    if (runtime.status === 'enabled') {
      await this.disablePlugin(pluginId);
    }

    // 调用卸载钩子
    if (runtime.instance.onUninstall) {
      await runtime.instance.onUninstall();
    }

    // 清理存储
    this.pluginStorage.delete(pluginId);

    this.plugins.delete(pluginId);
    this.emit('plugin:uninstalled', { pluginId });
    log.debug(`[PluginEngine] Plugin ${pluginId} uninstalled`);
  }

  /**
   * 执行插件
   */
  async executePlugin(pluginId: string, config: Record<string, unknown> = {}): Promise<unknown> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (runtime.status !== 'enabled') {
      throw new Error(`Plugin ${pluginId} is not enabled`);
    }

    if (!runtime.instance.execute) {
      throw new Error(`Plugin ${pluginId} does not support execution`);
    }

    const startTime = Date.now();
    const context = this.createContext(pluginId, { ...runtime.config, ...config });

    try {
      const result = await runtime.instance.execute(context);
      
      runtime.stats.executionCount++;
      runtime.stats.totalExecutionTimeMs += Date.now() - startTime;
      
      this.emit('plugin:executed', { pluginId, success: true, durationMs: Date.now() - startTime });
      
      return result;
    } catch (error) {
      runtime.stats.errorCount++;
      runtime.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('plugin:executed', { pluginId, success: false, error: runtime.lastError });
      
      throw error;
    }
  }

  /**
   * 更新插件配置
   */
  async updatePluginConfig(pluginId: string, config: Record<string, unknown>): Promise<void> {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const oldConfig = runtime.config;
    runtime.config = { ...runtime.config, ...config };

    if (runtime.instance.onConfigChange) {
      try {
        await runtime.instance.onConfigChange(runtime.config);
      } catch (error) {
        // 回滚配置
        runtime.config = oldConfig;
        throw error;
      }
    }

    this.emit('plugin:configUpdated', { pluginId, config: runtime.config });
  }

  /**
   * 获取插件状态
   */
  getPluginStatus(pluginId: string): {
    metadata: PluginMetadata;
    status: PluginStatus;
    config: Record<string, unknown>;
    stats: PluginRuntime['stats'];
    lastError?: string;
  } | null {
    const runtime = this.plugins.get(pluginId);
    if (!runtime) {
      return null;
    }

    return {
      metadata: runtime.metadata,
      status: runtime.status,
      config: runtime.config,
      stats: runtime.stats,
      lastError: runtime.lastError,
    };
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Array<{
    id: string;
    name: string;
    version: string;
    type: PluginType;
    status: PluginStatus;
    description?: string;
  }> {
    return Array.from(this.plugins.values()).map(runtime => ({
      id: runtime.metadata.id,
      name: runtime.metadata.name,
      version: runtime.metadata.version,
      type: runtime.metadata.type,
      status: runtime.status,
      description: runtime.metadata.description,
    }));
  }

  /**
   * 按类型获取插件
   */
  getPluginsByType(type: PluginType): Array<{
    id: string;
    name: string;
    version: string;
    status: PluginStatus;
  }> {
    return Array.from(this.plugins.values())
      .filter(runtime => runtime.metadata.type === type)
      .map(runtime => ({
        id: runtime.metadata.id,
        name: runtime.metadata.name,
        version: runtime.metadata.version,
        status: runtime.status,
      }));
  }

  /**
   * 健康检查所有插件
   */
  async healthCheckAll(): Promise<Array<{
    pluginId: string;
    healthy: boolean;
    message?: string;
  }>> {
    const results: Array<{ pluginId: string; healthy: boolean; message?: string }> = [];

    for (const [pluginId, runtime] of Array.from(this.plugins.entries())) {
      if (runtime.status !== 'enabled') {
        results.push({ pluginId, healthy: false, message: `Plugin is ${runtime.status}` });
        continue;
      }

      if (runtime.instance.healthCheck) {
        try {
          const result = await runtime.instance.healthCheck();
          results.push({ pluginId, ...result });
        } catch (error) {
          results.push({
            pluginId,
            healthy: false,
            message: error instanceof Error ? error.message : 'Health check failed',
          });
        }
      } else {
        results.push({ pluginId, healthy: true });
      }
    }

    return results;
  }
}

// 导出单例
export const pluginEngine = new PluginEngine();
