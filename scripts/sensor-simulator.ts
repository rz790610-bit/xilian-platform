/**
 * 传感器数据模拟器 — 商用标准
 *
 * 向 ClickHouse 写入符合物理约束的模拟传感器数据。
 * 支持 16 个振动/温度传感器，5% 异常概率，1s 写入间隔。
 *
 * FIX-012: 数据字段使用 snake_case 是因为直接映射 ClickHouse 表列名
 * (sensor_readings_raw.device_id, realtime_telemetry.device_code 等)。
 * 内部变量使用 camelCase，仅在构造 INSERT 行时使用 snake_case。
 *
 * 使用方式：
 *   pnpm sim:sensor              # 默认运行
 *   pnpm sim:sensor -- --count 100  # 指定写入次数后退出
 *
 * SIGINT (Ctrl+C) 优雅退出。
 */

import { createClient, type ClickHouseClient } from '@clickhouse/client';

// ── 传感器定义（VT-01 ~ VT-16） ──────────────────────────────

interface SensorDef {
  id: string;
  deviceCode: string;
  mpCode: string;
  metricName: string;
  unit: string;
  /** 正常运行基线值 */
  baseline: number;
  /** 正常波动范围 ±(baseline * noise) */
  noise: number;
  /** 物理最小值 */
  min: number;
  /** 物理最大值 */
  max: number;
  /** 告警阈值 */
  warning: number;
  /** 危险阈值 */
  critical: number;
  sampleRateHz: number;
  type: 'vibration' | 'temperature';
}

