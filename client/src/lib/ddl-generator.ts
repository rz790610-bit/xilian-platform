/**
 * DDL Generator — 从 Schema Registry 生成 MySQL DDL 语句
 * V4.1: 支持单表/批量/按域导出，包含外键约束和索引
 */
import type { TableRegistryEntry, FieldDefinition, Relation } from "@/data/types";

/** 生成单表 CREATE TABLE DDL */
export function generateTableDDL(
  table: TableRegistryEntry,
  options?: { includeDropIfExists?: boolean; includeComment?: boolean }
): string {
  const { includeDropIfExists = false, includeComment = true } = options ?? {};
  const lines: string[] = [];

  if (includeDropIfExists) {
    lines.push(`DROP TABLE IF EXISTS \`${table.tableName}\`;`);
    lines.push("");
  }

  const colDefs = table.fields.map(f => formatColumnDef(f));
  const pks = table.fields.filter(f => f.primaryKey).map(f => `\`${f.name}\``);
  if (pks.length > 0) {
    colDefs.push(`  PRIMARY KEY (${pks.join(", ")})`);
  }

  // 唯一索引
  const uniques = table.fields.filter(f => f.unique && !f.primaryKey);
  for (const u of uniques) {
    colDefs.push(`  UNIQUE KEY \`uk_${table.tableName}_${u.name}\` (\`${u.name}\`)`);
  }

  lines.push(`CREATE TABLE \`${table.tableName}\` (`);
  lines.push(colDefs.join(",\n"));
  
  let tableOptions = `) ENGINE=${table.engine} DEFAULT CHARSET=${table.charset} COLLATE=${table.collate}`;
  if (includeComment && table.tableComment) {
    tableOptions += ` COMMENT='${table.tableComment.replace(/'/g, "\\'")}'`;
  }
  tableOptions += ";";
  lines.push(tableOptions);

  return lines.join("\n");
}

/** 格式化单个字段定义 */
function formatColumnDef(f: FieldDefinition): string {
  let line = `  \`${f.name}\` ${f.type}`;
  if (f.length) line += `(${f.length})`;
  if (!f.nullable) line += " NOT NULL";
  if (f.autoIncrement) line += " AUTO_INCREMENT";
  if (f.defaultVal) {
    const dv = f.defaultVal;
    if (
      dv === "CURRENT_TIMESTAMP" ||
      dv.startsWith("CURRENT_TIMESTAMP(") ||
      dv === "NULL" ||
      dv.startsWith("'")
    ) {
      line += ` DEFAULT ${dv}`;
    } else {
      line += ` DEFAULT '${dv}'`;
    }
  }
  if (f.comment) {
    line += ` COMMENT '${f.comment.replace(/'/g, "\\'")}'`;
  }
  return line;
}

/** 生成外键约束 ALTER TABLE 语句 */
export function generateForeignKeys(relations: Relation[]): string {
  if (relations.length === 0) return "";
  const lines = relations.map(r => {
    const fkName = `fk_${r.from}_${r.fromCol}`;
    return `ALTER TABLE \`${r.from}\` ADD CONSTRAINT \`${fkName}\` FOREIGN KEY (\`${r.fromCol}\`) REFERENCES \`${r.to}\` (\`${r.toCol}\`);`;
  });
  return lines.join("\n");
}

/** 生成完整 DDL 脚本（所有表 + 外键） */
export function generateFullDDL(
  tables: TableRegistryEntry[],
  relations: Relation[],
  options?: {
    includeDropIfExists?: boolean;
    includeComment?: boolean;
    includeForeignKeys?: boolean;
    groupByDomain?: boolean;
    domainLabels?: Record<string, string>;
  }
): string {
  const {
    includeDropIfExists = true,
    includeComment = true,
    includeForeignKeys = true,
    groupByDomain = true,
    domainLabels = {},
  } = options ?? {};

  const parts: string[] = [];

  // Header
  parts.push("-- ============================================================");
  parts.push("-- IoT 平台数据库 DDL 脚本");
  parts.push(`-- 生成时间: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  parts.push(`-- 表数量: ${tables.length}`);
  parts.push(`-- 字段总数: ${tables.reduce((s, t) => s + t.fields.length, 0)}`);
  parts.push("-- ============================================================");
  parts.push("");
  parts.push("SET NAMES utf8mb4;");
  parts.push("SET FOREIGN_KEY_CHECKS = 0;");
  parts.push("");

  if (groupByDomain) {
    // 按域分组
    const domainGroups: Record<string, TableRegistryEntry[]> = {};
    for (const t of tables) {
      if (!domainGroups[t.domain]) domainGroups[t.domain] = [];
      domainGroups[t.domain].push(t);
    }

    for (const [domain, domainTables] of Object.entries(domainGroups)) {
      const label = domainLabels[domain] || domain;
      parts.push(`-- ------------------------------------------------------------`);
      parts.push(`-- 域: ${label} (${domainTables.length} 张表)`);
      parts.push(`-- ------------------------------------------------------------`);
      parts.push("");

      for (const table of domainTables) {
        parts.push(generateTableDDL(table, { includeDropIfExists, includeComment }));
        parts.push("");
      }
    }
  } else {
    for (const table of tables) {
      parts.push(generateTableDDL(table, { includeDropIfExists, includeComment }));
      parts.push("");
    }
  }

  // 外键约束
  if (includeForeignKeys && relations.length > 0) {
    parts.push("-- ------------------------------------------------------------");
    parts.push(`-- 外键约束 (${relations.length} 条)`);
    parts.push("-- ------------------------------------------------------------");
    parts.push("");
    parts.push(generateForeignKeys(relations));
    parts.push("");
  }

  parts.push("SET FOREIGN_KEY_CHECKS = 1;");
  parts.push("");

  return parts.join("\n");
}

/** 生成按域筛选的 DDL */
export function generateDomainDDL(
  tables: TableRegistryEntry[],
  relations: Relation[],
  domainId: string,
  domainLabel: string,
  options?: { includeDropIfExists?: boolean }
): string {
  const domainTables = tables.filter(t => t.domain === domainId);
  const domainTableNames = new Set(domainTables.map(t => t.tableName));
  const domainRelations = relations.filter(
    r => domainTableNames.has(r.from) || domainTableNames.has(r.to)
  );

  const parts: string[] = [];
  parts.push(`-- 域: ${domainLabel} (${domainTables.length} 张表)`);
  parts.push(`-- 生成时间: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`);
  parts.push("");
  parts.push("SET NAMES utf8mb4;");
  parts.push("SET FOREIGN_KEY_CHECKS = 0;");
  parts.push("");

  for (const table of domainTables) {
    parts.push(generateTableDDL(table, { includeDropIfExists: options?.includeDropIfExists ?? true, includeComment: true }));
    parts.push("");
  }

  if (domainRelations.length > 0) {
    parts.push(`-- 外键约束`);
    parts.push(generateForeignKeys(domainRelations));
    parts.push("");
  }

  parts.push("SET FOREIGN_KEY_CHECKS = 1;");
  return parts.join("\n");
}
