#!/bin/bash
# PortAI Nexus 本地部署修复脚本
# 解决页面闪烁和组件错误问题

set -e

echo "=========================================="
echo "PortAI Nexus 本地部署修复脚本"
echo "=========================================="

# 检查是否在项目目录中
if [ ! -f "package.json" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo ""
echo "1. 修复 env.ts - 确保 dotenv 在模块加载时就生效..."
cat > server/_core/env.ts << 'EOF'
import 'dotenv/config';

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "local-dev-secret-key-12345678",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  skipAuth: process.env.SKIP_AUTH === "true",
};

console.log('[ENV] SKIP_AUTH loaded:', ENV.skipAuth);
EOF
echo "   ✓ env.ts 已修复"

echo ""
echo "2. 修复 vite.ts - 禁用 HMR 防止 WebSocket 连接问题..."
if grep -q "hmr: { server }," server/_core/vite.ts 2>/dev/null; then
    sed -i.bak 's/hmr: { server },/hmr: false,  \/\/ Disable HMR for local deployment/' server/_core/vite.ts
    echo "   ✓ vite.ts HMR 已禁用"
else
    echo "   ⚠ vite.ts HMR 配置未找到或已修复"
fi

echo ""
echo "3. 检查 .env 文件..."
if [ ! -f ".env" ]; then
    echo "   创建 .env 文件..."
    cat > .env << 'EOF'
# PortAI Nexus 本地开发环境配置
NODE_ENV=development
SKIP_AUTH=true
JWT_SECRET=local-dev-secret-key-12345678
DATABASE_URL=mysql://portai:portai123@localhost:3306/portai_nexus

# 本地开发 OAuth 配置（可选）
VITE_OAUTH_PORTAL_URL=http://localhost:3002
OAUTH_SERVER_URL=http://localhost:3002

# 分析服务（可选）
VITE_ANALYTICS_WEBSITE_ID=local-dev
VITE_ANALYTICS_ENDPOINT=http://localhost:9999
EOF
    echo "   ✓ .env 文件已创建"
else
    # 确保 SKIP_AUTH=true 存在
    if ! grep -q "SKIP_AUTH=true" .env; then
        echo "SKIP_AUTH=true" >> .env
        echo "   ✓ 已添加 SKIP_AUTH=true 到 .env"
    fi
    
    # 确保 NODE_ENV=development
    if grep -q "NODE_ENV=production" .env; then
        sed -i.bak 's/NODE_ENV=production/NODE_ENV=development/' .env
        echo "   ✓ 已将 NODE_ENV 改为 development"
    fi
    
    echo "   ✓ .env 文件已检查"
fi

echo ""
echo "4. 检查 sdk.ts 中的 SKIP_AUTH 逻辑..."
if ! grep -q "ENV.skipAuth" server/_core/sdk.ts 2>/dev/null; then
    echo "   ⚠ 需要手动添加 SKIP_AUTH 逻辑到 sdk.ts"
    echo "   请在 authenticateRequest 函数开头添加以下代码："
    echo ""
    echo '    // Skip auth for local development'
    echo '    if (ENV.skipAuth) {'
    echo '      console.log("[Auth] SKIP_AUTH enabled, creating local dev user...");'
    echo '      let localUser = await db.getUserByOpenId("local-dev-user");'
    echo '      if (!localUser) {'
    echo '        await db.upsertUser({'
    echo '          openId: "local-dev-user",'
    echo '          name: "本地开发用户",'
    echo '          email: "local@dev.local",'
    echo '          loginMethod: "local",'
    echo '          role: "admin",'
    echo '          lastSignedIn: new Date(),'
    echo '        });'
    echo '        localUser = await db.getUserByOpenId("local-dev-user");'
    echo '      }'
    echo '      if (localUser) {'
    echo '        return localUser;'
    echo '      }'
    echo '    }'
else
    echo "   ✓ SKIP_AUTH 逻辑已存在"
fi

echo ""
echo "=========================================="
echo "修复完成！"
echo "=========================================="
echo ""
echo "请运行以下命令启动服务："
echo "  pnpm dev"
echo ""
echo "然后访问: http://localhost:3000"
echo ""
