# 监控告警服务 — 告警规则、诊断、可观测性聚合
FROM node:20-alpine AS builder
WORKDIR /app

COPY microservices/shared-kernel/package.json ./shared-kernel/
RUN cd shared-kernel && npm ci --production=false
COPY microservices/shared-kernel/ ./shared-kernel/
RUN cd shared-kernel && npm run build

COPY microservices/monitoring/package.json ./service/
RUN cd service && npm ci --production=false
COPY microservices/monitoring/ ./service/
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
ENV NODE_ENV=production SERVICE_NAME=monitoring HTTP_PORT=3005 GRPC_PORT=50055
EXPOSE 3005 50055

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3005/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "service/dist/index.js"]
