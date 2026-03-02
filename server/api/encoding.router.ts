/**
 * ============================================================================
 * 编码注册表 API 路由
 * ============================================================================
 *
 * 提供：
 *   - validate:    校验编码格式+有效值
 *   - getLevelValues: 获取某类编码某级的全部有效值
 *   - seed:        执行编码种子数据写入
 *   - query:       查询字典表中的编码数据
 *
 * 3 类编码：设备主体编码 / 部件编码 / 部门编码
 */
import { router, publicProcedure } from '../core/trpc';
import { z } from 'zod';
import { getDb } from '../lib/db';
import { baseDictCategories, baseDictItems } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  getEncodingValidator,
  type EncodingType,
} from '../platform/knowledge/services/encoding-validator';
import { seedEncodingRegistry } from '../platform/knowledge/seed-data/run-encoding-seed';

const encodingTypeEnum = z.enum(['device', 'component', 'department']);

export const encodingRouter = router({
  /** 校验编码 */
  validate: publicProcedure
    .input(
      z.object({
        type: encodingTypeEnum,
        code: z.string(),
      })
    )
    .query(({ input }) => {
      const validator = getEncodingValidator();
      return validator.validate(input.type as EncodingType, input.code);
    }),

  /** 批量校验 */
  validateBatch: publicProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            type: encodingTypeEnum,
            code: z.string(),
          })
        ),
      })
    )
    .query(({ input }) => {
      const validator = getEncodingValidator();
      return validator.validateBatch(
        input.items.map((i) => ({ type: i.type as EncodingType, code: i.code }))
      );
    }),

  /** 获取某类编码某级的全部有效值 */
  getLevelValues: publicProcedure
    .input(
      z.object({
        type: encodingTypeEnum,
        level: z.number().int().min(1).max(7),
      })
    )
    .query(({ input }) => {
      const validator = getEncodingValidator();
      return {
        type: input.type,
        level: input.level,
        values: validator.getValidValues(input.type as EncodingType, input.level),
      };
    }),

  /** 获取子级有效值 */
  getChildValues: publicProcedure
    .input(
      z.object({
        type: encodingTypeEnum,
        parentCode: z.string(),
      })
    )
    .query(({ input }) => {
      const validator = getEncodingValidator();
      return {
        parentCode: input.parentCode,
        children: validator.getChildValues(input.type as EncodingType, input.parentCode),
      };
    }),

  /** 获取编码类别列表 */
  getCategories: publicProcedure.query(() => {
    const validator = getEncodingValidator();
    return validator.getCategories();
  }),

  /** 执行编码种子数据写入 */
  seed: publicProcedure.mutation(async () => {
    return seedEncodingRegistry();
  }),

  /** 从数据库查询编码字典项 */
  queryItems: publicProcedure
    .input(
      z.object({
        categoryCode: z.string(),
        parentCode: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], source: 'fallback' as const };

      try {
        const conditions = [eq(baseDictItems.categoryCode, input.categoryCode)];
        if (input.parentCode) {
          conditions.push(eq(baseDictItems.parentCode, input.parentCode));
        }

        const items = await db
          .select()
          .from(baseDictItems)
          .where(and(...conditions));

        return { items, source: 'database' as const };
      } catch {
        return { items: [], source: 'fallback' as const };
      }
    }),

  /** 新增编码项 — 校验通过后写入 baseDictItems */
  createItem: publicProcedure
    .input(
      z.object({
        type: encodingTypeEnum,
        level: z.number().int().min(1).max(7),
        code: z.string().min(1),
        label: z.string().min(1),
        parentCode: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // 1. 通过 EncodingValidator 校验编码格式
      const validator = getEncodingValidator();
      const validation = validator.validate(input.type as EncodingType, input.code);
      if (!validation.valid) {
        return {
          success: false as const,
          error: `编码格式校验失败: ${validation.errors.join('; ')}`,
        };
      }

      // 2. 映射 type → categoryCode
      const categoryCodeMap: Record<string, string> = {
        device: 'ENCODING_DEVICE',
        component: 'ENCODING_COMPONENT',
        department: 'ENCODING_DEPARTMENT',
      };
      const categoryCode = categoryCodeMap[input.type];

      // 3. 写入数据库
      const db = await getDb();
      if (!db) {
        return {
          success: false as const,
          error: '数据库不可用，请稍后重试',
        };
      }

      try {
        // 检查是否已存在（同 categoryCode + code）
        const existing = await db
          .select()
          .from(baseDictItems)
          .where(
            and(
              eq(baseDictItems.categoryCode, categoryCode),
              eq(baseDictItems.code, input.code)
            )
          );

        if (existing.length > 0) {
          return {
            success: false as const,
            error: `编码 "${input.code}" 已存在`,
          };
        }

        const now = new Date();
        await db.insert(baseDictItems).values({
          categoryCode,
          code: input.code,
          label: input.label,
          parentCode: input.parentCode ?? null,
          metadata: { level: input.level },
          isActive: 1,
          sortOrder: 0,
          version: 1,
          createdBy: 'system',
          createdAt: now,
          updatedBy: 'system',
          updatedAt: now,
          isDeleted: 0,
        });

        return { success: true as const, code: input.code };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false as const,
          error: `写入失败: ${message}`,
        };
      }
    }),

  /** 查询数据库中的编码类别 */
  queryCategories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { categories: [], source: 'fallback' as const };

    try {
      const cats = await db
        .select()
        .from(baseDictCategories)
        .where(eq(baseDictCategories.code, 'ENCODING_DEVICE'));

      // 查询所有 ENCODING_ 开头的类别
      const allCats = await db
        .select()
        .from(baseDictCategories);

      const encodingCats = allCats.filter((c) => c.code.startsWith('ENCODING_'));
      return { categories: encodingCats, source: 'database' as const };
    } catch {
      return { categories: [], source: 'fallback' as const };
    }
  }),
});
