/**
 * ============================================================================
 * 共享 Vite 配置 — 双模式（CLI / Middleware）的单一权威来源
 * ============================================================================
 *
 * 整改方案 v2.1 A-02: 消除双 Vite 配置分叉
 *
 * 使用方：
 *   1. vite.config.ts      — CLI 模式（pnpm build）
 *   2. server/core/vite.ts — Express 中间件模式（pnpm dev）
 *
 * 修改 alias / plugins / build 配置时，只需修改此文件。
 * ============================================================================
 */

import path from "node:path";

/**
 * 解析项目路径（基于给定的项目根目录）
 */
export function resolveAliases(rootDir: string) {
  return {
    "@": path.resolve(rootDir, "client", "src"),
    "@shared": path.resolve(rootDir, "shared"),
    "@assets": path.resolve(rootDir, "attached_assets"),
  };
}

/**
 * 构建输出配置
 */
export function resolveBuildConfig(rootDir: string) {
  return {
    outDir: path.resolve(rootDir, "dist/public"),
    emptyOutDir: true,
  };
}

/**
 * 客户端入口路径
 */
export function resolveClientPaths(rootDir: string) {
  return {
    root: path.resolve(rootDir, "client"),
    publicDir: path.resolve(rootDir, "client", "public"),
    envDir: rootDir,
  };
}

/**
 * 加载 Vite 插件（异步，支持可选插件的优雅降级）
 *
 * @param options.jsxLoc - 是否尝试加载 jsx-loc 插件（默认 true）
 */
export async function loadPlugins(options?: { jsxLoc?: boolean }) {
  const react = (await import("@vitejs/plugin-react")).default;
  const tailwindcss = (await import("@tailwindcss/vite")).default;

  const plugins: any[] = [react(), tailwindcss()];

  // jsx-loc 插件：可选加载，未安装时静默跳过
  if (options?.jsxLoc !== false) {
    try {
      const { jsxLocPlugin } = await import("@builder.io/vite-plugin-jsx-loc");
      plugins.push(jsxLocPlugin());
    } catch {
      // jsx-loc 插件不可用，静默跳过
    }
  }

  return plugins;
}

/**
 * 安全域名白名单（开发环境）
 */
export const ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
];

/**
 * 端口配置：从环境变量读取，默认 3000
 *
 * 权威来源链：
 *   config.ts (app.port) → envInt('PORT', 3000)
 *   vite.config.shared.ts (APP_PORT) → parseInt(process.env.PORT || '3000')
 *   两者读取同一个 process.env.PORT，保证一致性。
 *
 * 此处独立读取是因为 Vite CLI 模式下不加载 server/core/config.ts。
 * 中间件模式下 server/core/vite.ts 也使用此值。
 */
export const APP_PORT = parseInt(process.env.PORT || "3000", 10);
