/**
 * 基础配置服务层
 * 提供编码规则、节点模板、测点模板、标注维度、数据字典的 CRUD
 */
import { getDb } from '../../lib/db';
import {
  baseCodeRules, baseNodeTemplates, baseMpTemplates,
  baseLabelDimensions, baseLabelOptions,
  baseDictCategories, baseDictItems
} from '../../../drizzle/schema';
import { eq, and, like, asc, desc, count } from 'drizzle-orm';

// ============================================
// 编码规则
// ============================================

export const codeRuleService = {
  async list() {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(baseCodeRules)
      .where(eq(baseCodeRules.isDeleted, 0))
      .orderBy(asc(baseCodeRules.id));
  },

  async getByCode(ruleCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseCodeRules)
      .where(and(eq(baseCodeRules.ruleCode, ruleCode), eq(baseCodeRules.isDeleted, 0)));
    return row || null;
  },

  async create(input: { ruleCode: string; name: string; segments: any; description?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseCodeRules).values({
      ruleCode: input.ruleCode,
      name: input.name,
      segments: input.segments,
      currentSequences: {},
      description: input.description || null,
      isActive: 1, version: 1,
      createdBy: 'system', createdAt: now,
      updatedBy: 'system', updatedAt: now,
      isDeleted: 0,
    });
    return this.getByCode(input.ruleCode);
  },

  async update(ruleCode: string, input: { name?: string; segments?: any; description?: string; isActive?: number }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.segments !== undefined) updateData.segments = input.segments;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    await db.update(baseCodeRules).set(updateData)
      .where(and(eq(baseCodeRules.ruleCode, ruleCode), eq(baseCodeRules.isDeleted, 0)));
    return this.getByCode(ruleCode);
  },

  async delete(ruleCode: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseCodeRules).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseCodeRules.ruleCode, ruleCode));
    return { success: true };
  },

  /**
   * 根据编码规则自动生成编码
   * 解析 segments JSON → 拼接各段 → 自增序列号 → 回写 currentSequences
   * @param ruleCode 编码规则代码（如 RULE_DEVICE）
   * @param context 上下文参数（分类映射值、设备引用、节点引用、测量类型等）
   */
  async generateCode(ruleCode: string, context: {
    category?: string;       // 用于 category 段的映射 key（如 "磨辊机"）
    deviceRef?: string;      // 用于 device_ref 段（如 "Mgj-XC001"）
    nodeRef?: string;        // 用于 node_ref 段（如 "Mgj-XC001-MD"）
    measurementType?: string; // 用于 measurement_type_abbr 段（如 "VIB"）
    customSegments?: Record<string, string>; // 自定义段值，key 对应 custom_input 的 key
  } = {}): Promise<{ code: string; sequenceKey: string; sequenceValue: number }> {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // 1. 获取编码规则
    const rule = await this.getByCode(ruleCode);
    if (!rule) throw new Error(`编码规则 ${ruleCode} 不存在`);
    if (!rule.isActive) throw new Error(`编码规则 ${ruleCode} 已禁用`);

    const segmentsDef = (rule.segments as any)?.segments || rule.segments;
    if (!Array.isArray(segmentsDef)) throw new Error(`编码规则 ${ruleCode} 的 segments 格式错误`);

    const currentSeqs: Record<string, number> = (rule.currentSequences as any) || {};
    // resolvedInputs 收集所有 custom_input 的值，用于构建 sequenceKey
    const resolvedInputs: Record<string, string> = {};
    let sequenceValue = 0;
    const parts: string[] = [];

    // 2. 逐段解析
    for (const seg of segmentsDef) {
      switch (seg.type) {
        case 'prefix':
          parts.push(seg.value || '');
          break;
        case 'separator':
          parts.push(seg.value || '-');
          break;
        case 'custom_input': {
          // 从 customSegments 中获取用户选择的值
          const key = seg.key || seg.label || 'unknown';
          let val = (context.customSegments && context.customSegments[key]) || '';
          // 支持 padStart 补位
          if (seg.padStart && seg.padChar && val) {
            val = val.padStart(seg.padStart, seg.padChar);
          }
          resolvedInputs[key] = val;
          parts.push(val);
          break;
        }
        case 'category': {
          const mapping: Record<string, string> = seg.mapping || {};
          const catKey = context.category || '';
          const catValue = mapping[catKey] || catKey.substring(0, 2).toUpperCase();
          resolvedInputs['category'] = catValue;
          parts.push(catValue);
          break;
        }
        case 'device_ref': {
          const devRef = context.deviceRef || 'DEV';
          resolvedInputs['deviceRef'] = devRef;
          parts.push(devRef);
          break;
        }
        case 'node_ref': {
          const nRef = context.nodeRef || 'NODE';
          resolvedInputs['nodeRef'] = nRef;
          parts.push(nRef);
          break;
        }
        case 'measurement_type_abbr':
          parts.push(context.measurementType || 'GEN');
          break;
        case 'date': {
          const now = new Date();
          const fmt = seg.format || 'YYYYMMDD';
          const y = String(now.getFullYear());
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          parts.push(fmt.replace('YYYY', y).replace('MM', m).replace('DD', d));
          break;
        }
        case 'time': {
          const now = new Date();
          const H = String(now.getHours()).padStart(2, '0');
          const M = String(now.getMinutes()).padStart(2, '0');
          const S = String(now.getSeconds()).padStart(2, '0');
          const fmt = seg.format || 'HHmmss';
          parts.push(fmt.replace('HH', H).replace('mm', M).replace('ss', S));
          break;
        }
        case 'sequence': {
          const len = seg.length || 3;
          const start = seg.start || 1;
          // 构建 sequenceKey：基于 sequenceScope 中指定的字段组合
          let seqKey = 'default';
          if (Array.isArray(seg.sequenceScope) && seg.sequenceScope.length > 0) {
            seqKey = seg.sequenceScope.map((k: string) => resolvedInputs[k] || '').join(':');
          }
          const current = currentSeqs[seqKey] || (start - 1);
          sequenceValue = current + 1;
          currentSeqs[seqKey] = sequenceValue;
          parts.push(String(sequenceValue).padStart(len, '0'));
          break;
        }
        default:
          // 兼容旧的自定义段
          if (context.customSegments && context.customSegments[seg.type]) {
            parts.push(context.customSegments[seg.type]);
          }
          break;
      }
    }

    // 3. 更新序列号
    await db.update(baseCodeRules).set({
      currentSequences: currentSeqs,
      updatedAt: new Date(),
      updatedBy: 'system',
    }).where(eq(baseCodeRules.ruleCode, ruleCode));

    const code = parts.join('');
    // sequenceKey 返回最后一个 sequence 段的 key
    const lastSeqSeg = segmentsDef.filter((s: any) => s.type === 'sequence').pop();
    const finalSeqKey = lastSeqSeg?.sequenceScope
      ? lastSeqSeg.sequenceScope.map((k: string) => resolvedInputs[k] || '').join(':')
      : 'default';
    return { code, sequenceKey: finalSeqKey, sequenceValue };
  },

  /**
   * 预览编码（不自增序列号）
   */
  async previewCode(ruleCode: string, context: {
    category?: string; deviceRef?: string; nodeRef?: string;
    measurementType?: string; customSegments?: Record<string, string>;
  } = {}): Promise<string> {
    const rule = await this.getByCode(ruleCode);
    if (!rule) throw new Error(`编码规则 ${ruleCode} 不存在`);

    const segmentsDef = (rule.segments as any)?.segments || rule.segments;
    if (!Array.isArray(segmentsDef)) return '(格式错误)';

    const currentSeqs: Record<string, number> = (rule.currentSequences as any) || {};
    const resolvedInputs: Record<string, string> = {};
    const parts: string[] = [];

    for (const seg of segmentsDef) {
      switch (seg.type) {
        case 'prefix': parts.push(seg.value || ''); break;
        case 'separator': parts.push(seg.value || '-'); break;
        case 'custom_input': {
          const key = seg.key || seg.label || 'unknown';
          let val = (context.customSegments && context.customSegments[key]) || '';
          if (seg.padStart && seg.padChar && val) {
            val = val.padStart(seg.padStart, seg.padChar);
          }
          resolvedInputs[key] = val;
          parts.push(val);
          break;
        }
        case 'category': {
          const mapping: Record<string, string> = seg.mapping || {};
          const catKey = context.category || '';
          const catValue = mapping[catKey] || catKey.substring(0, 2).toUpperCase();
          resolvedInputs['category'] = catValue;
          parts.push(catValue);
          break;
        }
        case 'device_ref': {
          const devRef = context.deviceRef || 'DEV';
          resolvedInputs['deviceRef'] = devRef;
          parts.push(devRef);
          break;
        }
        case 'node_ref': {
          const nRef = context.nodeRef || 'NODE';
          resolvedInputs['nodeRef'] = nRef;
          parts.push(nRef);
          break;
        }
        case 'measurement_type_abbr': parts.push(context.measurementType || 'GEN'); break;
        case 'date': {
          const now = new Date();
          const fmt = seg.format || 'YYYYMMDD';
          parts.push(fmt.replace('YYYY', String(now.getFullYear())).replace('MM', String(now.getMonth()+1).padStart(2,'0')).replace('DD', String(now.getDate()).padStart(2,'0')));
          break;
        }
        case 'time': {
          const now = new Date();
          parts.push((seg.format||'HHmmss').replace('HH',String(now.getHours()).padStart(2,'0')).replace('mm',String(now.getMinutes()).padStart(2,'0')).replace('ss',String(now.getSeconds()).padStart(2,'0')));
          break;
        }
        case 'sequence': {
          const len = seg.length || 3;
          let seqKey = 'default';
          if (Array.isArray(seg.sequenceScope) && seg.sequenceScope.length > 0) {
            seqKey = seg.sequenceScope.map((k: string) => resolvedInputs[k] || '').join(':');
          }
          const nextVal = (currentSeqs[seqKey] || 0) + 1;
          parts.push(String(nextVal).padStart(len, '0'));
          break;
        }
        default:
          if (context.customSegments && context.customSegments[seg.type]) {
            parts.push(context.customSegments[seg.type]);
          }
          break;
      }
    }
    return parts.join('');
  },
};

