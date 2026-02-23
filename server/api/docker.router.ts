/**
 * Docker 引擎管理 tRPC 路由
 * 提供容器生命周期管理 API + 一键启动全部核心环境
 */
import { z } from 'zod';
// P0 加固：Docker 容器操作保持 adminProcedure，环境启动降为 protectedProcedure
import { adminProcedure, protectedProcedure, router } from '../core/trpc';
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
    log.warn('[bootstrap] Migration failed:', e.message);
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
    log.warn(`[composeUp] Failed: ${stderr}`);
    return { success: false, detail: stderr.substring(0, 200) };
  }
}

/** 获取容器对应的 docker-compose profile（如果有） */
const PROFILE_MAP: Record<string, string> = {
  'portai-ollama': 'llm',
};

/** 快速检测端口是否可连接（单次尝试，超时 2 秒） */
async function isPortOpen(host: string, port: number): Promise<boolean> {
  const net = await import('net');
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/** 快速检测 HTTP 服务是否可用（单次尝试） */
async function isHttpReady(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return resp.ok || resp.status < 500;
  } catch {
    return false;
  }
}

/** 服务本地端口映射（用于快速检测本地服务是否已运行） */
const LOCAL_PORT_MAP: Record<string, { type: 'tcp' | 'http'; host: string; port: number; url?: string }> = {
  'portai-mysql':      { type: 'tcp',  host: 'localhost', port: 3306 },
  'portai-redis':      { type: 'tcp',  host: 'localhost', port: 6379 },
  'portai-kafka':      { type: 'tcp',  host: 'localhost', port: 9092 },
  'portai-clickhouse': { type: 'http', host: 'localhost', port: 8123, url: 'http://localhost:8123/ping' },
  'portai-qdrant':     { type: 'http', host: 'localhost', port: 6333, url: 'http://localhost:6333/collections' },
  'portai-minio':      { type: 'http', host: 'localhost', port: 9010, url: 'http://localhost:9010/minio/health/live' },
  'portai-ollama':     { type: 'http', host: 'localhost', port: 11434, url: 'http://localhost:11434/api/tags' },
  'portai-neo4j':      { type: 'tcp',  host: 'localhost', port: 7687 },
  'portai-prometheus':  { type: 'http', host: 'localhost', port: 9090, url: 'http://localhost:9090/-/ready' },
  'portai-grafana':    { type: 'http', host: 'localhost', port: 3001, url: 'http://localhost:3001/api/health' },
};

/** 检测服务是否已在本地运行（无论是 Docker 还是 brew services） */
async function isServiceRunningLocally(containerName: string): Promise<boolean> {
  const mapping = LOCAL_PORT_MAP[containerName];
  if (!mapping) return false;
  if (mapping.type === 'http' && mapping.url) {
    return isHttpReady(mapping.url);
  }
  return isPortOpen(mapping.host, mapping.port);
}

/** 尝试启动服务：先检测本地端口（本地模式），不通才回退 Docker 启动 */
async function ensureContainerStarted(containerName: string): Promise<{ success: boolean; detail: string; method: string }> {
  // 优先检测：端口是否已经可用（本地 brew services / 已运行的 Docker 容器 / 其他方式）
  const localRunning = await isServiceRunningLocally(containerName);
  if (localRunning) {
    log.info(`[ensureContainerStarted] ${containerName} detected on local port (native/docker), skipping Docker start`);
    return { success: true, detail: `${containerName} 本地服务已运行`, method: 'local-native' };
  }

  // 本地端口不通 → 尝试 Docker API 启动
  try {
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
  } catch (e: any) {
    // Docker 完全不可用（未安装或未运行）
    return { success: false, detail: `Docker 不可用且本地服务未运行: ${e.message?.substring(0, 100)}`, method: 'unavailable' };
  }
}

