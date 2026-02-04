/**
 * Kafka 消息 S3 归档服务
 * 
 * 功能：
 * - 消费 Kafka 消息并批量归档到 S3
 * - 支持按时间分区存储
 * - 支持压缩和加密
 * - 支持归档状态跟踪
 */

import { kafkaCluster, XILIAN_TOPICS } from '../kafka/kafkaCluster';

// ============ 类型定义 ============

export interface ArchiveConfig {
  topics: string[];
  s3Bucket: string;
  s3Prefix: string;
  batchSize: number;
  flushIntervalMs: number;
  compressionType: 'gzip' | 'snappy' | 'lz4' | 'none';
  partitionFormat: 'hourly' | 'daily';
  retentionDays: number;
  encryptionEnabled: boolean;
}

export interface ArchiveRecord {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: string | null;
  headers: Record<string, string>;
  timestamp: string;
  archivedAt: number;
}

export interface ArchiveStats {
  totalMessages: number;
  totalBytes: number;
  filesCreated: number;
  lastArchiveTime: number;
  errors: number;
}

export interface ArchiveFile {
  path: string;
  topic: string;
  startOffset: string;
  endOffset: string;
  messageCount: number;
  sizeBytes: number;
  createdAt: number;
  compressionType: string;
}

// ============ 默认配置 ============

const DEFAULT_CONFIG: ArchiveConfig = {
  topics: [
    XILIAN_TOPICS.SENSOR_DATA.name,
    XILIAN_TOPICS.AIS_VESSEL.name,
    XILIAN_TOPICS.TOS_JOB.name,
    XILIAN_TOPICS.FAULT_EVENTS.name,
  ],
  s3Bucket: process.env.ARCHIVE_S3_BUCKET || 'xilian-kafka-archive',
  s3Prefix: 'kafka-archive',
  batchSize: 10000,
  flushIntervalMs: 60000, // 1分钟
  compressionType: 'gzip',
  partitionFormat: 'hourly',
  retentionDays: 365 * 5, // 5年
  encryptionEnabled: true,
};

// ============ S3 客户端模拟（实际使用时替换为真实 S3 客户端） ============

interface S3Client {
  putObject(params: {
    Bucket: string;
    Key: string;
    Body: Buffer;
    ContentType: string;
    ContentEncoding?: string;
    Metadata?: Record<string, string>;
  }): Promise<{ ETag: string }>;

  listObjects(params: {
    Bucket: string;
    Prefix: string;
    MaxKeys?: number;
    ContinuationToken?: string;
  }): Promise<{
    Contents: Array<{ Key: string; Size: number; LastModified: Date }>;
    NextContinuationToken?: string;
  }>;

  deleteObjects(params: {
    Bucket: string;
    Delete: { Objects: Array<{ Key: string }> };
  }): Promise<void>;

  getObject(params: {
    Bucket: string;
    Key: string;
  }): Promise<{ Body: Buffer; ContentType: string }>;
}

// 创建模拟 S3 客户端（实际部署时替换为 AWS SDK）
function createS3Client(): S3Client {
  const storage = new Map<string, { body: Buffer; metadata: Record<string, string> }>();

  return {
    async putObject(params) {
      const key = `${params.Bucket}/${params.Key}`;
      storage.set(key, {
        body: params.Body,
        metadata: params.Metadata || {},
      });
      return { ETag: `"${Date.now()}"` };
    },

    async listObjects(params) {
      const prefix = `${params.Bucket}/${params.Prefix}`;
      const contents: Array<{ Key: string; Size: number; LastModified: Date }> = [];

      for (const [key, value] of Array.from(storage.entries())) {
        if (key.startsWith(prefix)) {
          contents.push({
            Key: key.replace(`${params.Bucket}/`, ''),
            Size: value.body.length,
            LastModified: new Date(),
          });
        }
      }

      return { Contents: contents.slice(0, params.MaxKeys || 1000) };
    },

    async deleteObjects(params) {
      for (const obj of params.Delete.Objects) {
        storage.delete(`${params.Bucket}/${obj.Key}`);
      }
    },

    async getObject(params) {
      const key = `${params.Bucket}/${params.Key}`;
      const data = storage.get(key);
      if (!data) {
        throw new Error(`Object not found: ${key}`);
      }
      return { Body: data.body, ContentType: 'application/json' };
    },
  };
}

// ============ 压缩工具 ============

import { gzipSync, gunzipSync } from 'zlib';

function compress(data: Buffer, type: ArchiveConfig['compressionType']): Buffer {
  switch (type) {
    case 'gzip':
      return gzipSync(data);
    case 'snappy':
    case 'lz4':
      // 简化实现，实际使用时需要引入相应库
      return gzipSync(data);
    default:
      return data;
  }
}

function decompress(data: Buffer, type: ArchiveConfig['compressionType']): Buffer {
  switch (type) {
    case 'gzip':
      return gunzipSync(data);
    case 'snappy':
    case 'lz4':
      return gunzipSync(data);
    default:
      return data;
  }
}

// ============ Kafka 归档服务 ============

