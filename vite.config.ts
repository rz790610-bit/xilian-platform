/**
 * Vite CLI 配置文件 — 仅用于 `pnpm build`
 *
 * ★ 所有 alias / plugins / build 配置来自 vite.config.shared.ts
 * ★ `pnpm dev` 使用 server/core/vite.ts（Express 中间件模式）
 * ★ 两者共享同一份配置，无需手动同步
 *
 * @see vite.config.shared.ts — 单一权威来源
 * @see server/core/vite.ts   — 中间件模式入口
 */
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import {
  resolveAliases,
  resolveBuildConfig,
  resolveClientPaths,
  ALLOWED_HOSTS,
  APP_PORT,
} from "./vite.config.shared";

const rootDir = import.meta.dirname;
const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: resolveAliases(rootDir),
  },
  ...resolveClientPaths(rootDir),
  build: resolveBuildConfig(rootDir),
  server: {
    host: true,
    allowedHosts: ALLOWED_HOSTS,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // 开发环境 API 代理：将 /api/* 请求转发到 Express 后端
    // 生产环境由 Express 直接服务静态文件 + API，不需要代理
    proxy: {
      '/api': {
        target: `http://localhost:${APP_PORT}`,
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // 代理错误在后端未就绪时是预期行为，不需要 panic
            // 此处保留 console.warn 因为 Vite CLI 模式下无法使用 Pino
          });
        },
      },
    },
  },
});
