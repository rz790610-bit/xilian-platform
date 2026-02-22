# Phase 3 图表索引

| 图表 | 文件 | 说明 |
|------|------|------|
| C4 架构总览 | phase3-c4-context.png | 系统上下文图，展示核心引擎层、仿真推演层、回放层、AI增强层、可观测性层 |
| 架构依赖图 | phase3-arch.png | 模块间依赖关系和数据表映射 |
| 数据流全景 | phase3-dataflow.png | 从传感器到预测输出的端到端数据流 |
| 状态同步时序图 | phase3-sync-sequence.png | StateSyncEngine 混合同步模式（CDC+轮询）的完整时序 |
| 仿真异步任务流 | phase3-sim-async.png | SimulationEngine 异步执行流程（BullMQ+WebSocket进度推送） |
