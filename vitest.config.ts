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
    // FIX-134: 覆盖率基线配置
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: [
        "server/platform/**/*.ts",
        "server/services/**/*.ts",
        "server/algorithms/**/*.ts",
        "server/lib/**/*.ts",
        "shared/**/*.ts",
      ],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/node_modules/**",
        "shared/generated/**",
        "server/platform/testing/**",
      ],
      // FIX-134: 基线阈值 (2026-03-02 实测)
      //
      // 实测值: Statements 17.2% | Branches 72.3% | Functions 47.1% | Lines 17.2%
      // 阈值设为实测值 -2%，防止退化，逐步上调
      //
      // 注: Statement/Lines 偏低是因为大量协议适配器/存储层依赖外部连接无法在单元测试覆盖
      //     Branches/Functions 较高说明被测模块的逻辑分支覆盖良好
      thresholds: {
        statements: 15,
        branches: 70,
        functions: 45,
        lines: 15,
      },
    },
  },
});
