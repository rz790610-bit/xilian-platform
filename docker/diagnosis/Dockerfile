# HDE Diagnosis Service — 独立 gRPC 微服务
# 端口: gRPC :50054, HTTP health :3095

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
ENV DIAGNOSIS_GRPC_PORT=50054
ENV DIAGNOSIS_HEALTH_PORT=3095

EXPOSE 50054 3095

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:3095/healthz || exit 1

CMD ["node", "dist/server/platform/diagnosis/diagnosis-entrypoint.js"]
