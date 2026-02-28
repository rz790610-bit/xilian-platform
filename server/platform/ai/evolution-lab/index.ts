/**
 * ============================================================================
 * 进化实验室模块导出 (Evolution Lab)
 * ============================================================================
 *
 * 模块 4：自动化实验管线
 *
 * 导出：
 *   - EvolutionLab: 核心实验室类（编排完整实验周期）
 *   - getEvolutionLab / resetEvolutionLab: 单例工厂
 *   - ExperimentDesigner: 实验设计管线（LLM 辅助 + 物理约束校验）
 *   - InsightCollector: 多源洞察收集器
 */

export { EvolutionLab, getEvolutionLab, resetEvolutionLab } from './evolution-lab';
export { ExperimentDesigner } from './experiment-designer';
export { InsightCollector } from './insight-collector';
