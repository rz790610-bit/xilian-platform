/**
 * DSP Worker 线程入口
 *
 * 运行在独立的 Worker Thread 中，接收主线程的计算任务，
 * 调用 DSP 核心库执行计算，返回结果。
 *
 * 通信协议：
 *   主线程 → Worker: WorkerTask { taskId, operation, payload, timeout }
 *   Worker → 主线程: WorkerResponse { taskId, success, result?, error?, durationMs }
 *
 * 支持的操作：
 *   - fft / ifft / stft
 *   - amplitudeSpectrum / powerSpectrum
 *   - filter (lowpass/highpass/bandpass/bandstop)
 *   - hilbertTransform / envelopeAnalysis
 *   - crossCorrelation / autocorrelation
 *   - 统计函数 (rms, crestFactor, kurtosis, etc.)
 *   - evaluateVibrationSeverity
 *   - 批量操作 (batch)
 */
import { parentPort, workerData } from 'node:worker_threads';
import type { WorkerTask, WorkerResponse } from './workerPool';

// 直接导入 DSP 核心库 — 每个 Worker 线程独立加载一份
import * as dsp from './dsp';

const workerId: number = workerData?.workerId ?? 0;

// ============================================================
// 操作注册表 — 将字符串操作名映射到 DSP 函数
// ============================================================

type OperationHandler = (payload: Record<string, any>) => any;

const operations: Map<string, OperationHandler> = new Map();

// --- FFT 系列 ---
operations.set('fft', (p) => {
  return dsp.fft(p.signal);
});

operations.set('ifft', (p) => {
  return dsp.ifft(p.real, p.imag);
});

operations.set('stft', (p) => {
  return dsp.stft(p.signal, p.windowSize, p.hopSize, p.sampleRate);
});

operations.set('amplitudeSpectrum', (p) => {
  return dsp.amplitudeSpectrum(p.signal, p.sampleRate);
});

operations.set('powerSpectrum', (p) => {
  return dsp.powerSpectrum(p.signal, p.sampleRate);
});

// --- 窗函数 ---
operations.set('hanningWindow', (p) => dsp.hanningWindow(p.length));
operations.set('hammingWindow', (p) => dsp.hammingWindow(p.length));
operations.set('blackmanWindow', (p) => dsp.blackmanWindow(p.length));
operations.set('flatTopWindow', (p) => dsp.flatTopWindow(p.length));
operations.set('kaiserWindow', (p) => dsp.kaiserWindow(p.length, p.beta));

// --- 滤波器 ---
operations.set('filter', (p) => {
  const { signal, sampleRate, type, cutoff, cutoffLow, cutoffHigh, order } = p;
  switch (type) {
    case 'lowpass':
      return dsp.lowpassFilter(signal, cutoff, sampleRate, order);
    case 'highpass':
      return dsp.highpassFilter(signal, cutoff, sampleRate, order);
    case 'bandpass':
      return dsp.bandpassFilter(signal, cutoffLow, cutoffHigh, sampleRate, order);
    case 'bandstop':
      return dsp.bandstopFilter(signal, cutoffLow, cutoffHigh, sampleRate, order);
    default:
      throw new Error(`Unknown filter type: ${type}`);
  }
});

operations.set('lowpassFilter', (p) => {
  return dsp.lowpassFilter(p.signal, p.cutoff, p.sampleRate, p.order);
});

operations.set('highpassFilter', (p) => {
  return dsp.highpassFilter(p.signal, p.cutoff, p.sampleRate, p.order);
});

operations.set('bandpassFilter', (p) => {
  return dsp.bandpassFilter(p.signal, p.cutoffLow, p.cutoffHigh, p.sampleRate, p.order);
});

operations.set('bandstopFilter', (p) => {
  return dsp.bandstopFilter(p.signal, p.cutoffLow, p.cutoffHigh, p.sampleRate, p.order);
});

// --- 包络分析 ---
operations.set('hilbertTransform', (p) => {
  return dsp.hilbertTransform(p.signal);
});

operations.set('envelopeAnalysis', (p) => {
  return dsp.envelopeAnalysis(p.signal, p.sampleRate);
});

// --- 相关性 ---
operations.set('crossCorrelation', (p) => {
  return dsp.crossCorrelation(p.signalA, p.signalB);
});

operations.set('autocorrelation', (p) => {
  return dsp.autocorrelation(p.signal);
});

// --- 统计函数 ---
operations.set('rms', (p) => dsp.rms(p.signal));
operations.set('crestFactor', (p) => dsp.crestFactor(p.signal));
operations.set('peakToPeak', (p) => dsp.peakToPeak(p.signal));
operations.set('skewness', (p) => dsp.skewness(p.signal));
operations.set('kurtosis', (p) => dsp.kurtosis(p.signal));
operations.set('mean', (p) => dsp.mean(p.signal));
operations.set('standardDeviation', (p) => dsp.standardDeviation(p.signal));

// --- 振动评估 ---
operations.set('evaluateVibrationSeverity', (p) => {
  return dsp.evaluateVibrationSeverity(p.rmsVelocity, p.machineGroup);
});

// --- 批量操作 ---
operations.set('batch', (p) => {
  const results: Record<string, any> = {};
  for (const [name, op] of Object.entries(p.operations as Record<string, { operation: string; payload: Record<string, any> }>)) {
    const handler = operations.get(op.operation);
    if (!handler) {
      results[name] = { error: `Unknown operation: ${op.operation}` };
    } else {
      try {
        results[name] = handler(op.payload);
      } catch (err: any) {
        results[name] = { error: err.message };
      }
    }
  }
  return results;
});

// ============================================================
// 消息处理
// ============================================================

if (parentPort) {
  parentPort.on('message', (task: WorkerTask) => {
    const startTime = performance.now();

    try {
      const handler = operations.get(task.operation);
      if (!handler) {
        const response: WorkerResponse = {
          taskId: task.taskId,
          success: false,
          error: `Unknown DSP operation: ${task.operation}. Available: ${Array.from(operations.keys()).join(', ')}`,
          durationMs: Math.round(performance.now() - startTime),
        };
        parentPort!.postMessage(response);
        return;
      }

      const result = handler(task.payload);

      const response: WorkerResponse = {
        taskId: task.taskId,
        success: true,
        result,
        durationMs: Math.round(performance.now() - startTime),
      };
      parentPort!.postMessage(response);

    } catch (err: any) {
      const response: WorkerResponse = {
        taskId: task.taskId,
        success: false,
        error: `[Worker #${workerId}] ${err.message}`,
        durationMs: Math.round(performance.now() - startTime),
      };
      parentPort!.postMessage(response);
    }
  });

  // Worker 就绪信号
  parentPort.postMessage({
    taskId: '__ready__',
    success: true,
    result: { workerId, operations: Array.from(operations.keys()) },
    durationMs: 0,
  } satisfies WorkerResponse);
}
