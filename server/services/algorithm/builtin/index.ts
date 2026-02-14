/**
 * ============================================================================
 * 内置算法统一入口
 * ============================================================================
 * 
 * 所有 builtin 算法通过 implRef 路由到对应的执行函数。
 * 新增算法只需：
 * 1. 在对应分类文件中实现 execute 函数
 * 2. 在此文件的 registry 中注册映射
 */

import { signalProcessingAlgorithms } from './signal-processing';
import { analyticsAlgorithms } from './analytics';

/** 内置算法注册表 */
const builtinRegistry: Record<
  string,
  (inputData: any, config: Record<string, unknown>) => Promise<Record<string, unknown>>
> = {
  // 信号处理（8 个）
  ...signalProcessingAlgorithms,

  // 分析与诊断（8 个）
  ...analyticsAlgorithms,
};

/**
 * 执行内置算法
 * @param implRef 算法实现引用（与注册中心的 id 对应）
 * @param inputData 输入数据
 * @param config 配置参数
 */
export async function execute(
  inputData: any,
  config: Record<string, unknown>,
  implRef?: string
): Promise<Record<string, unknown>> {
  // implRef 可能通过 config 传入
  const ref = implRef || (config.__implRef as string);

  if (!ref) {
    throw new Error('Missing implRef for builtin algorithm execution');
  }

  const fn = builtinRegistry[ref];
  if (!fn) {
    throw new Error(
      `Builtin algorithm not found: ${ref}. Available: ${Object.keys(builtinRegistry).join(', ')}`
    );
  }

  return fn(inputData, config);
}

/** 列出所有已注册的内置算法 */
export function listBuiltinAlgorithms(): string[] {
  return Object.keys(builtinRegistry);
}

/** 检查内置算法是否存在 */
export function hasBuiltinAlgorithm(implRef: string): boolean {
  return implRef in builtinRegistry;
}

export default { execute, listBuiltinAlgorithms, hasBuiltinAlgorithm };
