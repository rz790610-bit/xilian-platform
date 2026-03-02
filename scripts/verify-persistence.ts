#!/usr/bin/env tsx
/**
 * ============================================================================
 * 持久化验证脚本
 * ============================================================================
 *
 * 验证 7 个服务的 DB 持久化是否正确连通。
 * 用法: npx tsx scripts/verify-persistence.ts
 *
 * 要求：MySQL 数据库可用，已执行 pnpm db:push 创建表。
 */

import { getDb } from '../server/lib/db';
import {
  knowledgeCrystals,
  grokReasoningChains,
  eventStore,
  knowledgeTriples,
  modelRegistry,
  featureRegistry,
} from '../drizzle/schema';
import { sql } from 'drizzle-orm';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m⊘\x1b[0m';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

async function main() {
  console.log('\n========================================');
  console.log('  持久化验证脚本');
  console.log('========================================\n');

  const results: CheckResult[] = [];
  const db = await getDb();

  if (!db) {
    console.log(`${FAIL} 数据库不可用 — 无法验证。请确认 MySQL 已启动并设置 DATABASE_URL。\n`);
    process.exit(1);
  }

  // 1. knowledge_crystals
  results.push(await checkTable('knowledge_crystals', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(knowledgeCrystals);
    return rows[0]?.cnt ?? 0;
  }));

  // 2. grok_reasoning_chains
  results.push(await checkTable('grok_reasoning_chains', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(grokReasoningChains);
    return rows[0]?.cnt ?? 0;
  }));

  // 3. event_store
  results.push(await checkTable('event_store', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(eventStore);
    return rows[0]?.cnt ?? 0;
  }));

  // 4. knowledge_triples
  results.push(await checkTable('knowledge_triples', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(knowledgeTriples);
    return rows[0]?.cnt ?? 0;
  }));

  // 5. model_registry
  results.push(await checkTable('model_registry', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(modelRegistry);
    return rows[0]?.cnt ?? 0;
  }));

  // 6. feature_registry
  results.push(await checkTable('feature_registry', async () => {
    const rows = await db.select({ cnt: sql<number>`COUNT(*)` }).from(featureRegistry);
    return rows[0]?.cnt ?? 0;
  }));

  // 7. MinIO (model-artifact) — 只检查连接
  results.push(await checkMinIO());

  // 打印汇总
  console.log('\n----------------------------------------');
  console.log('  汇总');
  console.log('----------------------------------------');
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const skipCount = results.filter(r => r.status === 'skip').length;
  console.log(`  通过: ${passCount}  失败: ${failCount}  跳过: ${skipCount}`);
  console.log('');

  process.exit(failCount > 0 ? 1 : 0);
}

async function checkTable(name: string, countFn: () => Promise<number>): Promise<CheckResult> {
  try {
    const count = await countFn();
    const icon = PASS;
    const detail = `表存在，当前 ${count} 行`;
    console.log(`  ${icon} ${name.padEnd(25)} ${detail}`);
    return { name, status: 'pass', detail };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("doesn't exist") || msg.includes('does not exist')) {
      console.log(`  ${FAIL} ${name.padEnd(25)} 表不存在 — 请执行 pnpm db:push`);
      return { name, status: 'fail', detail: '表不存在' };
    }
    console.log(`  ${FAIL} ${name.padEnd(25)} 查询失败: ${msg.slice(0, 80)}`);
    return { name, status: 'fail', detail: msg.slice(0, 120) };
  }
}

async function checkMinIO(): Promise<CheckResult> {
  try {
    const { config } = await import('../server/core/config');
    if (!config.minio.enabled) {
      console.log(`  ${SKIP} minio (model-artifact)     已禁用 (MINIO_ENABLED=false)`);
      return { name: 'minio', status: 'skip', detail: 'disabled' };
    }
    const { Client } = await import('minio');
    const client = new Client({
      endPoint: config.minio.endpoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
    const buckets = await client.listBuckets();
    console.log(`  ${PASS} minio (model-artifact)     连接成功, ${buckets.length} 个 bucket`);
    return { name: 'minio', status: 'pass', detail: `${buckets.length} buckets` };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.log(`  ${FAIL} minio (model-artifact)     连接失败: ${msg.slice(0, 80)}`);
    return { name: 'minio', status: 'fail', detail: msg.slice(0, 120) };
  }
}

main().catch(err => {
  console.error('验证脚本异常:', err);
  process.exit(1);
});