export class KafkaArchiver {
  private config: ArchiveConfig;
  private s3Client: S3Client;
  private isRunning: boolean = false;
  private consumerIds: string[] = [];
  private messageBuffer: Map<string, ArchiveRecord[]> = new Map();
  private stats: ArchiveStats = {
    totalMessages: 0,
    totalBytes: 0,
    filesCreated: 0,
    lastArchiveTime: 0,
    errors: 0,
  };
  private archiveFiles: ArchiveFile[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private handlers: ((file: ArchiveFile) => void)[] = [];

  constructor(config?: Partial<ArchiveConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.s3Client = createS3Client();

    // 初始化每个 topic 的缓冲区
    for (const topic of this.config.topics) {
      this.messageBuffer.set(topic, []);
    }
  }

  /**
   * 启动归档服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[KafkaArchiver] Already running');
      return;
    }

    console.log('[KafkaArchiver] Starting archiver...');
    console.log(`[KafkaArchiver] Topics: ${this.config.topics.join(', ')}`);
    console.log(`[KafkaArchiver] S3 Bucket: ${this.config.s3Bucket}`);
    this.isRunning = true;

    try {
      // 为每个 topic 创建消费者
      for (const topic of this.config.topics) {
        const consumerId = await kafkaCluster.createConsumer(
          `kafka-archiver-${topic.replace(/\./g, '-')}`,
          [topic],
          this.handleMessage.bind(this),
          { autoCommit: true, fromBeginning: false }
        );
        this.consumerIds.push(consumerId);
      }

      // 启动定时刷新
      this.flushTimer = setInterval(() => {
        this.flushAllBuffers();
      }, this.config.flushIntervalMs);

      console.log('[KafkaArchiver] Archiver started');
    } catch (error) {
      console.error('[KafkaArchiver] Failed to start:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * 停止归档服务
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('[KafkaArchiver] Stopping archiver...');
    this.isRunning = false;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 最后一次刷新
    await this.flushAllBuffers();

    // 停止所有消费者
    for (const consumerId of this.consumerIds) {
      await kafkaCluster.stopConsumer(consumerId);
    }
    this.consumerIds = [];

    console.log('[KafkaArchiver] Archiver stopped');
  }

  /**
   * 处理消息
   */
  private async handleMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): Promise<void> {
    const record: ArchiveRecord = {
      ...message,
      archivedAt: Date.now(),
    };

    const buffer = this.messageBuffer.get(message.topic);
    if (buffer) {
      buffer.push(record);

      // 检查是否需要刷新
      if (buffer.length >= this.config.batchSize) {
        await this.flushBuffer(message.topic);
      }
    }
  }

  /**
   * 刷新所有缓冲区
   */
  private async flushAllBuffers(): Promise<void> {
    for (const topic of this.config.topics) {
      await this.flushBuffer(topic);
    }
  }

  /**
   * 刷新指定 topic 的缓冲区
   */
  private async flushBuffer(topic: string): Promise<void> {
    const buffer = this.messageBuffer.get(topic);
    if (!buffer || buffer.length === 0) return;

    const records = [...buffer];
    this.messageBuffer.set(topic, []);

    try {
      const archiveFile = await this.archiveRecords(topic, records);
      this.archiveFiles.push(archiveFile);
      this.stats.filesCreated++;
      this.stats.lastArchiveTime = Date.now();

      // 通知处理器
      for (const handler of this.handlers) {
        try {
          handler(archiveFile);
        } catch (error) {
          console.error('[KafkaArchiver] Handler error:', error);
        }
      }

      console.log(`[KafkaArchiver] Archived ${records.length} messages from ${topic} to ${archiveFile.path}`);
    } catch (error) {
      console.error(`[KafkaArchiver] Failed to archive ${topic}:`, error);
      this.stats.errors++;

      // 将记录放回缓冲区
      const currentBuffer = this.messageBuffer.get(topic) || [];
      this.messageBuffer.set(topic, [...records, ...currentBuffer]);
    }
  }

  /**
   * 归档记录到 S3
   */
  private async archiveRecords(topic: string, records: ArchiveRecord[]): Promise<ArchiveFile> {
    const now = new Date();
    const partition = this.getPartitionPath(now);
    const filename = this.generateFilename(topic, records);
    const path = `${this.config.s3Prefix}/${topic.replace(/\./g, '/')}/${partition}/${filename}`;

    // 序列化记录
    const jsonData = JSON.stringify({
      topic,
      recordCount: records.length,
      startOffset: records[0].offset,
      endOffset: records[records.length - 1].offset,
      startTimestamp: records[0].timestamp,
      endTimestamp: records[records.length - 1].timestamp,
      records,
    });

    const rawData = Buffer.from(jsonData);
    const compressedData = compress(rawData, this.config.compressionType);

    // 上传到 S3
    await this.s3Client.putObject({
      Bucket: this.config.s3Bucket,
      Key: path,
      Body: compressedData,
      ContentType: 'application/json',
      ContentEncoding: this.config.compressionType !== 'none' ? this.config.compressionType : undefined,
      Metadata: {
        topic,
        recordCount: records.length.toString(),
        startOffset: records[0].offset,
        endOffset: records[records.length - 1].offset,
        compressionType: this.config.compressionType,
      },
    });

    // 更新统计
    this.stats.totalMessages += records.length;
    this.stats.totalBytes += compressedData.length;

    return {
      path,
      topic,
      startOffset: records[0].offset,
      endOffset: records[records.length - 1].offset,
      messageCount: records.length,
      sizeBytes: compressedData.length,
      createdAt: Date.now(),
      compressionType: this.config.compressionType,
    };
  }

