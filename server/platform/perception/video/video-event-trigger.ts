/**
 * ============================================================================
 * 视频事件触发器 — 异常事件驱动的视频采集与分析
 * ============================================================================
 *
 * 核心逻辑：
 *   1. 订阅 EventBus 的异常事件（感知层/认知层/护栏层）
 *   2. 查询 camera-device-mapping 确定关联摄像头
 *   3. 调用 hikvision.adapter 获取视频片段/快照
 *   4. 存储片段到 MinIO（按设备/日期/事件组织）
 *   5. 触发视觉分析管线（visual.extractor）
 *
 * 数据流：
 *
 *   EventBus (anomaly_detected / threshold_exceeded / ...)
 *     → VideoEventTrigger.onEvent()
 *       → CameraDeviceMappingRegistry.findCamerasByComponent()
 *         → HikvisionAdapter.captureSnapshot() + .searchClip()
 *           → MinIO 存储
 *             → EventBus (video_clip_ready) → 视觉分析
 *
 * 防抖与限流：
 *   - 同一设备 5 分钟内不重复触发
 *   - 全局并发限制（默认 3 路同时采集）
 *   - 高优先级事件可跳过防抖
 *
 * 存储路径规范：
 *   video-events/{deviceId}/{YYYY-MM-DD}/{eventId}/
 *     ├── snapshot.jpg        — 事件快照
 *     ├── clip_pre.mp4        — 事件前片段
 *     ├── clip_post.mp4       — 事件后片段
 *     └── metadata.json       — 事件元数据
 */

import { createModuleLogger } from '../../../core/logger';
import type { CameraDeviceMappingRegistry, CameraDefinition, CapturePreset, CameraDeviceMapping } from './camera-device-mapping';
import type { HikvisionAdapter, SnapshotResult, ClipResult } from '../../../services/protocol-adapters/hikvision.adapter';

const log = createModuleLogger('video-event-trigger');

// ============================================================================
// 类型定义
// ============================================================================

/** 触发事件（从 EventBus 接收） */
export interface TriggerEvent {
  /** 事件 ID */
  eventId: string;
  /** 事件类型 */
  eventType: VideoTriggerEventType;
  /** 关联的设备编码（4 段式） */
  componentCode: string;
  /** 关联的传感器 ID（可选） */
  sensorId?: string;
  /** 事件严重度 */
  severity: 'info' | 'warning' | 'critical';
  /** 事件时间 (Unix ms) */
  timestamp: number;
  /** 事件描述 */
  message: string;
  /** 附加数据（如异常值、阈值等） */
  data?: Record<string, unknown>;
}

/** 可触发视频采集的事件类型 */
export type VideoTriggerEventType =
  | 'anomaly_detected'       // 异常检测（来自 anomalyEngine）
  | 'threshold_exceeded'     // 阈值超限（来自 guardrail）
  | 'condition_change'       // 工况突变（来自 conditionNormalizer）
  | 'diagnosis_alert'        // 诊断告警（来自认知层）
  | 'equipment_alarm'        // 设备报警（来自 PLC/SCADA）
  | 'manual_capture';        // 手动触发

/** 视频采集任务 */
export interface CaptureTask {
  /** 任务 ID */
  taskId: string;
  /** 触发事件 */
  event: TriggerEvent;
  /** 目标摄像头 */
  camera: CameraDefinition;
  /** 摄像头映射信息 */
  mapping: CameraDeviceMapping;
  /** 抓拍预设 */
  preset: CapturePreset;
  /** 任务状态 */
  status: CaptureTaskStatus;
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt?: number;
  /** 结果 */
  result?: CaptureTaskResult;
  /** 错误信息 */
  error?: string;
}

export type CaptureTaskStatus = 'pending' | 'capturing' | 'uploading' | 'completed' | 'failed';

/** 采集结果 */
export interface CaptureTaskResult {
  /** 快照 MinIO 路径 */
  snapshotPath?: string;
  /** 视频片段 MinIO 路径 */
  clipPath?: string;
  /** 快照信息 */
  snapshot?: SnapshotResult;
  /** 片段信息 */
  clip?: ClipResult;
  /** MinIO bucket */
  bucket: string;
}

