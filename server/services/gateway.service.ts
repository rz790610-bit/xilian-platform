/**
 * ============================================================
 * 网关管理服务 (gateway.service.ts)
 * 
 * 提供 Kong Admin API 的代理访问，支持：
 * - 网关状态监控（健康检查、节点信息）
 * - 路由管理（CRUD）
 * - 服务管理（CRUD）
 * - 插件管理（启用/禁用/配置）
 * - 上游管理（健康检查、目标节点）
 * - 消费者管理（API Key）
 * - 流量统计（Prometheus 指标）
 * ============================================================
 */

import { z } from 'zod';
import { router, publicProcedure } from '../core/trpc';

// ── Kong Admin API 基础配置 ──
const KONG_ADMIN_URL = process.env.KONG_ADMIN_URL || 'http://kong:8001';
const KONG_STATUS_URL = process.env.KONG_STATUS_URL || 'http://kong:8100';

const log = {
  info: (...args: any[]) => console.log('[Gateway]', ...args),
  warn: (...args: any[]) => console.warn('[Gateway]', ...args),
  error: (...args: any[]) => console.error('[Gateway]', ...args),
};

// ── Kong Admin API 请求封装 ──
async function kongRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const url = `${KONG_ADMIN_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        data: null,
        error: `Kong API 错误 (${response.status}): ${errorBody}`,
        status: response.status,
      };
    }

    // 204 No Content
    if (response.status === 204) {
      return { data: null, error: null, status: 204 };
    }

    const data = await response.json();
    return { data: data as T, error: null, status: response.status };
  } catch (err: any) {
    log.error(`Kong API 请求失败: ${path}`, err.message);
    return {
      data: null,
      error: `Kong 网关不可达: ${err.message}`,
      status: 0,
    };
  }
}

// ── Zod Schemas ──
const paginationSchema = z.object({
  offset: z.string().optional(),
  size: z.number().min(1).max(1000).default(100),
});

const routeCreateSchema = z.object({
  name: z.string().min(1),
  paths: z.array(z.string()).min(1),
  methods: z.array(z.string()).optional(),
  protocols: z.array(z.string()).default(['http', 'https']),
  strip_path: z.boolean().default(false),
  preserve_host: z.boolean().default(true),
  service: z.object({ id: z.string() }).optional(),
});

const serviceCreateSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  protocol: z.string().default('http'),
  path: z.string().optional(),
  connect_timeout: z.number().default(10000),
  write_timeout: z.number().default(60000),
  read_timeout: z.number().default(60000),
  retries: z.number().default(3),
});

const pluginCreateSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.any()).default({}),
  enabled: z.boolean().default(true),
  service: z.object({ id: z.string() }).optional().nullable(),
  route: z.object({ id: z.string() }).optional().nullable(),
  consumer: z.object({ id: z.string() }).optional().nullable(),
});

const upstreamCreateSchema = z.object({
  name: z.string().min(1),
  algorithm: z.enum(['round-robin', 'consistent-hashing', 'least-connections', 'latency']).default('round-robin'),
  hash_on: z.string().default('none'),
  healthchecks: z.record(z.any()).optional(),
});

const targetCreateSchema = z.object({
  upstreamId: z.string().min(1),
  target: z.string().min(1),  // host:port
  weight: z.number().min(0).max(65535).default(100),
});

const consumerCreateSchema = z.object({
  username: z.string().min(1),
  custom_id: z.string().optional(),
});

// ============================================================
// tRPC Router
// ============================================================
export const gatewayRouter = router({
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 网关状态
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 获取 Kong 网关状态 */
  getStatus: publicProcedure.query(async () => {
    const [nodeInfo, statusInfo] = await Promise.all([
      kongRequest<any>('/'),
      kongRequest<any>('/status'),
    ]);

    // 尝试获取 Prometheus 指标
    let metrics: string | null = null;
    try {
      const metricsRes = await fetch(`${KONG_STATUS_URL}/metrics`);
      if (metricsRes.ok) {
        metrics = await metricsRes.text();
      }
    } catch { /* ignore */ }

    return {
      connected: nodeInfo.error === null,
      node: nodeInfo.data,
      status: statusInfo.data,
      metricsAvailable: metrics !== null,
      adminUrl: KONG_ADMIN_URL,
      error: nodeInfo.error || statusInfo.error,
    };
  }),

  /** 获取 Kong 节点详细信息 */
  getNodeInfo: publicProcedure.query(async () => {
    const result = await kongRequest<any>('/');
    return result;
  }),

  /** 获取 Prometheus 指标摘要 */
  getMetrics: publicProcedure.query(async () => {
    try {
      const res = await fetch(`${KONG_STATUS_URL}/metrics`);
      if (!res.ok) {
        return { error: `指标获取失败: ${res.status}`, data: null };
      }
      const raw = await res.text();

      // 解析关键指标
      const parseMetric = (name: string): number => {
        const match = raw.match(new RegExp(`^${name}\\s+(\\d+\\.?\\d*)`, 'm'));
        return match ? parseFloat(match[1]) : 0;
      };

      return {
        error: null,
        data: {
          totalRequests: parseMetric('kong_http_requests_total'),
          totalLatencyMs: parseMetric('kong_request_latency_ms_sum'),
          activeConnections: parseMetric('kong_nginx_connections_active'),
          waitingConnections: parseMetric('kong_nginx_connections_waiting'),
          totalBandwidthIn: parseMetric('kong_bandwidth_bytes_sum{type="ingress"}'),
          totalBandwidthOut: parseMetric('kong_bandwidth_bytes_sum{type="egress"}'),
          raw: raw.substring(0, 5000),  // 截取前 5000 字符
        },
      };
    } catch (err: any) {
      return { error: err.message, data: null };
    }
  }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 路由管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出所有路由 */
  listRoutes: publicProcedure
    .input(paginationSchema.optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.offset) params.set('offset', input.offset);
      if (input?.size) params.set('size', String(input.size));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return kongRequest<any>(`/routes${qs}`);
    }),

  /** 获取单个路由 */
  getRoute: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return kongRequest<any>(`/routes/${input.id}`);
    }),

  /** 创建路由 */
  createRoute: publicProcedure
    .input(routeCreateSchema)
    .mutation(async ({ input }) => {
      log.info('创建路由:', input.name);
      return kongRequest<any>('/routes', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  /** 更新路由 */
  updateRoute: publicProcedure
    .input(z.object({ id: z.string() }).merge(routeCreateSchema.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      log.info('更新路由:', id);
      return kongRequest<any>(`/routes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }),

  /** 删除路由 */
  deleteRoute: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      log.info('删除路由:', input.id);
      return kongRequest<any>(`/routes/${input.id}`, { method: 'DELETE' });
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 服务管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出所有服务 */
  listServices: publicProcedure
    .input(paginationSchema.optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.offset) params.set('offset', input.offset);
      if (input?.size) params.set('size', String(input.size));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return kongRequest<any>(`/services${qs}`);
    }),

  /** 获取单个服务 */
  getService: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return kongRequest<any>(`/services/${input.id}`);
    }),

  /** 创建服务 */
  createService: publicProcedure
    .input(serviceCreateSchema)
    .mutation(async ({ input }) => {
      log.info('创建服务:', input.name);
      return kongRequest<any>('/services', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  /** 更新服务 */
  updateService: publicProcedure
    .input(z.object({ id: z.string() }).merge(serviceCreateSchema.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      log.info('更新服务:', id);
      return kongRequest<any>(`/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }),

  /** 删除服务 */
  deleteService: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      log.info('删除服务:', input.id);
      return kongRequest<any>(`/services/${input.id}`, { method: 'DELETE' });
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 插件管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出所有插件 */
  listPlugins: publicProcedure
    .input(paginationSchema.optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.offset) params.set('offset', input.offset);
      if (input?.size) params.set('size', String(input.size));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return kongRequest<any>(`/plugins${qs}`);
    }),

  /** 获取可用插件列表 */
  getAvailablePlugins: publicProcedure.query(async () => {
    return kongRequest<any>('/plugins/enabled');
  }),

  /** 创建/启用插件 */
  createPlugin: publicProcedure
    .input(pluginCreateSchema)
    .mutation(async ({ input }) => {
      log.info('创建插件:', input.name);
      return kongRequest<any>('/plugins', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  /** 更新插件配置 */
  updatePlugin: publicProcedure
    .input(z.object({ id: z.string() }).merge(pluginCreateSchema.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      log.info('更新插件:', id);
      return kongRequest<any>(`/plugins/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }),

  /** 启用/禁用插件 */
  togglePlugin: publicProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      log.info(`${input.enabled ? '启用' : '禁用'}插件:`, input.id);
      return kongRequest<any>(`/plugins/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: input.enabled }),
      });
    }),

  /** 删除插件 */
  deletePlugin: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      log.info('删除插件:', input.id);
      return kongRequest<any>(`/plugins/${input.id}`, { method: 'DELETE' });
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 上游管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出所有上游 */
  listUpstreams: publicProcedure
    .input(paginationSchema.optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.offset) params.set('offset', input.offset);
      if (input?.size) params.set('size', String(input.size));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return kongRequest<any>(`/upstreams${qs}`);
    }),

  /** 创建上游 */
  createUpstream: publicProcedure
    .input(upstreamCreateSchema)
    .mutation(async ({ input }) => {
      log.info('创建上游:', input.name);
      return kongRequest<any>('/upstreams', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  /** 获取上游健康状态 */
  getUpstreamHealth: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return kongRequest<any>(`/upstreams/${input.id}/health`);
    }),

  /** 列出上游目标节点 */
  listTargets: publicProcedure
    .input(z.object({ upstreamId: z.string() }))
    .query(async ({ input }) => {
      return kongRequest<any>(`/upstreams/${input.upstreamId}/targets`);
    }),

  /** 添加上游目标节点 */
  addTarget: publicProcedure
    .input(targetCreateSchema)
    .mutation(async ({ input }) => {
      const { upstreamId, ...data } = input;
      log.info('添加目标节点:', data.target, '→', upstreamId);
      return kongRequest<any>(`/upstreams/${upstreamId}/targets`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }),

  /** 删除上游目标节点 */
  removeTarget: publicProcedure
    .input(z.object({ upstreamId: z.string(), targetId: z.string() }))
    .mutation(async ({ input }) => {
      log.info('删除目标节点:', input.targetId);
      return kongRequest<any>(
        `/upstreams/${input.upstreamId}/targets/${input.targetId}`,
        { method: 'DELETE' }
      );
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 消费者管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 列出所有消费者 */
  listConsumers: publicProcedure
    .input(paginationSchema.optional())
    .query(async ({ input }) => {
      const params = new URLSearchParams();
      if (input?.offset) params.set('offset', input.offset);
      if (input?.size) params.set('size', String(input.size));
      const qs = params.toString() ? `?${params.toString()}` : '';
      return kongRequest<any>(`/consumers${qs}`);
    }),

  /** 创建消费者 */
  createConsumer: publicProcedure
    .input(consumerCreateSchema)
    .mutation(async ({ input }) => {
      log.info('创建消费者:', input.username);
      return kongRequest<any>('/consumers', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    }),

  /** 为消费者生成 API Key */
  createApiKey: publicProcedure
    .input(z.object({
      consumerId: z.string(),
      key: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const body = input.key ? { key: input.key } : {};
      return kongRequest<any>(`/consumers/${input.consumerId}/key-auth`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }),

  /** 列出消费者的 API Key */
  listApiKeys: publicProcedure
    .input(z.object({ consumerId: z.string() }))
    .query(async ({ input }) => {
      return kongRequest<any>(`/consumers/${input.consumerId}/key-auth`);
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 配置管理
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 获取当前声明式配置 */
  getConfig: publicProcedure.query(async () => {
    return kongRequest<any>('/config');
  }),

  /** 重新加载声明式配置 */
  reloadConfig: publicProcedure.mutation(async () => {
    log.info('重新加载 Kong 配置...');
    // DB-less 模式下，通过 POST /config 重新加载
    // 需要读取 kong.yml 文件内容
    return kongRequest<any>('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 综合仪表盘数据
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** 获取网关仪表盘概览数据 */
  getDashboard: publicProcedure.query(async () => {
    const [status, routes, services, plugins, upstreams, consumers] =
      await Promise.all([
        kongRequest<any>('/status'),
        kongRequest<any>('/routes'),
        kongRequest<any>('/services'),
        kongRequest<any>('/plugins'),
        kongRequest<any>('/upstreams'),
        kongRequest<any>('/consumers'),
      ]);

    return {
      connected: status.error === null,
      error: status.error,
      counts: {
        routes: routes.data?.data?.length ?? 0,
        services: services.data?.data?.length ?? 0,
        plugins: plugins.data?.data?.length ?? 0,
        upstreams: upstreams.data?.data?.length ?? 0,
        consumers: consumers.data?.data?.length ?? 0,
      },
      server: status.data?.server ?? null,
      database: status.data?.database ?? null,
      memory: status.data?.memory ?? null,
    };
  }),
});
