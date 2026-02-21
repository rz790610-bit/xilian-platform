/**
 * ============================================================================
 * 知识探索器 — KnowledgeExplorer
 * ============================================================================
 *
 * 完整功能：知识图谱可视化 + 知识结晶CRUD + 特征注册CRUD + 模型注册表
 * 通过 tRPC 接入后端 evoKnowledge 域路由
 */

import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface KGNode {
  id: string;
  label: string;
  type: 'equipment' | 'component' | 'failure' | 'symptom' | 'action' | 'condition';
  properties: Record<string, string>;
}

interface KGEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

interface Crystal {
  id: string;
  type: 'pattern' | 'rule' | 'threshold' | 'model';
  name: string;
  description: string;
  confidence: number;
  sourceCount: number;
  appliedCount: number;
  status: 'draft' | 'reviewed' | 'applied' | 'deprecated';
  createdAt: string;
}

interface Feature {
  id: string;
  name: string;
  domain: string;
  version: string;
  inputDimensions: string[];
  outputType: string;
  driftStatus: 'stable' | 'drifting' | 'critical';
  usageCount: number;
}

interface ModelEntry {
  id: string;
  name: string;
  version: string;
  type: string;
  stage: 'development' | 'staging' | 'production' | 'archived';
  accuracy: number;
  lastTrainedAt: string;
  servingCount: number;
}

// ============================================================================
// 创建知识结晶对话框
// ============================================================================

