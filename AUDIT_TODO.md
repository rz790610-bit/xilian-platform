# 算法模块深度审查清单

## 一、融合诊断引擎 (fusionDiagnosis)
- [ ] service.ts: DSEvidence.dempsterCombination() 归一化公式
- [ ] service.ts: DSEvidence.fuseMultiple() 累积冲突度公式
- [ ] service.ts: ConflictHandler.detectConflict() 冲突检测逻辑
- [ ] service.ts: FusionDiagnosisExpert.diagnose() 完整流程
- [ ] service.ts: ExpertRegistry 注册/注销/调权
- [ ] service.ts: 边界条件（空输入、单专家、全冲突）
- [ ] router.ts: 所有端点参数校验和错误处理
- [ ] config.ts: 字段映射完整性

## 二、高级知识蒸馏 (advancedDistillation)
- [ ] service.ts: DynamicTemperature EMA + warmup + clamp
- [ ] service.ts: FeatureDistillLoss 投影+L2归一化+MSE
- [ ] service.ts: RelationDistillLoss 余弦相似度矩阵
- [ ] service.ts: computeDistillLoss() 5种损失分量加权
- [ ] service.ts: 训练循环 forward/backward/update
- [ ] service.ts: recommend_strategy() 策略推荐
- [ ] service.ts: 边界条件（零维度、空数据、NaN处理）
- [ ] router.ts: 所有端点参数校验和错误处理
- [ ] config.ts: 字段映射完整性

## 三、工况归一化 (conditionNormalizer)
- [ ] service.ts: BaselineLearner IQR剔除 + EWMA更新
- [ ] service.ts: ConditionIdentifier PLC规则 + 特征规则
- [ ] service.ts: FeatureNormalizer ratio/zscore计算
- [ ] service.ts: StatusChecker 自适应阈值判定
- [ ] service.ts: ConditionNormalizerEngine 完整流程
- [ ] service.ts: 边界条件（无基线、空数据、除零保护）
- [ ] router.ts: 所有端点参数校验和错误处理
- [ ] config.ts: 字段映射完整性

## 四、前端页面
- [ ] FusionDiagnosis.tsx: API调用正确性
- [ ] AdvancedDistillation.tsx: API调用正确性
- [ ] ConditionNormalizer.tsx: API调用正确性

## 五、发现的问题
（审查过程中记录）
