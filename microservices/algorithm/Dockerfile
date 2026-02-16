# 算法执行服务 — DSP/ML/诊断算法、模型管理、插件引擎
FROM node:20-alpine AS builder
WORKDIR /app

COPY microservices/shared-kernel/package.json ./shared-kernel/
RUN cd shared-kernel && npm ci --production=false
COPY microservices/shared-kernel/ ./shared-kernel/
RUN cd shared-kernel && npm run build

COPY microservices/algorithm/package.json ./service/
RUN cd service && npm ci --production=false
COPY microservices/algorithm/ ./service/
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
ENV NODE_ENV=production SERVICE_NAME=algorithm HTTP_PORT=3002 GRPC_PORT=50052
EXPOSE 3002 50052

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3002/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "service/dist/index.js"]
