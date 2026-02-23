/**
 * MinIO S3 企业级对象存储服务
 * 
 * Buckets：
 * - raw-documents: 原始文档
 * - processed: 处理后的文件
 * - model-artifacts: 模型工件
 * - backups: 备份数据
 * 
 * 生命周期策略：
 * - 热存储（NVMe）：30天
 * - 温存储（HDD）：1年
 * - 冷存储（Glacier）：5年
 */

import {

  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { createModuleLogger } from '../../core/logger';
const log = createModuleLogger('minio');

// ============ 配置类型 ============

export interface MinioConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  ssl: boolean;
}

// 默认配置
const DEFAULT_CONFIG: MinioConfig = {
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  forcePathStyle: true,
  ssl: process.env.MINIO_SSL === 'true',
};

// ============ Bucket 配置 ============

export interface BucketConfig {
  name: string;
  description: string;
  storageClass: 'STANDARD' | 'STANDARD_IA' | 'GLACIER';
  lifecycleRules?: LifecycleRule[];
  versioning?: boolean;
}

export interface LifecycleRule {
  id: string;
  prefix?: string;
  enabled: boolean;
  expiration?: {
    days: number;
  };
  transitions?: Array<{
    days: number;
    storageClass: 'STANDARD_IA' | 'GLACIER' | 'DEEP_ARCHIVE';
  }>;
  noncurrentVersionExpiration?: {
    noncurrentDays: number;
  };
}

// 预定义 Bucket 配置
const BUCKET_CONFIGS: Record<string, BucketConfig> = {
  'raw-documents': {
    name: 'raw-documents',
    description: '原始文档存储',
    storageClass: 'STANDARD',
    versioning: true,
    lifecycleRules: [
      {
        id: 'hot-to-warm',
        enabled: true,
        transitions: [
          { days: 30, storageClass: 'STANDARD_IA' },
        ],
      },
      {
        id: 'warm-to-cold',
        enabled: true,
        transitions: [
          { days: 365, storageClass: 'GLACIER' },
        ],
      },
      {
        id: 'cold-expiration',
        enabled: true,
        expiration: { days: 1825 }, // 5年
      },
    ],
  },
  'processed': {
    name: 'processed',
    description: '处理后的文件',
    storageClass: 'STANDARD',
    versioning: false,
    lifecycleRules: [
      {
        id: 'processed-lifecycle',
        enabled: true,
        transitions: [
          { days: 30, storageClass: 'STANDARD_IA' },
          { days: 180, storageClass: 'GLACIER' },
        ],
        expiration: { days: 730 }, // 2年
      },
    ],
  },
  'model-artifacts': {
    name: 'model-artifacts',
    description: '模型工件存储',
    storageClass: 'STANDARD',
    versioning: true,
    lifecycleRules: [
      {
        id: 'model-versions',
        enabled: true,
        noncurrentVersionExpiration: { noncurrentDays: 90 },
      },
    ],
  },
  'backups': {
    name: 'backups',
    description: '备份数据',
    storageClass: 'GLACIER',
    versioning: true,
    lifecycleRules: [
      {
        id: 'backup-lifecycle',
        enabled: true,
        transitions: [
          { days: 1, storageClass: 'GLACIER' },
        ],
        expiration: { days: 2555 }, // 7年
      },
    ],
  },
};

// ============ 数据类型定义 ============

export interface FileMetadata {
  key: string;
  bucket: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
  storageClass?: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  success: boolean;
  key: string;
  bucket: string;
  etag?: string;
  versionId?: string;
  url?: string;
  error?: string;
}

export interface ListResult {
  files: FileMetadata[];
  continuationToken?: string;
  isTruncated: boolean;
  totalCount: number;
}

export interface MultipartUploadSession {
  uploadId: string;
  bucket: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
}

// ============ MinIO 存储服务类 ============

