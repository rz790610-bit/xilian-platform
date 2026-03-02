/**
 * HDE 诊断服务独立进程入口
 *
 * 独立运行时:
 *   DIAGNOSIS_GRPC_PORT=50054 DIAGNOSIS_HEALTH_PORT=3095 \
 *     npx tsx server/platform/diagnosis/diagnosis-entrypoint.ts
 *
 * 启动流程:
 *   1. 启动 gRPC 服务 :50054
 *   2. 启动 HTTP 健康检查 :3095
 *   3. SIGTERM/SIGINT → 优雅关闭
 */

import express from 'express';
import { DiagnosisGrpcServer } from './diagnosis-grpc-server';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('diagnosis-entrypoint');

async function main(): Promise<void> {
  const grpcPort = parseInt(process.env.DIAGNOSIS_GRPC_PORT || '50054', 10);
  const healthPort = parseInt(process.env.DIAGNOSIS_HEALTH_PORT || '3095', 10);

  // 1. 启动 gRPC 服务
  const grpcServer = new DiagnosisGrpcServer({ port: grpcPort });
  await grpcServer.start();

  // 2. 启动 HTTP 健康检查 + REST 桥接
  const healthApp = express();
  healthApp.use(express.json({ limit: '10mb' }));

  const { createDiagnosticOrchestrator } = await import(
    '../hde/orchestrator/diagnostic-orchestrator'
  );
  const orchestrator = createDiagnosticOrchestrator();

  healthApp.get('/healthz', (_req, res) => {
    const cfg = orchestrator.getConfig();
    res.json({
      status: 'ok',
      physicsTrack: cfg.enablePhysicsTrack,
      dataTrack: cfg.enableDataTrack,
    });
  });

  healthApp.get('/readyz', (_req, res) => {
    res.json({ status: 'ready', fusionStrategy: orchestrator.getConfig().fusionStrategy });
  });

  // REST 桥接端点（供 RemoteDiagnosisProxy HTTP 调用）
  healthApp.post('/api/v1/diagnose', async (req, res) => {
    try {
      const result = await orchestrator.diagnose(req.body);
      res.json(result);
    } catch (err: any) {
      log.warn(`REST diagnose error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  healthApp.get('/api/v1/config', (_req, res) => {
    res.json(orchestrator.getConfig());
  });

  const httpServer = healthApp.listen(healthPort, '0.0.0.0', () => {
    log.info(`Diagnosis health endpoint on :${healthPort}`);
  });

  // 3. 优雅关闭
  const shutdown = async () => {
    log.info('Diagnosis Service shutting down...');
    httpServer.close();
    await grpcServer.shutdown();
    log.info('Diagnosis Service stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  log.error('Diagnosis Service failed to start:', err);
  process.exit(1);
});
