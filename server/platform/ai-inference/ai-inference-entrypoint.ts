/**
 * AI 推理服务独立进程入口
 *
 * 独立运行时:
 *   AI_GRPC_PORT=50053 AI_HEALTH_PORT=3090 \
 *     npx tsx server/platform/ai-inference/ai-inference-entrypoint.ts
 *
 * 启动流程:
 *   1. 启动 gRPC 服务 :50053
 *   2. 启动 HTTP 健康检查 :3090
 *   3. SIGTERM/SIGINT → 优雅关闭
 */

import express from 'express';
import { AIInferenceGrpcServer } from './ai-inference-grpc-server';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('ai-inference-entrypoint');

async function main(): Promise<void> {
  const grpcPort = parseInt(process.env.AI_GRPC_PORT || '50053', 10);
  const healthPort = parseInt(process.env.AI_HEALTH_PORT || '3090', 10);

  // 1. 启动 gRPC 服务
  const grpcServer = new AIInferenceGrpcServer({ port: grpcPort });
  await grpcServer.start();

  // 2. 启动 HTTP 健康检查
  const healthApp = express();
  const { getAgentStatus } = await import('../../services/grokDiagnosticAgent.service');

  healthApp.get('/healthz', (_req, res) => {
    const s = getAgentStatus();
    res.json({ status: 'ok', provider: s.provider, model: s.model });
  });

  healthApp.get('/readyz', (_req, res) => {
    const s = getAgentStatus();
    res.json({ status: s.enabled ? 'ready' : 'degraded', provider: s.provider });
  });

  const httpServer = healthApp.listen(healthPort, '0.0.0.0', () => {
    log.info(`AI Inference health endpoint on :${healthPort}`);
  });

  // 3. 优雅关闭
  const shutdown = async () => {
    log.info('AI Inference Service shutting down...');
    httpServer.close();
    await grpcServer.shutdown();
    log.info('AI Inference Service stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  log.error('AI Inference Service failed to start:', err);
  process.exit(1);
});
