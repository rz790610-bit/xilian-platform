import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { knowledgeRouter } from "./knowledge";
import { topologyRouter } from "./topology";
import { modelRouter } from "./modelService";
import { eventBusRouter } from "./eventBus";
import { streamProcessorRouter } from "./streamProcessor";
import { deviceRouter } from "./deviceService";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 知识库路由
  knowledge: knowledgeRouter,

  // 系统拓扑路由
  topology: topologyRouter,

  // 大模型管理路由
  model: modelRouter,

  // 事件总线路由
  eventBus: eventBusRouter,

  // 流处理路由
  stream: streamProcessorRouter,

  // 设备管理路由
  device: deviceRouter,
});

export type AppRouter = typeof appRouter;