// ============ 核心服务启动配置 ============
interface ServiceBootstrapConfig {
  containerName: string;
  label: string;
  icon: string;
  envVars: Record<string, string>;
  waitCheck: () => Promise<boolean>;
  postInit?: () => Promise<{ success: boolean; detail?: string }>;
  /**
   * A2-3: 服务依赖声明（待实现拓扑排序）
   * 当前 getCoreServices() 返回固定顺序，无法根据依赖关系自动调整启动顺序。
   * 建议后续迭代：
   *   1. 为每个服务声明 dependsOn（如 Redis 依赖 MySQL）
   *   2. bootstrapAll 中先计算拓扑排序，再按序启动
   *   3. 支持并行启动无依赖关系的服务（如 Redis 和 Kafka 可并行）
   */
  dependsOn?: string[];
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
        // P1-1: 迁移失败时立即返回 success:false，阻断后续服务启动
        // 原始问题: 迁移失败后仍继续启动并返回 success:true，后续服务因表结构缺失报错
        if (!migrate.success) {
          log.warn(`[bootstrap] MySQL migration failed: ${migrate.error}. Aborting post-init.`);
          return { success: false, detail: `迁移失败: ${migrate.error}。后续服务启动已阻断，请修复迁移问题后重试。` };
        }
        resetDb();
        const db = await getDb();
        if (!db) return { success: false, detail: 'ORM 重连失败' };
        return { success: true, detail: '迁移完成 + ORM 已连接' };
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
  // Docker 连接状态检查是只读操作，降为 protectedProcedure
  checkConnection: protectedProcedure.query(async () => {
    return dockerManager.checkConnection();
  }),

  /**
   * 列出所有 PortAI 引擎容器
   */
  // 容器列表是只读操作，降为 protectedProcedure
  listEngines: protectedProcedure.query(async () => {
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
  startEngine: adminProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.startEngine(input.containerName);
    }),

  /**
   * 停止指定引擎
   */
  stopEngine: adminProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.stopEngine(input.containerName);
    }),

  /**
   * 重启指定引擎
   */
  restartEngine: adminProcedure
    .input(z.object({ containerName: z.string() }))
    .mutation(async ({ input }) => {
      return dockerManager.restartEngine(input.containerName);
    }),

  /**
   * 一键启动所有引擎
   */
  startAll: adminProcedure.mutation(async () => {
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
  stopAll: adminProcedure
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
  // 日志查看是只读操作，降为 protectedProcedure
  getEngineLogs: protectedProcedure
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
  // 状态查看是只读操作，降为 protectedProcedure
  getEngineStats: protectedProcedure
    .input(z.object({ containerName: z.string() }))
    .query(async ({ input }) => {
      return dockerManager.getEngineStats(input.containerName);
    }),

  /**
   * 一键启动核心环境：MySQL + Redis + Kafka + ClickHouse + Qdrant + MinIO
   * 智能检测：优先检测本地服务（brew services 等），不通才回退 Docker 启动
   * 流程：检测/启动服务 → 配置环境变量 → 等待就绪 → 后置初始化（迁移/种子数据）
   */
  // 一键启动是开发者日常操作，降为 protectedProcedure（仅需登录，无需 admin）
  bootstrapAll: protectedProcedure.mutation(async () => {
    const services = getCoreServices();
    const allSteps: { service: string; icon: string; steps: BootstrapStep[] }[] = [];

    for (const svc of services) {
      const steps: BootstrapStep[] = [];

      // Step 1: 启动服务（优先检测本地端口，不通才回退 Docker）
      try {
        const startResult = await ensureContainerStarted(svc.containerName);
        if (startResult.success) {
          const isNative = startResult.method === 'local-native';
          const isSkip = startResult.method === 'already-running' || isNative;
          steps.push({
            step: isNative ? '检测本地服务' : '启动容器',
            status: isSkip ? 'skip' : 'ok',
            detail: startResult.detail,
          });
        } else {
          steps.push({ step: '启动服务', status: 'fail', detail: startResult.detail });
          allSteps.push({ service: svc.label, icon: svc.icon, steps });
          continue;
        }
      } catch (e: any) {
        steps.push({ step: '启动服务', status: 'fail', detail: e.message });
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
  // 可选服务启动同样降为 protectedProcedure
  bootstrapOptionalService: protectedProcedure
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

      // Step 1: 启动服务（优先检测本地端口，不通才回退 Docker）
      try {
        const startResult = await ensureContainerStarted(containerName);
        if (startResult.success) {
          const isNative = startResult.method === 'local-native';
          const isSkip = startResult.method === 'already-running' || isNative;
          steps.push({
            step: isNative ? '检测本地服务' : '启动容器',
            status: isSkip ? 'skip' : 'ok',
            detail: startResult.detail,
          });
        } else {
          steps.push({ step: '启动服务', status: 'fail', detail: startResult.detail });
          return { success: false, containerName, steps };
        }
      } catch (e: any) {
        steps.push({ step: '启动服务', status: 'fail', detail: e.message });
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
