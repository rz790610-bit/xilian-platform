/**
 * 连接器定时健康巡检 Job
 * 
 * 定期检查所有已创建的数据连接器的连接状态，自动更新 connector.status 和 lastHealthCheck 字段。
 * 
 * 设计原则（工业环境适配）：
 * - 正常间隔 5 分钟（避免频繁检查对目标设备造成压力）
 * - 连续失败 3 次后自动降级为低频巡检（30 分钟），减少无效日志
 * - 降级后恢复成功则自动回到正常频率
 * - 并行检查所有连接器（单个超时不阻塞其他）
 * - 每个连接器有独立的超时控制（默认 15s，降级后 8s）
 * - 日志分级：正常 INFO，异常 WARN，超阈值后静默
 */
import { createModuleLogger } from '../core/logger';
import * as alService from '../services/access-layer.service';

const log = createModuleLogger('connectorHealthCheck.job');

// ============ 配置常量 ============

/** 正常巡检间隔（5 分钟） */
const NORMAL_INTERVAL_MS = 5 * 60_000;

/** 降级巡检间隔（30 分钟） */
const DEGRADED_INTERVAL_MS = 30 * 60_000;

/** 连续失败多少次后降级 */
const DEGRADE_THRESHOLD = 3;

/** 单个连接器检查超时（正常模式） */
const NORMAL_CHECK_TIMEOUT_MS = 15_000;

/** 单个连接器检查超时（降级模式，快速失败） */
const DEGRADED_CHECK_TIMEOUT_MS = 8_000;

/** 首次启动延迟（等待系统完全启动） */
const INITIAL_DELAY_MS = process.env.NODE_ENV === 'production' ? 30_000 : 60_000;

/** 开发模式下是否跳过 demo 连接器的健康检查 */
const SKIP_DEMO_IN_DEV = process.env.NODE_ENV !== 'production';

// ============ 状态管理 ============

let normalTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let isChecking = false; // 防止重叠执行

interface ConnectorState {
  consecutiveFailures: number;
  degraded: boolean;
  lastCheckAt: number;
  lastError: string | null;
  silenced: boolean; // 超过阈值后不再输出日志
}

const connectorStates: Map<string, ConnectorState> = new Map();

function getState(connectorId: string): ConnectorState {
  if (!connectorStates.has(connectorId)) {
    connectorStates.set(connectorId, {
      consecutiveFailures: 0,
      degraded: false,
      lastCheckAt: 0,
      lastError: null,
      silenced: false,
    });
  }
  return connectorStates.get(connectorId)!;
}

// ============ 核心巡检逻辑 ============

/**
 * 带超时的单个连接器检查
 */
async function checkSingleConnector(
  conn: { connectorId: string; name: string; status: string; protocolType: string },
  timeoutMs: number
): Promise<{ success: boolean; message: string }> {
  return new Promise(async (resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, message: `连接测试超时 (${timeoutMs}ms)` });
    }, timeoutMs);

    try {
      const result = await alService.healthCheck(conn.connectorId);
      clearTimeout(timer);
      resolve({
        success: result.status === 'healthy',
        message: result.message || (result.status === 'healthy' ? '健康' : '异常'),
      });
    } catch (err: any) {
      clearTimeout(timer);
      resolve({ success: false, message: err.message || '检查异常' });
    }
  });
}

/**
 * 判断连接器是否应该在本轮被检查
 */
function shouldCheckNow(connectorId: string): boolean {
  const state = getState(connectorId);
  const now = Date.now();
  
  if (!state.degraded) {
    // 正常模式：每轮都检查
    return true;
  }
  
  // 降级模式：只有距上次检查超过降级间隔才检查
  return (now - state.lastCheckAt) >= DEGRADED_INTERVAL_MS;
}

/**
 * 执行一次全量连接器健康巡检
 */
