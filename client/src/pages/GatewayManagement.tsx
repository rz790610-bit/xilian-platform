/**
 * ============================================================
 * API 网关管理页面 (GatewayManagement.tsx)
 * 
 * 提供 Kong 网关的可视化管理界面：
 * - 网关概览仪表盘（连接状态、资源统计、流量指标）
 * - 路由管理（CRUD + 关联服务）
 * - 服务管理（CRUD + 超时/重试配置）
 * - 插件管理（启用/禁用/配置）
 * - 上游管理（负载均衡 + 健康检查 + 目标节点）
 * - 消费者管理（API Key 生成）
 * ============================================================
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { trpc } from '@/lib/trpc';

// ── 类型定义 ──
interface KongRoute {
  id: string;
  name: string;
  paths: string[];
  methods: string[];
  protocols: string[];
  strip_path: boolean;
  preserve_host: boolean;
  service?: { id: string };
  created_at: number;
}

interface KongService {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: string;
  path: string;
  connect_timeout: number;
  write_timeout: number;
  read_timeout: number;
  retries: number;
  created_at: number;
}

interface KongPlugin {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  service?: { id: string } | null;
  route?: { id: string } | null;
  consumer?: { id: string } | null;
  created_at: number;
}

// ── 时间格式化 ──
function formatTimestamp(ts: number): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN');
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================
// 概览仪表盘 Tab
// ============================================================
function DashboardTab() {
  const dashboard = trpc.gateway.getDashboard.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const metrics = trpc.gateway.getMetrics.useQuery(undefined, {
    refetchInterval: 15000,
  });

  const data = dashboard.data;
  const metricsData = metrics.data?.data;

  return (
    <div className="space-y-6">
      {/* 连接状态 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Kong 网关状态</CardTitle>
            <Badge variant={data?.connected ? 'default' : 'destructive'}>
              {data?.connected ? '● 已连接' : '● 未连接'}
            </Badge>
          </div>
          {data?.error && (
            <CardDescription className="text-destructive">{data.error}</CardDescription>
          )}
        </CardHeader>
        {data?.connected && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="路由" value={data.counts.routes} />
              <StatCard label="服务" value={data.counts.services} />
              <StatCard label="插件" value={data.counts.plugins} />
              <StatCard label="上游" value={data.counts.upstreams} />
              <StatCard label="消费者" value={data.counts.consumers} />
            </div>
          </CardContent>
        )}
      </Card>

      {/* 流量指标 */}
      {metricsData && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">流量指标</CardTitle>
            <CardDescription>Prometheus 实时指标</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="总请求数" value={metricsData.totalRequests.toLocaleString()} />
              <StatCard label="活跃连接" value={metricsData.activeConnections} />
              <StatCard label="等待连接" value={metricsData.waitingConnections} />
              <StatCard label="入站流量" value={formatBytes(metricsData.totalBandwidthIn)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 服务器信息 */}
      {data?.server && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">服务器信息</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-muted-foreground">版本</div>
              <div>{data.server.version || '-'}</div>
              <div className="text-muted-foreground">Lua 版本</div>
              <div>{data.server.lua_version || '-'}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 内存使用 */}
      {data?.memory && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">内存使用</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-40">
              {JSON.stringify(data.memory, null, 2)}
            </pre>
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
// 路由管理 Tab
// ============================================================
function RoutesTab() {
  const { toast } = useToast();
  const routes = trpc.gateway.listRoutes.useQuery();
  const services = trpc.gateway.listServices.useQuery();
  const createRoute = trpc.gateway.createRoute.useMutation({
    onSuccess: () => { routes.refetch(); toast({ title: '路由创建成功' }); setShowCreate(false); },
    onError: (e) => toast({ title: '创建失败', description: e.message, variant: 'destructive' }),
  });
  const deleteRoute = trpc.gateway.deleteRoute.useMutation({
    onSuccess: () => { routes.refetch(); toast({ title: '路由已删除' }); },
    onError: (e) => toast({ title: '删除失败', description: e.message, variant: 'destructive' }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newRoute, setNewRoute] = useState({
    name: '', paths: '', methods: 'GET,POST', serviceId: '',
  });

  const routeList: KongRoute[] = routes.data?.data?.data || [];
  const serviceList: KongService[] = services.data?.data?.data || [];

  const handleCreate = () => {
    createRoute.mutate({
      name: newRoute.name,
      paths: newRoute.paths.split(',').map(p => p.trim()).filter(Boolean),
      methods: newRoute.methods.split(',').map(m => m.trim().toUpperCase()).filter(Boolean),
      ...(newRoute.serviceId ? { service: { id: newRoute.serviceId } } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">路由列表 ({routeList.length})</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">+ 新建路由</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建路由</DialogTitle>
              <DialogDescription>定义 API 路由规则，将请求转发到后端服务</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>路由名称</Label>
                <Input value={newRoute.name} onChange={e => setNewRoute(p => ({ ...p, name: e.target.value }))} placeholder="例: api-devices" />
              </div>
              <div>
                <Label>路径（逗号分隔）</Label>
                <Input value={newRoute.paths} onChange={e => setNewRoute(p => ({ ...p, paths: e.target.value }))} placeholder="例: /api/devices,/api/sensors" />
              </div>
              <div>
                <Label>HTTP 方法（逗号分隔）</Label>
                <Input value={newRoute.methods} onChange={e => setNewRoute(p => ({ ...p, methods: e.target.value }))} placeholder="例: GET,POST,PUT,DELETE" />
              </div>
              <div>
                <Label>关联服务</Label>
                <Select value={newRoute.serviceId} onValueChange={v => setNewRoute(p => ({ ...p, serviceId: v }))}>
                  <SelectTrigger><SelectValue placeholder="选择服务（可选）" /></SelectTrigger>
                  <SelectContent>
                    {serviceList.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.host}:{s.port})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={!newRoute.name || !newRoute.paths || createRoute.isPending}>
                {createRoute.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {routes.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : routeList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无路由</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {routeList.map((route) => (
            <Card key={route.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{route.name || route.id.slice(0, 8)}</span>
                      {route.methods?.map(m => (
                        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {route.paths?.join(', ')}
                      {route.service && <span className="ml-2">→ {route.service.id.slice(0, 8)}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatTimestamp(route.created_at)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteRoute.mutate({ id: route.id })}
                    disabled={deleteRoute.isPending}
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
// 服务管理 Tab
// ============================================================
function ServicesTab() {
  const { toast } = useToast();
  const services = trpc.gateway.listServices.useQuery();
  const createService = trpc.gateway.createService.useMutation({
    onSuccess: () => { services.refetch(); toast({ title: '服务创建成功' }); setShowCreate(false); },
    onError: (e) => toast({ title: '创建失败', description: e.message, variant: 'destructive' }),
  });
  const deleteService = trpc.gateway.deleteService.useMutation({
    onSuccess: () => { services.refetch(); toast({ title: '服务已删除' }); },
    onError: (e) => toast({ title: '删除失败', description: e.message, variant: 'destructive' }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newService, setNewService] = useState({
    name: '', host: '', port: '3000', protocol: 'http', path: '/',
  });

  const serviceList: KongService[] = services.data?.data?.data || [];

  const handleCreate = () => {
    createService.mutate({
      name: newService.name,
      host: newService.host,
      port: parseInt(newService.port) || 3000,
      protocol: newService.protocol,
      path: newService.path || '/',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">服务列表 ({serviceList.length})</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">+ 新建服务</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建服务</DialogTitle>
              <DialogDescription>注册后端服务，供路由转发使用</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>服务名称</Label>
                <Input value={newService.name} onChange={e => setNewService(p => ({ ...p, name: e.target.value }))} placeholder="例: xilian-app" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>主机</Label>
                  <Input value={newService.host} onChange={e => setNewService(p => ({ ...p, host: e.target.value }))} placeholder="例: app" />
                </div>
                <div>
                  <Label>端口</Label>
                  <Input value={newService.port} onChange={e => setNewService(p => ({ ...p, port: e.target.value }))} placeholder="3000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>协议</Label>
                  <Select value={newService.protocol} onValueChange={v => setNewService(p => ({ ...p, protocol: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">HTTP</SelectItem>
                      <SelectItem value="https">HTTPS</SelectItem>
                      <SelectItem value="grpc">gRPC</SelectItem>
                      <SelectItem value="grpcs">gRPCs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>路径前缀</Label>
                  <Input value={newService.path} onChange={e => setNewService(p => ({ ...p, path: e.target.value }))} placeholder="/" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={!newService.name || !newService.host || createService.isPending}>
                {createService.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {services.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : serviceList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无服务</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {serviceList.map((svc) => (
            <Card key={svc.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{svc.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {svc.protocol}://{svc.host}:{svc.port}{svc.path}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>连接超时: {svc.connect_timeout}ms</span>
                      <span>读超时: {svc.read_timeout}ms</span>
                      <span>重试: {svc.retries}次</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteService.mutate({ id: svc.id })}
                    disabled={deleteService.isPending}
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
  const { toast } = useToast();
  const plugins = trpc.gateway.listPlugins.useQuery();
  const togglePlugin = trpc.gateway.togglePlugin.useMutation({
    onSuccess: () => { plugins.refetch(); toast({ title: '插件状态已更新' }); },
    onError: (e) => toast({ title: '操作失败', description: e.message, variant: 'destructive' }),
  });
  const deletePlugin = trpc.gateway.deletePlugin.useMutation({
    onSuccess: () => { plugins.refetch(); toast({ title: '插件已删除' }); },
    onError: (e) => toast({ title: '删除失败', description: e.message, variant: 'destructive' }),
  });

  const pluginList: KongPlugin[] = plugins.data?.data?.data || [];

  // 插件分类
  const pluginCategories: Record<string, string> = {
    'rate-limiting': '流量控制',
    'rate-limiting-advanced': '流量控制',
    'request-size-limiting': '流量控制',
    'jwt': '认证',
    'key-auth': '认证',
    'basic-auth': '认证',
    'oauth2': '认证',
    'cors': '安全',
    'ip-restriction': '安全',
    'bot-detection': '安全',
    'http-log': '日志',
    'file-log': '日志',
    'tcp-log': '日志',
    'prometheus': '监控',
    'datadog': '监控',
    'request-transformer': '转换',
    'response-transformer': '转换',
    'proxy-cache': '缓存',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">已启用插件 ({pluginList.length})</h3>
      </div>

      {plugins.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : pluginList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无插件</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {pluginList.map((plugin) => (
            <Card key={plugin.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plugin.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {pluginCategories[plugin.name] || '其他'}
                      </Badge>
                      {plugin.service && <Badge variant="secondary" className="text-xs">服务级</Badge>}
                      {plugin.route && <Badge variant="secondary" className="text-xs">路由级</Badge>}
                      {!plugin.service && !plugin.route && <Badge variant="secondary" className="text-xs">全局</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      配置: {JSON.stringify(plugin.config).substring(0, 100)}
                      {JSON.stringify(plugin.config).length > 100 ? '...' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">{plugin.enabled ? '已启用' : '已禁用'}</Label>
                      <Switch
                        checked={plugin.enabled}
                        onCheckedChange={(checked) => togglePlugin.mutate({ id: plugin.id, enabled: checked })}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deletePlugin.mutate({ id: plugin.id })}
                      disabled={deletePlugin.isPending}
                    >
                      删除
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
// 上游管理 Tab
// ============================================================
function UpstreamsTab() {
  const { toast } = useToast();
  const upstreams = trpc.gateway.listUpstreams.useQuery();
  const createUpstream = trpc.gateway.createUpstream.useMutation({
    onSuccess: () => { upstreams.refetch(); toast({ title: '上游创建成功' }); setShowCreate(false); },
    onError: (e) => toast({ title: '创建失败', description: e.message, variant: 'destructive' }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newUpstream, setNewUpstream] = useState({ name: '', algorithm: 'round-robin' as const });
  const [selectedUpstream, setSelectedUpstream] = useState<string | null>(null);

  const upstreamList = upstreams.data?.data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">上游列表 ({upstreamList.length})</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">+ 新建上游</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建上游</DialogTitle>
              <DialogDescription>定义后端服务集群，支持负载均衡和健康检查</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>上游名称</Label>
                <Input value={newUpstream.name} onChange={e => setNewUpstream(p => ({ ...p, name: e.target.value }))} placeholder="例: app-upstream" />
              </div>
              <div>
                <Label>负载均衡算法</Label>
                <Select value={newUpstream.algorithm} onValueChange={(v: any) => setNewUpstream(p => ({ ...p, algorithm: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">轮询 (Round Robin)</SelectItem>
                    <SelectItem value="consistent-hashing">一致性哈希</SelectItem>
                    <SelectItem value="least-connections">最少连接</SelectItem>
                    <SelectItem value="latency">最低延迟</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={() => createUpstream.mutate(newUpstream)} disabled={!newUpstream.name || createUpstream.isPending}>
                {createUpstream.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {upstreams.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : upstreamList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无上游</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {upstreamList.map((upstream: any) => (
            <Card key={upstream.id} className={selectedUpstream === upstream.id ? 'ring-2 ring-primary' : ''}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{upstream.name}</div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>算法: {upstream.algorithm}</span>
                      <span>Hash: {upstream.hash_on}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedUpstream(selectedUpstream === upstream.id ? null : upstream.id)}
                    >
                      {selectedUpstream === upstream.id ? '收起' : '目标节点'}
                    </Button>
                  </div>
                </div>
                {selectedUpstream === upstream.id && (
                  <TargetsList upstreamId={upstream.id} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetsList({ upstreamId }: { upstreamId: string }) {
  const { toast } = useToast();
  const targets = trpc.gateway.listTargets.useQuery({ upstreamId });
  const health = trpc.gateway.getUpstreamHealth.useQuery({ id: upstreamId });
  const addTarget = trpc.gateway.addTarget.useMutation({
    onSuccess: () => { targets.refetch(); toast({ title: '目标节点已添加' }); setNewTarget(''); },
    onError: (e) => toast({ title: '添加失败', description: e.message, variant: 'destructive' }),
  });

  const [newTarget, setNewTarget] = useState('');
  const targetList = targets.data?.data?.data || [];

  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={newTarget}
          onChange={e => setNewTarget(e.target.value)}
          placeholder="host:port（例: app:3000）"
          className="flex-1"
        />
        <Button
          size="sm"
          onClick={() => addTarget.mutate({ upstreamId, target: newTarget })}
          disabled={!newTarget || addTarget.isPending}
        >
          添加
        </Button>
      </div>
      {targetList.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">暂无目标节点</div>
      ) : (
        targetList.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
            <span>{t.target}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">权重: {t.weight}</Badge>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// 消费者管理 Tab
// ============================================================
function ConsumersTab() {
  const { toast } = useToast();
  const consumers = trpc.gateway.listConsumers.useQuery();
  const createConsumer = trpc.gateway.createConsumer.useMutation({
    onSuccess: () => { consumers.refetch(); toast({ title: '消费者创建成功' }); setShowCreate(false); },
    onError: (e) => toast({ title: '创建失败', description: e.message, variant: 'destructive' }),
  });
  const createApiKey = trpc.gateway.createApiKey.useMutation({
    onSuccess: (data) => {
      toast({ title: 'API Key 已生成', description: `Key: ${data.data?.key || '查看详情'}` });
    },
    onError: (e) => toast({ title: '生成失败', description: e.message, variant: 'destructive' }),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newConsumer, setNewConsumer] = useState({ username: '', custom_id: '' });

  const consumerList = consumers.data?.data?.data || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">消费者列表 ({consumerList.length})</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm">+ 新建消费者</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建消费者</DialogTitle>
              <DialogDescription>注册 API 消费者，用于认证和限流</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>用户名</Label>
                <Input value={newConsumer.username} onChange={e => setNewConsumer(p => ({ ...p, username: e.target.value }))} placeholder="例: mobile-app" />
              </div>
              <div>
                <Label>自定义 ID（可选）</Label>
                <Input value={newConsumer.custom_id} onChange={e => setNewConsumer(p => ({ ...p, custom_id: e.target.value }))} placeholder="例: app-001" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={() => createConsumer.mutate(newConsumer)} disabled={!newConsumer.username || createConsumer.isPending}>
                {createConsumer.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {consumers.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : consumerList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无消费者</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {consumerList.map((consumer: any) => (
            <Card key={consumer.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{consumer.username}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {consumer.id.slice(0, 12)}...
                      {consumer.custom_id && <span className="ml-2">自定义: {consumer.custom_id}</span>}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createApiKey.mutate({ consumerId: consumer.id })}
                    disabled={createApiKey.isPending}
                  >
                    生成 API Key
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API 网关管理</h1>
        <p className="text-muted-foreground mt-1">
          Kong API Gateway — 路由转发、限流认证、插件管理、负载均衡
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-6 w-full max-w-2xl">
          <TabsTrigger value="dashboard">概览</TabsTrigger>
          <TabsTrigger value="routes">路由</TabsTrigger>
          <TabsTrigger value="services">服务</TabsTrigger>
          <TabsTrigger value="plugins">插件</TabsTrigger>
          <TabsTrigger value="upstreams">上游</TabsTrigger>
          <TabsTrigger value="consumers">消费者</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="routes"><RoutesTab /></TabsContent>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="plugins"><PluginsTab /></TabsContent>
        <TabsContent value="upstreams"><UpstreamsTab /></TabsContent>
        <TabsContent value="consumers"><ConsumersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
