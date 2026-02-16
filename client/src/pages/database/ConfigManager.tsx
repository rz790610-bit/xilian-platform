import { useState } from 'react';
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
import { RefreshCw, Plus, Trash2, Settings, Code, Layers, Tag, BookOpen } from 'lucide-react';

export default function ConfigManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<'codeRule' | 'nodeTemplate' | 'mpTemplate' | 'labelDim' | 'dictCat'>('nodeTemplate');

  // tRPC 查询
  const { data: codeRules, refetch: refetchCR } = trpc.database.config.listCodeRules.useQuery();
  const { data: nodeTemplates, refetch: refetchNT } = trpc.database.config.listNodeTemplates.useQuery();
  const { data: mpTemplates, refetch: refetchMP } = trpc.database.config.listMpTemplates.useQuery();
  const { data: labelDims, refetch: refetchLD } = trpc.database.config.listLabelDimensions.useQuery();
  const { data: dictCats, refetch: refetchDC } = trpc.database.config.listDictCategories.useQuery();

  // 表单状态
  const [form, setForm] = useState<any>({});

  // Mutations
  const createCR = trpc.database.config.createCodeRule.useMutation({
    onSuccess: () => { toast.success('编码规则创建成功'); refetchCR(); setShowCreateDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const createNT = trpc.database.config.createNodeTemplate.useMutation({
    onSuccess: () => { toast.success('节点模板创建成功'); refetchNT(); setShowCreateDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const createMPT = trpc.database.config.createMpTemplate.useMutation({
    onSuccess: () => { toast.success('测点模板创建成功'); refetchMP(); setShowCreateDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const createLD = trpc.database.config.createLabelDimension.useMutation({
    onSuccess: () => { toast.success('标注维度创建成功'); refetchLD(); setShowCreateDialog(false); },
    onError: (e) => toast.error(e.message),
  });
  const createDC = trpc.database.config.createDictCategory.useMutation({
    onSuccess: () => { toast.success('字典分类创建成功'); refetchDC(); setShowCreateDialog(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteCR = trpc.database.config.deleteCodeRule.useMutation({
    onSuccess: () => { toast.success('已删除'); refetchCR(); },
  });
  const deleteNT = trpc.database.config.deleteNodeTemplate.useMutation({
    onSuccess: () => { toast.success('已删除'); refetchNT(); },
  });
  const deleteMPT = trpc.database.config.deleteMpTemplate.useMutation({
    onSuccess: () => { toast.success('已删除'); refetchMP(); },
  });

  const openCreate = (type: typeof createType) => {
    setCreateType(type);
    setForm({});
    setShowCreateDialog(true);
  };

  const handleCreate = () => {
    switch (createType) {
      case 'codeRule':
        createCR.mutate({ ruleCode: form.code, name: form.name, segments: form.segments ? JSON.parse(form.segments) : [], description: form.description });
        break;
      case 'nodeTemplate':
        createNT.mutate({ code: form.code, name: form.name, level: Number(form.level) || 1, nodeType: form.nodeType || 'device', description: form.description });
        break;
      case 'mpTemplate':
        createMPT.mutate({ code: form.code, name: form.name, measurementType: form.measurementType || 'vibration', physicalQuantity: form.physicalQuantity, defaultUnit: form.defaultUnit, description: form.description });
        break;
      case 'labelDim':
        createLD.mutate({ code: form.code, name: form.name, dimType: form.dimType || 'enum', description: form.description });
        break;
      case 'dictCat':
        createDC.mutate({ code: form.code, name: form.name, description: form.description });
        break;
    }
  };

  const createTitle = { codeRule: '编码规则', nodeTemplate: '节点模板', mpTemplate: '测点模板', labelDim: '标注维度', dictCat: '字典分类' };

  return (
    <MainLayout title="基础配置">
      <div className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">基础配置管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">编码规则 · 节点模板 · 测点模板 · 标注维度 · 数据字典</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="templates" className="text-xs">节点模板</TabsTrigger>
            <TabsTrigger value="mpTemplates" className="text-xs">测点模板</TabsTrigger>
            <TabsTrigger value="codeRules" className="text-xs">编码规则</TabsTrigger>
            <TabsTrigger value="labels" className="text-xs">标注维度</TabsTrigger>
            <TabsTrigger value="dict" className="text-xs">数据字典</TabsTrigger>
          </TabsList>

          {/* 节点模板 */}
          <TabsContent value="templates">
            <PageCard title="节点类型模板" icon={<Layers className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => openCreate('nodeTemplate')}><Plus className="w-3 h-3 mr-1" />新建</Button>}>
              <div className="space-y-2">
                {nodeTemplates && nodeTemplates.length > 0 ? nodeTemplates.map((t: any) => (
                  <div key={t.code} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-1.5">
                        <span>{t.icon || '📦'}</span>{t.name}
                        {t.isSystem === 1 && <Badge variant="info" className="text-[9px]">系统</Badge>}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {t.code} · L{t.level} · {t.nodeType} · {t.description || '无描述'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={t.isActive === 1 ? 'success' : 'default'}>{t.isActive === 1 ? '启用' : '禁用'}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => deleteNT.mutate({ code: t.code })}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无节点模板</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 测点模板 */}
          <TabsContent value="mpTemplates">
            <PageCard title="测点类型模板" icon={<Settings className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => openCreate('mpTemplate')}><Plus className="w-3 h-3 mr-1" />新建</Button>}>
              <div className="space-y-2">
                {mpTemplates && mpTemplates.length > 0 ? mpTemplates.map((t: any) => (
                  <div key={t.code} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div className="flex-1">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {t.code} · {t.measurementType} · {t.physicalQuantity || '-'} · {t.defaultUnit || '-'}
                        {t.defaultSampleRate ? ` · ${t.defaultSampleRate}Hz` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span>告警: {t.defaultWarning ?? '-'}</span>
                      <span>危急: {t.defaultCritical ?? '-'}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => deleteMPT.mutate({ code: t.code })}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无测点模板</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 编码规则 */}
          <TabsContent value="codeRules">
            <PageCard title="编码生成规则" icon={<Code className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => openCreate('codeRule')}><Plus className="w-3 h-3 mr-1" />新建</Button>}>
              <div className="space-y-2">
                {codeRules && codeRules.length > 0 ? codeRules.map((r: any) => (
                  <div key={r.ruleCode} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[10px] text-muted-foreground">{r.ruleCode} · {r.description || '无描述'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={r.isActive === 1 ? 'success' : 'default'}>{r.isActive === 1 ? '启用' : '禁用'}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={() => deleteCR.mutate({ ruleCode: r.ruleCode })}>
                        <Trash2 className="w-3 h-3 text-danger" />
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无编码规则</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 标注维度 */}
          <TabsContent value="labels">
            <PageCard title="标注维度定义" icon={<Tag className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => openCreate('labelDim')}><Plus className="w-3 h-3 mr-1" />新建</Button>}>
              <div className="space-y-2">
                {labelDims && labelDims.length > 0 ? labelDims.map((d: any) => (
                  <div key={d.code} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div>
                      <div className="font-medium">{d.name}</div>
                      <div className="text-[10px] text-muted-foreground">{d.code} · {d.dimType} · {d.description || '无描述'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {d.isRequired === 1 && <Badge variant="warning">必填</Badge>}
                      <Badge variant={d.isActive === 1 ? 'success' : 'default'}>{d.isActive === 1 ? '启用' : '禁用'}</Badge>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无标注维度</div>}
              </div>
            </PageCard>
          </TabsContent>

          {/* 数据字典 */}
          <TabsContent value="dict">
            <PageCard title="数据字典" icon={<BookOpen className="w-3.5 h-3.5" />}
              action={<Button size="sm" className="text-xs h-6" onClick={() => openCreate('dictCat')}><Plus className="w-3 h-3 mr-1" />新建分类</Button>}>
              <div className="space-y-2">
                {dictCats && dictCats.length > 0 ? dictCats.map((c: any) => (
                  <div key={c.code} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.code} · {c.description || '无描述'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {c.isSystem === 1 && <Badge variant="info">系统</Badge>}
                      <Badge variant={c.isActive === 1 ? 'success' : 'default'}>{c.isActive === 1 ? '启用' : '禁用'}</Badge>
                    </div>
                  </div>
                )) : <div className="text-xs text-muted-foreground text-center py-6">暂无字典分类</div>}
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>

        {/* 创建对话框 */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">新建{createTitle[createType]}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">编码 *</label>
                <Input className="h-8 text-xs" placeholder="唯一标识编码"
                  value={form.code || ''} onChange={e => setForm((p: any) => ({ ...p, code: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">名称 *</label>
                <Input className="h-8 text-xs" placeholder="显示名称"
                  value={form.name || ''} onChange={e => setForm((p: any) => ({ ...p, name: e.target.value }))} />
              </div>
              {createType === 'nodeTemplate' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">层级</label>
                    <Input className="h-8 text-xs" type="number" placeholder="1-10"
                      value={form.level || ''} onChange={e => setForm((p: any) => ({ ...p, level: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">节点类型</label>
                    <Input className="h-8 text-xs" placeholder="如 device"
                      value={form.nodeType || ''} onChange={e => setForm((p: any) => ({ ...p, nodeType: e.target.value }))} />
                  </div>
                </div>
              )}
              {createType === 'mpTemplate' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">测量类型</label>
                    <Input className="h-8 text-xs" placeholder="如 vibration"
                      value={form.measurementType || ''} onChange={e => setForm((p: any) => ({ ...p, measurementType: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">物理量</label>
                    <Input className="h-8 text-xs" placeholder="如 acceleration"
                      value={form.physicalQuantity || ''} onChange={e => setForm((p: any) => ({ ...p, physicalQuantity: e.target.value }))} />
                  </div>
                </div>
              )}
              {createType === 'labelDim' && (
                <div>
                  <label className="text-xs text-muted-foreground">维度类型</label>
                  <Input className="h-8 text-xs" placeholder="如 enum / tree / range"
                    value={form.dimType || ''} onChange={e => setForm((p: any) => ({ ...p, dimType: e.target.value }))} />
                </div>
              )}
              {createType === 'codeRule' && (
                <div>
                  <label className="text-xs text-muted-foreground">段定义 (JSON)</label>
                  <Textarea className="text-xs" rows={3} placeholder='[{"type":"prefix","value":"DEV"}]'
                    value={form.segments || ''} onChange={e => setForm((p: any) => ({ ...p, segments: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <Textarea className="text-xs" rows={2} placeholder="可选描述"
                  value={form.description || ''} onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateDialog(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={handleCreate}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
