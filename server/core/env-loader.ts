/**
 * PortAI Nexus — dotenv 分层加载器
 * 
 * 整改方案 v2.1 — B-05 配置管理分层
 * 
 * 加载优先级（后加载的覆盖先加载的）：
 *   1. .env.development / .env.production（按 NODE_ENV 选择）
 *   2. .env.local（个人覆盖，不提交到 Git）
 *   3. 环境变量（最高优先级，包括命令行 PORT=3001 pnpm dev）
 * 
 * 注意：此文件必须在所有其他 import 之前执行（side-effect import）。
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '../../');

function loadIfExists(filePath: string): boolean {
  const fullPath = resolve(ROOT, filePath);
  if (existsSync(fullPath)) {
    // override: false 表示不覆盖已存在的环境变量
    // 但我们按从低优先级到高优先级的顺序加载，所以用 override: true
    dotenvConfig({ path: fullPath, override: true });
    return true;
  }
  return false;
}

// 按优先级从低到高加载（后加载的覆盖先加载的）
const nodeEnv = process.env.NODE_ENV || 'development';
const loaded: string[] = [];

// 第 1 层：环境特定配置（团队共享默认值）
if (loadIfExists(`.env.${nodeEnv}`)) {
  loaded.push(`.env.${nodeEnv}`);
}

// 第 2 层：个人覆盖（不提交到 Git）
if (loadIfExists('.env.local')) {
  loaded.push('.env.local');
}

// 第 3 层：通用 .env（兼容旧配置）
if (loadIfExists('.env')) {
  loaded.push('.env');
}

// 静默输出加载的文件列表（debug 级别，不会在 info 下显示）
if (loaded.length > 0 && process.env.LOG_LEVEL === 'debug') {
  // 使用 console 而非 logger（logger 尚未初始化）
  console.debug(`[env-loader] Loaded config files: ${loaded.join(' → ')}`);
}

export { loaded as loadedEnvFiles };
