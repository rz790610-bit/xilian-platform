import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { config } from "./config";
import { createModuleLogger } from "./logger";

const log = createModuleLogger('context');

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// 本地开发模式的模拟用户
const LOCAL_DEV_USER: User = {
  id: 1,
  openId: "local-dev-user",
  name: "本地开发用户",
  email: "dev@localhost",
  loginMethod: "local",
  role: "admin",
  lastSignedIn: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // 检查是否为本地开发模式
  const skipAuth = process.env.SKIP_AUTH === "true";

  if (skipAuth) {
    // P0-S02 修复：生产环境下禁止 SKIP_AUTH，防止误部署导致全站 admin 权限泄露
    if (config.app.env === "production") {
      log.fatal("SKIP_AUTH=true is forbidden in production — ignoring and requiring real authentication");
      // 生产环境强制走真实认证，不使用 LOCAL_DEV_USER
    } else {
      // 仅开发/测试环境允许跳过认证
      user = LOCAL_DEV_USER;
      log.debug("Using LOCAL_DEV_USER (SKIP_AUTH=true, non-production)");
    }
  }

  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
