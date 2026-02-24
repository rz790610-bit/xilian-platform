/**
 * 共享 Repository 模块
 *
 * 导出 DeploymentRepository 供 Canary Deployer 和 OTA Fleet Canary 使用。
 * 采用组合模式（非继承），两个模块各自保留业务逻辑，共享纯 DB 操作。
 */
export {
  DeploymentRepository,
  canaryRepository,
  otaRepository,
} from './deployment-repository';

export type {
  DeploymentRecord,
  StageRecord,
  HealthCheckRecord,
} from './deployment-repository';
