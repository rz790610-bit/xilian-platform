/**
 * 知识图谱种子数据索引
 *
 * 文件清单:
 *   rtg-001-sensor-mapping.json  — 传感器-部件映射表 (JSON)
 *   rtg-001-cypher.ts            — Neo4j Cypher 建库语句
 *   rtg-001-mysql-seed.sql       — MySQL 设备树 + 测点 + 传感器
 */

export { RTG_001_SEED_CYPHER, RTG_001_STATS } from './rtg-001-cypher';
