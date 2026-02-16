# 数据管道服务 — 流处理、Pipeline 引擎、ClickHouse 写入、CQRS
FROM node:20-alpine AS builder
WORKDIR /app

COPY microservices/shared-kernel/package.json ./shared-kernel/
RUN cd shared-kernel && npm ci --production=false
COPY microservices/shared-kernel/ ./shared-kernel/
RUN cd shared-kernel && npm run build

COPY microservices/data-pipeline/package.json ./service/
RUN cd service && npm ci --production=false
COPY microservices/data-pipeline/ ./service/
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
ENV NODE_ENV=production SERVICE_NAME=data-pipeline HTTP_PORT=3003 GRPC_PORT=50053
EXPOSE 3003 50053

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3003/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "service/dist/index.js"]
