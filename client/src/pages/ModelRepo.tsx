import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { 
  RefreshCw, Plus, Download, Search, Play, Pause, 
  Trash2, HardDrive, Cpu, RotateCcw
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

export default function ModelRepo() {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newModelName, setNewModelName] = useState('');

  // tRPC queries
  const { data: models, refetch: refetchModels } = trpc.model.listModels.useQuery();
  const { data: ollamaStatus } = trpc.model.getOllamaStatus.useQuery();

  // tRPC mutations
  const syncModelsMutation = trpc.model.syncOllamaModels.useMutation({
    onSuccess: (data) => {
      toast.success(`同步完成，新增 ${data.syncCount} 个模型`);
      refetchModels();
    },
    onError: () => toast.error('同步失败'),
  });

  const pullModelMutation = trpc.model.pullModel.useMutation({
    onSuccess: () => {
      toast.success(`${newModelName} 拉取成功`);
      setShowAddDialog(false);
      setNewModelName('');
      refetchModels();
    },
    onError: () => toast.error('拉取失败'),
  });

  const deleteModelMutation = trpc.model.deleteModel.useMutation({
    onSuccess: () => {
      toast.success('模型已删除');
      refetchModels();
    },
    onError: () => toast.error('删除失败'),
  });

  // 统计
  const modelList = models || [];
  const stats = {
    total: modelList.length,
    loaded: modelList.filter(m => m.status === 'loaded').length,
    totalSize: modelList.reduce((acc, m) => {
      const match = (m.size || '').match(/([\d.]+)\s*GB/i);
      return acc + (match ? parseFloat(match[1]) : 0);
    }, 0).toFixed(1) + ' GB',
    labelModels: modelList.filter(m => m.type === 'label').length
  };

  // 过滤模型
  const filteredModels = modelList.filter(m => {
    const matchSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       (m.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || m.type === filterType;
    return matchSearch && matchType;
  });

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'llm': return { label: '大语言模型', variant: 'info' as const, icon: '🧠' };
      case 'embedding': return { label: '嵌入模型', variant: 'success' as const, icon: '📐' };
      case 'label': return { label: '标注模型', variant: 'warning' as const, icon: '🏷️' };
      case 'diagnostic': return { label: '诊断模型', variant: 'danger' as const, icon: '🔬' };
      default: return { label: '其他', variant: 'default' as const, icon: '📦' };
    }
  };

  // 刷新：同步 Ollama + refetch
  const handleRefresh = async () => {
    try {
      await syncModelsMutation.mutateAsync();
    } catch (e) {
      // sync may fail if ollama is offline
    }
    refetchModels();
  };

  // 拉取新模型
  const handlePullModel = () => {
    if (!newModelName.trim()) {
      toast.error('请输入模型名称');
      return;
    }
    pullModelMutation.mutate({ modelName: newModelName.trim() });
  };

  // 删除模型
  const handleDeleteModel = (modelId: string, modelName: string) => {
    if (!confirm(`确定要删除模型 ${modelName} 吗？`)) return;
    deleteModelMutation.mutate({ modelId });
  };

  return (
    <MainLayout title="模型仓库">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">📦 模型仓库</h2>
            <p className="text-muted-foreground">管理本地部署的模型资源</p>
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-sm">
              <div className={cn("w-2 h-2 rounded-full", ollamaStatus?.online ? "bg-success" : "bg-destructive")} />
              <span>Ollama {ollamaStatus?.online ? '在线' : '离线'}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={syncModelsMutation.isPending}>
              <RefreshCw className={cn("w-4 h-4 mr-2", syncModelsMutation.isPending && "animate-spin")} />
              {syncModelsMutation.isPending ? '同步中...' : '同步刷新'}
            </Button>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              添加模型
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <StatCard value={stats.total} label="模型总数" icon="📦" />
          <StatCard value={stats.loaded} label="已加载" icon="✅" />
          <StatCard value={stats.totalSize} label="存储占用" icon="💾" />
          <StatCard value={stats.labelModels} label="标注模型" icon="🏷️" />
        </div>

        {/* Search and filter */}
        <PageCard className="mb-5">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索模型..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="llm">大语言模型</SelectItem>
                <SelectItem value="embedding">嵌入模型</SelectItem>
                <SelectItem value="label">标注模型</SelectItem>
                <SelectItem value="diagnostic">诊断模型</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PageCard>

        {/* Model list */}
        <PageCard title="模型列表" icon="📋">
          <div className="space-y-3">
            {filteredModels.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>没有找到匹配的模型</p>
                <p className="text-sm mt-2">点击"同步刷新"从本地 Ollama 导入模型</p>
              </div>
            ) : (
              filteredModels.map((model) => {
                const typeInfo = getTypeLabel(model.type);
                return (
                  <div 
                    key={model.modelId}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                        model.status === 'loaded' ? "bg-success/20" : "bg-secondary"
                      )}>
                        {typeInfo.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{model.displayName || model.name}</span>
                          <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                          {model.status === 'loaded' && (
                            <Badge variant="success">已加载</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {model.description || `${model.provider} 模型`}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          {model.size && (
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {model.size}
                            </span>
                          )}
                          {model.parameters && (
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              {model.parameters}
                            </span>
                          )}
                          {model.quantization && (
                            <span className="flex items-center gap-1">
                              ⚡ {model.quantization}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => handleDeleteModel(model.modelId, model.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </PageCard>

        {/* Label models section */}
        <PageCard 
          title="标注模型" 
          icon="🏷️" 
          className="mt-5"
          action={
            <Button variant="secondary" size="sm">
              <Download className="w-4 h-4 mr-2" />
              导出全部
            </Button>
          }
        >
          <div className="space-y-3">
            {modelList.filter(m => m.type === 'label').length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无标注模型
              </div>
            ) : (
              modelList.filter(m => m.type === 'label').map((model) => (
                <div 
                  key={model.modelId}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🏷️</span>
                    <div>
                      <div className="font-medium">{model.displayName || model.name}</div>
                      <div className="text-sm text-muted-foreground">{model.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{model.size}</span>
                    <Badge variant={model.status === 'loaded' ? 'success' : 'default'}>
                      {model.status === 'loaded' ? '已加载' : '未加载'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </PageCard>
      </div>

      {/* Add model dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加模型</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">模型名称</label>
              <Input
                placeholder="例如: llama3.1:8b, qwen2.5:7b"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                输入 Ollama 模型名称，将从 Ollama 仓库拉取
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {['llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'codellama:7b', 'nomic-embed-text'].map(name => (
                  <Button
                    key={name}
                    variant="secondary"
                    size="sm"
                    onClick={() => setNewModelName(name)}
                    className="text-xs"
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handlePullModel} disabled={pullModelMutation.isPending}>
              <Download className="w-4 h-4 mr-2" />
              {pullModelMutation.isPending ? '拉取中...' : '拉取模型'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
