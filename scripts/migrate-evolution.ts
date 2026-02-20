/**
 * ============================================================================
 * v5.0 进化数据库迁移脚本
 * ============================================================================
 *
 * 用法: npx tsx scripts/migrate-evolution.ts
 *
 * 该脚本确保 drizzle/evolution-schema.ts 中定义的 24 张新表
 * 被正确迁移到 MySQL 数据库中。
 *
 * 步骤:
 * 1. 验证 evolution-schema.ts 已被 drizzle/schema.ts 正确引用
 * 2. 生成迁移文件
 * 3. 执行迁移
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// 验证
// ============================================================================

function validateSchemaImport(): boolean {
  const schemaPath = path.resolve(__dirname, '../drizzle/schema.ts');
  const content = fs.readFileSync(schemaPath, 'utf-8');

  if (!content.includes('evolution-schema')) {
    console.error('❌ drizzle/schema.ts 未引用 evolution-schema.ts');
    console.error('   请在 drizzle/schema.ts 末尾添加:');
    console.error('   export * from "./evolution-schema";');
    return false;
  }

  console.log('✅ drizzle/schema.ts 已正确引用 evolution-schema.ts');
  return true;
}

function validateEvolutionSchema(): { valid: boolean; tableCount: number } {
  const evolutionPath = path.resolve(__dirname, '../drizzle/evolution-schema.ts');

  if (!fs.existsSync(evolutionPath)) {
    console.error('❌ drizzle/evolution-schema.ts 不存在');
    return { valid: false, tableCount: 0 };
  }

  const content = fs.readFileSync(evolutionPath, 'utf-8');
  const tableMatches = content.match(/export const \w+ = mysqlTable\(/g);
  const tableCount = tableMatches ? tableMatches.length : 0;

  console.log(`✅ evolution-schema.ts 包含 ${tableCount} 张表定义`);

  if (tableCount < 20) {
    console.warn(`⚠️  预期 24 张表，实际 ${tableCount} 张，请检查是否有遗漏`);
  }

  return { valid: tableCount > 0, tableCount };
}

// ============================================================================
// 迁移执行
// ============================================================================

function generateMigration(): boolean {
  try {
    console.log('📝 生成迁移文件...');
    execSync('npx drizzle-kit generate', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('✅ 迁移文件生成成功');
    return true;
  } catch (err) {
    console.error('❌ 迁移文件生成失败:', err);
    return false;
  }
}

function executeMigration(): boolean {
  try {
    console.log('🚀 执行数据库迁移...');
    execSync('npx drizzle-kit push', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('✅ 数据库迁移执行成功');
    return true;
  } catch (err) {
    console.error('❌ 数据库迁移执行失败:', err);
    return false;
  }
}

// ============================================================================
// 主流程
// ============================================================================

async function main() {
  console.log('============================================');
  console.log('v5.0 进化数据库迁移脚本');
  console.log('============================================');
  console.log('');

  // 步骤 1: 验证 schema 引用
  if (!validateSchemaImport()) {
    process.exit(1);
  }

  // 步骤 2: 验证 evolution-schema 完整性
  const { valid, tableCount } = validateEvolutionSchema();
  if (!valid) {
    process.exit(1);
  }

  console.log('');
  console.log(`准备迁移 ${tableCount} 张新表到数据库...`);
  console.log('');

  // 步骤 3: 生成迁移
  if (!generateMigration()) {
    process.exit(1);
  }

  // 步骤 4: 执行迁移
  if (!executeMigration()) {
    process.exit(1);
  }

  console.log('');
  console.log('============================================');
  console.log('✅ v5.0 进化数据库迁移完成');
  console.log(`   新增 ${tableCount} 张表`);
  console.log('============================================');
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
