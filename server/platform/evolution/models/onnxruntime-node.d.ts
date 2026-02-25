/**
 * onnxruntime-node 最小类型声明
 * 仅声明 WorldModelEngine 使用到的 API
 * 生产环境安装 onnxruntime-node 后，此文件可被 @types/onnxruntime-node 替代
 */
declare module 'onnxruntime-node' {
  export interface SessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: string;
  }

  export interface RunOptions {
    [key: string]: unknown;
  }

  export interface TensorLike {
    data: Float32Array | Int32Array | Uint8Array | BigInt64Array;
    dims: readonly number[];
    type: string;
  }

  export class Tensor implements TensorLike {
    constructor(
      type: 'float32' | 'int32' | 'uint8' | 'int64',
      data: Float32Array | Int32Array | Uint8Array | BigInt64Array | number[],
      dims: readonly number[],
    );
    readonly data: Float32Array | Int32Array | Uint8Array | BigInt64Array;
    readonly dims: readonly number[];
    readonly type: string;
  }

  export interface InferenceSessionResult {
    [outputName: string]: TensorLike;
  }

  export class InferenceSession {
    static create(
      path: string,
      options?: SessionOptions,
    ): Promise<InferenceSession>;

    run(
      feeds: Record<string, TensorLike>,
      options?: RunOptions,
    ): Promise<InferenceSessionResult>;

    release(): Promise<void>;

    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
  }
}
