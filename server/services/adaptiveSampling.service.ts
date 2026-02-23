/**
 * 自适应采样率配置服务
 * 实时监控系统容量，动态调整设备数据采样率
 */

import { getDb } from '../lib/db';
import { deviceSamplingConfig, systemCapacityMetrics } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { kafkaClient } from '../lib/clients/kafka.client';
import { redisClient } from '../lib/clients/redis.client';
import os from 'node:os';
import { createModuleLogger } from '../core/logger';
const log = createModuleLogger('adaptiveSampling');

// ============ 类型定义 ============

export interface CapacityStatus {

  kafkaLag: number;
  dbConnections: number;
  memoryUsagePct: number;
  cpuUsagePct: number;
  queueDepth: number;
}

export interface SamplingAdjustment {
  nodeId: string; // was: deviceId
  sensorType: string;
  previousRateMs: number;
  newRateMs: number;
  reason: string;
}

interface ThresholdConfig {
  warningThreshold: number;
  criticalThreshold: number;
  scaleUpFactor: number;
  scaleDownFactor: number;
}

// ============ 自适应采样服务类 ============

class AdaptiveSamplingService {
  private readonly CHECK_INTERVAL_MS = 10000; // 10 秒检查一次
  private readonly COOLDOWN_MS = 60000; // 调整冷却期 1 分钟
  private readonly RECOVERY_CHECK_COUNT = 6; // 连续 6 次正常才恢复

  private isRunning: boolean = false;
  private checkTimer: NodeJS.Timeout | null = null;
  private lastAdjustmentTime: Date | null = null;
  private consecutiveNormalChecks: number = 0;

  // 阈值配置
  private thresholds: Record<string, ThresholdConfig> = {
    kafkaLag: {
      warningThreshold: 10000,
      criticalThreshold: 50000,
      scaleUpFactor: 2,
      scaleDownFactor: 0.5,
    },
    dbConnections: {
      warningThreshold: 80,
      criticalThreshold: 95,
      scaleUpFactor: 1.5,
      scaleDownFactor: 0.75,
    },
    memoryUsage: {
      warningThreshold: 75,
      criticalThreshold: 90,
      scaleUpFactor: 2,
      scaleDownFactor: 0.5,
    },
    cpuUsage: {
      warningThreshold: 70,
      criticalThreshold: 85,
      scaleUpFactor: 1.5,
      scaleDownFactor: 0.75,
    },
  };

  // 指标
  private metrics = {
    totalChecks: 0,
    adjustmentsMade: 0,
    lastCapacityStatus: null as CapacityStatus | null,
    lastAdjustments: [] as SamplingAdjustment[],
    currentOverallStatus: 'normal' as 'normal' | 'warning' | 'critical',
  };

  /**
   * 启动自适应采样服务
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    log.debug('[AdaptiveSampling] Starting adaptive sampling service...');
    this.isRunning = true;

    // 初始化默认采样配置
    await this.initializeDefaultConfigs();

    // 启动定期检查
    this.checkTimer = setInterval(async () => {
      if (!this.isRunning) return;
      await this.performCheck();
    }, this.CHECK_INTERVAL_MS);

    log.debug('[AdaptiveSampling] Started');
  }

  /**
   * 停止服务
   */
  async stop(): Promise<void> {
    log.debug('[AdaptiveSampling] Stopping...');
    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    log.debug('[AdaptiveSampling] Stopped');
  }

