/**
 * ============================================================================
 * ClickHouse 物化视图 DDL 执行脚本
 * ============================================================================
 *
 * 用法: npx tsx scripts/setup-clickhouse.ts
 *
 * 该脚本读取 server/platform/contracts/clickhouse-views.sql 中的 DDL，
 * 逐条执行到 ClickHouse 实例中。
 *
 * 环境变量:
 *   CLICKHOUSE_HOST     (默认: localhost)
 *   CLICKHOUSE_PORT     (默认: 8123)
 *   CLICKHOUSE_DATABASE (默认: xilian)
 *   CLICKHOUSE_USER     (默认: default)
 *   CLICKHOUSE_PASSWORD (默认: 空)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// ============================================================================
// 配置
// ============================================================================

const config = {
  host: process.env.CLICKHOUSE_HOST || 'localhost',
  port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
  database: process.env.CLICKHOUSE_DATABASE || 'xilian',
  user: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
};

// ============================================================================
// ClickHouse HTTP 客户端
// ============================================================================

function executeQuery(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      database: config.database,
      user: config.user,
      password: config.password,
    });

    const options: http.RequestOptions = {
      hostname: config.host,
      port: config.port,
      path: `/?${params.toString()}`,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(query),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`ClickHouse 错误 (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(query);
    req.end();
  });
}

// ============================================================================
// DDL 解析与执行
// ============================================================================

function parseDDLStatements(sql: string): string[] {
  // 按分号分割，但忽略注释中的分号
  const statements: string[] = [];
  let current = '';
  let inComment = false;

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();

    // 跳过单行注释
    if (trimmed.startsWith('--')) {
      continue;
    }

    // 块注释处理
    if (trimmed.startsWith('/*')) {
      inComment = true;
    }
    if (inComment) {
      if (trimmed.includes('*/')) {
        inComment = false;
      }
      continue;
    }

    current += line + '\n';

    // 检测语句结束（分号在行尾）
    if (trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 1) {
        statements.push(stmt.replace(/;$/, ''));
      }
      current = '';
    }
  }

  // 处理最后一条没有分号的语句
  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

async function main() {
  console.log('============================================');
  console.log('ClickHouse 物化视图 DDL 执行脚本');
  console.log('============================================');
  console.log(`目标: ${config.host}:${config.port}/${config.database}`);
  console.log('');

  // 读取 DDL 文件
  const ddlPath = path.resolve(__dirname, '../server/platform/contracts/clickhouse-views.sql');

  if (!fs.existsSync(ddlPath)) {
    console.error(`❌ DDL 文件不存在: ${ddlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(ddlPath, 'utf-8');
  const statements = parseDDLStatements(sql);

  console.log(`📄 读取到 ${statements.length} 条 DDL 语句`);
  console.log('');

  // 先创建数据库（如果不存在）
  try {
    await executeQuery(`CREATE DATABASE IF NOT EXISTS ${config.database}`);
    console.log(`✅ 数据库 ${config.database} 已就绪`);
  } catch (err) {
    console.error(`❌ 创建数据库失败:`, err);
    process.exit(1);
  }

  // 逐条执行 DDL
  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');

    try {
      await executeQuery(stmt);
      success++;
      console.log(`✅ [${i + 1}/${statements.length}] ${preview}...`);
    } catch (err) {
      failed++;
      console.error(`❌ [${i + 1}/${statements.length}] ${preview}...`);
      console.error(`   错误: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('');
  console.log('============================================');
  console.log(`执行完成: ${success} 成功, ${failed} 失败`);
  console.log('============================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
