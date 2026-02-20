/**
 * ============================================================================
 * 平台核心领域路由聚合 — 基础设施层
 * ============================================================================
 * 职责边界：系统管理 + 认证 + 监控 + 数据库 + 注册中心 + 可观测性 + 基础设施
 * 复用现有路由
 */

import { router, publicProcedure } from '../../core/trpc';
import { COOKIE_NAME } from '@shared/const';
import { getSessionCookieOptions } from '../../core/cookies';
// 复用现有路由
import { systemRouter } from '../../core/systemRouter';
import { systemRoutes } from '../../platform/routes/system.routes';
import { authRoutes } from '../../platform/routes/auth.routes';
import { monitoringRoutes } from '../../business/routes/monitoring.routes';
import { databaseRouter } from '../../api/database.router';
import { registryRouter } from '../../api/registry.router';
import { infrastructureRouter } from '../../api/infrastructure.router';
import { observabilityRouter } from '../../api/observability.router';
import { kafkaRouter } from '../../api/kafka.router';
import { redisRouter } from '../../api/redis.router';
import { clickhouseRouter } from '../../api/clickhouse.router';
import { dockerRouter } from '../../api/docker.router';
import { outboxRouter } from '../../api/outbox.router';
import { sagaRouter } from '../../api/saga.router';
import { deduplicationRouter } from '../../api/deduplication.router';
import { readReplicaRouter } from '../../api/readReplica.router';
import { microserviceRouter } from '../../api/microservice.router';
import { platformHealthRouter } from '../../api/platformHealth.router';
import { pluginRouter } from '../../api/plugin.router';

export const platformDomainRouter = router({
  /** 系统核心 */
  system: systemRouter,
  /** 认证 */
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  /** 平台基础层 */
  platformSystem: systemRoutes,
  platformAuth: authRoutes,
  /** 监控 */
  monitoring: monitoringRoutes,
  /** 数据库管理 */
  database: databaseRouter,
  /** 注册中心 */
  registry: registryRouter,
  /** 基础设施 */
  infrastructure: infrastructureRouter,
  /** 可观测性 */
  observability: observabilityRouter,
  /** Kafka */
  kafka: kafkaRouter,
  /** Redis */
  redis: redisRouter,
  /** ClickHouse */
  clickhouse: clickhouseRouter,
  /** Docker */
  docker: dockerRouter,
  /** Outbox */
  outbox: outboxRouter,
  /** Saga */
  saga: sagaRouter,
  /** 去重 */
  deduplication: deduplicationRouter,
  /** 读写分离 */
  readReplica: readReplicaRouter,
  /** 微服务监控 */
  microservice: microserviceRouter,
  /** 平台健康 */
  platformHealth: platformHealthRouter,
  /** 插件 */
  plugin: pluginRouter,
});
