/**
 * Docker 引擎管理 tRPC 路由
 * 提供容器生命周期管理 API + 一键启动全部核心环境
 */
import { z } from 'zod';
import { publicProcedure, router } from '../core/trpc';
import { dockerManager, ENGINE_REGISTRY } from '../services/docker/dockerManager.service';
import { resetDb, getDb } from '../lib/db/index';
import { createModuleLogger } from '../core/logger';
import { execSync } from 'child_process';
import path from 'path';

const log = createModuleLogger('docker-router');

// ============ 辅助函数 ============

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
    log.error('[bootstrap] Migration failed:', e.message);
    return { success: false, error: e.message };
  }
}

/** 通用 TCP 端口等待（最多 maxRetries * 2 秒） */
async function waitForPort(host: string, port: number, maxRetries = 15): Promise<boolean> {
  const net = await import('net');
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(2000);
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
        socket.on('error', reject);
        socket.connect(port, host);
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

/** 等待 HTTP 服务就绪 */
async function waitForHttp(url: string, maxRetries = 15): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (resp.ok || resp.status < 500) return true;
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

// ============ 步骤类型 ============
type StepStatus = 'ok' | 'fail' | 'skip';
interface BootstrapStep {
  step: string;
  status: StepStatus;
  detail?: string;
}

/** 通过 docker-compose up -d 创建并启动服务（当容器不存在时） */
function composeUp(serviceName: string, profile?: string): { success: boolean; detail: string } {
  try {
    const composePath = path.resolve(process.cwd(), 'docker-compose.yml');
    const profileFlag = profile ? `--profile ${profile} ` : '';
    const cmd = `docker compose -f ${composePath} ${profileFlag}up -d ${serviceName}`;
    log.info(`[composeUp] Running: ${cmd}`);
    execSync(cmd, { timeout: 120000, stdio: 'pipe' });
    return { success: true, detail: `docker compose up -d ${serviceName} 成功` };
  } catch (e: any) {
    const stderr = e.stderr?.toString() || e.message;
    log.error(`[composeUp] Failed: ${stderr}`);
    return { success: false, detail: stderr.substring(0, 200) };
  }
}

/** 获取容器对应的 docker-compose profile（如果有） */
const PROFILE_MAP: Record<string, string> = {
  'portai-ollama': 'llm',
};

/** 尝试启动容器：先用 Docker API，如果 NOT_FOUND 则用 docker-compose 创建 */
async function ensureContainerStarted(containerName: string): Promise<{ success: boolean; detail: string; method: string }> {
  // 先尝试 Docker API 启动（容器已存在的情况）
  const result = await dockerManager.startEngine(containerName);
  if (result.success) {
    return { success: true, detail: `${containerName} 已启动`, method: 'docker-api' };
  }
  if (result.error === 'ALREADY_RUNNING') {
    return { success: true, detail: `${containerName} 已在运行`, method: 'already-running' };
  }
  // NOT_FOUND — 容器未创建，使用 docker-compose 创建
  if (result.error === 'NOT_FOUND') {
    const meta = ENGINE_REGISTRY[containerName];
    if (!meta) {
      return { success: false, detail: `未知容器: ${containerName}`, method: 'unknown' };
    }
    const profile = PROFILE_MAP[containerName];
    log.info(`[ensureContainerStarted] Container ${containerName} not found, using docker-compose up -d ${meta.serviceName}`);
    const composeResult = composeUp(meta.serviceName, profile);
    return { success: composeResult.success, detail: composeResult.detail, method: 'docker-compose' };
  }
  return { success: false, detail: result.message || result.error || '启动失败', method: 'docker-api-error' };
}

// ============ 核心服务启动配置 ============
interface ServiceBootstrapConfig {
  containerName: string;
  label: string;
  icon: string;
  envVars: Record<string, string>;
  waitCheck: () => Promise<boolean>;
  postInit?: () => Promise<{ success: boolean; detail?: string }>;
}

function getCoreServices(): ServiceBootstrapConfig[] {
  return [
    {
      containerName: 'portai-mysql',
      label: 'MySQL 数据库',
      icon: '🐬',
      envVars: {
        DATABASE_URL: 'mysql://portai:portai123@localhost:3306/portai_nexus',
      },
      waitCheck: () => waitForPort('localhost', 3306),
      postInit: async () => {
        // 迁移 + ORM 重连 + 种子数据
        const dbUrl = 'mysql://portai:portai123@localhost:3306/portai_nexus';
        const ready = await waitForMySQL(dbUrl);
        if (!ready) return { success: false, detail: 'MySQL 连接超时' };
        const migrate = await runMigrations(dbUrl);
        resetDb();
        const db = await getDb();
        if (!db) return { success: false, detail: 'ORM 重连失败' };
        return { success: true, detail: migrate.success ? '迁移完成 + ORM 已连接' : `迁移警告: ${migrate.error}，ORM 已连接` };
      },
    },
    {
      containerName: 'portai-redis',
      label: 'Redis 缓存',
      icon: '🔴',
      envVars: {
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
      },
      waitCheck: () => waitForPort('localhost', 6379),
    },
    {
      containerName: 'portai-kafka',
      label: 'Kafka 消息队列',
      icon: '📨',
      envVars: {
        KAFKA_BROKERS: 'localhost:9092',
        KAFKA_CLIENT_ID: 'xilian-platform',
      },
      waitCheck: () => waitForPort('localhost', 9092),
    },
    {
      containerName: 'portai-clickhouse',
      label: 'ClickHouse 时序库',
      icon: '🏠',
      envVars: {
        CLICKHOUSE_HOST: 'http://localhost:8123',
        CLICKHOUSE_USER: 'portai',
        CLICKHOUSE_PASSWORD: 'portai123',
        CLICKHOUSE_DATABASE: 'portai_timeseries',
      },
      waitCheck: () => waitForHttp('http://localhost:8123/ping'),
    },
    {
      containerName: 'portai-qdrant',
      label: 'Qdrant 向量库',
      icon: '🔮',
      envVars: {
        QDRANT_HOST: 'localhost',
        QDRANT_PORT: '6333',
      },
      waitCheck: () => waitForHttp('http://localhost:6333/collections'),
    },
    {
      containerName: 'portai-minio',
      label: 'MinIO 对象存储',
      icon: '📦',
      envVars: {
        MINIO_ENDPOINT: 'http://localhost:9010',
        MINIO_ACCESS_KEY: 'portai',
        MINIO_SECRET_KEY: 'portai123456',
      },
      waitCheck: () => waitForHttp('http://localhost:9010/minio/health/live'),
    },
  ];
}

// ============ 路由定义 ============
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
      return { success: false, engines: [], error: e.message };
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
   * 一键启动核心环境：MySQL + Redis + Kafka + ClickHouse + Qdrant + MinIO
   * 按顺序启动容器 → 配置环境变量 → 等待就绪 → 后置初始化（迁移/种子数据）
   */
  bootstrapAll: publicProcedure.mutation(async () => {
    const services = getCoreServices();
    const allSteps: { service: string; icon: string; steps: BootstrapStep[] }[] = [];

    for (const svc of services) {
      const steps: BootstrapStep[] = [];

      // Step 1: 启动容器（先 Docker API，NOT_FOUND 时 docker-compose 创建）
      try {
        const startResult = await ensureContainerStarted(svc.containerName);
        if (startResult.success) {
          steps.push({
            step: '启动容器',
            status: startResult.method === 'already-running' ? 'skip' : 'ok',
            detail: startResult.detail,
          });
        } else {
          steps.push({ step: '启动容器', status: 'fail', detail: startResult.detail });
          allSteps.push({ service: svc.label, icon: svc.icon, steps });
          continue;
        }
      } catch (e: any) {
        steps.push({ step: '启动容器', status: 'fail', detail: e.message });
        allSteps.push({ service: svc.label, icon: svc.icon, steps });
        continue;
      }

      // Step 2: 配置环境变量
      for (const [key, value] of Object.entries(svc.envVars)) {
        process.env[key] = value;
      }
      steps.push({
        step: '配置环境变量',
        status: 'ok',
        detail: Object.keys(svc.envVars).join(', '),
      });

      // Step 3: 等待就绪
      const ready = await svc.waitCheck();
      if (ready) {
        steps.push({ step: '等待就绪', status: 'ok', detail: '服务已响应' });
      } else {
        steps.push({ step: '等待就绪', status: 'fail', detail: '等待超时' });
        allSteps.push({ service: svc.label, icon: svc.icon, steps });
        continue;
      }

      // Step 4: 后置初始化（如果有）
      if (svc.postInit) {
        const initResult = await svc.postInit();
        steps.push({
          step: '初始化',
          status: initResult.success ? 'ok' : 'fail',
          detail: initResult.detail,
        });
      }

      allSteps.push({ service: svc.label, icon: svc.icon, steps });
    }

    const totalServices = allSteps.length;
    const successServices = allSteps.filter(s =>
      s.steps.every(st => st.status !== 'fail')
    ).length;

    log.info(`[bootstrapAll] Complete: ${successServices}/${totalServices} services OK`);
    return {
      success: successServices === totalServices,
      total: totalServices,
      succeeded: successServices,
      failed: totalServices - successServices,
      services: allSteps,
    };
  }),

  /**
   * 启动单个可选服务（Ollama/Neo4j/Prometheus/Grafana）
   * 仅启动容器 + 配置环境变量，不做复杂初始化
   */
  bootstrapOptionalService: publicProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      const steps: BootstrapStep[] = [];
      const { containerName } = input;

      // 可选服务的环境变量映射
      const optionalEnvMap: Record<string, Record<string, string>> = {
        'portai-ollama': {
          OLLAMA_HOST: 'localhost',
          OLLAMA_PORT: '11434',
        },
        'portai-neo4j': {
          NEO4J_URI: 'bolt://localhost:7687',
          NEO4J_USER: 'neo4j',
          NEO4J_PASSWORD: 'portai123',
        },
        'portai-prometheus': {
          PROMETHEUS_HOST: 'localhost',
          PROMETHEUS_PORT: '9090',
        },
        'portai-grafana': {
          GRAFANA_URL: 'http://localhost:3001',
        },
      };

      const waitChecks: Record<string, () => Promise<boolean>> = {
        'portai-ollama': () => waitForHttp('http://localhost:11434/api/tags'),
        'portai-neo4j': () => waitForPort('localhost', 7687),
        'portai-prometheus': () => waitForHttp('http://localhost:9090/-/ready'),
        'portai-grafana': () => waitForHttp('http://localhost:3001/api/health'),
      };

      // Step 1: 启动容器（先 Docker API，NOT_FOUND 时 docker-compose 创建）
      try {
        const startResult = await ensureContainerStarted(containerName);
        if (startResult.success) {
          steps.push({
            step: '启动容器',
            status: startResult.method === 'already-running' ? 'skip' : 'ok',
            detail: startResult.detail,
          });
        } else {
          steps.push({ step: '启动容器', status: 'fail', detail: startResult.detail });
          return { success: false, containerName, steps };
        }
      } catch (e: any) {
        steps.push({ step: '启动容器', status: 'fail', detail: e.message });
        return { success: false, containerName, steps };
      }

      // Step 2: 配置环境变量
      const envVars = optionalEnvMap[containerName];
      if (envVars) {
        for (const [key, value] of Object.entries(envVars)) {
          process.env[key] = value;
        }
        steps.push({ step: '配置环境变量', status: 'ok', detail: Object.keys(envVars).join(', ') });
      }

      // Step 3: 等待就绪
      const checker = waitChecks[containerName];
      if (checker) {
        const ready = await checker();
        steps.push({
          step: '等待就绪',
          status: ready ? 'ok' : 'fail',
          detail: ready ? '服务已响应' : '等待超时',
        });
      }

      const allOk = steps.every(s => s.status !== 'fail');
      return { success: allOk, containerName, steps };
    }),
});
