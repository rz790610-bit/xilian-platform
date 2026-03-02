/**
 * ============================================================================
 * 视觉分析消费者 — video_clip_ready 事件 → VisualExtractor 特征提取
 * ============================================================================
 *
 * 数据流：
 *   video-event-trigger 完成视频采集后
 *     → EventBus.emit('video_clip_ready', { snapshotPath, clipPath, ... })
 *       → VisualAnalysisConsumer.onVideoClipReady()
 *         → MinIO 下载快照/片段
 *           → VisualExtractor.extract() 热成像/缺陷检测
 *             → EventBus.emit('visual.features.ready', { features, ... })
 *
 * 降级策略：
 *   - MinIO 不可用 → 跳过视觉分析，记录 warn
 *   - VisualExtractor 推理服务不可用 → 降级为仅热成像统计
 *   - 快照/片段都不存在 → 跳过
 *
 * 并发控制：
 *   - 最大并行分析数（默认 2，避免 GPU 争抢）
 *   - 超出限制的任务入队等待
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('visual-analysis-consumer');

// ============================================================================
// 类型定义
// ============================================================================

/** video_clip_ready 事件负载（来自 video-event-trigger.ts） */
export interface VideoClipReadyEvent {
  /** 采集任务 ID */
  taskId: string;
  /** 关联事件 ID */
  eventId: string;
  /** 设备编码 */
  componentCode: string;
  /** 快照 MinIO 路径 */
  snapshotPath?: string;
  /** 视频片段 MinIO 路径 */
  clipPath?: string;
  /** MinIO bucket */
  bucket: string;
  /** 摄像头 ID */
  cameraId: string;
  /** 事件时间 */
  timestamp: number;
}

/** 视觉分析结果 */
export interface VisualAnalysisResult {
  /** 采集任务 ID */
  taskId: string;
  /** 关联事件 ID */
  eventId: string;
  /** 设备编码 */
  componentCode: string;
  /** 快照分析特征 */
  snapshotFeatures: Record<string, number | string | boolean> | null;
  /** 分析状态 */
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  /** 错误信息 */
  error?: string;
  /** 处理耗时 (ms) */
  durationMs: number;
  /** 分析时间 */
  analyzedAt: number;
}

/** 消费者配置 */
export interface VisualAnalysisConsumerConfig {
  /** 最大并行分析数 */
  maxConcurrent: number;
  /** 分析超时 (ms) */
  analysisTimeoutMs: number;
  /** 是否启用 */
  enabled: boolean;
  /** 最大队列长度（超出则丢弃最早的） */
  maxQueueLength: number;
}

/** 消费者统计 */
export interface VisualAnalysisStats {
  /** 总接收事件数 */
  totalReceived: number;
  /** 成功分析数 */
  totalCompleted: number;
  /** 部分成功（降级） */
  totalPartial: number;
  /** 失败数 */
  totalFailed: number;
  /** 跳过数 */
  totalSkipped: number;
  /** 当前活跃分析数 */
  activeCount: number;
  /** 队列长度 */
  queueLength: number;
}

/** EventBus 接口 */
export interface EventBusInterface {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
}

/** MinIO 客户端接口 */
export interface MinioClientInterface {
  getObject(bucket: string, key: string): Promise<Buffer>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: VisualAnalysisConsumerConfig = {
  maxConcurrent: 2,
  analysisTimeoutMs: 30000,
  enabled: true,
  maxQueueLength: 50,
};

// ============================================================================
// 视觉分析消费者
// ============================================================================

export class VisualAnalysisConsumer {
  private readonly config: VisualAnalysisConsumerConfig;
  private readonly eventBus: EventBusInterface | null;
  private readonly minio: MinioClientInterface | null;

  /** VisualExtractor 懒加载 */
  private extractorRegistry: { process: (raw: import('../../../services/feature-extraction/types').RawTelemetryMessage) => Promise<{ features: Record<string, number | string | boolean> } | null> } | null = null;
  private extractorLoading: Promise<void> | null = null;

  /** 活跃分析任务 */
  private activeAnalyses: Map<string, Promise<VisualAnalysisResult>> = new Map();
  /** 等待队列 */
  private queue: VideoClipReadyEvent[] = [];
  /** 结果历史 */
  private history: VisualAnalysisResult[] = [];

  private stats: VisualAnalysisStats = {
    totalReceived: 0,
    totalCompleted: 0,
    totalPartial: 0,
    totalFailed: 0,
    totalSkipped: 0,
    activeCount: 0,
    queueLength: 0,
  };