// ============================================
// 节点类型模板
// ============================================

export const nodeTemplateService = {
  async list(filters?: { level?: number; nodeType?: string }) {
    const db = await getDb();
    if (!db) return [];
    const conditions: any[] = [eq(baseNodeTemplates.isDeleted, 0)];
    if (filters?.level) conditions.push(eq(baseNodeTemplates.level, filters.level));
    if (filters?.nodeType) conditions.push(eq(baseNodeTemplates.nodeType, filters.nodeType));
    return db.select().from(baseNodeTemplates)
      .where(and(...conditions))
      .orderBy(asc(baseNodeTemplates.level), asc(baseNodeTemplates.id));
  },

  async getByCode(code: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseNodeTemplates)
      .where(and(eq(baseNodeTemplates.code, code), eq(baseNodeTemplates.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    code: string; name: string; level: number; nodeType: string;
    derivedFrom?: string; codeRule?: string; codePrefix?: string; icon?: string;
    children?: any; attributes?: any; measurementPoints?: any; description?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseNodeTemplates).values({
      code: input.code, name: input.name, level: input.level, nodeType: input.nodeType,
      derivedFrom: input.derivedFrom || null, codeRule: input.codeRule || null,
      codePrefix: input.codePrefix || null, icon: input.icon || null,
      isSystem: 0, isActive: 1,
      children: input.children || null, attributes: input.attributes || null,
      measurementPoints: input.measurementPoints || null,
      description: input.description || null,
      version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getByCode(input.code);
  },

  async update(code: string, input: {
    name?: string; icon?: string; children?: any; attributes?: any;
    measurementPoints?: any; description?: string; isActive?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.icon !== undefined) updateData.icon = input.icon;
    if (input.children !== undefined) updateData.children = input.children;
    if (input.attributes !== undefined) updateData.attributes = input.attributes;
    if (input.measurementPoints !== undefined) updateData.measurementPoints = input.measurementPoints;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    await db.update(baseNodeTemplates).set(updateData)
      .where(and(eq(baseNodeTemplates.code, code), eq(baseNodeTemplates.isDeleted, 0)));
    return this.getByCode(code);
  },

  async delete(code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseNodeTemplates).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseNodeTemplates.code, code));
    return { success: true };
  },
};

