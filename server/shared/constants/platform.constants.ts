// server/shared/constants/platform.constants.ts
// HDE双轨架构核心常量定义（Phase 0 第一步）

export const PLATFORM_MODE = {
  EVOLUTION: "evolution",   // 进化平台 - 完整推理链 + 知识积累 + 飞轮训练
  COMMERCIAL: "commercial"  // 商业平台 - 固化Bundle + 强物理校验 + 轻量部署
} as const;

export type PlatformMode = typeof PLATFORM_MODE[keyof typeof PLATFORM_MODE];

// 从环境变量读取，默认进化模式（生产环境可设置为 commercial）
export const CURRENT_PLATFORM_MODE: PlatformMode =
  (process.env.PLATFORM_MODE as PlatformMode) ?? PLATFORM_MODE.EVOLUTION;
