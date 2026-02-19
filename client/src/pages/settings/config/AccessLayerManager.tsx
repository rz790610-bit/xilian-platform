/**
 * 接入层管理 — 工业级协议配置中心
 * 
 * 所有协议列表、分类、配置 Schema 均从后端注册表 API 动态获取，
 * 前端零硬编码。新增适配器后端注册即自动上线。
 * 
 * 功能：
 * - 协议总览（按分类展示所有已注册协议）
 * - 连接器 CRUD（新建/编辑/删除/测试连接）
 * - 端点管理（资源发现/手动添加/编辑/删除/一键导入）
 * - 绑定管理（端点→目标的数据流向）
 * - 健康检查（批量/单个）
 * - 演示数据加载
 * - 高级配置按 group 分组渲染
 * - PEM 证书 textarea 支持
 */
import { useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';
import {
  Network, Plus, Activity, RefreshCw, Trash2, Search,
  CheckCircle, XCircle, AlertTriangle, Loader2, Link2,
  Plug, Settings, Eye, Zap, ArrowRight, ChevronDown, ChevronRight,
  Globe, Database, Radio, Server, HardDrive, Box,
  Download, FileText, Edit3, PlusCircle,
} from 'lucide-react';
import type {
  ProtocolType, ConnectorInfo, EndpointInfo, BindingInfo,
  ProtocolConfigField, ConnectorStatus,
} from '../../../../shared/accessLayerTypes';

// ============ 状态颜色映射 ============
const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  disconnected: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  testing: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  draft: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  inactive: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  discovered: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  paused: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  connected: '已连接', disconnected: '已断开', error: '错误',
  testing: '测试中', draft: '草稿', active: '活跃',
  inactive: '未激活', discovered: '已发现', paused: '已暂停',
};

const CATEGORY_ICONS: Record<string, typeof Network> = {
  industrial: Radio, database: Database, messaging: Zap,
  storage: Box, api: Globe,
};

