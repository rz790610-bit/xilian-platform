/**
 * featureFlags.ts 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('featureFlags', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // 清除相关环境变量
    delete process.env.FEATURE_AIRFLOW_ENABLED;
    delete process.env.FEATURE_KAFKA_CONNECT_ENABLED;
    delete process.env.FEATURE_ELASTICSEARCH_ENABLED;
    delete process.env.FEATURE_FLINK_ENABLED;
    delete process.env.FEATURE_GROK_ENABLED;
    delete process.env.XAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('默认所有 feature flags 为 false', async () => {
    const { featureFlags } = await import('../featureFlags');
    expect(featureFlags.airflow).toBe(false);
    expect(featureFlags.kafkaConnect).toBe(false);
    expect(featureFlags.elasticsearch).toBe(false);
    expect(featureFlags.flink).toBe(false);
  });

  it('环境变量 true 启用 feature', async () => {
    process.env.FEATURE_AIRFLOW_ENABLED = 'true';
    process.env.FEATURE_FLINK_ENABLED = '1';
    const { featureFlags } = await import('../featureFlags');
    expect(featureFlags.airflow).toBe(true);
    expect(featureFlags.flink).toBe(true);
  });

  it('requireFeature 在 feature 禁用时抛出错误', async () => {
    const { requireFeature } = await import('../featureFlags');
    expect(() => requireFeature('airflow')).toThrow(/FeatureDisabled/);
    expect(() => requireFeature('airflow', 'Apache Airflow')).toThrow(/Apache Airflow/);
  });

  it('requireFeature 在 feature 启用时不抛出', async () => {
    process.env.FEATURE_AIRFLOW_ENABLED = 'true';
    const { requireFeature } = await import('../featureFlags');
    expect(() => requireFeature('airflow')).not.toThrow();
  });

  it('lazyImportIf 在 feature 禁用时返回 null', async () => {
    const { lazyImportIf } = await import('../featureFlags');
    const loader = lazyImportIf('airflow', async () => ({ module: true }));
    const result = await loader();
    expect(result).toBeNull();
  });

  it('lazyImportIf 在 feature 启用时返回模块', async () => {
    process.env.FEATURE_AIRFLOW_ENABLED = 'true';
    const { lazyImportIf } = await import('../featureFlags');
    const loader = lazyImportIf('airflow', async () => ({ module: true }));
    const result = await loader();
    expect(result).toEqual({ module: true });
  });

  it('withFeatureGuard 在 feature 禁用时返回 fallback', async () => {
    const { withFeatureGuard } = await import('../featureFlags');
    const guarded = withFeatureGuard('elasticsearch', async () => 'real data', 'fallback');
    const result = await guarded();
    expect(result).toBe('fallback');
  });

  it('withFeatureGuard 在 feature 启用时执行函数', async () => {
    process.env.FEATURE_ELASTICSEARCH_ENABLED = 'true';
    const { withFeatureGuard } = await import('../featureFlags');
    const guarded = withFeatureGuard('elasticsearch', async () => 'real data', 'fallback');
    const result = await guarded();
    expect(result).toBe('real data');
  });

  it('grok feature 在 XAI_API_KEY 存在时自动启用', async () => {
    process.env.XAI_API_KEY = 'xai-test-key';
    const { featureFlags } = await import('../featureFlags');
    expect(featureFlags.grok).toBe(true);
  });
});