export async function runConnectorHealthCheck(): Promise<{
  total: number;
  checked: number;
  healthy: number;
  unhealthy: number;
  skipped: number;
  degraded: number;
}> {
  if (isChecking) {
    log.warn('[ConnectorHealthCheck] 上一轮巡检尚未完成，跳过本轮');
    return { total: 0, checked: 0, healthy: 0, unhealthy: 0, skipped: 0, degraded: 0 };
  }

  isChecking = true;
  const startTime = Date.now();
  let total = 0;
  let checked = 0;
  let healthy = 0;
  let unhealthy = 0;
  let skipped = 0;
  let degradedCount = 0;

  try {
    const result = await alService.listConnectors({});
    const connectors = Array.isArray(result) ? result : (result as any)?.items || [];
    total = connectors.length;

    if (total === 0) {
      return { total, checked, healthy, unhealthy, skipped, degraded: degradedCount };
    }

    // 过滤出本轮需要检查的连接器
    const toCheck: typeof connectors = [];
    for (const conn of connectors) {
      if (conn.status === 'draft') {
        skipped++;
        continue;
      }
      // 开发模式下跳过 demo 连接器（conn_demo_ 前缀），避免大量无意义的超时日志
      if (SKIP_DEMO_IN_DEV && conn.connectorId?.startsWith('conn_demo_')) {
        skipped++;
        continue;
      }
      if (!shouldCheckNow(conn.connectorId)) {
        skipped++;
        degradedCount++;
        continue;
      }
      toCheck.push(conn);
    }

    // 并行检查所有连接器（每个有独立超时）
    const checkPromises = toCheck.map(async (conn: any) => {
      const state = getState(conn.connectorId);
      const timeoutMs = state.degraded ? DEGRADED_CHECK_TIMEOUT_MS : NORMAL_CHECK_TIMEOUT_MS;
      
      const result = await checkSingleConnector(conn, timeoutMs);
      state.lastCheckAt = Date.now();
      checked++;

      if (result.success) {
        healthy++;
        // 从失败中恢复
        if (state.consecutiveFailures > 0) {
          const wasDegraded = state.degraded;
          log.info(`[ConnectorHealthCheck] ✓ 连接器 "${conn.name}" 已恢复连接` +
            (wasDegraded ? ` (从降级模式恢复，之前连续失败 ${state.consecutiveFailures} 次)` : ''));
          state.consecutiveFailures = 0;
          state.degraded = false;
          state.silenced = false;
          state.lastError = null;
        }
      } else {
        unhealthy++;
        state.consecutiveFailures++;
        state.lastError = result.message;

        if (state.consecutiveFailures === DEGRADE_THRESHOLD) {
          // 达到阈值，降级
          state.degraded = true;
          state.silenced = true;
          log.warn(`[ConnectorHealthCheck] ⚠ 连接器 "${conn.name}" 连续 ${DEGRADE_THRESHOLD} 次失败，` +
            `降级为低频巡检 (${DEGRADED_INTERVAL_MS / 60000}分钟间隔): ${result.message}`);
        } else if (state.consecutiveFailures < DEGRADE_THRESHOLD) {
          // 阈值内，正常输出 WARN
          log.warn(`[ConnectorHealthCheck] ✗ 连接器 "${conn.name}" 检查异常 ` +
            `(${state.consecutiveFailures}/${DEGRADE_THRESHOLD}): ${result.message}`);
        }
        // 超过阈值后不再输出日志（silenced）
      }
    });

    await Promise.allSettled(checkPromises);

    const elapsed = Date.now() - startTime;
    
    // 统计降级连接器数
    for (const [, state] of connectorStates) {
      if (state.degraded) degradedCount++;
    }

    // 汇总日志
    if (checked > 0) {
      const parts = [`${checked}/${total} 已检查`, `${healthy} 健康`, `${unhealthy} 异常`];
      if (skipped > 0) parts.push(`${skipped} 跳过`);
      if (degradedCount > 0) parts.push(`${degradedCount} 降级`);
      parts.push(`${elapsed}ms`);
      
      if (unhealthy > 0 || degradedCount > 0) {
        log.info(`[ConnectorHealthCheck] 巡检完成: ${parts.join(', ')}`);
      } else {
        log.info(`[ConnectorHealthCheck] 巡检完成: 全部 ${healthy} 个连接器健康 (${elapsed}ms)`);
      }
    }
  } catch (err: any) {
    log.warn(`[ConnectorHealthCheck] 巡检执行失败: ${err.message}`);
  } finally {
    isChecking = false;
  }

  return { total, checked, healthy, unhealthy, skipped, degraded: degradedCount };
}

// ============ 定时调度 ============

function scheduleNext(): void {
  if (!isRunning) return;
  
  normalTimer = setTimeout(async () => {
    if (!isRunning) return;
    await runConnectorHealthCheck();
    scheduleNext();
  }, NORMAL_INTERVAL_MS);
}

/**
 * 启动定时健康巡检
 */
export function startConnectorHealthCheck(intervalMs?: number): void {
  if (normalTimer) {
    log.warn('[ConnectorHealthCheck] 定时巡检已在运行，跳过重复启动');
    return;
  }

  const interval = intervalMs || NORMAL_INTERVAL_MS;
  log.info(`[ConnectorHealthCheck] 启动定时连接器健康巡检 (正常间隔: ${interval / 1000}s, 降级间隔: ${DEGRADED_INTERVAL_MS / 1000}s, 降级阈值: ${DEGRADE_THRESHOLD}次)`);
  isRunning = true;
  connectorStates.clear();

  // 首次延迟执行（等待系统完全启动 + 数据库就绪）
  normalTimer = setTimeout(async () => {
    if (!isRunning) return;
    await runConnectorHealthCheck();
    scheduleNext();
  }, INITIAL_DELAY_MS);
}

/**
 * 停止定时健康巡检
 */
export function stopConnectorHealthCheck(): void {
  isRunning = false;
  if (normalTimer) {
    clearTimeout(normalTimer);
    normalTimer = null;
  }
  connectorStates.clear();
  log.info('[ConnectorHealthCheck] 定时连接器健康巡检已停止');
}

/**
 * 获取巡检状态
 */
export function getConnectorHealthCheckStatus(): {
  running: boolean;
  connectorStates: Record<string, { consecutiveFailures: number; degraded: boolean; lastError: string | null }>;
} {
  const states: Record<string, { consecutiveFailures: number; degraded: boolean; lastError: string | null }> = {};
  for (const [id, state] of connectorStates) {
    states[id] = {
      consecutiveFailures: state.consecutiveFailures,
      degraded: state.degraded,
      lastError: state.lastError,
    };
  }
  return { running: isRunning, connectorStates: states };
}
