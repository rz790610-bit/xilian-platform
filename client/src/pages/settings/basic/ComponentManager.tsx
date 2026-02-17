/**
 * 部件管理 - 基础设置 (L3 组件层)
 * 管理机构下的组件节点（电机、减速器、联轴器等）
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
import { Plus, Trash2, Edit3, Box, Search, RefreshCw, Hash, ChevronRight, Layers } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: '#22c55e' },
  maintenance: { label: '维护中', color: '#f59e0b' },
  stopped: { label: '已停机', color: '#ef4444' },
  unknown: { label: '未知', color: '#6b7280' },
};

export default function ComponentManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParent, setSelectedParent] = useState<string>('all');
  const [form, setForm] = useState({
    nodeId: '', code: '', name: '', parentNodeId: '', templateCode: '',
    serialNumber: '', category: '',
  });

  // 查询L1设备和L2机构
  const { data: devices } = trpc.database.asset.getTree.useQuery({ level: 1 });
  const { data: mechanisms } = trpc.database.asset.getTree.useQuery({ level: 2 });
  // 查询L3组件
  const { data: allComponents, refetch } = trpc.database.asset.getTree.useQuery({ level: 3 });
  // 组件模板
  const { data: templates } = trpc.database.config.listNodeTemplates.useQuery({ nodeType: 'component' });
  // 编码规则
  const { data: codeRules } = trpc.database.config.listCodeRules.useQuery();

  const compRule = useMemo(() => {
    return codeRules?.find((r: any) => r.ruleCode === 'RULE_COMPONENT' || r.name?.includes('组件'));
  }, [codeRules]);

  // Mutations
  const createNode = trpc.database.asset.createNode.useMutation({
    onSuccess: () => { toast.success('部件创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNode = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => { toast.success('部件更新成功'); refetch(); setShowDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNode = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => { toast.success('部件已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const generateCode = trpc.database.config.generateCode.useMutation({
    onError: (e: any) => toast.error(`编码生成失败: ${e.message}`),
  });

  const components = useMemo(() => {
    let list = allComponents || [];
    if (selectedParent !== 'all') {
      list = list.filter((n: any) => n.parentNodeId === selectedParent);
    }
    if (searchTerm) {
      list = list.filter((n: any) =>
        n.name?.includes(searchTerm) || n.code?.includes(searchTerm)
      );
    }
    return list;
  }, [allComponents, selectedParent, searchTerm]);

  // 构建父级选项（设备→机构）
  const parentOptions = useMemo(() => {
    const opts: { value: string; label: string; group: string }[] = [];
    (mechanisms || []).forEach((m: any) => {
      const dev = devices?.find((d: any) => d.nodeId === m.parentNodeId);
      opts.push({
        value: m.nodeId,
        label: `${m.name} (${m.code})`,
        group: dev?.name || '未知设备',
      });
    });
    return opts;
  }, [mechanisms, devices]);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ nodeId: '', code: '', name: '', parentNodeId: selectedParent !== 'all' ? selectedParent : '', templateCode: '', serialNumber: '', category: '' });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      nodeId: item.nodeId, code: item.code, name: item.name,
      parentNodeId: item.parentNodeId || '', templateCode: item.templateCode || '',
      serialNumber: item.serialNumber || '', category: '',
    });
    setShowDialog(true);
  };

  const handleAutoCode = async () => {
    if (!compRule) {
      toast.warning('未找到组件编码规则 (RULE_COMPONENT)');
      return;
    }
    const parentMech = mechanisms?.find((m: any) => m.nodeId === form.parentNodeId);
    try {
      const result = await generateCode.mutateAsync({
        ruleCode: compRule.ruleCode,
        category: form.category || undefined,
        nodeRef: parentMech?.code || undefined,
      });
      setForm(prev => ({
        ...prev,
        code: result.code,
        nodeId: `${form.parentNodeId}-${String(result.sequenceValue).padStart(2, '0')}`,
      }));
      toast.success(`自动生成编码: ${result.code}`);
    } catch (e) { /* handled */ }
  };

  const handleSave = () => {
    if (editingItem) {
      updateNode.mutate({
        nodeId: editingItem.nodeId,
        name: form.name || undefined,
        serialNumber: form.serialNumber || undefined,
      });
    } else {
      if (!form.nodeId || !form.code || !form.name || !form.parentNodeId) {
        toast.warning('请填写所有必填项');
        return;
      }
      const parentMech = mechanisms?.find((m: any) => m.nodeId === form.parentNodeId);
      const rootDevice = devices?.find((d: any) => d.nodeId === parentMech?.rootNodeId);
      createNode.mutate({
        nodeId: form.nodeId,
        code: form.code,
        name: form.name,
        level: 3,
        nodeType: 'component',
        parentNodeId: form.parentNodeId,
        rootNodeId: rootDevice?.nodeId || parentMech?.rootNodeId || form.parentNodeId,
        templateCode: form.templateCode || undefined,
        path: `${parentMech?.path || '/'}${form.nodeId}/`,
        serialNumber: form.serialNumber || undefined,
      });
    }
  };

  return (
    <MainLayout title="部件管理">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">部件管理</h1>
            <Badge variant="outline" className="text-xs">L3 组件层</Badge>
            <Badge variant="secondary" className="text-xs">{components.length} 条</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="w-3 h-3 mr-1" /> 新增部件
          </Button>
        </div>

        {/* 筛选 */}
        <PageCard>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索部件名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={selectedParent} onValueChange={setSelectedParent}>
              <SelectTrigger className="w-56 h-8 text-xs">
                <SelectValue placeholder="按机构筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部机构</SelectItem>
                {parentOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.group} → {o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </PageCard>

        {/* 表格 */}
        <PageCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">节点ID</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">部件名称</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">所属机构</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">模板</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">序列号</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">状态</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c: any) => {
                  const parentMech = mechanisms?.find((m: any) => m.nodeId === c.parentNodeId);
                  const st = STATUS_MAP[c.status] || STATUS_MAP.unknown;
                  return (
                    <tr key={c.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 font-mono text-muted-foreground">{c.nodeId}</td>
                      <td className="p-2.5 font-mono font-medium">{c.code}</td>
                      <td className="p-2.5 font-medium">{c.name}</td>
                      <td className="p-2.5">
                        {parentMech ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Layers className="w-3 h-3" />{parentMech.name}
                          </span>
                        ) : <span className="text-muted-foreground">{c.parentNodeId || '-'}</span>}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{c.templateCode || '-'}</td>
                      <td className="p-2.5 text-muted-foreground">{c.serialNumber || '-'}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${st.color}50`, color: st.color }}>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(c)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`确定删除部件 "${c.name}" 吗？`)) {
                                deleteNode.mutate({ nodeId: c.nodeId });
                              }
                            }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {components.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-12">
                      暂无部件数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PageCard>

        {/* 对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? '编辑部件' : '新增部件'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!editingItem && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">所属机构 *</label>
                    <Select value={form.parentNodeId || '_none'} onValueChange={(v) => setForm({ ...form, parentNodeId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择机构" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">请选择</SelectItem>
                        {parentOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.group} → {o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">部件类别（用于编码生成）</label>
                    <div className="flex gap-2">
                      <Input placeholder="如: 电机" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-xs flex-1" />
                      <Button size="sm" variant="outline" onClick={handleAutoCode} disabled={generateCode.isPending || !compRule}>
                        <Hash className="w-3 h-3 mr-1" /> 自动编码
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">节点ID *</label>
                      <Input placeholder="如: nd-001-01-04" value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">编码 *</label>
                      <Input placeholder="如: Mgj-XC001-MD-XX" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">部件名称 *</label>
                <Input placeholder="如: 主电机" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {!editingItem && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">部件模板</label>
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
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">序列号</label>
                  <Input placeholder="如: MOT-2024-XXX" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={createNode.isPending || updateNode.isPending}>
                {editingItem ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
