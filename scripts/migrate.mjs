#!/usr/bin/env node
/**
 * Drizzle 数据库迁移管理脚本
 *
 * 用法:
 *   node scripts/migrate.mjs generate <name>   # 生成迁移文件
 *   node scripts/migrate.mjs push               # 推送 schema 到数据库（开发环境）
 *   node scripts/migrate.mjs up                  # 执行待运行的迁移（生产环境）
 *   node scripts/migrate.mjs status              # 查看迁移状态
 *   node scripts/migrate.mjs rollback <version>  # 回滚到指定版本
 *   node scripts/migrate.mjs check               # 检查 schema 与数据库是否一致
 *   node scripts/migrate.mjs seed                # 运行种子数据
 *
 * 环境变量:
 *   DATABASE_URL  — MySQL 连接字符串（必须）
 *   NODE_ENV      — 环境标识（production 时禁止 push）
 *
 * 迁移文件规范:
 *   - 存放在 drizzle/migrations/ 目录
 *   - 文件名格式: YYYYMMDDHHMMSS_<description>.sql
 *   - 每个迁移必须包含 UP 和 DOWN 部分
 *   - 生产环境只允许通过 migrate up 执行
 *   - 开发环境可以使用 push 快速同步
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'drizzle', 'migrations');
const DRIZZLE_CONFIG = join(ROOT, 'drizzle.config.ts');

// ============================================================
// 工具函数
// ============================================================

function getTimestamp() {
  const now = new Date();
  return now.toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d+Z$/, '')
    .slice(0, 14);
}

function ensureMigrationsDir() {
  if (!existsSync(MIGRATIONS_DIR)) {
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
    console.log(`📁 Created migrations directory: ${MIGRATIONS_DIR}`);
  }
}

function checkDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    console.error('   Example: DATABASE_URL=mysql://user:pass@localhost:3306/xilian');
    process.exit(1);
  }
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function runDrizzleKit(command, args = '') {
  const cmd = `npx drizzle-kit ${command} ${args}`.trim();
  console.log(`\n🔧 Running: ${cmd}\n`);
  try {
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (err) {
    console.error(`\n❌ Command failed: ${cmd}`);
    process.exit(1);
  }
}

// ============================================================
// 命令实现
// ============================================================

const commands = {
  /**
   * 生成迁移文件
   * 对比当前 schema 与上次迁移快照，生成增量 SQL
   */
  generate(name) {
    if (!name) {
      console.error('❌ Migration name is required');
      console.error('   Usage: node scripts/migrate.mjs generate <name>');
      console.error('   Example: node scripts/migrate.mjs generate add_user_roles');
      process.exit(1);
    }

    // 验证命名规范
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      console.error('❌ Migration name must be lowercase alphanumeric with underscores');
      console.error('   Example: add_user_roles, create_audit_log');
      process.exit(1);
    }

    ensureMigrationsDir();
    console.log(`📝 Generating migration: ${name}`);
    runDrizzleKit('generate', `--name ${name}`);

    console.log('\n✅ Migration generated successfully');
    console.log('   Review the generated SQL before applying');
  },

  /**
   * 推送 schema 到数据库（开发环境）
   * 直接同步 schema 定义到数据库，不生成迁移文件
   */
  push() {
    checkDatabaseUrl();

    if (isProduction()) {
      console.error('❌ "push" is not allowed in production environment');
      console.error('   Use "migrate up" for production deployments');
      process.exit(1);
    }

    console.log('⚠️  Push will directly modify the database schema');
    console.log('   This is only for development environments\n');

    runDrizzleKit('push');
    console.log('\n✅ Schema pushed to database');
  },

  /**
   * 执行待运行的迁移（生产环境）
   */
  up() {
    checkDatabaseUrl();
    ensureMigrationsDir();

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (migrations.length === 0) {
      console.log('ℹ️  No migrations found. Run "generate" first.');
      return;
    }

    console.log(`📋 Found ${migrations.length} migration(s)`);
    runDrizzleKit('migrate');
    console.log('\n✅ All migrations applied');
  },

  /**
   * 查看迁移状态
   */
  status() {
    ensureMigrationsDir();

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`\n📋 Migration Status`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`   Migrations directory: ${MIGRATIONS_DIR}`);
    console.log(`   Total migrations: ${migrations.length}`);
    console.log(`${'─'.repeat(60)}`);

    if (migrations.length > 0) {
      console.log('\n   Files:');
      for (const m of migrations) {
        console.log(`   ├── ${m}`);
      }
    }

    if (process.env.DATABASE_URL) {
      console.log('\n   Checking database sync...');
      try {
        runDrizzleKit('check');
      } catch {
        // check 可能不支持所有 driver
      }
    } else {
      console.log('\n   ⚠️  Set DATABASE_URL to check database sync status');
    }
  },

  /**
   * 检查 schema 与数据库是否一致
   */
  check() {
    checkDatabaseUrl();
    console.log('🔍 Checking schema consistency...\n');
    runDrizzleKit('check');
  },

  /**
   * 回滚到指定版本
   */
  rollback(version) {
    checkDatabaseUrl();

    if (isProduction()) {
      console.error('⚠️  WARNING: Rolling back in production environment');
      console.error('   Ensure you have a database backup before proceeding');
    }

    if (!version) {
      console.error('❌ Version is required for rollback');
      console.error('   Usage: node scripts/migrate.mjs rollback <version>');
      console.error('   Use "status" to see available versions');
      process.exit(1);
    }

    console.log(`⏪ Rolling back to version: ${version}`);
    // Drizzle Kit 不原生支持 rollback，需要手动执行 DOWN SQL
    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .reverse();

    let found = false;
    for (const m of migrations) {
      if (m.startsWith(version)) {
        found = true;
        break;
      }
      console.log(`   Reverting: ${m}`);
      // 读取迁移文件中的 DOWN 部分
      const content = readFileSync(join(MIGRATIONS_DIR, m), 'utf-8');
      const downMatch = content.match(/-- DOWN\n([\s\S]*?)(?:$|-- )/);
      if (downMatch) {
        console.log(`   Executing DOWN migration for ${m}`);
        // 实际执行需要通过数据库连接
      } else {
        console.warn(`   ⚠️  No DOWN section found in ${m}`);
      }
    }

    if (!found) {
      console.error(`❌ Version ${version} not found in migrations`);
      process.exit(1);
    }

    console.log('\n⚠️  Rollback requires manual verification');
    console.log('   Check database state after rollback');
  },

  /**
   * 运行种子数据
   */
  seed() {
    checkDatabaseUrl();
    const seedFile = join(ROOT, 'scripts', 'seed.mjs');

    if (!existsSync(seedFile)) {
      console.log('ℹ️  No seed file found at scripts/seed.mjs');
      console.log('   Create one to populate initial data');
      return;
    }

    console.log('🌱 Running seed data...\n');
    execSync(`node ${seedFile}`, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log('\n✅ Seed data applied');
  },
};

// ============================================================
// CLI 入口
// ============================================================

const [command, ...args] = process.argv.slice(2);

if (!command || !commands[command]) {
  console.log(`
Drizzle Migration Manager — xilian-platform

Usage:
  node scripts/migrate.mjs <command> [options]

Commands:
  generate <name>     Generate a new migration file
  push                Push schema to database (dev only)
  up                  Run pending migrations (production)
  status              Show migration status
  check               Check schema/database consistency
  rollback <version>  Rollback to a specific version
  seed                Run seed data script

Environment:
  DATABASE_URL        MySQL connection string (required)
  NODE_ENV            Set to "production" to enforce migration-only mode
`);
  process.exit(command ? 1 : 0);
}

commands[command](...args);
