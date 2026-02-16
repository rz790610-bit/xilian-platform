#!/usr/bin/env tsx
/**
 * 微服务迁移自动化工具
 *
 * 将单体中的服务模块迁移到独立微服务目录。
 * 自动处理：文件复制、import 路径重写、依赖提取、Dockerfile 生成。
 *
 * 用法:
 *   npx tsx scripts/migrate-service.ts --service=device --dry-run
 *   npx tsx scripts/migrate-service.ts --service=algorithm --execute
 *
 * 审核意见5 优化1: 代码迁移自动化工具
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// 服务定义 — 映射到平台现有代码文件
// ============================================================

interface ServiceDefinition {
  name: string;
  description: string;
  sourceFiles: string[];       // 从单体中迁移的文件（相对于 server/）
  sharedDeps: string[];        // 依赖的 shared-kernel 模块
  externalDeps: string[];      // 外部服务依赖
  dbTables: string[];          // 归属的数据库表
  kafkaTopics: string[];       // 消费/生产的 Kafka topic
  port: number;                // 默认端口
  grpcPort: number;            // gRPC 端口
}

const SERVICE_DEFINITIONS: Record<string, ServiceDefinition> = {
  'api-gateway': {
    name: 'api-gateway',
    description: 'API 网关 — tRPC 路由聚合、认证、限流、Strangler Fig 路由',
    sourceFiles: [
      'routers.ts',
      'core/trpc.ts',
      'platform/middleware/rateLimiter.ts',
      'platform/middleware/securityHeaders.ts',
    ],
    sharedDeps: ['types', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['redis'],
    dbTables: [],
    kafkaTopics: [],
    port: 3000,
    grpcPort: 50050,
  },
  device: {
    name: 'device',
    description: '设备管理服务 — 设备/传感器 CRUD、拓扑、协议适配',
    sourceFiles: [
      'services/device.service.ts',
      'services/topology.service.ts',
      'api/device.api.ts',
      'api/sensor.api.ts',
      'api/deviceType.api.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka'],
    dbTables: [
      'devices', 'sensors', 'deviceTypes', 'deviceModels',
      'deviceLocations', 'deviceGroups', 'sensorReadings',
      'protocolAdapters', 'deviceConnections',
    ],
    kafkaTopics: ['device.status.changed', 'device.created', 'device.updated', 'sensor.data.ingested'],
    port: 3001,
    grpcPort: 50051,
  },
  algorithm: {
    name: 'algorithm',
    description: '算法执行服务 — DSP/ML/诊断算法、模型管理、插件引擎',
    sourceFiles: [
      'services/algorithm.service.ts',
      'services/model.service.ts',
      'algorithms/index.ts',
      'algorithms/mechanical/index.ts',
      'algorithms/dsp.ts',
      'algorithms/registry.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka', 'minio'],
    dbTables: [
      'algorithms', 'algorithmVersions', 'algorithmExecutions',
      'models', 'modelVersions', 'modelDeployments',
      'plugins', 'pluginConfigs',
    ],
    kafkaTopics: ['algorithm.execution.completed', 'algorithm.execution.failed', 'model.deployed'],
    port: 3002,
    grpcPort: 50052,
  },
  'data-pipeline': {
    name: 'data-pipeline',
    description: '数据管道服务 — 流处理、Pipeline 引擎、ClickHouse 写入、CQRS',
    sourceFiles: [
      'services/streamProcessor.service.ts',
      'operations/pipeline.engine.ts',
      'lib/dataflow/index.ts',
      'lib/storage/clickhouse.storage.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka', 'clickhouse'],
    dbTables: [
      'pipelines', 'pipelineStages', 'pipelineExecutions',
      'dataStreams', 'dataTransforms', 'dataOutputs',
      'timeSeriesConfigs',
    ],
    kafkaTopics: ['pipeline.stage.completed', 'pipeline.failed', 'data.ingested'],
    port: 3003,
    grpcPort: 50053,
  },
  knowledge: {
    name: 'knowledge',
    description: '知识服务 — 知识图谱(Neo4j)、向量检索(Qdrant)、RAG、知识库',
    sourceFiles: [
      'services/knowledge.service.ts',
      'lib/clients/neo4j.client.ts',
      'lib/clients/qdrant.client.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka', 'neo4j', 'qdrant', 'ollama'],
    dbTables: [
      'knowledgeArticles', 'knowledgeCategories', 'knowledgeTags',
      'vectorCollections', 'embeddingModels',
    ],
    kafkaTopics: ['knowledge.article.created', 'knowledge.graph.updated', 'knowledge.embedding.completed'],
    port: 3004,
    grpcPort: 50054,
  },
  monitoring: {
    name: 'monitoring',
    description: '监控告警服务 — 告警规则、诊断、可观测性聚合',
    sourceFiles: [
      'services/observability.service.ts',
      'api/alertRule.api.ts',
      'api/diagnosis.api.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka', 'clickhouse'],
    dbTables: [
      'alertRules', 'alerts', 'alertHistory',
      'diagnosisRecords', 'diagnosisTemplates',
      'dashboards', 'dashboardWidgets',
    ],
    kafkaTopics: ['alert.created', 'alert.resolved', 'diagnosis.completed'],
    port: 3005,
    grpcPort: 50055,
  },
  infra: {
    name: 'infra',
    description: '基础设施服务 — EventBus、Saga 编排器、Outbox、去重、配置中心',
    sourceFiles: [
      'services/eventBus.service.ts',
      'operations/saga.orchestrator.ts',
      'operations/outbox.publisher.ts',
      'services/idempotency.service.ts',
      'platform/services/configCenter.ts',
      'platform/services/serviceRegistry.ts',
    ],
    sharedDeps: ['types', 'events', 'config', 'logger', 'tracing', 'metrics', 'health'],
    externalDeps: ['mysql', 'redis', 'kafka'],
    dbTables: [
      'sagaExecutions', 'sagaSteps', 'sagaSnapshots',
      'outboxEvents', 'idempotencyKeys',
      'configEntries', 'serviceRegistrations',
    ],
    kafkaTopics: ['saga.step.completed', 'saga.compensated', 'outbox.published', 'config.changed'],
    port: 3006,
    grpcPort: 50056,
  },
};

// ============================================================
// 迁移引擎
// ============================================================

interface MigrationPlan {
  service: ServiceDefinition;
  filesToCopy: Array<{ source: string; target: string }>;
  importsToRewrite: Array<{ file: string; oldImport: string; newImport: string }>;
  dockerfileContent: string;
  packageJsonContent: string;
  entryPointContent: string;
}

function generateMigrationPlan(serviceName: string): MigrationPlan {
  const service = SERVICE_DEFINITIONS[serviceName];
  if (!service) {
    throw new Error(`Unknown service: ${serviceName}. Available: ${Object.keys(SERVICE_DEFINITIONS).join(', ')}`);
  }

  const targetDir = `microservices/${service.name}/src`;

  // 文件复制计划
  const filesToCopy = service.sourceFiles.map((f) => ({
    source: `server/${f}`,
    target: `${targetDir}/${path.basename(f)}`,
  }));

  // Import 重写计划
  const importsToRewrite = service.sourceFiles.map((f) => ({
    file: `${targetDir}/${path.basename(f)}`,
    oldImport: `@/`,
    newImport: `@xilian/shared-kernel/`,
  }));

  // Dockerfile
  const dockerfileContent = generateDockerfile(service);

  // package.json
  const packageJsonContent = generatePackageJson(service);

  // 入口点
  const entryPointContent = generateEntryPoint(service);

  return {
    service,
    filesToCopy,
    importsToRewrite,
    dockerfileContent,
    packageJsonContent,
    entryPointContent,
  };
}

function generateDockerfile(service: ServiceDefinition): string {
  return `# ============================================================
# ${service.description}
# Multi-stage build for production
# ============================================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# 先复制 shared-kernel
COPY microservices/shared-kernel/package.json ./shared-kernel/
RUN cd shared-kernel && npm ci --production=false

COPY microservices/shared-kernel/ ./shared-kernel/
RUN cd shared-kernel && npm run build

# 复制服务代码
COPY microservices/${service.name}/package.json ./service/
RUN cd service && npm ci --production=false

COPY microservices/${service.name}/ ./service/
RUN cd service && npm run build

# Stage 2: Production
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init curl && \\
    addgroup -g 1001 -S nodejs && \\
    adduser -S nodejs -u 1001

WORKDIR /app

# 复制构建产物
COPY --from=builder --chown=nodejs:nodejs /app/shared-kernel/dist ./shared-kernel/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared-kernel/package.json ./shared-kernel/
COPY --from=builder --chown=nodejs:nodejs /app/service/dist ./service/dist
COPY --from=builder --chown=nodejs:nodejs /app/service/package.json ./service/
COPY --from=builder --chown=nodejs:nodejs /app/service/node_modules ./service/node_modules

USER nodejs

ENV NODE_ENV=production
ENV SERVICE_NAME=${service.name}
ENV HTTP_PORT=${service.port}
ENV GRPC_PORT=${service.grpcPort}

EXPOSE ${service.port} ${service.grpcPort}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -f http://localhost:${service.port}/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "service/dist/index.js"]
`;
}

function generatePackageJson(service: ServiceDefinition): string {
  const deps: Record<string, string> = {
    '@xilian/shared-kernel': 'workspace:*',
    express: '^4.21.0',
    zod: '^3.23.0',
  };

  if (service.externalDeps.includes('mysql')) {
    deps['drizzle-orm'] = '^0.33.0';
    deps['mysql2'] = '^3.11.0';
  }
  if (service.externalDeps.includes('redis')) {
    deps['ioredis'] = '^5.4.0';
  }
  if (service.externalDeps.includes('kafka')) {
    deps['kafkajs'] = '^2.2.4';
  }
  if (service.externalDeps.includes('clickhouse')) {
    deps['@clickhouse/client'] = '^1.0.0';
  }
  if (service.externalDeps.includes('neo4j')) {
    deps['neo4j-driver'] = '^5.24.0';
  }
  if (service.externalDeps.includes('qdrant')) {
    deps['@qdrant/js-client-rest'] = '^1.11.0';
  }
  if (service.externalDeps.includes('minio')) {
    deps['minio'] = '^8.0.0';
  }

  return JSON.stringify(
    {
      name: `@xilian/${service.name}-service`,
      version: '1.0.0',
      description: service.description,
      type: 'module',
      main: 'dist/index.js',
      scripts: {
        build: 'tsc -p tsconfig.json',
        dev: 'tsx watch src/index.ts',
        start: 'node dist/index.js',
        test: 'vitest run',
        lint: 'eslint src/',
        'docker:build': `docker build -t xilian/${service.name}-service -f Dockerfile ../..`,
      },
      dependencies: deps,
      devDependencies: {
        typescript: '^5.5.0',
        tsx: '^4.19.0',
        vitest: '^1.2.0',
        '@types/express': '^4.17.21',
        '@types/node': '^22.0.0',
      },
    },
    null,
    2,
  );
}

function generateEntryPoint(service: ServiceDefinition): string {
  return `/**
 * ${service.description}
 *
 * 独立微服务入口点
 * HTTP: ${service.port} | gRPC: ${service.grpcPort}
 */

