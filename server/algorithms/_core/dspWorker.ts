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
 *   - amplitudeSpectrum / powerSpectralDensity
 *   - filter (butterworth lowpass/highpass/bandpass + applyFilter)
 *   - hilbertTransform / envelope
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
  // ifft 接受 Complex[] 单参数
  return dsp.ifft(p.spectrum);
});

operations.set('stft', (p) => {
  // stft(signal, sampleRate, windowSize?, hopSize?)
  return dsp.stft(p.signal, p.sampleRate, p.windowSize, p.hopSize);
});

operations.set('amplitudeSpectrum', (p) => {
  return dsp.amplitudeSpectrum(p.signal, p.sampleRate);
});

operations.set('powerSpectrum', (p) => {
  // 实际函数名是 powerSpectralDensity
  return dsp.powerSpectralDensity(p.signal, p.sampleRate);
});

// --- 窗函数 ---
operations.set('hanningWindow', (p) => dsp.hanningWindow(p.length));
operations.set('hammingWindow', (p) => dsp.hammingWindow(p.length));
operations.set('blackmanWindow', (p) => dsp.blackmanWindow(p.length));
operations.set('flatTopWindow', (p) => dsp.flatTopWindow(p.length));
operations.set('kaiserWindow', (p) => dsp.kaiserWindow(p.length, p.beta));

// --- 滤波器 ---
// dsp 模块提供 butterworthLowpass/butterworthHighpass/butterworthBandpass → FilterCoefficients
// 然后通过 applyFilter(signal, coeffs) 或 filtfilt(signal, coeffs) 应用
operations.set('filter', (p) => {
  const { signal, sampleRate, type, cutoff, cutoffLow, cutoffHigh, order = 4 } = p;
  let coeffs: dsp.FilterCoefficients;
  switch (type) {
    case 'lowpass':
      coeffs = dsp.butterworthLowpass(order, cutoff, sampleRate);
      break;
    case 'highpass':
      coeffs = dsp.butterworthHighpass(order, cutoff, sampleRate);
      break;
    case 'bandpass':
      coeffs = dsp.butterworthBandpass(order, cutoffLow, cutoffHigh, sampleRate);
      break;
    case 'bandstop':
      // 带阻 = 原始信号 - 带通
      coeffs = dsp.butterworthBandpass(order, cutoffLow, cutoffHigh, sampleRate);
      const bandpassed = dsp.filtfilt(signal, coeffs);
      return signal.map((v: number, i: number) => v - bandpassed[i]);
    default:
      throw new Error(`Unknown filter type: ${type}`);
  }
  return dsp.filtfilt(signal, coeffs);
});

operations.set('lowpassFilter', (p) => {
  const coeffs = dsp.butterworthLowpass(p.order || 4, p.cutoff, p.sampleRate);
  return dsp.filtfilt(p.signal, coeffs);
});

operations.set('highpassFilter', (p) => {
  const coeffs = dsp.butterworthHighpass(p.order || 4, p.cutoff, p.sampleRate);
  return dsp.filtfilt(p.signal, coeffs);
});

operations.set('bandpassFilter', (p) => {
  const coeffs = dsp.butterworthBandpass(p.order || 4, p.cutoffLow, p.cutoffHigh, p.sampleRate);
  return dsp.filtfilt(p.signal, coeffs);
});

operations.set('bandstopFilter', (p) => {
  const coeffs = dsp.butterworthBandpass(p.order || 4, p.cutoffLow, p.cutoffHigh, p.sampleRate);
  const bandpassed = dsp.filtfilt(p.signal, coeffs);
  return p.signal.map((v: number, i: number) => v - bandpassed[i]);
});

// --- 包络分析 ---
operations.set('hilbertTransform', (p) => {
  return dsp.hilbertTransform(p.signal);
});

operations.set('envelopeAnalysis', (p) => {
  // 实际函数名是 envelope
  return dsp.envelope(p.signal);
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
