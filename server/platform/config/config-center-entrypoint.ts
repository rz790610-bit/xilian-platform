/**
 * 配置中心独立进程入口
 *
 * 独立运行时:
 *   CONFIG_CENTER_PORT=8900 npx tsx server/platform/config/config-center-entrypoint.ts
 *
 * 启动流程:
 *   1. 初始化 configCenter 单例
 *   2. 创建 Express app + 挂载 config-center-server 路由
 *   3. 监听 CONFIG_CENTER_PORT（默认 8900）
 *   4. SIGTERM/SIGINT → 优雅关闭
 */

import express from 'express';
import { configCenter } from '../services/configCenter';
import { createConfigCenterApp } from './config-center-server';
import { createModuleLogger } from '../../core/logger';

const log = createModuleLogger('config-center-entrypoint');

async function main(): Promise<void> {
  const port = parseInt(process.env.CONFIG_CENTER_PORT || '8900', 10);

  // 1. 初始化 configCenter
  await configCenter.initialize();

  // 2. 创建 Express app
  const app = express();
  const configRouter = createConfigCenterApp(configCenter as any);
  app.use(configRouter);

  // 3. 启动 HTTP 服务
  const server = app.listen(port, '0.0.0.0', () => {
    log.info(`Config Center running on :${port}`);
  });

  // 4. 优雅关闭
  const shutdown = () => {
    log.info('Config Center shutting down...');
    server.close(() => {
      configCenter.shutdown();
      log.info('Config Center stopped');
      process.exit(0);
    });
    // 5s 内未关闭则强制退出
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  log.error('Config Center failed to start:', err);
  process.exit(1);
});
