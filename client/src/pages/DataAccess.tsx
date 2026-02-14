/**
 * 数据接入页面（快捷入口）
 * 数据中心 > 数据接入
 * 面向数据工程师的连接器管理快捷入口，底层调用接入层统一 API
 */
import { useState } from 'react';
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
  Server, Cpu, ChevronRight, PlugZap, Layers, ArrowRightLeft, FileSearch
} from 'lucide-react';
import {
  PROTOCOL_META, PROTOCOL_CATEGORIES,
  type ProtocolType, type ProtocolConfigField,
} from '@shared/accessLayerTypes';

// ============ 状态图标 ============
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    draft: { icon: <Settings className="w-3 h-3" />, label: '草稿', className: 'bg-gray-500/20 text-gray-400' },
    testing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: '测试中', className: 'bg-yellow-500/20 text-yellow-400' },
    connected: { icon: <CheckCircle className="w-3 h-3" />, label: '已连接', className: 'bg-emerald-500/20 text-emerald-400' },
    disconnected: { icon: <XCircle className="w-3 h-3" />, label: '未连接', className: 'bg-gray-500/20 text-gray-400' },
    error: { icon: <AlertCircle className="w-3 h-3" />, label: '错误', className: 'bg-red-500/20 text-red-400' },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ============ 快速创建连接器对话框 ============
