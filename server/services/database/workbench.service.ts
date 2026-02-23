/**
 * 数据库工作台服务层
 * 
 * 平台级数据库管理能力：
 * - 连接状态检测与管理
 * - 表结构查询/创建/修改/删除
 * - 数据浏览/插入/更新/删除
 * - SQL 直接执行（带历史记录）
 * - 动态 API 端点注册（与平台模块联动）
 * - 表与业务模块关联元数据
 * - 数据导出（CSV/JSON）
 * - 表结构对比与迁移
 */

import { sql } from "drizzle-orm";
import { config } from '../../core/config';
import { getDb } from "../../lib/db";
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('workbench');

// P0 修复：统一的标识符验证（表名、列名）
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
function validateIdentifier(name: string, type: 'table' | 'column'): void {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`[Workbench] Invalid ${type} name: "${name}" — only [a-zA-Z0-9_] allowed, max 64 chars`);
  }
}

// P0 修复：SQL 工作台危险操作黑名单
const DANGEROUS_SQL_PATTERNS = [
  /DROP\s+DATABASE/i,
  /DROP\s+SCHEMA/i,
  /GRANT\s/i,
  /REVOKE\s/i,
  /CREATE\s+USER/i,
  /ALTER\s+USER/i,
  /DROP\s+USER/i,
  /LOAD\s+DATA/i,
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
];
function validateWorkbenchQuery(query: string): void {
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(query)) {
      throw new Error(`[Workbench] Forbidden SQL pattern detected: ${pattern.source}`);
    }
  }
  // 禁止多语句执行（分号分隔）
  const trimmed = query.trim().replace(/;\s*$/, ''); // 允许末尾分号
  if (trimmed.includes(';')) {
    throw new Error('[Workbench] Multi-statement execution is not allowed');
  }
}

// ============ 类型定义 ============

export interface ConnectionStatus {

  connected: boolean;
  host: string;
  port: number;
  database: string;
  version: string;
  uptime: number;
  charset: string;
  maxConnections: number;
  currentConnections: number;
  dataSize: string;
  indexSize: string;
  totalTables: number;
}

export interface TableInfo {
  name: string;
  engine: string;
  rows: number;
  dataLength: number;
  indexLength: number;
  createTime: string;
  updateTime: string | null;
  collation: string;
  comment: string;
  linkedModule: string | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  key: string;
  extra: string;
  comment: string;
  ordinalPosition: number;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  type: string;
}

export interface ForeignKeyInfo {
  name: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete: string;
  onUpdate: string;
}

export interface CreateColumnDef {
  name: string;
  type: string;
  length?: number;
  nullable?: boolean;
  defaultValue?: string;
  autoIncrement?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  comment?: string;
}

export interface SqlResult {
  type: 'select' | 'mutation' | 'error';
  columns?: string[];
  rows?: Record<string, unknown>[];
  affectedRows?: number;
  executionTime: number;
  error?: string;
}

export interface SqlHistoryEntry {
  id: number;
  query: string;
  type: 'select' | 'mutation' | 'error';
  executionTime: number;
  rowCount: number;
  timestamp: string;
  error?: string;
}

// ============ 辅助函数 ============

/** 安全执行 SQL 并提取行数组 */
async function execQuery(db: any, rawSQL: string): Promise<any[]> {
  const result = await db.execute(sql.raw(rawSQL));
  // db.execute 返回 [rows, fields]，rows 是数组
  return Array.isArray(result[0]) ? result[0] : (result[0] ? [result[0]] : []);
}

