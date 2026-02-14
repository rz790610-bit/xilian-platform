import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_META: Record<string, { label: string; icon: string; desc: string }> = {
  signal: { label: "信号处理", icon: "📉", desc: "FFT 频谱分析、STFT 短时傅里叶、小波分析、包络分析、带通滤波、小波降噪、倒频谱、阶次分析" },
  feature: { label: "特征工程", icon: "🔧", desc: "统计特征提取（22维）、归一化/标准化、对数变换、分箱离散化" },
  ml: { label: "机器学习", icon: "🧠", desc: "K-Means 聚类、随机森林、SVM、XGBoost、逻辑回归" },
  anomaly: { label: "异常检测", icon: "⚠️", desc: "Z-Score、孤立森林、IQR、LOF、DBSCAN" },
  predict: { label: "预测性维护", icon: "🔮", desc: "RUL 预测、健康指数计算、退化建模" },
  compose: { label: "算法编排", icon: "🔗", desc: "将多个原子算法组合为场景化方案" },
  execution: { label: "执行记录", icon: "📝", desc: "查看所有算法的执行历史和结果" },
};

// 路由参数到后端分类的映射
const ROUTE_TO_CATEGORY: Record<string, string> = {
  signal: "signal_processing",
  feature: "feature_engineering",
  ml: "machine_learning",
  anomaly: "anomaly_detection",
  predict: "predictive_maintenance",
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
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
                key={algo.id}
                className="cursor-pointer hover:shadow-md transition-shadow group"
                onClick={() => navigate(`/algorithm/detail/${algo.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base group-hover:text-primary transition-colors">
                      {algo.label}
                    </CardTitle>
                    <Badge variant={implMeta.variant}>{implMeta.label}</Badge>
                  </div>
                  <CardDescription className="font-mono text-xs">{algo.id}</CardDescription>
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
            <div className="text-4xl mb-4">{meta?.icon || "📦"}</div>
            <h3 className="text-lg font-medium">暂无{meta?.label}算法</h3>
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
          <h1 className="text-2xl font-bold">🔗 算法编排</h1>
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
            <div className="text-4xl mb-4">🔗</div>
            <h3 className="text-lg font-medium">暂无算法编排</h3>
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
        <h1 className="text-2xl font-bold">📝 执行记录</h1>
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
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-lg font-medium">暂无执行记录</h3>
              <p className="text-sm text-muted-foreground mt-1">执行算法后，记录将自动出现在这里</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
