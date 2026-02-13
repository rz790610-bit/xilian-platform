/**
 * 存储服务 - S3/MinIO 文件存储
 */
export async function storagePut(
  key: string,
  data: Buffer | string,
  options?: { contentType?: string; metadata?: Record<string, string> }
): Promise<{ url: string; key: string }> {
  // TODO: 实现S3/MinIO存储
  console.log(`[Storage] Put: ${key}`);
  return { url: `/storage/${key}`, key };
}

export async function storageGet(key: string): Promise<Buffer | null> {
  console.log(`[Storage] Get: ${key}`);
  return null;
}

export async function storageDelete(key: string): Promise<boolean> {
  console.log(`[Storage] Delete: ${key}`);
  return true;
}
