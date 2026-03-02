/**
 * 算法服务独立进程入口
 *
 * 独立运行时:
 *   ALGORITHM_SERVICE_PORT=50052 ALGORITHM_HEALTH_PORT=3080 \
 *     npx tsx server/platform/algorithm/algorithm-service-entrypoint.ts
 *
 * 启动流程:
 *   1. 初始化 AlgorithmEngine（注册全部算法）
 *   2. 启动 gRPC 服务 :50052
 *   3. 启动 HTTP 健康检查 :3080
 *   4. SIGTERM/SIGINT → 优雅关闭
 */

import express from 'express';
import { AlgorithmGrpcServer } from './algorithm-grpc-server';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('algorithm-service-entrypoint');

async function main(): Promise<void> {
  const grpcPort = parseInt(process.env.ALGORITHM_SERVICE_PORT || '50052', 10);
  const healthPort = parseInt(process.env.ALGORITHM_HEALTH_PORT || '3080', 10);

  // 1. 初始化 AlgorithmEngine（触发全量注册）
  const { getAlgorithmEngine } = await import('../../algorithms/index');
  const engine = getAlgorithmEngine();
  const stats = engine.getExecutionStats();
  log.info(`AlgorithmEngine ready: ${stats.registeredAlgorithms} algorithms registered`);

  // 2. 启动 gRPC 服务
  const grpcServer = new AlgorithmGrpcServer({ port: grpcPort });
  await grpcServer.start();

  // 3. 启动 HTTP 健康检查
  const healthApp = express();

  healthApp.get('/healthz', (_req, res) => {
    const s = engine.getExecutionStats();
    res.json({
      status: 'ok',
      algorithms: s.registeredAlgorithms,
      executions: s.total,
    });
  });

  healthApp.get('/readyz', (_req, res) => {
    const s = engine.getExecutionStats();
    if (s.registeredAlgorithms > 0) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not_ready', reason: 'no algorithms registered' });
    }
  });

  const httpServer = healthApp.listen(healthPort, '0.0.0.0', () => {
    log.info(`Algorithm Service health endpoint on :${healthPort}`);
  });

  // 4. 优雅关闭
  const shutdown = async () => {
    log.info('Algorithm Service shutting down...');
    httpServer.close();
    await grpcServer.shutdown();
    await engine.shutdown();
    log.info('Algorithm Service stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  log.error('Algorithm Service failed to start:', err);
  process.exit(1);
});
