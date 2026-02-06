import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

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
    // 本地开发模式，使用模拟用户
    user = LOCAL_DEV_USER;
  } else {
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
