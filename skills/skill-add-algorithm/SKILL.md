# Skill: 新增算法

## 触发条件

- 用户要求"新增/添加/实现一个算法"
- 用户提供了算法名称、类别或数学公式要求实现
- 用户要求扩展某个算法分类（如异常检测、特征提取）

## 前置检查

1. **确认算法分类** — 必须属于 10 个分类之一：
   - `mechanical` | `electrical` | `structural` | `anomaly` | `optimization`
   - `comprehensive` | `feature_extraction` | `agent_plugin` | `model_iteration` | `rule_learning`
2. **确认 ID 唯一** — `server/algorithms/[category]/index.ts` 中无重复 ID
3. **确认 DSP 工具** — 检查 `server/algorithms/_core/dsp.ts` 是否已有所需信号处理函数
4. **确认物理约束** — 输出是否涉及需要物理约束校验的量（ADR-001）

## 标准步骤

### Step 1: 在分类文件中实现算法类 (唯一必改文件)

**文件**: `server/algorithms/[category]/index.ts`

```typescript
export class MyAlgorithm implements IAlgorithmExecutor {
  readonly id = 'my_algorithm';           // lowercase_snake_case，全局唯一
  readonly name = '我的算法中文名';        // 中文用户可读名
  readonly version = '1.0.0';             // SemVer
  readonly category = 'anomaly_detection'; // 10 分类之一

  getDefaultConfig() {
    return { param1: 10, param2: 0.05 };
  }

  validateInput(input: AlgorithmInput, _c: Record<string, any>) {
    const data = getSignalData(input);
    if (!data || data.length < 10) {
      return { valid: false, errors: ['至少需要10个数据点'] };
    }
    return { valid: true };
  }

  async execute(input: AlgorithmInput, config: Record<string, any>): Promise<AlgorithmOutput> {
    const t0 = Date.now();
    const cfg = { ...this.getDefaultConfig(), ...config };
    const data = getSignalData(input);

    // === 核心算法逻辑 ===
    // ...

    const diagnosis: AlgorithmOutput['diagnosis'] = {
      summary: '诊断结论文本',
      severity: 'normal',      // normal | attention | warning | critical
      urgency: 'monitoring',   // monitoring | attention | scheduled | immediate
      confidence: computedConfidence, // 必须计算，禁止硬编码
      rootCause: '根因分析',
      recommendations: ['建议1', '建议2'],
      referenceStandard: 'ISO 10816',
    };

    return createOutput(this.id, this.version, input, cfg, t0, diagnosis, results, visualizations);
  }
}
```

### Step 2: 注册到分类导出函数 (同一文件底部)

```typescript
export function get[Category]Algorithms(): AlgorithmRegistration[] {
  return [
    // ...现有算法
    {
      executor: new MyAlgorithm(),
      metadata: {
        description: '算法描述',
        tags: ['标签1', '标签2', '标签3'],
        inputFields: [
          { name: 'data', type: 'number[]', description: '时域信号', required: true },
        ],
        outputFields: [
          { name: 'result', type: 'number', description: '计算结果' },
        ],
        configFields: [
          { name: 'param1', type: 'number', default: 10, description: '参数说明' },
        ],
        applicableDeviceTypes: ['*'],
        applicableScenarios: ['故障诊断', '状态监测'],
        complexity: 'O(n log n)',
        edgeDeployable: true,
        referenceStandards: ['ISO 10816'],
      },
    },
  ];
}
```

### Step 3: 验证 (无需改其他文件)

```bash
pnpm check        # TypeScript 编译通过
pnpm test          # 单元测试通过
# 重启服务器后 syncBuiltinAlgorithms() 自动同步到数据库
# API 自动暴露，前端自动展示
```

## 必须满足的验收标准

- [ ] `IAlgorithmExecutor` 接口三个方法全部实现
- [ ] `diagnosis.confidence` 是从数据计算得出，非硬编码常数
- [ ] `validateInput()` 检查最小数据长度和格式
- [ ] 物理约束相关的输出值在合理范围内（ADR-001）
- [ ] 算法 ID 全局唯一，格式 `lowercase_snake_case`
- [ ] metadata 包含 ≥3 个 tags
- [ ] `pnpm check` 通过

## 常见错误和预防

| 错误 | 后果 | 预防 |
|------|------|------|
| confidence 硬编码为 0.8 | 诊断结论不可信 | 基于 SNR/收敛性/数据量计算 |
| 忘记在 `get[Category]Algorithms()` 中注册 | 算法不会被发现 | 写完类立即添加注册 |
| 修改 `server/algorithms/index.ts` | 违反"新增不修改"原则 | index.ts 已自动收集所有分类 |
| severity 使用 HDE 的 low/medium/high | 类型不匹配 | 算法层用 normal/attention/warning/critical |
| 没有 `getDefaultConfig()` 或返回空对象 | 前端无法显示配置面板 | 声明所有可调参数及默认值 |

## 示例

### 好的示例

```typescript
// ID 清晰、confidence 计算、物理约束检查
confidence: Math.min(0.99, Math.max(0.3, snrScore * 0.4 + convergenceScore * 0.6));
severity: rmsValue > 11.2 ? 'critical' : rmsValue > 7.1 ? 'warning' : 'normal';  // ISO 10816
```

### 坏的示例

```typescript
// 硬编码 confidence、无物理依据的阈值
confidence: 0.85;
severity: result > 50 ? 'critical' : 'normal';  // 50 是什么？没有物理依据
```

## 涉及文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/algorithms/[category]/index.ts` | **修改** | 添加算法类 + 注册 |
| `server/algorithms/_core/types.ts` | 只读参考 | IAlgorithmExecutor 接口定义 |
| `server/algorithms/_core/dsp.ts` | 只读参考 | FFT/滤波/窗函数等 DSP 工具 |
| `server/algorithms/_core/engine.ts` | 不改 | 统一执行引擎，自动加载 |
| `server/algorithms/index.ts` | 不改 | 自动收集所有分类 |
| `server/api/algorithm.router.ts` | 不改 | API 自动暴露 |
| `drizzle/schema.ts` | 不改 | syncBuiltinAlgorithms 自动同步 |