// ============================================
// 测点类型模板
// ============================================

export const mpTemplateService = {
  async list(filters?: { measurementType?: string }) {
    const db = await getDb();
    if (!db) return [];
    const conditions: any[] = [eq(baseMpTemplates.isDeleted, 0)];
    if (filters?.measurementType) conditions.push(eq(baseMpTemplates.measurementType, filters.measurementType));
    return db.select().from(baseMpTemplates)
      .where(and(...conditions))
      .orderBy(asc(baseMpTemplates.id));
  },

  async getByCode(code: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseMpTemplates)
      .where(and(eq(baseMpTemplates.code, code), eq(baseMpTemplates.isDeleted, 0)));
    return row || null;
  },

  async create(input: {
    code: string; name: string; measurementType: string;
    physicalQuantity?: string; defaultUnit?: string; defaultSampleRate?: number;
    defaultWarning?: number; defaultCritical?: number;
    sensorConfig?: any; thresholdConfig?: any; description?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseMpTemplates).values({
      code: input.code, name: input.name, measurementType: input.measurementType,
      physicalQuantity: input.physicalQuantity || null, defaultUnit: input.defaultUnit || null,
      defaultSampleRate: input.defaultSampleRate ?? null,
      defaultWarning: input.defaultWarning ?? null, defaultCritical: input.defaultCritical ?? null,
      sensorConfig: input.sensorConfig || null, thresholdConfig: input.thresholdConfig || null,
      description: input.description || null,
      isActive: 1, version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getByCode(input.code);
  },

  async update(code: string, input: {
    name?: string; defaultWarning?: number; defaultCritical?: number;
    sensorConfig?: any; description?: string; isActive?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.defaultWarning !== undefined) updateData.defaultWarning = input.defaultWarning;
    if (input.defaultCritical !== undefined) updateData.defaultCritical = input.defaultCritical;
    if (input.sensorConfig !== undefined) updateData.sensorConfig = input.sensorConfig;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    await db.update(baseMpTemplates).set(updateData)
      .where(and(eq(baseMpTemplates.code, code), eq(baseMpTemplates.isDeleted, 0)));
    return this.getByCode(code);
  },

  async delete(code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseMpTemplates).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseMpTemplates.code, code));
    return { success: true };
  },
};

