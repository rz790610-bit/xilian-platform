/**
 * 零件库 - 基础设置 (L4-L5 零件层)
 * 编码生成: 调用后端 generateCode 引擎
 *   L4 组件: ruleCode: PART_L4_CODE，格式: {上级编码}-A{流水号}
 *   L5 零件: ruleCode: PART_L5_CODE，格式: {上级编码}-P{流水号}
 * 序列号由后端持久化管理，确保不重复、不跳号
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
import { useCustomColumns } from './useCustomColumns';
import { Plus, Trash2, Edit3, Wrench, Search, RefreshCw, Hash, Package, Puzzle, Columns3, X } from 'lucide-react';

export default function PartsLibrary() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'4' | '5'>('4');
  const [showDialog, setShowDialog] = useState(false);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const currentLevel = Number(activeTab);

  const { columns: customCols, addColumn, removeColumn } = useCustomColumns({ storageKey: `parts_library_L${activeTab}` });
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'date'>('text');

  const [form, setForm] = useState<Record<string, any>>({
    nodeId: '', code: '', name: '', serialNumber: '', location: '', department: '',
  });
  const [selectedParent, setSelectedParent] = useState('');

  const { data: components } = trpc.database.asset.getTree.useQuery({ level: 3 });
  const { data: l4Nodes, refetch: refetchL4 } = trpc.database.asset.getTree.useQuery({ level: 4 });
  const { data: l5Nodes, refetch: refetchL5 } = trpc.database.asset.getTree.useQuery({ level: 5 });

  const refetch = () => { if (currentLevel === 4) refetchL4(); else refetchL5(); };

  const createNode = trpc.database.asset.createNode.useMutation({
    onSuccess: () => { toast.success('创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateNode = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => { toast.success('更新成功'); refetch(); setShowDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteNode = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => { toast.success('已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 后端自动编码
  const generateCodeMut = trpc.database.config.generateCode.useMutation({
    onError: (e: any) => toast.error(`编码生成失败: ${e.message}`),
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const currentData = currentLevel === 4 ? l4Nodes : l5Nodes;
  const filteredParts = useMemo(() => {
    let list = currentData || [];
    if (searchTerm) list = list.filter((n: any) => n.name?.includes(searchTerm) || n.code?.includes(searchTerm));
    return list;
  }, [currentData, searchTerm]);

  const parentOptions = useMemo(() => {
    if (currentLevel === 4) return (components || []).map((c: any) => ({ value: c.nodeId, label: `${c.code} - ${c.name}`, code: c.code }));
    return (l4Nodes || []).map((a: any) => ({ value: a.nodeId, label: `${a.code} - ${a.name}`, code: a.code }));
  }, [currentLevel, components, l4Nodes]);

  // 编码预览
  const selectedParentCode = parentOptions.find(p => p.value === selectedParent)?.code || '';
  const previewRuleCode = currentLevel === 4 ? 'PART_L4_CODE' : 'PART_L5_CODE';
  const previewEnabled = !!selectedParentCode;
  const { data: previewData } = trpc.database.config.previewCode.useQuery(
    { ruleCode: previewRuleCode, nodeRef: selectedParentCode },
    { enabled: previewEnabled }
  );

  const handleAutoCode = async () => {
    if (!selectedParent) { toast.warning(`请选择上级${currentLevel === 4 ? '部件' : '组件'}`); return; }
    const parentCode = parentOptions.find(p => p.value === selectedParent)?.code;
    if (!parentCode) { toast.warning('所选上级无编码'); return; }

    const ruleCode = currentLevel === 4 ? 'PART_L4_CODE' : 'PART_L5_CODE';
    setIsGenerating(true);
    try {
      const result = await generateCodeMut.mutateAsync({
        ruleCode,
        nodeRef: parentCode,
      });
      const code = result.code;
      const nodeId = `${currentLevel === 4 ? 'asm' : 'part'}-${code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      setForm(prev => ({ ...prev, code, nodeId }));
      toast.success(`自动生成编码: ${code}（序列号: ${result.sequenceValue}）`);
    } catch {
      // error handled by mutation onError
    } finally {
      setIsGenerating(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null); setSelectedParent('');
    setForm({ nodeId: '', code: '', name: '', serialNumber: '', location: '', department: '' });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      nodeId: item.nodeId, code: item.code, name: item.name,
      serialNumber: item.serialNumber || '', location: item.location || '', department: item.department || '',
      ...(item.attributes || {}),
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    const customData: Record<string, any> = {};
    for (const col of customCols) {
      if (form[col.key] !== undefined && form[col.key] !== '') customData[col.key] = form[col.key];
    }
    if (editingItem) {
      updateNode.mutate({
        nodeId: editingItem.nodeId, name: form.name || undefined,
        serialNumber: form.serialNumber || undefined, location: form.location || undefined,
        department: form.department || undefined,
        attributes: Object.keys(customData).length > 0 ? customData : undefined,
      });
    } else {
      if (!form.code || !form.name) { toast.warning('请先生成编码并填写名称'); return; }
      const parentList = currentLevel === 4 ? components : l4Nodes;
      const parent = parentList?.find((p: any) => p.nodeId === selectedParent);
      createNode.mutate({
        nodeId: form.nodeId || `${currentLevel === 4 ? 'asm' : 'part'}-${Date.now()}`,
        code: form.code, name: form.name,
        level: currentLevel, nodeType: currentLevel === 4 ? 'assembly' : 'part',
        parentNodeId: selectedParent || undefined,
        rootNodeId: parent?.rootNodeId || selectedParent || form.nodeId,
        path: `${parent?.path || '/'}${form.nodeId}/`,
        serialNumber: form.serialNumber || undefined, location: form.location || undefined,
        department: form.department || undefined,
        attributes: Object.keys(customData).length > 0 ? customData : undefined,
      });
    }
  };

  const handleAddColumn = () => {
    if (!newColLabel.trim()) { toast.warning('请输入列名称'); return; }
    addColumn({ key: `custom_${newColLabel.trim().replace(/\s+/g, '_')}_${Date.now()}`, label: newColLabel.trim(), type: newColType });
    setNewColLabel(''); toast.success(`已添加列: ${newColLabel.trim()}`);
  };

  const renderTable = (data: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground">名称</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground">上级节点</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground">序列号/型号</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground">位置</th>
            <th className="text-left p-2.5 font-medium text-muted-foreground">部门</th>
            {customCols.map(col => (
              <th key={col.key} className="text-left p-2.5 font-medium text-muted-foreground">{col.label}</th>
            ))}
            <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item: any) => {
            const attrs = item.attributes || {};
            return (
              <tr key={item.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="p-2.5 font-mono font-medium text-primary">{item.code}</td>
                <td className="p-2.5 font-medium">{item.name}</td>
                <td className="p-2.5 text-muted-foreground">{item.parentNodeId || '-'}</td>
                <td className="p-2.5 text-muted-foreground">{item.serialNumber || '-'}</td>
                <td className="p-2.5 text-muted-foreground">{item.location || '-'}</td>
                <td className="p-2.5 text-muted-foreground">{item.department || '-'}</td>
                {customCols.map(col => (
                  <td key={col.key} className="p-2.5 text-muted-foreground">{attrs[col.key] || '-'}</td>
                ))}
                <td className="p-2.5 text-right">
                  <div className="flex justify-end gap-0.5">
                    <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(item)}><Edit3 className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => { if (confirm(`确定删除 "${item.name}" 吗？`)) deleteNode.mutate({ nodeId: item.nodeId }); }}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {data.length === 0 && (
            <tr><td colSpan={6 + customCols.length + 1} className="text-center text-muted-foreground py-12">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <MainLayout title="零件库">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">零件库</h1>
            <Badge variant="outline" className="text-xs">L4-L5 零件层</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowColumnDialog(true)}>
              <Columns3 className="w-3 h-3 mr-1" /> 自定义列
            </Button>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="w-3 h-3 mr-1" /> 新增
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as '4' | '5'); setSearchTerm(''); }}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="4" className="text-xs"><Package className="w-3 h-3 mr-1" /> L4 组件 ({l4Nodes?.length || 0})</TabsTrigger>
              <TabsTrigger value="5" className="text-xs"><Puzzle className="w-3 h-3 mr-1" /> L5 零件 ({l5Nodes?.length || 0})</TabsTrigger>
            </TabsList>
          </div>

          <PageCard className="mt-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="搜索名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <Button size="sm" variant="ghost" onClick={refetch}><RefreshCw className="w-3 h-3" /></Button>
            </div>
          </PageCard>

          <TabsContent value="4" className="mt-0"><PageCard noPadding className="mt-3">{renderTable(filteredParts)}</PageCard></TabsContent>
          <TabsContent value="5" className="mt-0"><PageCard noPadding className="mt-3">{renderTable(filteredParts)}</PageCard></TabsContent>
        </Tabs>

        {/* 新建/编辑对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>{editingItem ? '编辑' : `新增 ${currentLevel === 4 ? 'L4 组件' : 'L5 零件'}`}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {!editingItem && (
                <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold">{currentLevel === 4 ? '组件' : '零件'}编码生成</span>
                    <span className="text-[10px] text-muted-foreground">（上级编码 + {currentLevel === 4 ? '-A' : '-P'} + 流水号 → 后端引擎）</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">上级{currentLevel === 4 ? '部件' : '组件'} *</label>
                    <Select value={selectedParent} onValueChange={setSelectedParent}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`选择${currentLevel === 4 ? '部件' : '组件'}`} /></SelectTrigger>
                      <SelectContent>
                        {parentOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">生成的编码</label>
                      <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="点击自动生成按钮" className="h-8 text-xs font-mono" />
                    </div>
                    <Button size="sm" variant="default" className="mt-4" onClick={handleAutoCode}
                      disabled={!selectedParent || isGenerating}>
                      <Hash className="w-3 h-3 mr-1" /> {isGenerating ? '生成中...' : '自动生成'}
                    </Button>
                  </div>
                  {previewEnabled && (
                    <div className="text-[10px] text-muted-foreground bg-background/50 rounded px-2 py-1">
                      编码预览: <span className="font-mono text-primary font-medium">{previewData || '...'}</span>
                      <span className="ml-2">（{selectedParentCode} + {currentLevel === 4 ? '-A' : '-P'} + 流水号）</span>
                      <span className="ml-1 text-[9px] text-muted-foreground/60">← 后端引擎预览</span>
                    </div>
                  )}
                </div>
              )}
              {editingItem && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">编码</label>
                  <Input value={form.code} disabled className="h-8 text-xs font-mono bg-muted/30" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">名称 *</label>
                <Input placeholder={`如: ${currentLevel === 4 ? '齿轮组件' : '轴承'}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">序列号/型号</label>
                  <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} className="h-8 text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">位置</label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">部门</label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="h-8 text-xs" />
              </div>
              {customCols.length > 0 && (
                <div className="border-t border-border pt-3 mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">自定义字段</div>
                  <div className="grid grid-cols-2 gap-3">
                    {customCols.map(col => (
                      <div key={col.key}>
                        <label className="text-xs text-muted-foreground mb-1 block">{col.label}</label>
                        <Input type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'} value={form[col.key] || ''} onChange={(e) => setForm({ ...form, [col.key]: e.target.value })} className="h-8 text-xs" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={createNode.isPending || updateNode.isPending}>{editingItem ? '保存' : '创建'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 自定义列管理 */}
        <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>自定义列管理</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {customCols.length > 0 && (
                <div className="space-y-1.5">
                  {customCols.map(col => (
                    <div key={col.key} className="flex items-center justify-between bg-muted/30 rounded px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{col.label}</span>
                        <Badge variant="outline" className="text-[10px]">{col.type}</Badge>
                      </div>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => removeColumn(col.key)}><X className="w-3 h-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 border-t border-border pt-3">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground mb-1 block">列名称</label>
                  <Input placeholder="如: 制造商" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-muted-foreground mb-1 block">类型</label>
                  <Select value={newColType} onValueChange={(v: any) => setNewColType(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">文本</SelectItem>
                      <SelectItem value="number">数字</SelectItem>
                      <SelectItem value="date">日期</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" onClick={handleAddColumn}><Plus className="w-3 h-3 mr-1" /> 添加</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
