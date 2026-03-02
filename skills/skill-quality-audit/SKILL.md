# Skill: 质量审计

## 触发条件

- 用户要求"做质量检查" / "审计代码" / "检查完成度"
- 用户要求上线前的验证
- 用户提到 "pnpm check" / "test" / "audit" / "质量"
- 每次大规模代码变更后

## 前置检查

1. **确认当前分支** — `git branch --show-current`
2. **确认已保存文件** — `git status` 无意外的未暂存变更
3. **确认 node_modules 完整** — `pnpm install` 无报错

## 标准步骤

### Step 1: TypeScript 类型检查

```bash
pnpm check
```

**通过标准**: 零错误。警告可接受但需记录。

**常见修复**:
- `Property 'x' does not exist` → 检查类型定义
- `Type 'A' is not assignable to type 'B'` → 检查接口兼容性
- `unused variable` → 删除或前缀 `_`

### Step 2: 单元测试

```bash
pnpm test
```

**通过标准**: 所有测试通过。

**如果失败**:
- 定位失败的测试文件和行号
- 检查是否是测试本身过时（mock 数据不匹配）
- 检查是否是业务逻辑 bug

### Step 3: 完整度审计 (Stub 检测)

```bash
npx tsx scripts/audit-completeness.ts
```

**检查项**:
- `@stub('description')` 装饰器数量
- `stubFn('name')` 函数调用数量
- `TODO` / `FIXME` / `HACK` 注释数量

**通过标准**: Stub 数量不超过 baseline（`.completeness-baseline.json`）

### Step 4: 物理约束校验 (数据处理模块)

**检查文件**: 凡涉及传感器数据输出的模块
- 振动值: 0-100 mm/s（ISO 10816）
- 温度: -40 ~ 300°C
- 电流: 0-5000 A
- 功率因数: 0-1
- 轴承温度 ≥ 环境温度（运行时）

**检查方法**:
```bash
# 搜索可能缺少物理约束的代码
grep -rn "severity.*=.*" server/algorithms/ --include="*.ts" | grep -v "test"
grep -rn "confidence.*=.*0\.\|confidence.*=.*1" server/ --include="*.ts" | grep -v "test"
```

### Step 5: 安全审计

```bash
pnpm audit --audit-level=high
```

**通过标准**: 无 high/critical 漏洞。

### Step 6: 构建验证

```bash
pnpm build
```

**通过标准**: 构建成功，`dist/` 目录生成。

### Step 7: 生成审计报告

```markdown
## 质量审计报告 — YYYY-MM-DD

### 检查结果
| 检查项 | 状态 | 备注 |
|--------|------|------|
| TypeScript 类型检查 | PASS/FAIL | 错误数 |
| 单元测试 | PASS/FAIL | 通过/失败/跳过 |
| 完整度审计 | PASS/FAIL | stub 数 / baseline |
| 物理约束校验 | PASS/FAIL | 违规文件 |
| 安全审计 | PASS/FAIL | 漏洞数 |
| 构建验证 | PASS/FAIL | 耗时 |

### 发现的问题
1. ...

### 建议修复
1. ...
```

## 必须满足的验收标准

- [ ] `pnpm check` 零错误
- [ ] `pnpm test` 全部通过
- [ ] 完整度审计 stub 数 ≤ baseline
- [ ] 无 high/critical 安全漏洞
- [ ] `pnpm build` 成功
- [ ] 物理约束相关输出在合理范围（如适用）

## 7 层质量体系

| 层 | 工具 | 命令 | 关注点 |
|----|------|------|--------|
| L1 | Prettier | `pnpm format` | 代码格式一致性 |
| L2 | ESLint | 编辑器内置 | 代码规则和反模式 |
| L3 | TypeScript | `pnpm check` | 编译时类型正确性 |
| L4 | Vitest | `pnpm test` | 单元逻辑验证 |
| L5 | Vitest E2E | `pnpm test:e2e` | API 集成验证 |
| L6 | Playwright | `pnpm test:e2e:ui` | 用户流程验证 |
| L7 | Audit Script | `npx tsx scripts/audit-completeness.ts` | Stub 回归检测 |

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| 只跑 `pnpm check` 不跑 `pnpm test` | 类型正确但逻辑错误 | 必须跑完前 3 步 |
| 忽略 confidence 硬编码 | 诊断不可信 | Step 4 搜索硬编码模式 |
| 安全漏洞留到上线才修 | 线上被攻击 | 每次审计都跑 `pnpm audit` |
| 不更新 completeness baseline | 新 stub 不被发现 | 修复 stub 后更新 baseline |
| build 失败但认为"开发环境没事" | 生产无法部署 | 构建验证是必选项 |

## 快速审计 vs 完整审计

| 类型 | 步骤 | 场景 | 耗时 |
|------|------|------|------|
| **快速** | Step 1 + 2 | 日常小改动 | ~30s |
| **标准** | Step 1-5 | PR 提交前 | ~2min |
| **完整** | Step 1-7 | 版本发布前 | ~5min |

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 只读参考 | 所有质量命令 |
| `tsconfig.json` | 只读参考 | 严格模式配置 |
| `scripts/audit-completeness.ts` | 执行 | 完整度扫描 |
| `.completeness-baseline.json` | 可能更新 | Stub 基线 |
| `.github/workflows/ci.yml` | 只读参考 | CI 流水线定义 |
