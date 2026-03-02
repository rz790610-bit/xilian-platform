# Algorithm Service — 独立 gRPC 微服务
# 端口: gRPC :50052, HTTP health :3080

FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/proto ./proto
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV ALGORITHM_SERVICE_PORT=50052
ENV ALGORITHM_HEALTH_PORT=3080

EXPOSE 50052 3080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:3080/healthz || exit 1

CMD ["node", "dist/server/platform/algorithm/algorithm-service-entrypoint.js"]