  /**
   * 初始化默认采样配置
   */
  private async initializeDefaultConfigs(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const existingConfigs = await db.select().from(deviceSamplingConfig);
      if (existingConfigs.length > 0) return;

      // 创建默认配置
      const defaultConfigs = [
        { nodeId: '*', sensorType: 'temperature', baseSamplingRateMs: 1000, minSamplingRateMs: 200, maxSamplingRateMs: 30000 },
        { nodeId: '*', sensorType: 'vibration', baseSamplingRateMs: 500, minSamplingRateMs: 100, maxSamplingRateMs: 10000 },
        { nodeId: '*', sensorType: 'pressure', baseSamplingRateMs: 2000, minSamplingRateMs: 500, maxSamplingRateMs: 60000 },
        { nodeId: '*', sensorType: 'humidity', baseSamplingRateMs: 5000, minSamplingRateMs: 1000, maxSamplingRateMs: 60000 },
        { nodeId: '*', sensorType: 'current', baseSamplingRateMs: 1000, minSamplingRateMs: 200, maxSamplingRateMs: 30000 },
      ];

      for (const config of defaultConfigs) {
        await db.insert(deviceSamplingConfig).values({
          ...config,
          currentSamplingRateMs: config.baseSamplingRateMs,
          adaptiveEnabled: true,
          priority: 'normal',
        });
      }

      log.debug('[AdaptiveSampling] Initialized default sampling configs');
    } catch (error) {
      log.warn('[AdaptiveSampling] Failed to initialize configs:', error);
    }
  }

  /**
   * 执行容量检查
   */
  private async performCheck(): Promise<void> {
    this.metrics.totalChecks++;

    try {
      // 1. 收集容量指标
      const status = await this.collectCapacityMetrics();
      this.metrics.lastCapacityStatus = status;

      // 2. 评估整体状态
      const overallStatus = this.evaluateStatus(status);
      this.metrics.currentOverallStatus = overallStatus;

      // 3. 记录容量指标
      await this.recordCapacityMetrics(status);

      // 4. 根据状态调整采样率
      if (overallStatus === 'critical') {
        this.consecutiveNormalChecks = 0;
        await this.scaleUpSamplingInterval('Critical capacity threshold exceeded');
      } else if (overallStatus === 'warning') {
        this.consecutiveNormalChecks = 0;
        await this.scaleUpSamplingInterval('Warning capacity threshold exceeded');
      } else {
        this.consecutiveNormalChecks++;
        // 连续多次正常后，尝试恢复采样率
        if (this.consecutiveNormalChecks >= this.RECOVERY_CHECK_COUNT) {
          await this.recoverSamplingInterval();
          this.consecutiveNormalChecks = 0;
        }
      }
    } catch (error) {
      log.warn('[AdaptiveSampling] Check failed:', error);
    }
  }

  /**
   * 收集容量指标
   */
  private async collectCapacityMetrics(): Promise<CapacityStatus> {
    // Kafka 消费者延迟
    let kafkaLag = 0;
    try {
      const kafkaStatus = kafkaClient.getConnectionStatus();
      if (kafkaStatus) {
        // 模拟获取 Kafka lag
        kafkaLag = Math.floor(Math.random() * 5000);
      }
    } catch {
      kafkaLag = 0;
    }

    // 内存使用率
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const memoryUsagePct = (memUsage.heapUsed / totalMem) * 100;
    // CPU 使用率（简化计算）
    const cpuUsage = os.loadavg()[0];
    const cpuCount = os.cpus().length;;
    const cpuUsagePct = (cpuUsage / cpuCount) * 100;

    return {
      kafkaLag,
      dbConnections: 0, // 需要从连接池获取
      memoryUsagePct: Math.round(memoryUsagePct * 100) / 100,
      cpuUsagePct: Math.round(cpuUsagePct * 100) / 100,
      queueDepth: kafkaLag,
    };
  }

  /**
   * 评估整体状态
   */
  private evaluateStatus(status: CapacityStatus): 'normal' | 'warning' | 'critical' {
    // 检查 Kafka 延迟
    if (status.kafkaLag > this.thresholds.kafkaLag.criticalThreshold) return 'critical';
    if (status.kafkaLag > this.thresholds.kafkaLag.warningThreshold) return 'warning';

    // 检查内存
    if (status.memoryUsagePct > this.thresholds.memoryUsage.criticalThreshold) return 'critical';
    if (status.memoryUsagePct > this.thresholds.memoryUsage.warningThreshold) return 'warning';

    // 检查 CPU
    if (status.cpuUsagePct > this.thresholds.cpuUsage.criticalThreshold) return 'critical';
    if (status.cpuUsagePct > this.thresholds.cpuUsage.warningThreshold) return 'warning';

    return 'normal';
  }

  /**
   * 记录容量指标到数据库
   */
  private async recordCapacityMetrics(status: CapacityStatus): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const metrics = [
        { metricType: 'kafka_lag' as const, componentName: 'kafka', currentValue: status.kafkaLag, threshold: this.thresholds.kafkaLag.warningThreshold },
        { metricType: 'memory_usage' as const, componentName: 'system', currentValue: status.memoryUsagePct, threshold: this.thresholds.memoryUsage.warningThreshold },
        { metricType: 'cpu_usage' as const, componentName: 'system', currentValue: status.cpuUsagePct, threshold: this.thresholds.cpuUsage.warningThreshold },
        { metricType: 'queue_depth' as const, componentName: 'kafka', currentValue: status.queueDepth, threshold: this.thresholds.kafkaLag.warningThreshold },
      ];

      for (const metric of metrics) {
        const metricStatus = metric.currentValue > metric.threshold ? 'warning' : 'normal';
        const metricId = `cap_${metric.metricType}_${Date.now()}`;

        await db.insert(systemCapacityMetrics).values({
          metricId,
          metricType: metric.metricType,
          componentName: metric.componentName,
          currentValue: metric.currentValue,
          threshold: metric.threshold,
          status: metricStatus,
          lastCheckedAt: new Date(),
        });
      }
    } catch (error) {
      // 静默处理，避免影响主流程
    }
  }

  /**
   * 扩大采样间隔（降低采样频率）
   */
  private async scaleUpSamplingInterval(reason: string): Promise<void> {
    // 检查冷却期
    if (this.lastAdjustmentTime) {
      const elapsed = Date.now() - this.lastAdjustmentTime.getTime();
      if (elapsed < this.COOLDOWN_MS) return;
    }

    const db = await getDb();
    if (!db) return;

    try {
      const configs = await db.select()
        .from(deviceSamplingConfig)
        .where(eq(deviceSamplingConfig.adaptiveEnabled, true));

      const adjustments: SamplingAdjustment[] = [];
      const scaleFactor = this.metrics.currentOverallStatus === 'critical' ? 2 : 1.5;

      for (const config of configs) {
        const newRate = Math.min(
          Math.round(config.currentSamplingRateMs * scaleFactor),
          config.maxSamplingRateMs
        );

        if (newRate !== config.currentSamplingRateMs) {
          await db.update(deviceSamplingConfig)
            .set({
              currentSamplingRateMs: newRate,
              lastAdjustedAt: new Date(),
              adjustmentReason: reason,
            })
            .where(eq(deviceSamplingConfig.id, config.id));

          adjustments.push({
            nodeId: config.nodeId,
            sensorType: config.sensorType,
            previousRateMs: config.currentSamplingRateMs,
            newRateMs: newRate,
            reason,
          });

          // 更新 Redis 缓存
          await redisClient.set(
            `sampling:${config.nodeId}:${config.sensorType}`,
            newRate,
            300
          );
        }
      }

      if (adjustments.length > 0) {
        this.metrics.adjustmentsMade += adjustments.length;
        this.metrics.lastAdjustments = adjustments;
        this.lastAdjustmentTime = new Date();
        log.debug(`[AdaptiveSampling] Scaled up ${adjustments.length} sampling intervals (${reason})`);
      }
    } catch (error) {
      log.warn('[AdaptiveSampling] Scale up failed:', error);
    }
  }

  /**
   * 恢复采样间隔
   */
  private async recoverSamplingInterval(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      const configs = await db.select()
        .from(deviceSamplingConfig)
        .where(eq(deviceSamplingConfig.adaptiveEnabled, true));

      const adjustments: SamplingAdjustment[] = [];

      for (const config of configs) {
        if (config.currentSamplingRateMs > config.baseSamplingRateMs) {
          // 逐步恢复，每次恢复 25%
          const newRate = Math.max(
            Math.round(config.currentSamplingRateMs * 0.75),
            config.baseSamplingRateMs
          );

          if (newRate !== config.currentSamplingRateMs) {
            await db.update(deviceSamplingConfig)
              .set({
                currentSamplingRateMs: newRate,
                lastAdjustedAt: new Date(),
                adjustmentReason: 'System capacity recovered',
              })
              .where(eq(deviceSamplingConfig.id, config.id));

            adjustments.push({
              nodeId: config.nodeId,
              sensorType: config.sensorType,
              previousRateMs: config.currentSamplingRateMs,
              newRateMs: newRate,
              reason: 'System capacity recovered',
            });

            await redisClient.set(
              `sampling:${config.nodeId}:${config.sensorType}`,
              newRate,
              300
            );
          }
        }
      }

      if (adjustments.length > 0) {
        this.metrics.adjustmentsMade += adjustments.length;
        this.metrics.lastAdjustments = adjustments;
        this.lastAdjustmentTime = new Date();
        log.debug(`[AdaptiveSampling] Recovered ${adjustments.length} sampling intervals`);
      }
    } catch (error) {
      log.warn('[AdaptiveSampling] Recovery failed:', error);
    }
  }

  /**
   * 获取指标
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      consecutiveNormalChecks: this.consecutiveNormalChecks,
      lastAdjustmentTime: this.lastAdjustmentTime,
    };
  }

  /**
   * 获取当前采样配置
   */
  async getSamplingConfigs() {
    const db = await getDb();
    if (!db) return [];

    return await db.select().from(deviceSamplingConfig);
  }

  /**
   * 更新阈值配置
   */
  updateThresholds(key: string, config: Partial<ThresholdConfig>): void {
    if (this.thresholds[key]) {
      this.thresholds[key] = { ...this.thresholds[key], ...config };
    }
  }

  /**
   * 获取阈值配置
   */
  getThresholds() {
    return { ...this.thresholds };
  }
}

// 导出单例
export const adaptiveSamplingService = new AdaptiveSamplingService();
