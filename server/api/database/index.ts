/**
 * 数据库模块聚合路由
 * 将 18 个域路由文件组合为统一的 databaseRouter
 */
import { router } from '../../core/trpc';
import { assetRouter } from './asset.router';
import { configRouter } from './config.router';
import { sliceRouter } from './slice.router';
import { cleanRouter } from './clean.router';
import { eventRouter } from './event.router';
import { workbenchRouter } from '../workbench.router';
import { pluginDbRouter } from './pluginDb.router';
import { opsDbRouter } from './opsDb.router';
import { governanceDbRouter } from './governanceDb.router';
import { scheduleDbRouter } from './scheduleDb.router';
import { deviceDbRouter } from './deviceDb.router';
import { diagnosisDbRouter } from './diagnosisDb.router';
import { edgeDbRouter } from './edgeDb.router';
import { knowledgeDbRouter } from './knowledgeDb.router';
import { modelDbRouter } from './modelDb.router';
import { messageDbRouter } from './messageDb.router';
import { telemetryDbRouter } from './telemetryDb.router';
import { topoDbRouter } from './topoDb.router';
import { governanceExtRouter } from './governanceExt.router';

export const databaseRouter = router({
  asset: assetRouter,
  config: configRouter,
  slice: sliceRouter,
  clean: cleanRouter,
  event: eventRouter,
  workbench: workbenchRouter,
  pluginDb: pluginDbRouter,
  opsDb: opsDbRouter,
  governanceDb: governanceDbRouter,
  scheduleDb: scheduleDbRouter,
  deviceDb: deviceDbRouter,
  diagnosisDb: diagnosisDbRouter,
  edgeDb: edgeDbRouter,
  knowledgeDb: knowledgeDbRouter,
  modelDb: modelDbRouter,
  messageDb: messageDbRouter,
  telemetryDb: telemetryDbRouter,
  topoDb: topoDbRouter,
  governanceExt: governanceExtRouter,
});

export {
  assetRouter,
  configRouter,
  sliceRouter,
  cleanRouter,
  eventRouter,
  pluginDbRouter,
  opsDbRouter,
  governanceDbRouter,
  scheduleDbRouter,
  deviceDbRouter,
  diagnosisDbRouter,
  edgeDbRouter,
  knowledgeDbRouter,
  modelDbRouter,
  messageDbRouter,
  telemetryDbRouter,
  topoDbRouter,
  governanceExtRouter,
};
