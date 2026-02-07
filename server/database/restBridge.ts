/**
 * REST API 桥接层
 * 
 * 为数据库工作台中的每张表自动生成标准 RESTful API 端点：
 *   GET    /api/rest/:table          → 查询数据（支持分页、排序、过滤）
 *   GET    /api/rest/:table/:id      → 获取单条记录
 *   POST   /api/rest/:table          → 插入记录
 *   PUT    /api/rest/:table/:id      → 更新记录
 *   DELETE /api/rest/:table/:id      → 删除记录
 *   GET    /api/rest/:table/schema   → 获取表结构
 *   GET    /api/rest/:table/export   → 导出数据
 * 
 * 同时提供：
 *   GET    /api/rest/_openapi        → OpenAPI 3.0 文档
 *   GET    /api/rest/_tables         → 可用表列表
 *   GET    /api/rest/_health         → 健康检查
 */

import { Router, Request, Response, NextFunction } from "express";
import { tableService, dataService, connectionService, moduleService } from "./workbenchService";

const restRouter = Router();

// ============ 中间件 ============

/** 表名白名单校验 — 防止 SQL 注入 */
async function validateTableName(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tableName = req.params.table;
  if (!tableName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    res.status(400).json({ error: 'Invalid table name', code: 'INVALID_TABLE_NAME' });
    return;
  }

  try {
    const tables = await tableService.listTables();
    const exists = tables.some(t => t.name === tableName);
    if (!exists) {
      res.status(404).json({ error: `Table '${tableName}' not found`, code: 'TABLE_NOT_FOUND' });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Failed to validate table', code: 'INTERNAL_ERROR' });
  }
}

/** 统一错误处理 */
function handleError(res: Response, error: unknown, operation: string): void {
  console.error(`[REST Bridge] ${operation} failed:`, error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({ error: message, code: 'INTERNAL_ERROR', operation });
}

/** 解析分页参数 */
function parsePagination(query: any): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(query.page || query._page || '1', 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(query.pageSize || query._limit || query.limit || '20', 10)));
  return { page, pageSize };
}

/** 解析排序参数 */
function parseSort(query: any): { orderBy?: string; orderDir?: 'ASC' | 'DESC' } {
  const orderBy = query.orderBy || query._sort || query.sort;
  const orderDir = (query.orderDir || query._order || query.order || 'ASC').toUpperCase();
  if (orderBy && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(orderBy)) {
    return { orderBy, orderDir: orderDir === 'DESC' ? 'DESC' : 'ASC' };
  }
  return {};
}

/** 解析过滤参数 */
function parseFilters(query: any): Array<{ column: string; operator: string; value: string }> {
  const filters: Array<{ column: string; operator: string; value: string }> = [];
  
  // 支持 filter[column][operator]=value 格式
  if (query.filter && typeof query.filter === 'object') {
    for (const [column, ops] of Object.entries(query.filter)) {
      if (typeof ops === 'object' && ops !== null) {
        for (const [op, val] of Object.entries(ops as Record<string, string>)) {
          filters.push({ column, operator: op, value: String(val) });
        }
      } else {
        filters.push({ column, operator: 'eq', value: String(ops) });
      }
    }
  }

  // 支持 where[column]=value 简化格式
  if (query.where && typeof query.where === 'object') {
    for (const [column, val] of Object.entries(query.where)) {
      filters.push({ column, operator: 'eq', value: String(val) });
    }
  }

  return filters;
}

// ============ 元数据端点 ============