/** 安全执行参数化 SQL 并提取行数组 */
async function execParamQuery(db: any, sqlExpr: any): Promise<any[]> {
  const result = await db.execute(sqlExpr);
  return Array.isArray(result[0]) ? result[0] : (result[0] ? [result[0]] : []);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============ 模块关联映射 ============

const MODULE_TABLE_MAP: Record<string, string> = {
  // 设备管理
  'devices': '设备管理',
  'sensors': '设备管理',
  'device_alerts': '设备管理',
  'device_maintenance_records': '设备管理',
  'device_spare_parts': '设备管理',
  'device_operation_logs': '设备管理',
  'device_kpis': '设备管理',
  'sensor_calibrations': '设备管理',
  'sensor_readings': '设备管理',
  'sensor_aggregates': '设备管理',
  'telemetry_data': '设备管理',
  // 知识库
  'kb_collections': '知识库',
  'kb_points': '知识库',
  'kb_documents': '知识库',
  'kg_nodes': '知识库',
  'kg_edges': '知识库',
  // 数据库模块
  'asset_tree_nodes': '数据库',
  'measurement_points': '数据库',
  'sensor_configs': '数据库',
  'code_rules': '数据库',
  'node_type_templates': '数据库',
  'mp_type_templates': '数据库',
  'label_dimensions': '数据库',
  'dict_categories': '数据库',
  'dict_entries': '数据库',
  'slice_rules': '数据库',
  'data_slices': '数据库',
  'slice_labels': '数据库',
  'clean_rules': '数据库',
  'clean_tasks': '数据库',
  'quality_reports': '数据库',
  'event_store': '数据库',
  'event_snapshots': '数据库',
  // 性能模块
  'outbox_events': '性能优化',
  'outbox_routing_config': '性能优化',
  'saga_instances': '性能优化',
  'saga_steps': '性能优化',
  'saga_dead_letters': '性能优化',
  'device_sampling_config': '性能优化',
  'sampling_metrics': '性能优化',
  'idempotent_records': '性能优化',
  'read_replica_config': '性能优化',
  'graph_query_cache': '性能优化',
  'graph_query_patterns': '性能优化',
  'processed_events': '性能优化',
  'rollback_executions': '性能优化',
  // 模型中心
  'models': '模型中心',
  'model_messages': '模型中心',
  'model_usage_logs': '模型中心',
  'model_evaluations': '模型中心',
  'model_fine_tune_tasks': '模型中心',
  // 系统
  'users': '系统设置',
  'system_capacity_metrics': '系统设置',
  'topo_nodes': '系统拓扑',
  'topo_edges': '系统拓扑',
  'topo_layouts': '系统拓扑',
};

// ============ SQL 执行历史（内存存储） ============

const sqlHistory: SqlHistoryEntry[] = [];
let historyIdCounter = 1;

function addToHistory(entry: Omit<SqlHistoryEntry, 'id' | 'timestamp'>): void {
  sqlHistory.unshift({
    ...entry,
    id: historyIdCounter++,
    timestamp: new Date().toISOString(),
  });
  // 保留最近 200 条
  if (sqlHistory.length > 200) sqlHistory.length = 200;
}

// ============ 连接管理 ============

export const connectionService = {
  async getStatus(): Promise<ConnectionStatus> {
    const db = await getDb();
    if (!db) {
      return {
        connected: false, host: '-', port: 0, database: '-',
        version: '-', uptime: 0, charset: '-',
        maxConnections: 0, currentConnections: 0,
        dataSize: '0 B', indexSize: '0 B', totalTables: 0,
      };
    }

    try {
      // 合并查询减少 round-trip
      const infoRows = await execQuery(db,
        `SELECT VERSION() as version, DATABASE() as db_name, @@character_set_database as charset`
      );
      const info = infoRows[0] || {};

      const uptimeRows = await execQuery(db, `SHOW STATUS LIKE 'Uptime'`);
      const maxConnRows = await execQuery(db, `SHOW VARIABLES LIKE 'max_connections'`);
      const curConnRows = await execQuery(db, `SHOW STATUS LIKE 'Threads_connected'`);

      const tableCountRows = await execQuery(db,
        `SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
      );

      const sizeRows = await execQuery(db,
        `SELECT SUM(DATA_LENGTH) as data_size, SUM(INDEX_LENGTH) as index_size FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
      );

      return {
        connected: true,
        host: config.mysql.host,
        port: config.mysql.port,
        database: String(info.db_name || '-'),
        version: String(info.version || '-'),
        uptime: Number(uptimeRows[0]?.Value || 0),
        charset: String(info.charset || 'utf8mb4'),
        maxConnections: Number(maxConnRows[0]?.Value || 0),
        currentConnections: Number(curConnRows[0]?.Value || 0),
        dataSize: formatBytes(Number(sizeRows[0]?.data_size || 0)),
        indexSize: formatBytes(Number(sizeRows[0]?.index_size || 0)),
        totalTables: Number(tableCountRows[0]?.cnt || 0),
      };
    } catch (error) {
      log.warn('[Workbench] Failed to get connection status:', error);
      return {
        connected: false, host: '-', port: 0, database: '-',
        version: '-', uptime: 0, charset: '-',
        maxConnections: 0, currentConnections: 0,
        dataSize: '0 B', indexSize: '0 B', totalTables: 0,
      };
    }
  },

  async testConnection(): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now();
    const db = await getDb();
    if (!db) return { success: false, latency: 0, error: '数据库未配置' };

    try {
      await db.execute(sql`SELECT 1`);
      return { success: true, latency: Date.now() - start };
    } catch (error: any) {
      return { success: false, latency: Date.now() - start, error: error.message };
    }
  },

  async getProcessList(): Promise<Array<{ id: number; user: string; host: string; db: string; command: string; time: number; state: string; info: string }>> {
    const db = await getDb();
    if (!db) return [];

    try {
      const rows = await execQuery(db, `SHOW PROCESSLIST`);
      return rows.map((r: any) => ({
        id: Number(r.Id),
        user: String(r.User || ''),
        host: String(r.Host || ''),
        db: String(r.db || ''),
        command: String(r.Command || ''),
        time: Number(r.Time || 0),
        state: String(r.State || ''),
        info: String(r.Info || '').substring(0, 200),
      }));
    } catch (error) {
      log.warn('[Workbench] Failed to get process list:', error);
      return [];
    }
  },

  async getVariables(filter?: string): Promise<Array<{ name: string; value: string }>> {
    const db = await getDb();
    if (!db) return [];

    try {
      const query = filter
        ? `SHOW VARIABLES LIKE '%${filter.replace(/'/g, "''").replace(/%/g, '')}%'`
        : `SHOW VARIABLES`;
      const rows = await execQuery(db, query);
      return rows.map((r: any) => ({
        name: String(r.Variable_name || ''),
        value: String(r.Value || ''),
      }));
    } catch (error) {
      return [];
    }
  },
};

