# 联邦知识蒸馏架构设计

> 版本：v1.1 | 日期：2026-02-28 | 状态：设计阶段
> 前置文档：[DISTRIBUTED_DB_ARCHITECTURE.md](./DISTRIBUTED_DB_ARCHITECTURE.md)

---

## 目录

1. [设计动机与约束](#一设计动机与约束)
2. [架构总览](#二架构总览)
3. [客户现场节点](#三客户现场节点)
4. [中心节点（Mac Studio）](#四中心节点mac-studio)
5. [知识包格式规范](#五知识包格式规范)
6. [联邦蒸馏协议](#六联邦蒸馏协议)
7. [安全与数据主权](#七安全与数据主权)
8. [版本管理与回滚](#八版本管理与回滚)
9. [容量与性能规划](#九容量与性能规划)
10. [附录](#附录)

---

## 一、设计动机与约束

### 1.1 核心问题

传统集中式训练要求原始数据上传至中心，与港机运维场景冲突：

| 约束 | 说明 |
|------|------|
| **数据主权** | 客户原始振动波形、设备参数不得离开现场 |
| **带宽限制** | VPN 10-50 Mbps，PB 级原始数据无法传输 |
| **隐私合规** | 设备配置含客户商业机密（吊装吞吐量、故障率等） |
| **知识共享需求** | 不同客户的同型号设备故障经验对全体有价值 |

### 1.2 联邦蒸馏目标

```
不传数据，只传知识。
不暴露客户隐私，只共享故障智慧。
```

- 原始数据永远不出现场
- 每个客户现场独立训练，提取"知识包"
- 知识包仅包含故障模式、权重增量、统计摘要
- 客户授权后，可附加少量脱敏典型样本（≤500 MB/月）辅助全局训练
- 中心融合多客户知识，训练全局模型
- 全局模型蒸馏压缩后反哺所有客户

### 1.3 与现有架构的关系

```
已有能力（直接复用）                      本文档新增
─────────────────────                    ──────────────
KnowledgeCrystallizer (结晶器)     →    现场知识提取引擎
TransferLearningEngine (迁移学习)  →    中心知识融合引擎
ModelRegistryService (模型注册表)   →    联邦模型版本管理
ShadowEvaluator (影子评估)         →    升级模型验证
ChampionChallenger (冠军挑战者)    →    安全部署
SyncEnvelope + MQTT (同步协议)     →    知识包传输通道
MinIO (对象存储)                   →    知识包/模型存储
outbox_events (发件箱)             →    可靠投递
```

---

## 二、架构总览

### 2.1 联邦蒸馏拓扑

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Mac Studio 中心节点                             │
│                                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │ 知识包接收  │   │ 全局知识融合 │   │ 全局模型训练     │        │
│  │ & 验证      │──→│ FedAvg/FedProx──→│ (GPU M2 Ultra)   │        │
│  └─────────────┘   └──────────────┘   └──────┬───────────┘        │
│                                               │                    │
│                                        ┌──────▼───────────┐        │
│                                        │ 模型蒸馏 & 压缩  │        │
│                                        │ (Teacher→Student) │        │
│                                        └──────┬───────────┘        │
│                                               │                    │
│  ┌─────────────┐   ┌──────────────┐   ┌──────▼───────────┐        │
│  │ 版本管理    │──→│ 影子评估     │──→│ 模型推送引擎     │        │
│  │ & 回滚      │   │ (per-site)   │   │                  │        │
│  └─────────────┘   └──────────────┘   └──────────────────┘        │
│                                                                     │
└──────────┬──────────────────┬──────────────────┬───────────────────┘
           │   WireGuard VPN  │     + MQTT TLS   │
           │   + AES-256-GCM  │                  │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌───────▼─────┐
    │  现场 A     │   │  现场 B     │   │  现场 C     │   ...
    │             │   │             │   │             │
    │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │
    │ │半自动   │ │   │ │半自动   │ │   │ │半自动   │ │
    │ │数据标注 │ │   │ │数据标注 │ │   │ │数据标注 │ │
    │ └────┬────┘ │   │ └────┬────┘ │   │ └────┬────┘ │
    │      ▼      │   │      ▼      │   │      ▼      │
    │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │
    │ │本地模型 │ │   │ │本地模型 │ │   │ │本地模型 │ │
    │ │训练     │ │   │ │训练     │ │   │ │训练     │ │
    │ └────┬────┘ │   │ └────┬────┘ │   │ └────┬────┘ │
    │      ▼      │   │      ▼      │   │      ▼      │
    │ ┌─────────┐ │   │ ┌─────────┐ │   │ ┌─────────┐ │
    │ │知识蒸馏 │ │   │ │知识蒸馏 │ │   │ │知识蒸馏 │ │
    │ │→知识包  │ │   │ │→知识包  │ │   │ │→知识包  │ │
    │ └────┬────┘ │   │ └────┬────┘ │   │ └────┬────┘ │
    │      ▼      │   │      ▼      │   │      ▼      │
    │  加密上行   │   │  加密上行   │   │  加密上行   │
    └─────────────┘   └─────────────┘   └─────────────┘
```

### 2.2 联邦蒸馏闭环（6 步飞轮）

```
     ① 现场数据标注                ② 本地模型训练
    ┌─────────────┐               ┌─────────────┐
    │ 半自动标注  │──────────────→│ 增量训练    │
    │ Grok辅助    │               │ 本地GPU/CPU │
    └─────────────┘               └──────┬──────┘
           ▲                             │
           │                             ▼
    ⑥ 现场部署验证              ③ 知识蒸馏 & 打包
    ┌─────────────┐               ┌─────────────┐
    │ 影子评估    │               │ 模型→知识包 │
    │ 冠军挑战者  │               │ 加密签名    │
    └──────┬──────┘               └──────┬──────┘
           │                             │
           ▼                             ▼
    ⑤ 蒸馏模型下发              ④ 中心融合训练
    ┌─────────────┐               ┌─────────────┐
    │ Teacher→    │←──────────────│ FedAvg 融合  │
    │ Student压缩 │               │ 全局训练     │
    └─────────────┘               └─────────────┘
```

---

## 三、客户现场节点

### 3.1 资源利用

复用分布式部署方案中的现场服务器资源（参见 `DISTRIBUTED_DB_ARCHITECTURE.md` §2.1）：

```
现场资源分配（联邦蒸馏专用）
─────────────────────────────
GPU（如有）: 优先用于本地训练，无 GPU 则 CPU 训练
CPU:  2 核专用训练线程池（10 核总计中分配）
RAM:  4 GB 训练内存（从 OS+App 的 16GB 中分配）
NVMe: 50 GB 训练工作区（数据集/检查点/知识包暂存）
时间: 低峰时段训练（22:00-06:00），避免影响实时采集

无 GPU 场景的训练策略：
┌─────────────────────────────────────────────────┐
│ 模型类型        │ CPU 训练可行性  │ 策略         │
├─────────────────┼────────────────┼──────────────┤
│ XGBoost/LightGBM│ 优秀（原生CPU）│ 本地全量训练 │
│ sklearn ensemble│ 优秀           │ 本地全量训练 │
│ 小型 CNN/MLP   │ 可行（慢）     │ 本地增量训练 │
│ LSTM/TCN       │ 可行（需限制）  │ 增量微调     │
│ Transformer    │ 不可行         │ 仅提取知识包 │
└─────────────────────────────────────────────────┘
```

### 3.2 半自动数据标注流程

现场标注系统利用已有的 `auto-labeling-pipeline.ts` 和 `grok-tool-calling.ts` 能力。

```
         原始数据流
              │
     ┌────────▼────────┐
     │ ① 自动预标注    │
     │                  │
     │ 规则标注器       │  ← 复用 alert_rules + diagnosis_rules
     │ (已知模式匹配)   │     schema.ts:1845, :466
     │                  │
     │ 异常检测标注     │  ← 复用 anomalyDetections 表
     │ (Z-score/IQR)    │     schema.ts:437
     │                  │
     │ 历史案例匹配     │  ← 复用 KnowledgeCrystallizer
     │ (已结晶知识)     │     knowledge-crystallizer.ts
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │ ② 置信度分级    │
     │                  │
     │ 高置信 (>0.9)   │ ──→ 自动接受，无需人工
     │ 中置信 (0.6-0.9)│ ──→ 人工确认/修正
     │ 低置信 (<0.6)   │ ──→ 人工标注
     │ 未知模式        │ ──→ 标记为 edge case 上报中心
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │ ③ 运维员审核    │
     │                  │
     │ 移动端 UI 推送   │  ← 每日推送待审核列表
     │ 批量确认/修正    │     预计 10-30 条/天
     │ 重要案例详批     │     (影响模型质量的关键样本)
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │ ④ 标注入库      │
     │                  │
     │ 标注数据集 →     │  ClickHouse: labeled_samples 表
     │ 质量评估报告 →   │  标注一致性 / 类别分布 / 边界案例
     │ Edge Case 上报 → │  SyncEnvelope → 中心
     └─────────────────┘
```

**标注数据存储**（ClickHouse 现场新增表）：

```sql
CREATE TABLE IF NOT EXISTS labeled_samples
(
    sample_id       String,
    device_id       String,
    sensor_id       String,
    timestamp       DateTime64(3),
    -- 特征向量（非原始波形）
    features        Array(Float32)    COMMENT '提取后的特征向量，≤256维',
    feature_names   Array(String)     COMMENT '特征名称列表',
    -- 标注
    label           String            COMMENT '故障类型标签',
    label_source    Enum8(
                      'rule' = 1,
                      'anomaly_detector' = 2,
                      'crystal_match' = 3,
                      'grok_suggest' = 4,
                      'human' = 5
                    ),
    confidence      Float32,
    reviewer_id     Nullable(String),
    reviewed_at     Nullable(DateTime64(3)),
    -- 上下文
    condition_profile String,
    cycle_phase     String,
    operating_params String   DEFAULT '{}' COMMENT 'JSON: speed/load/wind/etc',
    -- 元数据
    is_edge_case    UInt8     DEFAULT 0,
    synced_to_center UInt8    DEFAULT 0,
    created_at      DateTime64(3) DEFAULT now64(3)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (device_id, label, timestamp)
TTL timestamp + INTERVAL 2 YEAR DELETE;
```

### 3.3 本地模型训练

#### 3.3.1 训练流水线

```
     ┌─────────────────────────────────────────────────────────┐
     │                    现场训练调度器                        │
     │            (复用 dojo-training-scheduler.ts)             │
     │                                                          │
     │  触发条件：                                             │
     │  ① 新标注样本累积 ≥ 500 条                             │
     │  ② 距上次训练 ≥ 7 天                                   │
     │  ③ 中心下发全局模型后的本地适配                         │
     │  ④ 检测到分布漂移（KS-test p < 0.05）                  │
     │                                                          │
     │  时间窗口：22:00 - 06:00（低峰时段）                    │
     └──────────┬──────────────────────────────────────────────┘
                │
     ┌──────────▼──────────┐
     │ 数据准备            │
     │                     │
     │ • 从 labeled_samples│  查询已审核的标注数据
     │   提取训练集        │
     │ • 80/20 训练/验证   │  分层抽样保证类别平衡
     │ • 特征工程          │  复用 algorithms/_core/ 框架
     │ • 数据增强          │  SMOTE 对少数类过采样
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ 模型训练            │
     │                     │
     │ 基础模型（CPU）：   │
     │ • XGBoost 故障分类  │  ← 主力模型，CPU 训练 10-30 分钟
     │ • IsolationForest   │  ← 异常检测基线
     │   异常检测          │
     │                     │
     │ 增量微调（GPU/CPU）：│
     │ • 中心下发模型 +    │  ← 全局模型 + 本地数据 fine-tune
     │   本地数据微调      │     冻结前 N 层，仅训练最后 2 层
     │ • 学习率: 1e-5      │     避免灾难性遗忘
     │ • 最多 5 epochs     │
     └──────────┬──────────┘
                │
     ┌──────────▼──────────┐
     │ 本地评估            │
     │                     │
     │ • 验证集评估        │  accuracy/precision/recall/f1
     │ • 物理约束校验      │  复用 physics-verifier.ts
     │ • 与当前 champion   │  复用 shadow-evaluator.ts
     │   对比              │
     │ • 生成评估报告      │
     └──────────┬──────────┘
                │
                ▼
         训练产物 → 知识蒸馏引擎（§3.4）
```

#### 3.3.2 支持的模型类型

| 模型 | 用途 | 框架 | 现场训练 | 说明 |
|------|------|------|----------|------|
| **XGBoost Classifier** | 故障分类 | xgboost | CPU 全量 | 主力分类器，特征重要性可提取 |
| **LightGBM Ranker** | 故障严重度排序 | lightgbm | CPU 全量 | 排序模型 |
| **IsolationForest** | 异常检测 | sklearn | CPU 全量 | 无监督异常检测基线 |
| **MLP Classifier** | 快速分类 | ONNX | CPU 增量 | 中心蒸馏的轻量模型 |
| **LSTM/TCN** | 时序预测 | ONNX | GPU 增量 | 仅微调最后 2 层 |
| **WorldModel** | 状态预测 | ONNX | GPU 增量 | 复用 `world-model-engine.ts` |

### 3.4 知识蒸馏引擎（模型 → 知识包）

核心环节：将本地模型和训练经验转化为**不含原始数据**的知识包。

```
┌──────────────────────────────────────────────────────────────┐
│                    现场知识蒸馏引擎                           │
│                                                               │
│  输入：                                                      │
│  • 本地训练后的模型权重                                      │
│  • 标注数据集的统计摘要（非原始数据）                         │
│  • 诊断历史中发现的模式                                      │
│  • 设备运行特征指纹                                           │
│                                                               │
│  蒸馏过程（6 个提取器并行运行）：                             │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ① 权重增量提取   │                                        │
│  │                   │                                        │
│  │ Δw = w_local -    │  模型权重差值（vs 基线版本）           │
│  │      w_baseline   │                                        │
│  │                   │  稀疏化：|Δw| < ε 的置零              │
│  │ 压缩：SVD 低秩   │  rank=16 近似，压缩 10-50x            │
│  │ 量化：FP32→INT8  │  进一步压缩 4x                        │
│  └──────────────────┘                                        │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ② 故障模式提取   │                                        │
│  │                   │                                        │
│  │ 复用 Knowledge-   │  发现的模式（DiscoveredPattern）       │
│  │ Crystallizer      │  触发条件 + 后果 + 物理解释            │
│  │                   │                                        │
│  │ 新增：特征重要性  │  XGBoost feature_importance            │
│  │ 新增：决策边界    │  分类器的决策边界参数                   │
│  │ 新增：聚类中心    │  异常模式的聚类质心                     │
│  └──────────────────┘                                        │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ③ 统计摘要提取   │                                        │
│  │                   │                                        │
│  │ 特征分布:         │  per-feature: {mean, std, quantiles}   │
│  │ 类别分布:         │  {label: count, ratio}                 │
│  │ 时序统计:         │  趋势斜率, 季节性参数                  │
│  │ 混淆矩阵:        │  验证集评估结果                        │
│  │                   │                                        │
│  │ 隐私保护：        │                                        │
│  │ • 差分隐私噪声    │  ε=1.0 Laplace 噪声                   │
│  │ • min_count=5     │  少于 5 例的类别不上报                  │
│  │ • 聚合到设备类型  │  不暴露具体设备 ID                     │
│  └──────────────────┘                                        │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ④ 异常摘要提取   │                                        │
│  │                   │                                        │
│  │ 新故障类型:       │  本地首次发现的未知模式                 │
│  │ 边界案例:         │  分类器不确定的样本特征                 │
│  │ 分布漂移报告:     │  与上轮基线的 KS 统计量                │
│  │ 工况覆盖度:       │  condition_profile 覆盖情况            │
│  └──────────────────┘                                        │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ⑤ 物理知识提取   │                                        │
│  │                   │                                        │
│  │ 设备退化曲线:     │  疲劳累积率 vs 工况参数               │
│  │ 阈值校正:         │  现场验证后的告警阈值修正              │
│  │ 物理公式校准:     │  S-N 曲线参数的本地拟合                │
│  │ 环境修正因子:     │  温湿度/盐雾对腐蚀率的本地系数        │
│  └──────────────────┘                                        │
│                                                               │
│  ┌──────────────────┐                                        │
│  │ ⑥ 典型样本提取   │  ★ 需客户授权                         │
│  │                   │                                        │
│  │ 自动抽样策略:     │                                        │
│  │ • 每类工况取 top-K│  K=10，按代表性得分排序               │
│  │   代表性片段      │  (与聚类中心距离最近的样本)            │
│  │ • 已确认故障案例  │  完整保留（最高价值训练数据）          │
│  │   完整保留        │                                        │
│  │ • 置信度<0.6 的   │  模型不确定案例优先标记                │
│  │   不确定案例      │  （中心端可辅助标注）                   │
│  │                   │                                        │
│  │ 脱敏处理:         │                                        │
│  │ • 去除 device_id  │  替换为匿名 hash                       │
│  │ • 去除时间戳      │  仅保留相对时序                        │
│  │ • 去除位置信息    │  去除 gateway_id/ip_address             │
│  │ • 只保留特征+标签 │  信号特征向量 + 故障标注               │
│  │                   │                                        │
│  │ 体积控制:         │                                        │
│  │ • 每站点每月      │  ≤ 500 MB（硬上限）                    │
│  │ • 优先级预算分配  │  故障50% + 不确定30% + 代表性20%       │
│  └──────────────────┘                                        │
│                                                               │
│  输出：KnowledgePackage（见 §5）                             │
└──────────────────────────────────────────────────────────────┘
```

### 3.5 知识包加密与上行

```
知识包生成 → 签名 → 加密 → 打包 → MQTT 上行 / MinIO 直传
     │         │       │       │
     │     HMAC-SHA256  │    MessagePack
     │     (站点私钥)   │    + ZSTD 压缩
     │                  │
     │          AES-256-GCM
     │          (会话密钥, 由中心 RSA 公钥包裹)
     │
     ▼
  outbox_events 事务写入
  event_type = 'knowledge_package.ready'
  aggregate_type = 'KnowledgePackage'
  payload = { packageId, siteId, version, minioKey, sizeBytes, checksum }

  大于 256KB → MinIO 直传 (vibration-waveforms 桶 → knowledge-packages/ 前缀)
  小于 256KB → MQTT payload 直传
```

---

## 四、中心节点（Mac Studio）

### 4.1 知识包接收与验证

```
┌───────────────────────────────────────────────────────────────────┐
│                    中心端知识包接收管线                           │
│                                                                    │
│  MQTT 订阅: xilian/sync/{siteId}/up/knowledge_package/{pkgId}   │
│                                                                    │
│  ┌─────────────────┐                                              │
│  │ ① 解密 & 验签   │                                              │
│  │                  │                                              │
│  │ RSA 解密会话密钥 │  中心私钥解密 → AES-256-GCM 会话密钥       │
│  │ AES 解密载荷     │  解密知识包 payload                         │
│  │ HMAC 验签        │  验证站点签名完整性                          │
│  │ 版本号校验       │  packageVersion > lastReceivedVersion       │
│  └────────┬────────┘                                              │
│           │                                                        │
│  ┌────────▼────────┐                                              │
│  │ ② 格式验证      │                                              │
│  │                  │                                              │
│  │ Schema 校验      │  JSON Schema 验证知识包结构                 │
│  │ 字段完整性       │  必填字段检查                                │
│  │ 数值范围校验     │  权重、置信度等在合理范围内                  │
│  │ 站点权限校验     │  site_registry.status = 'active'            │
│  └────────┬────────┘                                              │
│           │                                                        │
│  ┌────────▼────────┐                                              │
│  │ ③ 质量评估      │                                              │
│  │                  │                                              │
│  │ 样本量充足性     │  labeled_count ≥ 最小阈值                   │
│  │ 类别平衡度       │  无严重类别不平衡（max_ratio < 20:1）       │
│  │ 模式新颖性       │  与已有知识库的重复度                       │
│  │ 物理一致性       │  模式结论不违反物理规律                     │
│  │ 异常权重检测     │  |Δw| 过大可能是训练发散                   │
│  └────────┬────────┘                                              │
│           │                                                        │
│  ┌────────▼────────┐                                              │
│  │ ④ 入库 & 排队   │                                              │
│  │                  │                                              │
│  │ 写入 knowledge_  │  MySQL: 知识包元数据                        │
│  │ packages 表      │                                              │
│  │ 存储至 MinIO     │  site-{id}/knowledge-packages/{version}/    │
│  │ 加入融合队列     │  等待凑齐 N 个站点或定时触发               │
│  └─────────────────┘                                              │
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 知识融合引擎

```
┌───────────────────────────────────────────────────────────────────┐
│                    中心端知识融合引擎                             │
│                                                                    │
│  触发条件：                                                      │
│  ① 收齐 ≥ 60% 活跃站点的知识包（同一联邦轮次）                 │
│  ② 超时 48 小时（即使未收齐）                                    │
│  ③ 手动触发（紧急全局更新）                                      │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │                   融合算法选择                           │      │
│  │                                                          │      │
│  │  ┌─────────────┐  权重增量融合  ┌──────────────────┐   │      │
│  │  │ FedAvg      │  w_global =    │  适用：模型结构   │   │      │
│  │  │ (默认)      │  Σ(n_k/n)·Δw_k│  相同的场景       │   │      │
│  │  └─────────────┘               └──────────────────┘   │      │
│  │                                                          │      │
│  │  ┌─────────────┐  近端正则融合  ┌──────────────────┐   │      │
│  │  │ FedProx     │  + μ/2·       │  适用：站点数据   │   │      │
│  │  │ (异构场景)  │  ‖w-w_g‖²     │  分布差异大       │   │      │
│  │  └─────────────┘               └──────────────────┘   │      │
│  │                                                          │      │
│  │  ┌─────────────┐  注意力加权    ┌──────────────────┐   │      │
│  │  │ FedAtt      │  按站点评估    │  适用：站点质量   │   │      │
│  │  │ (质量感知)  │  质量加权      │  差异大           │   │      │
│  │  └─────────────┘               └──────────────────┘   │      │
│  │                                                          │      │
│  │  选择逻辑：                                             │      │
│  │  • 站点间设备型号相同 → FedAvg                          │      │
│  │  • 站点间工况差异 > 0.3 → FedProx (μ=0.01)            │      │
│  │  • 站点质量评分方差 > 0.2 → FedAtt                     │      │
│  └─────────────────────────────────────────────────────────┘      │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │                   融合流程                               │      │
│  │                                                          │      │
│  │  1. 权重增量融合                                        │      │
│  │     • 各站点 Δw 反量化 (INT8→FP32)                     │      │
│  │     • SVD 低秩重建                                      │      │
│  │     • 按站点设备数加权平均                               │      │
│  │     • w_global_new = w_global_old + Δw_fused            │      │
│  │                                                          │      │
│  │  2. 故障模式融合                                        │      │
│  │     • 跨站点模式匹配（余弦相似度 > 0.85 视为同模式）   │      │
│  │     • 合并置信度：c_merged = 1 - Π(1-c_k)             │      │
│  │     • 新模式入库，重复模式合并证据链                    │      │
│  │     • 复用 KnowledgeCrystallizer 的 DiscoveredPattern   │      │
│  │                                                          │      │
│  │  3. 统计分布融合                                        │      │
│  │     • 加权混合高斯：                                    │      │
│  │       μ_global = Σ(n_k/n)·μ_k                          │      │
│  │       σ²_global = Σ(n_k/n)·(σ²_k + (μ_k-μ_global)²)  │      │
│  │     • 分位数合并（t-digest 算法）                       │      │
│  │                                                          │      │
│  │  4. 异常摘要汇总                                        │      │
│  │     • Edge case 全局去重                                │      │
│  │     • 新故障类型注册到全局故障字典                      │      │
│  │     • 分布漂移趋势合并分析                              │      │
│  │                                                          │      │
│  │  5. 物理知识校准                                        │      │
│  │     • 跨站点退化曲线对齐                                │      │
│  │     • 环境修正因子的加权平均                             │      │
│  │     • 违反物理一致性的参数剔除                          │      │
│  └─────────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────┘
```

### 4.3 全局模型训练

```
融合后的全局知识 + 中心端跨站分析数据
               │
     ┌─────────▼─────────┐
     │ 全局模型训练       │
     │                    │
     │ GPU: M2 Ultra      │  192 GB 统一内存
     │ 调度: Dojo 训练器  │  复用 dojo-training-scheduler.ts
     │ 碳感知: WattTime   │  复用 carbon-aware.client.ts
     │                    │
     │ 训练策略：         │
     │ • 初始化: 上轮全局 │  从上一轮 champion 模型初始化
     │   模型权重         │
     │ • 应用融合后的     │  w = w_prev + Δw_fused
     │   权重增量         │
     │ • 在中心端跨站     │  ClickHouse: xilian_global_analytics
     │   聚合数据上验证   │  不含原始数据，仅统计特征
     │ • 物理约束验证     │  复用 physics-verifier.ts
     │                    │
     │ 输出:              │
     │ • 全局 Teacher 模型│  完整大模型
     │ • 训练报告         │  loss 曲线、指标对比
     │ • 版本记录         │  ModelRegistryService 入库
     └─────────┬─────────┘
               │
               ▼
         模型蒸馏 & 压缩（§4.4）
```

### 4.4 模型蒸馏与压缩

将中心端的大型 Teacher 模型蒸馏为适合现场部署的轻量 Student 模型。

```
┌───────────────────────────────────────────────────────────────┐
│                    模型蒸馏管线                                │
│                                                                │
│  复用: transfer-learning.ts 的 knowledge_distillation 策略    │
│  { type: 'knowledge_distillation', temperature: T, alpha: α } │
│                                                                │
│  ┌─────────────────────────────────────────────────────┐      │
│  │ Teacher Model (中心端)                              │      │
│  │ • 完整参数量（如 50M 参数 Transformer）             │      │
│  │ • 高精度，低延迟要求不严                            │      │
│  │ • 可访问全局知识库                                  │      │
│  └──────────┬──────────────────────────────────────────┘      │
│             │                                                  │
│             │  知识蒸馏 (Hinton, 2015)                         │
│             │                                                  │
│             │  L = α·L_hard(y, σ(z_s))                        │
│             │    + (1-α)·T²·KL(σ(z_t/T) ‖ σ(z_s/T))         │
│             │                                                  │
│             │  T = 4.0 (temperature, 软化 logits)             │
│             │  α = 0.3 (hard label 权重)                      │
│             │                                                  │
│  ┌──────────▼──────────────────────────────────────────┐      │
│  │ Student Model (现场部署)                            │      │
│  │ • 压缩参数量（如 2M 参数 MLP/小 CNN）              │      │
│  │ • 优化推理延迟 < 50ms                               │      │
│  │ • ONNX 格式导出                                     │      │
│  └──────────┬──────────────────────────────────────────┘      │
│             │                                                  │
│  ┌──────────▼──────────────────────────────────────────┐      │
│  │ 后处理压缩                                          │      │
│  │                                                      │      │
│  │ • 量化: FP32 → INT8 (ONNX quantize_dynamic)        │      │
│  │   → 模型体积压缩 ~4x，推理加速 ~2x                 │      │
│  │                                                      │      │
│  │ • 剪枝: 移除权重 < 阈值的连接                      │      │
│  │   → 稀疏度 50-80%，推理加速 ~1.5x                  │      │
│  │                                                      │      │
│  │ • ONNX 优化: onnxruntime graph optimization          │      │
│  │   → 算子融合、常量折叠                              │      │
│  └──────────┬──────────────────────────────────────────┘      │
│             │                                                  │
│  ┌──────────▼──────────────────────────────────────────┐      │
│  │ 站点适配层                                          │      │
│  │                                                      │      │
│  │ 为每个站点生成定制化 Student：                      │      │
│  │ • 基础 Student + 站点特有 adapter 层                │      │
│  │ • adapter 参数来自该站点上报的知识包                │      │
│  │ • 输出头根据站点设备型号裁剪                        │      │
│  │                                                      │      │
│  │ 例：SH001 有岸桥+场桥 → 保留相关分类头             │      │
│  │     QD003 仅有岸桥 → 裁剪场桥分类头                 │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                │
│  蒸馏产物尺寸对比：                                           │
│  ┌─────────────────────────────────────────────┐              │
│  │ Teacher (FP32)      → ~200 MB               │              │
│  │ Student (FP32)      → ~8 MB                  │              │
│  │ Student (INT8)      → ~2 MB                  │              │
│  │ Student (INT8+剪枝) → ~1 MB                  │              │
│  │ + Adapter 层        → ~0.1 MB/站点           │              │
│  └─────────────────────────────────────────────┘              │
└───────────────────────────────────────────────────────────────┘
```

### 4.5 模型推送引擎

```
蒸馏后的 Student 模型
         │
┌────────▼────────┐
│ 影子评估         │  复用 shadow-evaluator.ts
│                  │
│ 对每个目标站点:  │
│ • 加载站点历史   │  ClickHouse: xilian_site_{id}
│   聚合数据       │
│ • 运行新旧模型   │
│   对比           │
│ • 统计显著性检验 │  t-test, KS-test
│ • 生成评估报告   │
│                  │
│ 通过 → 进入推送  │
│ 未通过 → 告警    │  人工审核
└────────┬────────┘
         │
┌────────▼────────┐
│ 推送排队         │
│                  │
│ 优先级：         │
│ P0: 安全修补     │  安全相关模型立即推送
│ P1: 显著提升     │  accuracy 提升 >5%
│ P2: 常规更新     │  定期联邦轮次产物
│ P3: 实验性       │  仅推送到 canary 站点
│                  │
│ 推送窗口：       │
│ 非工作时间       │  各站点时区感知
│ 低峰带宽         │  避免影响实时同步
└────────┬────────┘
         │
┌────────▼────────┐
│ 下发执行         │
│                  │
│ 1. ONNX 模型上传 │  MinIO: site-{id}/model-artifacts/
│    至站点 MinIO   │  复用现有 model-artifacts 桶
│                  │
│ 2. MQTT 通知:    │  xilian/sync/{siteId}/down/model_update/{modelId}
│    SyncEnvelope  │  payload: { modelId, version, minioKey,
│                  │            checksum, changeLog }
│                  │
│ 3. 站点接收后:   │
│    • 下载模型    │
│    • 校验 SHA256 │
│    • 本地影子评估│  shadow mode 运行 24h
│    • 自动晋升    │  复用 champion-challenger.ts
│    • 回执 ACK    │  xilian/cmd/{siteId}/ack/{commandId}
└─────────────────┘
```

---

## 五、知识包格式规范

### 5.1 KnowledgePackage 结构

```typescript
interface KnowledgePackage {
  // ===== 包头 =====
  header: {
    packageId: string;              // UUID v7
    siteId: string;                 // 站点标识
    federatedRound: number;         // 联邦轮次序号
    baselineModelId: string;        // 基线模型版本（用于计算 Δw）
    baselineModelVersion: string;   // 语义版本号
    packageVersion: number;         // 包版本（递增）
    createdAt: string;              // ISO 8601
    expiresAt: string;              // 有效期（默认 30 天）
    schemaVersion: '1.0';           // 包格式版本
  };

  // ===== 站点画像（脱敏） =====
  siteProfile: {
    deviceCount: number;            // 设备总数
    deviceTypes: string[];          // 设备类型列表（非具体设备 ID）
    totalLabeledSamples: number;    // 标注样本总量
    labelDistribution: Record<string, number>;  // {label: count}
    conditionProfiles: string[];    // 工况类型列表
    dataTimeRange: {                // 数据时间范围
      start: string;
      end: string;
    };
    trainingDurationSec: number;    // 训练耗时
  };

  // ===== ① 模型权重增量 =====
  weightDelta: {
    format: 'svd_lowrank' | 'sparse' | 'full';
    compression: 'zstd' | 'lz4' | 'none';
    quantization: 'int8' | 'fp16' | 'fp32';
    rank: number;                   // SVD 低秩近似的秩
    sparsityRatio: number;          // 稀疏率 (0-1)
    layers: Array<{
      layerName: string;
      shape: number[];
      // SVD 分解: Δw ≈ U × S × V^T
      U: string;                    // Base64 编码的量化矩阵
      S: string;                    // Base64 编码的奇异值
      Vt: string;                   // Base64 编码的量化矩阵
    }>;
    originalSizeBytes: number;      // 原始大小
    compressedSizeBytes: number;    // 压缩后大小
    compressionRatio: number;       // 压缩比
  };

  // ===== ② 故障模式 =====
  faultPatterns: Array<{
    patternId: string;
    name: string;
    description: string;
    conditions: Array<{
      field: string;
      operator: 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'eq';
      value: number | [number, number];
    }>;
    consequences: Array<{
      effect: string;
      magnitude: number;
      unit: string;
      physicalExplanation: string;
    }>;
    confidence: number;             // 0-1
    support: number;                // 出现比例
    sampleCount: number;            // 支持样本数
    isNovel: boolean;               // 是否为新发现模式
    relatedLabels: string[];        // 关联的故障标签
    featureImportance: Record<string, number>;  // 特征重要性排序
  }>;

  // ===== ③ 统计摘要（差分隐私保护） =====
  statisticalSummary: {
    privacyBudget: number;          // 差分隐私 ε 值
    featureDistributions: Array<{
      featureName: string;
      mean: number;                 // 加噪后的均值
      std: number;                  // 加噪后的标准差
      quantiles: {                  // [5%, 25%, 50%, 75%, 95%]
        p5: number;
        p25: number;
        p50: number;
        p75: number;
        p95: number;
      };
      sampleCount: number;          // 样本量（≥5 才上报）
    }>;
    confusionMatrix: {
      labels: string[];
      matrix: number[][];           // 加噪后
    };
    modelMetrics: {
      accuracy: number;
      precision: number;
      recall: number;
      f1Score: number;
      mae?: number;
      rmse?: number;
    };
  };

  // ===== ④ 异常摘要 =====
  anomalySummary: {
    novelFaultTypes: Array<{
      label: string;
      description: string;
      sampleCount: number;
      representativeFeatures: Record<string, number>;  // 代表性特征值
    }>;
    edgeCases: Array<{
      caseId: string;
      features: Record<string, number>;  // 特征值（非原始数据）
      uncertainty: number;               // 分类不确定度
      suggestedLabel: string;
      reason: string;
    }>;
    distributionDrift: {
      overallDriftScore: number;    // 0-1
      driftedFeatures: Array<{
        featureName: string;
        ksStatistic: number;
        pValue: number;
        driftDirection: 'left' | 'right' | 'spread' | 'narrow';
      }>;
    };
    conditionCoverage: Record<string, number>;  // {condition: sample_count}
  };

  // ===== ⑤ 物理知识 =====
  physicsKnowledge: {
    degradationCurves: Array<{
      deviceType: string;
      component: string;
      parameter: string;            // 如 'fatigue_accumulation'
      dataPoints: Array<{           // 聚合后的曲线点（非原始数据）
        operatingHours: number;
        value: number;
        conditionProfile: string;
      }>;
      fittedModel: {
        type: 'exponential' | 'linear' | 'weibull' | 'polynomial';
        coefficients: number[];
        r2: number;
      };
    }>;
    thresholdCorrections: Array<{
      ruleId: string;
      parameterName: string;
      originalThreshold: number;
      correctedThreshold: number;
      correctionReason: string;
      validationCount: number;
    }>;
    environmentalFactors: Array<{
      factor: string;               // 如 'salt_spray_corrosion'
      coefficient: number;          // 修正系数
      conditions: string;           // 适用条件描述
      sampleSize: number;
    }>;
  };

  // ===== ⑥ 典型样本（需客户授权） =====
  typicalSamples: {
    // 授权信息
    authorization: {
      granted: boolean;                 // 客户是否授权
      authorizationId: string;          // 授权记录 ID
      authorizedBy: string;             // 授权人
      authorizedAt: string;             // 授权时间 ISO 8601
      scope: SampleAuthorizationScope;  // 授权范围（见下方）
      expiresAt: string;                // 授权到期时间
    };

    // 抽样元数据
    samplingMeta: {
      strategy: 'stratified_representative';  // 分层代表性抽样
      totalCandidates: number;          // 候选样本总数
      selectedCount: number;            // 最终选取数量
      budgetUsedBytes: number;          // 本次使用预算 (bytes)
      monthlyBudgetBytes: number;       // 月预算总量 (524288000 = 500MB)
      monthlyBudgetRemaining: number;   // 月预算剩余 (bytes)
      samplingTimestamp: string;        // 抽样时间
    };

    // 样本分组
    confirmedFaults: Array<TypicalSample>;      // 已确认故障案例
    uncertainCases: Array<TypicalSample>;        // 置信度 < 0.6 的不确定案例
    representativeSamples: Array<TypicalSample>; // 各工况代表性样本

    // 预算分配统计
    budgetAllocation: {
      confirmedFaultsBytes: number;     // 故障案例占用 (~50%)
      uncertainCasesBytes: number;      // 不确定案例占用 (~30%)
      representativeBytes: number;      // 代表性样本占用 (~20%)
    };
  } | null;  // 未授权时为 null

  // ===== 签名 =====
  signature: {
    algorithm: 'HMAC-SHA256';
    siteKeyId: string;              // 站点密钥标识
    digest: string;                 // 签名摘要 (Base64)
    signedFields: string[];         // 被签名的字段列表
  };
}

// ===== 典型样本子类型 =====

interface TypicalSample {
  sampleId: string;                   // 匿名样本 ID (SHA256 hash)
  category: 'confirmed_fault' | 'uncertain' | 'representative';

  // 特征向量（脱敏后的信号特征，非原始波形）
  features: Array<{
    name: string;                     // 特征名（如 'rms_velocity', 'kurtosis'）
    value: number;
  }>;
  featureDimensionality: number;      // 特征维度数

  // 标注信息
  label: string;                      // 故障标签
  labelConfidence: number;            // 标注置信度 (0-1)
  labelSource: 'rule' | 'anomaly_detector' | 'crystal_match' | 'grok_suggest' | 'human';

  // 上下文（脱敏）
  deviceType: string;                 // 设备类型（非设备 ID）
  conditionProfile: string;           // 工况类型
  cyclePhase: string;                 // 周期阶段
  operatingParams: {                  // 运行参数（脱敏）
    speedNormalized: number;          // 归一化转速 (0-1)
    loadNormalized: number;           // 归一化负载 (0-1)
    temperatureCategory: 'low' | 'normal' | 'high';  // 温度分类
  };

  // 代表性评分（用于抽样排序）
  representativenessScore: number;    // 与聚类中心的距离倒数 (0-1)
  noveltyScore: number;               // 新颖度 (0-1)，与全局已知模式的差异
  sizeBytes: number;                   // 该样本序列化大小
}

interface SampleAuthorizationScope {
  // 允许传输的数据类型
  allowedCategories: Array<
    'confirmed_fault' |               // 已确认故障
    'uncertain_case' |                // 不确定案例
    'representative_normal' |         // 代表性正常样本
    'representative_abnormal'         // 代表性异常样本
  >;

  // 允许传输的设备类型
  allowedDeviceTypes: string[];       // 如 ['quay_crane', 'rtg']，空数组=全部

  // 允许传输的工况类型
  allowedConditions: string[];        // 如 ['lifting', 'trolley_travel']，空数组=全部

  // 限制条件
  maxSamplesPerMonth: number;         // 每月最大样本数（条）
  maxBytesPerMonth: number;           // 每月最大字节数 (默认 500MB)
  retentionDays: number;              // 中心端保留天数（过期自动删除）

  // 客户可见性
  clientCanReview: boolean;           // 客户是否可审查每次上传内容
  clientCanRevoke: boolean;           // 客户是否可随时撤销授权
}
```

### 5.2 知识包安全属性

| 属性 | 保障 |
|------|------|
| **无原始数据** | 仅包含特征统计、权重增量、模式描述（典型样本也仅含特征向量） |
| **差分隐私** | 统计摘要添加 Laplace 噪声 (ε=1.0) |
| **最小样本量** | 少于 5 例的类别不上报 |
| **设备脱敏** | 聚合到设备类型级别，不暴露具体设备 ID |
| **典型样本脱敏** | 去除 device_id/timestamp/gateway_id/ip，仅保留特征向量+标签 |
| **客户授权** | 典型样本传输需客户明确授权，授权范围可配置，可随时撤销 |
| **样本体积管控** | 每客户每月 ≤ 500 MB 硬上限，优先级预算分配 |
| **中心端限期保留** | 典型样本在中心端保留 `retentionDays` 后自动删除 |
| **完整性签名** | HMAC-SHA256 防篡改 |
| **传输加密** | AES-256-GCM + RSA 密钥交换 |
| **有效期** | 30 天过期自动废弃 |

### 5.3 知识包大小估算

```
典型 50 台设备站点知识包（不含典型样本）：

  header + siteProfile           ≈ 2 KB
  weightDelta (INT8, rank=16)    ≈ 200-500 KB  (取决于模型大小)
  faultPatterns (10-30 个模式)   ≈ 50-150 KB
  statisticalSummary             ≈ 30-80 KB
  anomalySummary                 ≈ 20-50 KB
  physicsKnowledge               ≈ 10-30 KB
  signature                      ≈ 1 KB
  ──────────────────────────────
  小计 (未压缩)                  ≈ 313-813 KB
  ZSTD 压缩后                    ≈ 100-300 KB

典型样本包（客户授权后附加）：

  confirmedFaults (20-50 例)     ≈ 2-10 MB    (每例 100-200 KB 特征向量)
  uncertainCases (30-80 例)      ≈ 3-15 MB
  representativeSamples (50-100) ≈ 5-20 MB
  ──────────────────────────────
  小计 (未压缩)                  ≈ 10-45 MB
  ZSTD 压缩后                    ≈ 3-15 MB

  知识包总计 (含典型样本):       ≈ 3-15 MB / 轮次
  月度预算 (2 轮/月):            ≈ 6-30 MB（远低于 500 MB 月度上限）

  → 典型样本走 MinIO 直传（>256 KB）
  → 10 Mbps VPN 传输 15 MB ≈ 12 秒
```

### 5.4 典型样本模块详细设计

典型样本模块是知识包的可选组件，需客户明确授权后才激活。其目的是为中心端提供少量高价值的脱敏训练数据，解决纯知识蒸馏模式下全局模型对稀有故障学习不足的问题。

#### 5.4.1 自动抽样策略

```
                  labeled_samples 表（ClickHouse 现场端）
                              │
                    ┌─────────▼──────────┐
                    │ 抽样预算计算        │
                    │                     │
                    │ 月度剩余预算:       │  500 MB - 已使用
                    │ 本轮可用预算:       │  min(月度剩余, 250 MB)
                    │                     │
                    │ 预算分配:           │
                    │ ┌─────────────────┐ │
                    │ │ 故障案例   50%  │ │  最高价值数据
                    │ │ 不确定案例 30%  │ │  中心辅助标注
                    │ │ 代表性样本 20%  │ │  分布覆盖
                    │ └─────────────────┘ │
                    └─────────┬──────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                  ▼
  ┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
  │ ① 故障案例抽样  │ │ ② 不确定案例 │ │ ③ 代表性样本    │
  │                  │ │    抽样      │ │    抽样          │
  │ 条件:            │ │              │ │                  │
  │ • label_source   │ │ 条件:        │ │ 条件:            │
  │   = 'human'      │ │ • confidence │ │ • 按 condition_  │
  │ • 已确认的       │ │   < 0.6      │ │   profile 分层   │
  │   真实故障       │ │ • 模型输出   │ │ • 每层取 top-K   │
  │                  │ │   不确定     │ │   (K=10)         │
  │ 策略:            │ │              │ │                  │
  │ • 全部保留       │ │ 策略:        │ │ 策略:            │
  │ • 按故障类型     │ │ • 按不确定度 │ │ • 计算每个样本   │
  │   去重（同类     │ │   降序排列   │ │   到聚类中心的   │
  │   保留最典型）   │ │ • 优先选择   │ │   距离            │
  │ • 罕见故障       │ │   边界样本   │ │ • 距离最近的为   │
  │   权重 ×3        │ │   (最有标注   │ │   最具代表性     │
  │                  │ │    价值)     │ │ • 确保每类工况   │
  │ 上限:            │ │              │ │   至少 5 个样本  │
  │ 50 例/轮次       │ │ 上限:        │ │                  │
  │ (罕见故障不限)   │ │ 80 例/轮次   │ │ 上限:            │
  │                  │ │              │ │ 100 例/轮次      │
  └─────────────────┘ └──────────────┘ └─────────────────┘
            │                 │                  │
            └─────────────────┼──────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ 预算裁剪            │
                    │                     │
                    │ IF total > 预算:    │
                    │   按优先级裁剪      │
                    │   故障 > 不确定     │
                    │        > 代表性     │
                    │                     │
                    │   同优先级内按       │
                    │   noveltyScore 降序 │
                    │   保留新颖度高的    │
                    └─────────┬──────────┘
                              ▼
                       脱敏处理（§5.4.2）
```

**代表性得分计算**：

```
对每个 condition_profile 分别计算：

1. 特征标准化: x_norm = (x - μ) / σ

2. K-Means 聚类: 对该工况下所有样本聚类（K=5）

3. 代表性得分: representativenessScore = 1 / (1 + dist(sample, centroid))
   dist = 欧几里得距离到最近聚类中心

4. 新颖度得分: noveltyScore = min_dist(sample, global_known_patterns)
   与全局已知模式库的最小距离（距离越大越新颖）

5. 综合排序: rank = 0.6 × representativenessScore + 0.4 × noveltyScore
```

#### 5.4.2 样本脱敏处理

```
┌────────────────────────────────────────────────────────────────────┐
│                        脱敏处理管线                                │
│                                                                     │
│  原始标注样本 (labeled_samples 表)                                 │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ sample_id:  "smpl_SH001_QC03_MP12_20260215T103022"      │      │
│  │ device_id:  "QC-SH001-03"                               │      │
│  │ sensor_id:  "VIB-MP12-X"                                │      │
│  │ timestamp:  "2026-02-15T10:30:22.456Z"                  │      │
│  │ features:   [0.82, 3.45, 0.12, ...]                     │      │
│  │ label:      "bearing_outer_race_defect"                  │      │
│  │ condition:  "lifting_heavy_eccentric"                    │      │
│  │ operating:  { speed: 1200, load: 45000, temp: 38.5 }    │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              │                                      │
│                    ┌─────────▼──────────┐                          │
│                    │ 脱敏变换           │                          │
│                    └─────────┬──────────┘                          │
│                              │                                      │
│  脱敏后样本 (TypicalSample)                                        │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ sampleId:   "a3f7c2..." (SHA256 hash，不可逆)           │      │
│  │ device_id:  ✗ 已移除                                    │      │
│  │ sensor_id:  ✗ 已移除                                    │      │
│  │ timestamp:  ✗ 已移除                                    │      │
│  │ features:   [0.82, 3.45, 0.12, ...]  ✓ 保留            │      │
│  │ label:      "bearing_outer_race_defect"  ✓ 保留         │      │
│  │ deviceType: "quay_crane"  (设备类型，非ID)               │      │
│  │ condition:  "lifting_heavy_eccentric"  ✓ 保留           │      │
│  │ operating:  { speedNormalized: 0.8,                      │      │
│  │              loadNormalized: 0.9,                         │      │
│  │              temperatureCategory: 'normal' }             │      │
│  │              ↑ 归一化 + 分类化，不暴露绝对值             │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  脱敏规则汇总:                                                     │
│  ┌────────────────────┬──────────────────┬──────────────────┐      │
│  │ 字段               │ 处理方式         │ 说明             │      │
│  ├────────────────────┼──────────────────┼──────────────────┤      │
│  │ sample_id          │ SHA256 单向 hash │ 不可反推         │      │
│  │ device_id          │ 删除             │ 替换为设备类型   │      │
│  │ sensor_id          │ 删除             │ 不保留           │      │
│  │ timestamp          │ 删除             │ 仅保留相对时序   │      │
│  │ gateway_id         │ 删除             │ 不保留           │      │
│  │ ip_address         │ 删除             │ 不保留           │      │
│  │ mp_code            │ 删除             │ 不保留           │      │
│  │ features (向量)    │ 保留原值         │ 核心训练数据     │      │
│  │ label              │ 保留             │ 标注标签         │      │
│  │ condition_profile  │ 保留             │ 工况无隐私敏感   │      │
│  │ cycle_phase        │ 保留             │ 周期阶段         │      │
│  │ speed (rpm)        │ 归一化 (0-1)     │ 除以额定转速     │      │
│  │ load (kg)          │ 归一化 (0-1)     │ 除以额定载荷     │      │
│  │ temperature (°C)   │ 分类化           │ low/normal/high  │      │
│  │ wind_speed         │ 删除             │ 可能暴露地理位置 │      │
│  │ humidity           │ 删除             │ 可能暴露地理位置 │      │
│  └────────────────────┴──────────────────┴──────────────────┘      │
└────────────────────────────────────────────────────────────────────┘
```

#### 5.4.3 客户授权机制

```
┌────────────────────────────────────────────────────────────────────┐
│                     客户授权流程                                    │
│                                                                     │
│  ┌─────────────┐   管理员操作                                     │
│  │ ① 授权配置  │   (现场端 管理 UI)                               │
│  │             │                                                    │
│  │  选择:      │                                                    │
│  │  ☑ 已确认故障案例                                               │
│  │  ☑ 不确定案例（中心辅助标注）                                   │
│  │  ☐ 代表性正常样本                  ← 可按需关闭                │
│  │  ☑ 代表性异常样本                                               │
│  │                                                                  │
│  │  设备范围:  ☑ 岸桥  ☑ 场桥  ☐ 叉车  ← 选择允许的设备类型     │
│  │  工况范围:  ☑ 全部工况              ← 或逐个选择               │
│  │  月度上限:  [500] MB                ← 可下调，不可上调         │
│  │  保留天数:  [90] 天                 ← 中心端保留期限           │
│  │  可审查:    ☑ 上传前审查            ← 每次上传可人工确认       │
│  │  可撤销:    ☑ 随时可撤销            ← 默认开启                │
│  └──────┬──────┘                                                    │
│         │                                                           │
│  ┌──────▼──────┐                                                    │
│  │ ② 授权签名  │                                                    │
│  │             │                                                    │
│  │ 生成授权记录│  写入 sample_authorizations 表                     │
│  │ 管理员签名  │  HMAC 签名（管理员密钥）                          │
│  │ 有效期设置  │  默认 1 年，到期需续签                             │
│  └──────┬──────┘                                                    │
│         │                                                           │
│  ┌──────▼──────┐                                                    │
│  │ ③ 运行时    │                                                    │
│  │    检查     │                                                    │
│  │             │                                                    │
│  │ 每次蒸馏前: │                                                    │
│  │ • 检查授权  │  authorization.granted == true                     │
│  │   有效性    │  && now() < authorization.expiresAt                │
│  │ • 检查月度  │  budgetUsed < maxBytesPerMonth                    │
│  │   预算      │                                                    │
│  │ • 过滤范围  │  仅选取 allowedCategories                          │
│  │             │  ∩ allowedDeviceTypes ∩ allowedConditions           │
│  │             │                                                    │
│  │ 未授权 →    │  typicalSamples = null                             │
│  │ 超预算 →    │  按预算裁剪，不超限                                │
│  │ 过期 →      │  typicalSamples = null + 告警续签                  │
│  └──────┬──────┘                                                    │
│         │                                                           │
│  ┌──────▼──────┐                                                    │
│  │ ④ 上传审查  │  (如 clientCanReview = true)                       │
│  │   (可选)    │                                                    │
│  │             │                                                    │
│  │ 展示待上传  │  现场端 UI：                                       │
│  │ 样本摘要    │  • 各类别样本数量                                  │
│  │             │  • 特征维度列表                                     │
│  │             │  • 总体积                                           │
│  │             │  • 脱敏后样本预览（随机 5 条）                      │
│  │             │                                                    │
│  │ ☑ 确认上传  │  管理员确认后才上传                                │
│  │ ☐ 拒绝本次  │  本轮不上传典型样本                                │
│  └─────────────┘                                                    │
│                                                                     │
│  授权生命周期管理:                                                  │
│                                                                     │
│  ┌─────────┐  签发  ┌────────┐  到期/撤销  ┌──────────┐           │
│  │ 未授权  │──────→│ 有效   │───────────→│ 已失效   │           │
│  └─────────┘       └───┬────┘            └──────────┘           │
│                        │ 暂停                  ▲                   │
│                        ▼                       │ 恢复不再可能      │
│                   ┌────────┐                   │                   │
│                   │ 暂停   │───────────────────┘                   │
│                   └────────┘   (暂停超过 90 天自动失效)            │
└────────────────────────────────────────────────────────────────────┘
```

**授权数据表**（现场端 + 中心端各一份）：

```typescript
// 新增表：sample_authorizations
export const sampleAuthorizations = mysqlTable("sample_authorizations", {
  id: int("id").autoincrement().primaryKey(),
  authorizationId: varchar("authorization_id", { length: 64 }).notNull().unique(),
  siteId: varchar("site_id", { length: 32 }).notNull(),
  authorizedBy: varchar("authorized_by", { length: 100 }).notNull(),
  authorizedAt: timestamp("authorized_at").notNull(),
  expiresAt: timestamp("expires_at").notNull(),

  // 授权范围
  scope: json("scope").$type<SampleAuthorizationScope>().notNull(),

  // 状态
  status: mysqlEnum("status", [
    "active",       // 有效
    "paused",       // 暂停（客户临时关闭）
    "expired",      // 过期
    "revoked",      // 撤销
  ]).default("active").notNull(),

  // 使用统计
  totalSamplesSent: int("total_samples_sent").default(0).notNull(),
  totalBytesSent: bigint("total_bytes_sent", { mode: "number" }).default(0).notNull(),
  currentMonthBytes: bigint("current_month_bytes", { mode: "number" }).default(0).notNull(),
  currentMonthReset: timestamp("current_month_reset"),  // 月度重置时间

  // 签名
  signatureDigest: varchar("signature_digest", { length: 128 }),

  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  siteIdx: index("idx_sa_site").on(t.siteId),
  statusIdx: index("idx_sa_status").on(t.status),
}));
```

#### 5.4.4 样本体积控制

```
月度预算控制机制
═══════════════

预算参数:
  MONTHLY_BUDGET_BYTES = 524,288,000  (500 MB)
  MAX_SINGLE_ROUND     = MONTHLY_BUDGET_BYTES / 2  (250 MB / 轮)
  BUDGET_RESET_DAY     = 每月 1 日 00:00 UTC

预算分配策略（每轮次）:
  ┌────────────────────┬────────────┬──────────────────────────┐
  │ 类别               │ 预算占比   │ 说明                     │
  ├────────────────────┼────────────┼──────────────────────────┤
  │ 已确认故障案例     │    50%     │ 最高训练价值             │
  │ 不确定案例         │    30%     │ 中心辅助标注后价值倍增   │
  │ 代表性样本         │    20%     │ 保证分布覆盖             │
  └────────────────────┴────────────┴──────────────────────────┘

  预算不足时的裁剪顺序（从低优先级开始裁剪）:
  1. 裁剪代表性正常样本（noveltyScore 最低的先裁）
  2. 裁剪代表性异常样本
  3. 裁剪不确定案例（uncertainty 最低的先裁）
  4. 裁剪已确认故障（仅在极端情况，保留罕见故障优先）

单样本大小估算:
  ┌─────────────────────────────────────────────────┐
  │ 组成部分              │ 大小                     │
  ├───────────────────────┼──────────────────────────┤
  │ 特征向量 (256维 FP32) │ 1,024 bytes              │
  │ 标注 + 元数据 JSON    │ 200-500 bytes            │
  │ 运行参数 (归一化)     │ 100 bytes                │
  │ 得分 + ID             │ 100 bytes                │
  ├───────────────────────┼──────────────────────────┤
  │ 单样本合计            │ ~1.5-2 KB                │
  │ ZSTD 压缩后           │ ~0.8-1 KB                │
  └───────────────────────┴──────────────────────────┘

  500 MB 月度预算可容纳:
  500 MB / 1.5 KB ≈ 333,333 个样本（远超实际需求）

  实际瓶颈是高维特征或多段时序特征:
  如特征维度 = 1024 (高频频谱):
    单样本 ≈ 5 KB → 500 MB ≈ 100,000 个样本

  保守估算（含时序切片特征）:
    单样本 ≈ 100-200 KB（含多时间窗口特征）
    500 MB ≈ 2,500-5,000 个样本/月
    实际选取 200-400 个/轮次 × 2 轮/月 = 400-800 个/月
    → 远在预算范围内

月度预算监控:
  ┌──────────────────────────────────────────┐
  │ 每次上传后更新:                          │
  │                                           │
  │ sample_authorizations.currentMonthBytes  │
  │   += 本次上传字节数                       │
  │                                           │
  │ 每月 1 日重置:                           │
  │   currentMonthBytes = 0                  │
  │   currentMonthReset = 本月 1 日          │
  │                                           │
  │ 告警阈值:                                │
  │ • 80% 预算: 提醒管理员                   │
  │ • 100% 预算: 停止典型样本收集            │
  │ • 月中剩余预算 < 20%: 降低抽样率         │
  └──────────────────────────────────────────┘
```

#### 5.4.5 中心端典型样本处理

```
中心端接收典型样本后的处理流程:

  ┌──────────────────┐
  │ ① 样本入库       │
  │                   │
  │ 按站点隔离存储:   │  MinIO: site-{id}/typical-samples/{roundId}/
  │ 元数据写入 MySQL  │  typical_sample_records 表
  │ 标记保留期限      │  TTL = scope.retentionDays
  └────────┬─────────┘
           │
  ┌────────▼─────────┐
  │ ② 全局样本池构建 │
  │                   │
  │ 跨站点去重:       │  基于特征向量余弦相似度 > 0.95 去重
  │ 类别平衡:         │  对全局样本池做类别平衡
  │ 质量筛选:         │  丢弃 representativenessScore < 0.3 的样本
  └────────┬─────────┘
           │
  ┌────────▼─────────┐
  │ ③ 全局模型增强   │
  │    训练           │
  │                   │
  │ 典型样本作为      │  融合训练数据:
  │ 补充训练集:       │  • 知识包统计 (FedAvg) 提供全局方向
  │                   │  • 典型样本提供稀有类的真实梯度
  │ 训练策略:         │
  │ • 故障案例 ×3     │  过采样罕见故障
  │   权重            │
  │ • 不确定案例由    │  Grok 辅助精标后加入训练
  │   中心精标        │
  │ • 代表性样本      │  验证集 + 微调
  │   双重角色        │
  └────────┬─────────┘
           │
  ┌────────▼─────────┐
  │ ④ 到期清理       │
  │                   │
  │ 定时任务:         │  每日检查 retentionDays
  │ 过期样本:         │  从 MinIO 和 MySQL 中删除
  │ 审计日志:         │  记录删除操作到 audit_logs
  └──────────────────┘
```

---

## 六、联邦蒸馏协议

### 6.1 联邦轮次（Federated Round）生命周期

```
                 中心端                              各现场端
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ Round R 开始                    │                   │
  │ 下发: round_config              │                   │
  │ - roundId                       │──────────────────►│
  │ - baselineModelId               │   MQTT down:      │
  │ - baselineModelVersion          │   round_start     │
  │ - deadline (48h)                │                   │
  │ - distillationConfig            │                   │
  └─────────────────────────────────┘                   │
                   │                                    │
                   │                    ┌───────────────▼───────────┐
                   │                    │ 现场端执行:               │
                   │                    │ 1. 确认基线模型一致       │
                   │                    │ 2. 准备标注数据           │
                   │                    │ 3. 本地增量训练           │
                   │                    │ 4. 知识蒸馏→知识包       │
                   │                    │ 5. 加密签名              │
                   │                    │ 6. 上传知识包            │
                   │                    └───────────────┬───────────┘
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ 接收知识包                      │◄──────────────────│
  │ 验证 + 入队                     │   MQTT up:        │
  │                                 │   knowledge_pkg   │
  │ 等待条件:                       │                   │
  │ - ≥60% 站点提交 OR             │                   │
  │ - 48h 超时                      │                   │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ 知识融合                        │                   │
  │ FedAvg / FedProx / FedAtt       │                   │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ 全局模型训练                    │                   │
  │ Teacher 模型 → 评估             │                   │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ 模型蒸馏                        │                   │
  │ Teacher → Student per site      │                   │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ 影子评估 (per site)             │                   │
  │ 对比: new_student vs champion   │                   │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐   MQTT down:      │
  │ 推送升级模型                    │──────────────────►│
  │ + 全局知识结晶                  │   model_update    │
  │ + 更新的规则                    │   + crystals      │
  └────────────────┬────────────────┘                   │
                   │                                    │
  ┌────────────────▼────────────────┐                   │
  │ Round R 完成                    │                   │
  │ 记录: 指标、参与站点、改进幅度  │                   │
  │ 准备 Round R+1                  │                   │
  └─────────────────────────────────┘                   │
```

### 6.2 联邦轮次频率

| 场景 | 频率 | 触发条件 |
|------|------|----------|
| **常规轮次** | 每 2 周 | 定时（可配置） |
| **加速轮次** | 随时 | 多站点同时发现新故障类型 |
| **紧急轮次** | 立即 | 安全相关模式需要全局推送 |
| **按需轮次** | 手动 | 新客户上线、设备型号变更 |

### 6.3 MQTT Topic 扩展（新增）

在 `DISTRIBUTED_DB_ARCHITECTURE.md` §4.2 基础上新增：

```
# 联邦蒸馏专用 Topic

# 中心 → 现场：轮次控制
xilian/federated/{siteId}/round_start/{roundId}
xilian/federated/{siteId}/round_abort/{roundId}

# 现场 → 中心：知识包上行
xilian/federated/{siteId}/knowledge_package/{packageId}
xilian/federated/{siteId}/round_status/{roundId}

# 中心 → 现场：融合产物下发
xilian/federated/{siteId}/global_model/{modelId}
xilian/federated/{siteId}/global_crystals/{batchId}
xilian/federated/{siteId}/round_complete/{roundId}

# 现场 → 中心：部署回执
xilian/federated/{siteId}/deploy_ack/{modelId}
xilian/federated/{siteId}/deploy_reject/{modelId}

# 典型样本专用 Topic
xilian/federated/{siteId}/typical_samples/{packageId}
xilian/federated/{siteId}/sample_auth_update/{authorizationId}
```

### 6.4 容错与补偿

| 异常场景 | 处理策略 |
|----------|----------|
| **站点未提交知识包** | 48h 超时后以已收集包进入融合；缺席站点保持旧模型 |
| **知识包验证失败** | 拒绝该包，通知站点重新蒸馏；不阻塞其他站点 |
| **融合后模型退化** | 影子评估阻止推送；回退到上轮全局模型 |
| **推送失败** | outbox_events 重试 3 次；失败后告警人工介入 |
| **站点部署后退化** | 站点本地 champion-challenger 自动回滚；上报中心 |
| **VPN 中断** | 知识包暂存 outbox；重连后自动追赶 |
| **中心端 GPU 故障** | 跳过训练步骤，仅做知识融合和结晶推送 |

---

## 七、安全与数据主权

### 7.1 加密体系

```
┌─────────────────────────────────────────────────────────────┐
│                    密钥层级结构                               │
│                                                              │
│  Level 0: 根证书 (Root CA)                                  │
│  │  • 中心端自签 CA                                         │
│  │  • 离线存储                                               │
│  │                                                           │
│  ├─ Level 1: 站点证书 (Site Certificate)                    │
│  │  │  • 每站点一对 RSA-4096 密钥                           │
│  │  │  • 用于: VPN 身份认证、MQTT TLS 双向认证              │
│  │  │                                                        │
│  │  ├─ Level 2a: 知识包签名密钥                             │
│  │  │  • HMAC-SHA256 密钥                                    │
│  │  │  • 用于: 知识包完整性签名                              │
│  │  │  • 每轮次旋转                                          │
│  │  │                                                        │
│  │  └─ Level 2b: 传输加密密钥                               │
│  │     • AES-256-GCM 会话密钥                                │
│  │     • 用于: 知识包 payload 加密                           │
│  │     • 每包一密钥，由中心 RSA 公钥封装                     │
│  │                                                           │
│  └─ Level 1: 中心证书 (Center Certificate)                  │
│     • 中心端 RSA-4096 密钥                                   │
│     • 用于: 解密知识包、签名下发模型                        │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 数据主权保障

| 保障措施 | 实现方式 |
|----------|----------|
| **原始数据不出现场** | 知识包仅含统计摘要和权重增量，可证明不含原始样本 |
| **差分隐私** | 统计摘要添加 Laplace 噪声 (ε=1.0)，防止成员推断攻击 |
| **最小信息原则** | 每个字段都有明确的隐私影响评估；少于 5 例不上报 |
| **客户可审计** | 知识包在上传前可供客户审查（本地 UI 展示包内容） |
| **客户可拒绝** | 客户可随时暂停联邦参与（sync_manifest 中 disable） |
| **传输安全** | 端到端加密：TLS 1.3 (传输层) + AES-256-GCM (应用层) |
| **中心端隔离** | 各站点知识包在中心端 Schema 级隔离存储和处理 |
| **不可逆性** | 权重增量经 SVD 低秩近似 + 量化后，无法反推原始训练数据 |

### 7.3 安全审计

```
联邦蒸馏安全审计日志（写入 audit_logs 表，schema.ts:1593）：

事件类型                   | 审计内容
─────────────────────────  | ─────────────────────────────
knowledge_package.created  | 包ID、大小、特征数、模式数
knowledge_package.uploaded | 包ID、加密方式、传输时间
knowledge_package.received | 包ID、来源站点、验证结果
knowledge_package.rejected | 包ID、拒绝原因
fusion.started             | 轮次ID、参与站点数、算法
fusion.completed           | 轮次ID、耗时、模型指标
model.distilled            | Teacher/Student 对比、压缩比
model.pushed               | 模型ID、目标站点、推送方式
model.deployed             | 站点ID、部署结果、回滚事件
privacy.audit              | 差分隐私预算消耗、脱敏检查
```

---

## 八、版本管理与回滚

### 8.1 版本体系

```
版本标识格式: {modelType}-{major}.{minor}.{patch}-{federatedRound}

示例:
  xgb-fault-classifier-3.2.1-R47
  │                     │ │ │  └── 联邦轮次 47
  │                     │ │ └───── 补丁版本（向后兼容修复）
  │                     │ └─────── 次版本（新故障类型/特征）
  │                     └───────── 主版本（模型架构变更）
  └─────────────────────────────── 模型类型

全局模型 vs 站点模型 版本关系:
  global/xgb-fault-classifier-3.2.0-R47        ← 全局 Teacher
  global/xgb-fault-classifier-3.2.0-R47-student ← 全局 Student
  SH001/xgb-fault-classifier-3.2.0-R47-adapted  ← SH001 适配版
  NB002/xgb-fault-classifier-3.2.0-R47-adapted  ← NB002 适配版
```

### 8.2 版本生命周期

复用现有 `ModelRegistryService` 的生命周期管理（`model-registry.service.ts`）：

```
                                    ┌─────────┐
                        ┌──────────→│ archived│
                        │           └─────────┘
                        │
┌───────┐  ┌─────────┐  │  ┌────────────┐  ┌───────────┐
│ draft │→│ staging │──┼─→│ production │→│ deprecated│
└───────┘  └─────────┘  │  └────────────┘  └───────────┘
                        │         │
                        │         │ 回滚
                        │         ▼
                        │  ┌────────────┐
                        └──│ rollback   │
                           └────────────┘

阶段说明:
  draft      → 训练/蒸馏完成，待评估
  staging    → 影子评估中（对比 champion）
  production → 当前生产模型（champion）
  deprecated → 已被新版本替代（保留 90 天回滚能力）
  archived   → 历史归档（MinIO 冷存储）
  rollback   → 从 deprecated 恢复为 production
```

### 8.3 回滚机制

```
回滚触发条件（任一满足）:
  ① 影子评估: 新模型在 ≥2 个维度上退化 > 5%
  ② 生产监控: 误报率上升 > 10% 持续 4 小时
  ③ 安全护栏: missedAlarmRate > 阈值
  ④ 人工判断: 运维人员手动触发

回滚流程:
  ┌─────────────────────────────────────────────┐
  │ 1. 标记当前版本为 'deprecated'              │
  │ 2. 激活前一个 'deprecated' 版本为 'production'│
  │ 3. 更新 champion 指针                       │
  │ 4. 下发回滚指令到受影响站点:                │
  │    MQTT: xilian/sync/{siteId}/down/          │
  │          model_update/{prevModelId}           │
  │ 5. 站点执行本地模型替换                     │
  │ 6. 记录回滚事件到 rollback_executions 表     │
  │    (schema.ts:2515)                          │
  │ 7. 通知相关人员                              │
  └─────────────────────────────────────────────┘

回滚粒度:
  • 全局回滚: 所有站点回退到上一个全局版本
  • 站点级回滚: 仅特定站点回退（其他站点不受影响）
  • 层级回滚: 仅回退特定模型类型（如仅回退异常检测器）
```

### 8.4 联邦轮次版本追溯

```
federated_rounds 表（中心端新增，记录每轮联邦蒸馏的完整快照）:

  roundId              → R47
  startedAt            → 2026-02-15T00:00:00Z
  completedAt          → 2026-02-16T08:30:00Z
  status               → completed
  participatingSites   → ['SH001', 'NB002', 'QD003']
  missingSites         → ['TJ004']
  fusionAlgorithm      → 'fedavg'
  baselineModelId      → 'xgb-fault-classifier-3.1.0-R46'
  producedModelId      → 'xgb-fault-classifier-3.2.0-R47'
  globalMetrics        → {accuracy: 0.94, f1: 0.91, ...}
  perSiteMetrics       → {SH001: {...}, NB002: {...}, ...}
  knowledgePackageIds  → ['pkg-SH001-R47', 'pkg-NB002-R47', ...]
  improvementVsPrev    → {accuracy: +2.1%, f1: +1.8%}
  newPatternsDiscovered→ 3
  totalEdgeCases       → 12
```

---

## 九、容量与性能规划

### 9.1 联邦蒸馏资源消耗

| 阶段 | 现场端 | 中心端 | 耗时 |
|------|--------|--------|------|
| **数据标注** | CPU 0.5 核 + 1 GB RAM | — | 持续（每日 10-30 条审核） |
| **本地训练** | CPU 2 核 + 4 GB RAM | — | 10-60 分钟/轮次 |
| **知识蒸馏** | CPU 1 核 + 2 GB RAM | — | 5-15 分钟/轮次 |
| **知识包传输** | 网络 < 1 Mbps | 网络 N × 1 Mbps | < 10 秒/站点 |
| **知识融合** | — | CPU 4 核 + 16 GB RAM | 30-60 分钟/轮次 |
| **全局训练** | — | GPU 全量 + 64 GB RAM | 1-4 小时/轮次 |
| **模型蒸馏** | — | GPU 50% + 32 GB RAM | 30-60 分钟/轮次 |
| **影子评估** | — | CPU 4 核 + 8 GB RAM/站点 | 1-2 小时/站点 |
| **模型推送** | 网络 < 5 Mbps | 网络 N × 5 Mbps | < 5 分钟/站点 |

### 9.2 端到端轮次耗时

```
常规联邦轮次 (20 站点):

  T0:   轮次开始，下发 round_start               0h
  T0+48h: 收集截止（实际多数在 24h 内完成）       48h (最大等待)
  T48h:  知识融合                                  +1h
  T49h:  全局模型训练                              +4h
  T53h:  模型蒸馏 (20 站点并行)                    +1h
  T54h:  影子评估 (20 站点并行)                    +2h
  T56h:  推送 + 站点部署验证                       +24h (影子运行)
  T80h:  轮次完成
  ──────────────────────────────────────────────
  总计: ~80 小时 (3.3 天) / 轮次

  → 2 周 1 轮次，充分时间缓冲
```

### 9.3 存储消耗

```
中心端联邦蒸馏存储:

  MySQL (federated_rounds + knowledge_packages 元数据):
    ≈ 50 MB/轮次 × 26 轮次/年 = 1.3 GB/年

  MinIO (知识包归档 + 模型版本 + 典型样本):
    知识包: 300 KB × 20 站点 × 26 轮次 ≈ 152 MB/年
    模型:   2 MB × 20 站点版本 × 26 轮次 ≈ 1 GB/年
    Teacher: 200 MB × 26 轮次 ≈ 5.2 GB/年
    典型样本: 15 MB × 20 站点 × 26 轮次 ≈ 7.8 GB/年
      (受 retentionDays 限制，实际在线量 ≤ 保留期内的量)
    合计:   ≈ 14.2 GB/年

  ClickHouse (联邦轮次指标):
    ≈ 10 MB/轮次 × 26 = 260 MB/年

现场端联邦蒸馏存储:

  ClickHouse (labeled_samples):
    500 条/轮次 × 26 × 2 KB = 26 MB/年

  NVMe (训练工作区):
    峰值 50 GB，训练完成后可回收

  MinIO (知识包暂存):
    300 KB × 26 ≈ 8 MB/年 (可忽略)
```

---

## 附录

### A. 与现有代码集成点

| 模块 | 文件路径 | 联邦蒸馏中的角色 |
|------|----------|------------------|
| **KnowledgeCrystallizer** | `evolution/crystallization/knowledge-crystallizer.ts` | 现场端故障模式提取（§3.4 ②） |
| **TransferLearningEngine** | `knowledge/services/transfer-learning.ts` | 中心端蒸馏策略 `knowledge_distillation`（§4.4） |
| **ModelRegistryService** | `knowledge/services/model-registry.service.ts` | 全局模型版本管理（§8.2） |
| **ModelArtifactService** | `knowledge/services/model-artifact.service.ts` | MinIO 模型存储（§4.5） |
| **ShadowEvaluator** | `evolution/shadow/shadow-evaluator.ts` | 融合后模型评估（§4.5） |
| **ChampionChallenger** | `evolution/champion/champion-challenger.ts` | 站点安全部署（§4.5） |
| **DojoTrainer** | `evolution/fsd/dojo-training-scheduler.ts` | 训练调度（§3.3, §4.3） |
| **AutoLabelingPipeline** | `evolution/fsd/auto-labeling-pipeline.ts` | 半自动标注（§3.2） |
| **MetaLearner** | `evolution/metalearner/meta-learner.ts` | 超参优化（§4.3） |
| **GrokToolCalling** | `cognition/grok/grok-tool-calling.ts` | 标注辅助推理（§3.2） |
| **PhysicsVerifier** | `cognition/reasoning/physics-verifier.ts` | 物理约束校验（§3.3, §4.2） |
| **WorldModelEngine** | `evolution/models/world-model-engine.ts` | 本地预测模型微调（§3.3） |
| **RingBuffer** | `perception/collection/ring-buffer.ts` | L1 层数据采集 → 特征提取 → 标注 |
| **OutboxEvents** | `drizzle/schema.ts:2402` | 知识包可靠传输（§3.5） |
| **ProcessedEvents** | `drizzle/schema.ts:2500` | 接收端幂等保障（§4.1） |
| **SiteRegistry** | 新增（DISTRIBUTED_DB_ARCHITECTURE.md §6.4） | 站点管理与联邦参与控制 |
| **SyncEnvelope** | DISTRIBUTED_DB_ARCHITECTURE.md §4.3 | 知识包传输信封格式 |

### B. 新增数据表汇总

| 表名 | 位置 | 说明 |
|------|------|------|
| `labeled_samples` | ClickHouse（现场端） | 标注数据集（特征向量 + 标签） |
| `federated_rounds` | MySQL（中心端 xilian_global） | 联邦轮次记录 |
| `knowledge_packages` | MySQL（中心端 per-site） | 知识包元数据 |
| `federation_config` | MySQL（中心端 xilian_global） | 联邦蒸馏全局配置 |
| `sample_authorizations` | MySQL（现场端 + 中心端） | 典型样本授权记录 |
| `typical_sample_records` | MySQL（中心端 per-site） | 接收的典型样本元数据 |

### C. config.ts 需新增配置域

```typescript
federation: {
  enabled: envBool('FEDERATION_ENABLED', false),
  role: env('FEDERATION_ROLE', 'site'),           // 'center' | 'site'
  roundIntervalDays: envInt('FEDERATION_ROUND_INTERVAL_DAYS', 14),
  roundTimeoutHours: envInt('FEDERATION_ROUND_TIMEOUT_HOURS', 48),
  minSiteParticipation: envFloat('FEDERATION_MIN_PARTICIPATION', 0.6),  // 60%
  fusionAlgorithm: env('FEDERATION_FUSION_ALGORITHM', 'fedavg'),
  distillation: {
    temperature: envFloat('FEDERATION_DISTILL_TEMPERATURE', 4.0),
    alpha: envFloat('FEDERATION_DISTILL_ALPHA', 0.3),
    studentArchitecture: env('FEDERATION_STUDENT_ARCH', 'mlp_small'),
    quantization: env('FEDERATION_QUANTIZATION', 'int8'),
  },
  privacy: {
    differentialPrivacyEpsilon: envFloat('FEDERATION_DP_EPSILON', 1.0),
    minSampleCount: envInt('FEDERATION_MIN_SAMPLE_COUNT', 5),
    noiseType: env('FEDERATION_NOISE_TYPE', 'laplace'),
  },
  weightDelta: {
    svdRank: envInt('FEDERATION_SVD_RANK', 16),
    sparsityThreshold: envFloat('FEDERATION_SPARSITY_THRESHOLD', 0.001),
    quantization: env('FEDERATION_WEIGHT_QUANTIZATION', 'int8'),
  },
  training: {
    lowPeakStartHour: envInt('FEDERATION_TRAINING_START_HOUR', 22),
    lowPeakEndHour: envInt('FEDERATION_TRAINING_END_HOUR', 6),
    maxEpochs: envInt('FEDERATION_MAX_EPOCHS', 5),
    learningRate: envFloat('FEDERATION_LEARNING_RATE', 1e-5),
    minLabeledSamples: envInt('FEDERATION_MIN_LABELED_SAMPLES', 500),
  },
  typicalSamples: {
    enabled: envBool('FEDERATION_SAMPLES_ENABLED', false),   // 需客户授权后开启
    monthlyBudgetBytes: envInt('FEDERATION_SAMPLES_MONTHLY_BUDGET', 524288000),  // 500 MB
    maxPerRoundBytes: envInt('FEDERATION_SAMPLES_MAX_PER_ROUND', 262144000),     // 250 MB
    budgetAllocation: {
      confirmedFaults: envFloat('FEDERATION_SAMPLES_FAULT_RATIO', 0.5),
      uncertainCases: envFloat('FEDERATION_SAMPLES_UNCERTAIN_RATIO', 0.3),
      representative: envFloat('FEDERATION_SAMPLES_REPRESENTATIVE_RATIO', 0.2),
    },
    sampling: {
      representativeTopK: envInt('FEDERATION_SAMPLES_TOP_K', 10),           // 每工况 top-K
      maxConfirmedFaults: envInt('FEDERATION_SAMPLES_MAX_FAULTS', 50),      // 每轮故障上限
      maxUncertainCases: envInt('FEDERATION_SAMPLES_MAX_UNCERTAIN', 80),    // 每轮不确定上限
      maxRepresentative: envInt('FEDERATION_SAMPLES_MAX_REPRESENTATIVE', 100),
      uncertaintyThreshold: envFloat('FEDERATION_SAMPLES_UNCERTAINTY_THRESHOLD', 0.6),
    },
    retention: {
      defaultRetentionDays: envInt('FEDERATION_SAMPLES_RETENTION_DAYS', 90),
      cleanupCronExpression: env('FEDERATION_SAMPLES_CLEANUP_CRON', '0 3 * * *'),  // 每日 3:00
    },
  },
},
```

### D. 关键设计决策记录

| # | 决策 | 理由 | 替代方案 |
|---|------|------|----------|
| 1 | 知识蒸馏而非联邦梯度共享 | 梯度可能泄露训练数据（梯度反演攻击）；知识包更紧凑且可解释 | FedSGD / FedAvg 直接梯度聚合 |
| 2 | SVD 低秩近似 + INT8 量化 | 权重增量压缩 40-200x，VPN 传输 < 1 秒 | 全精度权重传输 |
| 3 | 差分隐私 ε=1.0 | 平衡隐私保护与统计有效性；ε=1.0 是工业界常用值 | ε=0.1 (更严格) / ε=10 (更宽松) |
| 4 | 每站点定制 Student + Adapter | 不同站点设备型号不同，统一模型会损失精度 | 统一 Student 全局部署 |
| 5 | 2 周联邦轮次 | 与现有进化飞轮节奏匹配；标注数据积累需要时间 | 每周 / 每月 |
| 6 | 异步联邦（非同步等待） | 现场 VPN 不稳定，同步等待会导致整体阻塞 | 同步联邦（所有站点必须同时在线） |
| 7 | FedAvg 为默认融合算法 | 实现简单、效果稳健；站点间异构性不大时最优 | FedProx / SCAFFOLD |
| 8 | 知识包客户可审查 | 建立信任、满足合规要求 | 黑盒传输 |
| 9 | 复用 Outbox Pattern 传输 | 已有可靠投递基础设施，无需额外开发 | 自建可靠传输层 |
| 10 | 物理知识单独提取 | 港机设备物理约束是诊断核心，需要跨站校准和验证 | 仅统计/ML 知识 |
| 11 | 典型样本需客户明确授权 | 虽仅含特征向量，但属于衍生数据，尊重客户数据主权 | 默认开启 |
| 12 | 500 MB/月样本预算硬上限 | 控制带宽消耗和中心存储；实际远用不满，上限是安全阀 | 无上限 / 按需 |
| 13 | 样本脱敏去除时间戳 | 时间戳 + 设备类型可能关联到生产排班，存在间接隐私风险 | 保留时间戳 |
| 14 | 运行参数归一化而非原值 | 绝对值可能暴露设备额定参数（客户商业机密） | 原值传输 |
| 15 | 中心端典型样本限期保留 | retentionDays 到期自动删除，最小化数据风险 | 永久保留 |

---

*文档结束 — v1.1 (新增典型样本模块)*