// ============================================
// 标注维度
// ============================================

export const labelDimensionService = {
  async list() {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(baseLabelDimensions)
      .where(eq(baseLabelDimensions.isDeleted, 0))
      .orderBy(asc(baseLabelDimensions.sortOrder));
  },

  async getByCode(code: string) {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(baseLabelDimensions)
      .where(and(eq(baseLabelDimensions.code, code), eq(baseLabelDimensions.isDeleted, 0)));
    if (!row) return null;

    // 同时获取选项
    const options = await db.select().from(baseLabelOptions)
      .where(and(eq(baseLabelOptions.dimensionCode, code), eq(baseLabelOptions.isDeleted, 0)))
      .orderBy(asc(baseLabelOptions.sortOrder));

    return { ...row, options };
  },

  async create(input: {
    code: string; name: string; dimType: string;
    isRequired?: number; sortOrder?: number; description?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseLabelDimensions).values({
      code: input.code, name: input.name, dimType: input.dimType,
      isRequired: input.isRequired ?? 0, sortOrder: input.sortOrder ?? 0,
      description: input.description || null,
      isActive: 1, version: 1, createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getByCode(input.code);
  },

  async update(code: string, input: { name?: string; isRequired?: number; sortOrder?: number; description?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.isRequired !== undefined) updateData.isRequired = input.isRequired;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
    if (input.description !== undefined) updateData.description = input.description;
    await db.update(baseLabelDimensions).set(updateData)
      .where(and(eq(baseLabelDimensions.code, code), eq(baseLabelDimensions.isDeleted, 0)));
    return this.getByCode(code);
  },

  async delete(code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseLabelDimensions).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseLabelDimensions.code, code));
    return { success: true };
  },
};

// ============================================
// 标注值选项
// ============================================

