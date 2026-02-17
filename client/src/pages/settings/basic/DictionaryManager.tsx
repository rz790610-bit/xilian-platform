/**
 * 字典管理 - 基础设置
 * 管理字典分类和字典项，支持增删改查
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import { Plus, Trash2, Edit3, BookOpen, Tag, Search, RefreshCw, ChevronRight } from 'lucide-react';

export default function DictionaryManager() {
  const toast = useToast();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [catForm, setCatForm] = useState({ code: '', name: '', description: '' });
  const [itemForm, setItemForm] = useState({ code: '', label: '', value: '', color: '' });

  // tRPC 查询
  const { data: categories, refetch: refetchCats } = trpc.database.config.listDictCategories.useQuery();
  const { data: categoryDetail, refetch: refetchDetail } = trpc.database.config.getDictCategory.useQuery(
    { categoryCode: selectedCategory! },
    { enabled: !!selectedCategory }
  );

  // Mutations
  const createCat = trpc.database.config.createDictCategory.useMutation({
    onSuccess: () => { toast.success('字典分类创建成功'); refetchCats(); setShowCatDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const createItem = trpc.database.config.createDictItem.useMutation({
    onSuccess: () => { toast.success('字典项创建成功'); refetchDetail(); setShowItemDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateItem = trpc.database.config.updateDictItem.useMutation({
    onSuccess: () => { toast.success('字典项更新成功'); refetchDetail(); setShowItemDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteItem = trpc.database.config.deleteDictItem.useMutation({
    onSuccess: () => { toast.success('字典项已删除'); refetchDetail(); },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredCategories = useMemo(() => {
    if (!categories) return [];
    if (!searchTerm) return categories;
    return categories.filter((c: any) =>
      c.name.includes(searchTerm) || c.code.includes(searchTerm)
    );
  }, [categories, searchTerm]);

  const openCreateCat = () => {
    setCatForm({ code: '', name: '', description: '' });
    setShowCatDialog(true);
  };

  const openCreateItem = () => {
    setEditingItem(null);
    setItemForm({ code: '', label: '', value: '', color: '' });
    setShowItemDialog(true);
  };

  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({ code: item.code, label: item.label, value: item.value || '', color: item.color || '' });
    setShowItemDialog(true);
  };

  const handleSaveCat = () => {
    if (!catForm.code || !catForm.name) {
      toast.warning('请填写分类编码和名称');
      return;
    }
    createCat.mutate(catForm);
  };

  const handleSaveItem = () => {
    if (!selectedCategory) return;
    if (editingItem) {
      updateItem.mutate({
        categoryCode: selectedCategory,
        code: editingItem.code,
        label: itemForm.label || undefined,
        value: itemForm.value || undefined,
        color: itemForm.color || undefined,
      });
    } else {
      if (!itemForm.code || !itemForm.label) {
        toast.warning('请填写项编码和标签');
        return;
      }
      createItem.mutate({
        categoryCode: selectedCategory,
        code: itemForm.code,
        label: itemForm.label,
        value: itemForm.value || undefined,
        color: itemForm.color || undefined,
      });
    }
  };

  return (
    <MainLayout title="字典管理">
      <div className="p-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">字典管理</h1>
            <Badge variant="outline" className="text-xs">
              {categories?.length || 0} 个分类
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
          {/* 左侧：分类列表 */}
          <div className="col-span-4">
            <PageCard title="字典分类" icon={<Tag className="w-4 h-4" />}
              action={
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => refetchCats()}>
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={openCreateCat}>
                    <Plus className="w-3 h-3 mr-1" /> 新增
                  </Button>
                </div>
              }
            >
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索分类..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {filteredCategories.map((cat: any) => (
                    <div
                      key={cat.code}
                      onClick={() => setSelectedCategory(cat.code)}
                      className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors text-xs ${
                        selectedCategory === cat.code
                          ? 'bg-primary/10 border border-primary/30 text-primary'
                          : 'hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight className={`w-3 h-3 transition-transform ${selectedCategory === cat.code ? 'rotate-90 text-primary' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{cat.name}</div>
                          <div className="text-muted-foreground text-[10px]">{cat.code}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {cat.isSystem ? (
                          <Badge variant="secondary" className="text-[10px] px-1">系统</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {filteredCategories.length === 0 && (
                    <div className="text-center text-muted-foreground text-xs py-8">
                      暂无字典分类
                    </div>
                  )}
                </div>
              </div>
            </PageCard>
          </div>

          {/* 右侧：字典项列表 */}
          <div className="col-span-8">
            <PageCard
              title={selectedCategory ? `${categoryDetail?.name || selectedCategory} - 字典项` : '请选择字典分类'}
              icon={<BookOpen className="w-4 h-4" />}
              action={selectedCategory ? (
                <Button size="sm" variant="outline" onClick={openCreateItem}>
                  <Plus className="w-3 h-3 mr-1" /> 新增字典项
                </Button>
              ) : undefined}
            >
              {!selectedCategory ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  ← 请从左侧选择一个字典分类
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">编码</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">标签</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">值</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">颜色</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">状态</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryDetail?.items?.map((item: any) => (
                        <tr key={item.code} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-2 font-mono">{item.code}</td>
                          <td className="p-2">{item.label}</td>
                          <td className="p-2 text-muted-foreground">{item.value || '-'}</td>
                          <td className="p-2">
                            {item.color ? (
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: item.color }} />
                                <span className="text-muted-foreground">{item.color}</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-2">
                            <Badge variant={item.isActive ? 'default' : 'secondary'} className="text-[10px]">
                              {item.isActive ? '启用' : '禁用'}
                            </Badge>
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => openEditItem(item)}>
                                <Edit3 className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-6 px-1.5 text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm(`确定删除字典项 "${item.label}" 吗？`)) {
                                    deleteItem.mutate({ categoryCode: selectedCategory!, code: item.code });
                                  }
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!categoryDetail?.items || categoryDetail.items.length === 0) && (
                        <tr>
                          <td colSpan={6} className="text-center text-muted-foreground py-8">
                            暂无字典项，点击"新增字典项"添加
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </PageCard>
          </div>
        </div>

        {/* 新建分类对话框 */}
        <Dialog open={showCatDialog} onOpenChange={setShowCatDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建字典分类</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">分类编码 *</label>
                <Input placeholder="如: DEVICE_TYPE" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">分类名称 *</label>
                <Input placeholder="如: 设备类型" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">描述</label>
                <Textarea placeholder="分类描述..." value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} className="text-xs" rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowCatDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSaveCat} disabled={createCat.isPending}>
                {createCat.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建/编辑字典项对话框 */}
        <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? '编辑字典项' : '新建字典项'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">项编码 *</label>
                <Input
                  placeholder="如: roller_mill"
                  value={itemForm.code}
                  onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })}
                  className="h-8 text-xs"
                  disabled={!!editingItem}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">标签 *</label>
                <Input placeholder="如: 磨辊机" value={itemForm.label} onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">值</label>
                <Input placeholder="可选值" value={itemForm.value} onChange={(e) => setItemForm({ ...itemForm, value: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">颜色</label>
                <div className="flex gap-2">
                  <Input placeholder="#22c55e" value={itemForm.color} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} className="h-8 text-xs flex-1" />
                  {itemForm.color && (
                    <div className="w-8 h-8 rounded border border-border" style={{ backgroundColor: itemForm.color }} />
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowItemDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSaveItem} disabled={createItem.isPending || updateItem.isPending}>
                {editingItem ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
