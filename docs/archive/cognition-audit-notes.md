# 认知闭环代码审查笔记

## 审查范围
20 个文件，5294 行代码，server/platform/cognition/

## 发现的问题

### 问题 1: CognitionStimulus 类型字段不一致
- types/index.ts 中 CognitionStimulus 使用 `triggeredAt` 字段
- pipeline-hooks.ts 中构造 stimulus 时使用 `createdAt` 字段
- emitter.ts 中可能也有不一致
- **修复**: 统一为 `triggeredAt`

### 问题 2: CognitionStimulus.source 类型不匹配
- types/index.ts 定义 source 为 StimulusSource 枚举 ('pipeline' | 'drift_detector' | ...)
- pipeline-hooks.ts 构造时使用 `pipeline:POST_COLLECT` 格式的字符串
- **修复**: source 改为 string 类型，或在 pipeline-hooks 中使用枚举值

### 问题 3: CognitionStimulus 缺少 `type` 字段
- pipeline-hooks.ts 中构造 stimulus 时设置了 `type` 字段
- types/index.ts 中 CognitionStimulus 没有 `type` 字段
- **修复**: 在 CognitionStimulus 中添加 type 字段

### 问题 4: cognition-unit.ts 中引用的处理器接口需要明确定义
- CognitionUnit 的 execute 方法调用 dimensionProcessors，但处理器接口只在 types 中有 DimensionOutput
- 需要明确 DimensionProcessor 接口的注册和调用方式
- **修复**: 需要重新读取 cognition-unit.ts 确认

### 问题 5: getCognitionScheduler() 在 pipeline-hooks.ts 中被调用
- 需要确认 scheduler 的 submit 方法返回类型是否与 pipeline-hooks 期望的 CognitionResult 一致
- **修复**: 需要重新读取 scheduler 确认

### 问题 6: 缺少四维处理器的具体实现
- CognitionUnit 依赖四个维度处理器，但目前只有框架没有实现
- 这是 P5 阶段的任务，但需要确保接口定义正确

## 待读取确认的文件
- cognition-unit.ts (确认处理器接口)
- cognition-scheduler.ts (确认 submit 返回类型)
- ds-fusion.engine.ts (确认与 types 的一致性)
- emitter.ts (确认事件数据结构)
