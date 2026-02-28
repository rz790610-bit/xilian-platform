/**
 * ============================================================================
 * HDE 统一 DS 融合引擎入口
 * ============================================================================
 *
 * Phase 0a 合并设计：
 *   - cognition 层 DSFusionEngine (633行) 为权威实现
 *   - perception 层适配器桥接感知格式 (BPA Map → Record)
 *   - 本文件作为 HDE 模块的统一入口，re-export 所有 DS 融合能力
 *
 * 使用方式：
 *   import { DSFusionEngine, createDSFusionEngine } from '@/server/platform/hde/fusion';
 *
 * 向后兼容：
 *   - cognition/engines/ds-fusion.engine.ts 保持原位置
 *   - perception/fusion/ds-fusion-engine.ts 保持原位置
 *   - 新代码推荐从 hde/fusion 导入
 */

// Re-export 认知层权威实现（核心引擎）
export {
  DSFusionEngine,
  DSEvidenceLegacyAdapter,
  createDSFusionEngine,
  createLegacyDSEvidence,
} from '../../cognition/engines/ds-fusion.engine';

// Re-export 感知层适配器（BPA格式桥接）
export {
  DSFusionEngine as PerceptionDSFusionEngine,
  type BPA,
  type FusionResult,
  type EnhancedFusionResult,
  type EvidenceSourceConfig,
  type DiscernmentFrame,
} from '../../perception/fusion/ds-fusion-engine';

// Re-export 类型定义
export type {
  DSConflictStrategy,
  DSEvidenceSourceConfig,
  DSFusionEngineConfig,
  DSEvidenceInput,
  DSFusionOutput,
  DSFusionLogEntry,
} from '../../cognition/types';

/**
 * HDE 融合引擎统一配置
 */
export interface HDEFusionConfig {
  /** 辨识框架（故障类型列表） */
  frameOfDiscernment: string[];
  /** 默认冲突处理策略 */
  defaultStrategy: 'dempster' | 'murphy' | 'yager';
  /** 高冲突阈值（触发策略切换） */
  highConflictThreshold: number;
  /** 极端冲突阈值（强制使用 Yager） */
  extremeConflictThreshold: number;
  /** 证据源列表 */
  sources: Array<{
    id: string;
    name: string;
    type: 'sensor' | 'model' | 'rule' | 'expert';
    initialReliability: number;
  }>;
}

/**
 * HDE 默认融合配置 — 港机设备故障诊断场景
 */
export const HDE_DEFAULT_FUSION_CONFIG: HDEFusionConfig = {
  frameOfDiscernment: [
    'bearing_damage',
    'gear_wear',
    'misalignment',
    'imbalance',
    'looseness',
    'electrical_fault',
    'structural_fatigue',
    'corrosion',
    'normal',
  ],
  defaultStrategy: 'dempster',
  highConflictThreshold: 0.7,
  extremeConflictThreshold: 0.95,
  sources: [
    { id: 'vibration', name: '振动传感器', type: 'sensor', initialReliability: 0.9 },
    { id: 'temperature', name: '温度传感器', type: 'sensor', initialReliability: 0.85 },
    { id: 'current', name: '电流传感器', type: 'sensor', initialReliability: 0.88 },
    { id: 'acoustic', name: '声学传感器', type: 'sensor', initialReliability: 0.8 },
    { id: 'physics_model', name: '物理模型', type: 'model', initialReliability: 0.75 },
    { id: 'ml_model', name: 'ML模型', type: 'model', initialReliability: 0.7 },
    { id: 'rule_engine', name: '规则引擎', type: 'rule', initialReliability: 0.85 },
  ],
};