/** GET /api/rest/_health — 健康检查 */
restRouter.get('/_health', async (_req: Request, res: Response) => {
  try {
    const status = await connectionService.getStatus();
    res.json({
      status: status.connected ? 'healthy' : 'unhealthy',
      database: status.database,
      version: status.version,
      tables: status.totalTables,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    handleError(res, err, 'health_check');
  }
});

/** GET /api/rest/_tables — 可用表列表 */
restRouter.get('/_tables', async (_req: Request, res: Response) => {
  try {
    const tables = await tableService.listTables();
    res.json({
      count: tables.length,
      tables: tables.map(t => ({
        name: t.name,
        rows: t.rows,
        module: t.linkedModule,
        engine: t.engine,
        comment: t.comment,
        endpoints: {
          list: `/api/rest/${t.name}`,
          schema: `/api/rest/${t.name}/schema`,
          export: `/api/rest/${t.name}/export`,
        },
      })),
    });
  } catch (err) {
    handleError(res, err, 'list_tables');
  }
});

/** GET /api/rest/_openapi — OpenAPI 3.0 文档 */
restRouter.get('/_openapi', async (_req: Request, res: Response) => {
  try {
    const tables = await tableService.listTables();
    const paths: Record<string, any> = {};
    const schemas: Record<string, any> = {};

    for (const table of tables) {
      const columns = await tableService.getTableColumns(table.name);
      
      // 生成 Schema
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      for (const col of columns) {
        properties[col.name] = columnToOpenApiType(col);
        if (!col.nullable && col.key !== 'PRI') {
          required.push(col.name);
        }
      }

      const schemaName = toPascalCase(table.name);
      schemas[schemaName] = {
        type: 'object',
        description: table.comment || `${table.name} 表数据模型`,
        properties,
        ...(required.length > 0 ? { required } : {}),
      };

      // 生成 Input Schema（排除自增主键和自动时间戳）
      const inputProperties: Record<string, any> = {};
      const inputRequired: string[] = [];
      for (const col of columns) {
        if (col.extra.includes('auto_increment')) continue;
        if (col.extra.includes('DEFAULT_GENERATED')) continue;
        inputProperties[col.name] = columnToOpenApiType(col);
        if (!col.nullable && !col.defaultValue) {
          inputRequired.push(col.name);
        }
      }
      schemas[`${schemaName}Input`] = {
        type: 'object',
        description: `${table.name} 创建/更新输入`,
        properties: inputProperties,
        ...(inputRequired.length > 0 ? { required: inputRequired } : {}),
      };

      // 生成路径
      const tag = table.linkedModule || '用户自定义';
      
      paths[`/api/rest/${table.name}`] = {
        get: {
          tags: [tag],
          summary: `查询 ${table.name} 数据`,
          description: `分页查询 ${table.name} 表数据，支持排序和过滤。${table.comment ? ` 表说明：${table.comment}` : ''}`,
          operationId: `list_${table.name}`,
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 500 }, description: '每页条数' },
            { name: 'orderBy', in: 'query', schema: { type: 'string' }, description: '排序字段' },
            { name: 'orderDir', in: 'query', schema: { type: 'string', enum: ['ASC', 'DESC'] }, description: '排序方向' },
          ],
          responses: {
            '200': {
              description: '查询成功',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      total: { type: 'integer' },
                      page: { type: 'integer' },
                      pageSize: { type: 'integer' },
                      rows: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: [tag],
          summary: `向 ${table.name} 插入记录`,
          operationId: `create_${table.name}`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${schemaName}Input` },
              },
            },
          },
          responses: {
            '201': { description: '创建成功' },
            '400': { description: '参数错误' },
          },
        },
      };

      // 单条记录路径
      const pkCol = columns.find(c => c.key === 'PRI');
      if (pkCol) {
        paths[`/api/rest/${table.name}/{id}`] = {
          get: {
            tags: [tag],
            summary: `获取 ${table.name} 单条记录`,
            operationId: `get_${table.name}`,
            parameters: [
              { name: 'id', in: 'path', required: true, schema: columnToOpenApiType(pkCol), description: '主键值' },
            ],
            responses: {
              '200': {
                description: '查询成功',
                content: {
                  'application/json': {
                    schema: { $ref: `#/components/schemas/${schemaName}` },
                  },
                },
              },
              '404': { description: '记录不存在' },
            },
          },
          put: {
            tags: [tag],
            summary: `更新 ${table.name} 记录`,
            operationId: `update_${table.name}`,
            parameters: [
              { name: 'id', in: 'path', required: true, schema: columnToOpenApiType(pkCol), description: '主键值' },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${schemaName}Input` },
                },
              },
            },
            responses: {
              '200': { description: '更新成功' },
              '404': { description: '记录不存在' },
            },
          },
          delete: {
            tags: [tag],
            summary: `删除 ${table.name} 记录`,
            operationId: `delete_${table.name}`,
            parameters: [
              { name: 'id', in: 'path', required: true, schema: columnToOpenApiType(pkCol), description: '主键值' },
            ],
            responses: {
              '200': { description: '删除成功' },
              '404': { description: '记录不存在' },
            },
          },
        };
      }
    }

    const openApiDoc = {
      openapi: '3.0.3',
      info: {
        title: 'PortAI Nexus 数据库 REST API',
        description: '由数据库工作台自动生成的 RESTful API。所有端点均基于实际数据库表结构动态生成，支持标准 CRUD 操作、分页查询、排序过滤和数据导出。',
        version: '1.0.0',
        contact: { name: 'PortAI Nexus Platform' },
      },
      servers: [
        { url: '/', description: '当前服务器' },
      ],
      tags: Array.from(new Set(tables.map(t => t.linkedModule || '用户自定义'))).map(name => ({
        name,
        description: `${name}模块相关表`,
      })),
      paths,
      components: { schemas },
    };

    res.json(openApiDoc);
  } catch (err) {
    handleError(res, err, 'openapi_doc');
  }
});

// ============ 数据端点 ============

/** GET /api/rest/:table/schema — 获取表结构 */
restRouter.get('/:table/schema', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const [columns, indexes, foreignKeys, stats] = await Promise.all([
      tableService.getTableColumns(tableName),
      tableService.getTableIndexes(tableName),
      tableService.getTableForeignKeys(tableName),
      tableService.getTableStats(tableName),
    ]);

    res.json({
      table: tableName,
      columns,
      indexes,
      foreignKeys,
      stats,
    });
  } catch (err) {
    handleError(res, err, 'get_schema');
  }
});

/** GET /api/rest/:table/export — 导出数据 */
restRouter.get('/:table/export', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const format = (req.query.format as string) || 'json';
    const limit = parseInt(req.query.limit as string || '1000', 10);

    if (!['csv', 'json', 'sql'].includes(format)) {
      res.status(400).json({ error: 'Invalid format. Supported: csv, json, sql', code: 'INVALID_FORMAT' });
      return;
    }

    const content = await dataService.exportData(tableName, format as 'csv' | 'json' | 'sql', limit);

    const contentTypes: Record<string, string> = {
      csv: 'text/csv',
      json: 'application/json',
      sql: 'text/plain',
    };

    res.setHeader('Content-Type', contentTypes[format]);
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.${format}"`);
    res.send(content);
  } catch (err) {
    handleError(res, err, 'export_data');
  }
});

