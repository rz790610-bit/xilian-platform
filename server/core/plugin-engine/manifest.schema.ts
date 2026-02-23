/**
 * XPE v1.1 — PluginManifest Zod Schema
 *
 * 所有插件通过 discriminatedUnion('type') 声明元数据。
 * 支持 6 种插件类型：agent | tool | storage | observability | vite | infra
 */
import { z } from 'zod';

// ── 基础 Schema（所有插件共享） ──────────────────────────────
export const BaseManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'ID 必须为小写字母开头，仅含小写字母、数字和连字符'),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, '版本号必须符合 semver 格式'),
  description: z.string().default(''),
  dependencies: z.array(z.string()).default([]),   // 硬依赖（必须先激活）
  after: z.array(z.string()).default([]),           // 软顺序（尽量先激活，缺失时跳过）
  enabled: z.boolean().default(true),
  critical: z.boolean().default(false),             // 启动关键性：true → 激活失败则 process.exit(1)
  tags: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
});

// ── Agent 插件 ──────────────────────────────────────────────
export const AgentManifestSchema = BaseManifestSchema.extend({
  type: z.literal('agent'),
  loopStage: z.enum(['perception', 'diagnosis', 'guardrail', 'evolution', 'utility']),
  parallel: z.boolean().default(false),
  sdkAdapter: z.enum(['vercel-ai', 'langgraph', 'mastra', 'custom']).default('custom'),
  maxConcurrency: z.number().int().positive().default(5),
  timeoutMs: z.number().int().positive().default(30000),
});

// ── Tool 插件 ───────────────────────────────────────────────
export const ToolManifestSchema = BaseManifestSchema.extend({
  type: z.literal('tool'),
  inputSchema: z.any().optional(),
});

// ── Storage 插件 ────────────────────────────────────────────
export const StorageManifestSchema = BaseManifestSchema.extend({
  type: z.literal('storage'),
  storageType: z.enum(['qdrant', 'minio', 'redis', 'clickhouse', 'postgres', 'mysql']),
});

// ── Observability 插件 ──────────────────────────────────────
export const ObservabilityManifestSchema = BaseManifestSchema.extend({
  type: z.literal('observability'),
  exporterType: z.enum(['console', 'otlp', 'prometheus', 'in-memory']),
});

// ── Vite 插件（运行时注册模式：vitePlugins 不在 Manifest 中声明） ──
export const ViteManifestSchema = BaseManifestSchema.extend({
  type: z.literal('vite'),
  devOnly: z.boolean().default(false),
  buildOnly: z.boolean().default(false),
  // 注意：Vite 插件是运行时对象，不可序列化进 Zod Schema。
  // 插件在 onActivate(ctx) 钩子内向 VitePluginFactory.register() 注册。
});

// ── Infra 插件（基础设施类：配置桥接、事件总线等） ──────────
export const InfraManifestSchema = BaseManifestSchema.extend({
  type: z.literal('infra'),
  infraRole: z.enum(['config-bridge', 'event-bus', 'health-check', 'security']),
});

// ── 联合 Schema ─────────────────────────────────────────────
export const PluginManifestSchema = z.discriminatedUnion('type', [
  AgentManifestSchema,
  ToolManifestSchema,
  StorageManifestSchema,
  ObservabilityManifestSchema,
  ViteManifestSchema,
  InfraManifestSchema,
]);

// ── 类型导出 ────────────────────────────────────────────────
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type AgentPluginManifest = z.infer<typeof AgentManifestSchema>;
export type ToolPluginManifest = z.infer<typeof ToolManifestSchema>;
export type StoragePluginManifest = z.infer<typeof StorageManifestSchema>;
export type ObservabilityPluginManifest = z.infer<typeof ObservabilityManifestSchema>;
export type VitePluginManifest = z.infer<typeof ViteManifestSchema>;
export type InfraPluginManifest = z.infer<typeof InfraManifestSchema>;

// ── 插件类型字面量联合 ─────────────────────────────────────
export type PluginType = PluginManifest['type'];
