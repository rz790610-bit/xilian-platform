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
 * 
 * 当前使用 Mock 数据，待后端 gateway router 注册后
 * 可替换为 trpc.gateway.* 调用
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

// ── Mock 数据 ──
const mockDashboard = {
  connected: true,
  error: null as string | null,
  counts: { routes: 12, services: 8, plugins: 15, upstreams: 4, consumers: 6 },
  server: { version: '3.6.1', lua_version: 'LuaJIT 2.1.0-beta3' },
  memory: {
    lua_shared_dicts: { kong: { allocated_slabs: '12.50 MiB', capacity: '32 MiB' } },
    workers_lua_vms: [{ http_allocated_gc: '45.23 MiB', pid: 1234 }],
  },
};

const mockMetrics = {
  totalRequests: 1_284_567,
  activeConnections: 142,
  waitingConnections: 23,
  totalBandwidthIn: 2_147_483_648,
  totalBandwidthOut: 5_368_709_120,
};

const mockRoutes: KongRoute[] = [
  { id: 'r-001', name: 'api-devices', paths: ['/api/devices', '/api/sensors'], methods: ['GET', 'POST'], protocols: ['http', 'https'], strip_path: true, preserve_host: false, service: { id: 's-001' }, created_at: 1707900000 },
  { id: 'r-002', name: 'api-models', paths: ['/api/models'], methods: ['GET', 'POST', 'PUT', 'DELETE'], protocols: ['http', 'https'], strip_path: true, preserve_host: false, service: { id: 's-002' }, created_at: 1707800000 },
  { id: 'r-003', name: 'api-diagnosis', paths: ['/api/diagnosis', '/api/predict'], methods: ['POST'], protocols: ['https'], strip_path: false, preserve_host: true, service: { id: 's-003' }, created_at: 1707700000 },
  { id: 'r-004', name: 'api-knowledge', paths: ['/api/knowledge', '/api/graph'], methods: ['GET', 'POST'], protocols: ['http', 'https'], strip_path: true, preserve_host: false, service: { id: 's-004' }, created_at: 1707600000 },
  { id: 'r-005', name: 'ws-realtime', paths: ['/ws/realtime'], methods: ['GET'], protocols: ['http', 'https'], strip_path: false, preserve_host: true, created_at: 1707500000 },
];

const mockServices: KongService[] = [
  { id: 's-001', name: 'device-service', host: 'device-svc', port: 3001, protocol: 'http', path: '/', connect_timeout: 5000, write_timeout: 60000, read_timeout: 60000, retries: 3, created_at: 1707900000 },
  { id: 's-002', name: 'model-service', host: 'model-svc', port: 3002, protocol: 'http', path: '/', connect_timeout: 10000, write_timeout: 120000, read_timeout: 120000, retries: 2, created_at: 1707800000 },
  { id: 's-003', name: 'diagnosis-service', host: 'diagnosis-svc', port: 3003, protocol: 'http', path: '/', connect_timeout: 5000, write_timeout: 300000, read_timeout: 300000, retries: 1, created_at: 1707700000 },
  { id: 's-004', name: 'knowledge-service', host: 'knowledge-svc', port: 3004, protocol: 'http', path: '/', connect_timeout: 5000, write_timeout: 60000, read_timeout: 60000, retries: 3, created_at: 1707600000 },
];

const mockPlugins: KongPlugin[] = [
  { id: 'p-001', name: 'rate-limiting', enabled: true, config: { minute: 100, hour: 5000, policy: 'redis' }, service: null, route: null, consumer: null, created_at: 1707900000 },
  { id: 'p-002', name: 'jwt', enabled: true, config: { key_claim_name: 'iss', secret_is_base64: false }, service: null, route: null, consumer: null, created_at: 1707850000 },
  { id: 'p-003', name: 'cors', enabled: true, config: { origins: ['*'], methods: ['GET', 'POST', 'PUT', 'DELETE'], headers: ['Authorization', 'Content-Type'] }, service: null, route: null, consumer: null, created_at: 1707800000 },
  { id: 'p-004', name: 'prometheus', enabled: true, config: { per_consumer: true, status_code_metrics: true }, service: null, route: null, consumer: null, created_at: 1707750000 },
  { id: 'p-005', name: 'ip-restriction', enabled: false, config: { allow: ['10.0.0.0/8', '172.16.0.0/12'] }, service: { id: 's-003' }, route: null, consumer: null, created_at: 1707700000 },
  { id: 'p-006', name: 'request-size-limiting', enabled: true, config: { allowed_payload_size: 50, size_unit: 'megabytes' }, route: { id: 'r-003' }, service: null, consumer: null, created_at: 1707650000 },
];