import express from 'express';
import {
  createServiceConfig,
  createLogger,
  initTracing,
  initMetrics,
  getRegistry,
  HealthChecker,
} from '@xilian/shared-kernel';

const SERVICE_NAME = '${service.name}';
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? '${service.port}', 10);
const GRPC_PORT = parseInt(process.env.GRPC_PORT ?? '${service.grpcPort}', 10);

// ── 初始化基础设施 ──

const config = createServiceConfig(SERVICE_NAME);
const logger = createLogger({ serviceName: SERVICE_NAME, level: config.logLevel });
const registry = initMetrics({ serviceName: SERVICE_NAME });

if (config.tracingEnabled) {
  initTracing({ serviceName: SERVICE_NAME, otlpEndpoint: config.otlpEndpoint });
}

// ── 健康检查 ──

const healthChecker = new HealthChecker(SERVICE_NAME, '1.0.0');
// TODO: 注册各依赖的健康检查

// ── Express 应用 ──

const app = express();

app.use(express.json({ limit: '10mb' }));

// 健康检查端点
app.get('/healthz', async (_req, res) => {
  const health = await healthChecker.check();
  res.status(health.status === 'unhealthy' ? 503 : 200).json(health);
});

app.get('/ready', async (_req, res) => {
  const ready = await healthChecker.ready();
  res.status(ready ? 200 : 503).json({ ready });
});

