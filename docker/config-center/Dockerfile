# Config Center — 独立 HTTP 微服务
# 端口: HTTP :8900

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
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV CONFIG_CENTER_PORT=8900

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:8900/healthz || exit 1

CMD ["node", "dist/server/platform/config/config-center-entrypoint.js"]
