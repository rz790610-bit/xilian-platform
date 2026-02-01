import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Button } from '@/components/ui/button';
import { RefreshCw, Menu } from 'lucide-react';

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { systemStatus, sidebarCollapsed, toggleSidebar } = useAppStore();

  const handleRefresh = () => {
    // 刷新系统状态
    window.location.reload();
  };

  return (
    <header className="h-16 glass border-b border-border sticky top-0 z-40 flex items-center justify-between px-7">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={toggleSidebar}
          className="lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-semibold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2.5 px-4 py-2 bg-card rounded-full text-sm">
          <div className="flex items-center gap-1.5">
            <span 
              className={cn(
                "status-dot",
                systemStatus.api === 'running' ? "status-dot-success" : "status-dot-danger"
              )}
            />
            <span className="text-muted-foreground">
              {systemStatus.api === 'running' ? '运行中' : '已停止'}
            </span>
          </div>
        </div>

        <Button 
          variant="secondary" 
          size="sm"
          onClick={handleRefresh}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </Button>
      </div>
    </header>
  );
}
