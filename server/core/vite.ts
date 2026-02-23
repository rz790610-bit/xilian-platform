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
  log.warn({ cwd: process.cwd() }, 'Could not determine project root from import.meta.dirname, falling back to cwd');
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
// 配置来自 vite.config.shared.ts — 双模式的单一权威来源
// ============================================================

export async function setupVite(app: Express, server: Server, port: number) {
  const t0 = Date.now();
  log.info('[Vite] Initializing dev server (middleware mode)...');

  // 动态 import 共享配置和 Vite
  log.info('[Vite] Loading shared config and plugins...');
  const { createServer: createViteServer } = await import("vite");
  const {
    resolveAliases,
    resolveBuildConfig,
    resolveClientPaths,
    loadPlugins,
  } = await import("../../vite.config.shared");

  const plugins = await loadPlugins();
  const rootDir = getProjectRoot();
  const clientPaths = resolveClientPaths(rootDir);

  log.info({ rootDir }, '[Vite] Project root resolved');
  log.info('[Vite] Creating Vite server (dependency pre-bundling may take a moment on first run)...');

  const vite = await withTimeout(createViteServer({
    plugins,
    resolve: {
      alias: resolveAliases(rootDir),
    },
    ...clientPaths,
    build: resolveBuildConfig(rootDir),
    // ★ configFile: false — 不加载根目录的 vite.config.ts
    // 共享配置已通过 import 方式加载，无需重复读取
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
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  const dt = Date.now() - t0;
  log.info({ durationMs: dt }, '[Vite] ✓ Dev server ready');
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