// ============ 表结构管理 ============

export const tableService = {
  async listTables(): Promise<TableInfo[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const rows = await execQuery(db, `
        SELECT 
          TABLE_NAME as name,
          ENGINE as engine,
          TABLE_ROWS as \`rows\`,
          DATA_LENGTH as dataLength,
          INDEX_LENGTH as indexLength,
          CREATE_TIME as createTime,
          UPDATE_TIME as updateTime,
          TABLE_COLLATION as collation,
          TABLE_COMMENT as comment
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME
      `);

      return rows.map((row: any) => ({
        name: String(row.name || ''),
        engine: String(row.engine || 'InnoDB'),
        rows: Number(row.rows || 0),
        dataLength: Number(row.dataLength || 0),
        indexLength: Number(row.indexLength || 0),
        createTime: row.createTime ? String(row.createTime) : '',
        updateTime: row.updateTime ? String(row.updateTime) : null,
        collation: String(row.collation || 'utf8mb4_unicode_ci'),
        comment: String(row.comment || ''),
        linkedModule: MODULE_TABLE_MAP[row.name] || null,
      }));
    } catch (error) {
      log.warn('[Workbench] Failed to list tables:', error);
      return [];
    }
  },

  async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const safeTable = tableName.replace(/'/g, "''");
      const rows = await execQuery(db, `
        SELECT 
          COLUMN_NAME as name,
          COLUMN_TYPE as type,
          IS_NULLABLE as nullable,
          COLUMN_DEFAULT as defaultValue,
          COLUMN_KEY as \`key\`,
          EXTRA as extra,
          COLUMN_COMMENT as comment,
          ORDINAL_POSITION as ordinalPosition
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}'
        ORDER BY ORDINAL_POSITION
      `);

      return rows.map((row: any) => ({
        name: String(row.name || ''),
        type: String(row.type || ''),
        nullable: row.nullable === 'YES',
        defaultValue: row.defaultValue !== null ? String(row.defaultValue) : null,
        key: String(row.key || ''),
        extra: String(row.extra || ''),
        comment: String(row.comment || ''),
        ordinalPosition: Number(row.ordinalPosition || 0),
      }));
    } catch (error) {
      log.warn('[Workbench] Failed to get columns:', error);
      return [];
    }
  },

  async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const rows = await execQuery(db, `SHOW INDEX FROM \`${tableName.replace(/`/g, '')}\``);
      const indexMap = new Map<string, IndexInfo>();

      for (const row of rows) {
        const name = String(row.Key_name || '');
        if (!indexMap.has(name)) {
          indexMap.set(name, {
            name,
            columns: [],
            unique: !row.Non_unique,
            type: String(row.Index_type || 'BTREE'),
          });
        }
        indexMap.get(name)!.columns.push(String(row.Column_name || ''));
      }

      return Array.from(indexMap.values());
    } catch (error) {
      log.warn('[Workbench] Failed to get indexes:', error);
      return [];
    }
  },

  async getTableForeignKeys(tableName: string): Promise<ForeignKeyInfo[]> {
    const db = await getDb();
    if (!db) return [];

    try {
      const safeTable = tableName.replace(/'/g, "''");
      const rows = await execQuery(db, `
        SELECT 
          kcu.CONSTRAINT_NAME as name,
          kcu.COLUMN_NAME as col,
          kcu.REFERENCED_TABLE_NAME as refTable,
          kcu.REFERENCED_COLUMN_NAME as refCol,
          rc.DELETE_RULE as onDelete,
          rc.UPDATE_RULE as onUpdate
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
          AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = DATABASE() 
          AND kcu.TABLE_NAME = '${safeTable}'
          AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      `);

      return rows.map((row: any) => ({
        name: String(row.name || ''),
        column: String(row.col || ''),
        referencedTable: String(row.refTable || ''),
        referencedColumn: String(row.refCol || ''),
        onDelete: String(row.onDelete || 'RESTRICT'),
        onUpdate: String(row.onUpdate || 'RESTRICT'),
      }));
    } catch (error) {
      log.warn('[Workbench] Failed to get foreign keys:', error);
      return [];
    }
  },

  async getCreateTableSQL(tableName: string): Promise<string> {
    const db = await getDb();
    if (!db) return '';

    try {
      const rows = await execQuery(db, `SHOW CREATE TABLE \`${tableName.replace(/`/g, '')}\``);
      return String(rows[0]?.['Create Table'] || '');
    } catch (error) {
      log.warn('[Workbench] Failed to get CREATE TABLE:', error);
      return '';
    }
  },

  async createTable(tableName: string, columns: CreateColumnDef[], comment?: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
        return { success: false, error: '表名只能包含字母、数字和下划线，且以字母或下划线开头' };
      }

      if (columns.length === 0) {
        return { success: false, error: '至少需要定义一个字段' };
      }

      const columnDefs: string[] = [];
      const primaryKeys: string[] = [];

      for (const col of columns) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
          return { success: false, error: `字段名 "${col.name}" 无效，只能包含字母、数字和下划线` };
        }

        let typeDef = col.type;
        if (col.length && !col.type.includes('(')) {
          typeDef = `${col.type}(${col.length})`;
        }

        let def = `\`${col.name}\` ${typeDef}`;
        if (col.autoIncrement) def += ' AUTO_INCREMENT';
        if (col.nullable === false) def += ' NOT NULL';
        else if (col.nullable === true) def += ' NULL';
        if (col.defaultValue !== undefined && col.defaultValue !== '') {
          const dv = col.defaultValue.toUpperCase();
          if (dv === 'NULL') def += ' DEFAULT NULL';
          else if (dv === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
          else def += ` DEFAULT '${col.defaultValue.replace(/'/g, "''")}'`;
        }
        if (col.unique) def += ' UNIQUE';
        if (col.comment) def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`;
        if (col.primaryKey) primaryKeys.push(`\`${col.name}\``);

        columnDefs.push(def);
      }

      if (primaryKeys.length > 0) {
        columnDefs.push(`PRIMARY KEY (${primaryKeys.join(', ')})`);
      }

      const tableComment = comment ? ` COMMENT='${comment.replace(/'/g, "''")}'` : '';
      const createSQL = `CREATE TABLE \`${tableName}\` (\n  ${columnDefs.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${tableComment}`;

      await db.execute(sql.raw(createSQL));
      log.debug(`[Workbench] Created table: ${tableName}`);
      return { success: true };
    } catch (error: any) {
      log.warn('[Workbench] Failed to create table:', error);
      return { success: false, error: error.message };
    }
  },

  async dropTable(tableName: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    // 保护系统核心表
    const protectedTables = ['users', 'models', 'outbox_events', 'outbox_routing_config', 'saga_instances'];
    if (protectedTables.includes(tableName)) {
      return { success: false, error: `表 "${tableName}" 是系统核心表，禁止删除` };
    }

    try {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${tableName.replace(/`/g, '')}\``));
      log.debug(`[Workbench] Dropped table: ${tableName}`);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async addColumn(tableName: string, column: CreateColumnDef): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      let typeDef = column.type;
      if (column.length && !column.type.includes('(')) {
        typeDef = `${column.type}(${column.length})`;
      }

      let def = typeDef;
      if (column.nullable === false) def += ' NOT NULL';
      else def += ' NULL';
      if (column.defaultValue) {
        const dv = column.defaultValue.toUpperCase();
        if (dv === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
        else def += ` DEFAULT '${column.defaultValue.replace(/'/g, "''")}'`;
      }
      if (column.comment) def += ` COMMENT '${column.comment.replace(/'/g, "''")}'`;

      const alterSQL = `ALTER TABLE \`${tableName.replace(/`/g, '')}\` ADD COLUMN \`${column.name.replace(/`/g, '')}\` ${def}`;
      await db.execute(sql.raw(alterSQL));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async modifyColumn(tableName: string, columnName: string, column: CreateColumnDef): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      let typeDef = column.type;
      if (column.length && !column.type.includes('(')) {
        typeDef = `${column.type}(${column.length})`;
      }

      let def = typeDef;
      if (column.nullable === false) def += ' NOT NULL';
      else def += ' NULL';
      if (column.defaultValue !== undefined && column.defaultValue !== '') {
        const dv = column.defaultValue.toUpperCase();
        if (dv === 'NULL') def += ' DEFAULT NULL';
        else if (dv === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
        else def += ` DEFAULT '${column.defaultValue.replace(/'/g, "''")}'`;
      }
      if (column.comment) def += ` COMMENT '${column.comment.replace(/'/g, "''")}'`;

      const safeTable = tableName.replace(/`/g, '');
      const safeOldCol = columnName.replace(/`/g, '');
      const safeNewCol = column.name.replace(/`/g, '');

      let alterSQL: string;
      if (safeOldCol !== safeNewCol) {
        alterSQL = `ALTER TABLE \`${safeTable}\` CHANGE COLUMN \`${safeOldCol}\` \`${safeNewCol}\` ${def}`;
      } else {
        alterSQL = `ALTER TABLE \`${safeTable}\` MODIFY COLUMN \`${safeOldCol}\` ${def}`;
      }

      await db.execute(sql.raw(alterSQL));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async dropColumn(tableName: string, columnName: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const alterSQL = `ALTER TABLE \`${tableName.replace(/`/g, '')}\` DROP COLUMN \`${columnName.replace(/`/g, '')}\``;
      await db.execute(sql.raw(alterSQL));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async truncateTable(tableName: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      await db.execute(sql.raw(`TRUNCATE TABLE \`${tableName.replace(/`/g, '')}\``));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async addIndex(tableName: string, indexName: string, columns: string[], unique: boolean): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const safeTable = tableName.replace(/`/g, '');
      const safeIndex = indexName.replace(/`/g, '');
      const safeCols = columns.map(c => `\`${c.replace(/`/g, '')}\``).join(', ');
      const uniqueStr = unique ? 'UNIQUE ' : '';
      const addSQL = `ALTER TABLE \`${safeTable}\` ADD ${uniqueStr}INDEX \`${safeIndex}\` (${safeCols})`;
      await db.execute(sql.raw(addSQL));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async dropIndex(tableName: string, indexName: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const dropSQL = `ALTER TABLE \`${tableName.replace(/`/g, '')}\` DROP INDEX \`${indexName.replace(/`/g, '')}\``;
      await db.execute(sql.raw(dropSQL));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async renameTable(oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
      return { success: false, error: '新表名只能包含字母、数字和下划线' };
    }

    try {
      await db.execute(sql.raw(`RENAME TABLE \`${oldName.replace(/`/g, '')}\` TO \`${newName.replace(/`/g, '')}\``));
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async getTableStats(tableName: string): Promise<{
    rows: number;
    dataSize: string;
    indexSize: string;
    autoIncrement: number | null;
    avgRowLength: number;
    createTime: string;
    updateTime: string | null;
  }> {
    const db = await getDb();
    if (!db) return { rows: 0, dataSize: '0 B', indexSize: '0 B', autoIncrement: null, avgRowLength: 0, createTime: '', updateTime: null };

    try {
      const safeTable = tableName.replace(/'/g, "''");
      const rows = await execQuery(db, `
        SELECT 
          TABLE_ROWS as \`rows\`,
          DATA_LENGTH as dataLength,
          INDEX_LENGTH as indexLength,
          AUTO_INCREMENT as autoIncrement,
          AVG_ROW_LENGTH as avgRowLength,
          CREATE_TIME as createTime,
          UPDATE_TIME as updateTime
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTable}'
      `);

      const row = rows[0];
      if (!row) return { rows: 0, dataSize: '0 B', indexSize: '0 B', autoIncrement: null, avgRowLength: 0, createTime: '', updateTime: null };

      return {
        rows: Number(row.rows || 0),
        dataSize: formatBytes(Number(row.dataLength || 0)),
        indexSize: formatBytes(Number(row.indexLength || 0)),
        autoIncrement: row.autoIncrement ? Number(row.autoIncrement) : null,
        avgRowLength: Number(row.avgRowLength || 0),
        createTime: row.createTime ? String(row.createTime) : '',
        updateTime: row.updateTime ? String(row.updateTime) : null,
      };
    } catch (error) {
      return { rows: 0, dataSize: '0 B', indexSize: '0 B', autoIncrement: null, avgRowLength: 0, createTime: '', updateTime: null };
    }
  },
};

