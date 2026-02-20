/**
 * ENV — config.ts 的兼容视图层
 * 
 * 修复 P0-S03: 消除双轨配置系统。
 * 原 env.ts 维护了独立的 cookieSecret 默认值（"local-dev-secret-key-12345678"），
 * 与 config.ts 的 jwtSecret 默认值（"change-me-in-production"）并存，
 * 形成两套密钥系统，任何一套被遗忘更新均构成安全隐患。
 * 
 * 现改为从 config 对象读取对应字段，外部导出保持不变，
 * 确保所有调用方（包括 llm.ts）使用统一的配置来源。
 * 
 * 迁移路径：调用方应逐步迁移到直接使用 config 对象，最终删除此文件。
 * 
 * @deprecated 请直接使用 import { config } from './config'
 */

import { config } from './config';

export const ENV = {
  /** @deprecated 使用 config.app.name */
  appId: process.env.VITE_APP_ID ?? "",

  /** 
   * @deprecated 使用 config.security.jwtSecret
   * 修复: 不再维护独立默认值，统一从 config.security.jwtSecret 读取 
   */
  cookieSecret: config.security.jwtSecret,

  /** @deprecated 使用 config.mysql.url */
  databaseUrl: config.mysql.url,

  /** @deprecated 使用 process.env.OAUTH_SERVER_URL */
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",

  /** @deprecated 使用 process.env.OWNER_OPEN_ID */
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",

  /** @deprecated 使用 config.app.env === 'production' */
  isProduction: config.app.env === "production",

  /** 
   * LLM API URL — 归并到 config.externalApis 下
   * @deprecated 使用 config.externalApis.forgeApiUrl
   */
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",

  /** 
   * LLM API Key — 归并到 config.externalApis 下
   * @deprecated 使用 config.externalApis.forgeApiKey
   */
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  /** 
   * @deprecated SKIP_AUTH 逻辑已集中在 context.ts 中处理
   */
  skipAuth: process.env.SKIP_AUTH === "true",
};