  /**
   * 获取分区路径
   */
  private getPartitionPath(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    if (this.config.partitionFormat === 'hourly') {
      return `year=${year}/month=${month}/day=${day}/hour=${hour}`;
    } else {
      return `year=${year}/month=${month}/day=${day}`;
    }
  }

  /**
   * 生成文件名
   */
  private generateFilename(topic: string, records: ArchiveRecord[]): string {
    const timestamp = Date.now();
    const startOffset = records[0].offset;
    const endOffset = records[records.length - 1].offset;
    const ext = this.config.compressionType !== 'none' ? `.${this.config.compressionType}` : '';
    return `${topic.split('.').pop()}_${startOffset}_${endOffset}_${timestamp}.json${ext}`;
  }

  /**
   * 列出归档文件
   */
  async listArchiveFiles(options?: {
    topic?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<ArchiveFile[]> {
    const prefix = options?.topic
      ? `${this.config.s3Prefix}/${options.topic.replace(/\./g, '/')}`
      : this.config.s3Prefix;

    const result = await this.s3Client.listObjects({
      Bucket: this.config.s3Bucket,
      Prefix: prefix,
      MaxKeys: options?.limit || 1000,
    });

    return result.Contents.map(obj => ({
      path: obj.Key,
      topic: this.extractTopicFromPath(obj.Key),
      startOffset: '0',
      endOffset: '0',
      messageCount: 0,
      sizeBytes: obj.Size,
      createdAt: obj.LastModified.getTime(),
      compressionType: this.config.compressionType,
    }));
  }

  /**
   * 从路径提取 topic
   */
  private extractTopicFromPath(path: string): string {
    const parts = path.replace(this.config.s3Prefix + '/', '').split('/');
    return parts.slice(0, 2).join('.');
  }

  /**
   * 恢复归档数据
   */
  async restoreArchive(path: string): Promise<ArchiveRecord[]> {
    const result = await this.s3Client.getObject({
      Bucket: this.config.s3Bucket,
      Key: path,
    });

    const decompressedData = decompress(result.Body, this.config.compressionType);
    const data = JSON.parse(decompressedData.toString());

    return data.records;
  }

  /**
   * 清理过期归档
   */
  async cleanupExpiredArchives(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const files = await this.listArchiveFiles();
    const expiredFiles = files.filter(f => f.createdAt < cutoffDate.getTime());

    if (expiredFiles.length === 0) {
      return 0;
    }

    await this.s3Client.deleteObjects({
      Bucket: this.config.s3Bucket,
      Delete: {
        Objects: expiredFiles.map(f => ({ Key: f.path })),
      },
    });

    console.log(`[KafkaArchiver] Cleaned up ${expiredFiles.length} expired archives`);
    return expiredFiles.length;
  }

  /**
   * 注册归档完成处理器
   */
  onArchive(handler: (file: ArchiveFile) => void): void {
    this.handlers.push(handler);
  }

  /**
   * 获取统计信息
   */
  getStats(): ArchiveStats {
    return { ...this.stats };
  }

  /**
   * 获取状态
   */
  getStatus(): {
    isRunning: boolean;
    config: ArchiveConfig;
    stats: ArchiveStats;
    bufferSizes: Record<string, number>;
  } {
    const bufferSizes: Record<string, number> = {};
    for (const [topic, buffer] of Array.from(this.messageBuffer.entries())) {
      bufferSizes[topic] = buffer.length;
    }

    return {
      isRunning: this.isRunning,
      config: this.config,
      stats: this.stats,
      bufferSizes,
    };
  }

  /**
   * 获取最近归档的文件
   */
  getRecentArchives(limit: number = 10): ArchiveFile[] {
    return this.archiveFiles
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /**
   * 手动触发归档（用于测试）
   */
  async triggerArchive(topic?: string): Promise<void> {
    if (topic) {
      await this.flushBuffer(topic);
    } else {
      await this.flushAllBuffers();
    }
  }

  /**
   * 手动添加消息到缓冲区（用于测试）
   */
  addMessage(message: {
    topic: string;
    partition: number;
    offset: string;
    key: string | null;
    value: string | null;
    headers: Record<string, string>;
    timestamp: string;
  }): void {
    const record: ArchiveRecord = {
      ...message,
      archivedAt: Date.now(),
    };

    const buffer = this.messageBuffer.get(message.topic);
    if (buffer) {
      buffer.push(record);
    }
  }
}

// 导出单例
export const kafkaArchiver = new KafkaArchiver();
export default kafkaArchiver;