export const labelOptionService = {
  async listByDimension(dimensionCode: string) {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(baseLabelOptions)
      .where(and(eq(baseLabelOptions.dimensionCode, dimensionCode), eq(baseLabelOptions.isDeleted, 0)))
      .orderBy(asc(baseLabelOptions.sortOrder));
  },

  async create(input: {
    dimensionCode: string; code: string; label: string;
    parentCode?: string; color?: string; isNormal?: number; samplePriority?: number;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseLabelOptions).values({
      dimensionCode: input.dimensionCode, code: input.code, label: input.label,
      parentCode: input.parentCode || null, color: input.color || null,
      isNormal: input.isNormal ?? 1, samplePriority: input.samplePriority ?? 5,
      sortOrder: 0, isActive: 1, version: 1,
      createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return { success: true };
  },

  async delete(dimensionCode: string, code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseLabelOptions).set({ isDeleted: 1, updatedAt: new Date() })
      .where(and(eq(baseLabelOptions.dimensionCode, dimensionCode), eq(baseLabelOptions.code, code)));
    return { success: true };
  },
};

// ============================================
// 数据字典
// ============================================

export const dictService = {
  async listCategories() {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(baseDictCategories)
      .where(eq(baseDictCategories.isDeleted, 0))
      .orderBy(asc(baseDictCategories.sortOrder));
  },

  async getCategoryWithItems(categoryCode: string) {
    const db = await getDb();
    if (!db) return null;
    const [cat] = await db.select().from(baseDictCategories)
      .where(and(eq(baseDictCategories.code, categoryCode), eq(baseDictCategories.isDeleted, 0)));
    if (!cat) return null;

    const items = await db.select().from(baseDictItems)
      .where(and(eq(baseDictItems.categoryCode, categoryCode), eq(baseDictItems.isDeleted, 0)))
      .orderBy(asc(baseDictItems.sortOrder));

    return { ...cat, items };
  },

  async createCategory(input: { code: string; name: string; description?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseDictCategories).values({
      code: input.code, name: input.name, description: input.description || null,
      isSystem: 0, isActive: 1, sortOrder: 0, version: 1,
      createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return this.getCategoryWithItems(input.code);
  },

  async createItem(input: {
    categoryCode: string; code: string; label: string;
    value?: string; parentCode?: string; color?: string;
  }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const now = new Date();
    await db.insert(baseDictItems).values({
      categoryCode: input.categoryCode, code: input.code, label: input.label,
      value: input.value || null, parentCode: input.parentCode || null, color: input.color || null,
      isActive: 1, sortOrder: 0, version: 1,
      createdBy: 'system', createdAt: now, updatedBy: 'system', updatedAt: now, isDeleted: 0,
    });
    return { success: true };
  },

  async updateItem(categoryCode: string, code: string, input: { label?: string; value?: string; color?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.label !== undefined) updateData.label = input.label;
    if (input.value !== undefined) updateData.value = input.value;
    if (input.color !== undefined) updateData.color = input.color;
    await db.update(baseDictItems).set(updateData)
      .where(and(eq(baseDictItems.categoryCode, categoryCode), eq(baseDictItems.code, code)));
    return { success: true };
  },

  async deleteItem(categoryCode: string, code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    await db.update(baseDictItems).set({ isDeleted: 1, updatedAt: new Date() })
      .where(and(eq(baseDictItems.categoryCode, categoryCode), eq(baseDictItems.code, code)));
    return { success: true };
  },

  async updateCategory(code: string, input: { name?: string; description?: string }) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    const updateData: any = { updatedAt: new Date(), updatedBy: 'system' };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    await db.update(baseDictCategories).set(updateData)
      .where(eq(baseDictCategories.code, code));
    return { success: true };
  },

  async deleteCategory(code: string) {
    const db = await getDb();
    if (!db) throw new Error('Database not available');
    // 软删除分类
    await db.update(baseDictCategories).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseDictCategories.code, code));
    // 同时软删除该分类下所有字典项
    await db.update(baseDictItems).set({ isDeleted: 1, updatedAt: new Date() })
      .where(eq(baseDictItems.categoryCode, code));
    return { success: true };
  },
};
