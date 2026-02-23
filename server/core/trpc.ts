import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { createAuditLogMiddleware } from '../platform/middleware/auditLog';
import { createTrpcTracingMiddleware } from '../platform/middleware/opentelemetry';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

// CR-03: OTel tracing middleware — 自动为所有 tRPC 调用创建 span
// 每个 API 调用自动生成 trpc.query/trpc.mutation span，包含 rpc.method 属性
const tracing = t.middleware(createTrpcTracingMiddleware());

export const publicProcedure = t.procedure.use(tracing);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// 审计日志 middleware（拦截所有 mutation，异步写入 audit_logs 表）
const auditLog = t.middleware(createAuditLogMiddleware());

export const protectedProcedure = t.procedure.use(tracing).use(requireUser).use(auditLog);

export const adminProcedure = t.procedure.use(tracing).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
).use(auditLog);