  /** 结果回调 */
  private onAnalysisComplete?: (result: VisualAnalysisResult) => void;

  constructor(
    eventBus: EventBusInterface | null = null,
    minio: MinioClientInterface | null = null,
    config?: Partial<VisualAnalysisConsumerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = eventBus;
    this.minio = minio;

    log.info({
      maxConcurrent: this.config.maxConcurrent,
      timeoutMs: this.config.analysisTimeoutMs,
    }, '视觉分析消费者初始化');
  }

  // --------------------------------------------------------------------------
  // 生命周期
  // --------------------------------------------------------------------------

  /** 启动：订阅 EventBus */
  start(): void {
    if (!this.config.enabled) {
      log.info('视觉分析消费者已禁用');
      return;
    }

    if (this.eventBus) {
      this.eventBus.on('video_clip_ready', (data) => {
        this.onVideoClipReady(data as VideoClipReadyEvent).catch(err => {
          log.error({ err }, '处理 video_clip_ready 事件失败');
        });
      });
      log.info('已订阅 video_clip_ready 事件');
    }
  }

  /** 停止 */
  stop(): void {
    this.config.enabled = false;
    this.queue.length = 0;
    log.info('视觉分析消费者已停止');
  }

  // --------------------------------------------------------------------------
  // 事件处理
  // --------------------------------------------------------------------------

  /**
   * 处理 video_clip_ready 事件
   */
  async onVideoClipReady(event: VideoClipReadyEvent): Promise<VisualAnalysisResult> {
    this.stats.totalReceived++;

    if (!this.config.enabled) {
      this.stats.totalSkipped++;
      return this.buildSkippedResult(event, 'consumer disabled');
    }

    // 没有快照也没有片段 → 跳过
    if (!event.snapshotPath && !event.clipPath) {
      this.stats.totalSkipped++;
      return this.buildSkippedResult(event, 'no snapshot or clip available');
    }

    // 检查并发
    if (this.activeAnalyses.size >= this.config.maxConcurrent) {
      // 入队
      if (this.queue.length >= this.config.maxQueueLength) {
        this.queue.shift(); // 丢弃最早的
      }
      this.queue.push(event);
      this.stats.queueLength = this.queue.length;
      log.debug({ taskId: event.taskId, queueLen: this.queue.length }, '分析任务入队');
      return this.buildSkippedResult(event, 'queued');
    }

    return this.executeAnalysis(event);
  }

  // --------------------------------------------------------------------------
  // 分析执行
  // --------------------------------------------------------------------------

  private async executeAnalysis(event: VideoClipReadyEvent): Promise<VisualAnalysisResult> {
    const startTime = Date.now();
    const analysisPromise = this.doAnalysis(event, startTime);

    this.activeAnalyses.set(event.taskId, analysisPromise);
    this.stats.activeCount = this.activeAnalyses.size;

    try {
      const result = await analysisPromise;
      return result;
    } finally {
      this.activeAnalyses.delete(event.taskId);
      this.stats.activeCount = this.activeAnalyses.size;

      // 处理队列中的下一个
      this.processNextInQueue();
    }
  }

