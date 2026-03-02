/**
 * 客户界面专属布局
 * 独立侧边栏 (6 菜单) + 简化 topbar + 内容区域
 * 不复用平台的 MainLayout / Sidebar，完全独立
 */
import { Suspense } from 'react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import {
  Activity,
  Stethoscope,
  Bell,
  Settings,
  Wrench,
  BarChart3,
  ArrowRightLeft,
  RefreshCw,
  Upload,
} from 'lucide-react';

// ── 客户导航配置（内联，不依赖 navigationConfig）──────────
const CUSTOMER_NAV = [
  { key: 'health',     label: '设备健康', icon: Activity,     path: '/app' },
  { key: 'diagnosis',  label: '智能诊断', icon: Stethoscope,  path: '/app/diagnosis' },
  { key: 'alerts',     label: '预警处置', icon: Bell,          path: '/app/alerts' },
  { key: 'equipment',  label: '设备管理', icon: Settings,      path: '/app/equipment' },
  { key: 'config',     label: '基础配置', icon: Wrench,        path: '/app/config' },
  { key: 'algorithms', label: '算法工具', icon: BarChart3,     path: '/app/algorithms' },
  { key: 'import',     label: '数据导入', icon: Upload,       path: '/app/import' },
] as const;

export interface CustomerLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function CustomerLayout({ children, title }: CustomerLayoutProps) {
  const [location, setLocation] = useLocation();
  const { systemStatus } = useAppStore();

  // 匹配当前活动菜单（支持 /app/diagnosis/:deviceCode 等子路径）
  const activeKey = CUSTOMER_NAV.find((nav) => {
    if (nav.path === '/app') return location === '/app';
    return location.startsWith(nav.path);
  })?.key ?? 'health';

  return (
    <div className="h-screen bg-background flex">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-radial from-primary/10 to-transparent opacity-50" />
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-radial from-purple/8 to-transparent opacity-50" />
      </div>

      {/* ── 侧边栏 ─────────────────────────────────────── */}
      <aside className="fixed left-0 top-0 h-screen w-[180px] bg-gradient-to-b from-sidebar to-background border-r border-sidebar-border z-50 flex flex-col overflow-hidden">
        {/* Brand */}
        <div className="shrink-0 p-2.5 border-b border-sidebar-border">
          <h1 className="font-bold flex items-center gap-1.5 text-sm">
            <img
              src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663271388233/lrbfSYMnZzxyEVGx.png"
              alt="PortAI Nexus"
              className="w-6 h-6 object-contain shrink-0"
            />
            <span className="gradient-text truncate">PortAI Nexus</span>
          </h1>
          <p className="text-[9px] text-muted-foreground mt-0.5 tracking-wider">
            客户服务平台
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          {CUSTOMER_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = activeKey === item.key;
            return (
              <div
                key={item.key}
                onClick={() => setLocation(item.path)}
                className={cn(
                  'flex items-center gap-2 mx-1.5 px-2 py-2 rounded-md cursor-pointer transition-all duration-200 relative group',
                  'hover:bg-sidebar-accent',
                  isActive && 'text-sidebar-primary bg-sidebar-primary/10',
                )}
              >
                {/* Left border indicator */}
                <div
                  className={cn(
                    'absolute left-0 top-0 bottom-0 w-[2px] bg-sidebar-primary transform scale-y-0 transition-transform duration-200',
                    isActive && 'scale-y-100',
                  )}
                />
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-xs font-medium text-sidebar-foreground group-hover:text-foreground truncate">
                  {item.label}
                </span>
              </div>
            );
          })}
        </nav>

        {/* Footer — 切换到平台界面 */}
        <div className="shrink-0 p-2 border-t border-sidebar-border bg-background/50">
          <div
            onClick={() => setLocation('/dashboard')}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span className="text-[11px]">切换到平台界面</span>
          </div>
        </div>
      </aside>

      {/* ── 主内容区 ───────────────────────────────────── */}
      <main className="h-screen flex flex-col ml-[180px] flex-1 relative z-10">
        {/* Topbar */}
        <header className="h-10 glass border-b border-border sticky top-0 z-40 flex items-center justify-between px-4">
          <h1 className="text-sm font-semibold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            {title ?? '客户服务平台'}
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-card rounded-full text-[10px]">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  systemStatus.api === 'running' ? 'bg-green-500' : 'bg-red-500',
                )}
              />
              <span className="text-muted-foreground">
                {systemStatus.api === 'running' ? '运行中' : '已停止'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.reload()}
              className="gap-1.5 h-7 text-[11px] px-2.5"
            >
              <RefreshCw className="w-3 h-3" />
              刷新
            </Button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-3 overflow-y-auto min-h-0">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">加载中...</span>
            </div>
          }>
            {children}
          </Suspense>
        </div>
      </main>
    </div>
  );
}