/** 触发器配置 */
export interface VideoEventTriggerConfig {
  /** 防抖时间窗口 (ms)，同一设备在此时间内不重复触发 */
  debounceWindowMs: number;
  /** 全局最大并发采集数 */
  maxConcurrentCaptures: number;
  /** 高优先级事件类型（可跳过防抖） */
  highPriorityEvents: VideoTriggerEventType[];
  /** MinIO bucket 名称 */
  minioBucket: string;
  /** MinIO 路径前缀 */
  minioPrefix: string;
  /** 是否同时触发视觉分析 */
  triggerVisualAnalysis: boolean;
  /** 严重度过滤：只处理 >= 此级别的事件 */
  minSeverity: 'info' | 'warning' | 'critical';
  /** 是否启用 */
  enabled: boolean;
}

/** 触发器统计 */
export interface TriggerStats {
  /** 总接收事件数 */
  totalEventsReceived: number;
  /** 触发的采集任务数 */
  totalTasksCreated: number;
  /** 成功完成的任务数 */
  totalTasksCompleted: number;
  /** 失败的任务数 */
  totalTasksFailed: number;
  /** 被防抖跳过的事件数 */
  totalDebounced: number;
  /** 因无摄像头映射跳过的事件数 */
  totalNoCamera: number;
  /** 当前活跃采集数 */
  activeCaptureCount: number;
  /** 任务队列长度 */
  pendingQueueLength: number;
}

// ============================================================================
// MinIO 存储接口（最小化依赖）
// ============================================================================

/** MinIO 客户端接口（仅依赖所需方法） */
export interface MinioClient {
  putObject(bucket: string, key: string, data: Buffer | ArrayBuffer, size: number, metadata?: Record<string, string>): Promise<void>;
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
}

/** EventBus 接口（最小化依赖） */
export interface EventBusInterface {
  emit(event: string, data: unknown): void;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: VideoEventTriggerConfig = {
  debounceWindowMs: 5 * 60 * 1000, // 5 分钟
  maxConcurrentCaptures: 3,
  highPriorityEvents: ['equipment_alarm', 'manual_capture'],
  minioBucket: 'video-events',
  minioPrefix: '',
  triggerVisualAnalysis: true,
  minSeverity: 'warning',
  enabled: true,
};

const SEVERITY_ORDER: Record<string, number> = { info: 0, warning: 1, critical: 2 };

// ============================================================================
// 视频事件触发器
// ============================================================================

export class VideoEventTrigger {
  private readonly config: VideoEventTriggerConfig;
  private readonly cameraRegistry: CameraDeviceMappingRegistry;
  private readonly hikvisionAdapter: HikvisionAdapter;
  private readonly minio: MinioClient | null;
  private readonly eventBus: EventBusInterface | null;

  /** 防抖记录：componentCode → 最后触发时间 */
  private debounceMap: Map<string, number> = new Map();
  /** 活跃采集任务 */
  private activeTasks: Map<string, CaptureTask> = new Map();
  /** 待执行队列 */
  private pendingQueue: CaptureTask[] = [];
  /** 任务历史（最近 100 条） */
  private taskHistory: CaptureTask[] = [];
  /** 统计 */
  private stats: TriggerStats = {
    totalEventsReceived: 0,
    totalTasksCreated: 0,
    totalTasksCompleted: 0,
    totalTasksFailed: 0,
    totalDebounced: 0,
    totalNoCamera: 0,
    activeCaptureCount: 0,
    pendingQueueLength: 0,
  };

  private taskIdCounter = 0;
  private bucketEnsured = false;

  constructor(
    cameraRegistry: CameraDeviceMappingRegistry,
    hikvisionAdapter: HikvisionAdapter,
    minio: MinioClient | null = null,
    eventBus: EventBusInterface | null = null,
    config?: Partial<VideoEventTriggerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cameraRegistry = cameraRegistry;
    this.hikvisionAdapter = hikvisionAdapter;
    this.minio = minio;
    this.eventBus = eventBus;

    log.info({
      debounceMs: this.config.debounceWindowMs,
      maxConcurrent: this.config.maxConcurrentCaptures,
      bucket: this.config.minioBucket,
    }, '视频事件触发器初始化');
  }