  private async doAnalysis(event: VideoClipReadyEvent, startTime: number): Promise<VisualAnalysisResult> {
    try {
      // 加载 ExtractorRegistry
      await this.ensureExtractor();

      let snapshotFeatures: Record<string, number | string | boolean> | null = null;

      // 分析快照
      if (event.snapshotPath && this.minio) {
        try {
          const snapshotData = await this.downloadWithTimeout(event.bucket, event.snapshotPath);

          // 构造 RawTelemetryMessage 格式
          const raw = {
            device_code: event.componentCode.split('.')[0] || 'unknown',
            mp_code: event.cameraId,
            gateway_id: 'video-perception',
            data_type: 'visual',
            value: 0,
            timestamp: event.timestamp,
            metadata: {
              media_ref: `minio://${event.bucket}/${event.snapshotPath}`,
              snapshot_size: snapshotData.length,
              event_id: event.eventId,
              component_code: event.componentCode,
              camera_id: event.cameraId,
            },
          };

          const extractResult = await this.extractorRegistry!.process(raw as import('../../../services/feature-extraction/types').RawTelemetryMessage);

          if (extractResult) {
            snapshotFeatures = {
              ...extractResult.features,
              source_path: event.snapshotPath,
              source_bucket: event.bucket,
            };
          }
        } catch (err) {
          log.warn({ err, path: event.snapshotPath }, '快照分析失败，降级');
        }
      }

      const durationMs = Date.now() - startTime;

      // 确定状态
      let status: VisualAnalysisResult['status'];
      if (snapshotFeatures && Object.keys(snapshotFeatures).length > 2) {
        status = 'completed';
        this.stats.totalCompleted++;
      } else if (snapshotFeatures) {
        status = 'partial';
        this.stats.totalPartial++;
      } else {
        status = 'failed';
        this.stats.totalFailed++;
      }

      const result: VisualAnalysisResult = {
        taskId: event.taskId,
        eventId: event.eventId,
        componentCode: event.componentCode,
        snapshotFeatures,
        status,
        durationMs,
        analyzedAt: Date.now(),
      };

      // 记录历史
      this.history.push(result);
      if (this.history.length > 100) this.history.shift();

      // 回调
      this.onAnalysisComplete?.(result);

      // 通过 EventBus 发布结果
      if (this.eventBus && (status === 'completed' || status === 'partial')) {
        this.eventBus.emit('visual.features.ready', {
          taskId: event.taskId,
          eventId: event.eventId,
          componentCode: event.componentCode,
          features: snapshotFeatures,
          status,
          analyzedAt: Date.now(),
        });
      }

      log.info({
        taskId: event.taskId,
        status,
        featureCount: snapshotFeatures ? Object.keys(snapshotFeatures).length : 0,
        ms: durationMs,
      }, '视觉分析完成');

      return result;
    } catch (err) {
      this.stats.totalFailed++;
      const result: VisualAnalysisResult = {
        taskId: event.taskId,
        eventId: event.eventId,
        componentCode: event.componentCode,
        snapshotFeatures: null,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
        analyzedAt: Date.now(),
      };

      this.history.push(result);
      if (this.history.length > 100) this.history.shift();

      log.error({ err, taskId: event.taskId }, '视觉分析失败');
      return result;
    }
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  private async downloadWithTimeout(bucket: string, key: string): Promise<Buffer> {
    if (!this.minio) {
      throw new Error('MinIO client not available');
    }

    return new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`MinIO download timeout: ${key}`));
      }, this.config.analysisTimeoutMs);

      this.minio!.getObject(bucket, key)
        .then(data => {
          clearTimeout(timeout);
          resolve(data);
        })
        .catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  private async ensureExtractor(): Promise<void> {
    if (this.extractorRegistry) return;
    if (this.extractorLoading) {
      await this.extractorLoading;
      return;
    }
    this.extractorLoading = (async () => {
      const mod = await import('../../../services/feature-extraction/extractor-registry');
      this.extractorRegistry = mod.extractorRegistry;
    })();
    await this.extractorLoading;
  }

  private processNextInQueue(): void {
    if (this.queue.length === 0) return;
    if (this.activeAnalyses.size >= this.config.maxConcurrent) return;

    const next = this.queue.shift()!;
    this.stats.queueLength = this.queue.length;
    this.executeAnalysis(next);
  }

  private buildSkippedResult(event: VideoClipReadyEvent, reason: string): VisualAnalysisResult {
    return {
      taskId: event.taskId,
      eventId: event.eventId,
      componentCode: event.componentCode,
      snapshotFeatures: null,
      status: 'skipped',
      error: reason,
      durationMs: 0,
      analyzedAt: Date.now(),
    };
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /** 获取统计 */
  getStats(): VisualAnalysisStats {
    return { ...this.stats };
  }

  /** 获取分析历史 */
  getHistory(limit = 20): VisualAnalysisResult[] {
    return this.history.slice(-limit);
  }

  /** 设置回调 */
  setOnAnalysisComplete(callback: (result: VisualAnalysisResult) => void): void {
    this.onAnalysisComplete = callback;
  }

  /** 获取当前配置 */
  getConfig(): Readonly<VisualAnalysisConsumerConfig> {
    return this.config;
  }
}

// ============================================================================
// 单例 + 工厂函数
// ============================================================================

let _instance: VisualAnalysisConsumer | null = null;

/** 获取全局视觉分析消费者单例 */
export function getVisualAnalysisConsumer(
  eventBus?: EventBusInterface | null,
  minio?: MinioClientInterface | null,
  config?: Partial<VisualAnalysisConsumerConfig>,
): VisualAnalysisConsumer {
  if (!_instance) {
    _instance = new VisualAnalysisConsumer(eventBus, minio, config);
  }
  return _instance;
}

/** 重置单例（用于测试） */
export function resetVisualAnalysisConsumer(): void {
  if (_instance) {
    _instance.stop();
  }
  _instance = null;
}
