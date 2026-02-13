/**
 * 数据库工作台 tRPC 路由
 * 
 * 提供平台级数据库管理 API：
 * - connection.*  连接管理（状态、测试、进程列表、变量）
 * - table.*       表结构管理（列表、列、索引、外键、创建、修改、删除）
 * - data.*        数据操作（查询、插入、更新、删除、导出）
 * - sql.*         SQL 工作台（执行、历史）
 * - module.*      模块关联（统计、API端点）
 */

import { z } from "zod";
import { router, publicProcedure } from "../core/trpc";
import { connectionService, tableService, dataService, sqlService, moduleService } from "../services/database/workbench.service";
import { checkAllStorageEngines } from "../services/database/storageHealth.service";

// ============ 连接管理路由 ============
const connectionRouter = router({
  getStatus: publicProcedure.query(async () => {
    return connectionService.getStatus();
  }),

  testConnection: publicProcedure.mutation(async () => {
    return connectionService.testConnection();
  }),

  getProcessList: publicProcedure.query(async () => {
    return connectionService.getProcessList();
  }),

  getVariables: publicProcedure
    .input(z.object({ filter: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return connectionService.getVariables(input?.filter);
    }),
});

// ============ 表结构管理路由 ============
const tableRouter = router({
  list: publicProcedure.query(async () => {
    return tableService.listTables();
  }),

  getColumns: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return tableService.getTableColumns(input.tableName);
    }),

  getIndexes: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return tableService.getTableIndexes(input.tableName);
    }),

  getForeignKeys: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return tableService.getTableForeignKeys(input.tableName);
    }),

  getCreateSQL: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return tableService.getCreateTableSQL(input.tableName);
    }),

  getStats: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return tableService.getTableStats(input.tableName);
    }),

  create: publicProcedure
    .input(z.object({
      tableName: z.string().min(1).max(64),
      columns: z.array(z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        length: z.number().optional(),
        nullable: z.boolean().optional(),
        defaultValue: z.string().optional(),
        autoIncrement: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        comment: z.string().optional(),
      })).min(1),
      comment: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return tableService.createTable(input.tableName, input.columns, input.comment);
    }),

  drop: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .mutation(async ({ input }) => {
      return tableService.dropTable(input.tableName);
    }),

  addColumn: publicProcedure
    .input(z.object({
      tableName: z.string(),
      column: z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        length: z.number().optional(),
        nullable: z.boolean().optional(),
        defaultValue: z.string().optional(),
        autoIncrement: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        comment: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      return tableService.addColumn(input.tableName, input.column);
    }),

  modifyColumn: publicProcedure
    .input(z.object({
      tableName: z.string(),
      columnName: z.string(),
      column: z.object({
        name: z.string().min(1),
        type: z.string().min(1),
        length: z.number().optional(),
        nullable: z.boolean().optional(),
        defaultValue: z.string().optional(),
        autoIncrement: z.boolean().optional(),
        primaryKey: z.boolean().optional(),
        unique: z.boolean().optional(),
        comment: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      return tableService.modifyColumn(input.tableName, input.columnName, input.column);
    }),

  dropColumn: publicProcedure
    .input(z.object({ tableName: z.string(), columnName: z.string() }))
    .mutation(async ({ input }) => {
      return tableService.dropColumn(input.tableName, input.columnName);
    }),

  truncate: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .mutation(async ({ input }) => {
      return tableService.truncateTable(input.tableName);
    }),

  addIndex: publicProcedure
    .input(z.object({
      tableName: z.string(),
      indexName: z.string().min(1),
      columns: z.array(z.string()).min(1),
      unique: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      return tableService.addIndex(input.tableName, input.indexName, input.columns, input.unique || false);
    }),

  dropIndex: publicProcedure
    .input(z.object({ tableName: z.string(), indexName: z.string() }))
    .mutation(async ({ input }) => {
      return tableService.dropIndex(input.tableName, input.indexName);
    }),

  rename: publicProcedure
    .input(z.object({ oldName: z.string(), newName: z.string() }))
    .mutation(async ({ input }) => {
      return tableService.renameTable(input.oldName, input.newName);
    }),
});

// ============ 数据操作路由 ============
const dataRouter = router({
  queryRows: publicProcedure
    .input(z.object({
      tableName: z.string(),
      page: z.number().min(1).optional(),
      pageSize: z.number().min(1).max(500).optional(),
      orderBy: z.string().optional(),
      orderDir: z.enum(['ASC', 'DESC']).optional(),
      filters: z.array(z.object({
        column: z.string(),
        operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'is_null', 'not_null']),
        value: z.string(),
      })).optional(),
    }))
    .query(async ({ input }) => {
      return dataService.queryRows(input.tableName, {
        page: input.page,
        pageSize: input.pageSize,
        orderBy: input.orderBy,
        orderDir: input.orderDir,
        filters: input.filters,
      });
    }),

  insertRow: publicProcedure
    .input(z.object({
      tableName: z.string(),
      data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      return dataService.insertRow(input.tableName, input.data as Record<string, unknown>);
    }),

  updateRow: publicProcedure
    .input(z.object({
      tableName: z.string(),
      primaryKey: z.object({
        column: z.string(),
        value: z.unknown(),
      }),
      data: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      return dataService.updateRow(input.tableName, input.primaryKey, input.data as Record<string, unknown>);
    }),

  deleteRow: publicProcedure
    .input(z.object({
      tableName: z.string(),
      primaryKey: z.object({
        column: z.string(),
        value: z.unknown(),
      }),
    }))
    .mutation(async ({ input }) => {
      return dataService.deleteRow(input.tableName, input.primaryKey);
    }),

  exportData: publicProcedure
    .input(z.object({
      tableName: z.string(),
      format: z.enum(['csv', 'json', 'sql']),
      limit: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return dataService.exportData(input.tableName, input.format, input.limit);
    }),
});

// ============ SQL 工作台路由 ============
const sqlRouter = router({
  execute: publicProcedure
    .input(z.object({ query: z.string().min(1).max(10000) }))
    .mutation(async ({ input }) => {
      return sqlService.execute(input.query);
    }),

  getHistory: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
    .query(async ({ input }) => {
      return sqlService.getHistory(input?.limit || 50);
    }),

  clearHistory: publicProcedure.mutation(async () => {
    sqlService.clearHistory();
    return { success: true };
  }),
});

// ============ 模块关联路由 ============
const moduleRouter = router({
  getStats: publicProcedure.query(async () => {
    return moduleService.getModuleStats();
  }),

  getApiEndpoints: publicProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      return moduleService.getApiEndpoints(input.tableName);
    }),
});

// ============ 存储引擎健康检查路由 ============
const storageRouter = router({
  healthCheck: publicProcedure.query(async () => {
    return checkAllStorageEngines();
  }),
});

// ============ 导出工作台路由 ============
export const workbenchRouter = router({
  connection: connectionRouter,
  table: tableRouter,
  data: dataRouter,
  sql: sqlRouter,
  module: moduleRouter,
  storage: storageRouter,
});
