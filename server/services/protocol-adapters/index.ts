/**
 * 协议适配器统一注册表
 * 
 * 所有 18 个协议适配器均基于 BaseAdapter 抽象类实现，
 * 提供真实的连接测试、资源发现、健康检查能力。
 * 
 * 工业协议（6个）：MQTT, OPC-UA, Modbus, EtherNet/IP, PROFINET, EtherCAT
 * 数据库（6个）：MySQL, PostgreSQL, ClickHouse, InfluxDB, Redis, Neo4j
 * 存储/消息（3个）：Qdrant, Kafka, MinIO
 * API 协议（3个）：HTTP, gRPC, WebSocket
 * 
 * 架构：BaseAdapter → 具体适配器 → 注册表 → 服务层
 */

import type { ProtocolType } from "../../../shared/accessLayerTypes";
import type { ProtocolAdapter } from "./base";

// ============ 导入所有真实适配器 ============
import { MqttAdapter } from "./mqtt.adapter";
import { OpcuaAdapter } from "./opcua.adapter";
import { ModbusAdapter } from "./modbus.adapter";
import { MysqlAdapter } from "./mysql.adapter";
import { PostgresqlAdapter } from "./postgresql.adapter";
import { ClickhouseAdapter } from "./clickhouse.adapter";
import { InfluxdbAdapter } from "./influxdb.adapter";
import { RedisAdapter } from "./redis.adapter";
import { Neo4jAdapter } from "./neo4j.adapter";
import { QdrantAdapter } from "./qdrant.adapter";
import { KafkaAdapter } from "./kafka.adapter";
import { MinioAdapter } from "./minio.adapter";
import { HttpAdapter } from "./http.adapter";
import { GrpcAdapter } from "./grpc.adapter";
import { WebSocketAdapter } from "./websocket.adapter";
import { EthernetIpAdapter } from "./ethernetip.adapter";
import { ProfinetAdapter } from "./profinet.adapter";
import { EthercatAdapter } from "./ethercat.adapter";

// ============ 实例化所有适配器 ============
const mqttAdapter = new MqttAdapter();
const opcuaAdapter = new OpcuaAdapter();
const modbusAdapter = new ModbusAdapter();
const mysqlAdapter = new MysqlAdapter();
const postgresqlAdapter = new PostgresqlAdapter();
const clickhouseAdapter = new ClickhouseAdapter();
const influxdbAdapter = new InfluxdbAdapter();
const redisAdapter = new RedisAdapter();
const neo4jAdapter = new Neo4jAdapter();
const qdrantAdapter = new QdrantAdapter();
const kafkaAdapter = new KafkaAdapter();
const minioAdapter = new MinioAdapter();
const httpAdapter = new HttpAdapter();
const grpcAdapter = new GrpcAdapter();
const websocketAdapter = new WebSocketAdapter();
const ethernetIpAdapter = new EthernetIpAdapter();
const profinetAdapter = new ProfinetAdapter();
const ethercatAdapter = new EthercatAdapter();

// ============ 统一注册表 ============
export const protocolAdapters: Record<string, ProtocolAdapter> = {
  // 工业协议
  mqtt: mqttAdapter,
  opcua: opcuaAdapter,
  modbus: modbusAdapter,
  'ethernet-ip': ethernetIpAdapter,
  profinet: profinetAdapter,
  ethercat: ethercatAdapter,
  // 关系型数据库
  mysql: mysqlAdapter,
  postgresql: postgresqlAdapter,
  // 分析型数据库
  clickhouse: clickhouseAdapter,
  // 时序数据库
  influxdb: influxdbAdapter,
  // 缓存 / KV 存储
  redis: redisAdapter,
  // 图数据库
  neo4j: neo4jAdapter,
  // 向量数据库
  qdrant: qdrantAdapter,
  // 消息队列
  kafka: kafkaAdapter,
  // 对象存储
  minio: minioAdapter,
  // API 协议
  http: httpAdapter,
  grpc: grpcAdapter,
  websocket: websocketAdapter,
};

// ============ 导出类型和工具 ============
export type { ProtocolAdapter } from "./base";

/** 获取所有已注册的协议类型 */
export function getRegisteredProtocols(): ProtocolType[] {
  return Object.keys(protocolAdapters) as ProtocolType[];
}

/** 获取指定协议的适配器实例 */
export function getAdapter(protocolType: string): ProtocolAdapter | undefined {
  return protocolAdapters[protocolType];
}

/** 获取所有适配器的运行指标 */
export function getAllAdapterMetrics() {
  return Object.entries(protocolAdapters).map(([type, adapter]) => ({
    protocolType: type,
    metrics: adapter.getMetrics?.() || null,
  }));
}

/** 按分类获取适配器 */
export const adapterCategories = {
  industrial: ['mqtt', 'opcua', 'modbus', 'ethernet-ip', 'profinet', 'ethercat'] as ProtocolType[],
  relational: ['mysql', 'postgresql'] as ProtocolType[],
  analytical: ['clickhouse'] as ProtocolType[],
  timeseries: ['influxdb'] as ProtocolType[],
  cache: ['redis'] as ProtocolType[],
  graph: ['neo4j'] as ProtocolType[],
  vector: ['qdrant'] as ProtocolType[],
  messaging: ['kafka'] as ProtocolType[],
  storage: ['minio'] as ProtocolType[],
  api: ['http', 'grpc', 'websocket'] as ProtocolType[],
};
