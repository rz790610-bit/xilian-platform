# ============================================================
# PortAI Nexus — Industrial AI Platform
# Docker Multi-stage Build for Production Deployment
# ============================================================
# 使用 node:22-slim (Debian) 而非 alpine，因为 onnxruntime-node
# 依赖 glibc 原生二进制，alpine 的 musl libc 不兼容。
# ============================================================

# ── Stage 1: 构建阶段 ──
FROM node:25-slim AS builder

WORKDIR /app

# 安装构建工具（部分原生模块需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件和补丁
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# 安装全部依赖（含 devDependencies 用于构建 + optionalDependencies 含 onnxruntime-node）
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建应用（Vite 前端 + esbuild 后端）
RUN pnpm build

# ── Stage 2: 生产阶段 ──
FROM node:25-slim AS production

WORKDIR /app

# 安装运行时依赖（onnxruntime-node 需要 libstdc++）
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 创建非 root 用户
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs portai

# 复制依赖文件和补丁
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# 安装生产依赖（--prod 排除 devDeps，但保留 optionalDeps 即 onnxruntime-node）
RUN pnpm install --frozen-lockfile --prod

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist

# 复制必要的运行时文件
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/server/platform/evolution/models/world-model-lstm.onnx ./models/world-model-lstm.onnx
COPY --from=builder /app/docker ./docker

# 复制环境配置模板
COPY .env.development .env.development

# 验证 onnxruntime-node 可加载
RUN node -e "try { require('onnxruntime-node'); console.log('✅ onnxruntime-node OK'); } catch(e) { console.warn('⚠️  onnxruntime-node not available:', e.message); }"

# 设置权限
RUN chown -R portai:nodejs /app

# 切换到非 root 用户
USER portai

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/rest/_health || exit 1

# 启动命令
CMD ["node", "dist/index.js"]