const mockUpstreams = [
  { id: 'u-001', name: 'device-upstream', algorithm: 'round-robin', hash_on: 'none', slots: 10000 },
  { id: 'u-002', name: 'model-upstream', algorithm: 'least-connections', hash_on: 'none', slots: 10000 },
  { id: 'u-003', name: 'diagnosis-upstream', algorithm: 'consistent-hashing', hash_on: 'header', slots: 10000 },
];

const mockTargets: Record<string, Array<{ id: string; target: string; weight: number }>> = {
  'u-001': [
    { id: 't-001', target: 'device-svc-1:3001', weight: 100 },
    { id: 't-002', target: 'device-svc-2:3001', weight: 100 },
  ],
  'u-002': [
    { id: 't-003', target: 'model-svc-1:3002', weight: 100 },
    { id: 't-004', target: 'model-svc-2:3002', weight: 50 },
    { id: 't-005', target: 'model-svc-3:3002', weight: 50 },
  ],
  'u-003': [
    { id: 't-006', target: 'diagnosis-svc-1:3003', weight: 100 },
  ],
};

const mockConsumers = [
  { id: 'c-001', username: 'mobile-app', custom_id: 'app-001', created_at: 1707900000 },
  { id: 'c-002', username: 'web-portal', custom_id: 'web-001', created_at: 1707800000 },
  { id: 'c-003', username: 'edge-gateway', custom_id: 'edge-001', created_at: 1707700000 },
];

