/**
 * 设备管理 - 基础设置 (L1 设备层)
 * 管理设备资产节点，支持自动编码生成、增删改查
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { Plus, Trash2, Edit3, Cpu, Search, RefreshCw, Zap, MapPin, Calendar, Hash, Activity } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: '#22c55e' },
  maintenance: { label: '维护中', color: '#f59e0b' },
  stopped: { label: '已停机', color: '#ef4444' },
  unknown: { label: '未知', color: '#6b7280' },
};

export default function DeviceManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [form, setForm] = useState({
    nodeId: '', code: '', name: '', templateCode: '', serialNumber: '',
    location: '', department: '', installDate: '', status: 'unknown',
    category: '',
  });

  // tRPC 查询
  const { data: treeData, refetch } = trpc.database.asset.getTree.useQuery({ level: 1 });
  const { data: templates } = trpc.database.config.listNodeTemplates.useQuery({ nodeType: 'device' });
  const { data: codeRules } = trpc.database.config.listCodeRules.useQuery();

  // 找到设备编码规则
  const deviceRule = useMemo(() => {
    return codeRules?.find((r: any) => r.ruleCode === 'RULE_DEVICE' || r.name?.includes('设备'));
  }, [codeRules]);

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
  const generateCode = trpc.database.config.generateCode.useMutation({
    onError: (e: any) => toast.error(`编码生成失败: ${e.message}`),
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

  const openCreate = () => {
    setEditingDevice(null);
    setForm({
      nodeId: '', code: '', name: '', templateCode: '', serialNumber: '',
      location: '', department: '', installDate: '', status: 'unknown', category: '磨辊机',
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
      category: '',
    });
    setShowDialog(true);
  };

  const handleAutoCode = async () => {
    if (!deviceRule) {
      toast.warning('未找到设备编码规则 (RULE_DEVICE)');
      return;
    }
    try {
      const result = await generateCode.mutateAsync({
        ruleCode: deviceRule.ruleCode,
        category: form.category || undefined,
      });
      setForm(prev => ({
        ...prev,
        code: result.code,
        nodeId: `nd-${String(result.sequenceValue).padStart(3, '0')}`,
      }));
      toast.success(`自动生成编码: ${result.code}`);
    } catch (e) {
      // error handled by mutation
    }
  };

  const handleSave = () => {
    if (editingDevice) {
      updateNode.mutate({
        nodeId: editingDevice.nodeId,
        name: form.name || undefined,
        status: form.status || undefined,
        location: form.location || undefined,
        department: form.department || undefined,
        serialNumber: form.serialNumber || undefined,
      });
    } else {
      if (!form.nodeId || !form.code || !form.name) {
        toast.warning('请填写节点ID、编码和名称');
        return;
      }
      createNode.mutate({
        nodeId: form.nodeId,
        code: form.code,
        name: form.name,
        level: 1,
        nodeType: 'device',
        rootNodeId: form.nodeId,
        templateCode: form.templateCode || undefined,
        path: `/${form.nodeId}/`,
        serialNumber: form.serialNumber || undefined,
        location: form.location || undefined,
        department: form.department || undefined,
        installDate: form.installDate || undefined,
      });
    }
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
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="w-3 h-3 mr-1" /> 新增设备
          </Button>
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
                  <th className="text-left p-2.5 font-medium text-muted-foreground">节点ID</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">设备名称</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">模板</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">序列号</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">位置</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">部门</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">状态</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d: any) => {
                  const st = STATUS_MAP[d.status] || STATUS_MAP.unknown;
                  return (
                    <tr key={d.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 font-mono text-muted-foreground">{d.nodeId}</td>
                      <td className="p-2.5 font-mono font-medium">{d.code}</td>
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
                      <td className="p-2.5 text-right">
                        <div className="flex justify-end gap-1">
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
                    <td colSpan={9} className="text-center text-muted-foreground py-12">
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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingDevice ? '编辑设备' : '新增设备'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {!editingDevice && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">设备类别（用于编码生成）</label>
                    <div className="flex gap-2">
                      <Input placeholder="如: 磨辊机" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-xs flex-1" />
                      <Button size="sm" variant="outline" onClick={handleAutoCode} disabled={generateCode.isPending || !deviceRule}>
                        <Hash className="w-3 h-3 mr-1" />
                        {generateCode.isPending ? '生成中...' : '自动编码'}
                      </Button>
                    </div>
                    {!deviceRule && <p className="text-[10px] text-yellow-500 mt-1">未找到 RULE_DEVICE 编码规则</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">节点ID *</label>
                      <Input placeholder="如: nd-004" value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">设备编码 *</label>
                      <Input placeholder="如: Mgj-XC004" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">设备名称 *</label>
                <Input placeholder="如: 4号磨辊机" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
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
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={createNode.isPending || updateNode.isPending}>
                {editingDevice ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
