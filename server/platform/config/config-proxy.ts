/**
 * 配置中心 Strangler Fig 门面
 *
 * 统一 IConfigProvider 接口，根据 DEPLOYMENT_MODE 路由到：
 * - monolith / standalone → configCenter 本地单例（零变化行为）
 * - microservices → ConfigCenterClient（HTTP + Redis 远程）
 *
 * 调用方无需感知部署模式。
 */

import { config } from '../../core/config';
import { createModuleLogger } from '../../core/logger';
import type { ConfigChangeListener } from '../services/configCenter';

const log = createModuleLogger('config-proxy');

// ============================================================
// IConfigProvider 接口
// ============================================================

export interface IConfigProvider {
  get(key: string, defaultValue?: string): string;
  getInt(key: string, defaultValue: number): number;
  getBool(key: string, defaultValue: boolean): boolean;
  set(key: string, value: string, updatedBy?: string): Promise<boolean>;
  watch(key: string, handler: ConfigChangeListener): () => void;
  initialize(): Promise<void>;
  shutdown(): void;
}

// ============================================================
// 本地适配器 — 包装 configCenter 单例为 IConfigProvider
// ============================================================

class LocalConfigProvider implements IConfigProvider {
  private center: typeof import('../services/configCenter').configCenter | null = null;

  private async getCenter() {
    if (!this.center) {
      const mod = await import('../services/configCenter');
      this.center = mod.configCenter;
    }
    return this.center;
  }

  get(key: string, defaultValue?: string): string {
    // 同步调用：configCenter 已加载则使用，否则回退 env
    if (this.center) return this.center.get(key, defaultValue);
    return process.env[key] || defaultValue || '';
  }

  getInt(key: string, defaultValue: number): number {
    if (this.center) return this.center.getInt(key, defaultValue);
    const v = process.env[key];
    return v ? parseInt(v, 10) : defaultValue;
  }

  getBool(key: string, defaultValue: boolean): boolean {
    if (this.center) return this.center.getBool(key, defaultValue);
    const v = process.env[key];
    if (!v) return defaultValue;
    return v === 'true' || v === '1' || v === 'yes';
  }

  async set(key: string, value: string, updatedBy?: string): Promise<boolean> {
    const center = await this.getCenter();
    return center.set(key, value, updatedBy);
  }

  watch(key: string, handler: ConfigChangeListener): () => void {
    if (this.center) return this.center.watch(key, handler);
    // 如果 configCenter 还未加载，延迟注册
    let unwatch: (() => void) | null = null;
    this.getCenter().then(center => {
      unwatch = center.watch(key, handler);
    });
    return () => { unwatch?.(); };
  }

  async initialize(): Promise<void> {
    const center = await this.getCenter();
    await center.initialize();
  }

  shutdown(): void {
    this.center?.shutdown();
  }
}

// ============================================================
// 单例工厂
// ============================================================

let proxy: IConfigProvider | null = null;

/**
 * 获取统一 ConfigProvider（Strangler Fig 门面）
 *
 * - monolith/standalone → LocalConfigProvider → configCenter 单例
 * - microservices → ConfigCenterClient（延迟加载）
 */
export function getConfigProxy(): IConfigProvider {
  if (proxy) return proxy;

  const mode = config.grpc.deploymentMode;

  if (mode === 'microservices' && config.configCenter.enabled) {
    // 延迟加载 ConfigCenterClient，避免单体模式下加载不需要的模块
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('./config-center-client') as { getConfigCenterClient: () => IConfigProvider };
      proxy = mod.getConfigCenterClient();
      log.info('ConfigProxy: using remote ConfigCenterClient (microservices mode)');
    } catch (err: any) {
      log.warn(`ConfigProxy: failed to load ConfigCenterClient, falling back to local: ${err.message}`);
      proxy = new LocalConfigProvider();
    }
  } else {
    proxy = new LocalConfigProvider();
    log.info('ConfigProxy: using local ConfigCenter (monolith mode)');
  }

  return proxy;
}

/** 重置单例（测试用） */
export function resetConfigProxy(): void {
  if (proxy) {
    proxy.shutdown();
    proxy = null;
  }
}
