/**
 * 图查询优化管理页面
 * Nebula 索引 + LOOKUP 优化，查询快 10 倍
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw, Plus, Trash2, Search, Play, Zap
} from 'lucide-react';

export default function GraphQueryManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [showCreateIndex, setShowCreateIndex] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [useCache, setUseCache] = useState(true);
  const [newIndex, setNewIndex] = useState({
    tagName: '',
    indexName: '',
    fields: '',
    indexType: 'tag' as 'tag' | 'edge',
  });

  // tRPC 查询
  // getStats 返回: GraphQueryStats & { isRunning, indexCount, cacheSize }
  const { data: stats, refetch: refetchStats } = trpc.graphQuery.getStats.useQuery();
  // listIndexes 返回: GraphIndexConfig[]
  const { data: indexes, refetch: refetchIndexes } = trpc.graphQuery.listIndexes.useQuery();

  // analyzeQuery 是 query，需要手动触发
  const [analyzeEnabled, setAnalyzeEnabled] = useState(false);
  const { data: queryPlan, refetch: refetchAnalyze } = trpc.graphQuery.analyzeQuery.useQuery(
    { query: queryInput },
    { enabled: analyzeEnabled && !!queryInput }
  );

  // tRPC mutations
  const createIndexMutation = trpc.graphQuery.createIndex.useMutation({
    onSuccess: () => {
      toast.success('索引创建成功');
      setShowCreateIndex(false);
      setNewIndex({ tagName: '', indexName: '', fields: '', indexType: 'tag' });
      refetchIndexes();
      refetchStats();
    },
    onError: (err: { message: string }) => toast.error(`创建失败: ${err.message}`),
  });

  const dropIndexMutation = trpc.graphQuery.dropIndex.useMutation({
    onSuccess: () => {
      toast.success('索引已删除');
      refetchIndexes();
      refetchStats();
    },
    onError: (err: { message: string }) => toast.error(`删除失败: ${err.message}`),
  });

  const executeQueryMutation = trpc.graphQuery.executeQuery.useMutation({
    onSuccess: (data: any) => {
      toast.success(`查询完成，返回 ${data.data?.length || 0} 条结果，耗时 ${data.queryTimeMs}ms`);
    },
    onError: (err: { message: string }) => toast.error(`查询失败: ${err.message}`),
  });

  const handleAnalyze = () => {
    if (!queryInput) return;
    setAnalyzeEnabled(true);
    refetchAnalyze();
  };

  const handleExecute = () => {
    if (!queryInput) return;
    executeQueryMutation.mutate({ query: queryInput, useCache });
  };

  const handleRefresh = () => {
    refetchStats();
    refetchIndexes();
    toast.success('数据已刷新');
  };

  return (
    <MainLayout title="图查询优化">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-6">
        <StatCard label="服务状态" value={stats?.isRunning ? '运行中' : '已停止'} icon="🔗" />
        <StatCard label="总查询" value={stats?.totalQueries || 0} icon="🔍" />
        <StatCard label="索引查询" value={stats?.indexedQueries || 0} icon="⚡" />
        <StatCard label="全扫描" value={stats?.fullScanQueries || 0} icon="🐌" />
        <StatCard label="慢查询" value={stats?.slowQueries || 0} icon="🐢" />
        <StatCard label="缓存命中" value={stats?.cacheHits || 0} icon="💾" />
        <StatCard label="索引数" value={stats?.indexCount || 0} icon="📑" />
        <StatCard label="缓存大小" value={stats?.cacheSize || 0} icon="📦" />
      </div>

      {/* 操作栏 */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <Badge variant={stats?.isRunning ? 'success' : 'danger'}>
            {stats?.isRunning ? '优化器运行中' : '优化器已停止'}
          </Badge>
          <Badge variant="info">
            平均查询: {stats?.avgQueryTimeMs || 0}ms
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" onClick={() => setShowCreateIndex(true)}>
            <Plus className="w-4 h-4 mr-1" />
            创建索引
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">索引管理</TabsTrigger>
          <TabsTrigger value="query">查询分析</TabsTrigger>
          <TabsTrigger value="metrics">性能指标</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <PageCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 font-medium text-muted-foreground">索引名</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">标签/边</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">类型</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">字段</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">状态</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">创建时间</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {indexes?.map((index: any) => (
                    <tr key={index.indexName} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-xs">{index.indexName}</td>
                      <td className="p-3">{index.tagName}</td>
                      <td className="p-3">
                        <Badge variant={index.indexType === 'tag' ? 'info' : 'warning'}>
                          {index.indexType}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-xs">{index.fields.join(', ')}</td>
                      <td className="p-3">
                        <Badge variant={
                          index.status === 'active' ? 'success' :
                          index.status === 'building' ? 'warning' : 'danger'
                        }>
                          {index.status === 'active' ? '活跃' :
                           index.status === 'building' ? '构建中' : '失败'}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {index.createdAt ? new Date(index.createdAt).toLocaleString() : '-'}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => dropIndexMutation.mutate({ indexName: index.indexName })}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          删除
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(!indexes || indexes.length === 0) && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        暂无索引，点击"创建索引"添加
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PageCard>
        </TabsContent>

        <TabsContent value="query">
          <div className="space-y-4">
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4">nGQL 查询分析与执行</h3>
                <Textarea
                  placeholder="输入 nGQL 查询语句，例如: GO FROM 'device_001' OVER connects WHERE connects.latency > 100 YIELD connects.latency"
                  value={queryInput}
                  onChange={(e) => {
                    setQueryInput(e.target.value);
                    setAnalyzeEnabled(false);
                  }}
                  className="font-mono text-sm mb-4"
                  rows={4}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleAnalyze} disabled={!queryInput}>
                    <Search className="w-4 h-4 mr-1" />
                    分析查询
                  </Button>
                  <Button onClick={handleExecute} disabled={!queryInput}>
                    <Play className="w-4 h-4 mr-1" />
                    执行查询
                  </Button>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useCache}
                      onChange={(e) => setUseCache(e.target.checked)}
                    />
                    使用缓存
                  </label>
                </div>
              </div>
            </PageCard>

            {/* 查询计划 */}
            {queryPlan && (
              <PageCard>
                <div className="p-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    查询计划
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">原始查询</div>
                      <code className="text-sm font-mono">{queryPlan.originalQuery}</code>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground mb-1">优化后查询</div>
                      <code className="text-sm font-mono">{queryPlan.optimizedQuery}</code>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground">预估成本</div>
                        <div className="text-lg font-semibold">{queryPlan.estimatedCost}</div>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground">使用索引</div>
                        <div className="text-lg font-semibold">
                          {queryPlan.usedIndexes.length > 0 ? queryPlan.usedIndexes.join(', ') : '无'}
                        </div>
                      </div>
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="text-sm text-muted-foreground">优化项</div>
                        <div className="text-lg font-semibold">{queryPlan.optimizations.length}</div>
                      </div>
                    </div>
                    {queryPlan.optimizations.length > 0 && (
                      <div className="p-3 bg-success/10 border border-success/20 rounded-lg">
                        <div className="text-sm font-medium mb-2">应用的优化</div>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {queryPlan.optimizations.map((opt: string, i: number) => (
                            <li key={i}>{opt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </PageCard>
            )}

            {/* 执行结果 */}
            {executeQueryMutation.data && (
              <PageCard>
                <div className="p-4">
                  <h3 className="font-semibold mb-4">执行结果</h3>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">返回行数</div>
                      <div className="text-lg font-semibold">{executeQueryMutation.data.data?.length || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">查询耗时</div>
                      <div className="text-lg font-semibold">{executeQueryMutation.data.queryTimeMs}ms</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">来源</div>
                      <div className="text-lg font-semibold">
                        {executeQueryMutation.data.indexUsed ? '索引查询' : '全扫描'}
                      </div>
                    </div>
                  </div>
                  <pre className="bg-muted/50 p-3 rounded-lg text-sm font-mono overflow-x-auto max-h-[300px]">
                    {JSON.stringify(executeQueryMutation.data.data, null, 2)}
                  </pre>
                </div>
              </PageCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4">查询性能</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">总查询</div>
                      <div className="text-lg font-semibold">{stats?.totalQueries || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">索引查询</div>
                      <div className="text-lg font-semibold">{stats?.indexedQueries || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">全扫描查询</div>
                      <div className="text-lg font-semibold">{stats?.fullScanQueries || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">慢查询</div>
                      <div className="text-lg font-semibold">{stats?.slowQueries || 0}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">索引命中率</span>
                      <span className="text-sm font-mono">
                        {stats?.totalQueries
                          ? ((stats.indexedQueries / stats.totalQueries) * 100).toFixed(1) + '%'
                          : '0%'}
                      </span>
                    </div>
                    <Progress
                      value={stats?.totalQueries ? (stats.indexedQueries / stats.totalQueries) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>
            </PageCard>

            <PageCard>
              <div className="p-4">
                <h3 className="font-semibold mb-4">缓存性能</h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">缓存命中</div>
                      <div className="text-lg font-semibold">{stats?.cacheHits || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">缓存未命中</div>
                      <div className="text-lg font-semibold">{stats?.cacheMisses || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">缓存大小</div>
                      <div className="text-lg font-semibold">{stats?.cacheSize || 0}</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-sm text-muted-foreground">平均查询时间</div>
                      <div className="text-lg font-semibold">{stats?.avgQueryTimeMs || 0}ms</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm">缓存命中率</span>
                      <span className="text-sm font-mono">
                        {(stats?.cacheHits || 0) + (stats?.cacheMisses || 0) > 0
                          ? (((stats?.cacheHits || 0) / ((stats?.cacheHits || 0) + (stats?.cacheMisses || 0))) * 100).toFixed(1) + '%'
                          : '0%'}
                      </span>
                    </div>
                    <Progress
                      value={(stats?.cacheHits || 0) + (stats?.cacheMisses || 0) > 0
                        ? ((stats?.cacheHits || 0) / ((stats?.cacheHits || 0) + (stats?.cacheMisses || 0))) * 100
                        : 0}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>
            </PageCard>
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建索引对话框 */}
      <Dialog open={showCreateIndex} onOpenChange={setShowCreateIndex}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建图索引</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">标签/边名称</label>
              <Input
                value={newIndex.tagName}
                onChange={(e) => setNewIndex({ ...newIndex, tagName: e.target.value })}
                placeholder="例如: Device, connects"
              />
            </div>
            <div>
              <label className="text-sm font-medium">索引名称</label>
              <Input
                value={newIndex.indexName}
                onChange={(e) => setNewIndex({ ...newIndex, indexName: e.target.value })}
                placeholder="例如: idx_device_status"
              />
            </div>
            <div>
              <label className="text-sm font-medium">索引字段（逗号分隔）</label>
              <Input
                value={newIndex.fields}
                onChange={(e) => setNewIndex({ ...newIndex, fields: e.target.value })}
                placeholder="例如: status, deviceType"
              />
            </div>
            <div>
              <label className="text-sm font-medium">索引类型</label>
              <Select
                value={newIndex.indexType}
                onValueChange={(v) => setNewIndex({ ...newIndex, indexType: v as 'tag' | 'edge' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Tag 索引</SelectItem>
                  <SelectItem value="edge">Edge 索引</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateIndex(false)}>取消</Button>
            <Button
              onClick={() => createIndexMutation.mutate({
                ...newIndex,
                fields: newIndex.fields.split(',').map(f => f.trim()).filter(Boolean),
              })}
              disabled={!newIndex.tagName || !newIndex.indexName || !newIndex.fields}
            >
              <Plus className="w-4 h-4 mr-1" />
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
