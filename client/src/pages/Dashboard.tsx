import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { useLocation } from 'wouter';

export default function Dashboard() {
  const { dashboardStats, systemStatus } = useAppStore();
  const [, setLocation] = useLocation();

  const quickActions = [
    { id: 'agents', label: '智能体诊断', icon: '🤖', path: '/agents', variant: 'default' as const },
    { id: 'pipeline', label: 'Pipeline', icon: '🔗', path: '/pipeline', variant: 'secondary' as const },
    { id: 'chat', label: 'AI对话', icon: '💬', path: '/chat', variant: 'secondary' as const },
    { id: 'docs', label: '文档管理', icon: '📄', path: '/docs', variant: 'secondary' as const }
  ];

  return (
    <MainLayout title="系统总览">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">系统总览</h2>
          <p className="text-muted-foreground">平台运行状态和快捷入口</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <StatCard
            value={dashboardStats.agents}
            label="智能体"
            icon="🤖"
          />
          <StatCard
            value={dashboardStats.plugins}
            label="插件数量"
            icon="🧩"
          />
          <StatCard
            value={dashboardStats.documents}
            label="文档数量"
            icon="📄"
          />
          <StatCard
            value={dashboardStats.models}
            label="模型数量"
            icon="🧠"
          />
        </div>

        {/* Quick actions and status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PageCard title="快捷入口" icon="⚡">
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Button
                  key={action.id}
                  variant={action.variant}
                  className="h-auto py-3 justify-start gap-2"
                  onClick={() => setLocation(action.path)}
                >
                  <span className="text-lg">{action.icon}</span>
                  {action.label}
                </Button>
              ))}
            </div>
          </PageCard>

          <PageCard title="系统状态" icon="📊">
            <div className="space-y-0">
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground">API服务</span>
                <Badge variant={systemStatus.api === 'running' ? 'success' : 'danger'} dot>
                  {systemStatus.api === 'running' ? '运行中' : '已停止'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-border">
                <span className="text-muted-foreground">Ollama</span>
                <Badge variant={systemStatus.ollama === 'connected' ? 'success' : 'danger'} dot>
                  {systemStatus.ollama === 'connected' ? '已连接' : '未连接'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-3">
                <span className="text-muted-foreground">当前模型</span>
                <span className="text-foreground font-medium">{systemStatus.currentModel}</span>
              </div>
            </div>
          </PageCard>
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
          <PageCard title="最近诊断" icon="🔬" className="lg:col-span-2">
            <div className="text-center py-8 text-muted-foreground">
              <span className="text-4xl block mb-3">📋</span>
              暂无诊断记录
            </div>
          </PageCard>

          <PageCard title="系统通知" icon="🔔">
            <div className="space-y-3">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-success">●</span>
                  <span>系统运行正常</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">刚刚</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-primary">●</span>
                  <span>模型已加载</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">2分钟前</div>
              </div>
            </div>
          </PageCard>
        </div>
      </div>
    </MainLayout>
  );
}
