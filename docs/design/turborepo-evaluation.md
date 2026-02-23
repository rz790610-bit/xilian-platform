# Turborepo Monorepo 评估报告

> **版本**: 1.0.0  
> **状态**: 评估完成 — 推荐 Phase 3 实施  
> **日期**: 2026-02-24

---

## 1. 现状分析

### 1.1 当前项目结构

西联智能平台当前是**单包（single-package）**结构，所有代码在一个 `package.json` 下：

```
xilian-platform/
├── client/          ← React 前端（Vite 构建）
├── server/          ← Express + tRPC 后端
├── shared/          ← 前后端共享类型
├── sdk/             ← Python/JS SDK
├── proto/           ← gRPC Protobuf 定义
├── docker/          ← Docker Compose 编排
├── k8s/             ← Kubernetes 配置
├── helm/            ← Helm Charts
├── terraform/       ← IaC 配置
├── monitoring/      ← Prometheus/Grafana 配置
├── scripts/         ← 开发/部署脚本
└── package.json     ← 统一的依赖管理
```

### 1.2 痛点

| 痛点 | 影响 | 严重度 |
|------|------|--------|
| 全量构建 | 修改 client 也触发 server 类型检查 | 中 |
| 依赖膨胀 | 前后端依赖混在一起，`node_modules` 过大 | 中 |
| CI 缓存效率低 | 无法按包粒度缓存构建产物 | 中 |
| 团队协作 | 无法按包分配代码所有权 | 低（当前团队小） |

---

## 2. Turborepo 方案评估

### 2.1 推荐的包拆分方案

```
packages/
├── @xilian/client          ← React 前端
├── @xilian/server          ← Express + tRPC 后端
├── @xilian/shared          ← 共享类型和常量
├── @xilian/algorithms      ← 算法库（DSP、ML）
├── @xilian/sdk-js          ← JavaScript SDK
├── @xilian/sdk-python      ← Python SDK（独立构建）
└── @xilian/config          ← 共享配置（ESLint、TSConfig）
```

### 2.2 收益分析

| 收益 | 预期效果 |
|------|----------|
| 增量构建 | 只构建变更的包，CI 时间减少 40-60% |
| 远程缓存 | Turborepo Remote Cache，团队共享构建缓存 |
| 依赖隔离 | 前后端依赖分离，减少冲突 |
| 并行执行 | `turbo run build` 自动并行构建无依赖的包 |
| 代码所有权 | CODEOWNERS 按包分配 |

### 2.3 风险分析

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 迁移工作量大 | 25-35h 开发时间 | 分阶段迁移，先拆 shared |
| import 路径变更 | 全量修改 import 语句 | 使用 TSConfig paths 过渡 |
| Vite + tRPC 集成 | 开发模式 HMR 可能受影响 | 保持 dev 模式单进程 |
| 学习曲线 | 团队需要学习 pnpm workspaces | 文档 + 示例 |

---

## 3. 决策

### 3.1 当前阶段（Phase 2）：**不实施拆分**

**理由**：
1. 当前团队规模小，单包结构的痛点尚可接受
2. Phase 2 的重点是工程基础设施（启动编排、CI、配置分层），不宜同时做大规模重构
3. Turborepo 缓存已在 CI 中预留（`.turbo` 目录缓存）

### 3.2 Phase 3 实施路线图

| 步骤 | 内容 | 预估时间 |
|------|------|----------|
| 1 | 安装 Turborepo + 配置 `turbo.json` | 2h |
| 2 | 拆分 `@xilian/shared`（最小风险） | 4h |
| 3 | 拆分 `@xilian/algorithms` | 6h |
| 4 | 拆分 `@xilian/client` 和 `@xilian/server` | 12h |
| 5 | 配置远程缓存 + CI 集成 | 4h |
| 6 | 迁移验证 + 文档更新 | 4h |
| **合计** | | **32h** |

### 3.3 当前预备工作（已完成）

1. CI 中已预留 Turborepo 缓存步骤（`.github/workflows/ci.yml`）
2. `turbo.json` 配置模板已准备（见下方）
3. 评估文档已记录决策和路线图

---

## 4. turbo.json 配置模板

以下配置在 Phase 3 实施时使用：

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "cache": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

---

## 5. 结论

Turborepo monorepo 拆分对西联平台有明确的长期收益，但当前阶段（Phase 2）的优先级低于工程基础设施建设。建议在 Phase 3 中按上述路线图实施，预估总工时 32h。当前已完成所有预备工作（CI 缓存预留、评估文档、配置模板）。