// ── 工具函数 ──
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
  const data = mockDashboard;
  const metricsData = mockMetrics;

  return (
    <div className="space-y-6">
      {/* 连接状态 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Kong 网关状态</CardTitle>
            <Badge variant={data.connected ? 'default' : 'destructive'}>
              {data.connected ? '● 已连接' : '● 未连接'}
            </Badge>
          </div>
          {data.error && (
            <CardDescription className="text-destructive">{data.error}</CardDescription>
          )}
        </CardHeader>
        {data.connected && (
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

      {/* 服务器信息 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">服务器信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">版本</div>
            <div>{data.server.version}</div>
            <div className="text-muted-foreground">Lua 版本</div>
            <div>{data.server.lua_version}</div>
          </div>
        </CardContent>
      </Card>

      {/* 内存使用 */}
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
  const toast = useToast();
  const [routeList, setRouteList] = useState<KongRoute[]>(mockRoutes);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoute, setNewRoute] = useState({
    name: '', paths: '', methods: 'GET,POST', serviceId: '',
  });

  const handleCreate = () => {
    const route: KongRoute = {
      id: `r-${Date.now()}`,
      name: newRoute.name,
      paths: newRoute.paths.split(',').map(p => p.trim()).filter(Boolean),
      methods: newRoute.methods.split(',').map(m => m.trim().toUpperCase()).filter(Boolean),
      protocols: ['http', 'https'],
      strip_path: true,
      preserve_host: false,
      ...(newRoute.serviceId ? { service: { id: newRoute.serviceId } } : {}),
      created_at: Math.floor(Date.now() / 1000),
    };
    setRouteList(prev => [route, ...prev]);
    toast.success('路由创建成功');
    setShowCreate(false);
    setNewRoute({ name: '', paths: '', methods: 'GET,POST', serviceId: '' });
  };

  const handleDelete = (id: string) => {
    setRouteList(prev => prev.filter(r => r.id !== id));
    toast.success('路由已删除');
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
                    {mockServices.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.host}:{s.port})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={!newRoute.name || !newRoute.paths}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {routeList.length === 0 ? (
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
                    onClick={() => handleDelete(route.id)}
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
  const toast = useToast();
  const [serviceList, setServiceList] = useState<KongService[]>(mockServices);
  const [showCreate, setShowCreate] = useState(false);
  const [newService, setNewService] = useState({
    name: '', host: '', port: '3000', protocol: 'http', path: '/',
  });

  const handleCreate = () => {
    const svc: KongService = {
      id: `s-${Date.now()}`,
      name: newService.name,
      host: newService.host,
      port: parseInt(newService.port) || 3000,
      protocol: newService.protocol,
      path: newService.path || '/',
      connect_timeout: 5000,
      write_timeout: 60000,
      read_timeout: 60000,
      retries: 3,
      created_at: Math.floor(Date.now() / 1000),
    };
    setServiceList(prev => [svc, ...prev]);
    toast.success('服务创建成功');
    setShowCreate(false);
    setNewService({ name: '', host: '', port: '3000', protocol: 'http', path: '/' });
  };

  const handleDelete = (id: string) => {
    setServiceList(prev => prev.filter(s => s.id !== id));
    toast.success('服务已删除');
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
              <Button onClick={handleCreate} disabled={!newService.name || !newService.host}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {serviceList.length === 0 ? (
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
                    onClick={() => handleDelete(svc.id)}
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
  const [pluginList, setPluginList] = useState<KongPlugin[]>(mockPlugins);

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

  const handleToggle = (id: string, enabled: boolean) => {
    setPluginList(prev => prev.map(p => p.id === id ? { ...p, enabled } : p));
    toast.success('插件状态已更新');
  };

  const handleDelete = (id: string) => {
    setPluginList(prev => prev.filter(p => p.id !== id));
    toast.success('插件已删除');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">已启用插件 ({pluginList.length})</h3>
      </div>

      {pluginList.length === 0 ? (
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
                        onCheckedChange={(checked) => handleToggle(plugin.id, checked)}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(plugin.id)}
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
  const toast = useToast();
  const [upstreamList, setUpstreamList] = useState(mockUpstreams);
  const [showCreate, setShowCreate] = useState(false);
  const [newUpstream, setNewUpstream] = useState({ name: '', algorithm: 'round-robin' });
  const [selectedUpstream, setSelectedUpstream] = useState<string | null>(null);

  const handleCreate = () => {
    const upstream = {
      id: `u-${Date.now()}`,
      name: newUpstream.name,
      algorithm: newUpstream.algorithm,
      hash_on: 'none',
      slots: 10000,
    };
    setUpstreamList(prev => [upstream, ...prev]);
    toast.success('上游创建成功');
    setShowCreate(false);
    setNewUpstream({ name: '', algorithm: 'round-robin' });
  };

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
                <Select value={newUpstream.algorithm} onValueChange={(v) => setNewUpstream(p => ({ ...p, algorithm: v }))}>
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
              <Button onClick={handleCreate} disabled={!newUpstream.name}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {upstreamList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无上游</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {upstreamList.map((upstream) => (
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
  const toast = useToast();
  const [targetList, setTargetList] = useState(mockTargets[upstreamId] || []);
  const [newTarget, setNewTarget] = useState('');

  const handleAdd = () => {
    const target = { id: `t-${Date.now()}`, target: newTarget, weight: 100 };
    setTargetList(prev => [...prev, target]);
    toast.success('目标节点已添加');
    setNewTarget('');
  };

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
          onClick={handleAdd}
          disabled={!newTarget}
        >
          添加
        </Button>
      </div>
      {targetList.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">暂无目标节点</div>
      ) : (
        targetList.map((t) => (
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
  const toast = useToast();
  const [consumerList, setConsumerList] = useState(mockConsumers);
  const [showCreate, setShowCreate] = useState(false);
  const [newConsumer, setNewConsumer] = useState({ username: '', custom_id: '' });

  const handleCreate = () => {
    const consumer = {
      id: `c-${Date.now()}`,
      username: newConsumer.username,
      custom_id: newConsumer.custom_id,
      created_at: Math.floor(Date.now() / 1000),
    };
    setConsumerList(prev => [consumer, ...prev]);
    toast.success('消费者创建成功');
    setShowCreate(false);
    setNewConsumer({ username: '', custom_id: '' });
  };

  const handleGenerateKey = (consumerId: string) => {
    const key = `key_${Math.random().toString(36).substring(2, 18)}`;
    toast.success(`API Key 已生成: ${key}`);
  };

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
              <Button onClick={handleCreate} disabled={!newConsumer.username}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {consumerList.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">暂无消费者</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {consumerList.map((consumer) => (
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
                    onClick={() => handleGenerateKey(consumer.id)}
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
    <MainLayout title="API 网关管理">
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
    </MainLayout>
  );
}
