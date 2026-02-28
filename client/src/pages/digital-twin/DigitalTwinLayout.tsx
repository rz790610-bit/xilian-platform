/**
 * ============================================================================
 * 数字孪生独立模块 — 布局组件
 * ============================================================================
 *
 * 提供：
 *   - 设备选择器
 *   - 概览统计卡片
 *   - 子页面路由出口
 */
import { useEffect, lazy, Suspense } from 'react';
import { Route, Switch, useLocation, useRoute } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTwinStore } from '@/stores/twinStore';
import { syncStatusMap } from './constants';

import EquipmentStatusPage from './EquipmentStatusPage';
import SimulationPage from './SimulationPage';
import ReplayPage from './ReplayPage';
import WorldModelPage from './WorldModelPage';
import RuntimeConfigPage from './RuntimeConfigPage';

const Twin3DViewer = lazy(() => import('@/components/digital-twin/Twin3DViewer'));

const tabs = [
  { key: 'status', label: '设备状态', path: '/digital-twin' },
  { key: 'simulation', label: '仿真推演', path: '/digital-twin/simulation' },
  { key: 'replay', label: '历史回放', path: '/digital-twin/replay' },
  { key: 'worldmodel', label: '世界模型', path: '/digital-twin/worldmodel' },
  { key: '3d', label: '三维视图', path: '/digital-twin/3d' },
  { key: 'config', label: '⚙️ 运行配置', path: '/digital-twin/config' },
] as const;

export default function DigitalTwinLayout() {
  const { selectedEquipmentId, setSelectedEquipment } = useTwinStore();
  const [location, setLocation] = useLocation();

  // tRPC: 设备列表
  const twinsQuery = trpc.evoPipeline.listEquipmentTwins.useQuery(undefined, {
    refetchInterval: 10000, retry: 2,
  });
  const twins = twinsQuery.data ?? [];
  const selectedTwin = selectedEquipmentId ?? (twins.length > 0 ? (twins[0] as any).equipmentId : null);

  // 自动选择第一个设备
  useEffect(() => {
    if (!selectedEquipmentId && twins.length > 0) {
      setSelectedEquipment((twins[0] as any).equipmentId);
    }
  }, [twins, selectedEquipmentId, setSelectedEquipment]);

  // 当前激活的 tab
  const activeTab = tabs.find(t => location === t.path) ?? tabs[0];

  return (
    <MainLayout title="数字孪生">
      <div className="space-y-2 p-2">
        {/* 顶部：设备选择器 + 概览统计 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedTwin ?? ''} onValueChange={(v) => setSelectedEquipment(v)}>
            <SelectTrigger className="w-56 h-7 text-xs">
              <SelectValue placeholder="选择设备..." />
            </SelectTrigger>
            <SelectContent>
              {twins.map((t: any) => (
                <SelectItem key={t.equipmentId} value={t.equipmentId}>
                  <span className="font-mono text-[10px] mr-1">{t.equipmentId}</span>
                  <span className="text-xs">{t.equipmentName}</span>
                  <Badge variant={syncStatusMap[t.syncStatus]?.color ?? 'default'} className="ml-1.5 text-[9px] px-1">
                    {syncStatusMap[t.syncStatus]?.label ?? t.syncStatus}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 概览统计卡片 */}
          <div className="flex gap-1.5 flex-1">
            <StatCard compact value={twins.length} label="设备总数" icon="🏭" />
            <StatCard compact value={twins.filter((t: any) => t.syncStatus === 'synced').length} label="在线" icon="🟢" />
            <StatCard compact
              value={twins.filter((t: any) => t.healthScore != null && t.healthScore < 60).length}
              label="需关注" icon="⚠️"
            />
          </div>
        </div>

        {/* 子页面 Tab 导航 */}
        <div className="flex gap-0.5 border-b border-border pb-0">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setLocation(tab.path)}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab.key === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 子页面路由 */}
        {selectedTwin ? (
          <Switch>
            <Route path="/digital-twin">
              <EquipmentStatusPage equipmentId={selectedTwin} />
            </Route>
            <Route path="/digital-twin/simulation">
              <SimulationPage equipmentId={selectedTwin} />
            </Route>
            <Route path="/digital-twin/replay">
              <ReplayPage equipmentId={selectedTwin} />
            </Route>
            <Route path="/digital-twin/worldmodel">
              <WorldModelPage equipmentId={selectedTwin} />
            </Route>
            <Route path="/digital-twin/3d">
              <Suspense fallback={<div className="text-center py-8 text-xs text-muted-foreground">加载三维模块...</div>}>
                <Twin3DViewer equipmentId={selectedTwin} />
              </Suspense>
            </Route>
            <Route path="/digital-twin/config">
              <RuntimeConfigPage />
            </Route>
          </Switch>
        ) : (
          <PageCard title="数字孪生" icon={<span>🔮</span>}>
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                {twinsQuery.isLoading ? '正在加载设备列表...' : '暂无设备数据，请确保 equipment_profiles 表已有数据'}
              </p>
            </div>
          </PageCard>
        )}
      </div>
    </MainLayout>
  );
}
