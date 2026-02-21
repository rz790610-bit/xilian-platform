/**
 * ============================================================================
 * 感知层持久化服务 — DB 读写 + 配置加载 + 日志归档
 * ============================================================================
 *
 * 职责：
 *   1. 从 DB 加载 BPA 配置 → 注入 BPABuilder
 *   2. 从 DB 加载维度定义 → 注入 StateVectorSynthesizer
 *   3. 将追溯日志（BPA 构建日志、合成日志）批量写入 DB
 *   4. 将 EvidenceLearner 状态持久化到 DB
 *
 * 使用模式：
 *   const service = new PerceptionPersistenceService();
 *   const bpaConfig = await service.loadBpaConfig('quay_crane');
 *   pipeline.updateBpaConfig(bpaConfig);
 *
 *   // 定时归档
 *   setInterval(() => {
 *     const logs = pipeline.exportTracingLogs();
 *     service.archiveStateVectorLogs(logs.synthesisLogs);
 *   }, 60_000);
 */

import { getDb } from '../../../lib/db';
import { eq, and, desc } from 'drizzle-orm';
import {
  bpaConfigs,
  stateVectorDimensions,
  stateVectorLogs,
  type BpaConfigRow,
  type InsertBpaConfig,
  type StateVectorDimensionRow,
  type InsertStateVectorDimension,
  type InsertStateVectorLog,
} from '../../../../drizzle/evolution-schema';
import type { BpaConfig, BpaRule, FuzzyFunctionType, FuzzyFunctionParams } from '../fusion/bpa.types';
import type { DimensionDef, DimensionGroup, AggregationMethod, SynthesizedStateVector } from '../encoding/state-vector-synthesizer';
import type { EnhancedFusionResult } from '../fusion/ds-fusion-engine';
import type { BpaConstructionLog } from '../fusion/bpa.types';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('perception-persistence');

// ============================================================================
// 持久化服务
// ============================================================================

export class PerceptionPersistenceService {

  // ==========================================================================
  // BPA 配置管理
  // ==========================================================================

  /**
   * 从 DB 加载 BPA 配置
   *
   * @param equipmentType 设备类型
   * @param conditionPhase 工况阶段（可选）
   * @returns BpaConfig 或 null
   */
  async loadBpaConfig(
    equipmentType: string,
    conditionPhase?: string,
  ): Promise<{ config: BpaConfig; version: string; id: number } | null> {
    const db = await getDb();
    if (!db) {
      log.warn('No database connection, cannot load BPA config');
      return null;
    }

    try {
      const conditions = [
        eq(bpaConfigs.equipmentType, equipmentType),
        eq(bpaConfigs.enabled, true),
      ];
      if (conditionPhase) {
        conditions.push(eq(bpaConfigs.conditionPhase, conditionPhase));
      }

      const rows = await db
        .select()
        .from(bpaConfigs)
        .where(and(...conditions))
        .orderBy(desc(bpaConfigs.updatedAt))
        .limit(1);

      if (rows.length === 0) {
        log.info({ equipmentType, conditionPhase }, 'No BPA config found in DB');
        return null;
      }

      const row = rows[0];
      const config = this.rowToBpaConfig(row);

      log.info({
        id: row.id,
        name: row.name,
        version: row.version,
        rulesCount: config.rules.length,
      }, 'BPA config loaded from DB');

      return { config, version: row.version, id: row.id };
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to load BPA config');
      return null;
    }
  }

  /**
   * 保存 BPA 配置到 DB
   */
  async saveBpaConfig(
    name: string,
    equipmentType: string,
    config: BpaConfig,
    options?: {
      conditionPhase?: string;
      version?: string;
      description?: string;
      createdBy?: string;
      ignoranceBase?: number;
      minMassThreshold?: number;
    },
  ): Promise<number | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const insertData: InsertBpaConfig = {
        name,
        equipmentType,
        conditionPhase: options?.conditionPhase ?? null,
        hypotheses: config.hypotheses,
        rules: config.rules.map(r => ({
          source: r.source,
          hypothesis: r.hypothesis,
          functionType: r.functionType,
          params: r.params as unknown as Record<string, number>,
        })),
        ignoranceBase: options?.ignoranceBase ?? 0.05,
        minMassThreshold: options?.minMassThreshold ?? 0.01,
        version: options?.version ?? '1.0.0',
        enabled: true,
        description: options?.description ?? null,
        createdBy: options?.createdBy ?? null,
      };

