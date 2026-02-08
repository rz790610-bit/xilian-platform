/**
 * 自适应采样管理页面
 * 实时监控触发采样调整，容量问题 1 分钟内响应
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Settings2
} from 'lucide-react';

export default function AdaptiveSampling() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('status');
  const [editConfig, setEditConfig] = useState<any>(null);

  // tRPC 查询
  const { data: status, refetch: refetchStatus } = trpc.adaptiveSampling.getStatus.useQuery();
  const { data: configs, refetch: refetchConfigs } = trpc.adaptiveSampling.listConfigs.useQuery();
  const { data: thresholds } = trpc.adaptiveSampling.getThresholds.useQuery();

  // tRPC mutations
  const updateConfigMutation = trpc.adaptiveSampling.updateConfig.useMutation({
    onSuccess: () => {
      toast.success('采样配置已更新');
      setEditConfig(null);
      refetchConfigs();
    },
    onError: (err: { message: string }) => toast.error(`更新失败: ${err.message}`),
  });

  const handleRefresh = () => {
    refetchStatus();
    refetchConfigs();
    toast.success('数据已刷新');
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'normal': return 'success';
      case 'warning': return 'warning';
      case 'critical': return 'danger';
      default: return 'default';
    }
  };

  // thresholds 是 Record<string, ThresholdConfig>，需要转为数组
  const thresholdEntries = thresholds
    ? Object.entries(thresholds).map(([key, value]) => ({ key, ...(value as any) }))
    : [];

  return (
    <MainLayout title="自适应采样">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="服务状态" value={status?.isRunning ? '运行中' : '已停止'} icon="📉" />
        <StatCard label="总检查" value={status?.totalChecks || 0} icon="🔍" />
        <StatCard label="调整次数" value={status?.adjustmentsMade || 0} icon="🔧" />
        <StatCard
          label="整体状态"
          value={status?.currentOverallStatus || 'unknown'}
          icon="📊"
        />
        <StatCard
          label="正常检查"
          value={status?.consecutiveNormalChecks || 0}
          icon="✅"
        />
        <StatCard
          label="最后调整"
          value={status?.lastAdjustmentTime ? new Date(status.lastAdjustmentTime).toLocaleTimeString() : '无'}
          icon="⏰"
        />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={status?.isRunning ? 'success' : 'danger'}>
            {status?.isRunning ? '监控运行中' : '监控已停止'}
          </Badge>
          <Badge variant={getStatusColor(status?.currentOverallStatus || 'unknown') as any}>
            容量: {status?.currentOverallStatus || 'unknown'}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />
          刷新
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="status">运行状态</TabsTrigger>
          <TabsTrigger value="configs">采样配置</TabsTrigger>
          <TabsTrigger value="thresholds">阈值设置</TabsTrigger>
        </TabsList>

        <TabsContent value="status">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 最近调整 */}
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4">最近采样调整</h3>
                <div className="space-y-3">
                  {status?.lastAdjustments?.map((adj: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <div className="font-medium text-sm">{adj.deviceId || '全局'} - {adj.sensorType || ''}</div>
                        <div className="text-xs text-muted-foreground">
                          {adj.oldRateMs}ms → {adj.newRateMs}ms
                        </div>
                      </div>
                      <Badge variant={adj.direction === 'up' ? 'warning' : 'success'}>
                        {adj.direction === 'up' ? '↑ 增加' : '↓ 降低'}
                      </Badge>
                    </div>
                  ))}
                  {(!status?.lastAdjustments || status.lastAdjustments.length === 0) && (
                    <div className="text-center py-4 text-muted-foreground">暂无调整记录</div>
                  )}
                </div>
              </div>
            </PageCard>

            {/* 容量状态 */}
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4">容量状态</h3>
                {status?.lastCapacityStatus ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">Kafka 积压</span>
                        <span className="text-sm font-mono">{status.lastCapacityStatus.kafkaLag}</span>
                      </div>
                      <Progress
                        value={Math.min((status.lastCapacityStatus.kafkaLag / 100000) * 100, 100)}
                        className="h-2"
                      />
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">DB 连接数</span>
                        <span className="text-sm font-mono">{status.lastCapacityStatus.dbConnections}</span>
                      </div>
                      <Progress
                        value={Math.min((status.lastCapacityStatus.dbConnections / 200) * 100, 100)}
                        className="h-2"
                      />
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">内存使用</span>
                        <span className="text-sm font-mono">{status.lastCapacityStatus.memoryUsagePct}%</span>
                      </div>
                      <Progress value={status.lastCapacityStatus.memoryUsagePct} className="h-2" />
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">CPU 使用</span>
                        <span className="text-sm font-mono">{status.lastCapacityStatus.cpuUsagePct}%</span>
                      </div>
                      <Progress value={status.lastCapacityStatus.cpuUsagePct} className="h-2" />
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm">队列深度</span>
                        <span className="text-sm font-mono">{status.lastCapacityStatus.queueDepth}</span>
                      </div>
                      <Progress
                        value={Math.min((status.lastCapacityStatus.queueDepth / 10000) * 100, 100)}
                        className="h-2"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">暂无容量数据</div>
                )}
              </div>
            </PageCard>
          </div>
        </TabsContent>

        <TabsContent value="configs">
          <PageCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">设备类型</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">基础采样率</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">最小/最大</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">自适应</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">优先级</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {configs?.map((config: any) => (
                    <tr key={config.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-medium">{config.deviceType}</td>
                      <td className="p-3 font-mono">{config.baseSamplingRateMs}ms</td>
                      <td className="p-3 font-mono text-xs">
                        {config.minSamplingRateMs}ms / {config.maxSamplingRateMs}ms
                      </td>
                      <td className="p-3">
                        <Badge variant={config.adaptiveEnabled ? 'success' : 'default'}>
                          {config.adaptiveEnabled ? '启用' : '禁用'}
                        </Badge>
                      </td>
                      <td className="p-3">{config.priority}</td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditConfig(config)}
                        >
                          <Settings2 className="w-3 h-3 mr-1" />
                          编辑
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!configs || configs.length === 0) && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        暂无采样配置
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="thresholds">
          <PageCard>
            <div className="p-4">
              <h3 className="font-semibold mb-4">容量阈值配置</h3>
              <div className="space-y-3">
                {thresholdEntries.map((threshold: any) => (
                  <div key={threshold.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="font-medium">{threshold.key}</div>
                      <div className="text-sm text-muted-foreground">
                        警告: {threshold.warningThreshold} | 严重: {threshold.criticalThreshold}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      扩容: x{threshold.scaleUpFactor} | 缩容: x{threshold.scaleDownFactor}
                    </div>
                  </div>
                ))}
                {thresholdEntries.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">使用默认阈值配置</div>
                )}
              </div>
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>

      {/* 编辑配置对话框 */}
      {editConfig && (
        <Dialog open={!!editConfig} onOpenChange={() => setEditConfig(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑采样配置 - {editConfig.deviceType}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">基础采样率 (ms)</label>
                <Input
                  type="number"
                  value={editConfig.baseSamplingRateMs}
                  onChange={(e) => setEditConfig({ ...editConfig, baseSamplingRateMs: parseInt(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">最小采样率 (ms)</label>
                  <Input
                    type="number"
                    value={editConfig.minSamplingRateMs}
                    onChange={(e) => setEditConfig({ ...editConfig, minSamplingRateMs: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">最大采样率 (ms)</label>
                  <Input
                    type="number"
                    value={editConfig.maxSamplingRateMs}
                    onChange={(e) => setEditConfig({ ...editConfig, maxSamplingRateMs: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">启用自适应</label>
                <Switch
                  checked={editConfig.adaptiveEnabled}
                  onCheckedChange={(v) => setEditConfig({ ...editConfig, adaptiveEnabled: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditConfig(null)}>取消</Button>
              <Button onClick={() => updateConfigMutation.mutate(editConfig)}>
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </MainLayout>
  );
}
