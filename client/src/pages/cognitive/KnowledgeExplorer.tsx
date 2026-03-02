/**
 * ============================================================================
 * 知识探索器 — KnowledgeExplorer (紧凑风格)
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================

interface KGNode { id: string; label: string; type: 'equipment' | 'component' | 'failure' | 'symptom' | 'action' | 'condition'; properties: Record<string, string> }
interface KGEdge { source: string; target: string; relation: string; weight: number }
interface Crystal { id: string; type: 'pattern' | 'rule' | 'threshold' | 'model'; name: string; description: string; confidence: number; sourceCount: number; appliedCount: number; status: 'draft' | 'reviewed' | 'applied' | 'deprecated'; createdAt: string; negativeFeedbackRate?: number; reviewComment?: string; contentHash?: string; sourceType?: string; createdBy?: string }
interface CrystalApplication { id: number; crystalId: number; appliedIn: string; contextSummary: string; outcome: 'positive' | 'negative' | 'neutral'; appliedAt: string }
interface CrystalMigration { id: number; crystalId: number; fromProfile: string; toProfile: string; adaptations: string; status: string; migratedAt: string }
interface Feature { id: string; name: string; domain: string; version: string; inputDimensions: string[]; outputType: string; driftStatus: 'stable' | 'drifting' | 'critical'; usageCount: number }
interface ModelEntry { id: string; name: string; version: string; type: string; stage: 'development' | 'staging' | 'production' | 'archived'; accuracy: number; lastTrainedAt: string; servingCount: number }

// ============================================================================
// 创建知识结晶对话框
// ============================================================================

function CreateCrystalDialog({ open, onOpenChange, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; type: Crystal['type']; description: string; confidence: number }) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Crystal['type']>('pattern');
  const [description, setDescription] = useState('');
  const [confidence, setConfidence] = useState(0.8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">创建知识结晶</DialogTitle>
          <DialogDescription className="text-[10px]">从诊断经验中提炼可复用的知识结晶</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error('请输入结晶名称'); return; } if (!description.trim()) { toast.error('请输入描述'); return; } onSubmit({ name, type, description, confidence }); setName(''); setDescription(''); setConfidence(0.8); }} className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">结晶名称 *</Label><Input className="h-7 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="如：轴承温度异常模式" /></div>
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">类型 *</Label>
              <Select value={type} onValueChange={v => setType(v as Crystal['type'])}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pattern">模式</SelectItem><SelectItem value="rule">规则</SelectItem><SelectItem value="threshold">阈值</SelectItem><SelectItem value="model">模型</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">描述 *</Label><Textarea className="text-xs min-h-[48px]" value={description} onChange={e => setDescription(e.target.value)} placeholder="详细描述..." rows={2} /></div>
          <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">置信度: {Math.round(confidence * 100)}%</Label><Slider value={[confidence]} onValueChange={v => setConfidence(v[0])} min={0} max={1} step={0.01} /></div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '创建结晶'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 创建特征对话框
// ============================================================================

function CreateFeatureDialog({ open, onOpenChange, onSubmit, isSubmitting }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; domain: string; inputDimensions: string[]; outputType: string; expression: string }) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState(''); const [domain, setDomain] = useState('vibration'); const [outputType, setOutputType] = useState('float');
  const [expression, setExpression] = useState(''); const [dims, setDims] = useState<string[]>([]); const [dimInput, setDimInput] = useState('');
  const addDim = () => { if (dimInput.trim() && !dims.includes(dimInput.trim())) { setDims(prev => [...prev, dimInput.trim()]); setDimInput(''); } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">注册特征</DialogTitle>
          <DialogDescription className="text-[10px]">定义新的特征工程计算规则</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast.error('请输入特征名称'); return; } if (dims.length === 0) { toast.error('请至少添加一个输入维度'); return; } onSubmit({ name, domain, inputDimensions: dims, outputType, expression }); setName(''); setDims([]); setExpression(''); }} className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">特征名称 *</Label><Input className="h-7 text-xs" value={name} onChange={e => setName(e.target.value)} placeholder="如：vibration_rms_1h" /></div>
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">领域</Label>
              <Select value={domain} onValueChange={setDomain}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="vibration">振动</SelectItem><SelectItem value="temperature">温度</SelectItem><SelectItem value="stress">应力</SelectItem><SelectItem value="composite">综合</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">输入维度 *</Label>
            <div className="flex gap-1.5"><Input className="h-7 text-xs" value={dimInput} onChange={e => setDimInput(e.target.value)} placeholder="如：raw_vibration_x" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDim(); } }} /><Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addDim}>添加</Button></div>
            {dims.length > 0 && <div className="flex flex-wrap gap-1 mt-0.5">{dims.map(d => <Badge key={d} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => setDims(prev => prev.filter(x => x !== d))}>{d} ×</Badge>)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">输出类型</Label>
              <Select value={outputType} onValueChange={setOutputType}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="float">浮点数</SelectItem><SelectItem value="integer">整数</SelectItem><SelectItem value="boolean">布尔值</SelectItem><SelectItem value="category">分类</SelectItem><SelectItem value="vector">向量</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5"><Label className="text-[10px] text-muted-foreground">计算表达式</Label><Input className="h-7 text-xs" value={expression} onChange={e => setExpression(e.target.value)} placeholder="如：rms(input, window=3600)" /></div>
          </div>
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isSubmitting}>{isSubmitting ? '注册中...' : '注册特征'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 结晶详情对话框
// ============================================================================

function CrystalDetailDialog({ open, onOpenChange, crystal, onApply, onDeprecate, isApplying }: {
  open: boolean; onOpenChange: (open: boolean) => void; crystal: Crystal | null;
  onApply: (id: string) => void; onDeprecate: (id: string) => void; isApplying: boolean;
}) {
  if (!crystal) return null;
  const statusLabels: Record<string, string> = { draft: '草稿', reviewed: '已审核', applied: '已应用', deprecated: '已废弃' };
  const typeLabels: Record<string, string> = { pattern: '模式', rule: '规则', threshold: '阈值', model: '模型' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-3 gap-1.5">
        <DialogHeader className="gap-0.5 pb-0">
          <DialogTitle className="text-sm">{crystal.name}</DialogTitle>
          <DialogDescription className="text-[10px]">知识结晶详情</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <Badge variant="outline" className="text-[10px]">{typeLabels[crystal.type]}</Badge>
            <Badge className="text-[10px]" variant={crystal.status === 'applied' ? 'default' : crystal.status === 'deprecated' ? 'destructive' : 'secondary'}>{statusLabels[crystal.status]}</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground">{crystal.description}</p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div><span className="text-[10px] text-muted-foreground">置信度</span><div className="flex items-center gap-1 mt-0.5"><Progress value={crystal.confidence * 100} className="h-1.5 flex-1" /><span className="font-mono text-[10px]">{Math.round(crystal.confidence * 100)}%</span></div></div>
            <div><span className="text-[10px] text-muted-foreground">数据源</span><div className="font-mono text-xs mt-0.5">{crystal.sourceCount}</div></div>
            <div><span className="text-[10px] text-muted-foreground">应用次数</span><div className="font-mono text-xs mt-0.5">{crystal.appliedCount}</div></div>
            <div><span className="text-[10px] text-muted-foreground">创建时间</span><div className="text-[10px] mt-0.5">{new Date(crystal.createdAt).toLocaleString()}</div></div>
          </div>
        </div>
        <DialogFooter className="pt-1 gap-1.5">
          {crystal.status === 'applied' && <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => onDeprecate(crystal.id)}>废弃</Button>}
          {(crystal.status === 'reviewed' || crystal.status === 'draft') && <Button size="sm" className="h-7 text-xs" onClick={() => onApply(crystal.id)} disabled={isApplying}>{isApplying ? '应用中...' : '应用结晶'}</Button>}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function KnowledgeExplorer() {
  const [activeTab, setActiveTab] = useState('crystals');
  const [createCrystalOpen, setCreateCrystalOpen] = useState(false);
  const [createFeatureOpen, setCreateFeatureOpen] = useState(false);
  const [selectedCrystal, setSelectedCrystal] = useState<Crystal | null>(null);
  const [graphDepth, setGraphDepth] = useState(3);
  const [crystalStatusFilter, setCrystalStatusFilter] = useState<string>('all');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Crystal | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');

  const graphQuery = trpc.evoKnowledge.getKnowledgeGraph.useQuery({ depth: graphDepth }, { enabled: activeTab === 'graph', retry: 2 });
  const crystalsQuery = trpc.evoKnowledge.listCrystals.useQuery(
    crystalStatusFilter !== 'all' ? { status: crystalStatusFilter as any } : undefined,
    { retry: 2 }
  );
  const reviewCrystalMutation = trpc.evoKnowledge.crystal.review.useMutation({
    onSuccess: () => { crystalsQuery.refetch(); setReviewDialogOpen(false); setReviewTarget(null); toast.success('审核完成'); },
    onError: (e: any) => toast.error(`审核失败: ${e.message}`),
  });
  const crystalEffectivenessQuery = trpc.evoKnowledge.crystal.getEffectiveness.useQuery(
    { crystalId: selectedCrystal?.id ? Number(selectedCrystal.id) : 0 },
    { enabled: !!selectedCrystal, retry: 1 }
  );
  const featuresQuery = trpc.evoKnowledge.listFeatures.useQuery(undefined, { retry: 2 });
  const modelsQuery = trpc.evoKnowledge.listModels.useQuery(undefined, { retry: 2 });

  const applyCrystalMutation = trpc.evoKnowledge.applyCrystal.useMutation({
    onSuccess: () => { crystalsQuery.refetch(); setSelectedCrystal(null); toast.success('结晶已应用'); },
    onError: (e) => toast.error(`应用失败: ${e.message}`),
  });

  const createCrystalMutation = trpc.evoKnowledge.crystal.create.useMutation({
    onSuccess: () => { crystalsQuery.refetch(); setCreateCrystalOpen(false); toast.success('结晶已创建（草稿状态）'); },
    onError: (e: any) => toast.error(`创建失败: ${e.message}`),
  });

  const registerFeatureMutation = trpc.evoKnowledge.registerFeature.useMutation({
    onSuccess: () => { featuresQuery.refetch(); setCreateFeatureOpen(false); toast.success('特征已注册'); },
    onError: (e: any) => toast.error(`注册失败: ${e.message}`),
  });

  const deprecateCrystalMutation = trpc.evoKnowledge.crystal.deprecate.useMutation({
    onSuccess: () => { crystalsQuery.refetch(); setSelectedCrystal(null); toast.success('结晶已标记为废弃'); },
    onError: (e: any) => toast.error(`废弃失败: ${e.message}`),
  });

  const graphData = graphQuery.data as { nodes: KGNode[]; edges: KGEdge[] } | undefined;
  const nodes: KGNode[] = graphData?.nodes ?? []; const edges: KGEdge[] = graphData?.edges ?? [];
  const crystals: Crystal[] = (crystalsQuery.data as Crystal[]) ?? [];
  const features: Feature[] = (featuresQuery.data as Feature[]) ?? [];
  const models: ModelEntry[] = (modelsQuery.data as ModelEntry[]) ?? [];

  const nodeTypeColors: Record<string, string> = { equipment: 'bg-blue-500', component: 'bg-green-500', failure: 'bg-red-500', symptom: 'bg-yellow-500', action: 'bg-purple-500', condition: 'bg-orange-500' };
  const nodeTypeLabels: Record<string, string> = { equipment: '设备', component: '部件', failure: '故障', symptom: '症状', action: '动作', condition: '工况' };
  const statusLabels: Record<string, string> = { draft: '草稿', reviewed: '已审核', applied: '已应用', deprecated: '已废弃' };
  const typeLabels: Record<string, string> = { pattern: '模式', rule: '规则', threshold: '阈值', model: '模型' };
  const stageLabels: Record<string, string> = { development: '开发中', staging: '预发布', production: '生产', archived: '已归档' };
  const driftLabels: Record<string, string> = { stable: '稳定', drifting: '漂移中', critical: '严重漂移' };

  const statusVariant = (s: string) => s === 'applied' ? 'default' as const : s === 'deprecated' ? 'destructive' as const : 'secondary' as const;
  const stageVariant = (s: string) => s === 'production' ? 'default' as const : s === 'archived' ? 'destructive' as const : 'secondary' as const;
  const driftVariant = (s: string) => s === 'stable' ? 'default' as const : s === 'critical' ? 'destructive' as const : 'secondary' as const;

  const handleCreateCrystal = useCallback((data: { name: string; type: Crystal['type']; description: string; confidence: number }) => {
    const typeMap: Record<Crystal['type'], string> = { pattern: 'pattern', rule: 'causal_link', threshold: 'threshold_update', model: 'anomaly_signature' };
    createCrystalMutation.mutate({
      name: data.name,
      type: typeMap[data.type] as any,
      pattern: { description: data.description, type: data.type },
      confidence: data.confidence,
      sourceType: 'manual',
    });
  }, [createCrystalMutation]);

  const handleCreateFeature = useCallback((data: { name: string; domain: string; inputDimensions: string[]; outputType: string; expression: string }) => {
    registerFeatureMutation.mutate({
      name: data.name,
      domain: data.domain,
      inputDimensions: data.inputDimensions,
      outputType: data.outputType,
      expression: data.expression || undefined,
    });
  }, [registerFeatureMutation]);

  const handleDeprecate = useCallback((crystalId: string) => {
    deprecateCrystalMutation.mutate({ crystalId: Number(crystalId) });
  }, [deprecateCrystalMutation]);

  const handleReviewSubmit = useCallback(() => {
    if (!reviewTarget) return;
    reviewCrystalMutation.mutate({ crystalId: Number(reviewTarget.id), decision: reviewAction === 'approve' ? 'approved' : 'rejected', comment: reviewComment || undefined });
  }, [reviewTarget, reviewAction, reviewComment, reviewCrystalMutation]);

  const filteredCrystals = crystals;

  return (
    <MainLayout title="知识探索器">
    <div className="animate-fade-up">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold">📚 知识探索器</h2>
          <p className="text-xs text-muted-foreground">知识图谱 · 知识结晶 · 特征注册表 · 模型注册表</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{crystals.length} 结晶</Badge>
          <Badge variant="outline" className="text-[10px]">{features.length} 特征</Badge>
          <Badge variant="outline" className="text-[10px]">{models.length} 模型</Badge>
        </div>
      </div>

      {/* 概览指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StatCard value={crystals.filter(c => c.status === 'applied').length} label="已应用结晶" icon="💎" />
        <StatCard value={crystals.filter(c => c.status === 'draft' || c.status === 'reviewed').length} label="待审核" icon="📝" />
        <StatCard value={features.filter(f => f.driftStatus === 'stable').length} label="稳定特征" icon="🔧" />
        <StatCard value={models.filter(m => m.stage === 'production').length} label="生产模型" icon="🤖" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-2">
          <TabsList>
            <TabsTrigger value="crystals" className="text-xs">知识结晶</TabsTrigger>
            <TabsTrigger value="features" className="text-xs">特征注册表</TabsTrigger>
            <TabsTrigger value="models" className="text-xs">模型注册表</TabsTrigger>
            <TabsTrigger value="graph" className="text-xs">知识图谱</TabsTrigger>
          </TabsList>
          <div className="flex gap-1.5">
            {activeTab === 'crystals' && <Button size="sm" className="h-7 text-xs" onClick={() => setCreateCrystalOpen(true)}>+ 创建结晶</Button>}
            {activeTab === 'features' && <Button size="sm" className="h-7 text-xs" onClick={() => setCreateFeatureOpen(true)}>+ 注册特征</Button>}
          </div>
        </div>

        {/* ===== 知识结晶 ===== */}
        <TabsContent value="crystals" className="mt-2">
          {/* K6: 状态筛选栏 */}
          <div className="flex gap-0.5 bg-muted p-0.5 rounded-md mb-2">
            {(['all', 'draft', 'pending_review', 'approved', 'deprecated'] as const).map(st => (
              <button key={st} className={`px-2 py-1 text-[10px] rounded transition-colors ${crystalStatusFilter === st ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setCrystalStatusFilter(st)}>
                {st === 'all' ? '全部' : st === 'draft' ? '草稿' : st === 'pending_review' ? '待审核' : st === 'approved' ? '已批准' : '已废弃'}
              </button>
            ))}
          </div>

          {crystalsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载中...</span></div>
          ) : filteredCrystals.length === 0 ? (
            <div className="text-center py-8"><p className="text-xs text-muted-foreground">暂无知识结晶</p><Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setCreateCrystalOpen(true)}>创建第一个结晶</Button></div>
          ) : (
            <div className="space-y-1.5">
              {filteredCrystals.map(crystal => (
                <PageCard key={crystal.id} className="cursor-pointer" onClick={() => setSelectedCrystal(crystal)}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{typeLabels[crystal.type] ?? crystal.type}</Badge>
                      <span className="text-xs font-medium">{crystal.name}</span>
                      <Badge variant={statusVariant(crystal.status)} className="text-[10px]">{statusLabels[crystal.status] ?? crystal.status}</Badge>
                      {crystal.sourceType && <Badge variant="outline" className="text-[10px] opacity-60">{crystal.sourceType}</Badge>}
                    </div>
                    <div className="flex gap-0.5">
                      {(crystal.status === 'draft' || crystal.status === 'pending_review' as any) && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); setReviewTarget(crystal); setReviewDialogOpen(true); }}>审核</Button>
                      )}
                      {(crystal.status === 'reviewed' || crystal.status === 'approved' as any) && (
                        <Button size="sm" className="h-6 text-[10px]" onClick={(e) => { e.stopPropagation(); applyCrystalMutation.mutate({ crystalId: crystal.id }); }}>应用</Button>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-1">{crystal.description}</p>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>置信度: <span className="text-foreground font-mono">{Math.round(crystal.confidence * 100)}%</span></span>
                    <span>数据源: <span className="text-foreground">{crystal.sourceCount}</span></span>
                    <span>应用: <span className="text-foreground">{crystal.appliedCount}次</span></span>
                    {crystal.negativeFeedbackRate != null && <span>负反馈: <span className={`font-mono ${crystal.negativeFeedbackRate > 0.3 ? 'text-red-500' : 'text-foreground'}`}>{Math.round(crystal.negativeFeedbackRate * 100)}%</span></span>}
                    <span>创建: {new Date(crystal.createdAt).toLocaleDateString()}</span>
                  </div>
                  {crystal.reviewComment && <p className="text-[10px] text-yellow-600 mt-0.5">审核意见: {crystal.reviewComment}</p>}
                </PageCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== 特征注册表 ===== */}
        <TabsContent value="features" className="mt-2">
          {featuresQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载中...</span></div>
          ) : features.length === 0 ? (
            <div className="text-center py-8"><p className="text-xs text-muted-foreground">暂无注册特征</p><Button size="sm" className="mt-2 h-7 text-xs" onClick={() => setCreateFeatureOpen(true)}>注册第一个特征</Button></div>
          ) : (
            <PageCard noPadding>
              <div className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1">特征名</TableHead>
                      <TableHead className="text-[10px] py-1">领域</TableHead>
                      <TableHead className="text-[10px] py-1">版本</TableHead>
                      <TableHead className="text-[10px] py-1">输入维度</TableHead>
                      <TableHead className="text-[10px] py-1">输出</TableHead>
                      <TableHead className="text-[10px] py-1">漂移</TableHead>
                      <TableHead className="text-[10px] py-1">使用</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.map(f => (
                      <TableRow key={f.id}>
                        <TableCell className="font-mono text-xs font-medium py-1">{f.name}</TableCell>
                        <TableCell className="text-xs py-1">{f.domain}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground py-1">{f.version}</TableCell>
                        <TableCell className="py-1"><div className="flex flex-wrap gap-0.5">{f.inputDimensions.map(d => <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>)}</div></TableCell>
                        <TableCell className="py-1"><Badge variant="outline" className="text-[10px]">{f.outputType}</Badge></TableCell>
                        <TableCell className="py-1"><Badge variant={driftVariant(f.driftStatus)} className="text-[10px]">{driftLabels[f.driftStatus]}</Badge></TableCell>
                        <TableCell className="font-mono text-xs py-1">{f.usageCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== 模型注册表 ===== */}
        <TabsContent value="models" className="mt-2">
          {modelsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载中...</span></div>
          ) : models.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">暂无注册模型</div>
          ) : (
            <PageCard noPadding>
              <div className="p-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1">模型名</TableHead>
                      <TableHead className="text-[10px] py-1">版本</TableHead>
                      <TableHead className="text-[10px] py-1">类型</TableHead>
                      <TableHead className="text-[10px] py-1">阶段</TableHead>
                      <TableHead className="text-[10px] py-1">准确率</TableHead>
                      <TableHead className="text-[10px] py-1">推理</TableHead>
                      <TableHead className="text-[10px] py-1">最后训练</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs font-medium py-1">{m.name}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground py-1">{m.version}</TableCell>
                        <TableCell className="text-xs py-1">{m.type}</TableCell>
                        <TableCell className="py-1"><Badge variant={stageVariant(m.stage)} className="text-[10px]">{stageLabels[m.stage]}</Badge></TableCell>
                        <TableCell className="py-1"><div className="flex items-center gap-1"><Progress value={m.accuracy * 100} className="h-1.5 w-12" /><span className="font-mono text-[10px]">{Math.round(m.accuracy * 100)}%</span></div></TableCell>
                        <TableCell className="font-mono text-xs py-1">{m.servingCount}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground py-1">{new Date(m.lastTrainedAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </PageCard>
          )}
        </TabsContent>

        {/* ===== 知识图谱 ===== */}
        <TabsContent value="graph" className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-2">
              {Object.entries(nodeTypeLabels).map(([type, label]) => (
                <div key={type} className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${nodeTypeColors[type]}`} /><span className="text-[10px] text-muted-foreground">{label}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">深度:</Label>
              <Select value={String(graphDepth)} onValueChange={v => setGraphDepth(Number(v))}>
                <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem><SelectItem value="5">5</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {graphQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /><span className="text-xs text-muted-foreground">加载知识图谱...</span></div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <PageCard title={`节点 (${nodes.length})`} icon="🔵">
                {nodes.length === 0 ? (
                  <div className="text-center text-[10px] text-muted-foreground py-4">暂无知识节点</div>
                ) : (
                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                    {nodes.map(node => (
                      <div key={node.id} className="flex items-center gap-1.5 p-1 rounded hover:bg-muted/50">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${nodeTypeColors[node.type]}`} />
                        <span className="text-xs">{node.label}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">{nodeTypeLabels[node.type]}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </PageCard>
              <PageCard title={`关系 (${edges.length})`} icon="🔗">
                {edges.length === 0 ? (
                  <div className="text-center text-[10px] text-muted-foreground py-4">暂无知识关系</div>
                ) : (
                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                    {edges.map((edge, i) => {
                      const srcNode = nodes.find(n => n.id === edge.source);
                      const tgtNode = nodes.find(n => n.id === edge.target);
                      return (
                        <div key={i} className="flex items-center gap-1.5 p-1 rounded hover:bg-muted/50 text-xs">
                          <span>{srcNode?.label ?? edge.source}</span>
                          <Badge variant="secondary" className="text-[10px]">{edge.relation}</Badge>
                          <span>{tgtNode?.label ?? edge.target}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground font-mono">{edge.weight.toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </PageCard>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateCrystalDialog open={createCrystalOpen} onOpenChange={setCreateCrystalOpen} onSubmit={handleCreateCrystal} isSubmitting={createCrystalMutation.isPending} />
      <CreateFeatureDialog open={createFeatureOpen} onOpenChange={setCreateFeatureOpen} onSubmit={handleCreateFeature} isSubmitting={registerFeatureMutation.isPending} />
      <CrystalDetailDialog open={!!selectedCrystal} onOpenChange={(open) => { if (!open) setSelectedCrystal(null); }} crystal={selectedCrystal} onApply={(id) => applyCrystalMutation.mutate({ crystalId: id })} onDeprecate={handleDeprecate} isApplying={applyCrystalMutation.isPending} />

      {/* K6: 审核对话框 */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-sm p-3 gap-1.5">
          <DialogHeader className="gap-0.5 pb-0">
            <DialogTitle className="text-sm">审核知识结晶</DialogTitle>
            <DialogDescription className="text-[10px]">审核 "{reviewTarget?.name}" — 决定是否批准或驳回</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">审核动作</Label>
              <Select value={reviewAction} onValueChange={v => setReviewAction(v as 'approve' | 'reject')}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="approve">✅ 批准</SelectItem><SelectItem value="reject">❌ 驳回</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">审核意见 (可选)</Label>
              <Textarea className="text-xs min-h-[36px]" value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="输入审核意见..." rows={2} />
            </div>
          </div>
          <DialogFooter className="pt-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setReviewDialogOpen(false)}>取消</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleReviewSubmit} disabled={reviewCrystalMutation.isPending}>{reviewCrystalMutation.isPending ? '提交中...' : '提交审核'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </MainLayout>
  );
}
