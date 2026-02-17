import { useState, useMemo, useCallback } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const CATEGORY_META: Record<string, { label: string; icon: string; desc: string }> = {
  mechanical: { label: "机械算法", icon: "⚙️", desc: "FFT频谱分析、倒频谱、包络解调、小波包、带通滤波、谱峭度、重采样、阶次跟踪" },
  electrical: { label: "电气算法", icon: "⚡", desc: "电机电流分析MCSA、局部放电PD、变频器状态、电能质量" },
  structural: { label: "结构算法", icon: "🏗️", desc: "Miner累积损伤、声发射分析、模态分析、热点应力、雨流计数" },
  anomaly: { label: "异常检测", icon: "🚨", desc: "Isolation Forest、LSTM异常检测、自编码器、统计过程控制SPC" },
  optimization: { label: "优化算法", icon: "📈", desc: "粒子群PSO、遗传算法GA、贝叶斯优化、模拟退火" },
  comprehensive: { label: "综合算法", icon: "🔗", desc: "DS证据融合、关联规则挖掘、因果推理、工况归一化" },
  feature: { label: "特征提取", icon: "📊", desc: "时域/频域/时频域特征提取、统计特征、深度特征" },
  agent: { label: "Agent插件", icon: "🤖", desc: "时序模式、案例检索、物理约束、空间异常、融合诊断、预测专家" },
  model: { label: "模型迭代", icon: "🔄", desc: "LoRA微调、全量重训练、增量学习、模型蒸馏" },
  rule: { label: "规则自动学习", icon: "📝", desc: "LLM分析、关联规则学习、决策树归纳、频繁模式挖掘" },
  compose: { label: "算法编排", icon: "🧩", desc: "将多个原子算法组合为场景化诊断方案" },
  execution: { label: "执行记录", icon: "📋", desc: "查看所有算法的执行历史和结果" },
};

const ROUTE_TO_CATEGORY: Record<string, string> = {
  mechanical: "mechanical",
  electrical: "electrical",
  structural: "structural",
  anomaly: "anomaly_detection",
  optimization: "optimization",
  comprehensive: "comprehensive",
  feature: "feature_extraction",
  agent: "agent_plugin",
  model: "model_iteration",
  rule: "rule_learning",
};

const IMPL_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  builtin: { label: "内置", variant: "default" },
  pipeline_node: { label: "Pipeline", variant: "secondary" },
  plugin: { label: "插件", variant: "outline" },
  external: { label: "外部", variant: "outline" },
};

