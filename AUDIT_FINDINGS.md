# 算法模块审查发现

## 一、融合诊断引擎 (fusionDiagnosis.service.ts)

### 问题 1 [严重] — 信念质量函数未归一化验证
- 位置: getBeliefMass() 在 VibrationExpert/TemperatureExpert/CurrentExpert
- 问题: 当 faultType='normal' 且 confidence=0.3 时，beliefMass = {normal: 0.3, theta: 0.7}，总和=1.0 ✓
- 但如果 diagnose() 返回的 confidence > 1.0（虽然有 Math.min 保护），theta 会变负
- 修复: 在 getBeliefMass 中加 clamp 保护

### 问题 2 [中等] — SpatialExpertWrapper 重复调用 diagnose
- 位置: 第 528-563 行
- 问题: diagnose() 和 getBeliefMass() 各自独立调用 spatialExpert.diagnose()，如果缓存未命中会调用两次
- 但在 FusionDiagnosisExpert.diagnose() 中先调 expert.diagnose() 再调 expert.getBeliefMass()
- diagnose() 会写缓存，getBeliefMass() 会读缓存，所以实际只调一次 ✓
- 结论: 逻辑正确，但 getBeliefMass 的 fallback 路径（第 560 行）理论上不会执行

### 问题 3 [轻微] — log.info 参数格式不一致
- 位置: 第 113, 119, 136 行
- 问题: 使用模板字符串而非结构化日志
- 修复: 统一为 log.info({name, weight}, 'message') 格式

### 问题 4 [建议] — 缺少配置灵活性
- 冲突惩罚因子 0.3 硬编码在第 423 行
- 建议: 提取为可配置参数

### 问题 5 [建议] — 缺少输入数据验证
- diagnose() 方法没有验证 data 参数的结构
- 建议: 添加基本的字段存在性检查

## 二、融合诊断路由 (fusionDiagnosis.router.ts) — 待审查

## 三、高级知识蒸馏 — 待审查

## 四、工况归一化 — 待审查