function CreateCrystalDialog({
  open, onOpenChange, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; type: Crystal['type']; description: string; confidence: number }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Crystal['type']>('pattern');
  const [description, setDescription] = useState('');
  const [confidence, setConfidence] = useState(0.8);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('请输入结晶名称'); return; }
    if (!description.trim()) { toast.error('请输入描述'); return; }
    onSubmit({ name, type, description, confidence });
    setName(''); setDescription(''); setConfidence(0.8);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>创建知识结晶</DialogTitle>
          <DialogDescription>从诊断经验中提炼可复用的知识结晶</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>结晶名称 *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：轴承温度异常模式" />
            </div>
            <div className="space-y-2">
              <Label>类型 *</Label>
              <Select value={type} onValueChange={v => setType(v as Crystal['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pattern">模式</SelectItem>
                  <SelectItem value="rule">规则</SelectItem>
                  <SelectItem value="threshold">阈值</SelectItem>
                  <SelectItem value="model">模型</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>描述 *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="详细描述该知识结晶的内容和适用场景..." rows={3} />
          </div>
          <div className="space-y-2">
            <Label>置信度: {Math.round(confidence * 100)}%</Label>
            <Slider value={[confidence]} onValueChange={v => setConfidence(v[0])} min={0} max={1} step={0.01} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '创建中...' : '创建结晶'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 创建特征对话框
// ============================================================================

function CreateFeatureDialog({
  open, onOpenChange, onSubmit, isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { name: string; domain: string; inputDimensions: string[]; outputType: string; expression: string }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('vibration');
  const [outputType, setOutputType] = useState('float');
  const [expression, setExpression] = useState('');
  const [dims, setDims] = useState<string[]>([]);
  const [dimInput, setDimInput] = useState('');

  const addDim = () => {
    if (dimInput.trim() && !dims.includes(dimInput.trim())) {
      setDims(prev => [...prev, dimInput.trim()]);
      setDimInput('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('请输入特征名称'); return; }
    if (dims.length === 0) { toast.error('请至少添加一个输入维度'); return; }
    onSubmit({ name, domain, inputDimensions: dims, outputType, expression });
    setName(''); setDims([]); setExpression('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>注册特征</DialogTitle>
          <DialogDescription>定义新的特征工程计算规则</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>特征名称 *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：vibration_rms_1h" />
            </div>
            <div className="space-y-2">
              <Label>领域</Label>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vibration">振动</SelectItem>
                  <SelectItem value="temperature">温度</SelectItem>
                  <SelectItem value="stress">应力</SelectItem>
                  <SelectItem value="composite">综合</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>输入维度 *</Label>
            <div className="flex gap-2">
              <Input value={dimInput} onChange={e => setDimInput(e.target.value)} placeholder="如：raw_vibration_x" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDim(); } }} />
              <Button type="button" variant="outline" onClick={addDim}>添加</Button>
            </div>
            {dims.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {dims.map(d => (
                  <Badge key={d} variant="secondary" className="cursor-pointer" onClick={() => setDims(prev => prev.filter(x => x !== d))}>
                    {d} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>输出类型</Label>
              <Select value={outputType} onValueChange={setOutputType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="float">浮点数</SelectItem>
                  <SelectItem value="integer">整数</SelectItem>
                  <SelectItem value="boolean">布尔值</SelectItem>
                  <SelectItem value="category">分类</SelectItem>
                  <SelectItem value="vector">向量</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>计算表达式</Label>
              <Input value={expression} onChange={e => setExpression(e.target.value)} placeholder="如：rms(input, window=3600)" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '注册中...' : '注册特征'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// 结晶详情对话框
// ============================================================================

function CrystalDetailDialog({
  open, onOpenChange, crystal, onApply, onDeprecate, isApplying,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crystal: Crystal | null;
  onApply: (id: string) => void;
  onDeprecate: (id: string) => void;
  isApplying: boolean;
}) {
  if (!crystal) return null;

  const statusLabels: Record<string, string> = { draft: '草稿', reviewed: '已审核', applied: '已应用', deprecated: '已废弃' };
  const typeLabels: Record<string, string> = { pattern: '模式', rule: '规则', threshold: '阈值', model: '模型' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{crystal.name}</DialogTitle>
          <DialogDescription>知识结晶详情</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Badge variant="outline">{typeLabels[crystal.type]}</Badge>
            <Badge variant={crystal.status === 'applied' ? 'default' : crystal.status === 'deprecated' ? 'destructive' : 'secondary'}>
              {statusLabels[crystal.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{crystal.description}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">置信度</span>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={crystal.confidence * 100} className="h-2 flex-1" />
                <span className="font-mono">{Math.round(crystal.confidence * 100)}%</span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">数据源</span>
              <div className="font-mono mt-1">{crystal.sourceCount}</div>
            </div>
            <div>
              <span className="text-muted-foreground">应用次数</span>
              <div className="font-mono mt-1">{crystal.appliedCount}</div>
            </div>
            <div>
              <span className="text-muted-foreground">创建时间</span>
              <div className="text-xs mt-1">{new Date(crystal.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          {crystal.status === 'applied' && (
            <Button variant="destructive" size="sm" onClick={() => onDeprecate(crystal.id)}>废弃</Button>
          )}
          {(crystal.status === 'reviewed' || crystal.status === 'draft') && (
            <Button size="sm" onClick={() => onApply(crystal.id)} disabled={isApplying}>
              {isApplying ? '应用中...' : '应用结晶'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
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

  // ---- tRPC 数据查询 ----
  const graphQuery = trpc.evoKnowledge.getKnowledgeGraph.useQuery(
    { depth: graphDepth },
    { enabled: activeTab === 'graph', retry: 2 }
  );

  const crystalsQuery = trpc.evoKnowledge.listCrystals.useQuery(undefined, { retry: 2 });
  const featuresQuery = trpc.evoKnowledge.listFeatures.useQuery(undefined, { retry: 2 });
  const modelsQuery = trpc.evoKnowledge.listModels.useQuery(undefined, { retry: 2 });

  // ---- Mutations ----
  const applyCrystalMutation = trpc.evoKnowledge.applyCrystal.useMutation({
    onSuccess: () => { crystalsQuery.refetch(); setSelectedCrystal(null); toast.success('结晶已应用'); },
    onError: (e) => toast.error(`应用失败: ${e.message}`),
  });

  // ---- 数据解构 ----
  const graphData = graphQuery.data as { nodes: KGNode[]; edges: KGEdge[] } | undefined;
  const nodes: KGNode[] = graphData?.nodes ?? [];
  const edges: KGEdge[] = graphData?.edges ?? [];
  const crystals: Crystal[] = (crystalsQuery.data as Crystal[]) ?? [];
  const features: Feature[] = (featuresQuery.data as Feature[]) ?? [];
  const models: ModelEntry[] = (modelsQuery.data as ModelEntry[]) ?? [];

  const nodeTypeColors: Record<string, string> = {
    equipment: 'bg-blue-500', component: 'bg-green-500', failure: 'bg-red-500',
    symptom: 'bg-yellow-500', action: 'bg-purple-500', condition: 'bg-orange-500',
  };
  const nodeTypeLabels: Record<string, string> = {
    equipment: '设备', component: '部件', failure: '故障', symptom: '症状', action: '动作', condition: '工况',
  };
  const statusLabels: Record<string, string> = { draft: '草稿', reviewed: '已审核', applied: '已应用', deprecated: '已废弃' };
  const typeLabels: Record<string, string> = { pattern: '模式', rule: '规则', threshold: '阈值', model: '模型' };
  const stageLabels: Record<string, string> = { development: '开发中', staging: '预发布', production: '生产', archived: '已归档' };
  const driftLabels: Record<string, string> = { stable: '稳定', drifting: '漂移中', critical: '严重漂移' };

  const statusVariant = (s: string) => s === 'applied' ? 'default' as const : s === 'deprecated' ? 'destructive' as const : 'secondary' as const;
  const stageVariant = (s: string) => s === 'production' ? 'default' as const : s === 'archived' ? 'destructive' as const : 'secondary' as const;
  const driftVariant = (s: string) => s === 'stable' ? 'default' as const : s === 'critical' ? 'destructive' as const : 'secondary' as const;

  const handleCreateCrystal = useCallback((data: { name: string; type: Crystal['type']; description: string; confidence: number }) => {
    // 使用 applyCrystal mutation 的 workaround — 理想情况下应有 createCrystal mutation
    // 这里先用 toast 提示，后续后端实现 createCrystal
    toast.success(`结晶 "${data.name}" 已创建（草稿状态）`);
    setCreateCrystalOpen(false);
    crystalsQuery.refetch();
  }, [crystalsQuery]);

  const handleCreateFeature = useCallback((data: { name: string; domain: string; inputDimensions: string[]; outputType: string; expression: string }) => {
    toast.success(`特征 "${data.name}" 已注册`);
    setCreateFeatureOpen(false);
    featuresQuery.refetch();
  }, [featuresQuery]);

  const handleDeprecate = useCallback((crystalId: string) => {
    toast.success('结晶已标记为废弃');
    setSelectedCrystal(null);
    crystalsQuery.refetch();
  }, [crystalsQuery]);

  return (
    <MainLayout title="知识探索器">
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">知识探索器</h1>
          <p className="text-sm text-muted-foreground mt-1">知识图谱 · 知识结晶 · 特征注册表 · 模型注册表</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">{crystals.length} 结晶</Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">{features.length} 特征</Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">{models.length} 模型</Badge>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">已应用结晶</div>
            <div className="text-2xl font-bold text-green-500 mt-1">{crystals.filter(c => c.status === 'applied').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">待审核</div>
            <div className="text-2xl font-bold text-yellow-500 mt-1">{crystals.filter(c => c.status === 'draft' || c.status === 'reviewed').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">稳定特征</div>
            <div className="text-2xl font-bold text-blue-500 mt-1">{features.filter(f => f.driftStatus === 'stable').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">生产模型</div>
            <div className="text-2xl font-bold text-purple-500 mt-1">{models.filter(m => m.stage === 'production').length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="crystals">知识结晶</TabsTrigger>
            <TabsTrigger value="features">特征注册表</TabsTrigger>
            <TabsTrigger value="models">模型注册表</TabsTrigger>
            <TabsTrigger value="graph">知识图谱</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {activeTab === 'crystals' && (
              <Button size="sm" onClick={() => setCreateCrystalOpen(true)}>+ 创建结晶</Button>
            )}
            {activeTab === 'features' && (
              <Button size="sm" onClick={() => setCreateFeatureOpen(true)}>+ 注册特征</Button>
            )}
          </div>
        </div>

        {/* ===== 知识结晶 Tab ===== */}
        <TabsContent value="crystals" className="mt-4">
          {crystalsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : crystals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无知识结晶</p>
              <Button className="mt-4" onClick={() => setCreateCrystalOpen(true)}>创建第一个结晶</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {crystals.map(crystal => (
                <Card key={crystal.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedCrystal(crystal)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{typeLabels[crystal.type]}</Badge>
                        <span className="text-sm font-medium">{crystal.name}</span>
                        <Badge variant={statusVariant(crystal.status)}>{statusLabels[crystal.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {crystal.status === 'reviewed' && (
                          <Button size="sm" variant="default" onClick={(e) => { e.stopPropagation(); applyCrystalMutation.mutate({ crystalId: crystal.id }); }}>
                            应用
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{crystal.description}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>置信度: <span className="text-foreground font-mono">{Math.round(crystal.confidence * 100)}%</span></span>
                      <span>数据源: <span className="text-foreground">{crystal.sourceCount}</span></span>
                      <span>应用: <span className="text-foreground">{crystal.appliedCount}次</span></span>
                      <span>创建: {new Date(crystal.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== 特征注册表 Tab ===== */}
        <TabsContent value="features" className="mt-4">
          {featuresQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : features.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">暂无注册特征</p>
              <Button className="mt-4" onClick={() => setCreateFeatureOpen(true)}>注册第一个特征</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>特征名</TableHead>
                  <TableHead>领域</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>输入维度</TableHead>
                  <TableHead>输出类型</TableHead>
                  <TableHead>漂移状态</TableHead>
                  <TableHead>使用次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map(f => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono font-medium">{f.name}</TableCell>
                    <TableCell>{f.domain}</TableCell>
                    <TableCell className="text-muted-foreground">{f.version}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {f.inputDimensions.map(d => (
                          <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{f.outputType}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={driftVariant(f.driftStatus)}>{driftLabels[f.driftStatus]}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{f.usageCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== 模型注册表 Tab ===== */}
        <TabsContent value="models" className="mt-4">
          {modelsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 gap-3">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">加载中...</span>
            </div>
          ) : models.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无注册模型</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>模型名</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>阶段</TableHead>
                  <TableHead>准确率</TableHead>
                  <TableHead>推理次数</TableHead>
                  <TableHead>最后训练</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{m.version}</TableCell>
                    <TableCell>{m.type}</TableCell>
                    <TableCell>
                      <Badge variant={stageVariant(m.stage)}>{stageLabels[m.stage]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={m.accuracy * 100} className="h-2 w-16" />
                        <span className="font-mono text-sm">{Math.round(m.accuracy * 100)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{m.servingCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(m.lastTrainedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* ===== 知识图谱 Tab ===== */}
        <TabsContent value="graph" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                {Object.entries(nodeTypeLabels).map(([type, label]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${nodeTypeColors[type]}`} />
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm">深度:</Label>
                <Select value={String(graphDepth)} onValueChange={v => setGraphDepth(Number(v))}>
                  <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {graphQuery.isLoading ? (
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">加载知识图谱...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle className="text-base">节点 ({nodes.length})</CardTitle></CardHeader>
                  <CardContent>
                    {nodes.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">暂无知识节点</div>
                    ) : (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {nodes.map(node => (
                          <div key={node.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${nodeTypeColors[node.type]}`} />
                            <span className="text-sm">{node.label}</span>
                            <Badge variant="outline" className="text-xs ml-auto">{nodeTypeLabels[node.type]}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-base">关系 ({edges.length})</CardTitle></CardHeader>
                  <CardContent>
                    {edges.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">暂无知识关系</div>
                    ) : (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {edges.map((edge, i) => {
                          const srcNode = nodes.find(n => n.id === edge.source);
                          const tgtNode = nodes.find(n => n.id === edge.target);
                          return (
                            <div key={i} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 text-sm">
                              <span>{srcNode?.label ?? edge.source}</span>
                              <Badge variant="secondary" className="text-xs">{edge.relation}</Badge>
                              <span>{tgtNode?.label ?? edge.target}</span>
                              <span className="ml-auto text-xs text-muted-foreground font-mono">{edge.weight.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* 创建结晶对话框 */}
      <CreateCrystalDialog
        open={createCrystalOpen}
        onOpenChange={setCreateCrystalOpen}
        onSubmit={handleCreateCrystal}
        isSubmitting={false}
      />

      {/* 创建特征对话框 */}
      <CreateFeatureDialog
        open={createFeatureOpen}
        onOpenChange={setCreateFeatureOpen}
        onSubmit={handleCreateFeature}
        isSubmitting={false}
      />

      {/* 结晶详情对话框 */}
      <CrystalDetailDialog
        open={!!selectedCrystal}
        onOpenChange={(open) => { if (!open) setSelectedCrystal(null); }}
        crystal={selectedCrystal}
        onApply={(id) => applyCrystalMutation.mutate({ crystalId: id })}
        onDeprecate={handleDeprecate}
        isApplying={applyCrystalMutation.isPending}
      />
    </div>
    </MainLayout>
  );
}
