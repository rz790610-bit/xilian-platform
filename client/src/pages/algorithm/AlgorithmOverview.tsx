import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

// 分类元数据
const CATEGORY_META: Record<string, { label: string; icon: string; color: string; desc: string }> = {
  signal_processing: { label: "信号处理", icon: "📉", color: "bg-blue-500/10 text-blue-600 border-blue-200", desc: "FFT、小波、包络、滤波等时频域分析" },
  feature_engineering: { label: "特征工程", icon: "🔧", color: "bg-amber-500/10 text-amber-600 border-amber-200", desc: "统计特征提取、归一化、降维" },
  machine_learning: { label: "机器学习", icon: "🧠", color: "bg-purple-500/10 text-purple-600 border-purple-200", desc: "分类、回归、聚类、集成学习" },
  deep_learning: { label: "深度学习", icon: "🔮", color: "bg-pink-500/10 text-pink-600 border-pink-200", desc: "CNN、LSTM、Transformer、自编码器" },
  anomaly_detection: { label: "异常检测", icon: "⚠️", color: "bg-red-500/10 text-red-600 border-red-200", desc: "Z-Score、孤立森林、LOF、DBSCAN" },
  predictive_maintenance: { label: "预测性维护", icon: "🔮", color: "bg-green-500/10 text-green-600 border-green-200", desc: "RUL预测、健康指数、退化建模" },
  optimization: { label: "优化算法", icon: "⚡", color: "bg-cyan-500/10 text-cyan-600 border-cyan-200", desc: "阈值优化、参数调优、约束优化" },
  statistical_analysis: { label: "统计分析", icon: "📊", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200", desc: "分布检验、相关性、趋势分析" },
  time_series: { label: "时序分析", icon: "📈", color: "bg-teal-500/10 text-teal-600 border-teal-200", desc: "ARIMA、Prophet、季节分解" },
};

// 实现类型标签
const IMPL_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  builtin: { label: "内置", variant: "default" },
  pipeline_node: { label: "Pipeline", variant: "secondary" },
  plugin: { label: "插件", variant: "outline" },
  external: { label: "外部服务", variant: "destructive" },
  kg_operator: { label: "KG算子", variant: "outline" },
};

export default function AlgorithmOverview() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  // 从后端获取数据
  const overviewQuery = trpc.algorithm.getOverviewStats.useQuery();
  const listQuery = trpc.algorithm.listDefinitions.useQuery({
    category: activeCategory === "all" ? undefined : activeCategory,
    search: search || undefined,
  });

  const overview = overviewQuery.data;
  const algorithms = listQuery.data?.items;

  return (
    <MainLayout title="算法库">
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">算法库</h1>
          <p className="text-muted-foreground mt-1">
            统一管理平台算法资产，支持信号处理、机器学习、异常检测等 9 大领域
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {overviewQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">算法总数</div>
                <div className="text-3xl font-bold mt-1">{overview?.totalDefinitions ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">{overview?.categoryBreakdown?.length ?? 0} 个分类</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">算法组合</div>
                <div className="text-3xl font-bold mt-1 text-blue-600">{overview?.totalCompositions ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">算法组合</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">执行次数</div>
                <div className="text-3xl font-bold mt-1 text-purple-600">{overview?.totalExecutions ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">历史执行</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">活跃绑定</div>
                <div className="text-3xl font-bold mt-1 text-green-600">{overview?.totalBindings ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-1">设备关联</div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 分类导航 + 搜索 */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="搜索算法名称、描述..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            全部
          </TabsTrigger>
          {Object.entries(CATEGORY_META).map(([key, meta]) => (
            <TabsTrigger
              key={key}
              value={key}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {meta.icon} {meta.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 算法卡片列表 */}
        <TabsContent value={activeCategory} className="mt-4">
          {listQuery.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
              ))}
            </div>
          ) : algorithms && algorithms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {algorithms.map((algo: any) => {
                const catMeta = CATEGORY_META[algo.category] || { label: algo.category, icon: "📦", color: "bg-gray-100 text-gray-600 border-gray-200", desc: "" };
                const implMeta = IMPL_LABELS[algo.implType] || { label: algo.implType, variant: "outline" as const };
                return (
                  <Card
                    key={algo.id}
                    className="cursor-pointer hover:shadow-md transition-shadow group"
                    onClick={() => navigate(`/algorithm/detail/${algo.id}`)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{catMeta.icon}</span>
                          <CardTitle className="text-base group-hover:text-primary transition-colors">
                            {algo.label}
                          </CardTitle>
                        </div>
                        <Badge variant={implMeta.variant}>{implMeta.label}</Badge>
                      </div>
                      <CardDescription className="text-xs mt-1">
                        {algo.id}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {algo.description || catMeta.desc}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={catMeta.color}>
                          {catMeta.label}
                        </Badge>
                        {algo.applicableDeviceTypes?.slice(0, 2).map((dt: string) => (
                          <Badge key={dt} variant="outline" className="text-xs">
                            {dt}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium">未找到匹配的算法</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? `没有与 "${search}" 匹配的算法` : "当前分类下暂无算法"}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 分类概览卡片 */}
      {activeCategory === "all" && !search && (
        <div>
          <h2 className="text-lg font-semibold mb-4">按领域浏览</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const count = algorithms?.filter((a: any) => a.category === key).length ?? 0;
              return (
                <Card
                  key={key}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setActiveCategory(key)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${meta.color}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{meta.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{meta.desc}</div>
                      </div>
                      <div className="text-2xl font-bold text-muted-foreground">{count}</div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </MainLayout>
  );
}
