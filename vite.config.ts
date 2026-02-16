import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // 开发环境 API 代理：将 /api/* 请求转发到 Express 后端
    // 生产环境由 Express 直接服务静态文件 + API，不需要代理
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3003}`,
        changeOrigin: true,
        // WebSocket 支持（Kafka metrics WS 等）
        ws: true,
        // 重试配置：后端未就绪时不立即报错
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn('[Vite Proxy] API proxy error:', err.message);
          });
        },
      },
    },
  },
});