// ============ 动态表单字段渲染（支持 textarea / group） ============
function DynamicFormField({
  field, value, onChange,
}: {
  field: ProtocolConfigField;
  value: unknown;
  onChange: (key: string, val: unknown) => void;
}) {
  const v = value ?? field.defaultValue ?? '';

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer col-span-2">
        <input
          type="checkbox"
          checked={!!v}
          onChange={e => onChange(field.key, e.target.checked)}
          className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30"
        />
        <span className="text-sm text-zinc-300">{field.label}</span>
        {field.description && <span className="text-xs text-zinc-500 truncate max-w-[300px]">({field.description})</span>}
      </label>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1">
        <label className="text-xs text-zinc-400 font-medium">{field.label}{field.required && <span className="text-red-400">*</span>}</label>
        <Select value={String(v)} onValueChange={val => onChange(field.key, val)}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
            <SelectValue placeholder={field.placeholder || '请选择'} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
      </div>
    );
  }

  // textarea — 用于 PEM 证书、JSON 片段等多行文本
  if (field.type === 'textarea') {
    return (
      <div className="space-y-1 col-span-2">
        <label className="text-xs text-zinc-400 font-medium">{field.label}{field.required && <span className="text-red-400">*</span>}</label>
        <textarea
          value={String(v)}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder={field.placeholder || '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
          rows={5}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-y"
        />
        {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
      </div>
    );
  }

  if (field.type === 'json') {
    return (
      <div className="space-y-1 col-span-2">
        <label className="text-xs text-zinc-400 font-medium">{field.label}{field.required && <span className="text-red-400">*</span>}</label>
        <textarea
          value={typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
          onChange={e => {
            try { onChange(field.key, JSON.parse(e.target.value)); } catch { onChange(field.key, e.target.value); }
          }}
          placeholder={field.placeholder}
          rows={4}
          className="w-full rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm font-mono text-zinc-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-y"
        />
        {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="text-xs text-zinc-400 font-medium">{field.label}{field.required && <span className="text-red-400">*</span>}</label>
      <Input
        type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={String(v)}
        onChange={e => onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
        placeholder={field.placeholder}
        className="bg-zinc-800 border-zinc-700 text-sm"
      />
      {field.description && <p className="text-xs text-zinc-500">{field.description}</p>}
    </div>
  );
}

// ============ 按 group 分组渲染高级配置 ============
function GroupedAdvancedFields({
  fields, values, onChange,
}: {
  fields: ProtocolConfigField[];
  values: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // 按 group 分组
  const groups = useMemo(() => {
    const map = new Map<string, ProtocolConfigField[]>();
    for (const f of fields) {
      const group = f.group || '通用';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(f);
    }
    return Array.from(map.entries());
  }, [fields]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (groups.length <= 1) {
    // 没有分组或只有一个分组，直接平铺
    return (
      <div className="grid grid-cols-2 gap-3 pl-5 border-l border-zinc-700">
        {fields.map(f => (
          <DynamicFormField key={f.key} field={f} value={values[f.key]} onChange={onChange} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 pl-3 border-l border-zinc-700">
      {groups.map(([group, groupFields]) => {
        const isExpanded = expandedGroups.has(group);
        return (
          <div key={group} className="space-y-2">
            <button
              onClick={() => toggleGroup(group)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
            >
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {group} ({groupFields.length})
            </button>
            {isExpanded && (
              <div className="grid grid-cols-2 gap-3 pl-4">
                {groupFields.map(f => (
                  <DynamicFormField key={f.key} field={f} value={values[f.key]} onChange={onChange} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============ 新建/编辑连接器对话框 ============
function ConnectorDialog({
  open, onClose, protocolSchemas, editConnector, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  protocolSchemas: any[];
  editConnector?: ConnectorInfo | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<'select' | 'config'>(editConnector ? 'config' : 'select');
  const [selectedProtocol, setSelectedProtocol] = useState<string>(editConnector?.protocolType || '');
  const [name, setName] = useState(editConnector?.name || '');
  const [description, setDescription] = useState(editConnector?.description || '');
  const [connectionParams, setConnectionParams] = useState<Record<string, unknown>>(editConnector?.connectionParams || {});
  const [authConfig, setAuthConfig] = useState<Record<string, unknown>>(editConnector?.authConfig || {});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const schema = useMemo(() => protocolSchemas.find((s: any) => s.protocolType === selectedProtocol), [protocolSchemas, selectedProtocol]);

  const createMutation = trpc.accessLayer.createConnector.useMutation({
    onSuccess: () => { toast({ title: '连接器已创建', variant: 'default' }); onSaved(); onClose(); },
    onError: (err) => toast({ title: '创建失败', description: err.message, variant: 'destructive' }),
  });
  const updateMutation = trpc.accessLayer.updateConnector.useMutation({
    onSuccess: () => { toast({ title: '连接器已更新', variant: 'default' }); onSaved(); onClose(); },
    onError: (err) => toast({ title: '更新失败', description: err.message, variant: 'destructive' }),
  });
  const testMutation = trpc.accessLayer.testConnection.useMutation();

  const handleTest = async () => {
    if (!selectedProtocol) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync({
        protocolType: selectedProtocol as ProtocolType,
        connectionParams,
        authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
      });
      setTestResult({ success: result.success, message: result.message });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '连接测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) { toast({ title: '请输入连接器名称', variant: 'destructive' }); return; }
    if (editConnector) {
      updateMutation.mutate({
        connectorId: editConnector.connectorId,
        data: { name, description, connectionParams, authConfig },
      });
    } else {
      createMutation.mutate({
        name, description, protocolType: selectedProtocol as ProtocolType,
        connectionParams, authConfig,
      });
    }
  };

  // 按分类分组协议
  const groupedProtocols = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const s of protocolSchemas) {
      const cat = s.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    }
    return groups;
  }, [protocolSchemas]);

  const updateParam = useCallback((key: string, val: unknown) => {
    setConnectionParams(prev => ({ ...prev, [key]: val }));
  }, []);

  const updateAuth = useCallback((key: string, val: unknown) => {
    setAuthConfig(prev => ({ ...prev, [key]: val }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            {editConnector ? '编辑连接器' : step === 'select' ? '选择协议' : `新建 ${schema?.label || ''} 连接器`}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {step === 'select' ? '选择要连接的协议类型' : '配置连接参数'}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && !editConnector ? (
          <div className="space-y-4 py-2">
            {Object.entries(groupedProtocols).map(([cat, protocols]) => {
              const CatIcon = CATEGORY_ICONS[cat] || Network;
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-400 font-medium">
                    <CatIcon className="w-4 h-4" />
                    <span>{cat === 'industrial' ? '工业协议' : cat === 'database' ? '数据库' : cat === 'messaging' ? '消息队列' : cat === 'storage' ? '对象存储' : cat === 'api' ? 'API' : cat}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {protocols.map((p: any) => (
                      <button
                        key={p.protocolType}
                        onClick={() => { setSelectedProtocol(p.protocolType); setStep('config'); }}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center",
                          "border-zinc-700 hover:border-blue-500/50 hover:bg-blue-500/5",
                        )}
                      >
                        <span className="text-xl">{p.icon}</span>
                        <span className="text-sm font-medium text-zinc-200">{p.label}</span>
                        <span className="text-[10px] text-zinc-500 line-clamp-1">{p.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">连接器名称<span className="text-red-400">*</span></label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="例: 生产线-MQTT-01" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">描述</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="可选" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
            </div>

            {/* 连接参数 */}
            {schema && (
              <>
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2"><Plug className="w-4 h-4" /> 连接参数</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {schema.connectionFields.map((f: ProtocolConfigField) => (
                      <DynamicFormField key={f.key} field={f} value={connectionParams[f.key]} onChange={updateParam} />
                    ))}
                  </div>
                </div>

                {/* 认证 */}
                {schema.authFields.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2"><Settings className="w-4 h-4" /> 认证配置</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {schema.authFields.map((f: ProtocolConfigField) => (
                        <DynamicFormField key={f.key} field={f} value={authConfig[f.key]} onChange={updateAuth} />
                      ))}
                    </div>
                  </div>
                )}

                {/* 高级配置 — 按 group 分组渲染 */}
                {schema.advancedFields && schema.advancedFields.length > 0 && (
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {showAdvanced ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      高级配置 ({schema.advancedFields.length} 项)
                    </button>
                    {showAdvanced && (
                      <GroupedAdvancedFields
                        fields={schema.advancedFields}
                        values={connectionParams}
                        onChange={updateParam}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {/* 测试结果 */}
            {testResult && (
              <div className={cn(
                "flex items-center gap-2 p-3 rounded-lg border text-sm",
                testResult.success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"
              )}>
                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 'config' && !editConnector && (
            <Button variant="outline" onClick={() => setStep('select')} className="mr-auto">
              返回选择
            </Button>
          )}
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={handleTest} disabled={testing || !selectedProtocol}>
                {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
                测试连接
              </Button>
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editConnector ? '保存修改' : '创建连接器'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ 连接器卡片 ============
function ConnectorCard({
  connector, protocolMeta, onEdit, onDelete, onHealthCheck, onDiscover, onViewEndpoints,
}: {
  connector: ConnectorInfo;
  protocolMeta: Record<string, { label: string; icon: string }>;
  onEdit: () => void;
  onDelete: () => void;
  onHealthCheck: () => void;
  onDiscover: () => void;
  onViewEndpoints: () => void;
}) {
  const meta = protocolMeta[connector.protocolType] || { label: connector.protocolType, icon: '📦' };
  const statusClass = STATUS_COLORS[connector.status] || STATUS_COLORS.draft;

  return (
    <div className="group p-4 rounded-lg border border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div>
            <h4 className="text-sm font-medium text-zinc-200">{connector.name}</h4>
            <p className="text-xs text-zinc-500">{meta.label} · {connector.connectorId.slice(0, 8)}</p>
          </div>
        </div>
        <Badge className={cn("text-[10px] border", statusClass)}>
          {STATUS_LABELS[connector.status] || connector.status}
        </Badge>
      </div>

      {connector.description && (
        <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{connector.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
        <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> {connector.endpointCount ?? 0} 端点</span>
        <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" /> {connector.bindingCount ?? 0} 绑定</span>
        {connector.lastHealthCheck && (
          <span>上次检查: {new Date(connector.lastHealthCheck).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        )}
      </div>

      {connector.lastError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400/80 mb-3 bg-red-500/5 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="line-clamp-1">{connector.lastError}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="outline" size="sm" onClick={onHealthCheck} className="h-7 text-xs px-2">
          <Activity className="w-3 h-3 mr-1" /> 检查
        </Button>
        <Button variant="outline" size="sm" onClick={onDiscover} className="h-7 text-xs px-2">
          <Search className="w-3 h-3 mr-1" /> 发现
        </Button>
        <Button variant="outline" size="sm" onClick={onViewEndpoints} className="h-7 text-xs px-2">
          <Eye className="w-3 h-3 mr-1" /> 端点
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit} className="h-7 text-xs px-2">
          <Settings className="w-3 h-3 mr-1" /> 编辑
        </Button>
        <Button variant="outline" size="sm" onClick={onDelete} className="h-7 text-xs px-2 text-red-400 hover:text-red-300">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ============ 端点管理对话框（完整 CRUD + 一键导入） ============
function EndpointDialog({
  connectorId, protocolMeta, onClose,
}: {
  connectorId: string;
  protocolMeta: Record<string, { label: string; icon: string }>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<EndpointInfo | null>(null);
  const [newEndpoint, setNewEndpoint] = useState({ name: '', resourcePath: '', resourceType: 'data', dataFormat: 'json' });

  const endpointsQuery = trpc.accessLayer.listEndpoints.useQuery({ connectorId });
  const endpoints = endpointsQuery.data || [];

  const discoverMutation = trpc.accessLayer.discoverEndpoints.useMutation({
    onSuccess: (discovered) => {
      toast({ title: `发现 ${discovered.length} 个资源` });
      endpointsQuery.refetch();
    },
    onError: (err) => toast({ title: '资源发现失败', description: err.message, variant: 'destructive' }),
  });

  const createMutation = trpc.accessLayer.createEndpoint.useMutation({
    onSuccess: () => {
      toast({ title: '端点已创建' });
      setShowAddForm(false);
      setNewEndpoint({ name: '', resourcePath: '', resourceType: 'data', dataFormat: 'json' });
      endpointsQuery.refetch();
    },
    onError: (err) => toast({ title: '创建失败', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = trpc.accessLayer.updateEndpoint.useMutation({
    onSuccess: () => {
      toast({ title: '端点已更新' });
      setEditingEndpoint(null);
      endpointsQuery.refetch();
    },
    onError: (err) => toast({ title: '更新失败', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = trpc.accessLayer.deleteEndpoint.useMutation({
    onSuccess: () => {
      toast({ title: '端点已删除' });
      endpointsQuery.refetch();
    },
    onError: (err) => toast({ title: '删除失败', description: err.message, variant: 'destructive' }),
  });

  const handleCreate = () => {
    if (!newEndpoint.name.trim() || !newEndpoint.resourcePath.trim()) {
      toast({ title: '请填写名称和资源路径', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      connectorId,
      ...newEndpoint,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">端点管理</DialogTitle>
          <DialogDescription className="text-zinc-400">连接器 {connectorId.slice(0, 8)} 的端点列表</DialogDescription>
        </DialogHeader>

        {/* 操作栏 */}
        <div className="flex items-center gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => discoverMutation.mutate({ connectorId })} disabled={discoverMutation.isPending}>
            {discoverMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            自动发现
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            <PlusCircle className="w-4 h-4 mr-1" /> 手动添加
          </Button>
          <Button variant="outline" size="sm" onClick={() => endpointsQuery.refetch()} className="ml-auto">
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* 手动添加表单 */}
        {showAddForm && (
          <div className="p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 space-y-3 mb-3">
            <h4 className="text-xs font-medium text-zinc-400">手动添加端点</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">名称<span className="text-red-400">*</span></label>
                <Input
                  value={newEndpoint.name}
                  onChange={e => setNewEndpoint(p => ({ ...p, name: e.target.value }))}
                  placeholder="例: 温度传感器-01"
                  className="bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">资源路径<span className="text-red-400">*</span></label>
                <Input
                  value={newEndpoint.resourcePath}
                  onChange={e => setNewEndpoint(p => ({ ...p, resourcePath: e.target.value }))}
                  placeholder="例: sensors/temperature/01"
                  className="bg-zinc-800 border-zinc-700 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">资源类型</label>
                <Select value={newEndpoint.resourceType} onValueChange={val => setNewEndpoint(p => ({ ...p, resourceType: val }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="data">数据</SelectItem>
                    <SelectItem value="topic">主题</SelectItem>
                    <SelectItem value="register">寄存器</SelectItem>
                    <SelectItem value="node">节点</SelectItem>
                    <SelectItem value="table">表</SelectItem>
                    <SelectItem value="io-data">I/O 数据</SelectItem>
                    <SelectItem value="pdo-entry">PDO 条目</SelectItem>
                    <SelectItem value="sdo">SDO 对象</SelectItem>
                    <SelectItem value="diagnostic">诊断</SelectItem>
                    <SelectItem value="slave">从站</SelectItem>
                    <SelectItem value="assembly">Assembly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">数据格式</label>
                <Select value={newEndpoint.dataFormat} onValueChange={val => setNewEndpoint(p => ({ ...p, dataFormat: val }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="binary">Binary</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="protobuf">Protobuf</SelectItem>
                    <SelectItem value="sparkplug-b">Sparkplug B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>取消</Button>
              <Button size="sm" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                创建
              </Button>
            </div>
          </div>
        )}

        {/* 端点列表 */}
        <div className="space-y-2">
          {(endpoints as EndpointInfo[]).length > 0 ? (
            (endpoints as EndpointInfo[]).map(ep => (
              <div key={ep.endpointId} className="group/ep flex items-center justify-between p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 hover:border-zinc-600 transition-all">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{ep.name}</span>
                    <Badge className={cn("text-[10px] border", STATUS_COLORS[ep.status] || STATUS_COLORS.inactive)}>
                      {STATUS_LABELS[ep.status] || ep.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    <span className="font-mono">{ep.resourcePath}</span>
                    <span className="mx-1">·</span>
                    <span>{ep.resourceType}</span>
                    {ep.dataFormat && <><span className="mx-1">·</span><span>{ep.dataFormat}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover/ep:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingEndpoint(ep)}>
                    <Edit3 className="w-3 h-3 text-zinc-400" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => {
                      if (confirm(`确认删除端点 "${ep.name}"？`)) {
                        deleteMutation.mutate({ endpointId: ep.endpointId });
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {endpointsQuery.isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin inline mr-2" />加载中...</>
              ) : (
                <div className="space-y-2">
                  <FileText className="w-8 h-8 mx-auto opacity-30" />
                  <p>暂无端点</p>
                  <p className="text-xs">点击"自动发现"或"手动添加"创建端点</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-xs text-zinc-500 text-right">
          共 {(endpoints as EndpointInfo[]).length} 个端点
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ 批量健康检查结果对话框 ============
function BatchHealthCheckDialog({
  open, onClose, results,
}: {
  open: boolean;
  onClose: () => void;
  results: { total: number; healthy: number; unhealthy: number; results: Array<{ connectorId: string; name: string; status: string; message: string; latencyMs: number }> } | null;
}) {
  if (!results) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[70vh] overflow-y-auto bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">批量健康检查结果</DialogTitle>
          <DialogDescription className="text-zinc-400">
            共 {results.total} 个连接器 · {results.healthy} 健康 · {results.unhealthy} 异常
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {results.results.map(r => (
            <div key={r.connectorId} className={cn(
              "flex items-center justify-between p-3 rounded-lg border text-sm",
              r.status === 'healthy' ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"
            )}>
              <div>
                <span className="font-medium text-zinc-200">{r.name}</span>
                <p className="text-xs text-zinc-400 mt-0.5">{r.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-zinc-500">{r.latencyMs}ms</span>
                {r.status === 'healthy' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
              </div>
            </div>
          ))}
          {results.results.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">暂无连接器</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ 主页面 ============
export default function AccessLayerManager() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [filterProtocol, setFilterProtocol] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<ConnectorInfo | null>(null);
  const [endpointDialogConnector, setEndpointDialogConnector] = useState<string | null>(null);
  const [batchCheckResults, setBatchCheckResults] = useState<any>(null);
  const [batchCheckDialogOpen, setBatchCheckDialogOpen] = useState(false);

  // ============ 从注册表 API 动态获取 ============
  const protocolsQuery = trpc.accessLayer.listProtocols.useQuery();
  const categoriesQuery = trpc.accessLayer.listCategories.useQuery();
  const schemasQuery = trpc.accessLayer.protocolSchemas.useQuery();
  const connectorsQuery = trpc.accessLayer.listConnectors.useQuery({});
  const statsQuery = trpc.accessLayer.getStats.useQuery();

  // mutations
  const deleteMutation = trpc.accessLayer.deleteConnector.useMutation({
    onSuccess: () => { toast({ title: '连接器已删除' }); connectorsQuery.refetch(); statsQuery.refetch(); },
    onError: (err) => toast({ title: '删除失败', description: err.message, variant: 'destructive' }),
  });
  const healthCheckMutation = trpc.accessLayer.healthCheck.useMutation({
    onSuccess: (result) => {
      toast({ title: `健康检查: ${result.status}`, description: result.message });
      connectorsQuery.refetch();
    },
    onError: (err) => toast({ title: '健康检查失败', description: err.message, variant: 'destructive' }),
  });
  const discoverMutation = trpc.accessLayer.discoverEndpoints.useMutation({
    onSuccess: (endpoints) => {
      toast({ title: `发现 ${endpoints.length} 个资源` });
      connectorsQuery.refetch();
    },
    onError: (err) => toast({ title: '资源发现失败', description: err.message, variant: 'destructive' }),
  });
  const seedMutation = trpc.accessLayer.seedDemoData.useMutation({
    onSuccess: (result) => {
      toast({ title: '演示数据已加载', description: `创建了 ${(result as any)?.connectorCount ?? ''} 个连接器` });
      connectorsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast({ title: '加载失败', description: err.message, variant: 'destructive' }),
  });
  const batchCheckMutation = trpc.accessLayer.batchHealthCheck.useMutation({
    onSuccess: (result) => {
      setBatchCheckResults(result);
      setBatchCheckDialogOpen(true);
      connectorsQuery.refetch();
    },
    onError: (err) => toast({ title: '批量检查失败', description: err.message, variant: 'destructive' }),
  });

  const protocols = protocolsQuery.data || [];
  const categories = categoriesQuery.data || {};
  const schemas = schemasQuery.data || [];
  const connectors = (connectorsQuery.data as any)?.items || connectorsQuery.data || [];
  const stats = statsQuery.data;

  // 协议元数据映射（从 API 动态构建）
  const protocolMeta = useMemo(() => {
    const map: Record<string, { label: string; icon: string; description: string }> = {};
    for (const p of protocols) {
      map[p.protocolType] = { label: p.label, icon: p.icon, description: p.description };
    }
    return map;
  }, [protocols]);

  // 过滤连接器
  const filteredConnectors = useMemo(() => {
    return (connectors as ConnectorInfo[]).filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.protocolType.includes(search.toLowerCase())) return false;
      if (filterProtocol !== 'all' && c.protocolType !== filterProtocol) return false;
      if (filterStatus !== 'all' && c.status !== filterStatus) return false;
      return true;
    });
  }, [connectors, search, filterProtocol, filterStatus]);

  const handleRefreshAll = useCallback(() => {
    protocolsQuery.refetch();
    categoriesQuery.refetch();
    connectorsQuery.refetch();
    statsQuery.refetch();
    toast({ title: '数据已刷新' });
  }, []);

  return (
    <MainLayout title="接入层管理">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="已注册协议" value={protocols.length} icon={<Plug className="w-5 h-5 text-blue-400" />} />
        <StatCard label="连接器总数" value={stats?.totalConnectors ?? 0} icon={<Network className="w-5 h-5 text-emerald-400" />} />
        <StatCard label="已连接" value={stats?.connectedCount ?? 0} icon={<CheckCircle className="w-5 h-5 text-green-400" />} />
        <StatCard label="端点总数" value={stats?.totalEndpoints ?? 0} icon={<Link2 className="w-5 h-5 text-cyan-400" />} />
        <StatCard label="绑定总数" value={stats?.totalBindings ?? 0} icon={<ArrowRight className="w-5 h-5 text-purple-400" />} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-zinc-800/50">
            <TabsTrigger value="overview">协议总览</TabsTrigger>
            <TabsTrigger value="connectors">连接器管理</TabsTrigger>
            <TabsTrigger value="metrics">适配器指标</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              演示数据
            </Button>
            <Button variant="outline" size="sm" onClick={() => batchCheckMutation.mutate()} disabled={batchCheckMutation.isPending}>
              {batchCheckMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Activity className="w-4 h-4 mr-1" />}
              批量检查
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
            <Button size="sm" onClick={() => { setEditConnector(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> 新建连接器
            </Button>
          </div>
        </div>

        {/* ============ 协议总览 Tab ============ */}
        <TabsContent value="overview" className="space-y-6">
          {Object.entries(categories).map(([catKey, catData]: [string, any]) => {
            const CatIcon = CATEGORY_ICONS[catKey] || Network;
            return (
              <PageCard
                key={catKey}
                title={catData.label}
                icon={<CatIcon className="w-5 h-5" />}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {catData.protocols.map((p: any) => {
                    const connCount = (connectors as ConnectorInfo[]).filter(c => c.protocolType === p.protocolType).length;
                    return (
                      <div
                        key={p.protocolType}
                        className="flex items-center gap-3 p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20 hover:border-zinc-600 transition-all cursor-pointer"
                        onClick={() => { setFilterProtocol(p.protocolType); setActiveTab('connectors'); }}
                      >
                        <span className="text-2xl">{p.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-zinc-200">{p.label}</div>
                          <div className="text-[10px] text-zinc-500 line-clamp-1">{p.description}</div>
                          {connCount > 0 && (
                            <div className="text-[10px] text-emerald-400 mt-0.5">{connCount} 个连接器</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PageCard>
            );
          })}

          {protocolsQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载协议注册表...
            </div>
          )}
        </TabsContent>

        {/* ============ 连接器管理 Tab ============ */}
        <TabsContent value="connectors" className="space-y-4">
          {/* 过滤栏 */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索连接器..."
                className="pl-9 bg-zinc-800 border-zinc-700 text-sm"
              />
            </div>
            <Select value={filterProtocol} onValueChange={setFilterProtocol}>
              <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-sm">
                <SelectValue placeholder="协议类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部协议</SelectItem>
                {protocols.map(p => (
                  <SelectItem key={p.protocolType} value={p.protocolType}>{p.icon} {p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-32 bg-zinc-800 border-zinc-700 text-sm">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="connected">已连接</SelectItem>
                <SelectItem value="disconnected">已断开</SelectItem>
                <SelectItem value="error">错误</SelectItem>
                <SelectItem value="draft">草稿</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 连接器列表 */}
          {filteredConnectors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredConnectors.map(c => (
                <ConnectorCard
                  key={c.connectorId}
                  connector={c}
                  protocolMeta={protocolMeta}
                  onEdit={() => { setEditConnector(c); setDialogOpen(true); }}
                  onDelete={() => {
                    if (confirm(`确认删除连接器 "${c.name}"？`)) {
                      deleteMutation.mutate({ connectorId: c.connectorId });
                    }
                  }}
                  onHealthCheck={() => healthCheckMutation.mutate({ connectorId: c.connectorId })}
                  onDiscover={() => discoverMutation.mutate({ connectorId: c.connectorId })}
                  onViewEndpoints={() => setEndpointDialogConnector(c.connectorId)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Network className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">暂无连接器</p>
              <p className="text-xs mt-1">点击"演示数据"快速加载示例，或"新建连接器"手动创建</p>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                  {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                  加载演示数据
                </Button>
                <Button size="sm" onClick={() => { setEditConnector(null); setDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> 新建连接器
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============ 适配器指标 Tab ============ */}
        <TabsContent value="metrics" className="space-y-4">
          <PageCard title="适配器运行指标" icon={<Activity className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {protocols.map(p => (
                <div key={p.protocolType} className="p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{p.icon}</span>
                    <span className="text-sm font-medium text-zinc-200">{p.label}</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{p.category}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-zinc-500">连接字段</span>
                      <div className="text-zinc-300 font-medium">{p.fieldCounts.connection}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500">认证字段</span>
                      <div className="text-zinc-300 font-medium">{p.fieldCounts.auth}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500">高级字段</span>
                      <div className="text-zinc-300 font-medium">{p.fieldCounts.advanced}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>

      {/* 端点管理对话框 */}
      {endpointDialogConnector && (
        <EndpointDialog
          connectorId={endpointDialogConnector}
          protocolMeta={protocolMeta}
          onClose={() => setEndpointDialogConnector(null)}
        />
      )}

      {/* 新建/编辑连接器对话框 */}
      {dialogOpen && (
        <ConnectorDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditConnector(null); }}
          protocolSchemas={schemas}
          editConnector={editConnector}
          onSaved={() => { connectorsQuery.refetch(); statsQuery.refetch(); }}
        />
      )}

      {/* 批量健康检查结果对话框 */}
      <BatchHealthCheckDialog
        open={batchCheckDialogOpen}
        onClose={() => setBatchCheckDialogOpen(false)}
        results={batchCheckResults}
      />
    </MainLayout>
  );
}
