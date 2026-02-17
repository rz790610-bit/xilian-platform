/**
 * 机构管理 - 基础设置 (L2 机构层)
 * 附属设备编码: 设备主体编码 + 五级代码(从字典DEVICE_L5读取) + 六级(2位) + 七级(2位) + 流水号(2位)
 * 示例: Mgj-XC001j010101
 * 所有枚举从字典管理读取，不再硬编码
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
import { useCustomColumns } from './useCustomColumns';
import { useDictItems } from './useDictionary';
import { generateSubDeviceCode } from './coding-rules';
import { Plus, Trash2, Edit3, Search, RefreshCw, Hash, Columns3, X, Settings2, AlertTriangle } from 'lucide-react';

export default function MechanismManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [parentFilter, setParentFilter] = useState<string>('all');

  // 编码选择
  const [selectedDevice, setSelectedDevice] = useState('');
  const [codeL5, setCodeL5] = useState('');
  const [codeL6, setCodeL6] = useState('');
  const [codeL7, setCodeL7] = useState('');

  const { columns: customCols, addColumn, removeColumn } = useCustomColumns({ storageKey: 'mechanism_manager' });
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<'text' | 'number' | 'date'>('text');

  const [form, setForm] = useState<Record<string, any>>({
    nodeId: '', code: '', name: '', serialNumber: '', location: '', department: '',
  });

  // === 从字典读取五级代码（不再硬编码） ===
  const { items: l5Items, map: l5Map, isLoading: l5Loading } = useDictItems('DEVICE_L5');

  const { data: parentDevices } = trpc.database.asset.getTree.useQuery({ level: 1 });
  const { data: treeData, refetch } = trpc.database.asset.getTree.useQuery({ level: 2 });

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

  const items = useMemo(() => {
    let list = treeData || [];
    if (searchTerm) list = list.filter((d: any) => d.name?.includes(searchTerm) || d.code?.includes(searchTerm));
    if (parentFilter !== 'all') list = list.filter((d: any) => d.parentNodeId === parentFilter);
    return list;
  }, [treeData, searchTerm, parentFilter]);

  const nextSeqNum = useMemo(() => {
    if (!selectedDevice || !codeL5 || !codeL6 || !codeL7) return 1;
    const devCode = parentDevices?.find((d: any) => d.nodeId === selectedDevice)?.code || '';
    const prefix = `${devCode}${codeL5}${codeL6}${codeL7}`;
    const existing = (treeData || [])
      .filter((d: any) => d.code?.startsWith(prefix))
      .map((d: any) => parseInt(d.code?.substring(prefix.length), 10) || 0);
    return existing.length > 0 ? Math.max(...existing) + 1 : 1;
  }, [selectedDevice, codeL5, codeL6, codeL7, treeData, parentDevices]);

  const handleAutoCode = () => {
    if (!selectedDevice || !codeL5 || !codeL6 || !codeL7) {
      toast.warning('请选择所属设备、五级代码、六级代码和七级代码');
      return;
    }
    const devCode = parentDevices?.find((d: any) => d.nodeId === selectedDevice)?.code || '';
    const code = generateSubDeviceCode(devCode, codeL5, codeL6, codeL7, nextSeqNum);
    const nodeId = `mech-${code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
    setForm(prev => ({ ...prev, code, nodeId }));
    toast.success(`自动生成编码: ${code}`);
  };

  const openCreate = () => {
    setEditingItem(null);
    setSelectedDevice(''); setCodeL5(''); setCodeL6(''); setCodeL7('');
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
        location: form.location || undefined, department: form.department || undefined,
        serialNumber: form.serialNumber || undefined,
        attributes: Object.keys(customData).length > 0 ? customData : undefined,
      });
    } else {
      if (!form.code || !form.name) { toast.warning('请先生成编码并填写名称'); return; }
      createNode.mutate({
        nodeId: form.nodeId || `mech-${Date.now()}`, code: form.code, name: form.name,
        level: 2, nodeType: 'mechanism', parentNodeId: selectedDevice || undefined,
        rootNodeId: parentDevices?.find((d: any) => d.nodeId === selectedDevice)?.rootNodeId || selectedDevice || form.nodeId,
        path: `/${selectedDevice}/${form.nodeId}/`,
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

  const dictMissing = !l5Loading && l5Items.length === 0;

  return (
    <MainLayout title="机构管理">
      <div className="p-4 space-y-4">
        {/* 字典未配置提示 */}
        {dictMissing && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800 dark:text-amber-200">
              <span className="font-semibold">编码字典未配置。</span>请先在字典管理中创建分类：
              <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded mx-0.5">DEVICE_L5</code>（五级代码，如 j=主要组成机构, s=附属设施等）
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">机构管理</h1>
            <Badge variant="outline" className="text-xs">L2 机构层</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowColumnDialog(true)}>
              <Columns3 className="w-3 h-3 mr-1" /> 自定义列
            </Button>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="w-3 h-3 mr-1" /> 新增机构
            </Button>
          </div>
        </div>

        <PageCard>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索机构名称、编码..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={parentFilter} onValueChange={setParentFilter}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="按设备筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部设备</SelectItem>
                {parentDevices?.map((d: any) => (
                  <SelectItem key={d.nodeId} value={d.nodeId}>{d.code} - {d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw className="w-3 h-3" /></Button>
          </div>
        </PageCard>

        <PageCard noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-2.5 font-medium text-muted-foreground">编码</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">机构名称</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">所属设备</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">序列号</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">位置</th>
                  <th className="text-left p-2.5 font-medium text-muted-foreground">部门</th>
                  {customCols.map(col => (
                    <th key={col.key} className="text-left p-2.5 font-medium text-muted-foreground">{col.label}</th>
                  ))}
                  <th className="text-right p-2.5 font-medium text-muted-foreground">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d: any) => {
                  const parent = parentDevices?.find((p: any) => p.nodeId === d.parentNodeId);
                  const attrs = d.attributes || {};
                  return (
                    <tr key={d.nodeId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-2.5 font-mono font-medium text-primary">{d.code}</td>
                      <td className="p-2.5 font-medium">{d.name}</td>
                      <td className="p-2.5 text-muted-foreground">{parent ? `${parent.code} ${parent.name}` : '-'}</td>
                      <td className="p-2.5 text-muted-foreground">{d.serialNumber || '-'}</td>
                      <td className="p-2.5 text-muted-foreground">{d.location || '-'}</td>
                      <td className="p-2.5 text-muted-foreground">{d.department || '-'}</td>
                      {customCols.map(col => (
                        <td key={col.key} className="p-2.5 text-muted-foreground">{attrs[col.key] || '-'}</td>
                      ))}
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEdit(d)}><Edit3 className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => { if (confirm(`确定删除 "${d.name}" 吗？`)) deleteNode.mutate({ nodeId: d.nodeId }); }}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={6 + customCols.length + 1} className="text-center text-muted-foreground py-12">暂无数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </PageCard>

        {/* 新建/编辑对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader><DialogTitle>{editingItem ? '编辑机构' : '新增机构'}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {!editingItem && (
                <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Hash className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold">机构编码生成</span>
                    <span className="text-[10px] text-muted-foreground">（设备编码 + 五级 + 六级 + 七级 + 流水号）</span>
                  </div>
                  {l5Items.length === 0 && !l5Loading ? (
                    <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
                      请先在字典管理中创建 <code>DEVICE_L5</code> 分类及字典项（如 j=主要组成机构, s=附属设施等）
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">所属设备 *</label>
                          <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择设备" /></SelectTrigger>
                            <SelectContent>
                              {parentDevices?.map((d: any) => (
                                <SelectItem key={d.nodeId} value={d.nodeId}>{d.code} - {d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">五级代码（分类）</label>
                          <Select value={codeL5} onValueChange={setCodeL5}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择分类" /></SelectTrigger>
                            <SelectContent>
                              {l5Items.map((item: any) => (
                                <SelectItem key={item.code} value={item.code}>{item.code} - {item.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">六级代码（大类，2位数字）</label>
                          <Input placeholder="如: 01" value={codeL6} onChange={(e) => setCodeL6(e.target.value.replace(/\D/g, '').slice(0, 2))} className="h-8 text-xs font-mono" maxLength={2} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-1 block">七级代码（小类，2位数字）</label>
                          <Input placeholder="如: 01" value={codeL7} onChange={(e) => setCodeL7(e.target.value.replace(/\D/g, '').slice(0, 2))} className="h-8 text-xs font-mono" maxLength={2} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground mb-1 block">生成的编码</label>
                          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="点击自动生成按钮" className="h-8 text-xs font-mono" />
                        </div>
                        <Button size="sm" variant="default" className="mt-4" onClick={handleAutoCode}
                          disabled={!selectedDevice || !codeL5 || !codeL6 || !codeL7}>
                          <Hash className="w-3 h-3 mr-1" /> 自动生成
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {editingItem && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">机构编码</label>
                  <Input value={form.code} disabled className="h-8 text-xs font-mono bg-muted/30" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">机构名称 *</label>
                <Input placeholder="如: 起升机构" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">序列号</label>
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