const CATEGORY_LABELS: Record<string, string> = {
  mechanical: "机械算法",
  electrical: "电气算法",
  structural: "结构算法",
  anomaly_detection: "异常检测",
  optimization: "优化算法",
  comprehensive: "综合算法",
  feature_extraction: "特征提取",
  agent_plugin: "Agent插件",
  model_iteration: "模型迭代",
  rule_learning: "规则自动学习",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 类型定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface StepNode {
  id: string;
  order: number;
  algo_code: string;
  config_overrides?: Record<string, unknown>;
}

interface StepEdge {
  from: string;
  to: string;
  condition?: string;
  data_mapping?: Record<string, string>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主路由组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function AlgorithmCategory() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/algorithm/:category");
  const category = params?.category || "signal";
  const meta = CATEGORY_META[category];
  const backendCategory = ROUTE_TO_CATEGORY[category];

  const listQuery = trpc.algorithm.listDefinitions.useQuery(
    { category: backendCategory, pageSize: 100 },
    { enabled: !!backendCategory }
  );

  if (category === "compose") {
    return <MainLayout title="算法编排"><AlgorithmComposePage /></MainLayout>;
  }
  if (category === "execution") {
    return <MainLayout title="执行记录"><AlgorithmExecutionPage /></MainLayout>;
  }

  const algorithms = listQuery.data?.items;

  return (
    <MainLayout title={meta?.label || "算法分类"}>
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">{meta?.label || category}</span>
      </div>

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span>{meta?.icon}</span> {meta?.label || category}
        </h1>
        <p className="text-muted-foreground mt-1">{meta?.desc}</p>
      </div>

      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-28 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : algorithms && algorithms.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {algorithms.map((algo: any) => {
            const implMeta = IMPL_LABELS[algo.implType] || { label: algo.implType, variant: "outline" as const };
            return (
              <Card
                key={algo.algoCode || algo.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => {
                  // 已有独立页面的算法直接跳转到新页面
                  const DEDICATED_PAGES: Record<string, string> = {
                    'ds_evidence_fusion': '/diagnosis/fusion',
                    'condition_normalization': '/algorithm/condition-normalizer',
                    'model_distillation': '/algorithm/distillation',
                  };
                  const dedicated = DEDICATED_PAGES[algo.algoCode];
                  navigate(dedicated || `/algorithm/detail/${algo.algoCode}`);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base group-hover:text-primary transition-colors">
                      {algo.label || algo.algoName}
                    </CardTitle>
                    <Badge variant={implMeta.variant}>{implMeta.label}</Badge>
                  </div>
                  <CardDescription className="font-mono text-xs">{algo.algoCode}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{algo.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-2xl mb-3">{meta?.icon || "📦"}</div>
            <h3 className="text-base font-medium">暂无{meta?.label}算法</h3>
            <p className="text-sm text-muted-foreground mt-1">后续版本将持续扩充</p>
          </CardContent>
        </Card>
      )}
    </div>
    </MainLayout>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 算法编排页面（完整实现）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AlgorithmComposePage() {
  const [, navigate] = useLocation();
  const compositionsQuery = trpc.algorithm.listCompositions.useQuery({});
  const allAlgosQuery = trpc.algorithm.listDefinitions.useQuery({ pageSize: 100 });
  const createMutation = trpc.algorithm.createComposition.useMutation({
    onSuccess: () => {
      compositionsQuery.refetch();
      toast.success("编排创建成功");
      resetForm();
    },
    onError: (err: any) => {
      toast.error(err.message || "创建失败");
    },
  });

  // ── 新建编排对话框状态 ──
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<"info" | "steps">("info");
  const [compCode, setCompCode] = useState("");
  const [compName, setCompName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<StepNode[]>([]);
  const [edges, setEdges] = useState<StepEdge[]>([]);

  // ── 查看编排详情对话框 ──
  const [viewCompCode, setViewCompCode] = useState<string | null>(null);
  const viewQuery = trpc.algorithm.getComposition.useQuery(
    { compCode: viewCompCode || "" },
    { enabled: !!viewCompCode }
  );

  // ── 添加步骤对话框 ──
  const [showAddStep, setShowAddStep] = useState(false);
  const [selectedAlgoCode, setSelectedAlgoCode] = useState("");
  const [stepFilterCategory, setStepFilterCategory] = useState("all");

  // 算法按分类分组
  const algosByCategory = useMemo(() => {
    const items = allAlgosQuery.data?.items || [];
    const grouped: Record<string, any[]> = {};
    for (const algo of items) {
      const cat = algo.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(algo);
    }
    return grouped;
  }, [allAlgosQuery.data]);

  const allAlgos = useMemo(() => allAlgosQuery.data?.items || [], [allAlgosQuery.data]);

  const filteredAlgos = useMemo(() => {
    if (stepFilterCategory === "all") return allAlgos;
    return allAlgos.filter((a: any) => a.category === stepFilterCategory);
  }, [allAlgos, stepFilterCategory]);

  const getAlgoLabel = useCallback((code: string) => {
    const algo = allAlgos.find((a: any) => a.algoCode === code);
    return algo ? (algo.label || algo.algoName) : code;
  }, [allAlgos]);

  const getAlgoCategory = useCallback((code: string) => {
    const algo = allAlgos.find((a: any) => a.algoCode === code);
    return algo ? (CATEGORY_LABELS[algo.category] || algo.category) : "";
  }, [allAlgos]);

  const resetForm = useCallback(() => {
    setShowCreate(false);
    setCreateStep("info");
    setCompCode("");
    setCompName("");
    setDescription("");
    setNodes([]);
    setEdges([]);
  }, []);

  // 添加步骤（不使用 useCallback，避免闭包捕获过时状态）
  const addStep = () => {
    console.log('[addStep] called, selectedAlgoCode =', selectedAlgoCode);
    if (!selectedAlgoCode) {
      console.warn('[addStep] selectedAlgoCode is empty, returning');
      return;
    }
    const newId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setNodes(prev => {
      const updated = [...prev, {
        id: newId,
        order: prev.length + 1,
        algo_code: selectedAlgoCode,
        config_overrides: {},
      }];
      // 自动添加边（串联上一个步骤）— 使用 prev 而非外部 nodes
      if (prev.length > 0) {
        const prevNode = prev[prev.length - 1];
        setEdges(oldEdges => [...oldEdges, { from: prevNode.id, to: newId }]);
      }
      return updated;
    });
    const label = getAlgoLabel(selectedAlgoCode);
    setSelectedAlgoCode("");
    setShowAddStep(false);
    toast.success(`已添加步骤: ${label}`);
    console.log('[addStep] step added successfully');
  };

  // 删除步骤
  const removeStep = useCallback((nodeId: string) => {
    setNodes(prev => {
      const filtered = prev.filter(n => n.id !== nodeId);
      return filtered.map((n, i) => ({ ...n, order: i + 1 }));
    });
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    // 重建边（保持串联）
    setNodes(prev => {
      const newEdges: StepEdge[] = [];
      for (let i = 1; i < prev.length; i++) {
        newEdges.push({ from: prev[i - 1].id, to: prev[i].id });
      }
      setEdges(newEdges);
      return prev;
    });
  }, []);

  // 移动步骤
  const moveStep = useCallback((index: number, direction: "up" | "down") => {
    setNodes(prev => {
      const arr = [...prev];
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      [arr[index], arr[targetIdx]] = [arr[targetIdx], arr[index]];
      const reordered = arr.map((n, i) => ({ ...n, order: i + 1 }));
      // 重建边
      const newEdges: StepEdge[] = [];
      for (let i = 1; i < reordered.length; i++) {
        newEdges.push({ from: reordered[i - 1].id, to: reordered[i].id });
      }
      setEdges(newEdges);
      return reordered;
    });
  }, []);

  // compCode 校验（与后端正则一致）
  const isValidCompCode = useCallback((code: string) => /^[a-z][a-z0-9_]*$/.test(code), []);

  // 提交创建
  const handleCreate = useCallback(() => {
    if (!compCode || !compName) {
      toast.error("请填写编排编码和名称");
      return;
    }
    if (!isValidCompCode(compCode)) {
      toast.error("编排编码格式错误：必须以小写字母开头，只能包含小写字母、数字和下划线");
      return;
    }
    if (nodes.length === 0) {
      toast.error("请至少添加一个算法步骤");
      return;
    }
    createMutation.mutate({
      compCode,
      compName,
      description,
      steps: { nodes, edges },
    });
  }, [compCode, compName, description, nodes, edges, createMutation, isValidCompCode]);

  // 自动生成编码（确保以小写字母开头，满足 /^[a-z][a-z0-9_]*$/）
  const autoGenerateCode = useCallback((name: string) => {
    let code = name
      .replace(/[\u4e00-\u9fa5]/g, (ch) => {
        const c = ch.charCodeAt(0);
        return String.fromCharCode(97 + (c % 26));
      })
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 30);
    // 确保以小写字母开头
    if (code && !/^[a-z]/.test(code)) {
      code = "comp_" + code;
    }
    return code || "comp_" + Date.now().toString(36);
  }, []);

  return (
    <div className="space-y-6">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">算法编排</span>
      </div>

      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🧩 算法编排</h1>
          <p className="text-muted-foreground mt-1">将多个原子算法组合为场景化诊断方案，支持 DAG 流程编排</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 新建编排</Button>
      </div>

      {/* 编排列表 */}
      {compositionsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : compositionsQuery.data && compositionsQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {compositionsQuery.data.map((comp: any) => {
            const stepNodes = comp.steps?.nodes || [];
            return (
              <Card
                key={comp.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => setViewCompCode(comp.compCode)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base group-hover:text-primary transition-colors">
                      {comp.compName}
                    </CardTitle>
                    <div className="flex gap-1.5">
                      <Badge variant="outline">{stepNodes.length} 步骤</Badge>
                      <Badge variant={comp.status === "active" ? "default" : "secondary"}>
                        {comp.status === "active" ? "启用" : comp.status === "draft" ? "草稿" : "已废弃"}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="font-mono text-xs">{comp.compCode}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {comp.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{comp.description}</p>
                  )}
                  {/* 流程缩略 */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {stepNodes.slice(0, 5).map((node: any, idx: number) => (
                      <span key={node.id} className="flex items-center gap-1">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                          {getAlgoLabel(node.algo_code)}
                        </span>
                        {idx < Math.min(stepNodes.length, 5) - 1 && (
                          <span className="text-muted-foreground text-xs">→</span>
                        )}
                      </span>
                    ))}
                    {stepNodes.length > 5 && (
                      <span className="text-xs text-muted-foreground">+{stepNodes.length - 5} 更多</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>版本: {comp.version || "v1.0.0"}</span>
                    <span>创建: {comp.createdAt ? new Date(comp.createdAt).toLocaleDateString("zh-CN") : "-"}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-3xl mb-3">🧩</div>
            <h3 className="text-base font-medium">暂无算法编排</h3>
            <p className="text-sm text-muted-foreground mt-2">
              创建编排可以将 FFT → 特征提取 → 异常检测 等多个算法串联为自动化流程
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>创建第一个编排</Button>
          </CardContent>
        </Card>
      )}

      {/* ━━━━━━━━━━ 新建编排对话框 ━━━━━━━━━━ */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {createStep === "info" ? "新建算法编排 — 基本信息" : "新建算法编排 — 配置步骤"}
            </DialogTitle>
            <DialogDescription>
              {createStep === "info"
                ? "填写编排的基本信息，然后配置算法步骤"
                : `已添加 ${nodes.length} 个步骤，从算法库中选择算法并排列执行顺序`}
            </DialogDescription>
          </DialogHeader>

          {createStep === "info" ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="compName">编排名称 *</Label>
                <Input
                  id="compName"
                  placeholder="例如：振动诊断全流程"
                  value={compName}
                  onChange={(e) => {
                    setCompName(e.target.value);
                    if (!compCode || compCode === autoGenerateCode(compName)) {
                      setCompCode(autoGenerateCode(e.target.value));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compCode">编排编码 *</Label>
                <Input
                  id="compCode"
                  placeholder="小写字母开头，如 vibration_diagnosis"
                  value={compCode}
                  onChange={(e) => setCompCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  className={`font-mono ${compCode && !isValidCompCode(compCode) ? "border-destructive" : ""}`}
                />
                {compCode && !isValidCompCode(compCode) && (
                  <p className="text-xs text-destructive">编码必须以小写字母开头，只能包含小写字母、数字和下划线</p>
                )}
                <p className="text-xs text-muted-foreground">唯一标识，创建后不可修改</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">描述</Label>
                <Textarea
                  id="description"
                  placeholder="描述这个编排的用途和适用场景..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          ) : showAddStep ? (
            /* ── 内嵌的算法选择面板（替代嵌套 Dialog） ── */
            <div className="flex-1 min-h-0 flex flex-col gap-3 py-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAddStep(false)}>← 返回步骤列表</Button>
                <span className="text-sm text-muted-foreground">选择算法添加为步骤</span>
              </div>
              {/* 分类筛选 */}
              <div className="flex items-center gap-2">
                <Label className="shrink-0 text-sm">分类:</Label>
                <Select value={stepFilterCategory} onValueChange={setStepFilterCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground ml-auto">{filteredAlgos.length} 个算法</span>
              </div>
              {/* 算法列表 */}
              <ScrollArea className="flex-1 max-h-[350px]">
                <div className="space-y-1 pr-3">
                  {filteredAlgos.map((algo: any) => {
                    const isSelected = selectedAlgoCode === algo.algoCode;
                    const isAlreadyAdded = nodes.some(n => n.algo_code === algo.algoCode);
                    return (
                      <div
                        key={algo.algoCode}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 border border-primary/30"
                            : isAlreadyAdded
                            ? "bg-muted/30 opacity-60"
                            : "hover:bg-muted/50 border border-transparent"
                        }`}
                        onClick={() => setSelectedAlgoCode(algo.algoCode)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{algo.label || algo.algoName}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {CATEGORY_LABELS[algo.category] || algo.category}
                            </Badge>
                            {isAlreadyAdded && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">已添加</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{algo.description}</p>
                        </div>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{algo.algoCode}</span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <Button
                type="button"
                disabled={!selectedAlgoCode}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[Button onClick] fired');
                  addStep();
                }}
                className="w-full relative z-10 shrink-0"
              >
                添加: {selectedAlgoCode ? getAlgoLabel(selectedAlgoCode) : "请选择算法"}
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col gap-3 py-2">
              {/* 步骤列表 */}
              <ScrollArea className="flex-1 max-h-[400px]">
                {nodes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="text-2xl mb-2">📋</div>
                    <p className="text-sm">尚未添加步骤，点击下方按钮添加算法</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    {nodes.map((node, index) => (
                      <div key={node.id} className="flex items-center gap-2">
                        {/* 序号 */}
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {index + 1}
                        </div>
                        {/* 连接线 */}
                        {index > 0 && (
                          <div className="absolute -mt-8 ml-3.5 w-px h-4 bg-border" />
                        )}
                        {/* 步骤卡片 */}
                        <div className="flex-1 flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{getAlgoLabel(node.algo_code)}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {getAlgoCategory(node.algo_code)}
                              </Badge>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{node.algo_code}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={index === 0}
                              onClick={() => moveStep(index, "up")}
                            >↑</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              disabled={index === nodes.length - 1}
                              onClick={() => moveStep(index, "down")}
                            >↓</Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => removeStep(node.id)}
                            >×</Button>
                          </div>
                        </div>
                        {/* 箭头 */}
                        {index < nodes.length - 1 && (
                          <div className="absolute left-[2.1rem] mt-12 text-muted-foreground text-xs">↓</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* 添加步骤按钮 */}
              <Button variant="outline" className="w-full border-dashed" onClick={() => setShowAddStep(true)}>
                + 添加算法步骤
              </Button>
            </div>
          )}

          <DialogFooter className={`flex justify-between ${showAddStep && createStep === "steps" ? "hidden" : ""}`}>
            {createStep === "steps" && !showAddStep && (
              <Button variant="ghost" onClick={() => setCreateStep("info")}>← 返回基本信息</Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={resetForm}>取消</Button>
              {createStep === "info" ? (
                <Button
                  disabled={!compCode || !compName}
                  onClick={() => setCreateStep("steps")}
                >
                  下一步: 配置步骤 →
                </Button>
              ) : (
                <Button
                  disabled={nodes.length === 0 || createMutation.isPending}
                  onClick={handleCreate}
                >
                  {createMutation.isPending ? "创建中..." : `创建编排 (${nodes.length} 步骤)`}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加步骤对话框已内嵌到新建编排对话框中，不再使用独立 Dialog */}

      {/* ━━━━━━━━━━ 查看编排详情对话框 ━━━━━━━━━━ */}
      <Dialog open={!!viewCompCode} onOpenChange={(open) => { if (!open) setViewCompCode(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          {viewQuery.isLoading ? (
            <div className="space-y-4 py-8">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : viewQuery.data ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewQuery.data.compName}
                  <Badge variant={viewQuery.data.status === "active" ? "default" : "secondary"}>
                    {viewQuery.data.status === "active" ? "启用" : "草稿"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="space-y-1">
                  <span className="font-mono text-xs">{viewQuery.data.compCode}</span>
                  {viewQuery.data.description && (
                    <span className="block">{viewQuery.data.description}</span>
                  )}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="flex-1 max-h-[500px]">
                <div className="space-y-4 pr-3">
                  {/* 流程图 */}
                  <div>
                    <h3 className="text-sm font-semibold mb-3">执行流程</h3>
                    <div className="space-y-1">
                      {(viewQuery.data.steps?.nodes || [])
                        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                        .map((node: any, idx: number) => (
                        <div key={node.id} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </div>
                            {idx < (viewQuery.data.steps?.nodes?.length || 0) - 1 && (
                              <div className="w-px h-6 bg-border mt-1" />
                            )}
                          </div>
                          <div className="flex-1 bg-muted/40 rounded-lg px-4 py-2.5 border border-border/50">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{getAlgoLabel(node.algo_code)}</span>
                              <Badge variant="outline" className="text-[10px]">
                                {getAlgoCategory(node.algo_code)}
                              </Badge>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{node.algo_code}</span>
                            {node.config_overrides && Object.keys(node.config_overrides).length > 0 && (
                              <div className="mt-1.5 text-xs text-muted-foreground">
                                配置覆盖: {JSON.stringify(node.config_overrides)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 元信息 */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">版本:</span>{" "}
                      <span className="font-mono">{viewQuery.data.version || "v1.0.0"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">创建时间:</span>{" "}
                      {viewQuery.data.createdAt ? new Date(viewQuery.data.createdAt).toLocaleString("zh-CN") : "-"}
                    </div>
                    {viewQuery.data.applicableDeviceTypes?.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">适用设备:</span>{" "}
                        {viewQuery.data.applicableDeviceTypes.join(", ")}
                      </div>
                    )}
                    {viewQuery.data.applicableScenarios?.length > 0 && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">适用场景:</span>{" "}
                        {viewQuery.data.applicableScenarios.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              <DialogFooter>
                <Button variant="outline" onClick={() => setViewCompCode(null)}>关闭</Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">编排不存在或已被删除</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 执行记录页面
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AlgorithmExecutionPage() {
  const [, navigate] = useLocation();
  const executionsQuery = trpc.algorithm.listExecutions.useQuery({ pageSize: 50 });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">执行记录</span>
      </div>

      <div>
        <h1 className="text-xl font-bold">📝 执行记录</h1>
        <p className="text-muted-foreground mt-1">所有算法执行的历史记录和结果追踪</p>
      </div>

      <Card>
        <CardContent className="p-4">
          {executionsQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : executionsQuery.data?.items && executionsQuery.data.items.length > 0 ? (
            <div className="text-sm text-muted-foreground">
              共 {executionsQuery.data.items.length} 条执行记录
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-2xl mb-3">📝</div>
              <h3 className="text-base font-medium">暂无执行记录</h3>
              <p className="text-sm text-muted-foreground mt-1">执行算法后，记录将自动出现在这里</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
