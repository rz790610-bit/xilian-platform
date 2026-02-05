# 西联智能平台 - 代码同步指南

## 最新修复 (2026-02-05)

### 修复内容
- **30个前端页面文件**的空值安全检查
- 所有 `.map()` 调用添加空数组默认值 `(data || []).map(...)`
- 所有对象属性访问添加可选链操作符 `data?.property`
- 修复 `undefined is not an object` 类型错误

### 测试结果
- ✅ 929 个单元测试全部通过
- ✅ TypeScript 编译无错误
- ✅ 所有页面在沙箱环境中测试通过
- ✅ 无 JavaScript 控制台错误

## 同步方法

### 方法 1: 从 Manus 管理界面导出

1. 在 Manus 界面点击 **Settings** → **GitHub**
2. 选择您的 GitHub 账户和仓库
3. 点击 **Export to GitHub**

### 方法 2: 手动下载并覆盖

1. 在 Manus 界面点击 **Code** 面板
2. 点击 **Download All Files** 下载完整项目
3. 解压后覆盖您本地的项目目录
4. 运行 `pnpm install` 安装依赖
5. 运行 `pnpm dev` 启动开发服务器

### 方法 3: 使用 Git Patch

如果您已经有本地修改不想丢失，可以：

1. 在本地创建备份分支：`git checkout -b backup`
2. 切回主分支：`git checkout main`
3. 下载最新代码并覆盖
4. 使用 `git diff` 对比差异
5. 手动合并您的修改

## 本地运行验证

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 设置 SKIP_AUTH=true

# 3. 启动开发服务器
pnpm dev

# 4. 运行测试
pnpm test
```

## 关键配置

确保您的 `.env` 文件包含：

```env
SKIP_AUTH=true
NODE_ENV=development
DATABASE_URL=mysql://portai:portai123@localhost:3306/portai_nexus
```

## 问题排查

如果仍然遇到 `undefined is not an object` 错误：

1. 确保 `.env` 文件在项目根目录
2. 确保 `SKIP_AUTH=true` 已设置
3. 重启开发服务器：`pnpm dev`
4. 清除浏览器缓存后刷新页面

## 联系支持

如有问题，请在 Manus 对话中描述具体错误信息。
