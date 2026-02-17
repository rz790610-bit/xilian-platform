/**
 * 组织机构管理 - 基础设置
 * 基于字典分类 ORGANIZATION 管理组织机构层级
 * 支持部门、车间、班组等组织结构的增删改查
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
import { Plus, Trash2, Edit3, Building2, Users, Search, RefreshCw, ChevronDown, ChevronRight, FolderTree } from 'lucide-react';

// 组织类型定义
const ORG_TYPES = [
  { code: 'company', label: '公司', icon: '🏢', color: '#3b82f6' },
  { code: 'department', label: '部门', icon: '🏛️', color: '#8b5cf6' },
  { code: 'workshop', label: '车间', icon: '🏭', color: '#f59e0b' },
  { code: 'team', label: '班组', icon: '👥', color: '#22c55e' },
  { code: 'station', label: '工位', icon: '📍', color: '#ef4444' },
];

interface OrgNode {
  code: string;
  label: string;
  value?: string;
  color?: string;
  parentCode?: string;
  metadata?: any;
  isActive?: number;
  children?: OrgNode[];
}

export default function OrganizationManager() {
  const toast = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['ROOT']));
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({
    code: '', label: '', value: '', color: '', parentCode: '',
    orgType: 'department',
  });

  // 查询组织机构字典分类
  const { data: orgCategory, refetch } = trpc.database.config.getDictCategory.useQuery(
    { categoryCode: 'ORGANIZATION' },
    {
      retry: false,
      // 如果分类不存在，不报错
    }
  );

  // 创建组织机构分类（如果不存在）
  const createOrgCat = trpc.database.config.createDictCategory.useMutation({
    onSuccess: () => { toast.success('组织机构分类已初始化'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createItem = trpc.database.config.createDictItem.useMutation({
    onSuccess: () => { toast.success('组织机构创建成功'); refetch(); setShowDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateItem = trpc.database.config.updateDictItem.useMutation({
    onSuccess: () => { toast.success('组织机构更新成功'); refetch(); setShowDialog(false); setEditingItem(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteItem = trpc.database.config.deleteDictItem.useMutation({
    onSuccess: () => { toast.success('组织机构已删除'); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 构建树形结构
  const orgTree = useMemo(() => {
    const items: OrgNode[] = (orgCategory?.items || []) as any[];
    const map = new Map<string, OrgNode & { children: OrgNode[] }>();
    const roots: (OrgNode & { children: OrgNode[] })[] = [];

    items.forEach(item => {
      map.set(item.code, { ...item, children: [] });
    });

    items.forEach(item => {
      const node = map.get(item.code)!;
      if (item.parentCode && map.has(item.parentCode)) {
        map.get(item.parentCode)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [orgCategory]);

  // 扁平化列表（用于搜索）
  const flatItems = useMemo(() => {
    return orgCategory?.items || [];
  }, [orgCategory]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return flatItems;
    return flatItems.filter((item: any) =>
      item.label.includes(searchTerm) || item.code.includes(searchTerm)
    );
  }, [flatItems, searchTerm]);

  const toggleExpand = (code: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const openCreate = (parentCode?: string) => {
    setEditingItem(null);
    setForm({ code: '', label: '', value: '', color: '', parentCode: parentCode || '', orgType: 'department' });
    setShowDialog(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const meta = item.metadata || {};
    setForm({
      code: item.code,
      label: item.label,
      value: item.value || '',
      color: item.color || '',
      parentCode: item.parentCode || '',
      orgType: meta.orgType || 'department',
    });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (editingItem) {
      updateItem.mutate({
        categoryCode: 'ORGANIZATION',
        code: editingItem.code,
        label: form.label || undefined,
        value: form.value || undefined,
        color: form.color || ORG_TYPES.find(t => t.code === form.orgType)?.color || undefined,
      });
    } else {
      if (!form.code || !form.label) {
        toast.warning('请填写编码和名称');
        return;
      }
      createItem.mutate({
        categoryCode: 'ORGANIZATION',
        code: form.code,
        label: form.label,
        value: form.orgType,
        color: form.color || ORG_TYPES.find(t => t.code === form.orgType)?.color || '#3b82f6',
        parentCode: form.parentCode || undefined,
      });
    }
  };

  const initOrganization = () => {
    createOrgCat.mutate({
      code: 'ORGANIZATION',
      name: '组织机构',
      description: '企业组织机构层级管理（公司→部门→车间→班组→工位）',
    });
  };

  // 渲染树节点
  const renderTreeNode = (node: OrgNode & { children?: OrgNode[] }, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.code);
    const isSelected = selectedNode === node.code;
    const orgType = ORG_TYPES.find(t => t.code === node.value) || ORG_TYPES[1];

    return (
      <div key={node.code}>
        <div
          className={`flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors text-xs ${
            isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setSelectedNode(node.code)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(node.code); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="text-sm">{orgType.icon}</span>
          <span className="font-medium truncate">{node.label}</span>
          <span className="text-muted-foreground text-[10px] ml-auto">{node.code}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child as any, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // 如果组织机构分类不存在
  if (!orgCategory) {
    return (
      <MainLayout title="组织机构">
        <div className="p-4">
          <PageCard>
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Building2 className="w-12 h-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">组织机构管理</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                组织机构数据存储在字典分类 <code className="bg-muted px-1 rounded">ORGANIZATION</code> 中。
                <br />点击下方按钮初始化组织机构分类。
              </p>
              <Button onClick={initOrganization} disabled={createOrgCat.isPending}>
                <Building2 className="w-4 h-4 mr-2" />
                {createOrgCat.isPending ? '初始化中...' : '初始化组织机构'}
              </Button>
            </div>
          </PageCard>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="组织机构">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">组织机构管理</h1>
            <Badge variant="outline" className="text-xs">
              {flatItems.length} 个节点
            </Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => openCreate()}>
            <Plus className="w-3 h-3 mr-1" /> 新增机构
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
          {/* 左侧：树形结构 */}
          <div className="col-span-5">
            <PageCard title="组织树" icon={<FolderTree className="w-4 h-4" />}
              action={
                <Button size="sm" variant="ghost" onClick={() => refetch()}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              }
            >
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索组织..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <div className="space-y-0.5 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {searchTerm ? (
                    filteredItems.map((item: any) => (
                      <div
                        key={item.code}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-xs ${
                          selectedNode === item.code ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
                        }`}
                        onClick={() => setSelectedNode(item.code)}
                      >
                        <span>{ORG_TYPES.find(t => t.code === item.value)?.icon || '🏛️'}</span>
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground text-[10px] ml-auto">{item.code}</span>
                      </div>
                    ))
                  ) : (
                    orgTree.map(node => renderTreeNode(node))
                  )}
                  {orgTree.length === 0 && !searchTerm && (
                    <div className="text-center text-muted-foreground text-xs py-8">
                      暂无组织机构，点击"新增机构"添加
                    </div>
                  )}
                </div>
              </div>
            </PageCard>
          </div>

          {/* 右侧：详情 */}
          <div className="col-span-7">
            <PageCard title="机构详情" icon={<Users className="w-4 h-4" />}>
              {selectedNode ? (() => {
                const item = flatItems.find((i: any) => i.code === selectedNode);
                if (!item) return <div className="text-center text-muted-foreground py-8">未找到节点</div>;
                const orgType = ORG_TYPES.find(t => t.code === item.value) || ORG_TYPES[1];
                const children = flatItems.filter((i: any) => i.parentCode === item.code);
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                          style={{ backgroundColor: `${orgType.color}20`, border: `1px solid ${orgType.color}40` }}>
                          {orgType.icon}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.code} · {orgType.label}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openCreate(item.code)}>
                          <Plus className="w-3 h-3 mr-1" /> 添加下级
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                          <Edit3 className="w-3 h-3 mr-1" /> 编辑
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive"
                          onClick={() => {
                            if (confirm(`确定删除 "${item.label}" 吗？`)) {
                              deleteItem.mutate({ categoryCode: 'ORGANIZATION', code: item.code });
                              setSelectedNode(null);
                            }
                          }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-muted/30 rounded-md p-2.5">
                        <div className="text-muted-foreground mb-1">机构类型</div>
                        <div className="font-medium">{orgType.label}</div>
                      </div>
                      <div className="bg-muted/30 rounded-md p-2.5">
                        <div className="text-muted-foreground mb-1">上级机构</div>
                        <div className="font-medium">{item.parentCode ? flatItems.find((i: any) => i.code === item.parentCode)?.label || item.parentCode : '（顶级）'}</div>
                      </div>
                      <div className="bg-muted/30 rounded-md p-2.5">
                        <div className="text-muted-foreground mb-1">状态</div>
                        <Badge variant={item.isActive ? 'default' : 'secondary'} className="text-[10px]">
                          {item.isActive ? '启用' : '禁用'}
                        </Badge>
                      </div>
                      <div className="bg-muted/30 rounded-md p-2.5">
                        <div className="text-muted-foreground mb-1">下级数量</div>
                        <div className="font-medium">{children.length} 个</div>
                      </div>
                    </div>

                    {children.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2">下级机构</h4>
                        <div className="space-y-1">
                          {children.map((child: any) => {
                            const ct = ORG_TYPES.find(t => t.code === child.value) || ORG_TYPES[1];
                            return (
                              <div key={child.code}
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/30 cursor-pointer text-xs"
                                onClick={() => setSelectedNode(child.code)}>
                                <span>{ct.icon}</span>
                                <span className="font-medium">{child.label}</span>
                                <Badge variant="outline" className="text-[10px] ml-auto">{ct.label}</Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  ← 请从左侧选择一个组织节点
                </div>
              )}
            </PageCard>
          </div>
        </div>

        {/* 新建/编辑对话框 */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingItem ? '编辑组织机构' : '新建组织机构'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">机构编码 *</label>
                <Input
                  placeholder="如: DEPT_PROD_01"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="h-8 text-xs"
                  disabled={!!editingItem}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">机构名称 *</label>
                <Input placeholder="如: 生产一部" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">机构类型</label>
                <Select value={form.orgType} onValueChange={(v) => setForm({ ...form, orgType: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_TYPES.map(t => (
                      <SelectItem key={t.code} value={t.code}>
                        <span className="flex items-center gap-1.5">{t.icon} {t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">上级机构</label>
                <Select value={form.parentCode || '_none'} onValueChange={(v) => setForm({ ...form, parentCode: v === '_none' ? '' : v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="无（顶级机构）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">无（顶级机构）</SelectItem>
                    {flatItems.filter((i: any) => i.code !== editingItem?.code).map((i: any) => (
                      <SelectItem key={i.code} value={i.code}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={createItem.isPending || updateItem.isPending}>
                {editingItem ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