export class MinioStorage {
  private client: S3Client;
  private config: MinioConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<MinioConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
      forcePathStyle: this.config.forcePathStyle,
    });
  }

  /**
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    log.debug('[MinIO] Initializing storage service...');

    // 初始化所有 Buckets
    for (const config of Object.values(BUCKET_CONFIGS)) {
      await this.ensureBucket(config);
    }

    this.isInitialized = true;
    log.debug('[MinIO] Storage service initialized');
  }

  /**
   * 确保 Bucket 存在
   */
  private async ensureBucket(config: BucketConfig): Promise<void> {
    try {
      // 检查 Bucket 是否存在
      await this.client.send(new HeadBucketCommand({ Bucket: config.name }));
      log.debug(`[MinIO] Bucket exists: ${config.name}`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        // 创建 Bucket
        await this.client.send(new CreateBucketCommand({ Bucket: config.name }));
        log.debug(`[MinIO] Created bucket: ${config.name}`);

        // 设置生命周期规则
        if (config.lifecycleRules && config.lifecycleRules.length > 0) {
          await this.setLifecycleRules(config.name, config.lifecycleRules);
        }
      } else {
        log.warn(`[MinIO] Error checking bucket ${config.name}:`, error);
      }
    }
  }

  /**
   * 设置生命周期规则
   */
  private async setLifecycleRules(bucket: string, rules: LifecycleRule[]): Promise<void> {
    try {
      await this.client.send(new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: rules.map(rule => ({
            ID: rule.id,
            Filter: rule.prefix ? { Prefix: rule.prefix } : { Prefix: '' },
            Status: rule.enabled ? 'Enabled' : 'Disabled',
            Expiration: rule.expiration ? { Days: rule.expiration.days } : undefined,
            Transitions: rule.transitions?.map(t => ({
              Days: t.days,
              StorageClass: t.storageClass,
            })),
            NoncurrentVersionExpiration: rule.noncurrentVersionExpiration ? {
              NoncurrentDays: rule.noncurrentVersionExpiration.noncurrentDays,
            } : undefined,
          })),
        },
      }));

      log.debug(`[MinIO] Set lifecycle rules for bucket: ${bucket}`);
    } catch (error) {
      log.warn(`[MinIO] Error setting lifecycle rules for ${bucket}:`, error);
    }
  }

  // ============ 基础文件操作 ============

  /**
   * 上传文件
   */
  async uploadFile(
    bucket: string,
    key: string,
    body: Buffer | Uint8Array | string | Readable,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      storageClass?: 'STANDARD' | 'STANDARD_IA' | 'GLACIER';
    } = {}
  ): Promise<UploadResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        Metadata: options.metadata,
        StorageClass: options.storageClass,
      });

      const result = await this.client.send(command);

      return {
        success: true,
        key,
        bucket,
        etag: result.ETag,
        versionId: result.VersionId,
        url: `${this.config.endpoint}/${bucket}/${key}`,
      };
    } catch (error) {
      log.warn('[MinIO] Upload file error:', error);
      return {
        success: false,
        key,
        bucket,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(bucket: string, key: string): Promise<{
    body: Readable | null;
    metadata: FileMetadata | null;
    error?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const result = await this.client.send(command);

      return {
        body: result.Body as Readable,
        metadata: {
          key,
          bucket,
          size: result.ContentLength || 0,
          contentType: result.ContentType,
          lastModified: result.LastModified,
          etag: result.ETag,
          storageClass: result.StorageClass,
          metadata: result.Metadata,
        },
      };
    } catch (error) {
      log.warn('[MinIO] Download file error:', error);
      return {
        body: null,
        metadata: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }));

      return true;
    } catch (error) {
      log.warn('[MinIO] Delete file error:', error);
      return false;
    }
  }

  /**
   * 获取文件元数据
   */
  async getFileMetadata(bucket: string, key: string): Promise<FileMetadata | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }));

      return {
        key,
        bucket,
        size: result.ContentLength || 0,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        etag: result.ETag,
        storageClass: result.StorageClass,
        metadata: result.Metadata,
      };
    } catch (error) {
      log.warn('[MinIO] Get file metadata error:', error);
      return null;
    }
  }

  /**
   * 复制文件
   */
  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<boolean> {
    try {
      await this.client.send(new CopyObjectCommand({
        Bucket: destBucket,
        Key: destKey,
        CopySource: `${sourceBucket}/${sourceKey}`,
      }));

      return true;
    } catch (error) {
      log.warn('[MinIO] Copy file error:', error);
      return false;
    }
  }

  /**
   * 列出文件
   */
  async listFiles(
    bucket: string,
    options: {
      prefix?: string;
      maxKeys?: number;
      continuationToken?: string;
    } = {}
  ): Promise<ListResult> {
    try {
      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.prefix,
        MaxKeys: options.maxKeys || 1000,
        ContinuationToken: options.continuationToken,
      }));

      return {
        files: (result.Contents || []).map(item => ({
          key: item.Key || '',
          bucket,
          size: item.Size || 0,
          lastModified: item.LastModified,
          etag: item.ETag,
          storageClass: item.StorageClass,
        })),
        continuationToken: result.NextContinuationToken,
        isTruncated: result.IsTruncated || false,
        totalCount: result.KeyCount || 0,
      };
    } catch (error) {
      log.warn('[MinIO] List files error:', error);
      return {
        files: [],
        isTruncated: false,
        totalCount: 0,
      };
    }
  }

  // ============ 预签名 URL ============

  /**
   * 生成预签名上传 URL
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600,
    contentType?: string
  ): Promise<string | null> {
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      log.warn('[MinIO] Get presigned upload URL error:', error);
      return null;
    }
  }

  /**
   * 生成预签名下载 URL
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresIn: number = 3600
  ): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      log.warn('[MinIO] Get presigned download URL error:', error);
      return null;
    }
  }

  // ============ 分片上传 ============

  /**
   * 初始化分片上传
   */
  async initMultipartUpload(
    bucket: string,
    key: string,
    contentType?: string
  ): Promise<MultipartUploadSession | null> {
    try {
      const result = await this.client.send(new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }));

      return {
        uploadId: result.UploadId || '',
        bucket,
        key,
        parts: [],
      };
    } catch (error) {
      log.warn('[MinIO] Init multipart upload error:', error);
      return null;
    }
  }

  /**
   * 上传分片
   */
  async uploadPart(
    session: MultipartUploadSession,
    partNumber: number,
    body: Buffer | Uint8Array
  ): Promise<{ success: boolean; etag?: string }> {
    try {
      const result = await this.client.send(new UploadPartCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId,
        PartNumber: partNumber,
        Body: body,
      }));

      if (result.ETag) {
        session.parts.push({ partNumber, etag: result.ETag });
      }

      return { success: true, etag: result.ETag };
    } catch (error) {
      log.warn('[MinIO] Upload part error:', error);
      return { success: false };
    }
  }

  /**
   * 完成分片上传
   */
  async completeMultipartUpload(session: MultipartUploadSession): Promise<UploadResult> {
    try {
      const result = await this.client.send(new CompleteMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: session.parts.map(p => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }));

      return {
        success: true,
        key: session.key,
        bucket: session.bucket,
        etag: result.ETag,
        url: `${this.config.endpoint}/${session.bucket}/${session.key}`,
      };
    } catch (error) {
      log.warn('[MinIO] Complete multipart upload error:', error);
      return {
        success: false,
        key: session.key,
        bucket: session.bucket,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 取消分片上传
   */
  async abortMultipartUpload(session: MultipartUploadSession): Promise<boolean> {
    try {
      await this.client.send(new AbortMultipartUploadCommand({
        Bucket: session.bucket,
        Key: session.key,
        UploadId: session.uploadId,
      }));

      return true;
    } catch (error) {
      log.warn('[MinIO] Abort multipart upload error:', error);
      return false;
    }
  }

  // ============ 便捷方法 ============

  /**
   * 上传原始文档
   */
  async uploadRawDocument(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    return this.uploadFile('raw-documents', key, body, {
      contentType,
      metadata,
      storageClass: 'STANDARD',
    });
  }

  /**
   * 上传处理后的文件
   */
  async uploadProcessedFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    return this.uploadFile('processed', key, body, {
      contentType,
      metadata,
      storageClass: 'STANDARD',
    });
  }

  /**
   * 上传模型工件
   */
  async uploadModelArtifact(
    key: string,
    body: Buffer | Uint8Array | string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    return this.uploadFile('model-artifacts', key, body, {
      contentType: 'application/octet-stream',
      metadata,
      storageClass: 'STANDARD',
    });
  }

  /**
   * 创建备份
   */
  async createBackup(
    key: string,
    body: Buffer | Uint8Array | string,
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    return this.uploadFile('backups', key, body, {
      contentType: 'application/octet-stream',
      metadata,
      storageClass: 'GLACIER',
    });
  }

  // ============ 统计和管理 ============

  /**
   * 获取 Bucket 统计信息
   */
  async getBucketStats(bucket: string): Promise<{
    name: string;
    fileCount: number;
    totalSize: number;
    lifecycleRules: number;
  }> {
    let fileCount = 0;
    let totalSize = 0;
    let continuationToken: string | undefined;

    do {
      const result = await this.listFiles(bucket, {
        maxKeys: 1000,
        continuationToken,
      });

      fileCount += result.files.length;
      totalSize += result.files.reduce((sum, f) => sum + f.size, 0);
      continuationToken = result.continuationToken;
    } while (continuationToken);

    // 获取生命周期规则数量
    let lifecycleRules = 0;
    try {
      const lifecycle = await this.client.send(new GetBucketLifecycleConfigurationCommand({
        Bucket: bucket,
      }));
      lifecycleRules = lifecycle.Rules?.length || 0;
    } catch {
      // 可能没有生命周期规则
    }

    return {
      name: bucket,
      fileCount,
      totalSize,
      lifecycleRules,
    };
  }

  /**
   * 获取所有 Bucket 统计
   */
  async getAllBucketsStats(): Promise<Array<{
    name: string;
    fileCount: number;
    totalSize: number;
    lifecycleRules: number;
  }>> {
    const stats = [];

    for (const config of Object.values(BUCKET_CONFIGS)) {
      const bucketStats = await this.getBucketStats(config.name);
      stats.push(bucketStats);
    }

    return stats;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    connected: boolean;
    latencyMs: number;
    buckets: Array<{ name: string; accessible: boolean }>;
    error?: string;
  }> {
    const start = Date.now();
    const buckets: Array<{ name: string; accessible: boolean }> = [];

    for (const config of Object.values(BUCKET_CONFIGS)) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: config.name }));
        buckets.push({ name: config.name, accessible: true });
      } catch {
        buckets.push({ name: config.name, accessible: false });
      }
    }

    const accessibleCount = buckets.filter(b => b.accessible).length;

    return {
      connected: accessibleCount > 0,
      latencyMs: Date.now() - start,
      buckets,
      error: accessibleCount === 0 ? 'No accessible buckets' : undefined,
    };
  }

  /**
   * 清理过期文件（手动触发）
   */
  async cleanupExpiredFiles(bucket: string, olderThanDays: number): Promise<{
    deleted: number;
    errors: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deleted = 0;
    let errors = 0;
    let continuationToken: string | undefined;

    do {
      const result = await this.listFiles(bucket, {
        maxKeys: 1000,
        continuationToken,
      });

      for (const file of result.files) {
        if (file.lastModified && file.lastModified < cutoffDate) {
          const success = await this.deleteFile(bucket, file.key);
          if (success) {
            deleted++;
          } else {
            errors++;
          }
        }
      }

      continuationToken = result.continuationToken;
    } while (continuationToken);

    return { deleted, errors };
  }
}

// 导出单例
export const minioStorage = new MinioStorage();
export default minioStorage;