const SENSORS: SensorDef[] = [
  // === GJM12 起升机构 ===
  { id: 'VT-01', deviceCode: 'GJM12', mpCode: 'GJM120304',    metricName: 'rms', unit: 'mm/s', baseline: 2.8,  noise: 0.15, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-02', deviceCode: 'GJM12', mpCode: 'GJM120304',    metricName: 'rms', unit: 'mm/s', baseline: 2.5,  noise: 0.15, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-03', deviceCode: 'GJM12', mpCode: 'GJM12030404',  metricName: 'rms', unit: 'mm/s', baseline: 3.2,  noise: 0.12, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-04', deviceCode: 'GJM12', mpCode: 'GJM12030404',  metricName: 'rms', unit: 'mm/s', baseline: 2.0,  noise: 0.18, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-05', deviceCode: 'GJM12', mpCode: 'GJM12030409',  metricName: 'rms', unit: 'mm/s', baseline: 1.8,  noise: 0.20, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-06', deviceCode: 'GJM12', mpCode: 'GJM12030409',  metricName: 'rms', unit: 'mm/s', baseline: 1.9,  noise: 0.20, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },

  // === GJM12 小车运行机构 ===
  { id: 'VT-07', deviceCode: 'GJM12', mpCode: 'GJM120303',    metricName: 'rms', unit: 'mm/s', baseline: 2.1,  noise: 0.15, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-08', deviceCode: 'GJM12', mpCode: 'GJM120303',    metricName: 'rms', unit: 'mm/s', baseline: 2.3,  noise: 0.15, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-09', deviceCode: 'GJM12', mpCode: 'GJM12030301',  metricName: 'rms', unit: 'mm/s', baseline: 1.5,  noise: 0.22, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-10', deviceCode: 'GJM12', mpCode: 'GJM12030303',  metricName: 'rms', unit: 'mm/s', baseline: 2.6,  noise: 0.14, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-11', deviceCode: 'GJM12', mpCode: 'GJM12030303',  metricName: 'rms', unit: 'mm/s', baseline: 1.7,  noise: 0.18, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },

  // === GJM12 大车行走机构 ===
  { id: 'VT-12', deviceCode: 'GJM12', mpCode: 'GJM120401',    metricName: 'rms', unit: 'mm/s', baseline: 3.0,  noise: 0.12, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-13', deviceCode: 'GJM12', mpCode: 'GJM120401',    metricName: 'rms', unit: 'mm/s', baseline: 2.7,  noise: 0.14, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-14', deviceCode: 'GJM12', mpCode: 'GJM120402',    metricName: 'rms', unit: 'mm/s', baseline: 2.9,  noise: 0.13, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-15', deviceCode: 'GJM12', mpCode: 'GJM120402',    metricName: 'rms', unit: 'mm/s', baseline: 2.4,  noise: 0.16, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
  { id: 'VT-16', deviceCode: 'GJM12', mpCode: 'GJM120403',    metricName: 'rms', unit: 'mm/s', baseline: 3.1,  noise: 0.10, min: 0, max: 45, warning: 4.5, critical: 7.1, sampleRateHz: 12800, type: 'vibration' },
];

// 每个传感器也产生温度数据（电机/减速箱温度）
const TEMP_SENSORS: SensorDef[] = [
  { id: 'VT-01', deviceCode: 'GJM12', mpCode: 'GJM120304', metricName: 'temperature', unit: 'degC', baseline: 55, noise: 0.05, min: -10, max: 150, warning: 80, critical: 100, sampleRateHz: 1, type: 'temperature' },
  { id: 'VT-03', deviceCode: 'GJM12', mpCode: 'GJM12030404', metricName: 'temperature', unit: 'degC', baseline: 60, noise: 0.04, min: -10, max: 150, warning: 75, critical: 90, sampleRateHz: 1, type: 'temperature' },
  { id: 'VT-07', deviceCode: 'GJM12', mpCode: 'GJM120303', metricName: 'temperature', unit: 'degC', baseline: 48, noise: 0.06, min: -10, max: 150, warning: 75, critical: 90, sampleRateHz: 1, type: 'temperature' },
  { id: 'VT-12', deviceCode: 'GJM12', mpCode: 'GJM120401', metricName: 'temperature', unit: 'degC', baseline: 52, noise: 0.05, min: -10, max: 150, warning: 75, critical: 90, sampleRateHz: 1, type: 'temperature' },
];

// ── 数据生成 ──────────────────────────────────────────────

const ANOMALY_PROBABILITY = 0.05; // 5% 异常概率

/** 高斯分布随机数（Box-Muller） */
function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
}

/** 生成单条传感器读数，遵守物理约束 */
function generateReading(sensor: SensorDef): { value: number; quality: 'good' | 'uncertain' | 'bad'; isAnomaly: boolean } {
  const isAnomaly = Math.random() < ANOMALY_PROBABILITY;

  let value: number;
  let quality: 'good' | 'uncertain' | 'bad' = 'good';

  if (isAnomaly) {
    // 异常：值在 warning ~ critical 之间，偶尔超 critical
    const exceedCritical = Math.random() < 0.2;
    if (exceedCritical) {
      value = sensor.critical * (1 + Math.random() * 0.3);
      quality = 'bad';
    } else {
      value = sensor.warning + Math.random() * (sensor.critical - sensor.warning);
      quality = 'uncertain';
    }
  } else {
    // 正常：基线 ± 噪声（高斯分布）
    const stddev = sensor.baseline * sensor.noise;
    value = gaussianRandom(sensor.baseline, stddev);
  }

  // 物理约束裁剪
  value = Math.max(sensor.min, Math.min(sensor.max, value));
  // 保留 2 位小数
  value = Math.round(value * 100) / 100;

  return { value, quality, isAnomaly };
}

// ── ClickHouse 格式化 ─────────────────────────────────────

/** DateTime64(3) 格式：'YYYY-MM-DD HH:mm:ss.SSS' */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

// ── 主循环 ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const countIdx = args.indexOf('--count');
  const maxCount = countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : Infinity;

  const chHost = process.env.CLICKHOUSE_HOST || 'localhost';
  const chPort = process.env.CLICKHOUSE_PORT || '8123';
  const chUser = process.env.CLICKHOUSE_USER || 'default';
  const chPassword = process.env.CLICKHOUSE_PASSWORD || '';
  const chDatabase = process.env.CLICKHOUSE_DATABASE || 'portai_timeseries';

  console.log(`[sensor-simulator] Connecting to ClickHouse ${chHost}:${chPort}/${chDatabase}`);

  let client: ClickHouseClient;
  try {
    client = createClient({
      url: `http://${chHost}:${chPort}`,
      username: chUser,
      password: chPassword,
      database: chDatabase,
    });
    // 验证连接
    const result = await client.query({ query: 'SELECT 1' });
    await result.json();
    console.log('[sensor-simulator] ClickHouse connected');
  } catch (err: any) {
    console.error(`[sensor-simulator] ClickHouse connection failed: ${err.message}`);
    process.exit(1);
  }

  let running = true;
  let totalWritten = 0;
  let totalAnomalies = 0;
  let iteration = 0;

  // SIGINT 优雅退出
  process.on('SIGINT', () => {
    console.log('\n[sensor-simulator] SIGINT received, stopping...');
    running = false;
  });

  const allSensors = [...SENSORS, ...TEMP_SENSORS];

  console.log(`[sensor-simulator] Starting: ${SENSORS.length} vibration + ${TEMP_SENSORS.length} temperature sensors, ${ANOMALY_PROBABILITY * 100}% anomaly rate`);
  console.log(`[sensor-simulator] Writing to tables: sensor_readings + realtime_telemetry`);
  if (maxCount < Infinity) {
    console.log(`[sensor-simulator] Will write ${maxCount} iterations then exit`);
  }

  while (running && iteration < maxCount) {
    iteration++;
    const now = new Date();
    const ts = formatTimestamp(now);
    const batchId = `sim-${now.getTime()}`;

    // 生成所有传感器读数
    const sensorReadingsRows: Array<Record<string, unknown>> = [];
    const telemetryRows: Array<Record<string, unknown>> = [];
    let batchAnomalies = 0;

    for (const sensor of allSensors) {
      const { value, quality, isAnomaly } = generateReading(sensor);
      if (isAnomaly) batchAnomalies++;

      // sensor_readings (V1)
      sensorReadingsRows.push({
        device_id: sensor.deviceCode,
        sensor_id: sensor.id,
        metric_name: sensor.metricName,
        value,
        unit: sensor.unit,
        quality,
        timestamp: ts,
        received_at: ts,
        metadata: JSON.stringify({ simulator: true, sampleRate: sensor.sampleRateHz }),
      });

      // realtime_telemetry (V5)
      telemetryRows.push({
        timestamp: ts,
        device_code: sensor.deviceCode,
        mp_code: sensor.mpCode,
        metric_name: sensor.metricName,
        value,
        quality_score: quality === 'good' ? 1.0 : quality === 'uncertain' ? 0.6 : 0.2,
        sampling_rate_hz: sensor.sampleRateHz,
        source_protocol: 'simulator',
        batch_id: batchId,
      });
    }

    // 批量写入
    try {
      await Promise.all([
        client.insert({
          table: 'sensor_readings',
          values: sensorReadingsRows,
          format: 'JSONEachRow',
        }),
        client.insert({
          table: 'realtime_telemetry',
          values: telemetryRows,
          format: 'JSONEachRow',
        }),
      ]);

      totalWritten += allSensors.length;
      totalAnomalies += batchAnomalies;

      if (iteration % 10 === 0 || batchAnomalies > 0) {
        console.log(
          `[sensor-simulator] #${iteration} | ${allSensors.length} readings written | ` +
          `anomalies: ${batchAnomalies} | total: ${totalWritten} rows, ${totalAnomalies} anomalies`
        );
      }
    } catch (err: any) {
      console.error(`[sensor-simulator] Write failed: ${err.message}`);
    }

    // 等待 1 秒（可被 SIGINT 中断）
    if (running && iteration < maxCount) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        if (!running) {
          clearTimeout(timer);
          resolve();
        }
      });
    }
  }

  // 打印最终统计
  console.log('\n[sensor-simulator] === Final Statistics ===');
  console.log(`  Iterations:      ${iteration}`);
  console.log(`  Total rows:      ${totalWritten}`);
  console.log(`  Total anomalies: ${totalAnomalies}`);
  console.log(`  Anomaly rate:    ${totalWritten > 0 ? ((totalAnomalies / totalWritten) * 100).toFixed(1) : 0}%`);

  // 验证 ClickHouse 数据
  try {
    const sr = await client.query({ query: 'SELECT count() as cnt FROM sensor_readings' });
    const srResult = await sr.json<{ cnt: string }>();
    const rt = await client.query({ query: 'SELECT count() as cnt FROM realtime_telemetry' });
    const rtResult = await rt.json<{ cnt: string }>();
    console.log(`  sensor_readings:    ${(srResult as any).data?.[0]?.cnt ?? 'N/A'} rows`);
    console.log(`  realtime_telemetry: ${(rtResult as any).data?.[0]?.cnt ?? 'N/A'} rows`);
  } catch {
    console.log('  (Could not query final counts)');
  }

  await client.close();
  console.log('[sensor-simulator] Done.');
}

main().catch((err) => {
  console.error('[sensor-simulator] Fatal error:', err);
  process.exit(1);
});
