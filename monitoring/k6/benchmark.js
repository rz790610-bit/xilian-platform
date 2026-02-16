/**
 * ============================================================
 * 西联平台 — K6 性能基准测试
 * ============================================================
 * 
 * 覆盖 7 个微服务的核心 API 端点
 * 映射平台文件: server/routers.ts 中注册的所有 tRPC procedure
 * 
 * 执行方式:
 *   k6 run --env BASE_URL=https://api-staging.xilian.io monitoring/k6/benchmark.js
 *   k6 run --env BASE_URL=http://localhost:3000/api monitoring/k6/benchmark.js
 * 
 * 输出: HTML 报告 + Prometheus Remote Write
 * ============================================================
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

// ── 自定义指标 ──
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency', true);
const requestCount = new Counter('total_requests');

// ── 配置 ──
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// ── 测试场景 ──
export const options = {
  scenarios: {
    // 场景 1: 冒烟测试 — 验证基本功能
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },

    // 场景 2: 负载测试 — 正常流量
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // 爬升到 50 VU
        { duration: '5m', target: 50 },   // 保持 50 VU
        { duration: '2m', target: 100 },  // 爬升到 100 VU
        { duration: '5m', target: 100 },  // 保持 100 VU
        { duration: '2m', target: 0 },    // 降到 0
      ],
      startTime: '30s',
      tags: { scenario: 'load' },
    },

    // 场景 3: 压力测试 — 超出正常容量
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '5m', target: 300 },
        { duration: '2m', target: 0 },
      ],
      startTime: '17m',
      tags: { scenario: 'stress' },
    },

    // 场景 4: 峰值测试 — 突发流量
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 },  // 瞬间 500 VU
        { duration: '1m', target: 500 },
        { duration: '10s', target: 0 },
      ],
      startTime: '33m',
      tags: { scenario: 'spike' },
    },
  },

  thresholds: {
    // SLO 阈值
    http_req_duration: [
      'p(50)<200',   // P50 < 200ms
      'p(90)<500',   // P90 < 500ms
      'p(99)<1000',  // P99 < 1s
    ],
    errors: ['rate<0.01'],          // 错误率 < 1%
    http_req_failed: ['rate<0.01'], // HTTP 失败率 < 1%
  },
};

// ── 请求头 ──
const headers = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {}),
};

// ── 测试函数 ──
export default function () {
  // API Gateway — 健康检查
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`, { headers, tags: { api: 'health' } });
    const success = check(res, {
      'health: status 200': (r) => r.status === 200,
      'health: response time < 100ms': (r) => r.timings.duration < 100,
      'health: body contains status': (r) => {
        try { return JSON.parse(r.body).status !== undefined; } catch { return false; }
      },
    });
    errorRate.add(!success);
    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  // 设备服务 — 列表查询
  group('Device Service', () => {
    const listRes = http.get(`${BASE_URL}/devices?page=1&pageSize=20`, { headers, tags: { api: 'device-list' } });
    check(listRes, {
      'devices.list: status 200': (r) => r.status === 200,
      'devices.list: response time < 300ms': (r) => r.timings.duration < 300,
      'devices.list: has data array': (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
      },
    });
    errorRate.add(listRes.status !== 200);
    apiLatency.add(listRes.timings.duration);
    requestCount.add(1);
  });

  // 算法服务 — FFT 执行
  group('Algorithm Service', () => {
    // 生成模拟振动信号（1024 点）
    const signalData = Array.from({ length: 1024 }, (_, i) =>
      Math.sin(2 * Math.PI * 50 * i / 25600) +
      0.5 * Math.sin(2 * Math.PI * 120 * i / 25600) +
      0.1 * Math.random()
    );

    const execRes = http.post(`${BASE_URL}/algorithms/execute`, JSON.stringify({
      algorithmType: 'fft',
      signalData,
      sampleRate: 25600,
      parameters: { windowFunction: 'hanning', fftSize: 2048 },
    }), { headers, tags: { api: 'algorithm-fft' }, timeout: '30s' });

    check(execRes, {
      'algorithm.fft: status 200': (r) => r.status === 200,
      'algorithm.fft: response time < 5s': (r) => r.timings.duration < 5000,
      'algorithm.fft: has result': (r) => {
        try { return JSON.parse(r.body).result !== undefined; } catch { return false; }
      },
    });
    errorRate.add(execRes.status !== 200);
    apiLatency.add(execRes.timings.duration);
    requestCount.add(1);
  });

  // 数据管道 — 列表查询
  group('Pipeline Service', () => {
    const res = http.get(`${BASE_URL}/pipelines`, { headers, tags: { api: 'pipeline-list' } });
    check(res, {
      'pipelines.list: status 200': (r) => r.status === 200,
      'pipelines.list: response time < 300ms': (r) => r.timings.duration < 300,
    });
    errorRate.add(res.status !== 200);
    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  // 知识服务 — 语义搜索
  group('Knowledge Service', () => {
    const searchRes = http.post(`${BASE_URL}/knowledge/search`, JSON.stringify({
      query: '轴承故障诊断',
      topK: 10,
      useGraphExpansion: true,
    }), { headers, tags: { api: 'knowledge-search' }, timeout: '10s' });

    check(searchRes, {
      'knowledge.search: status 200': (r) => r.status === 200,
      'knowledge.search: response time < 2s': (r) => r.timings.duration < 2000,
      'knowledge.search: has results': (r) => {
        try { return Array.isArray(JSON.parse(r.body).results); } catch { return false; }
      },
    });
    errorRate.add(searchRes.status !== 200);
    apiLatency.add(searchRes.timings.duration);
    requestCount.add(1);
  });

  // 监控服务 — 告警列表
  group('Monitoring Service', () => {
    const res = http.get(`${BASE_URL}/alerts?page=1&pageSize=20`, { headers, tags: { api: 'alert-list' } });
    check(res, {
      'alerts.list: status 200': (r) => r.status === 200,
      'alerts.list: response time < 300ms': (r) => r.timings.duration < 300,
    });
    errorRate.add(res.status !== 200);
    apiLatency.add(res.timings.duration);
    requestCount.add(1);
  });

  sleep(1);
}

// ── HTML 报告输出 ──
export function handleSummary(data) {
  return {
    'benchmark-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics;
  const lines = [
    '╔══════════════════════════════════════════════════════╗',
    '║          西联平台 性能基准测试报告                    ║',
    '╠══════════════════════════════════════════════════════╣',
    `║ 总请求数: ${metrics.total_requests?.values?.count ?? 'N/A'}`,
    `║ 错误率:   ${((metrics.errors?.values?.rate ?? 0) * 100).toFixed(2)}%`,
    `║ P50 延迟: ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(0) ?? 'N/A'}ms`,
    `║ P90 延迟: ${metrics.http_req_duration?.values?.['p(90)']?.toFixed(0) ?? 'N/A'}ms`,
    `║ P99 延迟: ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(0) ?? 'N/A'}ms`,
    `║ 最大延迟: ${metrics.http_req_duration?.values?.max?.toFixed(0) ?? 'N/A'}ms`,
    '╚══════════════════════════════════════════════════════╝',
  ];
  return lines.join('\n');
}
