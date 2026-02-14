import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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

// 路由参数到后端分类的映射
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

export default function AlgorithmCategory() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/algorithm/:category");
  const category = params?.category || "signal";
  const meta = CATEGORY_META[category];
  const backendCategory = ROUTE_TO_CATEGORY[category];

  // 获取该分类下的算法列表
  const listQuery = trpc.algorithm.listDefinitions.useQuery(
    { category: backendCategory },
    { enabled: !!backendCategory }
  );

  // 特殊页面：编排和执行记录
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
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">{meta?.label || category}</span>
      </div>

      {/* 分类标题 */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <span>{meta?.icon}</span> {meta?.label || category}
        </h1>
        <p className="text-muted-foreground mt-1">{meta?.desc}</p>
      </div>

      {/* 算法列表 */}
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
                onClick={() => navigate(`/algorithm/detail/${algo.algoCode}`)}
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

// 算法编排页面
function AlgorithmComposePage() {
  const [, navigate] = useLocation();
  const compositionsQuery = trpc.algorithm.listCompositions.useQuery({});

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span className="text-foreground font-medium">算法编排</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">🔗 算法编排</h1>
          <p className="text-muted-foreground mt-1">将多个原子算法组合为场景化诊断方案</p>
        </div>
        <Button onClick={() => {/* TODO: 新建编排 */}}>
          + 新建编排
        </Button>
      </div>

      {compositionsQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : compositionsQuery.data && compositionsQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {compositionsQuery.data.map((comp: any) => (
            <Card key={comp.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-base">{comp.name}</CardTitle>
                <CardDescription>{comp.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{comp.steps?.length || 0} 个步骤</Badge>
                  <Badge variant={comp.status === "active" ? "default" : "secondary"}>
                    {comp.status === "active" ? "启用" : "草稿"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-2xl mb-3">🔗</div>
            <h3 className="text-base font-medium">暂无算法编排</h3>
            <p className="text-sm text-muted-foreground mt-1">
              创建编排可以将 FFT → 特征提取 → 异常检测 等多个算法串联为自动化流程
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 执行记录页面
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
