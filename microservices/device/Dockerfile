# 设备管理服务 — 设备/传感器 CRUD、拓扑、协议适配
FROM node:20-alpine AS builder
WORKDIR /app

COPY microservices/shared-kernel/package.json ./shared-kernel/
RUN cd shared-kernel && npm ci --production=false
COPY microservices/shared-kernel/ ./shared-kernel/
RUN cd shared-kernel && npm run build

COPY microservices/device/package.json ./service/
RUN cd service && npm ci --production=false
COPY microservices/device/ ./service/
RUN cd service && npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache dumb-init curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app
COPY --from=builder --chown=nodejs:nodejs /app/shared-kernel/dist ./shared-kernel/dist
COPY --from=builder --chown=nodejs:nodejs /app/shared-kernel/package.json ./shared-kernel/
COPY --from=builder --chown=nodejs:nodejs /app/service/dist ./service/dist
COPY --from=builder --chown=nodejs:nodejs /app/service/package.json ./service/
COPY --from=builder --chown=nodejs:nodejs /app/service/node_modules ./service/node_modules

USER nodejs
ENV NODE_ENV=production SERVICE_NAME=device HTTP_PORT=3001 GRPC_PORT=50051
EXPOSE 3001 50051

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "service/dist/index.js"]
