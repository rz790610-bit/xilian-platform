/**
 * ============================================================
 * API 网关 / 接入层管理页面 (GatewayManagement.tsx)
 *
 * 基于 accessLayer tRPC router 的 Connector -> Endpoint -> Binding
 * 三级模型提供可视化管理界面:
 * - 概览仪表盘 (连接器/端点/绑定 统计 + 协议分布)
 * - 连接器管理 (CRUD + 健康检查 + 连接测试)
 * - 端点管理 (按连接器查看 + CRUD)
 * - 插件管理 (plugin router 的列表 + 启用/禁用/卸载)
 * - 绑定管理 (端点与目标的绑定关系)
 * ============================================================
 */

import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// ── 工具函数 ──

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  return new Date(d).toLocaleString('zh-CN');
}

// ── 状态色标映射 ──

const STATUS_VARIANTS: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  connected: 'default',
  draft: 'outline',
  testing: 'secondary',
  disconnected: 'secondary',
  error: 'destructive',
  active: 'default',
  inactive: 'secondary',
  healthy: 'default',
  unhealthy: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  connected: '已连接',
  draft: '草稿',
  testing: '测试中',
  disconnected: '已断开',
  error: '异常',
  active: '活跃',
  inactive: '未激活',
};

// ============================================================
// 概览仪表盘 Tab
// ============================================================
function DashboardTab() {
  const statsQuery = trpc.accessLayer.getStats.useQuery();
  const protocolsQuery = trpc.accessLayer.listProtocols.useQuery();
  const batchHealthCheck = trpc.accessLayer.batchHealthCheck.useMutation();
  const seedDemoData = trpc.accessLayer.seedDemoData.useMutation();
  const toast = useToast();
  const utils = trpc.useUtils();

  const stats = statsQuery.data;
  const protocols = protocolsQuery.data;

  const handleBatchHealthCheck = async () => {
    try {
      const result = await batchHealthCheck.mutateAsync();
      toast.success(`批量健康检查完成: ${result.healthy} 健康, ${result.unhealthy} 异常`);
      utils.accessLayer.getStats.invalidate();
      utils.accessLayer.listConnectors.invalidate();
    } catch (err: any) {
      toast.error(err.message || '批量健康检查失败');
    }
  };

  const handleSeedDemo = async () => {
    try {
      const result = await seedDemoData.mutateAsync();
      if (result.seeded) {
        toast.success(result.message);
        utils.accessLayer.getStats.invalidate();
        utils.accessLayer.listConnectors.invalidate();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err.message || '演示数据加载失败');
    }
  };

  if (statsQuery.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="py-8 text-center text-muted-foreground animate-pulse">
              加载中...
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (statsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          加载统计数据失败: {statsQuery.error?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 连接状态 + 操作 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">接入层概览</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchHealthCheck}
                disabled={batchHealthCheck.isPending}
              >
                {batchHealthCheck.isPending ? '检查中...' : '批量健康检查'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSeedDemo}
                disabled={seedDemoData.isPending}
              >
                {seedDemoData.isPending ? '加载中...' : '加载演示数据'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {stats && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="连接器总数" value={stats.totalConnectors} />
              <StatCard label="已连接" value={stats.connectedCount} />
              <StatCard label="异常" value={stats.errorCount} />
              <StatCard label="端点总数" value={stats.totalEndpoints} />
              <StatCard label="绑定总数" value={stats.totalBindings} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* 协议分布 */}
      {stats && Object.keys(stats.protocolDistribution).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">协议分布</CardTitle>
            <CardDescription>按协议类型统计连接器数量</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(stats.protocolDistribution).map(([proto, count]) => {
                const protoInfo = protocols?.find(p => p.protocolType === proto);
                return (
                  <StatCard
                    key={proto}
                    label={protoInfo?.label || proto.toUpperCase()}
                    value={count}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 状态分布 */}
      {stats && Object.keys(stats.statusDistribution).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(stats.statusDistribution).map(([status, count]) => (
                <StatCard
                  key={status}
                  label={STATUS_LABELS[status] || status}
                  value={count}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 支持的协议列表 */}
      {protocols && protocols.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">支持的协议 ({protocols.length})</CardTitle>
            <CardDescription>从适配器注册表自动同步</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {protocols.map(p => (
                <div key={p.protocolType} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-lg">{p.icon}</span>
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">{p.description}</div>
                  </div>
                  <Badge variant="outline" className="ml-auto text-xs">{p.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

// ============================================================
// 连接器管理 Tab (原 Routes)
// ============================================================
function ConnectorsTab() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState('');
  const [filterProtocol, setFilterProtocol] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newConnector, setNewConnector] = useState({
    name: '',
    protocolType: '' as string,
    description: '',
    connectionParams: '{}',
  });

  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({
    search: search || undefined,
    protocolType: filterProtocol !== 'all' ? filterProtocol : undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    pageSize: 100,
  });

  const protocolsQuery = trpc.accessLayer.listProtocols.useQuery();

  const createMutation = trpc.accessLayer.createConnector.useMutation({
    onSuccess: () => {
      toast.success('连接器创建成功');
      setShowCreate(false);
      setNewConnector({ name: '', protocolType: '', description: '', connectionParams: '{}' });
      utils.accessLayer.listConnectors.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '创建失败'),
  });

  const deleteMutation = trpc.accessLayer.deleteConnector.useMutation({
    onSuccess: () => {
      toast.success('连接器已删除');
      utils.accessLayer.listConnectors.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '删除失败'),
  });

  const healthCheckMutation = trpc.accessLayer.healthCheck.useMutation({
    onSuccess: (result) => {
      toast.success(`健康检查: ${result.status} (${result.latencyMs}ms)`);
      utils.accessLayer.listConnectors.invalidate();
    },
    onError: (err) => toast.error(err.message || '健康检查失败'),
  });

  const handleCreate = () => {
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(newConnector.connectionParams);
    } catch {
      toast.error('连接参数 JSON 格式错误');
      return;
    }
    createMutation.mutate({
      name: newConnector.name,
      protocolType: newConnector.protocolType as any,
      description: newConnector.description || undefined,
      connectionParams: params,
    });
  };

  const connectors = connectorsQuery.data?.items ?? [];
  const protocols = protocolsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索连接器名称..."
          className="w-48"
        />
        <Select value={filterProtocol} onValueChange={setFilterProtocol}>
          <SelectTrigger className="w-36"><SelectValue placeholder="协议筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部协议</SelectItem>
            {protocols.map(p => (
              <SelectItem key={p.protocolType} value={p.protocolType}>
                {p.icon} {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue placeholder="状态筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="connected">已连接</SelectItem>
            <SelectItem value="draft">草稿</SelectItem>
            <SelectItem value="error">异常</SelectItem>
            <SelectItem value="disconnected">已断开</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">
            共 {connectorsQuery.data?.total ?? 0} 个
          </span>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">+ 新建连接器</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建连接器</DialogTitle>
                <DialogDescription>注册新的数据源连接器 (Connector)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>连接器名称</Label>
                  <Input
                    value={newConnector.name}
                    onChange={e => setNewConnector(p => ({ ...p, name: e.target.value }))}
                    placeholder="例: SHM应力采集网关"
                  />
                </div>
                <div>
                  <Label>协议类型</Label>
                  <Select
                    value={newConnector.protocolType}
                    onValueChange={v => setNewConnector(p => ({ ...p, protocolType: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="选择协议" /></SelectTrigger>
                    <SelectContent>
                      {protocols.map(p => (
                        <SelectItem key={p.protocolType} value={p.protocolType}>
                          {p.icon} {p.label} - {p.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>描述</Label>
                  <Input
                    value={newConnector.description}
                    onChange={e => setNewConnector(p => ({ ...p, description: e.target.value }))}
                    placeholder="连接器用途描述"
                  />
                </div>
                <div>
                  <Label>连接参数 (JSON)</Label>
                  <Input
                    value={newConnector.connectionParams}
                    onChange={e => setNewConnector(p => ({ ...p, connectionParams: e.target.value }))}
                    placeholder='{"host": "10.0.1.100", "port": 1883}'
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newConnector.name || !newConnector.protocolType || createMutation.isPending}
                >
                  {createMutation.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 列表 */}
      {connectorsQuery.isLoading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground animate-pulse">加载中...</CardContent></Card>
      ) : connectorsQuery.isError ? (
        <Card><CardContent className="py-8 text-center text-destructive">加载失败: {connectorsQuery.error?.message}</CardContent></Card>
      ) : connectors.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无连接器，可点击上方"加载演示数据"或"新建连接器"</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {connectors.map((conn) => {
            const protoInfo = protocols.find(p => p.protocolType === conn.protocolType);
            return (
              <Card key={conn.connectorId}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{conn.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {protoInfo?.icon} {protoInfo?.label || conn.protocolType}
                        </Badge>
                        <Badge variant={STATUS_VARIANTS[conn.status] || 'outline'} className="text-xs">
                          {STATUS_LABELS[conn.status] || conn.status}
                        </Badge>
                      </div>
                      {conn.description && (
                        <div className="text-sm text-muted-foreground">{conn.description}</div>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>端点: {(conn as any).endpointCount ?? 0}</span>
                        <span>来源: {conn.sourceRef || '-'}</span>
                        <span>更新: {formatDate(conn.updatedAt)}</span>
                        {conn.lastError && (
                          <span className="text-destructive">错误: {String(conn.lastError)}</span>
                        )}
                      </div>
                      {Array.isArray(conn.tags) && conn.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {(conn.tags as string[]).map((tag: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => healthCheckMutation.mutate({ connectorId: conn.connectorId })}
                        disabled={healthCheckMutation.isPending}
                      >
                        检查
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`确认删除连接器 "${conn.name}"？这将同时删除其下所有端点和绑定。`)) {
                            deleteMutation.mutate({ connectorId: conn.connectorId });
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 端点管理 Tab (原 Services)
// ============================================================
function EndpointsTab() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({
    name: '',
    resourcePath: '',
    resourceType: 'topic',
    dataFormat: 'json',
  });

  // 获取连接器列表供选择
  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({ pageSize: 200 });
  const connectors = connectorsQuery.data?.items ?? [];

  // 获取选中连接器的端点
  const endpointsQuery = trpc.accessLayer.listEndpoints.useQuery(
    { connectorId: selectedConnectorId },
    { enabled: !!selectedConnectorId },
  );

  const createMutation = trpc.accessLayer.createEndpoint.useMutation({
    onSuccess: () => {
      toast.success('端点创建成功');
      setShowCreate(false);
      setNewEndpoint({ name: '', resourcePath: '', resourceType: 'topic', dataFormat: 'json' });
      utils.accessLayer.listEndpoints.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '创建失败'),
  });

  const deleteMutation = trpc.accessLayer.deleteEndpoint.useMutation({
    onSuccess: () => {
      toast.success('端点已删除');
      utils.accessLayer.listEndpoints.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '删除失败'),
  });

  const handleCreate = () => {
    if (!selectedConnectorId) {
      toast.error('请先选择一个连接器');
      return;
    }
    createMutation.mutate({
      connectorId: selectedConnectorId,
      name: newEndpoint.name,
      resourcePath: newEndpoint.resourcePath,
      resourceType: newEndpoint.resourceType,
      dataFormat: newEndpoint.dataFormat || undefined,
    });
  };

  const endpoints = endpointsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* 连接器选择 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="whitespace-nowrap">选择连接器:</Label>
          <Select value={selectedConnectorId} onValueChange={setSelectedConnectorId}>
            <SelectTrigger className="w-72"><SelectValue placeholder="选择连接器查看端点..." /></SelectTrigger>
            <SelectContent>
              {connectors.map(c => (
                <SelectItem key={c.connectorId} value={c.connectorId}>
                  {c.name} ({c.protocolType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedConnectorId && (
          <div className="ml-auto flex gap-2 items-center">
            <span className="text-sm text-muted-foreground">
              {endpoints.length} 个端点
            </span>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm">+ 新建端点</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>创建端点</DialogTitle>
                  <DialogDescription>
                    在连接器 "{connectors.find(c => c.connectorId === selectedConnectorId)?.name}" 下创建端点
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>端点名称</Label>
                    <Input
                      value={newEndpoint.name}
                      onChange={e => setNewEndpoint(p => ({ ...p, name: e.target.value }))}
                      placeholder="例: 应力-CH01 主梁上翼缘"
                    />
                  </div>
                  <div>
                    <Label>资源路径</Label>
                    <Input
                      value={newEndpoint.resourcePath}
                      onChange={e => setNewEndpoint(p => ({ ...p, resourcePath: e.target.value }))}
                      placeholder="例: shm/1904000115/stress/01"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>资源类型</Label>
                      <Select
                        value={newEndpoint.resourceType}
                        onValueChange={v => setNewEndpoint(p => ({ ...p, resourceType: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="topic">Topic</SelectItem>
                          <SelectItem value="table">Table</SelectItem>
                          <SelectItem value="node">Node</SelectItem>
                          <SelectItem value="bucket">Bucket</SelectItem>
                          <SelectItem value="api_path">API Path</SelectItem>
                          <SelectItem value="collection">Collection</SelectItem>
                          <SelectItem value="register">Register</SelectItem>
                          <SelectItem value="stream">Stream</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>数据格式</Label>
                      <Select
                        value={newEndpoint.dataFormat}
                        onValueChange={v => setNewEndpoint(p => ({ ...p, dataFormat: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="json">JSON</SelectItem>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="binary">Binary</SelectItem>
                          <SelectItem value="protobuf">Protobuf</SelectItem>
                          <SelectItem value="parquet">Parquet</SelectItem>
                          <SelectItem value="text">Text</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!newEndpoint.name || !newEndpoint.resourcePath || createMutation.isPending}
                  >
                    {createMutation.isPending ? '创建中...' : '创建'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* 端点列表 */}
      {!selectedConnectorId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            请在上方选择一个连接器以查看其端点
          </CardContent>
        </Card>
      ) : endpointsQuery.isLoading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground animate-pulse">加载中...</CardContent></Card>
      ) : endpointsQuery.isError ? (
        <Card><CardContent className="py-8 text-center text-destructive">加载失败: {endpointsQuery.error?.message}</CardContent></Card>
      ) : endpoints.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">该连接器下暂无端点</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {endpoints.map((ep) => (
            <Card key={ep.endpointId}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ep.name}</span>
                      <Badge variant="outline" className="text-xs">{ep.resourceType}</Badge>
                      {ep.dataFormat && (
                        <Badge variant="secondary" className="text-xs">{ep.dataFormat}</Badge>
                      )}
                      <Badge variant={STATUS_VARIANTS[ep.status] || 'outline'} className="text-xs">
                        {STATUS_LABELS[ep.status] || ep.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {ep.resourcePath}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      {ep.sensorId && <span>传感器: {ep.sensorId}</span>}
                      <span>更新: {formatDate(ep.updatedAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`确认删除端点 "${ep.name}"？`)) {
                        deleteMutation.mutate({ endpointId: ep.endpointId });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 插件管理 Tab
// ============================================================
function PluginsTab() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const pluginsQuery = trpc.plugin.list.useQuery();

  const enableMutation = trpc.plugin.enable.useMutation({
    onSuccess: () => {
      toast.success('插件已启用');
      utils.plugin.list.invalidate();
    },
    onError: (err) => toast.error(err.message || '启用失败'),
  });

  const disableMutation = trpc.plugin.disable.useMutation({
    onSuccess: () => {
      toast.success('插件已禁用');
      utils.plugin.list.invalidate();
    },
    onError: (err) => toast.error(err.message || '禁用失败'),
  });

  const uninstallMutation = trpc.plugin.uninstall.useMutation({
    onSuccess: () => {
      toast.success('插件已卸载');
      utils.plugin.list.invalidate();
    },
    onError: (err) => toast.error(err.message || '卸载失败'),
  });

  const pluginCategories: Record<string, string> = {
    source: '数据源',
    processor: '处理器',
    sink: '目标',
    analyzer: '分析器',
    visualizer: '可视化',
    integration: '集成',
    utility: '工具',
  };

  if (pluginsQuery.isLoading) {
    return (
      <Card><CardContent className="py-8 text-center text-muted-foreground animate-pulse">加载中...</CardContent></Card>
    );
  }

  if (pluginsQuery.isError) {
    return (
      <Card><CardContent className="py-8 text-center text-destructive">
        加载插件列表失败: {pluginsQuery.error?.message}
      </CardContent></Card>
    );
  }

  const plugins = pluginsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">插件列表 ({plugins.length})</h3>
      </div>

      {plugins.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无已安装插件</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {plugins.map((plugin: any) => (
            <Card key={plugin.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plugin.name || plugin.id}</span>
                      <Badge variant="outline" className="text-xs">
                        {pluginCategories[plugin.type] || plugin.type || '其他'}
                      </Badge>
                      {plugin.version && (
                        <Badge variant="secondary" className="text-xs">v{plugin.version}</Badge>
                      )}
                    </div>
                    {plugin.description && (
                      <div className="text-xs text-muted-foreground">{plugin.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">
                        {plugin.enabled ? '已启用' : '已禁用'}
                      </Label>
                      <Switch
                        checked={!!plugin.enabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            enableMutation.mutate({ id: plugin.id });
                          } else {
                            disableMutation.mutate({ id: plugin.id });
                          }
                        }}
                        disabled={enableMutation.isPending || disableMutation.isPending}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`确认卸载插件 "${plugin.name || plugin.id}"？`)) {
                          uninstallMutation.mutate({ id: plugin.id });
                        }
                      }}
                      disabled={uninstallMutation.isPending}
                    >
                      卸载
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 绑定管理 Tab (原 Upstreams)
// ============================================================
function BindingsTab() {
  const toast = useToast();
  const utils = trpc.useUtils();

  const [filterTargetType, setFilterTargetType] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [newBinding, setNewBinding] = useState({
    endpointId: '',
    targetType: 'pipeline_node',
    targetId: '',
    direction: 'ingest',
  });

  const bindingsQuery = trpc.accessLayer.listBindings.useQuery(
    filterTargetType !== 'all' ? { targetType: filterTargetType } : {},
  );

  // 获取连接器+端点，用于创建绑定时的选择
  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({ pageSize: 200 });
  const connectors = connectorsQuery.data?.items ?? [];

  // 选中连接器后加载端点
  const [selectedConnForBinding, setSelectedConnForBinding] = useState<string>('');
  const endpointsForBinding = trpc.accessLayer.listEndpoints.useQuery(
    { connectorId: selectedConnForBinding },
    { enabled: !!selectedConnForBinding },
  );

  const createMutation = trpc.accessLayer.createBinding.useMutation({
    onSuccess: () => {
      toast.success('绑定创建成功');
      setShowCreate(false);
      setNewBinding({ endpointId: '', targetType: 'pipeline_node', targetId: '', direction: 'ingest' });
      setSelectedConnForBinding('');
      utils.accessLayer.listBindings.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '创建失败'),
  });

  const deleteMutation = trpc.accessLayer.deleteBinding.useMutation({
    onSuccess: () => {
      toast.success('绑定已删除');
      utils.accessLayer.listBindings.invalidate();
      utils.accessLayer.getStats.invalidate();
    },
    onError: (err) => toast.error(err.message || '删除失败'),
  });

  const handleCreate = () => {
    createMutation.mutate({
      endpointId: newBinding.endpointId,
      targetType: newBinding.targetType,
      targetId: newBinding.targetId,
      direction: newBinding.direction || undefined,
    });
  };

  const bindings = bindingsQuery.data ?? [];

  const targetTypeLabels: Record<string, string> = {
    pipeline_node: '管线节点',
    kg_data_node: '知识图谱',
    sampling_config: '采样配置',
    slice_rule: '切片规则',
    edge_gateway: '边缘网关',
    stream_processor: '流处理器',
    event_bus_topic: '事件总线',
  };

  const directionLabels: Record<string, string> = {
    ingest: '采入',
    egress: '输出',
    bidirectional: '双向',
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterTargetType} onValueChange={setFilterTargetType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="目标类型筛选" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部目标类型</SelectItem>
            {Object.entries(targetTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2 items-center">
          <span className="text-sm text-muted-foreground">
            {bindings.length} 个绑定
          </span>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">+ 新建绑定</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建绑定</DialogTitle>
                <DialogDescription>将端点绑定到目标 (管线节点/知识图谱/事件总线等)</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>选择连接器</Label>
                  <Select
                    value={selectedConnForBinding}
                    onValueChange={(v) => {
                      setSelectedConnForBinding(v);
                      setNewBinding(p => ({ ...p, endpointId: '' }));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="先选择连接器..." /></SelectTrigger>
                    <SelectContent>
                      {connectors.map(c => (
                        <SelectItem key={c.connectorId} value={c.connectorId}>
                          {c.name} ({c.protocolType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>选择端点</Label>
                  <Select
                    value={newBinding.endpointId}
                    onValueChange={v => setNewBinding(p => ({ ...p, endpointId: v }))}
                    disabled={!selectedConnForBinding}
                  >
                    <SelectTrigger><SelectValue placeholder="选择端点..." /></SelectTrigger>
                    <SelectContent>
                      {(endpointsForBinding.data ?? []).map(ep => (
                        <SelectItem key={ep.endpointId} value={ep.endpointId}>
                          {ep.name} ({ep.resourcePath})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>目标类型</Label>
                    <Select
                      value={newBinding.targetType}
                      onValueChange={v => setNewBinding(p => ({ ...p, targetType: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(targetTypeLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>方向</Label>
                    <Select
                      value={newBinding.direction}
                      onValueChange={v => setNewBinding(p => ({ ...p, direction: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(directionLabels).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>目标 ID</Label>
                  <Input
                    value={newBinding.targetId}
                    onChange={e => setNewBinding(p => ({ ...p, targetId: e.target.value }))}
                    placeholder="例: pipeline_shm_stress_ch01"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newBinding.endpointId || !newBinding.targetId || createMutation.isPending}
                >
                  {createMutation.isPending ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 列表 */}
      {bindingsQuery.isLoading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground animate-pulse">加载中...</CardContent></Card>
      ) : bindingsQuery.isError ? (
        <Card><CardContent className="py-8 text-center text-destructive">加载失败: {bindingsQuery.error?.message}</CardContent></Card>
      ) : bindings.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无绑定</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {bindings.map((binding: any) => (
            <Card key={binding.bindingId}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {binding.connectorName && (
                        <Badge variant="outline" className="text-xs">{binding.connectorName}</Badge>
                      )}
                      <span className="font-medium">
                        {binding.endpointName || binding.endpointId.slice(0, 16)}
                      </span>
                      <span className="text-muted-foreground">
                        {directionLabels[binding.direction] || binding.direction}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {targetTypeLabels[binding.targetType] || binding.targetType}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {binding.targetId}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <Badge variant={STATUS_VARIANTS[binding.status] || 'outline'} className="text-xs">
                        {STATUS_LABELS[binding.status] || binding.status}
                      </Badge>
                      <span>创建: {formatDate(binding.createdAt)}</span>
                      {binding.lastSyncAt && <span>最后同步: {formatDate(binding.lastSyncAt)}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('确认删除此绑定？')) {
                        deleteMutation.mutate({ bindingId: binding.bindingId });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================
export default function GatewayManagement() {
  const [activeTab, setActiveTab] = useState('dashboard');
  return (
    <MainLayout title="接入层管理">
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">接入层管理</h1>
        <p className="text-muted-foreground mt-1">
          Connector - Endpoint - Binding 三级模型 -- 协议接入、资源发现、数据绑定
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="dashboard">概览</TabsTrigger>
          <TabsTrigger value="connectors">连接器</TabsTrigger>
          <TabsTrigger value="endpoints">端点</TabsTrigger>
          <TabsTrigger value="plugins">插件</TabsTrigger>
          <TabsTrigger value="bindings">绑定</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="connectors"><ConnectorsTab /></TabsContent>
        <TabsContent value="endpoints"><EndpointsTab /></TabsContent>
        <TabsContent value="plugins"><PluginsTab /></TabsContent>
        <TabsContent value="bindings"><BindingsTab /></TabsContent>
      </Tabs>
    </div>
    </MainLayout>
  );
}
