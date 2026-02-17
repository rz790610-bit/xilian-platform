/**
 * 零件库 - 基础设置 (L4-L5 零件层)
 * 管理组件下的零件节点（轴承、齿轮、密封件等）
 * 支持 L4(assembly) 和 L5(part) 两级零件管理
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { Plus, Trash2, Edit3, Wrench, Search, RefreshCw, Hash, Package, Puzzle } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  running: { label: '正常', color: '#22c55e' },
  maintenance: { label: '维护', color: '#f59e0b' },
  stopped: { label: '停用', color: '#ef4444' },
  unknown: { label: '未知', color: '#6b7280' },
};

const LEVEL_MAP: Record<number, { label: string; type: string; icon: typeof Package }> = {
  4: { label: 'L4 组件', type: 'assembly', icon: Package },
  5: { label: 'L5 零件', type: 'part', icon: Puzzle },
};

export default function PartsLibrary() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'4' | '5'>('4');
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    nodeId: '', code: '', name: '', parentNodeId: '', templateCode: '',
    serialNumber: '', category: '',
  });

  const currentLevel = Number(activeTab);

  // 查询各层数据
  const { data: components } = trpc.database.asset.getTree.useQuery({ level: 3 });
  const { data: l4Nodes, refetch: refetchL4 } = trpc.database.asset.getTree.useQuery({ level: 4 });
  const { data: l5Nodes, refetch: refetchL5 } = trpc.database.asset.getTree.useQuery({ level: 5 });
  const { data: codeRules } = trpc.database.config.listCodeRules.useQuery();

  const partRule = useMemo(() => {
    return codeRules?.find((r: any) => r.ruleCode === 'RULE_PART' || r.name?.includes('零件'));
  }, [codeRules]);

  const refetch = () => {
    if (currentLevel === 4) refetchL4();
    else refetchL5();
  };

  // Mutations
  const createNode = trpc.database.asset.createNode.useMutation({
    onSuccess: () => { toast.success('零件创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNode = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => { toast.success('零件更新成功'); refetch(); setShowDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNode = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => { toast.success('零件已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const generateCode = trpc.database.config.generateCode.useMutation({
    onError: (e: any) => toast.error(`编码生成失败: ${e.message}`),
  });

  const currentData = currentLevel === 4 ? l4Nodes : l5Nodes;

  const filteredParts = useMemo(() => {
    let list = currentData || [];
    if (searchTerm) {
      list = list.filter((n: any) =>
        n.name?.includes(searchTerm) || n.code?.includes(searchTerm)
      );
    }
    return list;
  }, [currentData, searchTerm]);

  // 父级选项
  const parentOptions = useMemo(() => {
    if (currentLevel === 4) {
      return (components || []).map((c: any) => ({
        value: c.nodeId,
        label: `${c.name} (${c.code})`,
      }));
    } else {
      return (l4Nodes || []).map((a: any) => ({
        value: a.nodeId,
        label: `${a.name} (${a.code})`,
      }));
    }
  }, [currentLevel, components, l4Nodes]);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ nodeId: '', code: '', name: '', parentNodeId: '', templateCode: '', serialNumber: '', category: '' });
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
    if (!partRule) {
      toast.warning('未找到零件编码规则 (RULE_PART)');
      return;
    }
    try {
      const result = await generateCode.mutateAsync({
        ruleCode: partRule.ruleCode,
        category: form.category || undefined,
        nodeRef: form.parentNodeId || undefined,
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
      // 查找根设备
      const findRoot = (nodeId: string): string => {
        const l4 = l4Nodes?.find((n: any) => n.nodeId === nodeId);
        if (l4) return l4.rootNodeId;
        const comp = components?.find((n: any) => n.nodeId === nodeId);
        if (comp) return comp.rootNodeId;
        return nodeId;
      };
      const parentNode = currentLevel === 4
        ? components?.find((c: any) => c.nodeId === form.parentNodeId)
        : l4Nodes?.find((a: any) => a.nodeId === form.parentNodeId);

      createNode.mutate({
        nodeId: form.nodeId,
        code: form.code,
        name: form.name,
        level: currentLevel,
        nodeType: LEVEL_MAP[currentLevel].type,
        parentNodeId: form.parentNodeId,
        rootNodeId: parentNode?.rootNodeId || findRoot(form.parentNodeId),
        templateCode: form.templateCode || undefined,
        path: `${parentNode?.path || '/'}${form.nodeId}/`,
        serialNumber: form.serialNumber || undefined,
      });
    }
  };

  return (
    <MainLayout title="零件库">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">零件库</h1>
            <Badge variant="outline" className="text-xs">L4-L5 零件层</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="w-3 h-3 mr-1" /> 新增零件
          </Button>
        </div>

        {/* 层级切换 */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as '4' | '5'); setSearchTerm(''); }}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="4" className="text-xs">
                <Package className="w-3 h-3 mr-1" /> L4 组件 ({l4Nodes?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="5" className="text-xs">
                <Puzzle className="w-3 h-3 mr-1" /> L5 零件 ({l5Nodes?.length || 0})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 筛选 */}
          <PageCard className="mt-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="搜索零件名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <Button size="sm" variant="ghost" onClick={refetch}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </PageCard>

          <TabsContent value="4" className="mt-0">
            <PageCard noPadding className="mt-3">
              {renderTable(filteredParts, 4)}
            </PageCard>
          </TabsContent>
          <TabsContent value="5" className="mt-0">
            <PageCard noPadding className="mt-3">
              {renderTable(filteredParts, 5)}
            </PageCard>
          </TabsContent>
        </Tabs>

        {/* 对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingItem ? '编辑零件' : `新增 ${LEVEL_MAP[currentLevel].label}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!editingItem && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      上级节点 * ({currentLevel === 4 ? 'L3 组件' : 'L4 组件'})
                    </label>
                    <Select value={form.parentNodeId || '_none'} onValueChange={(v) => setForm({ ...form, parentNodeId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="选择上级" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">请选择</SelectItem>
                        {parentOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">零件类别（用于编码生成）</label>
                    <div className="flex gap-2">
                      <Input placeholder="如: 轴承" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="h-8 text-xs flex-1" />
                      <Button size="sm" variant="outline" onClick={handleAutoCode} disabled={generateCode.isPending || !partRule}>
                        <Hash className="w-3 h-3 mr-1" /> 自动编码
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">节点ID *</label>
                      <Input placeholder="如: nd-001-01-01-01" value={form.nodeId} onChange={(e) => setForm({ ...form, nodeId: e.target.value })} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">编码 *</label>
                      <Input placeholder="自动生成或手动输入" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">零件名称 *</label>
                <Input placeholder="如: 驱动端轴承" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">序列号/型号</label>
                <Input placeholder="如: SKF-6205-2RS" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="h-8 text-xs" />
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

  function renderTable(data: any[], level: number) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left p-2.5 font-medium text-muted-foreground">节点ID</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">名称</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">上级节点</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">序列号/型号</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">状态</th>
              <th className="text-left p-2.5 font-medium text-muted-foreground">路径</th>
              <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item: any) => {
              const st = STATUS_MAP[item.status] || STATUS_MAP.unknown;
              return (
                <tr key={item.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-2.5 font-mono text-muted-foreground">{item.nodeId}</td>
                  <td className="p-2.5 font-mono font-medium">{item.code}</td>
                  <td className="p-2.5 font-medium">{item.name}</td>
                  <td className="p-2.5 text-muted-foreground">{item.parentNodeId || '-'}</td>
                  <td className="p-2.5 text-muted-foreground">{item.serialNumber || '-'}</td>
                  <td className="p-2.5">
                    <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${st.color}50`, color: st.color }}>
                      {st.label}
                    </Badge>
                  </td>
                  <td className="p-2.5 font-mono text-[10px] text-muted-foreground max-w-[200px] truncate">{item.path}</td>
                  <td className="p-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(item)}>
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`确定删除 "${item.name}" 吗？`)) {
                            deleteNode.mutate({ nodeId: item.nodeId });
                          }
                        }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-12">
                  暂无 {LEVEL_MAP[level].label} 数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
}