/** GET /api/rest/:table — 查询数据（分页） */
restRouter.get('/:table', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const { page, pageSize } = parsePagination(req.query);
    const sort = parseSort(req.query);
    const filters = parseFilters(req.query);

    const result = await dataService.queryRows(tableName, {
      page,
      pageSize,
      ...sort,
      filters: filters.length > 0 ? filters as any : undefined,
    });

    res.json({
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
      rows: result.rows,
      columns: result.columns,
    });
  } catch (err) {
    handleError(res, err, 'query_rows');
  }
});

/** GET /api/rest/:table/:id — 获取单条记录 */
restRouter.get('/:table/:id', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const id = req.params.id;

    // 找到主键列
    const columns = await tableService.getTableColumns(tableName);
    const pkCol = columns.find(c => c.key === 'PRI');
    if (!pkCol) {
      res.status(400).json({ error: 'Table has no primary key', code: 'NO_PRIMARY_KEY' });
      return;
    }

    const result = await dataService.queryRows(tableName, {
      page: 1,
      pageSize: 1,
      filters: [{ column: pkCol.name, operator: 'eq', value: id }],
    });

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    handleError(res, err, 'get_record');
  }
});

/** POST /api/rest/:table — 插入记录 */
restRouter.post('/:table', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const data = req.body;

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty JSON object', code: 'INVALID_BODY' });
      return;
    }

    const result = await dataService.insertRow(tableName, data);
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 'insert_row');
  }
});

/** PUT /api/rest/:table/:id — 更新记录 */
restRouter.put('/:table/:id', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const id = req.params.id;
    const data = req.body;

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Request body must be a non-empty JSON object', code: 'INVALID_BODY' });
      return;
    }

    // 找到主键列
    const columns = await tableService.getTableColumns(tableName);
    const pkCol = columns.find(c => c.key === 'PRI');
    if (!pkCol) {
      res.status(400).json({ error: 'Table has no primary key', code: 'NO_PRIMARY_KEY' });
      return;
    }

    const result = await dataService.updateRow(tableName, { column: pkCol.name, value: id }, data);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'update_row');
  }
});

/** DELETE /api/rest/:table/:id — 删除记录 */
restRouter.delete('/:table/:id', validateTableName, async (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const id = req.params.id;

    // 找到主键列
    const columns = await tableService.getTableColumns(tableName);
    const pkCol = columns.find(c => c.key === 'PRI');
    if (!pkCol) {
      res.status(400).json({ error: 'Table has no primary key', code: 'NO_PRIMARY_KEY' });
      return;
    }

    const result = await dataService.deleteRow(tableName, { column: pkCol.name, value: id });
    res.json(result);
  } catch (err) {
    handleError(res, err, 'delete_row');
  }
});

// ============ 辅助函数 ============

/** MySQL 列类型 → OpenAPI 类型映射 */
function columnToOpenApiType(col: { type: string; name: string; comment: string }): Record<string, any> {
  const type = col.type.toLowerCase();
  const result: Record<string, any> = {};

  if (type.includes('int')) {
    result.type = 'integer';
    if (type.includes('bigint')) result.format = 'int64';
    else result.format = 'int32';
  } else if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('double')) {
    result.type = 'number';
    result.format = type.includes('decimal') ? 'decimal' : 'double';
  } else if (type.includes('bool') || type.includes('tinyint(1)')) {
    result.type = 'boolean';
  } else if (type.includes('date') && !type.includes('datetime')) {
    result.type = 'string';
    result.format = 'date';
  } else if (type.includes('datetime') || type.includes('timestamp')) {
    result.type = 'string';
    result.format = 'date-time';
  } else if (type.includes('json')) {
    result.type = 'object';
  } else if (type.includes('text') || type.includes('blob')) {
    result.type = 'string';
    result.maxLength = type.includes('longtext') ? 4294967295 : (type.includes('mediumtext') ? 16777215 : 65535);
  } else if (type.includes('enum')) {
    result.type = 'string';
    const match = type.match(/enum\((.+)\)/);
    if (match) {
      result.enum = match[1].split(',').map(v => v.trim().replace(/^'|'$/g, ''));
    }
  } else {
    result.type = 'string';
    const lengthMatch = type.match(/\((\d+)\)/);
    if (lengthMatch) result.maxLength = parseInt(lengthMatch[1], 10);
  }

  if (col.comment) result.description = col.comment;
  return result;
}

/** 表名转 PascalCase */
function toPascalCase(str: string): string {
  return str.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

export { restRouter };
