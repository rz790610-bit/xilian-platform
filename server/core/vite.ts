import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";

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
  console.warn("[Vite] Could not determine project root from import.meta.dirname, falling back to cwd:", process.cwd());
  return process.cwd();
}

export async function setupVite(app: Express, server: Server, port: number) {
  // 动态 import，仅在开发模式下加载，避免生产环境缺少这些 dev 包导致崩溃
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

  const vite = await createViteServer({
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
    configFile: false,
    server: {
      middlewareMode: true,
      port,
      hmr: { server },
      allowedHosts: true as const,
    },
    appType: "custom",
  });

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
}

export function serveStatic(app: Express) {
  const rootDir = getProjectRoot();
  const distPath = path.resolve(rootDir, "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
