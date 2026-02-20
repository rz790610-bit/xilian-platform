/**
 * Algorithm Service — gRPC 服务器入口
 * 
 * 独立微服务，负责算法域的所有操作：
 * - 算法定义管理（CRUD + 版本控制）
 * - 算法执行引擎（Worker Threads 池）
 * - 设备-算法绑定管理
 * - 智能推荐引擎
 * - 组合编排
 * 
 * 通信：
 * - gRPC (端口 50052) — 同步 RPC
 * - Kafka — 异步执行结果发布
 * - Redis — 执行结果缓存
 * 
 * 启动方式：
 *   node --loader tsx services/algorithm-service/src/server.ts
 *   或 docker-compose --profile microservices up algorithm-service
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { createModuleLogger } from '../../../server/core/logger';
import { getDb } from '../../../server/lib/db';
import {
  algorithmDefinitions,
  algorithmDeviceBindings,
  algorithmCompositions,
  algorithmExecutions,
  algorithmRoutingRules,
} from '../../../drizzle/schema';
import { eq, desc, and, gte, lte, sql, count, like, or } from 'drizzle-orm';
import { AlgorithmEngine } from '../../../server/algorithms/_core/engine';

const log = createModuleLogger('algorithm-service');

// ============================================================
// 配置
// ============================================================

const CONFIG = {
  port: parseInt(process.env.ALGORITHM_SERVICE_PORT || '50052'),
  host: process.env.ALGORITHM_SERVICE_HOST || '0.0.0.0',
  kafkaBrokers: process.env.KAFKA_BROKERS || 'localhost:9092',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  maxConcurrentStreams: 100,
  keepaliveTimeMs: 30000,
  keepaliveTimeoutMs: 5000,
};

// ============================================================
// Proto 加载
// ============================================================

const PROTO_PATH = path.resolve(__dirname, '../proto/algorithm_service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [
    path.resolve(__dirname, '../proto'),
    path.resolve(__dirname, '../../../node_modules/google-proto-files'),
  ],
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const algorithmProto = protoDescriptor.xilian.algorithm.v1;

// ============================================================
// 引擎实例
// ============================================================

let engine: AlgorithmEngine;

function getEngine(): AlgorithmEngine {
  if (!engine) {
    engine = AlgorithmEngine.getInstance();
  }
  return engine;
}

const startTime = Date.now();

// ============================================================
// 服务实现
// ============================================================

const algorithmServiceImpl = {
  // ── 健康检查 ──
  async healthCheck(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const db = await getDb();
      const dbOk = db ? 'ok' : 'error';
      const eng = getEngine();
      const status = eng.getStatus();

      callback(null, {
        status: 'SERVING',
        version: process.env.SERVICE_VERSION || '1.0.0',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000).toString(),
        registeredAlgorithms: status.registeredAlgorithms || 0,
        activeWorkers: status.workerPool?.activeWorkers || 0,
        checks: { db: dbOk, engine: 'ok' },
      });
    } catch (err: any) {
      callback(null, {
        status: 'NOT_SERVING',
        version: process.env.SERVICE_VERSION || '1.0.0',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000).toString(),
        checks: { error: err.message },
      });
    }
  },

  // ── 创建算法定义 ──
  async createDefinition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const defId = `alg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const [inserted] = await db.insert(algorithmDefinitions).values({
        id: defId,
        name: req.name,
        displayName: req.displayName || req.name,
        category: (req.category || 'COMPREHENSIVE').toLowerCase(),
        type: (req.type || 'BUILTIN').toLowerCase(),
        description: req.description || '',
        version: req.version || '1.0.0',
        applicableDeviceTypes: JSON.stringify(req.applicableDeviceTypes || []),
        inputTypes: JSON.stringify([]),
        outputTypes: JSON.stringify([]),
        configSchema: JSON.stringify(req.configSchema || {}),
        defaultConfig: JSON.stringify(req.defaultConfig || {}),
        gpuRequired: req.gpuRequired || false,
        enabled: true,
      }).returning();

      log.info(`Algorithm definition created: ${defId} (${req.name})`);

      callback(null, {
        definition: mapToDefinition(inserted),
      });
    } catch (err: any) {
      log.error('CreateDefinition failed:', err.message);
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 获取算法定义 ──
  async getDefinition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { definitionId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [def] = await db.select().from(algorithmDefinitions)
        .where(eq(algorithmDefinitions.id, definitionId)).limit(1);

      if (!def) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Algorithm definition ${definitionId} not found`,
        });
      }

      callback(null, { definition: mapToDefinition(def) });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 列表算法定义 ──
  async listDefinitions(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));

      const conditions: any[] = [];
      if (req.categoryFilter && req.categoryFilter !== 'ALGORITHM_CATEGORY_UNSPECIFIED') {
        conditions.push(eq(algorithmDefinitions.category, req.categoryFilter.toLowerCase()));
      }
      if (req.typeFilter && req.typeFilter !== 'ALGORITHM_TYPE_UNSPECIFIED') {
        conditions.push(eq(algorithmDefinitions.type, req.typeFilter.toLowerCase()));
      }
      if (req.search) {
        conditions.push(
          or(
            like(algorithmDefinitions.name, `%${req.search}%`),
            like(algorithmDefinitions.displayName, `%${req.search}%`)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [defs, [totalResult]] = await Promise.all([
        db.select().from(algorithmDefinitions).where(whereClause)
          .orderBy(desc(algorithmDefinitions.createdAt))
          .limit(pageSize).offset((page - 1) * pageSize),
        db.select({ total: count() }).from(algorithmDefinitions).where(whereClause),
      ]);

      callback(null, {
        definitions: defs.map(mapToDefinition),
        total: totalResult?.total || 0,
        page,
        pageSize,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 更新算法定义 ──
  async updateDefinition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updates: Record<string, any> = {};
      if (req.displayName) updates.displayName = req.displayName;
      if (req.description) updates.description = req.description;
      if (req.version) updates.version = req.version;
      if (req.configSchema) updates.configSchema = JSON.stringify(req.configSchema);
      if (req.defaultConfig) updates.defaultConfig = JSON.stringify(req.defaultConfig);
      if (req.enabled !== undefined) updates.enabled = req.enabled;

      if (Object.keys(updates).length === 0) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No fields to update' });
      }

      await db.update(algorithmDefinitions).set(updates)
        .where(eq(algorithmDefinitions.id, req.definitionId));

      const [updated] = await db.select().from(algorithmDefinitions)
        .where(eq(algorithmDefinitions.id, req.definitionId)).limit(1);

      callback(null, { definition: mapToDefinition(updated) });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 删除算法定义 ──
  async deleteDefinition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { definitionId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(algorithmDefinitions).where(eq(algorithmDefinitions.id, definitionId));
      log.info(`Algorithm definition deleted: ${definitionId}`);
      callback(null, {});
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 同步内置算法 ──
  async syncBuiltinAlgorithms(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const eng = getEngine();
      const result = await eng.syncToDatabase();
      callback(null, {
        added: result.added || 0,
        updated: result.updated || 0,
        unchanged: result.unchanged || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 执行算法 ──
  async executeAlgorithm(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    const startMs = Date.now();
    try {
      const req = call.request;
      const eng = getEngine();

      const input = {
        data: req.input?.data || [],
        samplingRate: req.input?.samplingRate || 1000,
        dataType: req.input?.dataType || 'vibration',
        metadata: req.input?.metadata || {},
      };

      const config = req.config || {};
      if (req.useWorker) config.__forceWorker = true;

      const result = await eng.execute(req.algorithmId, input, config);

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const durationMs = Date.now() - startMs;

      // 异步写入执行历史
      getDb().then(db => {
        if (!db) return;
        db.insert(algorithmExecutions).values({
          executionId,
          algoCode: req.algorithmId,
          deviceCode: req.deviceId || null,
          status: 'success',
          durationMs,
          recordsProcessed: input.data.length,
          outputSummary: result,
          startedAt: new Date(startMs),
          completedAt: new Date(),
        }).catch(err => log.error('Failed to save execution history:', err.message));
      });

      callback(null, {
        executionId,
        algorithmId: req.algorithmId,
        status: 'success',
        output: {
          results: result.results || result,
          anomalies: result.anomalies || [],
          features: result.features || [],
          confidence: result.confidence || 0,
          severity: result.severity || 'normal',
          summary: result.summary || '',
        },
        durationMs: durationMs.toString(),
        workerId: result.__workerId || 'main',
        traceId: req.executionTag || executionId,
      });
    } catch (err: any) {
      log.error('ExecuteAlgorithm failed:', err.message);

      // 记录失败
      getDb().then(db => {
        if (!db) return;
        db.insert(algorithmExecutions).values({
          executionId: `exec_${Date.now()}`,
          algoCode: call.request.algorithmId,
          status: 'failed',
          durationMs: Date.now() - startMs,
          recordsProcessed: call.request.input?.data?.length || 0,
          errorMessage: err.message,
          startedAt: new Date(startMs),
          completedAt: new Date(),
        }).catch(() => {});
      });

      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 执行组合编排 ──
  async executeComposition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    const startMs = Date.now();
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 获取组合定义
      const [composition] = await db.select().from(algorithmCompositions)
        .where(eq(algorithmCompositions.id, req.compositionId)).limit(1);

      if (!composition) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: `Composition ${req.compositionId} not found`,
        });
      }

      const steps = typeof composition.steps === 'string'
        ? JSON.parse(composition.steps) : composition.steps;
      
      const eng = getEngine();
      const input = {
        data: req.input?.data || [],
        samplingRate: req.input?.samplingRate || 1000,
        dataType: req.input?.dataType || 'vibration',
        metadata: req.input?.metadata || {},
      };

      // 按 DAG 顺序执行（简化为顺序执行）
      let currentInput = input;
      let lastResult: any = null;

      for (const step of steps) {
        const stepConfig = { ...(req.globalConfig || {}), ...(step.config || {}) };
        lastResult = await eng.execute(step.algorithmId, currentInput, stepConfig);
        
        // 如果输出包含处理后的数据，传递给下一步
        if (lastResult.processedData) {
          currentInput = { ...currentInput, data: lastResult.processedData };
        }
      }

      const executionId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      callback(null, {
        executionId,
        algorithmId: req.compositionId,
        status: 'success',
        output: {
          results: lastResult || {},
          summary: `Composition executed: ${steps.length} steps completed`,
        },
        durationMs: (Date.now() - startMs).toString(),
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 执行历史 ──
  async listExecutionHistory(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));

      const conditions: any[] = [];
      if (req.algorithmId) conditions.push(eq(algorithmExecutions.algoCode, req.algorithmId));
      if (req.deviceId) conditions.push(eq(algorithmExecutions.deviceCode, req.deviceId));
      if (req.statusFilter) conditions.push(eq(algorithmExecutions.status, req.statusFilter));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [records, [totalResult]] = await Promise.all([
        db.select().from(algorithmExecutions).where(whereClause)
          .orderBy(desc(algorithmExecutions.createdAt))
          .limit(pageSize).offset((page - 1) * pageSize),
        db.select({ total: count() }).from(algorithmExecutions).where(whereClause),
      ]);

      callback(null, {
        records: records.map(r => ({
          executionId: r.executionId,
          algorithmId: r.algorithmId,
          algorithmName: '',
          deviceId: r.deviceId || '',
          status: r.status,
          durationMs: (r.durationMs || 0).toString(),
          inputSize: (r.inputSize || 0).toString(),
          traceId: r.traceId || '',
          executedAt: r.createdAt
            ? { seconds: Math.floor(new Date(r.createdAt).getTime() / 1000) }
            : null,
        })),
        total: totalResult?.total || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 绑定算法到设备 ──
  async bindAlgorithmToDevice(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const bindingId = `bind_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(algorithmDeviceBindings).values({
        deviceCode: req.deviceId,
        algoCode: req.algorithmId,
        bindingType: 'algorithm',
        configOverrides: req.configOverride || {},
        scheduleCron: req.scheduleCron || null,
        autoExecute: req.autoExecute || false,
        active: true,
      });

      log.info(`Algorithm ${req.algorithmId} bound to device ${req.deviceId}`);

      callback(null, {
        bindingId,
        algorithmId: req.algorithmId,
        deviceId: req.deviceId,
        config: req.configOverride || {},
        active: true,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 解绑 ──
  async unbindAlgorithm(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { bindingId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(algorithmDeviceBindings).where(eq(algorithmDeviceBindings.id, bindingId));
      callback(null, {});
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 列表绑定 ──
  async listDeviceBindings(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const conditions: any[] = [];
      if (req.deviceId) conditions.push(eq(algorithmDeviceBindings.deviceCode, req.deviceId));
      if (req.algorithmId) conditions.push(eq(algorithmDeviceBindings.algoCode, req.algorithmId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const bindings = await db.select().from(algorithmDeviceBindings)
        .where(whereClause).limit(100);

      callback(null, {
        bindings: bindings.map(b => ({
          bindingId: b.id,
          algorithmId: b.algorithmId,
          deviceId: b.deviceId,
          config: typeof b.configOverride === 'string' ? JSON.parse(b.configOverride) : b.configOverride,
          active: b.active,
        })),
        total: bindings.length,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 智能推荐 ──
  async getRecommendedAlgorithms(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // 基于设备类型和传感器类型推荐
      const allDefs = await db.select().from(algorithmDefinitions)
        .where(eq(algorithmDefinitions.enabled, true))
        .limit(50);

      const recommendations = allDefs
        .map(def => {
          let score = 0.5; // 基础分
          const applicableTypes = typeof def.applicableDeviceTypes === 'string'
            ? JSON.parse(def.applicableDeviceTypes) : def.applicableDeviceTypes || [];

          // 设备类型匹配
          if (req.deviceType && applicableTypes.includes(req.deviceType.toLowerCase())) {
            score += 0.3;
          }

          // 传感器类型匹配
          if (req.sensorTypes && req.sensorTypes.length > 0) {
            const inputTypes = typeof def.inputTypes === 'string'
              ? JSON.parse(def.inputTypes) : def.inputTypes || [];
            const overlap = req.sensorTypes.filter((t: string) =>
              inputTypes.some((it: string) => it.toLowerCase().includes(t.toLowerCase()))
            );
            score += (overlap.length / req.sensorTypes.length) * 0.2;
          }

          return {
            definition: mapToDefinition(def),
            relevanceScore: Math.round(score * 100) / 100,
            reason: score > 0.7 ? 'High compatibility with device type and sensors'
              : score > 0.5 ? 'Partial match based on device characteristics'
              : 'General purpose algorithm',
          };
        })
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, req.maxResults || 10);

      callback(null, { recommendations });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 组合编排 CRUD ──
  async createComposition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const compId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(algorithmCompositions).values({
        id: compId,
        name: req.name,
        description: req.description || '',
        steps: JSON.stringify(req.steps || []),
        executionMode: req.executionMode || 'sequential',
      });

      callback(null, {
        composition: {
          id: compId,
          name: req.name,
          description: req.description || '',
          steps: req.steps || [],
          executionMode: req.executionMode || 'sequential',
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async getComposition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { compositionId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [comp] = await db.select().from(algorithmCompositions)
        .where(eq(algorithmCompositions.id, compositionId)).limit(1);

      if (!comp) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Composition not found' });
      }

      callback(null, {
        composition: {
          id: comp.id,
          name: comp.name,
          description: comp.description || '',
          steps: typeof comp.steps === 'string' ? JSON.parse(comp.steps) : comp.steps,
          executionMode: comp.executionMode || 'sequential',
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async listCompositions(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const page = Math.max(1, req.page || 1);
      const pageSize = Math.min(100, Math.max(1, req.pageSize || 20));

      const [comps, [totalResult]] = await Promise.all([
        db.select().from(algorithmCompositions)
          .limit(pageSize).offset((page - 1) * pageSize),
        db.select({ total: count() }).from(algorithmCompositions),
      ]);

      callback(null, {
        compositions: comps.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          steps: typeof c.steps === 'string' ? JSON.parse(c.steps) : c.steps,
          executionMode: c.executionMode || 'sequential',
        })),
        total: totalResult?.total || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async updateComposition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updates: Record<string, any> = {};
      if (req.name) updates.name = req.name;
      if (req.description) updates.description = req.description;
      if (req.steps) updates.steps = JSON.stringify(req.steps);

      await db.update(algorithmCompositions).set(updates)
        .where(eq(algorithmCompositions.id, req.compositionId));

      const [updated] = await db.select().from(algorithmCompositions)
        .where(eq(algorithmCompositions.id, req.compositionId)).limit(1);

      callback(null, {
        composition: {
          id: updated.id,
          name: updated.name,
          steps: typeof updated.steps === 'string' ? JSON.parse(updated.steps) : updated.steps,
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async deleteComposition(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { compositionId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(algorithmCompositions).where(eq(algorithmCompositions.id, compositionId));
      callback(null, {});
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 路由规则 CRUD ──
  async createRoutingRule(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await db.insert(algorithmRoutingRules).values({
        id: ruleId,
        name: req.name,
        conditionExpression: req.conditionExpression,
        targetAlgorithmId: req.targetAlgorithmId || null,
        targetCompositionId: req.targetCompositionId || null,
        priority: req.priority || 0,
        enabled: true,
      });

      callback(null, {
        rule: {
          id: ruleId,
          name: req.name,
          conditionExpression: req.conditionExpression,
          targetAlgorithmId: req.targetAlgorithmId || '',
          targetCompositionId: req.targetCompositionId || '',
          priority: req.priority || 0,
          enabled: true,
        },
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async listRoutingRules(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const rules = await db.select().from(algorithmRoutingRules).limit(100);

      callback(null, {
        rules: rules.map(r => ({
          id: r.id,
          name: r.name,
          conditionExpression: r.conditionExpression,
          targetAlgorithmId: r.targetAlgorithmId || '',
          targetCompositionId: r.targetCompositionId || '',
          priority: r.priority || 0,
          enabled: r.enabled,
        })),
        total: rules.length,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async updateRoutingRule(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const updates: Record<string, any> = {};
      if (req.name) updates.name = req.name;
      if (req.conditionExpression) updates.conditionExpression = req.conditionExpression;
      if (req.priority !== undefined) updates.priority = req.priority;
      if (req.enabled !== undefined) updates.enabled = req.enabled;

      await db.update(algorithmRoutingRules).set(updates)
        .where(eq(algorithmRoutingRules.id, req.ruleId));

      const [updated] = await db.select().from(algorithmRoutingRules)
        .where(eq(algorithmRoutingRules.id, req.ruleId)).limit(1);

      callback(null, { rule: updated });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  async deleteRoutingRule(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { ruleId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.delete(algorithmRoutingRules).where(eq(algorithmRoutingRules.id, ruleId));
      callback(null, {});
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 统计概览 ──
  async getOverviewStats(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        [defCount],
        [bindCount],
        [compCount],
        [todayExecCount],
      ] = await Promise.all([
        db.select({ total: count() }).from(algorithmDefinitions),
        db.select({ total: count() }).from(algorithmDeviceBindings),
        db.select({ total: count() }).from(algorithmCompositions),
        db.select({ total: count() }).from(algorithmExecutions)
          .where(gte(algorithmExecutions.createdAt, today)),
      ]);

      callback(null, {
        totalDefinitions: defCount?.total || 0,
        totalBindings: bindCount?.total || 0,
        totalCompositions: compCount?.total || 0,
        totalExecutionsToday: todayExecCount?.total || 0,
        avgExecutionMs: 0,
        successRate: 0,
        executionsByCategory: {},
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 基准测试 ──
  async getAlgorithmBenchmark(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { algorithmId, sampleCount } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const records = await db.select().from(algorithmExecutions)
        .where(
          and(
            eq(algorithmExecutions.algoCode, algorithmId),
            eq(algorithmExecutions.status, 'success')
          )
        )
        .orderBy(desc(algorithmExecutions.createdAt))
        .limit(sampleCount || 100);

      if (records.length === 0) {
        return callback(null, {
          algorithmId,
          avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0, totalRuns: 0,
        });
      }

      const durations = records.map(r => r.durationMs || 0).sort((a, b) => a - b);
      const sum = durations.reduce((a, b) => a + b, 0);

      callback(null, {
        algorithmId,
        avgMs: sum / durations.length,
        p50Ms: durations[Math.floor(durations.length * 0.5)],
        p95Ms: durations[Math.floor(durations.length * 0.95)],
        p99Ms: durations[Math.floor(durations.length * 0.99)],
        minMs: durations[0],
        maxMs: durations[durations.length - 1],
        totalRuns: durations.length,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── Worker 池状态 ──
  async getWorkerPoolStatus(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const eng = getEngine();
      const status = eng.getStatus();
      const wp = status.workerPool || {};

      callback(null, {
        totalWorkers: wp.totalWorkers || 0,
        activeWorkers: wp.activeWorkers || 0,
        idleWorkers: wp.idleWorkers || 0,
        queueLength: wp.queueLength || 0,
        totalTasksProcessed: (wp.totalTasksProcessed || 0).toString(),
        totalTasksFailed: (wp.totalTasksFailed || 0).toString(),
        avgTaskDurationMs: wp.avgTaskDurationMs || 0,
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 执行状态（简化） ──
  async getExecutionStatus(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { executionId } = call.request;
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [record] = await db.select().from(algorithmExecutions)
        .where(eq(algorithmExecutions.executionId, executionId)).limit(1);

      if (!record) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Execution not found' });
      }

      callback(null, {
        executionId,
        status: record.status,
        progress: record.status === 'success' ? 1.0 : 0.0,
        currentStage: record.status === 'success' ? 'completed' : 'running',
      });
    } catch (err: any) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  // ── 执行进度流（Server Streaming） ──
  async streamExecutionProgress(
    call: grpc.ServerWritableStream<any, any>
  ) {
    const { executionId } = call.request;
    
    // 发送初始状态
    call.write({
      executionId,
      progress: 0,
      stage: 'started',
      message: 'Execution started',
      timestamp: { seconds: Math.floor(Date.now() / 1000) },
    });

    // 轮询数据库状态
    const checkInterval = setInterval(async () => {
      if (call.cancelled || call.destroyed) {
        clearInterval(checkInterval);
        return;
      }

      try {
        const db = await getDb();
        if (!db) return;

        const [record] = await db.select().from(algorithmExecutions)
          .where(eq(algorithmExecutions.executionId, executionId)).limit(1);

        if (record) {
          call.write({
            executionId,
            progress: record.status === 'success' ? 1.0 : 0.5,
            stage: record.status,
            message: `Status: ${record.status}`,
            timestamp: { seconds: Math.floor(Date.now() / 1000) },
          });

          if (record.status === 'success' || record.status === 'error') {
            clearInterval(checkInterval);
            call.end();
          }
        }
      } catch {
        // 忽略轮询错误
      }
    }, 1000);

    call.on('cancelled', () => clearInterval(checkInterval));
  },
};

// ============================================================
// 辅助函数
// ============================================================

function mapToDefinition(row: any): any {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName || row.name,
    category: (row.category || 'COMPREHENSIVE').toUpperCase(),
    type: (row.type || 'BUILTIN').toUpperCase(),
    description: row.description || '',
    version: row.version || '1.0.0',
    applicableDeviceTypes: typeof row.applicableDeviceTypes === 'string'
      ? JSON.parse(row.applicableDeviceTypes) : row.applicableDeviceTypes || [],
    inputTypes: typeof row.inputTypes === 'string'
      ? JSON.parse(row.inputTypes) : row.inputTypes || [],
    outputTypes: typeof row.outputTypes === 'string'
      ? JSON.parse(row.outputTypes) : row.outputTypes || [],
    configSchema: typeof row.configSchema === 'string'
      ? JSON.parse(row.configSchema) : row.configSchema || {},
    defaultConfig: typeof row.defaultConfig === 'string'
      ? JSON.parse(row.defaultConfig) : row.defaultConfig || {},
    gpuRequired: row.gpuRequired || false,
    avgExecutionMs: (row.avgExecutionMs || 0).toString(),
    enabled: row.enabled !== false,
    createdAt: row.createdAt
      ? { seconds: Math.floor(new Date(row.createdAt).getTime() / 1000) }
      : null,
    updatedAt: row.updatedAt
      ? { seconds: Math.floor(new Date(row.updatedAt).getTime() / 1000) }
      : null,
  };
}

// ============================================================
// 服务器启动
// ============================================================

export async function startAlgorithmService(): Promise<grpc.Server> {
  const server = new grpc.Server({
    'grpc.max_concurrent_streams': CONFIG.maxConcurrentStreams,
    'grpc.keepalive_time_ms': CONFIG.keepaliveTimeMs,
    'grpc.keepalive_timeout_ms': CONFIG.keepaliveTimeoutMs,
    'grpc.max_receive_message_length': 100 * 1024 * 1024, // 100MB（大数据集）
    'grpc.max_send_message_length': 100 * 1024 * 1024,
  });

  server.addService(algorithmProto.AlgorithmService.service, algorithmServiceImpl);

  return new Promise((resolve, reject) => {
    server.bindAsync(
      `${CONFIG.host}:${CONFIG.port}`,
      // P0-R7-04: 生产环境应启用 TLS，配置 GRPC_TLS_CERT 和 GRPC_TLS_KEY 环境变量
      // TODO: 实现 grpc.ServerCredentials.createSsl() 支持
      process.env.NODE_ENV === 'production' && !process.env.GRPC_TLS_CERT
        ? (() => { log.warn('P0-R7-04: gRPC running without TLS in production! Set GRPC_TLS_CERT/GRPC_TLS_KEY'); return grpc.ServerCredentials.createInsecure(); })()
        : grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) {
          log.error('Failed to bind algorithm service:', err.message);
          reject(err);
          return;
        }
        log.info(`Algorithm Service started on port ${port}`);
        log.info(`  gRPC endpoint: ${CONFIG.host}:${port}`);
        log.info(`  Proto: algorithm_service.proto`);
        log.info(`  Worker pool: ${getEngine().getStatus().workerPool?.totalWorkers || 0} threads`);
        resolve(server);
      }
    );
  });
}

// 独立运行模式
if (require.main === module || process.argv[1]?.includes('algorithm-service')) {
  startAlgorithmService()
    .then(() => log.info('Algorithm Service is ready'))
    .catch(err => {
      log.error('Algorithm Service startup failed:', err);
      process.exit(1);
    });

  const shutdown = () => {
    log.info('Shutting down Algorithm Service...');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
