/**
 * ============================================================================
 * 技术情报系统 — 模块入口
 * ============================================================================
 *
 * 导出技术情报系统的核心类和工厂函数：
 *   - TechIntelligence: 核心情报系统（单例，通过 getTechIntelligence 获取）
 *   - TechSourceScanner: 技术来源扫描器
 *   - TechGapAnalyzer: 技术差距分析器
 *
 * 使用示例：
 *   import { getTechIntelligence } from '../platform/ai/tech-intelligence';
 *   const intel = getTechIntelligence();
 *   const report = await intel.runScanCycle();
 */

export { TechIntelligence, getTechIntelligence, resetTechIntelligence } from './tech-intelligence';
export { TechSourceScanner } from './tech-source-scanner';
export { TechGapAnalyzer } from './tech-gap-analyzer';
