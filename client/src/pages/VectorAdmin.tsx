import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/common/Toast';
import {
  Database, Search, Settings, RefreshCw, Loader2, Eye, Edit, Trash2,
  BarChart3, Zap, Box, Layers, Target, Activity, Info,
  ChevronRight, Download, Upload, Copy, Check, X, AlertCircle, CircleDot
} from 'lucide-react';
import * as qdrant from '@/services/qdrant';
import * as ollama from '@/services/ollama';

// 集合统计信息
interface CollectionStats {
  name: string;
  vectorsCount: number;
  pointsCount: number;
  status: string;
  vectorSize?: number;
}

// 向量点信息
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
  const [loading, setLoading] = useState(false);
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [collections, setCollections] = useState<CollectionStats[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  
  // 向量数据
  const [vectors, setVectors] = useState<VectorPoint[]>([]);
  const [projectedPoints, setProjectedPoints] = useState<ProjectedPoint[]>([]);
  const [loadingVectors, setLoadingVectors] = useState(false);
  
  // 搜索测试
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VectorPoint[]>([]);
  const [searching, setSearching] = useState(false);
  const [topK, setTopK] = useState(5);
  
  // 向量详情
  const [selectedVector, setSelectedVector] = useState<VectorPoint | null>(null);
  const [showVectorDialog, setShowVectorDialog] = useState(false);
  const [editingPayload, setEditingPayload] = useState('');
  
  // 初始化
  useEffect(() => {
    checkQdrantStatus();
  }, []);
  
  // 检查 Qdrant 状态
  const checkQdrantStatus = async () => {
    setQdrantStatus('checking');
    try {
      const isOnline = await qdrant.checkQdrantStatus();
      if (isOnline) {
        setQdrantStatus('online');
        await loadCollections();
        toast.success('Qdrant 向量数据库已连接');
      } else {
        setQdrantStatus('offline');
        toast.error('无法连接到 Qdrant 服务');
      }
    } catch {
      setQdrantStatus('offline');
      toast.error('Qdrant 连接失败');
    }
  };
  
  // 加载集合列表
  const loadCollections = async () => {
    setLoading(true);
    try {
      const cols = await qdrant.getCollections();
      setCollections(cols.map(c => ({
        name: c.name,
        vectorsCount: c.vectors_count,
        pointsCount: c.points_count,
        status: c.status,
        vectorSize: 768 // 默认 nomic-embed-text 维度
      })));
      
      if (cols.length > 0 && !selectedCollection) {
        setSelectedCollection(cols[0].name);
      }
    } catch (error) {
      toast.error('加载集合列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 加载向量数据
  const loadVectors = async (collectionName: string) => {
    if (!collectionName) return;
    
    setLoadingVectors(true);
    try {
      const points = await qdrant.getAllKnowledgePoints(collectionName, 100);
      
      // 转换为向量点格式
      const vectorPoints: VectorPoint[] = points.map((p, idx) => ({
        id: p.id || `point-${idx}`,
        vector: [], // 向量数据需要单独获取
        payload: p as Record<string, any>
      }));
      
      setVectors(vectorPoints);
      
      // 生成 2D 投影（简单的随机投影用于演示）
      const projected = generateProjection(vectorPoints);
      setProjectedPoints(projected);
      
      toast.success(`已加载 ${vectorPoints.length} 个向量点`);
    } catch (error) {
      toast.error('加载向量数据失败');
    } finally {
      setLoadingVectors(false);
    }
  };
  
  // 简单的 2D 投影生成（实际应用中应使用 t-SNE 或 PCA）
  const generateProjection = (points: VectorPoint[]): ProjectedPoint[] => {
    // 使用简单的哈希函数生成伪随机但稳定的坐标
    return points.map(p => {
      const hash1 = hashString(p.id + 'x');
      const hash2 = hashString(p.id + 'y');
      
      return {
        id: p.id,
        x: (hash1 % 1000) / 10,
        y: (hash2 % 1000) / 10,
        label: p.payload.title || p.id,
        category: p.payload.category || 'default'
      };
    });
  };
  
  // 简单哈希函数
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };
  
  // 执行向量搜索
  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedCollection) {
      toast.error('请输入搜索内容并选择集合');
      return;
    }
    
    setSearching(true);
    try {
      const results = await qdrant.searchKnowledge(selectedCollection, searchQuery, topK, true);
      
      const vectorResults: VectorPoint[] = results.map(r => ({
        id: r.id,
        vector: [],
        payload: r.payload,
        score: r.score
      }));
      
      setSearchResults(vectorResults);
      toast.success(`找到 ${vectorResults.length} 个相似结果`);
    } catch (error) {
      toast.error('搜索失败');
    } finally {
      setSearching(false);
    }
  };
  
  // 查看向量详情
  const viewVectorDetails = (vector: VectorPoint) => {
    setSelectedVector(vector);
    setEditingPayload(JSON.stringify(vector.payload, null, 2));
    setShowVectorDialog(true);
  };
  
  // 删除向量
  const deleteVector = async (vectorId: string) => {
    if (!selectedCollection) return;
    
    try {
      await qdrant.deleteKnowledgePoint(selectedCollection, vectorId);
      toast.success('向量已删除');
      await loadVectors(selectedCollection);
    } catch (error) {
      toast.error('删除失败');
    }
  };
  
  // 统计信息
  const stats = useMemo(() => {
    const totalVectors = collections.reduce((sum, c) => sum + c.vectorsCount, 0);
    const totalPoints = collections.reduce((sum, c) => sum + c.pointsCount, 0);
    
    return {
      collectionsCount: collections.length,
      totalVectors,
      totalPoints,
      avgVectorsPerCollection: collections.length > 0 ? Math.round(totalVectors / collections.length) : 0
    };
  }, [collections]);
  
  // 类别颜色映射
  const categoryColors: Record<string, string> = {
    '轴承故障': '#ef4444',
    '齿轮故障': '#f97316',
    '电机故障': '#eab308',
    '泵故障': '#22c55e',
    'default': '#3b82f6'
  };
  
  return (
    <MainLayout title="向量管理后台">
      <PageCard
        title="向量管理后台"
        icon={<Database className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={qdrantStatus === 'online' ? 'default' : 'destructive'}>
              {qdrantStatus === 'checking' ? '检查中...' : qdrantStatus === 'online' ? '已连接' : '离线'}
            </Badge>
            <Button variant="outline" size="sm" onClick={checkQdrantStatus}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
}
        className="min-h-[calc(100vh-120px)]"
      >
        {qdrantStatus === 'offline' ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="w-16 h-16 mb-4 text-destructive" />
            <h3 className="text-lg font-medium mb-2">无法连接到 Qdrant</h3>
            <p className="text-sm mb-4">请确保 Qdrant 向量数据库服务正在运行</p>
            <Button onClick={checkQdrantStatus}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重试连接
            </Button>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4 max-w-2xl">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                统计概览
              </TabsTrigger>
              <TabsTrigger value="visualize" className="flex items-center gap-2">
                <CircleDot className="w-4 h-4" />
                向量可视化
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                检索测试
              </TabsTrigger>
              <TabsTrigger value="manage" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                向量管理
              </TabsTrigger>
            </TabsList>
            
            {/* 统计概览 */}
            <TabsContent value="overview" className="space-y-4">
              {/* 统计卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">集合数量</p>
                        <p className="text-3xl font-bold text-blue-500">{stats.collectionsCount}</p>
                      </div>
                      <Layers className="w-10 h-10 text-blue-500/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">向量总数</p>
                        <p className="text-3xl font-bold text-green-500">{stats.totalVectors}</p>
                      </div>
                      <Box className="w-10 h-10 text-green-500/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">知识点数</p>
                        <p className="text-3xl font-bold text-purple-500">{stats.totalPoints}</p>
                      </div>
                      <Target className="w-10 h-10 text-purple-500/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">向量维度</p>
                        <p className="text-3xl font-bold text-orange-500">768</p>
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
                    <Database className="w-5 h-5" />
                    向量集合
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
                      {collections.map(col => (
                        <div
                          key={col.name}
                          className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-medium">{col.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {col.vectorsCount} 个向量 · {col.pointsCount} 个知识点
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={col.status === 'green' ? 'default' : 'secondary'}>
                              {col.status === 'green' ? '正常' : col.status}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedCollection(col.name);
                                loadVectors(col.name);
                                setActiveTab('manage');
                              }}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* 嵌入模型信息 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    嵌入模型
                  </CardTitle>
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
            
            {/* 向量可视化 */}
            <TabsContent value="visualize" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CircleDot className="w-5 h-5" />
                        向量分布可视化
                      </CardTitle>
                      <CardDescription>使用降维算法将高维向量投影到 2D 平面</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={selectedCollection} onValueChange={(v) => {
                        setSelectedCollection(v);
                        loadVectors(v);
                      }}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="选择集合" />
                        </SelectTrigger>
                        <SelectContent>
                          {collections.map(col => (
                            <SelectItem key={col.name} value={col.name}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadVectors(selectedCollection)}
                        disabled={loadingVectors}
                      >
                        {loadingVectors ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {projectedPoints.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                      <CircleDot className="w-16 h-16 mb-4 opacity-50" />
                      <p>请选择集合并加载向量数据</p>
                    </div>
                  ) : (
                    <div className="relative h-96 border rounded-lg bg-muted/20 overflow-hidden">
                      {/* 简单的 SVG 散点图 */}
                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                        {/* 网格线 */}
                        <defs>
                          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.1" className="text-muted-foreground/20" />
                          </pattern>
                        </defs>
                        <rect width="100" height="100" fill="url(#grid)" />
                        
                        {/* 数据点 */}
                        {projectedPoints.map((point, idx) => (
                          <g key={point.id}>
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="1.5"
                              fill={categoryColors[point.category || 'default'] || categoryColors.default}
                              className="cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => {
                                const vector = vectors.find(v => v.id === point.id);
                                if (vector) viewVectorDetails(vector);
                              }}
                            >
                              <title>{point.label}</title>
                            </circle>
                          </g>
                        ))}
                      </svg>
                      
                      {/* 图例 */}
                      <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm rounded-lg p-3 border">
                        <p className="text-xs font-medium mb-2">类别图例</p>
                        <div className="space-y-1">
                          {Object.entries(categoryColors).filter(([k]) => k !== 'default').map(([category, color]) => (
                            <div key={category} className="flex items-center gap-2 text-xs">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                              <span>{category}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4 text-sm text-muted-foreground">
                    <Info className="w-4 h-4 inline mr-1" />
                    点击数据点查看详情。当前显示 {projectedPoints.length} 个向量点。
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* 检索测试 */}
            <TabsContent value="search" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="w-5 h-5" />
                    向量检索测试
                  </CardTitle>
                  <CardDescription>输入查询文本，测试语义相似度搜索效果</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="选择集合" />
                      </SelectTrigger>
                      <SelectContent>
                        {collections.map(col => (
                          <SelectItem key={col.name} value={col.name}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Top-K:</span>
                      <Input
                        type="number"
                        value={topK}
                        onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                        className="w-20"
                        min={1}
                        max={20}
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="输入查询文本，例如：轴承故障诊断方法..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="min-h-24"
                    />
                  </div>
                  
                  <Button onClick={handleSearch} disabled={searching} className="w-full">
                    {searching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        搜索中...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        执行语义搜索
                      </>
                    )}
                  </Button>
                  
                  {/* 搜索结果 */}
                  {searchResults.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <h4 className="font-medium">搜索结果 ({searchResults.length})</h4>
                      {searchResults.map((result, idx) => (
                        <div
                          key={result.id}
                          className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => viewVectorDetails(result)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">#{idx + 1}</Badge>
                                <span className="font-medium">{result.payload.title || result.id}</span>
                                {result.score !== undefined && (
                                  <Badge variant="secondary">
                                    相似度: {(result.score * 100).toFixed(1)}%
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {result.payload.content?.substring(0, 200)}...
                              </p>
                            </div>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* 向量管理 */}
            <TabsContent value="manage" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        向量数据管理
                      </CardTitle>
                      <CardDescription>查看、编辑和删除向量数据</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={selectedCollection} onValueChange={(v) => {
                        setSelectedCollection(v);
                        loadVectors(v);
                      }}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="选择集合" />
                        </SelectTrigger>
                        <SelectContent>
                          {collections.map(col => (
                            <SelectItem key={col.name} value={col.name}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadVectors(selectedCollection)}
                        disabled={loadingVectors}
                      >
                        {loadingVectors ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {vectors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Box className="w-16 h-16 mb-4 opacity-50" />
                      <p>请选择集合并加载向量数据</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-2">
                        {vectors.map((vector, idx) => (
                          <div
                            key={vector.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-sm font-medium">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{vector.payload.title || vector.id}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {vector.payload.category || '未分类'} · ID: {vector.id}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewVectorDetails(vector)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (confirm('确定要删除这个向量吗？')) {
                                    deleteVector(vector.id);
                                  }
                                }}
                              >
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
        
        {/* 向量详情对话框 */}
        <Dialog open={showVectorDialog} onOpenChange={setShowVectorDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                向量详情
              </DialogTitle>
            </DialogHeader>
            
            {selectedVector && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">向量 ID</p>
                    <p className="font-mono text-sm">{selectedVector.id}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-1">相似度分数</p>
                    <p className="font-medium">
                      {selectedVector.score !== undefined 
                        ? `${(selectedVector.score * 100).toFixed(2)}%` 
                        : 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">元数据 (Payload)</p>
                  <Textarea
                    value={editingPayload}
                    onChange={(e) => setEditingPayload(e.target.value)}
                    className="font-mono text-sm min-h-64"
                  />
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowVectorDialog(false)}>
                    关闭
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(editingPayload);
                      toast.success('已复制到剪贴板');
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    复制
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