function QuickCreateDialog({
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
    { protocolType: selectedProtocol! },
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
      if (result.success) toast.success(`连接测试成功 (${result.latencyMs}ms)`);
      else toast.error(`连接测试失败: ${result.message}`);
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

  const renderField = (field: ProtocolConfigField, values: Record<string, unknown>, setter: (v: Record<string, unknown>) => void) => {
    const value = values[field.key] ?? field.defaultValue ?? '';
    return (
      <div key={field.key} className="space-y-1">
        <Label className="text-[10px] text-gray-400">
          {field.label} {field.required && <span className="text-red-400">*</span>}
        </Label>
        {field.type === 'select' ? (
          <Select value={String(value)} onValueChange={(v) => setter({ ...values, [field.key]: v })}>
            <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
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
            <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
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
            className="h-8 text-[11px] bg-slate-800 border-slate-700"
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm text-white">
            {step === 'protocol' ? '选择数据源协议' : `配置 ${PROTOCOL_META[selectedProtocol!]?.label} 连接`}
          </DialogTitle>
        </DialogHeader>

        {step === 'protocol' ? (
          <div className="space-y-3">
            {Object.entries(PROTOCOL_CATEGORIES).map(([catKey, cat]) => (
              <div key={catKey}>
                <h4 className="text-[10px] font-medium text-gray-500 uppercase mb-1.5">{cat.label}</h4>
                <div className="grid grid-cols-3 gap-1.5">
                  {cat.protocols.map(p => {
                    const meta = PROTOCOL_META[p];
                    return (
                      <button
                        key={p}
                        onClick={() => { setSelectedProtocol(p); setStep('config'); }}
                        className="flex items-center gap-2 p-2 rounded border border-slate-700 bg-slate-800/50 hover:border-blue-500/50 hover:bg-blue-500/5 text-left transition-all"
                      >
                        <span className="text-base">{meta.icon}</span>
                        <div>
                          <p className="text-[11px] font-medium text-white">{meta.label}</p>
                          <p className="text-[9px] text-gray-500 line-clamp-1">{meta.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-400">连接器名称 <span className="text-red-400">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：生产线MQTT网关" className="h-8 text-[11px] bg-slate-800 border-slate-700" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-400">描述</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" className="h-8 text-[11px] bg-slate-800 border-slate-700" />
              </div>
            </div>

            {schemaQuery.data && (
              <>
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-medium text-gray-400 flex items-center gap-1">
                    <Link className="w-3 h-3" /> 连接参数
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {schemaQuery.data.connectionFields.map(f => renderField(f, connectionParams, setConnectionParams))}
                  </div>
                </div>
                {schemaQuery.data.authFields && schemaQuery.data.authFields.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-medium text-gray-400">认证配置</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {schemaQuery.data.authFields.map(f => renderField(f, authConfig, setAuthConfig))}
                    </div>
                  </div>
                )}
              </>
            )}

            <DialogFooter className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setStep('protocol')}>
                返回
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => {
                if (!selectedProtocol) return;
                testMutation.mutate({ protocolType: selectedProtocol, connectionParams, authConfig });
              }} disabled={testMutation.isPending}>
                {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                测试连接
              </Button>
              <Button size="sm" className="h-7 text-[10px]" onClick={() => {
                if (!selectedProtocol || !name.trim()) { toast.error('请填写名称'); return; }
                createMutation.mutate({
                  name: name.trim(), protocolType: selectedProtocol,
                  description: description || undefined, connectionParams,
                  authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
                });
              }} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                创建
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============ 主页面 ============
export default function DataAccess() {
  const toast = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filterProtocol, setFilterProtocol] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  const utils = trpc.useUtils();

  const statsQuery = trpc.accessLayer.stats.useQuery();
  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({
    protocolType: filterProtocol !== 'all' ? filterProtocol : undefined,
    search: searchText || undefined,
  });

  const deleteMutation = trpc.accessLayer.deleteConnector.useMutation({
    onSuccess: () => {
      toast.success('连接器已删除');
      utils.accessLayer.listConnectors.invalidate();
      utils.accessLayer.stats.invalidate();
    },
  });

  const healthMutation = trpc.accessLayer.healthCheck.useMutation({
    onSuccess: (result) => {
      toast.success(`健康检查: ${result.status} (${result.latencyMs}ms)`);
      utils.accessLayer.listConnectors.invalidate();
    },
  });

  const stats = statsQuery.data;

  return (
    <MainLayout title="数据接入">
      <div className="space-y-3">
        {/* 统计概览 */}
        <div className="grid grid-cols-4 gap-2">
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-white">{stats?.totalConnectors || 0}</div>
              <div className="text-[9px] text-gray-400">连接器总数</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">{stats?.connectedCount || 0}</div>
              <div className="text-[9px] text-gray-400">已连接</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-purple-400">{stats?.totalEndpoints || 0}</div>
              <div className="text-[9px] text-gray-400">端点总数</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-red-400">{stats?.errorCount || 0}</div>
              <div className="text-[9px] text-gray-400">异常</div>
            </div>
          </PageCard>
        </div>

        {/* 操作栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索连接器..."
                className="pl-7 h-7 w-48 text-[10px] bg-slate-800 border-slate-700"
              />
            </div>
            <Select value={filterProtocol} onValueChange={setFilterProtocol}>
              <SelectTrigger className="w-28 h-7 text-[10px] bg-slate-800 border-slate-700">
                <SelectValue placeholder="协议类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部协议</SelectItem>
                {Object.entries(PROTOCOL_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => utils.accessLayer.listConnectors.invalidate()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-3 h-3 mr-1" /> 添加数据源
            </Button>
          </div>
        </div>

        {/* 连接器列表 */}
        {connectorsQuery.isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : connectorsQuery.data?.items && connectorsQuery.data.items.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {connectorsQuery.data.items.map((conn: any) => {
              const meta = PROTOCOL_META[conn.protocolType as ProtocolType];
              return (
                <PageCard key={conn.connectorId} className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 rounded bg-slate-700/50 text-lg">
                        {meta?.icon || '📦'}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-white">{conn.name}</span>
                          <StatusBadge status={conn.status} />
                        </div>
                        <p className="text-[9px] text-gray-400 mt-0.5">{conn.description || meta?.label || conn.protocolType}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-gray-500">
                            {meta?.label} · {conn.endpointCount || 0} 端点
                          </span>
                          {conn.lastHealthCheck && (
                            <span className="text-[9px] text-gray-500">
                              {new Date(conn.lastHealthCheck).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0"
                        onClick={() => healthMutation.mutate({ connectorId: conn.connectorId })}
                        disabled={healthMutation.isPending}
                        title="健康检查"
                      >
                        <Activity className={`w-3 h-3 ${healthMutation.isPending ? 'animate-pulse' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                        onClick={() => deleteMutation.mutate({ connectorId: conn.connectorId })}
                        title="删除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </PageCard>
              );
            })}
          </div>
        ) : (
          <PageCard className="p-6 text-center">
            <PlugZap className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-[11px] text-gray-400">暂无数据源</p>
            <p className="text-[9px] text-gray-500 mt-1">点击"添加数据源"开始配置数据接入</p>
            <Button
              size="sm" variant="outline" className="mt-2 h-7 text-[10px]"
              onClick={() => setShowAddDialog(true)}
            >
              添加数据源
            </Button>
          </PageCard>
        )}

        {/* 提示：完整管理入口 */}
        <div className="flex items-center justify-center gap-2 py-2">
          <span className="text-[9px] text-gray-500">需要管理端点和绑定？</span>
          <a href="/settings/config/access-layer" className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5">
            前往接入层管理 <ChevronRight className="w-3 h-3" />
          </a>
        </div>
      </div>

      <QuickCreateDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onCreated={() => {
          utils.accessLayer.listConnectors.invalidate();
          utils.accessLayer.stats.invalidate();
        }}
      />
    </MainLayout>
  );
}
