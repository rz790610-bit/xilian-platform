/**
 * 机构管理 - 基础设置 (L2 机构层)
 * 管理设备下的机构节点（主传动、磨辊机构等）
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
import { Plus, Trash2, Edit3, Cog, Search, RefreshCw, Hash, ChevronRight } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: '运行中', color: '#22c55e' },
  maintenance: { label: '维护中', color: '#f59e0b' },
  stopped: { label: '已停机', color: '#ef4444' },
  unknown: { label: '未知', color: '#6b7280' },
};

export default function MechanismManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [form, setForm] = useState({
    nodeId: '', code: '', name: '', parentNodeId: '', templateCode: '', category: '',
  });

  // 查询所有L1设备
  const { data: devices } = trpc.database.asset.getTree.useQuery({ level: 1 });
  // 查询所有L2机构
  const { data: allNodes, refetch } = trpc.database.asset.getTree.useQuery({ level: 2 });
  // 查询机构模板
  const { data: templates } = trpc.database.config.listNodeTemplates.useQuery({ nodeType: 'mechanism' });
  // 编码规则
  const { data: codeRules } = trpc.database.config.listCodeRules.useQuery();

  const mechRule = useMemo(() => {
    return codeRules?.find((r: any) => r.ruleCode === 'RULE_MECHANISM' || r.name?.includes('机构'));
  }, [codeRules]);

  // Mutations
  const createNode = trpc.database.asset.createNode.useMutation({
    onSuccess: () => { toast.success('机构创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNode = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => { toast.success('机构更新成功'); refetch(); setShowDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNode = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => { toast.success('机构已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const generateCode = trpc.database.config.generateCode.useMutation({
    onError: (e: any) => toast.error(`编码生成失败: ${e.message}`),
  });

  const mechanisms = useMemo(() => {
    let list = allNodes || [];
    if (selectedDevice !== 'all') {
      list = list.filter((n: any) => n.parentNodeId === selectedDevice);
    }
    if (searchTerm) {
      list = list.filter((n: any) =>
        n.name?.includes(searchTerm) || n.code?.includes(searchTerm)
      );
    }
    return list;
  }, [allNodes, selectedDevice, searchTerm]);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ nodeId: '', code: '', name: '', parentNodeId: selectedDevice !== 'all' ? selectedDevice : '', templateCode: '', category: '' });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      nodeId: item.nodeId, code: item.code, name: item.name,
      parentNodeId: item.parentNodeId || '', templateCode: item.templateCode || '', category: '',
    });
    setShowDialog(true);
  };

  const handleAutoCode = async () => {
    if (!mechRule) {
      toast.warning('未找到机构编码规则 (RULE_MECHANISM)');
      return;
    }
    const parentDevice = devices?.find((d: any) => d.nodeId === form.parentNodeId);
    try {
      const result = await generateCode.mutateAsync({
        ruleCode: mechRule.ruleCode,
        category: form.category || undefined,
        deviceRef: parentDevice?.code || undefined,
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
      });
    } else {
      if (!form.nodeId || !form.code || !form.name || !form.parentNodeId) {
        toast.warning('请填写所有必填项');
        return;
      }
      const parentDevice = devices?.find((d: any) => d.nodeId === form.parentNodeId);
      createNode.mutate({
        nodeId: form.nodeId,
        code: form.code,
        name: form.name,
        level: 2,
        nodeType: 'mechanism',
        parentNodeId: form.parentNodeId,
        rootNodeId: parentDevice?.rootNodeId || form.parentNodeId,
        templateCode: form.templateCode || undefined,
        path: `/${form.parentNodeId}/${form.nodeId}/`,
      });
    }
  };

  return (
    <MainLayout title="机构管理">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cog className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">机构管理</h1>
            <Badge variant="outline" className="text-xs">L2 机构层</Badge>
            <Badge variant="secondary" className="text-xs">{mechanisms.length} 条</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="w-3 h-3 mr-1" /> 新增机构
          </Button>
        </div>

        {/* 筛选 */}
        <PageCard>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索机构名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue placeholder="按设备筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部设备</SelectItem>
                {devices?.map((d: any) => (
                  <SelectItem key={d.nodeId} value={d.nodeId}>{d.name} ({d.code})</SelectItem>
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
                  <th className="text-left p-2.5 font-medium text-muted-foreground">机构名称</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">所属设备</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">模板</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">状态</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">路径</th>
                  <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {mechanisms.map((m: any) => {
                  const parentDev = devices?.find((d: any) => d.nodeId === m.parentNodeId);
                  const st = STATUS_MAP[m.status] || STATUS_MAP.unknown;
                  return (
                    <tr key={m.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 font-mono text-muted-foreground">{m.nodeId}</td>
                      <td className="p-2.5 font-mono font-medium">{m.code}</td>
                      <td className="p-2.5 font-medium">{m.name}</td>
                      <td className="p-2.5">
                        {parentDev ? (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <ChevronRight className="w-3 h-3" />{parentDev.name}
                          </span>
                        ) : <span className="text-muted-foreground">{m.parentNodeId || '-'}</span>}
                      </td>
                      <td className="p-2.5 text-muted-foreground">{m.templateCode || '-'}</td>
                      <td className="p-2.5">
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${st.color}50`, color: st.color }}>
                          {st.label}
                        </Badge>
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-muted-foreground">{m.path}</td>
                      <td className="p-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(m)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`确定删除机构 "${m.name}" 吗？`)) {
                                deleteNode.mutate({ nodeId: m.nodeId });
                              }
                            }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {mechanisms.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-12">
                      暂无机构数据
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
              <DialogTitle>{editingItem ? '编辑机构' : '新增机构'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!editingItem && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">所属设备 *</label>
                    <Select value={form.parentNodeId || '_none'} onValueChange={(v) => setForm({ ...form, parentNodeId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择设备" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">请选择</SelectItem>
                        {devices?.map((d: any) => (
                          <SelectItem key={d.nodeId} value={d.nodeId}>{d.name} ({d.code})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">机构类别（用于编码生成）</label>
                    <div className="flex gap-2">
                      <Input placeholder="如: 主传动" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-xs flex-1" />
                      <Button size="sm" variant="outline" onClick={handleAutoCode} disabled={generateCode.isPending || !mechRule}>
                        <Hash className="w-3 h-3 mr-1" /> 自动编码
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">节点ID *</label>
                      <Input placeholder="如: nd-001-04" value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">编码 *</label>
                      <Input placeholder="如: Mgj-XC001-XX" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">机构名称 *</label>
                <Input placeholder="如: 主传动机构" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              {!editingItem && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">机构模板</label>
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
