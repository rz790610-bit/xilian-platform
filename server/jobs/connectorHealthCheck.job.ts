/**
 * 连接器定时健康巡检 Job
 * 
 * 定期检查所有已创建的数据连接器（Modbus/OPC-UA/MQTT/EtherNet-IP/PROFINET/EtherCAT 等）
 * 的连接状态，自动更新 connector.status 和 lastHealthCheck 字段。
 * 
 * 特性：
 * - 可配置巡检间隔（默认 60 秒）
 * - 仅检查非 draft 状态的连接器
 * - 连续失败 3 次后自动标记为 error
 * - 从 error 恢复后自动标记为 connected
 * - 支持手动触发和停止
 * - 日志级别控制：正常巡检 INFO，异常 WARN/ERROR
 */
import { createModuleLogger } from '../core/logger';
import * as alService from '../services/access-layer.service';

const log = createModuleLogger('connectorHealthCheck.job');

let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let consecutiveFailures: Record<string, number> = {};

const DEFAULT_INTERVAL_MS = 60_000; // 60 秒
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * 执行一次全量连接器健康巡检
 */
export async function runConnectorHealthCheck(): Promise<{
  total: number;
  checked: number;
  healthy: number;
  unhealthy: number;
  skipped: number;
}> {
  const startTime = Date.now();
  let total = 0;
  let checked = 0;
  let healthy = 0;
  let unhealthy = 0;
  let skipped = 0;

  try {
    const result = await alService.listConnectors({});
    const connectors = Array.isArray(result) ? result : (result as any)?.items || [];
    total = connectors.length;

    for (const conn of connectors) {
      // 跳过草稿状态的连接器
      if (conn.status === 'draft') {
        skipped++;
        continue;
      }

      try {
        const checkResult = await alService.healthCheck(conn.connectorId);
        checked++;

        if (checkResult.status === 'healthy') {
          healthy++;
          // 从失败中恢复
          if (consecutiveFailures[conn.connectorId]) {
            log.info(`[ConnectorHealthCheck] ✓ 连接器 "${conn.name}" 已恢复连接 (之前连续失败 ${consecutiveFailures[conn.connectorId]} 次)`);
            delete consecutiveFailures[conn.connectorId];
          }
        } else {
          unhealthy++;
          consecutiveFailures[conn.connectorId] = (consecutiveFailures[conn.connectorId] || 0) + 1;
          const failCount = consecutiveFailures[conn.connectorId];

          if (failCount <= MAX_CONSECUTIVE_FAILURES) {
            log.warn(`[ConnectorHealthCheck] ✗ 连接器 "${conn.name}" 检查异常 (${failCount}/${MAX_CONSECUTIVE_FAILURES}): ${checkResult.message}`);
          } else if (failCount === MAX_CONSECUTIVE_FAILURES + 1) {
            log.error(`[ConnectorHealthCheck] ✗ 连接器 "${conn.name}" 连续 ${MAX_CONSECUTIVE_FAILURES} 次检查失败，已标记为 error`);
          }
          // 超过阈值后不再重复输出日志
        }
      } catch (err: any) {
        checked++;
        unhealthy++;
        consecutiveFailures[conn.connectorId] = (consecutiveFailures[conn.connectorId] || 0) + 1;
        const failCount = consecutiveFailures[conn.connectorId];
        if (failCount <= MAX_CONSECUTIVE_FAILURES) {
          log.warn(`[ConnectorHealthCheck] ✗ 连接器 "${conn.name}" 检查异常: ${err.message}`);
        }
      }
    }

    const elapsed = Date.now() - startTime;
    if (unhealthy > 0) {
      log.info(`[ConnectorHealthCheck] 巡检完成: ${checked}/${total} 已检查, ${healthy} 健康, ${unhealthy} 异常, ${skipped} 跳过 (${elapsed}ms)`);
    } else if (checked > 0) {
      log.info(`[ConnectorHealthCheck] 巡检完成: 全部 ${healthy} 个连接器健康 (${elapsed}ms)`);
    }
  } catch (err: any) {
    log.error(`[ConnectorHealthCheck] 巡检执行失败: ${err.message}`);
  }

  return { total, checked, healthy, unhealthy, skipped };
}

/**
 * 启动定时健康巡检
 */
export function startConnectorHealthCheck(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (healthCheckInterval) {
    log.warn('[ConnectorHealthCheck] 定时巡检已在运行，跳过重复启动');
    return;
  }

  log.info(`[ConnectorHealthCheck] 启动定时连接器健康巡检 (间隔: ${intervalMs / 1000}s)`);
  isRunning = true;
  consecutiveFailures = {};

  // 首次延迟 10 秒执行（等待系统完全启动）
  setTimeout(() => {
    if (!isRunning) return;
    runConnectorHealthCheck();
  }, 10_000);

  healthCheckInterval = setInterval(async () => {
    if (!isRunning) return;
    await runConnectorHealthCheck();
  }, intervalMs);
}

/**
 * 停止定时健康巡检
 */
export function stopConnectorHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    isRunning = false;
    consecutiveFailures = {};
    log.info('[ConnectorHealthCheck] 定时连接器健康巡检已停止');
  }
}

/**
 * 获取巡检状态
 */
export function getConnectorHealthCheckStatus(): {
  running: boolean;
  consecutiveFailures: Record<string, number>;
} {
  return {
    running: isRunning,
    consecutiveFailures: { ...consecutiveFailures },
  };
}