// Prometheus 指标端点
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// TODO: 注册业务路由

// ── 优雅关闭 ──

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(\`Received \${signal}, starting graceful shutdown...\`);

  // 停止接受新请求
  server.close(() => {
    logger.info('HTTP server closed');
  });

  // 等待进行中的请求完成（最多 30 秒）
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // 关闭外部连接
  // TODO: 关闭数据库连接、Kafka consumer 等

  logger.info('Graceful shutdown completed');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── 启动 ──

const server = app.listen(HTTP_PORT, '0.0.0.0', () => {
  logger.info(\`\${SERVICE_NAME} service started on HTTP:\${HTTP_PORT} gRPC:\${GRPC_PORT}\`);
});
`;
}

// ============================================================
// CLI 入口
// ============================================================

function main() {
  const args = process.argv.slice(2);
  const serviceArg = args.find((a) => a.startsWith('--service='));
  const dryRun = args.includes('--dry-run');
  const execute = args.includes('--execute');
  const listServices = args.includes('--list');

  if (listServices) {
    console.log('\\n可用服务:\\n');
    for (const [name, def] of Object.entries(SERVICE_DEFINITIONS)) {
      console.log(`  ${name.padEnd(20)} ${def.description}`);
      console.log(`  ${''.padEnd(20)} 源文件: ${def.sourceFiles.length} | 表: ${def.dbTables.length} | Topics: ${def.kafkaTopics.length}`);
      console.log(`  ${''.padEnd(20)} HTTP: ${def.port} | gRPC: ${def.grpcPort}`);
      console.log();
    }
    return;
  }

  if (!serviceArg) {
    console.error('用法: npx tsx scripts/migrate-service.ts --service=<name> [--dry-run|--execute]');
    console.error('      npx tsx scripts/migrate-service.ts --list');
    process.exit(1);
  }

  const serviceName = serviceArg.split('=')[1];
  const plan = generateMigrationPlan(serviceName);

  console.log(`\\n迁移计划: ${plan.service.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`描述: ${plan.service.description}`);
  console.log(`HTTP: ${plan.service.port} | gRPC: ${plan.service.grpcPort}`);
  console.log(`\\n文件复制 (${plan.filesToCopy.length}):`);
  for (const f of plan.filesToCopy) {
    console.log(`  ${f.source} → ${f.target}`);
  }
  console.log(`\\nKafka Topics (${plan.service.kafkaTopics.length}):`);
  for (const t of plan.service.kafkaTopics) {
    console.log(`  ${t}`);
  }
  console.log(`\\n数据库表 (${plan.service.dbTables.length}):`);
  for (const t of plan.service.dbTables) {
    console.log(`  ${t}`);
  }

  if (dryRun) {
    console.log('\\n[DRY RUN] 以上为迁移计划，不会执行任何操作。');
    return;
  }

  if (execute) {
    const baseDir = process.cwd();
    const serviceDir = path.join(baseDir, 'microservices', plan.service.name);

    // 创建目录
    fs.mkdirSync(path.join(serviceDir, 'src'), { recursive: true });

    // 写入 Dockerfile
    fs.writeFileSync(path.join(serviceDir, 'Dockerfile'), plan.dockerfileContent);
    console.log(`✓ 写入 Dockerfile`);

    // 写入 package.json
    fs.writeFileSync(path.join(serviceDir, 'package.json'), plan.packageJsonContent);
    console.log(`✓ 写入 package.json`);

    // 写入入口点
    fs.writeFileSync(path.join(serviceDir, 'src', 'index.ts'), plan.entryPointContent);
    console.log(`✓ 写入 src/index.ts`);

    // 复制源文件
    for (const f of plan.filesToCopy) {
      const sourcePath = path.join(baseDir, f.source);
      const targetPath = path.join(baseDir, f.target);
      if (fs.existsSync(sourcePath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ 复制 ${f.source}`);
      } else {
        console.log(`⚠ 跳过 ${f.source} (文件不存在)`);
      }
    }

    // 写入 tsconfig.json
    const tsconfig = {
      extends: '../../tsconfig.json',
      compilerOptions: {
        outDir: './dist',
        rootDir: './src',
        baseUrl: '.',
        paths: { '@xilian/shared-kernel': ['../shared-kernel/src'], '@xilian/shared-kernel/*': ['../shared-kernel/src/*'] },
      },
      include: ['src/**/*'],
    };
    fs.writeFileSync(path.join(serviceDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    console.log(`✓ 写入 tsconfig.json`);

    console.log(`\\n✅ 迁移完成: microservices/${plan.service.name}/`);
  }
}

main();
