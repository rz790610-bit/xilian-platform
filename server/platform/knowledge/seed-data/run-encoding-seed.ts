/**
 * ============================================================================
 * 编码注册表 Seed 脚本
 * ============================================================================
 *
 * 将 3 类编码（设备/部件/部门）的 baseDictCategories + baseDictItems 写入数据库。
 * 幂等执行：已存在的记录跳过，不覆盖。
 *
 * 用法（由启动器或手动调用）：
 *   import { seedEncodingRegistry } from './run-encoding-seed';
 *   await seedEncodingRegistry();
 */
import { getDb } from '../../../lib/db';
import { baseDictCategories, baseDictItems } from '../../../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { ENCODING_CATEGORIES, ALL_ENCODING_ITEMS } from './encoding-seed';

export interface SeedResult {
  categoriesCreated: number;
  categoriesSkipped: number;
  itemsCreated: number;
  itemsSkipped: number;
  errors: string[];
}

export async function seedEncodingRegistry(): Promise<SeedResult> {
  const result: SeedResult = {
    categoriesCreated: 0,
    categoriesSkipped: 0,
    itemsCreated: 0,
    itemsSkipped: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push('数据库不可用，跳过编码注册表 seed');
    return result;
  }

  const now = new Date();

  // 1. 写入 baseDictCategories
  for (const cat of ENCODING_CATEGORIES) {
    try {
      const existing = await db
        .select()
        .from(baseDictCategories)
        .where(eq(baseDictCategories.code, cat.code))
        .limit(1);

      if (existing.length > 0) {
        result.categoriesSkipped++;
        continue;
      }

      await db.insert(baseDictCategories).values({
        code: cat.code,
        name: cat.name,
        description: cat.description,
        isSystem: cat.isSystem,
        isActive: 1,
        sortOrder: 0,
        version: 1,
        createdBy: 'system:encoding-seed',
        createdAt: now,
        updatedBy: 'system:encoding-seed',
        updatedAt: now,
        isDeleted: 0,
      });
      result.categoriesCreated++;
    } catch (err) {
      result.errors.push(`类别 ${cat.code}: ${(err as Error).message}`);
    }
  }

  // 2. 写入 baseDictItems
  for (const item of ALL_ENCODING_ITEMS) {
    try {
      const existing = await db
        .select()
        .from(baseDictItems)
        .where(
          and(
            eq(baseDictItems.categoryCode, item.categoryCode),
            eq(baseDictItems.code, item.code),
          )
        )
        .limit(1);

      if (existing.length > 0) {
        result.itemsSkipped++;
        continue;
      }

      await db.insert(baseDictItems).values({
        categoryCode: item.categoryCode,
        code: item.code,
        label: item.label,
        value: item.value ?? item.code,
        parentCode: item.parentCode ?? null,
        icon: null,
        color: null,
        metadata: item.metadata ?? null,
        isActive: 1,
        sortOrder: item.sortOrder ?? 0,
        version: 1,
        createdBy: 'system:encoding-seed',
        createdAt: now,
        updatedBy: 'system:encoding-seed',
        updatedAt: now,
        isDeleted: 0,
      });
      result.itemsCreated++;
    } catch (err) {
      result.errors.push(`字典项 ${item.categoryCode}.${item.code}: ${(err as Error).message}`);
    }
  }

  return result;
}
