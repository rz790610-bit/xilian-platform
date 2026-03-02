/**
 * ============================================================================
 * ToolFramework 单例 + 工厂函数
 * ============================================================================
 *
 * 遵循 ARCH-002: 单例 + get/reset 工厂函数。
 *
 * 初始化流程：
 *   1. 创建 ToolFramework 实例
 *   2. 注册 7 个内置工具（BUILTIN_TOOLS）
 *   3. 注册专业工具（annotation, training, evaluation, tuning）
 *   4. 创建 ToolSandbox 实例
 *   5. 返回已就绪的框架
 *
 * 使用方式：
 *   const fw = getToolFramework();
 *   const result = await fw.execute('query_device_state', input, context);
 */

import { ToolFramework, type ToolDefinition } from './tool-framework';
import { BUILTIN_TOOLS } from '../tools/builtin-tools';
import { ToolSandbox } from '../tools/tool-sandbox';
import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('tool-framework');

// ============================================================================
// 单例状态
// ============================================================================

let _framework: ToolFramework | null = null;
let _sandbox: ToolSandbox | null = null;

/** 动态注册的工具（来自 API 注册） */
let _dynamicTools: Map<string, ToolDefinition> = new Map();

// ============================================================================
// 初始化
// ============================================================================

function initializeFramework(): ToolFramework {
  const fw = new ToolFramework();

  // 1. 注册内置工具（7 个核心工具）
  fw.registerAll(BUILTIN_TOOLS);
  log.info({ count: BUILTIN_TOOLS.length }, '内置工具已注册');

  // 2. 注册专业工具（annotation, training, evaluation, tuning）
  try {
    // 懒加载专业工具定义（避免循环依赖）
    const { annotationTool } = require('../tools/annotation-tool');
    const { trainingTool } = require('../tools/training-tool');
    const { evaluationTool } = require('../tools/evaluation-tool');
    const { tuningTool } = require('../tools/tuning-tool');

    const specializedTools: ToolDefinition[] = [
      annotationTool, trainingTool, evaluationTool, tuningTool,
    ].filter(Boolean);

    fw.registerAll(specializedTools);
    log.info({ count: specializedTools.length }, '专业工具已注册');
  } catch (err) {
    log.warn({ err }, '专业工具加载失败，降级为仅内置工具');
  }

  // 3. 恢复动态注册的工具
  for (const tool of _dynamicTools.values()) {
    fw.register(tool);
  }
  if (_dynamicTools.size > 0) {
    log.info({ count: _dynamicTools.size }, '动态工具已恢复');
  }

  log.info('ToolFramework 初始化完成');
  return fw;
}

// ============================================================================
// 工厂函数
// ============================================================================

/** 获取全局 ToolFramework 单例 */
export function getToolFramework(): ToolFramework {
  if (!_framework) {
    _framework = initializeFramework();
  }
  return _framework;
}

/** 重置 ToolFramework 单例（用于测试） */
export function resetToolFramework(): void {
  _framework = null;
  _dynamicTools = new Map();
  log.info('ToolFramework 单例已重置');
}

/** 获取全局 ToolSandbox 单例 */
export function getToolSandbox(): ToolSandbox {
  if (!_sandbox) {
    _sandbox = new ToolSandbox();
    log.info('ToolSandbox 初始化完成');
  }
  return _sandbox;
}

/** 重置 ToolSandbox 单例（用于测试） */
export function resetToolSandbox(): void {
  _sandbox = null;
}

// ============================================================================
// 动态工具管理
// ============================================================================

/**
 * 动态注册工具（通过 API 注册，persist across framework resets）
 */
export function registerDynamicTool(tool: ToolDefinition): void {
  _dynamicTools.set(tool.id, tool);
  if (_framework) {
    _framework.register(tool);
  }
  log.info({ toolId: tool.id, name: tool.name }, '动态工具已注册');
}

/**
 * 注销动态工具
 */
export function unregisterDynamicTool(toolId: string): boolean {
  const existed = _dynamicTools.delete(toolId);
  if (existed) {
    log.info({ toolId }, '动态工具已注销，需重启生效');
  }
  return existed;
}

/**
 * 获取已注册工具的摘要信息
 */
export function getToolSummary(): {
  builtinCount: number;
  dynamicCount: number;
  totalCount: number;
  tools: { id: string; name: string; category: string; version: string }[];
} {
  const fw = getToolFramework();
  const discovered = fw.discover();
  return {
    builtinCount: BUILTIN_TOOLS.length,
    dynamicCount: _dynamicTools.size,
    totalCount: discovered.length,
    tools: discovered.map(t => ({
      id: t.id,
      name: t.name,
      category: 'unknown', // discover() doesn't return category
      version: '1.0.0',
    })),
  };
}
