/**
 * Docker 引擎管理 tRPC 路由
 * 提供容器生命周期管理 API
 */
import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import { dockerManager } from '../services/docker/dockerManager.service';
import { resetDb, getDb } from '../lib/db/index';
import { createModuleLogger } from '../core/logger';

const log = createModuleLogger('docker-router');

/** 等待 MySQL 就绪（最多 30 秒） */
async function waitForMySQL(url: string, maxRetries = 15): Promise<boolean> {
  const { drizzle } = await import('drizzle-orm/mysql2');
  const { sql } = await import('drizzle-orm');
  for (let i = 0; i < maxRetries; i++) {
    try {
      const testDb = drizzle(url);
      await testDb.execute(sql`SELECT 1`);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

/** 程序化运行 drizzle migrate */
async function runMigrations(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { drizzle } = await import('drizzle-orm/mysql2');
    const { migrate } = await import('drizzle-orm/mysql2/migrator');
    const db = drizzle(url);
    await migrate(db, { migrationsFolder: './drizzle' });
    return { success: true };
  } catch (e: any) {
    log.error('[bootstrapMySQL] Migration failed:', e.message);
    return { success: false, error: e.message };
  }
}

export const dockerRouter = router({
  /**
   * 检查 Docker Engine 连接状态
   */
  checkConnection: publicProcedure.query(async () => {
    return dockerManager.checkConnection();
  }),

  /**
   * 列出所有 PortAI 引擎容器
   */
  listEngines: publicProcedure.query(async () => {
    try {
      const engines = await dockerManager.listEngines();
      return { success: true, engines };
    } catch (e: any) {
      return {
        success: false,
        engines: [],
        error: e.message,
      };
    }
  }),

  /**
   * 启动指定引擎
   */
  startEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.startEngine(input.containerName);
    }),

  /**
   * 停止指定引擎
   */
  stopEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.stopEngine(input.containerName);
    }),

  /**
   * 重启指定引擎
   */
  restartEngine: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.restartEngine(input.containerName);
    }),

  /**
   * 一键启动所有引擎
   */
  startAll: publicProcedure.mutation(async () => {
    const results = await dockerManager.startAll();
    const successCount = results.filter(r => r.success).length;
    return {
      success: true,
      total: results.length,
      started: successCount,
      failed: results.length - successCount,
      results,
    };
  }),

  /**
   * 一键停止所有引擎（保留 MySQL）
   */
  stopAll: publicProcedure
    .input(z.object({ keepMySQL: z.boolean().optional().default(true) }).optional())
    .mutation(async ({ input }) => {
      const results = await dockerManager.stopAll(input?.keepMySQL ?? true);
      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        total: results.length,
        stopped: successCount,
        failed: results.length - successCount,
        results,
      };
    }),

  /**
   * 获取引擎日志
   */
  getEngineLogs: publicProcedure
    .input(z.object({
      containerName: z.string(),
      tail: z.number().optional().default(100),
    }))
    .query(async ({ input }) => {
      try {
        const logs = await dockerManager.getEngineLogs(input.containerName, input.tail);
        return { success: true, logs };
      } catch (e: any) {
        return { success: false, logs: '', error: e.message };
      }
    }),

  /**
   * 获取引擎资源统计
   */
  getEngineStats: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .query(async ({ input }) => {
      return dockerManager.getEngineStats(input.containerName);
    }),

  /**
   * 一键启动 MySQL：启动容器 + 配置 DATABASE_URL + 运行迁移 + 重连数据库
   * 实现真正的一键可用
   */
  bootstrapMySQL: publicProcedure.mutation(async () => {
    const steps: { step: string; status: 'ok' | 'fail' | 'skip'; detail?: string }[] = [];

    // Step 1: 启动 Docker 容器
    try {
      const result = await dockerManager.startEngine('portai-mysql');
      if (result.success) {
        steps.push({ step: '启动容器', status: 'ok', detail: 'portai-mysql 已启动' });
      } else if (result.error === 'ALREADY_RUNNING') {
        steps.push({ step: '启动容器', status: 'skip', detail: 'portai-mysql 已在运行' });
      } else {
        steps.push({ step: '启动容器', status: 'fail', detail: result.message || result.error });
        return { success: false, steps, error: `容器启动失败: ${result.error}` };
      }
    } catch (e: any) {
      steps.push({ step: '启动容器', status: 'fail', detail: e.message });
      return { success: false, steps, error: `Docker 连接失败: ${e.message}` };
    }

    // Step 2: 配置 DATABASE_URL
    const dbUrl = 'mysql://portai:portai123@localhost:3306/portai_nexus';
    const hadUrl = !!process.env.DATABASE_URL;
    process.env.DATABASE_URL = dbUrl;
    steps.push({
      step: '配置 DATABASE_URL',
      status: 'ok',
      detail: hadUrl ? '已更新为本地连接' : '已设置本地连接',
    });

    // Step 3: 等待 MySQL 就绪
    log.info('[bootstrapMySQL] Waiting for MySQL to be ready...');
    const ready = await waitForMySQL(dbUrl);
    if (!ready) {
      steps.push({ step: '等待 MySQL 就绪', status: 'fail', detail: '超时 30 秒，MySQL 未响应' });
      return { success: false, steps, error: 'MySQL 启动超时' };
    }
    steps.push({ step: '等待 MySQL 就绪', status: 'ok', detail: 'MySQL 已响应' });

    // Step 4: 运行数据库迁移
    const migrateResult = await runMigrations(dbUrl);
    if (migrateResult.success) {
      steps.push({ step: '数据库迁移', status: 'ok', detail: '表结构已同步' });
    } else {
      steps.push({ step: '数据库迁移', status: 'fail', detail: migrateResult.error });
      // 迁移失败不阻断，可能表已存在
    }

    // Step 5: 重置 ORM 连接
    resetDb();
    const db = await getDb();
    if (db) {
      steps.push({ step: '数据库连接', status: 'ok', detail: 'ORM 已重新连接' });
    } else {
      steps.push({ step: '数据库连接', status: 'fail', detail: 'ORM 连接失败' });
    }

    const allOk = steps.every(s => s.status !== 'fail');
    log.info(`[bootstrapMySQL] Complete: ${allOk ? 'SUCCESS' : 'PARTIAL'}`, steps);
    return { success: allOk, steps };
  }),
});