  // --------------------------------------------------------------------------
  // EventBus 订阅
  // --------------------------------------------------------------------------

  /**
   * 启动：订阅 EventBus 事件
   */
  start(): void {
    if (!this.config.enabled) {
      log.info('视频事件触发器已禁用');
      return;
    }

    if (this.eventBus) {
      const eventTypes: VideoTriggerEventType[] = [
        'anomaly_detected', 'threshold_exceeded', 'condition_change',
        'diagnosis_alert', 'equipment_alarm', 'manual_capture',
      ];
      for (const evtType of eventTypes) {
        this.eventBus.on(evtType, (data) => {
          this.onEvent(data as TriggerEvent).catch(err => {
            log.error({ err, eventType: evtType }, '处理事件失败');
          });
        });
      }
      log.info({ events: eventTypes }, 'EventBus 订阅已启动');
    }
  }

  /**
   * 停止：清理订阅和活跃任务
   */
  async stop(): Promise<void> {
    this.config.enabled = false;
    this.pendingQueue.length = 0;
    // 等待活跃任务完成（最多 30 秒）
    const deadline = Date.now() + 30000;
    while (this.activeTasks.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }
    log.info('视频事件触发器已停止');
  }

  // --------------------------------------------------------------------------
  // 事件处理（核心逻辑）
  // --------------------------------------------------------------------------

  /**
   * 处理一个触发事件
   *
   * 可由 EventBus 回调触发，也可手动调用。
   */
  async onEvent(event: TriggerEvent): Promise<CaptureTask | null> {
    this.stats.totalEventsReceived++;

    if (!this.config.enabled) return null;

    // 严重度过滤
    if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return null;
    }

    // 防抖检查
    const isHighPriority = this.config.highPriorityEvents.includes(event.eventType);
    if (!isHighPriority && this.isDebounced(event.componentCode)) {
      this.stats.totalDebounced++;
      log.debug({ componentCode: event.componentCode, eventId: event.eventId }, '防抖跳过');
      return null;
    }

    // 查找关联摄像头
    let lookup = this.cameraRegistry.findCamerasByComponent(event.componentCode);

    // 如果按组件编码找不到，尝试按传感器查找
    if (lookup.cameras.length === 0 && event.sensorId) {
      lookup = this.cameraRegistry.findCamerasBySensor(event.sensorId);
    }

    if (lookup.cameras.length === 0) {
      this.stats.totalNoCamera++;
      log.debug({ componentCode: event.componentCode }, '无摄像头映射');
      return null;
    }

    // 选择最佳摄像头
    const best = lookup.cameras[0];
    const preset = best.mapping.capturePreset ?? {
      preBufferSec: 10,
      postBufferSec: 30,
      streamType: best.preferredStream,
      captureSnapshot: true,
    };

    // 创建采集任务
    const task: CaptureTask = {
      taskId: `vt_${++this.taskIdCounter}_${Date.now()}`,
      event,
      camera: best,
      mapping: best.mapping,
      preset,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.stats.totalTasksCreated++;
    this.recordDebounce(event.componentCode);

    // 加入队列或立即执行
    if (this.activeTasks.size < this.config.maxConcurrentCaptures) {
      this.executeTask(task);
    } else {
      this.pendingQueue.push(task);
      this.stats.pendingQueueLength = this.pendingQueue.length;
      log.info({ taskId: task.taskId, queueLength: this.pendingQueue.length }, '任务入队等待');
    }

    return task;
  }

  // --------------------------------------------------------------------------
  // 任务执行
  // --------------------------------------------------------------------------