      const result = await db.insert(bpaConfigs).values(insertData);
      const insertId = Number(result[0].insertId);

      log.info({ id: insertId, name, equipmentType }, 'BPA config saved to DB');
      return insertId;
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to save BPA config');
      return null;
    }
  }

  /**
   * 列出所有 BPA 配置
   */
  async listBpaConfigs(equipmentType?: string): Promise<BpaConfigRow[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      let query = db.select().from(bpaConfigs);
      if (equipmentType) {
        query = query.where(eq(bpaConfigs.equipmentType, equipmentType)) as any;
      }
      return await query.orderBy(desc(bpaConfigs.updatedAt));
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to list BPA configs');
      return [];
    }
  }

  // ==========================================================================
  // 状态向量维度管理
  // ==========================================================================

  /**
   * 从 DB 加载维度定义
   */
  async loadDimensionDefs(equipmentType: string): Promise<DimensionDef[] | null> {
    const db = await getDb();
    if (!db) return null;

    try {
      const rows = await db
        .select()
        .from(stateVectorDimensions)
        .where(and(
          eq(stateVectorDimensions.equipmentType, equipmentType),
          eq(stateVectorDimensions.enabled, true),
        ))
        .orderBy(stateVectorDimensions.dimensionIndex);

      if (rows.length === 0) {
        log.info({ equipmentType }, 'No dimension definitions found in DB');
        return null;
      }

      const dims = rows.map(r => this.rowToDimensionDef(r));

      log.info({
        equipmentType,
        dimensionCount: dims.length,
      }, 'Dimension definitions loaded from DB');

      return dims;
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to load dimension definitions');
      return null;
    }
  }

  /**
   * 批量保存维度定义到 DB
   */
  async saveDimensionDefs(
    equipmentType: string,
    dims: DimensionDef[],
    version: string = '1.0.0',
  ): Promise<boolean> {
    const db = await getDb();
    if (!db) return false;

    try {
      const insertData: InsertStateVectorDimension[] = dims.map(d => ({
        equipmentType,
        dimensionIndex: d.index,
        dimensionKey: d.key,
        label: d.label,
        unit: d.unit,
        dimensionGroup: d.group,
        metricNames: d.metricNames,
        aggregation: d.aggregation,
        defaultValue: d.defaultValue,
        normalizeRange: d.normalizeRange,
        source: d.source,
        enabled: d.enabled,
        version,
      }));

      await db.insert(stateVectorDimensions).values(insertData);

      log.info({
        equipmentType,
        count: dims.length,
        version,
      }, 'Dimension definitions saved to DB');

      return true;
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to save dimension definitions');
      return false;
    }
  }

  /**
   * 列出维度定义
   */
  async listDimensionDefs(equipmentType?: string): Promise<StateVectorDimensionRow[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      let query = db.select().from(stateVectorDimensions);
      if (equipmentType) {
        query = query.where(eq(stateVectorDimensions.equipmentType, equipmentType)) as any;
      }
      return await query.orderBy(stateVectorDimensions.dimensionIndex);
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to list dimension definitions');
      return [];
    }
  }

  // ==========================================================================
  // 状态向量日志归档
  // ==========================================================================

  /**
   * 批量写入状态向量日志
   *
   * @param entries 日志条目列表
   */
  async archiveStateVectorLogs(
    entries: Array<{
      machineId: string;
      vector: SynthesizedStateVector;
      fusionResult?: EnhancedFusionResult;
      bpaLogs?: BpaConstructionLog[];
      durationMs?: number;
    }>,
  ): Promise<number> {
    if (entries.length === 0) return 0;

    const db = await getDb();
    if (!db) return 0;

    try {
      const insertData: InsertStateVectorLog[] = entries.map(e => ({
        machineId: e.machineId,
        synthesizedAt: e.vector.timestamp,
        dimensionValues: e.vector.dimensions,
        normalizedValues: e.vector.normalizedDimensions,
        completeness: e.vector.quality.completeness,
        freshnessSeconds: e.vector.quality.freshnessSeconds,
        missingDimensions: e.vector.quality.missingDimensions,
        defaultedDimensions: e.vector.quality.defaultedDimensions,
        totalDataPoints: e.vector.quality.totalDataPoints,
        durationMs: e.durationMs ?? null,
        bpaLog: e.bpaLogs?.map(l => ({
          source: l.source,
          inputValue: l.inputValue,
          outputMasses: l.outputBpa.m,
          ignorance: l.outputBpa.ignorance,
        })) ?? null,
        fusionSummary: e.fusionResult ? {
          decision: e.fusionResult.decision,
          confidence: e.fusionResult.confidence,
          conflict: e.fusionResult.conflictFactor,
          strategy: e.fusionResult.method,
        } : null,
      }));

      await db.insert(stateVectorLogs).values(insertData);

      log.info({
        count: entries.length,
        machines: [...new Set(entries.map(e => e.machineId))],
      }, 'State vector logs archived to DB');

      return entries.length;
    } catch (err: any) {
      log.error({ error: err.message, count: entries.length }, 'Failed to archive state vector logs');
      return 0;
    }
  }

  /**
   * 查询状态向量日志
   */
  async queryStateVectorLogs(
    machineId: string,
    limit: number = 100,
  ): Promise<any[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      return await db
        .select()
        .from(stateVectorLogs)
        .where(eq(stateVectorLogs.machineId, machineId))
        .orderBy(desc(stateVectorLogs.synthesizedAt))
        .limit(limit);
    } catch (err: any) {
      log.error({ error: err.message }, 'Failed to query state vector logs');
      return [];
    }
  }

  // ==========================================================================
  // 种子数据
  // ==========================================================================

  /**
   * 初始化默认配置（种子数据）
   *
   * 如果 DB 中没有配置，则写入默认的岸桥配置。
   * 幂等操作，重复调用不会重复写入。
   */
  async seedDefaultConfigs(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // 检查是否已有配置
    const existing = await db
      .select()
      .from(bpaConfigs)
      .where(eq(bpaConfigs.equipmentType, 'quay_crane'))
      .limit(1);

    if (existing.length > 0) {
      log.info('Default BPA configs already exist, skipping seed');
      return;
    }

    // 导入默认配置
    const { createDefaultCraneBpaConfig } = await import('../fusion/bpa-builder');
    const { createDefaultCraneDimensions } = await import('../encoding/state-vector-synthesizer');

    const defaultBpaConfig = createDefaultCraneBpaConfig();
    await this.saveBpaConfig(
      '岸桥默认 BPA 配置',
      'quay_crane',
      defaultBpaConfig,
      {
        version: '1.0.0',
        description: '岸桥设备的默认 BPA 模糊隶属度规则配置，覆盖振动、电气、温度、应力、风速 5 个证据源',
        createdBy: 'system-seed',
      },
    );

    const defaultDims = createDefaultCraneDimensions();
    await this.saveDimensionDefs('quay_crane', defaultDims, '1.0.0');

    log.info('Default perception configs seeded to DB');
  }

  // ==========================================================================
  // 内部转换方法
  // ==========================================================================

  private rowToBpaConfig(row: BpaConfigRow): BpaConfig {
    return {
      hypotheses: row.hypotheses as string[],
      rules: (row.rules as any[]).map(r => ({
        source: r.source,
        hypothesis: r.hypothesis,
        functionType: r.functionType as FuzzyFunctionType,
        params: r.params as FuzzyFunctionParams,
      })),
    };
  }

  private rowToDimensionDef(row: StateVectorDimensionRow): DimensionDef {
    return {
      index: row.dimensionIndex,
      key: row.dimensionKey,
      label: row.label,
      unit: row.unit,
      group: row.dimensionGroup as DimensionGroup,
      metricNames: row.metricNames as string[],
      aggregation: row.aggregation as AggregationMethod,
      defaultValue: row.defaultValue,
      normalizeRange: row.normalizeRange as [number, number],
      source: row.source as DimensionDef['source'],
      enabled: row.enabled,
    };
  }
}

// ============================================================================
// 单例导出
// ============================================================================

export const perceptionPersistenceService = new PerceptionPersistenceService();
