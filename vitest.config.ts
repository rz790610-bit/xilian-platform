import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
    exclude: [
      "**/node_modules/**",
      // platform/testing 使用自定义测试运行器（非 vitest describe/it 格式），
      // 需通过 pnpm test:e2e 单独运行
      "server/platform/testing/**",
    ],
  },
});