  private async executeTask(task: CaptureTask): Promise<void> {
    task.status = 'capturing';
    this.activeTasks.set(task.taskId, task);
    this.stats.activeCaptureCount = this.activeTasks.size;

    const { camera, preset, event } = task;

    log.info({
      taskId: task.taskId,
      eventId: event.eventId,
      cameraId: camera.cameraId,
      componentCode: event.componentCode,
    }, '开始视频采集');

    try {
      // 获取摄像头连接参数（从 connector 获取）
      const connParams = this.getConnectorParams(camera.connectorId);
      const authParams = this.getConnectorAuth(camera.connectorId);

      let snapshot: SnapshotResult | undefined;
      let clip: ClipResult | null | undefined;

      // 1. 抓拍快照
      if (preset.captureSnapshot) {
        try {
          snapshot = await this.hikvisionAdapter.captureSnapshot(connParams, authParams, camera.channelId);
        } catch (err) {
          log.warn({ err, taskId: task.taskId }, '快照抓拍失败，继续片段采集');
        }
      }

      // 2. 搜索视频片段
      const eventTime = new Date(event.timestamp);
      const clipStart = new Date(eventTime.getTime() - preset.preBufferSec * 1000);
      const clipEnd = new Date(eventTime.getTime() + preset.postBufferSec * 1000);

      try {
        clip = await this.hikvisionAdapter.searchClip(connParams, authParams, {
          channelId: camera.channelId,
          startTime: clipStart.toISOString(),
          endTime: clipEnd.toISOString(),
          streamType: preset.streamType,
        });
      } catch (err) {
        log.warn({ err, taskId: task.taskId }, '录像搜索失败');
      }

      // 3. 上传到 MinIO
      task.status = 'uploading';
      const basePath = this.buildStoragePath(event);

      if (this.minio) {
        await this.ensureBucket();

        if (snapshot) {
          const snapshotKey = `${basePath}/snapshot.jpg`;
          const snapshotBuf = Buffer.from(snapshot.base64Jpeg, 'base64');
          await this.minio.putObject(
            this.config.minioBucket,
            snapshotKey,
            snapshotBuf,
            snapshotBuf.length,
            { 'Content-Type': 'image/jpeg', 'x-event-id': event.eventId },
          );

          task.result = {
            ...(task.result ?? { bucket: this.config.minioBucket }),
            snapshotPath: snapshotKey,
            snapshot,
            bucket: this.config.minioBucket,
          };
        }

        if (clip) {
          // 下载片段并上传
          try {
            const clipData = await this.hikvisionAdapter.downloadClip(connParams, authParams, clip.downloadUrl);
            const clipKey = `${basePath}/clip.mp4`;
            await this.minio.putObject(
              this.config.minioBucket,
              clipKey,
              clipData,
              clipData.byteLength,
              { 'Content-Type': 'video/mp4', 'x-event-id': event.eventId },
            );
            task.result = {
              ...(task.result ?? { bucket: this.config.minioBucket }),
              clipPath: clipKey,
              clip,
              bucket: this.config.minioBucket,
            };
          } catch (err) {
            log.warn({ err, taskId: task.taskId }, '片段下载或上传失败');
          }
        }

        // 保存元数据
        const metadataKey = `${basePath}/metadata.json`;
        const metadata = Buffer.from(JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          componentCode: event.componentCode,
          sensorId: event.sensorId,
          severity: event.severity,
          message: event.message,
          timestamp: event.timestamp,
          cameraId: camera.cameraId,
          cameraName: camera.name,
          capturedAt: new Date().toISOString(),
          snapshotPath: task.result?.snapshotPath,
          clipPath: task.result?.clipPath,
        }, null, 2));

        await this.minio.putObject(
          this.config.minioBucket,
          metadataKey,
          metadata,
          metadata.length,
          { 'Content-Type': 'application/json' },
        );
      }

      // 4. 标记完成
      task.status = 'completed';
      task.completedAt = Date.now();
      this.stats.totalTasksCompleted++;

      log.info({
        taskId: task.taskId,
        durationMs: task.completedAt - task.createdAt,
        hasSnapshot: !!snapshot,
        hasClip: !!clip,
      }, '视频采集完成');

