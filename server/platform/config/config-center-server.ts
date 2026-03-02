/**
 * 配置中心 HTTP 服务端
 *
 * 将已有 configCenter 单例暴露为 RESTful API，供远程 ConfigCenterClient 消费。
 * 不重写任何逻辑 — 所有读写操作均委托给 configCenter。
 *
 * 端点:
 *   GET    /api/v1/config/:key        — 获取单条配置
 *   GET    /api/v1/config             — 按 scope 列表查询
 *   PUT    /api/v1/config/:key        — 设置配置（带校验）
 *   POST   /api/v1/config/batch       — 批量设置
 *   GET    /api/v1/config/snapshot    — 全量快照
 *   POST   /api/v1/config/rollback    — 版本回滚
 *   GET    /healthz                   — 健康检查
 *   GET    /readyz                    — 就绪检查
 *
 * 导出 createConfigCenterApp(configCenter) 返回 Express Router，
 * 可嵌入单体也可独立运行。
 */

import { Router, json } from 'express';
import type { Request, Response } from 'express';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('config-center-server');

/** configCenter 单例的结构化类型（不依赖 class 导出） */
interface ConfigCenterInstance {
  get(key: string, defaultValue?: string): string;
  getInt(key: string, defaultValue: number): number;
  getBool(key: string, defaultValue: boolean): boolean;
  set(key: string, value: string, updatedBy?: string): Promise<boolean>;
  setBatch(entries: Array<{ key: string; value: string }>, updatedBy?: string): Promise<{ success: number; failed: string[] }>;
  getSnapshot(): Record<string, { value: string; source: string; version: number; updatedAt: Date }>;
  getHistory(key?: string, limit?: number): any[];
  rollback(key: string, targetVersion: number, updatedBy?: string): Promise<boolean>;
  initialize(): Promise<void>;
  shutdown(): void;
}

/**
 * 创建配置中心 HTTP 路由
 *
 * @param center - configCenter 单例实例
 * @returns Express Router
 */
export function createConfigCenterApp(
  center: ConfigCenterInstance,
): Router {
  const app = Router();
  app.use(json());

  const startTime = Date.now();

  // ── 健康检查 ──────────────────────────────────

  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: Date.now() - startTime });
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    // configCenter 存在即就绪
    res.json({ status: 'ready' });
  });

  // ── 全量快照 ──────────────────────────────────

  app.get('/api/v1/config/snapshot', (_req: Request, res: Response) => {
    try {
      const snapshot = center.getSnapshot();
      res.json(snapshot);
    } catch (err: any) {
      log.warn(`Snapshot error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 批量设置 ──────────────────────────────────

  app.post('/api/v1/config/batch', async (req: Request, res: Response) => {
    try {
      const { entries, updatedBy } = req.body as {
        entries: Array<{ key: string; value: string }>;
        updatedBy?: string;
      };
      if (!Array.isArray(entries) || entries.length === 0) {
        res.status(400).json({ error: 'entries must be a non-empty array' });
        return;
      }
      const result = await center.setBatch(entries, updatedBy || 'api');
      res.json(result);
    } catch (err: any) {
      log.warn(`Batch set error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 版本回滚 ──────────────────────────────────

  app.post('/api/v1/config/rollback', async (req: Request, res: Response) => {
    try {
      const { key, targetVersion, updatedBy } = req.body as {
        key: string;
        targetVersion: number;
        updatedBy?: string;
      };
      if (!key || targetVersion === undefined) {
        res.status(400).json({ error: 'key and targetVersion are required' });
        return;
      }
      const success = await center.rollback(key, targetVersion, updatedBy);
      res.json({ success });
    } catch (err: any) {
      log.warn(`Rollback error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 列表查询（带可选 scope 过滤） ──────────────────

  app.get('/api/v1/config', (req: Request, res: Response) => {
    try {
      const scope = req.query.scope as string | undefined;
      const snapshot = center.getSnapshot();
      if (scope) {
        const prefix = `${scope}.`;
        const filtered: Record<string, any> = {};
        for (const [k, v] of Object.entries(snapshot)) {
          if (k.startsWith(prefix)) filtered[k] = v;
        }
        res.json(filtered);
        return;
      }
      res.json(snapshot);
    } catch (err: any) {
      log.warn(`List config error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 获取单条配置 ──────────────────────────────

  app.get('/api/v1/config/:key', (req: Request, res: Response) => {
    try {
      const key = req.params.key;
      const snapshot = center.getSnapshot();
      const entry = snapshot[key];
      if (!entry) {
        // 尝试从 get 方法获取（可能来自 env）
        const value = center.get(key);
        if (value) {
          res.json({ value, version: 0, source: 'env' });
          return;
        }
        res.status(404).json({ error: `Config key "${key}" not found` });
        return;
      }
      res.json(entry);
    } catch (err: any) {
      log.warn(`Get config error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ── 设置单条配置 ──────────────────────────────

  app.put('/api/v1/config/:key', async (req: Request, res: Response) => {
    try {
      const key = req.params.key;
      const { value, updatedBy } = req.body as { value: string; updatedBy?: string };
      if (value === undefined) {
        res.status(400).json({ error: 'value is required' });
        return;
      }
      const success = await center.set(key, String(value), updatedBy || 'api');
      res.json({ success });
    } catch (err: any) {
      log.warn(`Set config error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  log.info('Config center HTTP routes registered');
  return app;
}
