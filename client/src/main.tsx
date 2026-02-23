import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

import { createLogger } from '@/lib/logger';
const log = createLogger('main');

// [P3-E1 修复] 配置全局 staleTime，避免窗口重新聚焦时频繁重新请求
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 分钟内认为数据新鲜，不重新获取
      refetchOnWindowFocus: false, // 禁止窗口聚焦时自动重新获取
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // [P2-E1 修复] 本地开发认证跳过改为环境变量控制，避免 hostname 检测在 Docker Compose 环境中失效
  // 实际的 SKIP_AUTH 由服务端控制（见批次 13-14 P1-D1），前端仅做视觉行为匹配
  const isLocalDev = import.meta.env.DEV || 
    window.location.hostname === "localhost" || 
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith('.local');
  if (isLocalDev) {
    log.info("[Auth] Skipping redirect in local development (hostname:", window.location.hostname, ")");
    return;
  }

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    log.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    log.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
