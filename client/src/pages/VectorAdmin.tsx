import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/common/Toast';
import {
  Database, Search, Settings, RefreshCw, Loader2, Eye, Trash2,
  BarChart3, Zap, Box, Layers, Target, Activity, Info,
  ChevronRight, Download, Copy, CircleDot, AlertCircle
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import * as qdrant from '@/services/qdrant';
import {
  vectorsToProjectedPoints,
  clusterProjectedPoints,
  type ReductionMethod,
  type ClusterResult
} from '@/services/dimensionReduction';

// 向量点信息（用于可视化）
interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
  score?: number;
}

// 2D 投影点
interface ProjectedPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  category?: string;
}

export default function VectorAdmin() {
  const toast = useToast();

  // 状态
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedCollectionName, setSelectedCollectionName] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');

  // 向量可视化数据（仍需 Qdrant 直连获取原始向量）
  const [vectors, setVectors] = useState<VectorPoint[]>([]);
  const [projectedPoints, setProjectedPoints] = useState<ProjectedPoint[]>([]);
  const [loadingVectors, setLoadingVectors] = useState(false);
  const [computing, setComputing] = useState(false);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [topK, setTopK] = useState(5);

  // 向量详情
  const [selectedVector, setSelectedVector] = useState<any>(null);
  const [showVectorDialog, setShowVectorDialog] = useState(false);
  const [editingPayload, setEditingPayload] = useState('');

  // 降维和聚类
  const [reductionMethod, setReductionMethod] = useState<ReductionMethod>('pca');
  const [clusterCount, setClusterCount] = useState(3);
  const [clusterResult, setClusterResult] = useState<ClusterResult | null>(null);
  const [showClusters, setShowClusters] = useState(false);

  // ━━━ tRPC Queries ━━━
  const qdrantStatusQuery = trpc.knowledge.qdrantStatus.useQuery(undefined, {
    refetchInterval: 30000
  });
  const collectionsQuery = trpc.knowledge.listCollections.useQuery();
  const knowledgePointsQuery = trpc.knowledge.list.useQuery(
    { collectionId: selectedCollectionId!, limit: 200 },
    { enabled: selectedCollectionId !== null }
  );
  const statsQuery = trpc.knowledge.stats.useQuery(
    { collectionId: selectedCollectionId! },
    { enabled: selectedCollectionId !== null }
  );

  // 搜索 — 使用 tRPC
  const searchMutation = trpc.knowledge.search.useQuery(
    { query: searchQuery, collectionId: selectedCollectionId!, limit: topK, useVector: true },
    { enabled: false } // 手动触发
  );

  // ━━━ tRPC Mutations ━━━
  const deleteMutation = trpc.knowledge.delete.useMutation({
    onSuccess: () => {
      toast.success('知识点已删除');
      knowledgePointsQuery.refetch();
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`)
  });

  // ━━━ 数据 ━━━
  const qdrantStatus = qdrantStatusQuery.data;
  const collections = collectionsQuery.data || [];
  const knowledgePoints = knowledgePointsQuery.data || [];
  const stats = statsQuery.data;

  // 自动选择第一个集合
  if (selectedCollectionId === null && collections.length > 0) {
    setSelectedCollectionId(collections[0].id);
    setSelectedCollectionName(collections[0].name);
  }

  // 选择集合
  const handleSelectCollection = (idStr: string) => {
    const id = Number(idStr);
    const col = collections.find((c: any) => c.id === id);
    setSelectedCollectionId(id);
    setSelectedCollectionName(col?.name || '');
  };

  // 统计信息
  const overviewStats = useMemo(() => ({
    collectionsCount: collections.length,
    totalPoints: stats?.pointsCount || 0,
    totalDocuments: stats?.documentsCount || 0,
    totalNodes: stats?.nodesCount || 0
  }), [collections, stats]);

  // 类别颜色映射
  const categoryColors: Record<string, string> = {
    '轴承故障': '#ef4444', '齿轮故障': '#f97316', '电机故障': '#eab308',
    '泵故障': '#22c55e', 'default': '#3b82f6'
  };

  // ━━━ 向量可视化（保留 Qdrant 直连，因后端不返回向量数据）━━━
  const loadVectors = async (collectionName: string, method: ReductionMethod = reductionMethod) => {
    if (!collectionName) return;
    setLoadingVectors(true);
    setComputing(true);
    try {
      const points = await qdrant.getAllVectorPoints(collectionName, 100);
      const vectorPoints: VectorPoint[] = points.map((p, idx) => ({
        id: p.id || `point-${idx}`,
        vector: p.vector || [],
        payload: p.payload as Record<string, any>
      }));
      setVectors(vectorPoints);

      let projected: ProjectedPoint[] = [];
      if (vectorPoints.length > 0 && vectorPoints[0].vector.length > 0) {
        projected = vectorsToProjectedPoints(
          points.map(p => ({ id: p.id, vector: p.vector, payload: p.payload as Record<string, any> })),
          { method }
        );
        setProjectedPoints(projected);
        toast.success(`已加载 ${vectorPoints.length} 个向量点，使用 ${method.toUpperCase()} 降维`);
      } else {
        projected = vectorPoints.map(p => {
          const h1 = hashString(p.id + 'x'), h2 = hashString(p.id + 'y');
          return { id: p.id, x: (h1 % 1000) / 10, y: (h2 % 1000) / 10, label: p.payload.title || p.id, category: p.payload.category || 'default' };
        });
        setProjectedPoints(projected);
        toast.success(`已加载 ${vectorPoints.length} 个向量点（无向量数据，使用简单投影）`);
      }

      if (showClusters && projected.length >= clusterCount) {
        setClusterResult(clusterProjectedPoints(projected, clusterCount));
      }
    } catch (error) {
      console.error('加载向量数据失败:', error);
      toast.error('加载向量数据失败（请确保 Qdrant 可直连）');
    } finally {
      setLoadingVectors(false);
      setComputing(false);
    }
  };

  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash = hash & hash; }
    return Math.abs(hash);
  };

  // ━━━ 搜索（走 tRPC）━━━
  const handleSearch = async () => {
    if (!searchQuery.trim() || selectedCollectionId === null) {
      toast.error('请输入搜索内容并选择集合');
      return;
    }
    searchMutation.refetch();
  };

  // 查看详情
  const viewDetails = (item: any) => {
    setSelectedVector(item);
    setEditingPayload(JSON.stringify(item.payload || item, null, 2));
    setShowVectorDialog(true);
  };

  // 导出 CSV
  const exportToCSV = () => {
    if (projectedPoints.length === 0) { toast.error('没有可导出的数据'); return; }
    const headers = ['ID', '标题', 'X坐标', 'Y坐标', '类别', '聚类ID', '降维算法'];
    const rows = projectedPoints.map((point, idx) => {
      const clusterId = showClusters && clusterResult ? clusterResult.assignments[idx] + 1 : '';
      return [point.id, `"${(point.label || '').replace(/"/g, '""')}"`, point.x.toFixed(4), point.y.toFixed(4), point.category || '', clusterId, reductionMethod.toUpperCase()].join(',');
    });
    const blob = new Blob([`\uFEFF${[headers.join(','), ...rows].join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vectors_${selectedCollectionName}_${reductionMethod}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${projectedPoints.length} 条向量数据`);
  };

  // 搜索结果
  const searchResults = searchMutation.data || [];

  return (
    <MainLayout title="向量管理后台">
      <PageCard
        title="向量管理后台"
        icon={<Database className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={qdrantStatus?.connected ? 'default' : 'destructive'}>
              {qdrantStatus?.connected ? '已连接' : '离线'}
            </Badge>
            <Select
              value={selectedCollectionId?.toString() || ''}
              onValueChange={handleSelectCollection}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="选择集合" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { collectionsQuery.refetch(); qdrantStatusQuery.refetch(); }}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
          </div>
        }
        className="min-h-[calc(100vh-120px)]"
      >
        {!qdrantStatus?.connected ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="w-16 h-16 mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">无法连接到 Qdrant</h3>
            <p className="text-sm mb-4">请确保 Qdrant 向量数据库服务正在运行</p>
            <Button onClick={() => qdrantStatusQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" /> 重试连接
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 max-w-2xl">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> 统计概览
              </TabsTrigger>
              <TabsTrigger value="visualize" className="flex items-center gap-2">
                <CircleDot className="w-4 h-4" /> 向量可视化
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="w-4 h-4" /> 检索测试
              </TabsTrigger>
              <TabsTrigger value="manage" className="flex items-center gap-2">
                <Settings className="w-4 h-4" /> 向量管理
              </TabsTrigger>
            </TabsList>

            {/* ━━━ 统计概览 ━━━ */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">集合数量</p>
                        <p className="text-3xl font-bold text-blue-500">{overviewStats.collectionsCount}</p>
                      </div>
                      <Layers className="w-10 h-10 text-blue-500/50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">知识点数</p>
                        <p className="text-3xl font-bold text-green-500">{overviewStats.totalPoints}</p>
                      </div>
                      <Target className="w-10 h-10 text-green-500/50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">文档数</p>
                        <p className="text-3xl font-bold text-purple-500">{overviewStats.totalDocuments}</p>
                      </div>
                      <Box className="w-10 h-10 text-purple-500/50" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">图谱节点</p>
                        <p className="text-3xl font-bold text-orange-500">{overviewStats.totalNodes}</p>
                      </div>
                      <Activity className="w-10 h-10 text-orange-500/50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 集合列表 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" /> 向量集合
                  </CardTitle>
                  <CardDescription>所有知识库向量集合的详细信息</CardDescription>
                </CardHeader>
                <CardContent>
                  {collections.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无向量集合</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {collections.map((col: any) => (
                        <div key={col.id} className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">{col.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {col.description || '无描述'} · 创建于 {new Date(col.createdAt).toLocaleDateString('zh-CN')}
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => {
                            handleSelectCollection(col.id.toString());
                            setActiveTab('manage');
                          }}>
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 嵌入模型信息 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5" /> 嵌入模型</CardTitle>
                  <CardDescription>当前使用的文本嵌入模型配置</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">模型名称</p>
                      <p className="font-medium">nomic-embed-text</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">输出维度</p>
                      <p className="font-medium">768</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">距离度量</p>
                      <p className="font-medium">Cosine</p>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-1">服务状态</p>
                      <p className="font-medium text-green-500">运行中</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ━━━ 向量可视化（保留 Qdrant 直连获取向量数据）━━━ */}
            <TabsContent value="visualize" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CircleDot className="w-5 h-5" /> 向量分布可视化
                      </CardTitle>
                      <CardDescription>使用降维算法将高维向量投影到 2D 平面</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={reductionMethod} onValueChange={(v: ReductionMethod) => {
                        setReductionMethod(v);
                        if (selectedCollectionName) loadVectors(selectedCollectionName, v);
                      }}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="算法" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pca">PCA</SelectItem>
                          <SelectItem value="tsne">t-SNE</SelectItem>
                          <SelectItem value="umap">UMAP</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => loadVectors(selectedCollectionName)} disabled={loadingVectors || computing || !selectedCollectionName}>
                        {loadingVectors || computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        <span className="ml-1">加载向量</span>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setShowClusters(!showClusters);
                        if (!showClusters && projectedPoints.length >= clusterCount) {
                          setClusterResult(clusterProjectedPoints(projectedPoints, clusterCount));
                        }
                      }}>
                        {showClusters ? '隐藏聚类' : '显示聚类'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportToCSV} disabled={projectedPoints.length === 0}>
                        <Download className="w-4 h-4 mr-1" /> 导出
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {projectedPoints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <CircleDot className="w-16 h-16 mb-4 opacity-50" />
                      <p>选择集合后点击"加载向量"查看可视化</p>
                    </div>
                  ) : (
                    <div className="relative w-full h-[500px] bg-muted/30 rounded-lg overflow-hidden border">
                      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.1" opacity="0.1" />
                          </pattern>
                        </defs>
                        <rect width="100" height="100" fill="url(#grid)" />
                        {projectedPoints.map((point, idx) => {
                          const color = showClusters && clusterResult
                            ? clusterResult.clusters[clusterResult.assignments[idx]]?.color || '#3b82f6'
                            : categoryColors[point.category || ''] || categoryColors.default;
                          return (
                            <g key={point.id}>
                              <circle
                                cx={point.x} cy={point.y} r="1.5" fill={color}
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => {
                                  const v = vectors.find(v => v.id === point.id);
                                  if (v) viewDetails(v);
                                }}
                              >
                                <title>{point.label}{showClusters && clusterResult ? ` (聚类 ${clusterResult.assignments[idx] + 1})` : ''}</title>
                              </circle>
                            </g>
                          );
                        })}
                      </svg>
                      <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm rounded-lg p-3 border max-w-xs">
                        {showClusters && clusterResult ? (
                          <>
                            <p className="text-xs font-medium mb-2">聚类图例</p>
                            <div className="space-y-1">
                              {clusterResult.clusters.map((cluster) => (
                                <div key={cluster.id} className="flex items-center gap-2 text-xs">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cluster.color }} />
                                  <span>聚类 {cluster.id + 1} ({cluster.size} 个)</span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-xs font-medium mb-2">类别图例</p>
                            <div className="space-y-1">
                              {Object.entries(categoryColors).filter(([k]) => k !== 'default').map(([cat, color]) => (
                                <div key={cat} className="flex items-center gap-2 text-xs">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                  <span>{cat}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {showClusters && clusterResult && (
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
                      {clusterResult.clusters.map((cluster) => {
                        const rep = projectedPoints.find(p => p.id === cluster.representativePoint);
                        return (
                          <div key={cluster.id} className="p-3 rounded-lg border" style={{ borderColor: cluster.color, backgroundColor: `${cluster.color}10` }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cluster.color }} />
                              <span className="text-sm font-medium">聚类 {cluster.id + 1}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{cluster.size} 个知识点</p>
                            {rep && <p className="text-xs mt-1 truncate" title={rep.label}>代表: {rep.label}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 text-sm text-muted-foreground">
                    <Info className="w-4 h-4 inline mr-1" />
                    点击数据点查看详情。当前显示 {projectedPoints.length} 个向量点，使用 {reductionMethod.toUpperCase()} 降维算法。
                    {computing && <span className="ml-2 text-yellow-500">(正在计算...)</span>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ━━━ 检索测试（走 tRPC）━━━ */}
            <TabsContent value="search" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Search className="w-5 h-5" /> 向量检索测试</CardTitle>
                  <CardDescription>输入查询文本，测试语义相似度搜索效果（通过后端 RAG 搜索）</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Select value={selectedCollectionId?.toString() || ''} onValueChange={handleSelectCollection}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="选择集合" /></SelectTrigger>
                      <SelectContent>
                        {collections.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Top-K:</span>
                      <Input type="number" value={topK} onChange={(e) => setTopK(parseInt(e.target.value) || 5)} className="w-20" min={1} max={20} />
                    </div>
                  </div>
                  <Textarea
                    placeholder="输入查询文本，例如：轴承故障诊断方法..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="min-h-24"
                  />
                  <Button onClick={handleSearch} disabled={searchMutation.isFetching} className="w-full">
                    {searchMutation.isFetching ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 搜索中...</>
                    ) : (
                      <><Search className="w-4 h-4 mr-2" /> 执行语义搜索</>
                    )}
                  </Button>

                  {(searchResults as any[]).length > 0 && (
                    <div className="space-y-3 mt-4">
                      <h4 className="font-medium">搜索结果 ({(searchResults as any[]).length})</h4>
                      {(searchResults as any[]).map((result: any, idx: number) => (
                        <div key={result.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => viewDetails(result)}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">#{idx + 1}</Badge>
                                <span className="font-medium">{result.title || result.id}</span>
                                {result.score !== undefined && (
                                  <Badge variant="secondary">相似度: {(result.score * 100).toFixed(1)}%</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {result.content?.substring(0, 200)}...
                              </p>
                            </div>
                            <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ━━━ 向量管理（走 tRPC）━━━ */}
            <TabsContent value="manage" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> 知识点管理</CardTitle>
                      <CardDescription>查看和删除知识点数据（通过后端 API）</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => knowledgePointsQuery.refetch()} disabled={knowledgePointsQuery.isFetching}>
                      {knowledgePointsQuery.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedCollectionId ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Box className="w-16 h-16 mb-4 opacity-50" />
                      <p>请选择一个集合</p>
                    </div>
                  ) : knowledgePointsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (knowledgePoints as any[]).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Box className="w-16 h-16 mb-4 opacity-50" />
                      <p>该集合暂无知识点</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2">
                        {(knowledgePoints as any[]).map((kp: any, idx: number) => (
                          <div key={kp.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-sm font-medium">{idx + 1}</div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{kp.title || `知识点 #${kp.id}`}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {kp.category || '未分类'} · {kp.source || '未知来源'} · ID: {kp.id}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => viewDetails(kp)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                                onClick={() => { if (confirm('确定要删除这个知识点吗？')) deleteMutation.mutate({ id: kp.id }); }}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* 详情对话框 */}
        <Dialog open={showVectorDialog} onOpenChange={setShowVectorDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Info className="w-5 h-5" /> 详情</DialogTitle>
            </DialogHeader>
            {selectedVector && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">ID</p>
                    <p className="font-mono text-sm">{selectedVector.id}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">相似度</p>
                    <p className="font-medium">
                      {selectedVector.score !== undefined ? `${(selectedVector.score * 100).toFixed(2)}%` : 'N/A'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-2">数据内容</p>
                  <Textarea value={editingPayload} onChange={(e) => setEditingPayload(e.target.value)} className="font-mono text-sm min-h-64" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowVectorDialog(false)}>关闭</Button>
                  <Button variant="outline" onClick={() => { navigator.clipboard.writeText(editingPayload); toast.success('已复制到剪贴板'); }}>
                    <Copy className="w-4 h-4 mr-2" /> 复制
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </PageCard>
    </MainLayout>
  );
}
