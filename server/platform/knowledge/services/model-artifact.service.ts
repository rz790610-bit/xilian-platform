/**
 * ============================================================================
 * 模型制品管理服务 — ModelArtifactService
 * ============================================================================
 *
 * 职责：
 *   1. 模型制品上传/下载（MinIO 对象存储）
 *   2. 制品校验和验证
 *   3. 制品版本快照
 *   4. 制品清理（过期/废弃模型的制品回收）
 *   5. 制品元数据管理
 */

import { config } from '../../../core/config';
import { createModuleLogger } from '../../../core/logger';
import { minioStorage } from '../../../lib/storage/minio.storage';

const log = createModuleLogger('model-artifact');

/** Stream → Buffer 工具 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ============================================================================
// 制品类型
// ============================================================================

export interface ArtifactMetadata {
  id: string;
  modelId: number;
  version: string;
  storagePath: string; // MinIO bucket/key
  sizeBytes: number;
  checksum: string;
  checksumAlgorithm: 'sha256' | 'md5';
  format: 'onnx' | 'pt' | 'pb' | 'pkl' | 'h5' | 'joblib' | 'tar.gz' | 'zip';
  compressionType: 'none' | 'gzip' | 'zstd' | 'lz4';
  uploadedBy: string;
  uploadedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  tags: Record<string, string>;
}

export interface ArtifactUploadRequest {
  modelId: number;
  version: string;
  data: Buffer | Uint8Array;
  format: ArtifactMetadata['format'];
  compressionType?: ArtifactMetadata['compressionType'];
  tags?: Record<string, string>;
  uploadedBy: string;
}

export interface ArtifactDownloadResult {
  metadata: ArtifactMetadata;
  data: Buffer | null;
  fromCache: boolean;
}

export interface CleanupResult {
  scannedCount: number;
  deletedCount: number;
  freedBytes: number;
  errors: string[];
}

// ============================================================================
// 模型制品管理服务
// ============================================================================

export class ModelArtifactService {
  private artifacts = new Map<string, ArtifactMetadata>();
  private readonly bucketName = 'model-artifacts';
  private readonly maxCacheSizeBytes = 500 * 1024 * 1024; // 500MB 本地缓存
  private localCache = new Map<string, { data: Buffer; accessedAt: number }>();
  private currentCacheSize = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * 上传制品
   */
  async upload(request: ArtifactUploadRequest): Promise<ArtifactMetadata> {
    const data = Buffer.isBuffer(request.data) ? request.data : Buffer.from(request.data);

    // 计算校验和
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(data).digest('hex');

    // 构建存储路径
    const storagePath = `${this.bucketName}/${request.modelId}/${request.version}/${Date.now()}.${request.format}`;

    const metadata: ArtifactMetadata = {
      id: `artifact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      modelId: request.modelId,
      version: request.version,
      storagePath,
      sizeBytes: data.length,
      checksum,
      checksumAlgorithm: 'sha256',
      format: request.format,
      compressionType: request.compressionType || 'none',
      uploadedBy: request.uploadedBy,
      uploadedAt: Date.now(),
      lastAccessedAt: Date.now(),
      accessCount: 0,
      tags: request.tags || {},
    };

    // 上传到 MinIO（通过统一 minioStorage 单例）
    if (config.minio.enabled) {
      try {
        const result = await minioStorage.uploadModelArtifact(storagePath, data, {
          checksum,
          format: request.format,
        });
        if (result.success) {
          log.info({ storagePath, sizeBytes: data.length }, '[model-artifact] Uploaded to MinIO');
        } else {
          log.warn({ storagePath, error: result.error }, '[model-artifact] MinIO upload failed, metadata saved in-memory only');
        }
      } catch (err) {
        log.warn({ err, storagePath }, '[model-artifact] MinIO upload failed, metadata saved in-memory only');
      }
    }

    this.artifacts.set(metadata.id, metadata);

    // 放入本地缓存
    this.addToCache(metadata.id, data);

    return metadata;
  }

  /**
   * 下载制品
   */
  async download(artifactId: string): Promise<ArtifactDownloadResult | null> {
    const metadata = this.artifacts.get(artifactId);
    if (!metadata) return null;

    metadata.lastAccessedAt = Date.now();
    metadata.accessCount++;

    // 检查本地缓存
    const cached = this.localCache.get(artifactId);
    if (cached) {
      cached.accessedAt = Date.now();
      this.cacheHits++;
      return { metadata, data: cached.data, fromCache: true };
    }
    this.cacheMisses++;

    // 从 MinIO 下载（通过统一 minioStorage 单例）
    if (config.minio.enabled) {
      try {
        const result = await minioStorage.downloadFile(this.bucketName, metadata.storagePath);
        if (result.body) {
          const data = await streamToBuffer(result.body);
          this.addToCache(artifactId, data);
          log.debug({ artifactId, sizeBytes: data.length }, '[model-artifact] Downloaded from MinIO');
          return { metadata, data, fromCache: false };
        }
      } catch (err) {
        log.warn({ err, artifactId }, '[model-artifact] MinIO download failed');
      }
    }

    return { metadata, data: null, fromCache: false };
  }

  /**
   * 验证制品完整性
   */
  async verify(artifactId: string, data: Buffer): Promise<{ valid: boolean; expectedChecksum: string; actualChecksum: string }> {
    const metadata = this.artifacts.get(artifactId);
    if (!metadata) return { valid: false, expectedChecksum: '', actualChecksum: '' };

    const crypto = await import('crypto');
    const actualChecksum = crypto.createHash(metadata.checksumAlgorithm).update(data).digest('hex');

    return {
      valid: actualChecksum === metadata.checksum,
      expectedChecksum: metadata.checksum,
      actualChecksum,
    };
  }

  /**
   * 获取制品元数据
   */
  getMetadata(artifactId: string): ArtifactMetadata | null {
    return this.artifacts.get(artifactId) || null;
  }

  /**
   * 列出模型的所有制品
   */
  listByModel(modelId: number): ArtifactMetadata[] {
    return Array.from(this.artifacts.values())
      .filter(a => a.modelId === modelId)
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  /**
   * 清理过期制品
   */
  async cleanup(params: {
    maxAgeDays?: number;
    keepLatestN?: number;
    dryRun?: boolean;
  }): Promise<CleanupResult> {
    const maxAge = (params.maxAgeDays || 90) * 24 * 60 * 60 * 1000;
    const keepLatest = params.keepLatestN || 3;
    const now = Date.now();
    const result: CleanupResult = { scannedCount: 0, deletedCount: 0, freedBytes: 0, errors: [] };

    // 按模型分组
    const byModel = new Map<number, ArtifactMetadata[]>();
    for (const artifact of this.artifacts.values()) {
      result.scannedCount++;
      const list = byModel.get(artifact.modelId) || [];
      list.push(artifact);
      byModel.set(artifact.modelId, list);
    }

    for (const [_modelId, artifacts] of byModel) {
      // 按时间排序，保留最新 N 个
      const sorted = artifacts.sort((a, b) => b.uploadedAt - a.uploadedAt);
      const toDelete = sorted.slice(keepLatest).filter(a => now - a.uploadedAt > maxAge);

      for (const artifact of toDelete) {
        if (!params.dryRun) {
          try {
            if (config.minio.enabled) {
              await minioStorage.deleteFile(this.bucketName, artifact.storagePath);
            }
            this.artifacts.delete(artifact.id);
            this.localCache.delete(artifact.id);
            result.freedBytes += artifact.sizeBytes;
            result.deletedCount++;
          } catch (err) {
            result.errors.push(`Failed to delete ${artifact.id}: ${err}`);
          }
        } else {
          result.deletedCount++;
          result.freedBytes += artifact.sizeBytes;
        }
      }
    }

    return result;
  }

  /**
   * 获取存储统计
   */
  getStorageStats(): {
    totalArtifacts: number;
    totalSizeBytes: number;
    cacheSizeBytes: number;
    cacheHitRate: number;
    byFormat: Record<string, { count: number; sizeBytes: number }>;
  } {
    const byFormat: Record<string, { count: number; sizeBytes: number }> = {};
    let totalSize = 0;

    for (const artifact of this.artifacts.values()) {
      totalSize += artifact.sizeBytes;
      if (!byFormat[artifact.format]) {
        byFormat[artifact.format] = { count: 0, sizeBytes: 0 };
      }
      byFormat[artifact.format].count++;
      byFormat[artifact.format].sizeBytes += artifact.sizeBytes;
    }

    return {
      totalArtifacts: this.artifacts.size,
      totalSizeBytes: totalSize,
      cacheSizeBytes: this.currentCacheSize,
      cacheHitRate: (this.cacheHits + this.cacheMisses) > 0
        ? this.cacheHits / (this.cacheHits + this.cacheMisses)
        : 0,
      byFormat,
    };
  }

  // --------------------------------------------------------------------------
  // 缓存管理
  // --------------------------------------------------------------------------

  private addToCache(artifactId: string, data: Buffer): void {
    // LRU 淘汰
    while (this.currentCacheSize + data.length > this.maxCacheSizeBytes && this.localCache.size > 0) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [key, entry] of this.localCache) {
        if (entry.accessedAt < oldestTime) {
          oldestTime = entry.accessedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        const removed = this.localCache.get(oldestKey);
        if (removed) this.currentCacheSize -= removed.data.length;
        this.localCache.delete(oldestKey);
      }
    }

    this.localCache.set(artifactId, { data, accessedAt: Date.now() });
    this.currentCacheSize += data.length;
  }

  // Bucket 管理由 minioStorage 统一负责，此服务不再单独管理
}
