/**
 * 接入层管理页面
 * 系统设置 > 配置中心 > 接入层管理
 * 完整的 Connector → Endpoint → Binding 三级管理
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';
import {
  Database, Plus, RefreshCw, Settings, Trash2, CheckCircle, XCircle,
  AlertCircle, Loader2, Link, Search, Activity, Zap, Globe, Radio,
  Server, Cpu, ChevronRight, ChevronDown, Eye, Unplug, PlugZap,
  Layers, ArrowRightLeft, FileSearch, BarChart3, Shield
} from 'lucide-react';
import {
  PROTOCOL_META, PROTOCOL_CATEGORIES,
  type ProtocolType, type ConnectorInfo, type EndpointInfo, type BindingInfo,
  type ProtocolConfigField,
} from '@shared/accessLayerTypes';

// ============ 状态图标 ============
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    draft: { icon: <Settings className="w-3 h-3" />, label: '草稿', className: 'bg-gray-500/20 text-gray-400' },
    testing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: '测试中', className: 'bg-yellow-500/20 text-yellow-400' },
    connected: { icon: <CheckCircle className="w-3 h-3" />, label: '已连接', className: 'bg-emerald-500/20 text-emerald-400' },
    disconnected: { icon: <XCircle className="w-3 h-3" />, label: '未连接', className: 'bg-gray-500/20 text-gray-400' },
    error: { icon: <AlertCircle className="w-3 h-3" />, label: '错误', className: 'bg-red-500/20 text-red-400' },
    active: { icon: <CheckCircle className="w-3 h-3" />, label: '活跃', className: 'bg-emerald-500/20 text-emerald-400' },
    inactive: { icon: <XCircle className="w-3 h-3" />, label: '停用', className: 'bg-gray-500/20 text-gray-400' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ============ 协议图标 ============
function ProtocolIcon({ protocol, className = "w-4 h-4" }: { protocol: string; className?: string }) {
  const meta = PROTOCOL_META[protocol as ProtocolType];
  if (!meta) return <Database className={className} />;
  return <span className={className}>{meta.icon}</span>;
}

// ============ 统计卡片 ============
function StatsCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border border-white/5 bg-white/[0.02]`}>
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

// ============ 连接器创建对话框 ============
function CreateConnectorDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'protocol' | 'config'>('protocol');
  const [selectedProtocol, setSelectedProtocol] = useState<ProtocolType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [connectionParams, setConnectionParams] = useState<Record<string, unknown>>({});
  const [authConfig, setAuthConfig] = useState<Record<string, unknown>>({});

  const schemaQuery = trpc.accessLayer.protocolSchema.useQuery(
    { protocolType: selectedProtocol || '' },
    { enabled: !!selectedProtocol }
  );

  const createMutation = trpc.accessLayer.createConnector.useMutation({
    onSuccess: () => {
      toast.success('连接器创建成功');
      onCreated();
      resetForm();
    },
    onError: (err) => toast.error(`创建失败: ${err.message}`),
  });

  const testMutation = trpc.accessLayer.testConnection.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`连接测试成功 (${result.latencyMs}ms) - ${result.message}`);
      } else {
        toast.error(`连接测试失败: ${result.message}`);
      }
    },
    onError: (err) => toast.error(`测试失败: ${err.message}`),
  });

  const resetForm = () => {
    setStep('protocol');
    setSelectedProtocol(null);
    setName('');
    setDescription('');
    setConnectionParams({});
    setAuthConfig({});
    onOpenChange(false);
  };

  const handleTest = () => {
    if (!selectedProtocol) return;
    testMutation.mutate({ protocolType: selectedProtocol, connectionParams, authConfig });
  };

  const handleCreate = () => {
    if (!selectedProtocol || !name.trim()) {
      toast.error('请填写连接器名称');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      protocolType: selectedProtocol,
      description: description || undefined,
      connectionParams,
      authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
    });
  };

  const renderField = (field: ProtocolConfigField, values: Record<string, unknown>, setter: (v: Record<string, unknown>) => void) => {
    const value = values[field.key] ?? field.defaultValue ?? '';
    return (
      <div key={field.key} className="space-y-1.5">
        <Label className="text-xs text-gray-300">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </Label>
        {field.type === 'select' ? (
          <Select value={String(value)} onValueChange={(v) => setter({ ...values, [field.key]: v })}>
            <SelectTrigger className="bg-white/5 border-white/10 text-sm h-8">
              <SelectValue placeholder={field.placeholder || '请选择'} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.type === 'boolean' ? (
          <Select value={String(value)} onValueChange={(v) => setter({ ...values, [field.key]: v === 'true' })}>
            <SelectTrigger className="bg-white/5 border-white/10 text-sm h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">是</SelectItem>
              <SelectItem value="false">否</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
            value={String(value)}
            onChange={(e) => setter({ ...values, [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value })}
            placeholder={field.placeholder}
            className="bg-white/5 border-white/10 text-sm h-8"
          />
        )}
        {field.description && <p className="text-xs text-gray-500">{field.description}</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'protocol' ? '选择协议类型' : `配置 ${PROTOCOL_META[selectedProtocol!]?.label} 连接器`}
          </DialogTitle>
        </DialogHeader>

        {step === 'protocol' ? (
          <div className="space-y-4">
            {Object.entries(PROTOCOL_CATEGORIES).map(([catKey, cat]) => (
              <div key={catKey}>
                <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">{cat.label}</h4>
                <div className="grid grid-cols-3 gap-2">
                  {cat.protocols.map(p => {
                    const meta = PROTOCOL_META[p];
                    return (
                      <button
                        key={p}
                        onClick={() => { setSelectedProtocol(p); setStep('config'); }}
                        className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all hover:bg-white/5
                          ${selectedProtocol === p ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'}`}
                      >
                        <span className="text-lg">{meta.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-white">{meta.label}</p>
                          <p className="text-xs text-gray-400 line-clamp-1">{meta.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 基本信息
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">连接器名称 <span className="text-red-400">*</span></Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：生产线MQTT网关" className="bg-white/5 border-white/10 text-sm h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-300">描述</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" className="bg-white/5 border-white/10 text-sm h-8" />
                </div>
              </div>
            </div>

            {/* 连接参数 */}
            {schemaQuery.data && (
              <>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Link className="w-4 h-4" /> 连接参数
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {schemaQuery.data.connectionFields.map(f => renderField(f, connectionParams, setConnectionParams))}
                  </div>
                </div>

                {schemaQuery.data.authFields.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Shield className="w-4 h-4" /> 认证配置
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {schemaQuery.data.authFields.map(f => renderField(f, authConfig, setAuthConfig))}
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('protocol')} className="text-sm">
                返回选择协议
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testMutation.isPending} className="text-sm">
                {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                测试连接
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="text-sm">
                {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                创建连接器
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ 连接器详情面板 ============
function ConnectorDetail({
  connectorId, onBack,
}: {
  connectorId: string;
  onBack: () => void;
}) {
  const toast = useToast();
  const utils = trpc.useUtils();
  const connectorQuery = trpc.accessLayer.getConnector.useQuery({ connectorId });
  const healthMutation = trpc.accessLayer.healthCheck.useMutation({
    onSuccess: (result) => {
      toast.success(`健康检查: ${result.status} (${result.latencyMs}ms)`);
      utils.accessLayer.getConnector.invalidate({ connectorId });
    },
  });
  const discoverMutation = trpc.accessLayer.discoverEndpoints.useMutation({
    onSuccess: (endpoints) => {
      toast.success(`发现 ${endpoints.length} 个资源端点`);
    },
  });
  const deleteEndpointMutation = trpc.accessLayer.deleteEndpoint.useMutation({
    onSuccess: () => {
      toast.success('端点已删除');
      utils.accessLayer.getConnector.invalidate({ connectorId });
    },
  });

  const connector = connectorQuery.data;
  if (connectorQuery.isLoading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!connector) return <div className="text-center p-12 text-gray-400">连接器不存在</div>;

  const meta = PROTOCOL_META[connector.protocolType as ProtocolType];

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-400 hover:text-white">
            ← 返回
          </Button>
          <span className="text-xl">{meta?.icon || '📦'}</span>
          <div>
            <h2 className="text-lg font-semibold text-white">{connector.name}</h2>
            <p className="text-xs text-gray-400">{meta?.label} · {connector.connectorId}</p>
          </div>
          <StatusBadge status={connector.status} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => healthMutation.mutate({ connectorId })} disabled={healthMutation.isPending}>
            {healthMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Activity className="w-3 h-3 mr-1" />}
            健康检查
          </Button>
          <Button variant="outline" size="sm" onClick={() => discoverMutation.mutate({ connectorId })} disabled={discoverMutation.isPending}>
            {discoverMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileSearch className="w-3 h-3 mr-1" />}
            资源发现
          </Button>
        </div>
      </div>

      {/* 连接参数 */}
      <PageCard title="连接参数" icon={<Link className="w-4 h-4" />}>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(connector.connectionParams as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-xs text-gray-500">{k}</p>
              <p className="text-sm text-white font-mono">{String(v)}</p>
            </div>
          ))}
        </div>
      </PageCard>

      {/* 发现结果 */}
      {discoverMutation.data && discoverMutation.data.length > 0 && (
        <PageCard title={`发现的资源 (${discoverMutation.data.length})`} icon={<FileSearch className="w-4 h-4" />}>
          <div className="space-y-2">
            {discoverMutation.data.map((ep, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">{ep.resourceType}</span>
                  <div>
                    <p className="text-sm text-white">{ep.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{ep.resourcePath}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-500">{ep.dataFormat}</span>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {/* 端点列表 */}
      <PageCard title={`数据端点 (${connector.endpoints?.length || 0})`} icon={<Layers className="w-4 h-4" />}>
        {connector.endpoints && connector.endpoints.length > 0 ? (
          <div className="space-y-2">
            {connector.endpoints.map((ep: any) => (
              <div key={ep.endpointId} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-mono">{ep.resourceType}</span>
                  <div>
                    <p className="text-sm text-white font-medium">{ep.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{ep.resourcePath}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ep.status} />
                  {ep.bindingCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                      {ep.bindingCount} 绑定
                    </span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteEndpointMutation.mutate({ endpointId: ep.endpointId })} className="text-gray-500 hover:text-red-400 h-7 w-7 p-0">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">暂无端点，点击"资源发现"自动扫描</p>
          </div>
        )}
      </PageCard>
    </div>
  );
}

// ============ 主页面 ============
export default function AccessLayerManager() {
  const toast = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [filterProtocol, setFilterProtocol] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('connectors');

  const utils = trpc.useUtils();

  const statsQuery = trpc.accessLayer.stats.useQuery();
  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({
    protocolType: filterProtocol !== 'all' ? filterProtocol : undefined,
    status: filterStatus !== 'all' ? filterStatus : undefined,
    search: searchText || undefined,
  });
  const bindingsQuery = trpc.accessLayer.listBindings.useQuery({}, { enabled: activeTab === 'bindings' });

  const deleteMutation = trpc.accessLayer.deleteConnector.useMutation({
    onSuccess: () => {
      toast.success('连接器已删除');
      utils.accessLayer.listConnectors.invalidate();
      utils.accessLayer.stats.invalidate();
    },
  });

  const seedMutation = trpc.accessLayer.seedDemoData.useMutation({
    onSuccess: (data) => {
      if (data.seeded) {
        toast.success(data.message);
        utils.accessLayer.listConnectors.invalidate();
        utils.accessLayer.stats.invalidate();
        utils.accessLayer.listBindings.invalidate();
      } else {
        toast.info(data.message);
      }
    },
    onError: (err) => toast.error(`加载失败: ${err.message}`),
  });

  const stats = statsQuery.data;

  // 如果选中了某个连接器，显示详情
  if (selectedConnectorId) {
    return (
      <MainLayout title="接入层管理">
        <ConnectorDetail connectorId={selectedConnectorId} onBack={() => setSelectedConnectorId(null)} />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="接入层管理">
      <div className="space-y-4">
        {/* 统计概览 */}
        <div className="grid grid-cols-5 gap-3">
          <StatsCard icon={<PlugZap className="w-4 h-4 text-blue-400" />} label="连接器总数" value={stats?.totalConnectors || 0} color="bg-blue-500/10" />
          <StatsCard icon={<CheckCircle className="w-4 h-4 text-emerald-400" />} label="已连接" value={stats?.connectedCount || 0} color="bg-emerald-500/10" />
          <StatsCard icon={<AlertCircle className="w-4 h-4 text-red-400" />} label="异常" value={stats?.errorCount || 0} color="bg-red-500/10" />
          <StatsCard icon={<Layers className="w-4 h-4 text-purple-400" />} label="端点总数" value={stats?.totalEndpoints || 0} color="bg-purple-500/10" />
          <StatsCard icon={<ArrowRightLeft className="w-4 h-4 text-cyan-400" />} label="绑定总数" value={stats?.totalBindings || 0} color="bg-cyan-500/10" />
        </div>

        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="connectors" className="text-sm">
                <PlugZap className="w-3.5 h-3.5 mr-1" /> 连接器
              </TabsTrigger>
              <TabsTrigger value="bindings" className="text-sm">
                <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> 绑定关系
              </TabsTrigger>
              <TabsTrigger value="protocols" className="text-sm">
                <Globe className="w-3.5 h-3.5 mr-1" /> 协议总览
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {(stats?.totalConnectors || 0) === 0 && (
                <Button size="sm" variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                  {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1" />}
                  加载SHM演示数据
                </Button>
              )}
              <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> 新建连接器
              </Button>
            </div>
          </div>

          {/* 连接器列表 */}
          <TabsContent value="connectors" className="space-y-3">
            {/* 过滤器 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="搜索连接器..."
                  className="pl-8 bg-white/5 border-white/10 text-sm h-8"
                />
              </div>
              <Select value={filterProtocol} onValueChange={setFilterProtocol}>
                <SelectTrigger className="w-36 bg-white/5 border-white/10 text-sm h-8">
                  <SelectValue placeholder="协议类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部协议</SelectItem>
                  {Object.entries(PROTOCOL_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-28 bg-white/5 border-white/10 text-sm h-8">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="connected">已连接</SelectItem>
                  <SelectItem value="disconnected">未连接</SelectItem>
                  <SelectItem value="error">错误</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => utils.accessLayer.listConnectors.invalidate()} className="h-8">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* 列表 */}
            {connectorsQuery.isLoading ? (
              <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : connectorsQuery.data?.items && connectorsQuery.data.items.length > 0 ? (
              <div className="space-y-2">
                {connectorsQuery.data.items.map((conn: any) => {
                  const meta = PROTOCOL_META[conn.protocolType as ProtocolType];
                  return (
                    <div
                      key={conn.connectorId}
                      onClick={() => setSelectedConnectorId(conn.connectorId)}
                      className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{meta?.icon || '📦'}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">{conn.name}</h3>
                            <StatusBadge status={conn.status} />
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {meta?.label} · {conn.endpointCount || 0} 端点 · {conn.sourceRef || 'manual'}
                          </p>
                          {conn.description && <p className="text-xs text-gray-400 mt-0.5">{conn.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {conn.lastHealthCheck && (
                          <span className="text-xs text-gray-500">
                            {new Date(conn.lastHealthCheck).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        <Button
                          variant="ghost" size="sm"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ connectorId: conn.connectorId }); }}
                          className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                        <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <PlugZap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">暂无连接器</p>
                <p className="text-xs mt-1">点击"新建连接器"开始配置数据接入</p>
              </div>
            )}
          </TabsContent>

          {/* 绑定关系 */}
          <TabsContent value="bindings" className="space-y-3">
            {bindingsQuery.isLoading ? (
              <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : bindingsQuery.data && (bindingsQuery.data as any[]).length > 0 ? (
              <div className="space-y-2">
                {(bindingsQuery.data as any[]).map((bind: any) => (
                  <div key={bind.bindingId} className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                      <div>
                        <p className="text-sm text-white">
                          {bind.endpointName || bind.endpointId} → {bind.targetType}:{bind.targetId}
                        </p>
                        <p className="text-xs text-gray-500">
                          {bind.connectorName} · {bind.direction} · {bind.bindingId}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={bind.status} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500">
                <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">暂无绑定关系</p>
                <p className="text-xs mt-1">在端点详情中创建绑定，关联到 Pipeline 节点或 KG 数据层</p>
              </div>
            )}
          </TabsContent>

          {/* 协议总览 */}
          <TabsContent value="protocols" className="space-y-4">
            {Object.entries(PROTOCOL_CATEGORIES).map(([catKey, cat]) => (
              <div key={catKey}>
                <h4 className="text-xs font-medium text-gray-400 uppercase mb-2">{cat.label}</h4>
                <div className="grid grid-cols-3 gap-3">
                  {cat.protocols.map(p => {
                    const meta = PROTOCOL_META[p];
                    const count = stats?.protocolDistribution?.[p] || 0;
                    return (
                      <div key={p} className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                        <span className="text-2xl">{meta.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{meta.label}</p>
                          <p className="text-xs text-gray-500">{meta.description}</p>
                        </div>
                        <span className="text-lg font-semibold text-gray-300">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <CreateConnectorDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => {
          utils.accessLayer.listConnectors.invalidate();
          utils.accessLayer.stats.invalidate();
        }}
      />
    </MainLayout>
  );
}
