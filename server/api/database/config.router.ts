import { z, router, publicProcedure } from './_shared';
import { codeRuleService, nodeTemplateService, mpTemplateService, labelDimensionService, labelOptionService, dictService } from '../../services/database/config.service';

export const configRouter = router({
  // --- 编码规则 ---
  listCodeRules: publicProcedure
    .query(() => codeRuleService.list()),

  getCodeRule: publicProcedure
    .input(z.object({ ruleCode: z.string() }))
    .query(({ input }) => codeRuleService.getByCode(input.ruleCode)),

  createCodeRule: publicProcedure
    .input(z.object({
      ruleCode: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      segments: z.any(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => codeRuleService.create(input)),

  updateCodeRule: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      name: z.string().optional(),
      segments: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { ruleCode, ...data } = input;
      return codeRuleService.update(ruleCode, data);
    }),

  deleteCodeRule: publicProcedure
    .input(z.object({ ruleCode: z.string() }))
    .mutation(({ input }) => codeRuleService.delete(input.ruleCode)),

  generateCode: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      category: z.string().optional(),
      deviceRef: z.string().optional(),
      nodeRef: z.string().optional(),
      measurementType: z.string().optional(),
      customSegments: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(({ input }) => {
      const { ruleCode, ...rest } = input;
      const context: { category?: string; deviceRef?: string; nodeRef?: string; measurementType?: string; customSegments?: Record<string, string> } = {
        category: rest.category,
        deviceRef: rest.deviceRef,
        nodeRef: rest.nodeRef,
        measurementType: rest.measurementType,
        customSegments: rest.customSegments as Record<string, string> | undefined,
      };
      return codeRuleService.generateCode(ruleCode, context);
    }),

  previewCode: publicProcedure
    .input(z.object({
      ruleCode: z.string(),
      category: z.string().optional(),
      deviceRef: z.string().optional(),
      nodeRef: z.string().optional(),
      measurementType: z.string().optional(),
      customSegments: z.record(z.string(), z.string()).optional(),
    }))
    .query(({ input }) => {
      const { ruleCode, ...rest } = input;
      const context: { category?: string; deviceRef?: string; nodeRef?: string; measurementType?: string; customSegments?: Record<string, string> } = {
        category: rest.category,
        deviceRef: rest.deviceRef,
        nodeRef: rest.nodeRef,
        measurementType: rest.measurementType,
        customSegments: rest.customSegments as Record<string, string> | undefined,
      };
      return codeRuleService.previewCode(ruleCode, context);
    }),

  // --- 节点模板 ---
  listNodeTemplates: publicProcedure
    .input(z.object({ level: z.number().optional(), nodeType: z.string().optional() }).optional())
    .query(({ input }) => nodeTemplateService.list(input ?? undefined)),

  getNodeTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => nodeTemplateService.getByCode(input.code)),

  createNodeTemplate: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      level: z.number().int().min(1).max(10),
      nodeType: z.string().min(1).max(20),
      derivedFrom: z.string().optional(),
      codeRule: z.string().optional(),
      codePrefix: z.string().optional(),
      icon: z.string().optional(),
      children: z.any().optional(),
      attributes: z.any().optional(),
      measurementPoints: z.any().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => nodeTemplateService.create(input)),

  updateNodeTemplate: publicProcedure
    .input(z.object({
      code: z.string(),
      name: z.string().optional(),
      icon: z.string().optional(),
      children: z.any().optional(),
      attributes: z.any().optional(),
      measurementPoints: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return nodeTemplateService.update(code, data);
    }),

  deleteNodeTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(({ input }) => nodeTemplateService.delete(input.code)),

  // --- 测点模板 ---
  listMpTemplates: publicProcedure
    .input(z.object({ measurementType: z.string().optional() }).optional())
    .query(({ input }) => mpTemplateService.list(input ?? undefined)),

  getMpTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => mpTemplateService.getByCode(input.code)),

  createMpTemplate: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      measurementType: z.string().min(1),
      physicalQuantity: z.string().optional(),
      defaultUnit: z.string().optional(),
      defaultSampleRate: z.number().optional(),
      defaultWarning: z.number().optional(),
      defaultCritical: z.number().optional(),
      sensorConfig: z.any().optional(),
      thresholdConfig: z.any().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => mpTemplateService.create(input)),

  updateMpTemplate: publicProcedure
    .input(z.object({
      code: z.string(),
      name: z.string().optional(),
      defaultWarning: z.number().optional(),
      defaultCritical: z.number().optional(),
      sensorConfig: z.any().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return mpTemplateService.update(code, data);
    }),

  deleteMpTemplate: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(({ input }) => mpTemplateService.delete(input.code)),

  // --- 标注维度 ---
  listLabelDimensions: publicProcedure
    .query(() => labelDimensionService.list()),

  getLabelDimension: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => labelDimensionService.getByCode(input.code)),

  createLabelDimension: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      dimType: z.string().min(1),
      isRequired: z.number().optional(),
      sortOrder: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => labelDimensionService.create(input)),

  createLabelOption: publicProcedure
    .input(z.object({
      dimensionCode: z.string().min(1),
      code: z.string().min(1).max(64),
      label: z.string().min(1).max(100),
      parentCode: z.string().optional(),
      color: z.string().optional(),
      isNormal: z.number().optional(),
      samplePriority: z.number().optional(),
    }))
    .mutation(({ input }) => labelOptionService.create(input)),

  // --- 数据字典 ---
  listDictCategories: publicProcedure
    .query(() => dictService.listCategories()),

  getDictCategory: publicProcedure
    .input(z.object({ categoryCode: z.string() }))
    .query(({ input }) => dictService.getCategoryWithItems(input.categoryCode)),

  createDictCategory: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => dictService.createCategory(input)),

  createDictItem: publicProcedure
    .input(z.object({
      categoryCode: z.string().min(1),
      code: z.string().min(1).max(64),
      label: z.string().min(1).max(100),
      value: z.string().optional(),
      parentCode: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => dictService.createItem(input)),

  updateDictItem: publicProcedure
    .input(z.object({
      categoryCode: z.string(),
      code: z.string(),
      label: z.string().optional(),
      value: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { categoryCode, code, ...data } = input;
      return dictService.updateItem(categoryCode, code, data);
    }),

  deleteDictItem: publicProcedure
    .input(z.object({ categoryCode: z.string(), code: z.string() }))
    .mutation(({ input }) => dictService.deleteItem(input.categoryCode, input.code)),

  updateDictCategory: publicProcedure
    .input(z.object({
      code: z.string().min(1),
      name: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const { code, ...data } = input;
      return dictService.updateCategory(code, data);
    }),

  deleteDictCategory: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(({ input }) => dictService.deleteCategory(input.code)),
});
