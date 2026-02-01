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
    <header className="h-10 glass border-b border-border sticky top-0 z-40 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={toggleSidebar}
          className="lg:hidden h-7 w-7"
        >
          <Menu className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-card rounded-full text-[10px]">
          <div className="flex items-center gap-1">
            <span 
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                systemStatus.api === 'running' ? "bg-green-500" : "bg-red-500"
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
          className="gap-1.5 h-7 text-[11px] px-2.5"
        >
          <RefreshCw className="w-3 h-3" />
          刷新
        </Button>
      </div>
    </header>
  );
}
