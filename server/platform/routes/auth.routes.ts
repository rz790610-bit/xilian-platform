import { router, publicProcedure, protectedProcedure } from "../../core/trpc";
import { authService } from "../services/auth.service";
import { z } from "zod";

export const authRoutes = router({
  // 登录验证 — 公开端点（用户尚未持有 token）
  validate: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(({ input }) => authService.validateToken(input.token)),

  // 刷新 token — 需要已认证
  refresh: protectedProcedure
    .mutation(async ({ ctx }) => {
      return authService.generateToken({ userId: (ctx.user as any).id, role: (ctx.user as any).role || 'user' });
    }),

  // 获取当前用户信息 — 需要已认证
  me: protectedProcedure
    .query(({ ctx }) => {
      return { user: ctx.user };
    }),
});
