import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { createModuleLogger } from './logger';
const log = createModuleLogger('vite');

/**
 * 获取项目根目录
 * 
 * 源码模式 (tsx watch): import.meta.dirname = <project>/server/core/ → 向上两级
 * 打包模式 (node dist/index.js): import.meta.dirname = <project>/dist/ → 向上一级
 * 
 * 通过检测 package.json 的存在来确定正确的项目根目录
 */

function getProjectRoot(): string {
  const currentDir = import.meta.dirname;
  
  // 尝试向上一级（打包模式: dist/ → 项目根）
  const oneUp = path.resolve(currentDir, "..");
  if (fs.existsSync(path.resolve(oneUp, "package.json"))) {
    return oneUp;
  }
  
  // 尝试向上两级（源码模式: server/core/ → 项目根）
  const twoUp = path.resolve(currentDir, "../..");
  if (fs.existsSync(path.resolve(twoUp, "package.json"))) {
    return twoUp;
  }
  
  // 兜底：使用 process.cwd()
  log.warn("[Vite] Could not determine project root from import.meta.dirname, falling back to cwd:", process.cwd());
  return process.cwd();
}

/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Vite] ${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// ============================================================
// Vite 开发服务器（Express 中间件模式）
// ============================================================
// 注意：此配置仅用于 `pnpm dev`（Express 中间件模式）。
// `pnpm build` 使用项目根目录的 vite.config.ts（Vite CLI 模式）。
// 两者的 resolve.alias 和 plugins 必须保持一致。
// ============================================================

export async function setupVite(app: Express, server: Server, port: number) {
  const t0 = Date.now();
  log.info('[Vite] Initializing dev server (middleware mode)...');

  // 动态 import，仅在开发模式下加载，避免生产环境缺少这些 dev 包导致崩溃
  log.info('[Vite] Loading plugins...');
  const { createServer: createViteServer } = await import("vite");
  const react = (await import("@vitejs/plugin-react")).default;
  const tailwindcss = (await import("@tailwindcss/vite")).default;

  // 可选加载 jsx-loc 插件（可能未安装）
  let plugins: any[] = [react(), tailwindcss()];
  try {
    const { jsxLocPlugin } = await import("@builder.io/vite-plugin-jsx-loc");
    plugins.push(jsxLocPlugin());
  } catch {
    // jsx-loc 插件不可用，跳过
  }

  const rootDir = getProjectRoot();
  log.info(`[Vite] Project root: ${rootDir}`);
  log.info('[Vite] Creating Vite server (dependency pre-bundling may take a moment on first run)...');

  const vite = await withTimeout(createViteServer({
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "client", "src"),
        "@shared": path.resolve(rootDir, "shared"),
        "@assets": path.resolve(rootDir, "attached_assets"),
      },
    },
    envDir: rootDir,
    root: path.resolve(rootDir, "client"),
    publicDir: path.resolve(rootDir, "client", "public"),
    build: {
      outDir: path.resolve(rootDir, "dist/public"),
      emptyOutDir: true,
    },
    // ★ configFile: false — 不加载根目录的 vite.config.ts
    // 根目录的 vite.config.ts 仅用于 `pnpm build`（Vite CLI 模式）
    configFile: false,
    server: {
      middlewareMode: true,
      port,
      hmr: { server },
      allowedHosts: true as const,
    },
    appType: "custom",
  }), 60_000, 'createViteServer()');

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(rootDir, "client", "index.html");

      // always reload the index.html file from disk incase it changes
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  const dt = Date.now() - t0;
  log.info(`[Vite] ✓ Dev server ready (${dt}ms)`);
}

export function serveStatic(app: Express) {
  const rootDir = getProjectRoot();
  const distPath = path.resolve(rootDir, "dist", "public");

  if (!fs.existsSync(distPath)) {
    log.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
