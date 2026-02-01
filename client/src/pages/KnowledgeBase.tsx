import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/common/Toast';
import { nanoid } from 'nanoid';
import * as qdrant from '@/services/qdrant';
import { 
  Database, Search, Plus, Trash2, RefreshCw, FileText, 
  BookOpen, Wrench, AlertTriangle, CheckCircle, XCircle,
  Upload, Download, Loader2, Wifi, WifiOff
} from 'lucide-react';

export default function KnowledgeBase() {
  const toast = useToast();
  
  // 状态
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [collections, setCollections] = useState<qdrant.CollectionInfo[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [knowledgePoints, setKnowledgePoints] = useState<qdrant.KnowledgePoint[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<qdrant.SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // 添加知识点对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPoint, setNewPoint] = useState({
    title: '',
    content: '',
    category: '诊断案例',
    equipment_type: '',
    fault_type: '',
    tags: ''
  });
  
  // 查看详情对话框
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<qdrant.KnowledgePoint | null>(null);

  // 初始化
  useEffect(() => {
    checkQdrantAndLoad();
  }, []);

  // 切换集合时加载知识点
  useEffect(() => {
    if (selectedCollection && qdrantStatus === 'online') {
      loadKnowledgePoints();
    }
  }, [selectedCollection]);

  const checkQdrantAndLoad = async () => {
    setQdrantStatus('checking');
    try {
      const isOnline = await qdrant.checkQdrantStatus();
      if (isOnline) {
        setQdrantStatus('online');
        await loadCollections();
        toast.success('Qdrant 已连接');
      } else {
        setQdrantStatus('offline');
        toast.warning('Qdrant 未连接，知识库功能不可用');
      }
    } catch (error) {
      setQdrantStatus('offline');
    }
  };

  const loadCollections = async () => {
    try {
      const cols = await qdrant.getCollections();
      setCollections(cols);
      if (cols.length > 0 && !selectedCollection) {
        setSelectedCollection(cols[0].name);
      }
    } catch (error) {
      console.error('加载集合失败:', error);
    }
  };

  const loadKnowledgePoints = async () => {
    if (!selectedCollection) return;
    setIsLoading(true);
    try {
      const points = await qdrant.getAllKnowledgePoints(selectedCollection);
      setKnowledgePoints(points);
    } catch (error) {
      console.error('加载知识点失败:', error);
      toast.error('加载知识点失败');
    }
    setIsLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedCollection) return;
    setIsSearching(true);
    try {
      const results = await qdrant.searchKnowledge(selectedCollection, searchQuery, 10);
      setSearchResults(results);
      if (results.length === 0) {
        toast.info('未找到相关知识点');
      }
    } catch (error) {
      toast.error('搜索失败');
    }
    setIsSearching(false);
  };

  const handleAddPoint = async () => {
    if (!newPoint.title.trim() || !newPoint.content.trim()) {
      toast.error('请填写标题和内容');
      return;
    }
    
    setIsLoading(true);
    try {
      const point: qdrant.KnowledgePoint = {
        id: nanoid(),
        title: newPoint.title,
        content: newPoint.content,
        category: newPoint.category,
        equipment_type: newPoint.equipment_type || undefined,
        fault_type: newPoint.fault_type || undefined,
        tags: newPoint.tags.split(',').map(t => t.trim()).filter(Boolean),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await qdrant.addKnowledgePoint(selectedCollection, point);
      toast.success('知识点添加成功');
      setShowAddDialog(false);
      setNewPoint({
        title: '',
        content: '',
        category: '诊断案例',
        equipment_type: '',
        fault_type: '',
        tags: ''
      });
      await loadKnowledgePoints();
    } catch (error) {
      toast.error('添加失败');
    }
    setIsLoading(false);
  };

  const handleDeletePoint = async (pointId: string) => {
    if (!confirm('确定要删除这个知识点吗？')) return;
    
    try {
      await qdrant.deleteKnowledgePoint(selectedCollection, pointId);
      toast.success('知识点已删除');
      await loadKnowledgePoints();
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleInitializeDefault = async () => {
    if (!confirm('这将初始化默认知识库（诊断案例和故障模式），确定继续吗？')) return;
    
    setIsLoading(true);
    try {
      await qdrant.initializeDefaultKnowledge();
      toast.success('默认知识库初始化成功');
      await loadCollections();
    } catch (error) {
      toast.error('初始化失败');
    }
    setIsLoading(false);
  };

  const handleCreateCollection = async () => {
    const name = prompt('请输入集合名称（英文）：');
    if (!name) return;
    
    try {
      await qdrant.createCollection(name);
      toast.success(`集合 ${name} 创建成功`);
      await loadCollections();
    } catch (error) {
      toast.error('创建集合失败');
    }
  };

  const handleDeleteCollection = async (name: string) => {
    if (!confirm(`确定要删除集合 ${name} 吗？这将删除所有数据！`)) return;
    
    try {
      await qdrant.deleteCollection(name);
      toast.success(`集合 ${name} 已删除`);
      if (selectedCollection === name) {
        setSelectedCollection('');
        setKnowledgePoints([]);
      }
      await loadCollections();
    } catch (error) {
      toast.error('删除集合失败');
    }
  };

  const totalPoints = collections.reduce((sum, c) => sum + c.points_count, 0);

  return (
    <MainLayout title="知识库">
      <div className="animate-fade-up">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold mb-1">知识库管理</h2>
              <p className="text-xs text-muted-foreground">管理诊断案例、故障模式和设备手册</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
                qdrantStatus === 'online' 
                  ? 'bg-green-500/10 text-green-600' 
                  : qdrantStatus === 'offline'
                  ? 'bg-red-500/10 text-red-600'
                  : 'bg-yellow-500/10 text-yellow-600'
              }`}>
                {qdrantStatus === 'online' ? (
                  <><Wifi className="w-3 h-3" /> Qdrant 已连接</>
                ) : qdrantStatus === 'offline' ? (
                  <><WifiOff className="w-3 h-3" /> Qdrant 未连接</>
                ) : (
                  <><Loader2 className="w-3 h-3 animate-spin" /> 检查中...</>
                )}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px]"
                onClick={checkQdrantAndLoad}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard value={collections.length} label="知识集合" icon="🗄️" />
          <StatCard value={totalPoints} label="知识点总数" icon="📄" />
          <StatCard value={searchResults.length} label="搜索结果" icon="🔍" />
          <StatCard 
            value={qdrantStatus === 'online' ? '正常' : '离线'} 
            label="服务状态" 
            icon={qdrantStatus === 'online' ? '✅' : '❌'} 
          />
        </div>

        {qdrantStatus === 'offline' ? (
          <PageCard title="Qdrant 未连接" icon={<AlertTriangle className="w-4 h-4" />}>
            <div className="text-center py-8">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm text-muted-foreground mb-4">
                请先启动 Qdrant 向量数据库服务
              </p>
              <div className="bg-secondary rounded-lg p-4 text-left text-xs font-mono max-w-md mx-auto">
                <p className="text-muted-foreground mb-2"># Docker 启动 Qdrant</p>
                <p>docker run -p 6333:6333 qdrant/qdrant</p>
              </div>
            </div>
          </PageCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Left: Collections & Search */}
            <div className="space-y-3">
              {/* Collections */}
              <PageCard 
                title="知识集合" 
                icon={<Database className="w-4 h-4" />}
                action={
                  <div className="flex gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-[10px]"
                      onClick={handleInitializeDefault}
                    >
                      初始化
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-[10px]"
                      onClick={handleCreateCollection}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                }
              >
                <div className="space-y-1.5">
                  {collections.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-[10px]">
                      暂无集合，点击"初始化"创建默认知识库
                    </div>
                  ) : (
                    collections.map((col) => (
                      <div
                        key={col.name}
                        onClick={() => setSelectedCollection(col.name)}
                        className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                          selectedCollection === col.name 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'bg-secondary hover:bg-accent'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-[11px]">{col.name}</div>
                          <div className="text-[9px] text-muted-foreground">
                            {col.points_count} 条记录
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCollection(col.name);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </PageCard>

              {/* Search */}
              <PageCard title="语义搜索" icon={<Search className="w-4 h-4" />}>
                <div className="space-y-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="输入搜索内容..."
                    className="h-8 text-xs"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button 
                    onClick={handleSearch} 
                    disabled={isSearching || !selectedCollection}
                    size="sm"
                    className="w-full h-7 text-[10px]"
                  >
                    {isSearching ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Search className="w-3 h-3 mr-1" />
                    )}
                    搜索
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground">
                      找到 {searchResults.length} 条相关结果
                    </div>
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => {
                          setSelectedPoint(result.payload);
                          setShowDetailDialog(true);
                        }}
                        className="p-2 bg-secondary rounded cursor-pointer hover:bg-accent transition-colors"
                      >
                        <div className="font-medium text-[10px] line-clamp-1">
                          {result.payload.title}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <Badge variant="default" className="text-[8px]">
                            {result.payload.category}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground">
                            相似度: {(result.score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PageCard>
            </div>

            {/* Right: Knowledge Points */}
            <div className="lg:col-span-2">
              <PageCard 
                title={selectedCollection ? `${selectedCollection} 知识点` : '知识点列表'}
                icon={<BookOpen className="w-4 h-4" />}
                action={
                  selectedCollection && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 text-[10px]"
                      onClick={() => setShowAddDialog(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      添加
                    </Button>
                  )
                }
              >
                {!selectedCollection ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-xs">请先选择一个知识集合</p>
                  </div>
                ) : isLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">加载中...</p>
                  </div>
                ) : knowledgePoints.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-xs">暂无知识点</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-3 h-7 text-[10px]"
                      onClick={() => setShowAddDialog(true)}
                    >
                      添加第一个知识点
                    </Button>
                  </div>
                ) : (
                  <ScrollArea className="h-[450px]">
                    <div className="space-y-2 pr-3">
                      {knowledgePoints.map((point) => (
                        <div
                          key={point.id}
                          className="p-3 bg-secondary rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedPoint(point);
                            setShowDetailDialog(true);
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[11px] mb-1">{point.title}</div>
                              <div className="text-[10px] text-muted-foreground line-clamp-2">
                                {point.content}
                              </div>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                <Badge variant="default" className="text-[8px]">
                                  {point.category}
                                </Badge>
                                {point.equipment_type && (
                                  <Badge variant="info" className="text-[8px]">
                                    {point.equipment_type}
                                  </Badge>
                                )}
                                {point.fault_type && (
                                  <Badge variant="warning" className="text-[8px]">
                                    {point.fault_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 flex-shrink-0 text-muted-foreground hover:text-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePoint(point.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </PageCard>
            </div>
          </div>
        )}

        {/* Add Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">添加知识点</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">标题 *</label>
                <Input
                  value={newPoint.title}
                  onChange={(e) => setNewPoint(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="知识点标题"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">内容 *</label>
                <Textarea
                  value={newPoint.content}
                  onChange={(e) => setNewPoint(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="详细内容..."
                  className="min-h-[120px] text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">分类</label>
                  <Select 
                    value={newPoint.category} 
                    onValueChange={(v) => setNewPoint(prev => ({ ...prev, category: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="诊断案例" className="text-xs">诊断案例</SelectItem>
                      <SelectItem value="故障模式" className="text-xs">故障模式</SelectItem>
                      <SelectItem value="设备手册" className="text-xs">设备手册</SelectItem>
                      <SelectItem value="维护指南" className="text-xs">维护指南</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">设备类型</label>
                  <Input
                    value={newPoint.equipment_type}
                    onChange={(e) => setNewPoint(prev => ({ ...prev, equipment_type: e.target.value }))}
                    placeholder="如：离心泵"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">故障类型</label>
                  <Input
                    value={newPoint.fault_type}
                    onChange={(e) => setNewPoint(prev => ({ ...prev, fault_type: e.target.value }))}
                    placeholder="如：轴承故障"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">标签（逗号分隔）</label>
                  <Input
                    value={newPoint.tags}
                    onChange={(e) => setNewPoint(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="轴承,振动,BPFO"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)}>
                取消
              </Button>
              <Button size="sm" onClick={handleAddPoint} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                添加
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm">{selectedPoint?.title}</DialogTitle>
            </DialogHeader>
            {selectedPoint && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default">{selectedPoint.category}</Badge>
                  {selectedPoint.equipment_type && (
                    <Badge variant="info">{selectedPoint.equipment_type}</Badge>
                  )}
                  {selectedPoint.fault_type && (
                    <Badge variant="warning">{selectedPoint.fault_type}</Badge>
                  )}
                </div>
                <div className="bg-secondary rounded-lg p-3">
                  <pre className="text-xs whitespace-pre-wrap font-sans">
                    {selectedPoint.content}
                  </pre>
                </div>
                {selectedPoint.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">标签：</span>
                    {selectedPoint.tags.map((tag, i) => (
                      <Badge key={i} variant="default" className="text-[9px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="text-[9px] text-muted-foreground">
                  创建时间：{new Date(selectedPoint.created_at).toLocaleString()}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowDetailDialog(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