      // 5. 触发视觉分析
      if (this.config.triggerVisualAnalysis && this.eventBus && task.result) {
        this.eventBus.emit('video_clip_ready', {
          taskId: task.taskId,
          eventId: event.eventId,
          componentCode: event.componentCode,
          snapshotPath: task.result.snapshotPath,
          clipPath: task.result.clipPath,
          bucket: task.result.bucket,
          cameraId: camera.cameraId,
          timestamp: event.timestamp,
        });
      }
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      task.completedAt = Date.now();
      this.stats.totalTasksFailed++;
      log.error({ err, taskId: task.taskId }, '视频采集失败');
    } finally {
      this.activeTasks.delete(task.taskId);
      this.stats.activeCaptureCount = this.activeTasks.size;

      // 记录历史
      this.taskHistory.push(task);
      if (this.taskHistory.length > 100) this.taskHistory.shift();

      // 处理队列中的下一个任务
      this.processNextInQueue();
    }
  }

  private processNextInQueue(): void {
    if (this.pendingQueue.length === 0) return;
    if (this.activeTasks.size >= this.config.maxConcurrentCaptures) return;

    const next = this.pendingQueue.shift()!;
    this.stats.pendingQueueLength = this.pendingQueue.length;
    this.executeTask(next);
  }

  // --------------------------------------------------------------------------
  // 防抖
  // --------------------------------------------------------------------------

  private isDebounced(componentCode: string): boolean {
    const last = this.debounceMap.get(componentCode);
    if (!last) return false;
    return Date.now() - last < this.config.debounceWindowMs;
  }

  private recordDebounce(componentCode: string): void {
    this.debounceMap.set(componentCode, Date.now());
    // 定期清理过期条目
    if (this.debounceMap.size > 1000) {
      const now = Date.now();
      for (const [key, time] of this.debounceMap.entries()) {
        if (now - time > this.config.debounceWindowMs * 2) {
          this.debounceMap.delete(key);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 存储路径
  // --------------------------------------------------------------------------

  private buildStoragePath(event: TriggerEvent): string {
    const date = new Date(event.timestamp);
    const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
    const deviceId = event.componentCode.split('.').slice(0, 2).join('-');
    const prefix = this.config.minioPrefix ? `${this.config.minioPrefix}/` : '';
    return `${prefix}video-events/${deviceId}/${dateStr}/${event.eventId}`;
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured || !this.minio) return;
    try {
      const exists = await this.minio.bucketExists(this.config.minioBucket);
      if (!exists) {
        await this.minio.makeBucket(this.config.minioBucket);
        log.info({ bucket: this.config.minioBucket }, 'MinIO bucket 已创建');
      }
      this.bucketEnsured = true;
    } catch (err) {
      log.warn({ err }, 'MinIO bucket 检查失败，继续尝试写入');
    }
  }

  // --------------------------------------------------------------------------
  // Connector 参数获取（轻量代理，不直接依赖 access-layer）
  // --------------------------------------------------------------------------

  /** 连接参数缓存 */
  private connectorParamsCache: Map<string, Record<string, unknown>> = new Map();
  private connectorAuthCache: Map<string, Record<string, unknown>> = new Map();

  /** 设置连接器参数（由上层初始化时注入） */
  setConnectorParams(connectorId: string, params: Record<string, unknown>, auth: Record<string, unknown>): void {
    this.connectorParamsCache.set(connectorId, params);
    this.connectorAuthCache.set(connectorId, auth);
  }

  private getConnectorParams(connectorId: string): Record<string, unknown> {
    return this.connectorParamsCache.get(connectorId) ?? {};
  }

  private getConnectorAuth(connectorId: string): Record<string, unknown> {
    return this.connectorAuthCache.get(connectorId) ?? {};
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /** 获取统计信息 */
  getStats(): TriggerStats {
    return { ...this.stats };
  }

  /** 获取任务历史 */
  getTaskHistory(limit = 20): CaptureTask[] {
    return this.taskHistory.slice(-limit);
  }

  /** 获取活跃任务 */
  getActiveTasks(): CaptureTask[] {
    return [...this.activeTasks.values()];
  }

  /** 获取当前配置 */
  getConfig(): Readonly<VideoEventTriggerConfig> {
    return this.config;
  }

  /** 更新配置 */
  updateConfig(partial: Partial<VideoEventTriggerConfig>): void {
    Object.assign(this.config, partial);
    log.info({ config: partial }, '视频触发器配置已更新');
  }
}
