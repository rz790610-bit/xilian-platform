/**
 * 设备管理 - 基础设置 (L1 设备层)
 * 按《设备管控系统分类编码标准》自动生成编码
 * 支持自定义增加列
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { useCustomColumns, type CustomColumn } from './useCustomColumns';
import {
  LEVEL1_CODES, LEVEL2_CODES, LEVEL3_CODES,
  generateDeviceCode,
} from './coding-rules';
import {
  Plus, Trash2, Edit3, Cpu, Search, RefreshCw, Zap, MapPin, Hash, Activity,
  Columns3, X,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: '#22c55e' },
  maintenance: { label: '维护中', color: '#f59e0b' },
  stopped: { label: '已停机', color: '#ef4444' },
  unknown: { label: '未知', color: '#6b7280' },
};

export default function DeviceManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 编码级联选择
  const [codeL1, setCodeL1] = useState('');
  const [codeL2, setCodeL2] = useState('');
  const [codeL3, setCodeL3] = useState('');

  // 自定义列
  const { columns: customCols, addColumn, removeColumn } = useCustomColumns({ storageKey: 'device_manager' });
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'date' | 'select'>('text');

  const [form, setForm] = useState<Record<string, any>>({
    nodeId: '', code: '', name: '', templateCode: '', serialNumber: '',
    location: '', department: '', installDate: '', status: 'unknown',
  });

  // tRPC 查询
  const { data: treeData, refetch } = trpc.database.asset.getTree.useQuery({ level: 1 });
  const { data: templates } = trpc.database.config.listNodeTemplates.useQuery({ nodeType: 'device' });

  // Mutations
  const createNode = trpc.database.asset.createNode.useMutation({
    onSuccess: () => { toast.success('设备创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNode = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => { toast.success('设备更新成功'); refetch(); setShowDialog(false); setEditingDevice(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNode = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => { toast.success('设备已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const devices = useMemo(() => {
    let list = treeData || [];
    if (searchTerm) {
      list = list.filter((d: any) =>
        d.name?.includes(searchTerm) || d.code?.includes(searchTerm) || d.nodeId?.includes(searchTerm)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((d: any) => d.status === statusFilter);
    }
    return list;
  }, [treeData, searchTerm, statusFilter]);

  // 级联选择器选项
  const l2Options = useMemo(() => codeL1 ? LEVEL2_CODES[codeL1] || {} : {}, [codeL1]);
  const l3Options = useMemo(() => codeL2 ? LEVEL3_CODES[codeL2] || {} : {}, [codeL2]);

  // 自动计算下一个流水号
  const nextSeqNum = useMemo(() => {
    if (!codeL1 || !codeL2 || !codeL3) return 1;
    const prefix = `${codeL1}${codeL2}-${codeL3}`;
    const existing = (treeData || [])
      .filter((d: any) => d.code?.startsWith(prefix))
      .map((d: any) => {
        const numStr = d.code?.substring(prefix.length);
        return parseInt(numStr, 10) || 0;
      });
    return existing.length > 0 ? Math.max(...existing) + 1 : 1;
  }, [codeL1, codeL2, codeL3, treeData]);

  const handleAutoCode = () => {
    if (!codeL1 || !codeL2 || !codeL3) {
      toast.warning('请先选择一级、二级、三级代码');
      return;
    }
    const code = generateDeviceCode(codeL1, codeL2, codeL3, nextSeqNum);
    const nodeId = `dev-${code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
    setForm(prev => ({ ...prev, code, nodeId }));
    toast.success(`自动生成编码: ${code}`);
  };

  const openCreate = () => {
    setEditingDevice(null);
    setCodeL1(''); setCodeL2(''); setCodeL3('');
    setForm({
      nodeId: '', code: '', name: '', templateCode: '', serialNumber: '',
      location: '', department: '', installDate: '', status: 'unknown',
    });
    setShowDialog(true);
  };

  const openEdit = (device: any) => {
    setEditingDevice(device);
    setForm({
      nodeId: device.nodeId,
      code: device.code,
      name: device.name,
      templateCode: device.templateCode || '',
      serialNumber: device.serialNumber || '',
      location: device.location || '',
      department: device.department || '',
      installDate: device.installDate || '',
      status: device.status || 'unknown',
      ...(device.attributes || {}),
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    // 收集自定义列数据到 attributes
    const customData: Record<string, any> = {};
    for (const col of customCols) {
      if (form[col.key] !== undefined && form[col.key] !== '') {
        customData[col.key] = form[col.key];
      }
    }

    if (editingDevice) {
      updateNode.mutate({
        nodeId: editingDevice.nodeId,
        name: form.name || undefined,
        status: form.status || undefined,
        location: form.location || undefined,
        department: form.department || undefined,
        serialNumber: form.serialNumber || undefined,
        attributes: Object.keys(customData).length > 0 ? customData : undefined,
      });
    } else {
      if (!form.code || !form.name) {
        toast.warning('请先生成编码并填写设备名称');
        return;
      }
      createNode.mutate({
        nodeId: form.nodeId || `dev-${Date.now()}`,
        code: form.code,
        name: form.name,
        level: 1,
        nodeType: 'device',
        rootNodeId: form.nodeId || `dev-${Date.now()}`,
        templateCode: form.templateCode || undefined,
        path: `/${form.nodeId}/`,
        serialNumber: form.serialNumber || undefined,
        location: form.location || undefined,
        department: form.department || undefined,
        installDate: form.installDate || undefined,
        attributes: Object.keys(customData).length > 0 ? customData : undefined,
      });
    }
  };

  const handleAddColumn = () => {
    if (!newColLabel.trim()) {
      toast.warning('请输入列名称');
      return;
    }
    const key = `custom_${newColLabel.trim().replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    addColumn({ key, label: newColLabel.trim(), type: newColType });
    setNewColLabel('');
    setNewColType('text');
    toast.success(`已添加列: ${newColLabel.trim()}`);
  };

  // 统计
  const stats = useMemo(() => {
    const all = treeData || [];
    return {
      total: all.length,
      running: all.filter((d: any) => d.status === 'running').length,
      maintenance: all.filter((d: any) => d.status === 'maintenance').length,
      stopped: all.filter((d: any) => d.status === 'stopped').length,
    };
  }, [treeData]);

  return (
    <MainLayout title="设备管理">
      <div className="p-4 space-y-4">
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">设备管理</h1>
            <Badge variant="outline" className="text-xs">L1 设备层</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowColumnDialog(true)}>
              <Columns3 className="w-3 h-3 mr-1" /> 自定义列
            </Button>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="w-3 h-3 mr-1" /> 新增设备
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: '设备总数', value: stats.total, icon: Cpu, color: '#3b82f6' },
            { label: '运行中', value: stats.running, icon: Activity, color: '#22c55e' },
            { label: '维护中', value: stats.maintenance, icon: Zap, color: '#f59e0b' },
            { label: '已停机', value: stats.stopped, icon: Zap, color: '#ef4444' },
          ].map((s) => (
            <PageCard key={s.label} compact>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: `${s.color}15`, border: `1px solid ${s.color}30` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                  <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                </div>
              </div>
            </PageCard>
          ))}
        </div>

        {/* 筛选栏 */}
        <PageCard>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索设备名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </PageCard>

        {/* 设备表格 */}
        <PageCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">设备名称</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">模板</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">序列号</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">位置</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">部门</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">状态</th>
                  {customCols.map(col => (
                    <th key={col.key} className="text-left p-2.5 font-medium text-muted-foreground">{col.label}</th>
                  ))}
                  <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d: any) => {
                  const st = STATUS_MAP[d.status] || STATUS_MAP.unknown;
                  const attrs = d.attributes || {};
                  return (
                    <tr key={d.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 font-mono font-medium text-primary">{d.code}</td>
                      <td className="p-2.5 font-medium">{d.name}</td>
                      <td className="p-2.5 text-muted-foreground">{d.templateCode || '-'}</td>
                      <td className="p-2.5 text-muted-foreground">{d.serialNumber || '-'}</td>
                      <td className="p-2.5">
                        {d.location ? (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-muted-foreground" />{d.location}</span>
                        ) : '-'}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{d.department || '-'}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${st.color}50`, color: st.color }}>
                          {st.label}
                        </Badge>
                      </td>
                      {customCols.map(col => (
                        <td key={col.key} className="p-2.5 text-muted-foreground">{attrs[col.key] || '-'}</td>
                      ))}
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(d)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`确定删除设备 "${d.name}" 吗？`)) {
                                deleteNode.mutate({ nodeId: d.nodeId });
                              }
                            }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={7 + customCols.length + 1} className="text-center text-muted-foreground py-12">
                      {searchTerm || statusFilter !== 'all' ? '没有匹配的设备' : '暂无设备，点击"新增设备"添加'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PageCard>

        {/* 新建/编辑对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editingDevice ? '编辑设备' : '新增设备'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {/* 编码生成区 — 仅新建时 */}
              {!editingDevice && (
                <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">设备编码生成</span>
                    <span className="text-[10px] text-muted-foreground">（按《设备分类编码标准》自动生成）</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {/* 一级代码 */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">一级代码（设备大类）</label>
                      <Select value={codeL1} onValueChange={(v) => { setCodeL1(v); setCodeL2(''); setCodeL3(''); }}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择大类" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LEVEL1_CODES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{k} - {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* 二级代码 */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">二级代码（设备中类）</label>
                      <Select value={codeL2} onValueChange={(v) => { setCodeL2(v); setCodeL3(''); }} disabled={!codeL1}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择中类" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(l2Options).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{k} - {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* 三级代码 */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">三级代码（设备小类）</label>
                      <Select value={codeL3} onValueChange={setCodeL3} disabled={!codeL2}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="选择小类" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(l3Options).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{k} - {v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">生成的编码</label>
                      <Input
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        placeholder="点击"自动生成"或手动输入"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <Button
                      size="sm" variant="default" className="mt-4"
                      onClick={handleAutoCode}
                      disabled={!codeL1 || !codeL2 || !codeL3}
                    >
                      <Hash className="w-3 h-3 mr-1" /> 自动生成
                    </Button>
                  </div>
                  {codeL1 && codeL2 && codeL3 && (
                    <div className="text-[10px] text-muted-foreground bg-background/50 rounded px-2 py-1">
                      编码预览: <span className="font-mono text-primary font-medium">{generateDeviceCode(codeL1, codeL2, codeL3, nextSeqNum)}</span>
                      <span className="ml-2">（{LEVEL1_CODES[codeL1]} → {l2Options[codeL2]} → {l3Options[codeL3]} → 第{nextSeqNum}台）</span>
                    </div>
                  )}
                </div>
              )}

              {/* 编辑时显示编码（只读） */}
              {editingDevice && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">设备编码</label>
                  <Input value={form.code} disabled className="h-8 text-xs font-mono bg-muted/30" />
                </div>
              )}

              {/* 基本信息 */}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">设备名称 *</label>
                <Input placeholder="如: 4号卸船机" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">设备模板</label>
                  <Select value={form.templateCode || '_none'} onValueChange={(v) => setForm({ ...form, templateCode: v === '_none' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="选择模板" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">不使用模板</SelectItem>
                      {templates?.map((t: any) => (
                        <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">序列号</label>
                  <Input placeholder="SN-2024-XXX" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">安装位置</label>
                  <Input placeholder="如: 一车间A区" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">所属部门</label>
                  <Input placeholder="如: 生产一部" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">安装日期</label>
                  <Input type="date" value={form.installDate} onChange={(e) => setForm({ ...form, installDate: e.target.value })} className="h-8 text-xs" />
                </div>
                {editingDevice && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">运行状态</label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_MAP).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* 自定义列字段 */}
              {customCols.length > 0 && (
                <div className="border-t border-border pt-3 mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">自定义字段</div>
                  <div className="grid grid-cols-2 gap-3">
                    {customCols.map(col => (
                      <div key={col.key}>
                        <label className="text-xs text-muted-foreground mb-1 block">{col.label}</label>
                        <Input
                          type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                          placeholder={`输入${col.label}`}
                          value={form[col.key] || ''}
                          onChange={(e) => setForm({ ...form, [col.key]: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={createNode.isPending || updateNode.isPending}>
                {editingDevice ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 自定义列管理对话框 */}
        <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>自定义列管理</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">添加自定义列到设备表格中，数据存储在设备的扩展属性中。</div>
              {/* 已有自定义列 */}
              {customCols.length > 0 && (
                <div className="space-y-1.5">
                  {customCols.map(col => (
                    <div key={col.key} className="flex items-center justify-between bg-muted/30 rounded px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{col.label}</span>
                        <Badge variant="outline" className="text-[10px]">{col.type}</Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => removeColumn(col.key)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {/* 添加新列 */}
              <div className="flex items-end gap-2 border-t border-border pt-3">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">列名称</label>
                  <Input placeholder="如: 制造商" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-muted-foreground mb-1 block">类型</label>
                  <Select value={newColType} onValueChange={(v: any) => setNewColType(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">文本</SelectItem>
                      <SelectItem value="number">数字</SelectItem>
                      <SelectItem value="date">日期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddColumn}>
                  <Plus className="w-3 h-3 mr-1" /> 添加
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