// ============ 数据操作 ============

export const dataService = {
  async queryRows(
    tableName: string,
    options: {
      page?: number;
      pageSize?: number;
      orderBy?: string;
      orderDir?: 'ASC' | 'DESC';
      filters?: Array<{ column: string; operator: string; value: string }>;
    } = {}
  ): Promise<{ rows: Record<string, unknown>[]; total: number; columns: string[] }> {
    const db = await getDb();
    if (!db) return { rows: [], total: 0, columns: [] };

    try {
      const safeTable = tableName.replace(/`/g, '');
      const page = options.page || 1;
      const pageSize = Math.min(options.pageSize || 50, 500);
      const offset = (page - 1) * pageSize;

      // 构建 WHERE 子句
      let whereClause = '';
      if (options.filters && options.filters.length > 0) {
        const conditions = options.filters.map(f => {
          const col = `\`${f.column.replace(/`/g, '')}\``;
          const val = f.value.replace(/'/g, "''");
          switch (f.operator) {
            case 'eq': return `${col} = '${val}'`;
            case 'neq': return `${col} != '${val}'`;
            case 'gt': return `${col} > '${val}'`;
            case 'lt': return `${col} < '${val}'`;
            case 'gte': return `${col} >= '${val}'`;
            case 'lte': return `${col} <= '${val}'`;
            case 'like': return `${col} LIKE '%${val}%'`;
            case 'is_null': return `${col} IS NULL`;
            case 'not_null': return `${col} IS NOT NULL`;
            default: return `${col} = '${val}'`;
          }
        });
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      // 排序
      const orderClause = options.orderBy
        ? `ORDER BY \`${options.orderBy.replace(/`/g, '')}\` ${options.orderDir || 'ASC'}`
        : '';

      // 查询总数
      const countRows = await execQuery(db, `SELECT COUNT(*) as total FROM \`${safeTable}\` ${whereClause}`);
      const total = Number(countRows[0]?.total || 0);

      // 查询数据
      const dataRows = await execQuery(db, `SELECT * FROM \`${safeTable}\` ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset}`);

      // 获取列名
      const safeTableForCols = tableName.replace(/'/g, "''");
      const colRows = await execQuery(db, `
        SELECT COLUMN_NAME as name FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${safeTableForCols}'
        ORDER BY ORDINAL_POSITION
      `);
      const columns = colRows.map((r: any) => String(r.name));

      return { rows: dataRows, total, columns };
    } catch (error) {
      log.warn('[Workbench] Failed to query rows:', error);
      return { rows: [], total: 0, columns: [] };
    }
  },

  async insertRow(tableName: string, data: Record<string, unknown>): Promise<{ success: boolean; insertId?: number; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const safeTable = tableName.replace(/`/g, '');
      const cols = Object.keys(data).map(k => `\`${k.replace(/`/g, '')}\``).join(', ');
      const vals = Object.values(data).map(v => {
        if (v === null || v === undefined || v === '') return 'NULL';
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(', ');

      const insertSQL = `INSERT INTO \`${safeTable}\` (${cols}) VALUES (${vals})`;
      const result = await db.execute(sql.raw(insertSQL));
      const insertId = (result[0] as any)?.insertId;
      return { success: true, insertId: insertId ? Number(insertId) : undefined };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async updateRow(
    tableName: string,
    primaryKey: { column: string; value: unknown },
    data: Record<string, unknown>
  ): Promise<{ success: boolean; affectedRows?: number; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const safeTable = tableName.replace(/`/g, '');
      const setClauses = Object.entries(data).map(([k, v]) => {
        const col = `\`${k.replace(/`/g, '')}\``;
        if (v === null || v === undefined) return `${col} = NULL`;
        return `${col} = '${String(v).replace(/'/g, "''")}'`;
      }).join(', ');

      const pkCol = `\`${primaryKey.column.replace(/`/g, '')}\``;
      const pkVal = primaryKey.value === null ? 'IS NULL' : `= '${String(primaryKey.value).replace(/'/g, "''")}'`;

      const updateSQL = `UPDATE \`${safeTable}\` SET ${setClauses} WHERE ${pkCol} ${pkVal} LIMIT 1`;
      const result = await db.execute(sql.raw(updateSQL));
      return { success: true, affectedRows: Number((result[0] as any)?.affectedRows || 0) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async deleteRow(
    tableName: string,
    primaryKey: { column: string; value: unknown }
  ): Promise<{ success: boolean; affectedRows?: number; error?: string }> {
    const db = await getDb();
    if (!db) return { success: false, error: '数据库未连接' };

    try {
      const safeTable = tableName.replace(/`/g, '');
      const pkCol = `\`${primaryKey.column.replace(/`/g, '')}\``;
      const pkVal = primaryKey.value === null ? 'IS NULL' : `= '${String(primaryKey.value).replace(/'/g, "''")}'`;

      const deleteSQL = `DELETE FROM \`${safeTable}\` WHERE ${pkCol} ${pkVal} LIMIT 1`;
      const result = await db.execute(sql.raw(deleteSQL));
      return { success: true, affectedRows: Number((result[0] as any)?.affectedRows || 0) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  async exportData(tableName: string, format: 'csv' | 'json' | 'sql', limit?: number): Promise<string> {
    const db = await getDb();
    if (!db) return '';

    try {
      const safeTable = tableName.replace(/`/g, '');
      const limitClause = limit ? `LIMIT ${limit}` : 'LIMIT 10000';
      const rows = await execQuery(db, `SELECT * FROM \`${safeTable}\` ${limitClause}`);

      if (format === 'json') {
        return JSON.stringify(rows, null, 2);
      }

      if (format === 'csv') {
        if (rows.length === 0) return '';
        const headers = Object.keys(rows[0]);
        const csvRows = [headers.join(',')];
        for (const row of rows) {
          csvRows.push(headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(','));
        }
        return csvRows.join('\n');
      }

      if (format === 'sql') {
        if (rows.length === 0) return `-- No data in ${safeTable}`;
        const headers = Object.keys(rows[0]);
        const insertStatements: string[] = [];
        for (const row of rows) {
          const vals = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return 'NULL';
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');
          insertStatements.push(`INSERT INTO \`${safeTable}\` (${headers.map(h => `\`${h}\``).join(', ')}) VALUES (${vals});`);
        }
        return insertStatements.join('\n');
      }

      return '';
    } catch (error) {
      log.warn('[Workbench] Failed to export data:', error);
      return '';
    }
  },
};

// ============ SQL 工作台 ============

export const sqlService = {
  async execute(query: string): Promise<SqlResult> {
    const db = await getDb();
    if (!db) return { type: 'error', executionTime: 0, error: '数据库未连接' };

    const start = Date.now();

    try {
      // P0 加固：统一危险 SQL 黑名单检查
      validateWorkbenchQuery(query);
      const upperQuery = query.trim().toUpperCase();

      const result = await db.execute(sql.raw(query));
      const executionTime = Date.now() - start;

      // 判断是 SELECT 还是 DML
      if (upperQuery.startsWith('SELECT') || upperQuery.startsWith('SHOW') || 
          upperQuery.startsWith('DESCRIBE') || upperQuery.startsWith('EXPLAIN') ||
          upperQuery.startsWith('DESC ')) {
        const rows = Array.isArray(result[0]) ? result[0] : [];
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        // 记录历史
        addToHistory({ query, type: 'select', executionTime, rowCount: rows.length });

        return { type: 'select', columns, rows: rows as Record<string, unknown>[], executionTime };
      } else {
        const affectedRows = Number((result[0] as any)?.affectedRows ?? 0);

        // 记录历史
        addToHistory({ query, type: 'mutation', executionTime, rowCount: affectedRows });

        return { type: 'mutation', affectedRows, executionTime };
      }
    } catch (error: any) {
      const executionTime = Date.now() - start;
      addToHistory({ query, type: 'error', executionTime, rowCount: 0, error: error.message });
      return { type: 'error', executionTime, error: error.message };
    }
  },

  getHistory(limit: number = 50): SqlHistoryEntry[] {
    return sqlHistory.slice(0, limit);
  },

  clearHistory(): void {
    sqlHistory.length = 0;
  },
};

// ============ 模块关联服务 ============

export const moduleService = {
  async getModuleStats(): Promise<Array<{ module: string; tables: number; totalRows: number; dataSize: number }>> {
    const db = await getDb();
    if (!db) return [];

    try {
      const tables = await tableService.listTables();
      const moduleMap = new Map<string, { tables: number; totalRows: number; dataSize: number }>();

      for (const table of tables) {
        const mod = table.linkedModule || '用户自定义';
        if (!moduleMap.has(mod)) {
          moduleMap.set(mod, { tables: 0, totalRows: 0, dataSize: 0 });
        }
        const stats = moduleMap.get(mod)!;
        stats.tables++;
        stats.totalRows += table.rows;
        stats.dataSize += table.dataLength + table.indexLength;
      }

      return Array.from(moduleMap.entries())
        .map(([module, stats]) => ({ module, ...stats }))
        .sort((a, b) => b.tables - a.tables);
    } catch (error) {
      log.warn('[Workbench] Failed to get module stats:', error);
      return [];
    }
  },

  getApiEndpoints(tableName: string): {
    rest: Array<{ method: string; path: string; description: string; example?: string }>;
    trpc: Array<{ method: string; path: string; description: string }>;
    openapi: string;
    codeExamples: { typescript: string; python: string; curl: string };
  } {
    const rest = [
      { method: 'GET', path: `/api/rest/${tableName}`, description: `分页查询 ${tableName} 数据`, example: `?page=1&pageSize=20&orderBy=id&orderDir=DESC` },
      { method: 'GET', path: `/api/rest/${tableName}/:id`, description: `获取 ${tableName} 单条记录` },
      { method: 'POST', path: `/api/rest/${tableName}`, description: `向 ${tableName} 插入记录` },
      { method: 'PUT', path: `/api/rest/${tableName}/:id`, description: `更新 ${tableName} 记录` },
      { method: 'DELETE', path: `/api/rest/${tableName}/:id`, description: `删除 ${tableName} 记录` },
      { method: 'GET', path: `/api/rest/${tableName}/schema`, description: `获取 ${tableName} 表结构、索引、外键` },
      { method: 'GET', path: `/api/rest/${tableName}/export`, description: `导出 ${tableName} 数据`, example: `?format=csv&limit=1000` },
    ];

    const base = `/api/trpc/database.workbench`;
    const trpc = [
      { method: 'GET', path: `${base}.data.queryRows?input={"json":{"tableName":"${tableName}"}}`, description: `查询 ${tableName} 数据（tRPC）` },
      { method: 'POST', path: `${base}.data.insertRow`, description: `插入 ${tableName} 记录（tRPC）` },
      { method: 'POST', path: `${base}.data.updateRow`, description: `更新 ${tableName} 记录（tRPC）` },
      { method: 'POST', path: `${base}.data.deleteRow`, description: `删除 ${tableName} 记录（tRPC）` },
    ];

    const codeExamples = {
      typescript: `// TypeScript / fetch
const res = await fetch('/api/rest/${tableName}?page=1&pageSize=20');
const data = await res.json();
log.debug(data.rows);

// 插入记录
const created = await fetch('/api/rest/${tableName}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* 字段数据 */ }),
});

// 更新记录
await fetch('/api/rest/${tableName}/1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* 更新字段 */ }),
});`,
      python: `import requests

# 查询数据
res = requests.get('${config.app.baseUrl}/api/rest/${tableName}', params={'page': 1, 'pageSize': 20})
data = res.json()
print(data['rows'])

# 插入记录
res = requests.post('${config.app.baseUrl}/api/rest/${tableName}', json={...})

# 更新记录
res = requests.put('${config.app.baseUrl}/api/rest/${tableName}/1', json={...})

# 删除记录
res = requests.delete('${config.app.baseUrl}/api/rest/${tableName}/1')`,
      curl: `# 查询数据
curl -s '${config.app.baseUrl}/api/rest/${tableName}?page=1&pageSize=20' | jq

# 获取单条记录
curl -s '${config.app.baseUrl}/api/rest/${tableName}/1' | jq

# 插入记录
curl -X POST '${config.app.baseUrl}/api/rest/${tableName}' \\
  -H 'Content-Type: application/json' \\
  -d '{"key": "value"}'

# 导出 CSV
curl -s '${config.app.baseUrl}/api/rest/${tableName}/export?format=csv' -o ${tableName}.csv`,
    };

    return {
      rest,
      trpc,
      openapi: '/api/rest/_openapi',
      codeExamples,
    };
  },
};
