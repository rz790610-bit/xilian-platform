import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, Plus, Download, Upload, Search, Play, Pause, 
  Trash2, Settings, HardDrive, Cpu, Zap
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

interface Model {
  id: string;
  name: string;
  type: 'llm' | 'embedding' | 'label' | 'diagnostic';
  size: string;
  status: 'loaded' | 'available' | 'downloading';
  description: string;
  parameters?: string;
  downloadProgress?: number;
}

export default function ModelRepo() {
  const toast = useToast();
  const [models, setModels] = useState<Model[]>([
    { id: '1', name: 'llama3.1:70b', type: 'llm', size: '39 GB', status: 'loaded', description: 'Meta Llama 3.1 70B 大语言模型', parameters: '70B' },
    { id: '2', name: 'llama3.1:8b', type: 'llm', size: '4.7 GB', status: 'available', description: 'Meta Llama 3.1 8B 轻量模型', parameters: '8B' },
    { id: '3', name: 'nomic-embed-text', type: 'embedding', size: '274 MB', status: 'loaded', description: '文本嵌入模型', parameters: '137M' },
    { id: '4', name: 'bearing-classifier-v1', type: 'label', size: '156 MB', status: 'available', description: '轴承故障分类模型' },
    { id: '5', name: 'vibration-diagnostic', type: 'diagnostic', size: '892 MB', status: 'loaded', description: '振动诊断模型' },
    { id: '6', name: 'qwen2:7b', type: 'llm', size: '4.4 GB', status: 'available', description: '通义千问 2 7B', parameters: '7B' },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newModelName, setNewModelName] = useState('');

  // 统计
  const stats = {
    total: models.length,
    loaded: (models || []).filter(m => m.status === 'loaded').length,
    totalSize: '45.5 GB',
    labelModels: (models || []).filter(m => m.type === 'label').length
  };

  // 过滤模型
  const filteredModels = (models || []).filter(m => {
    const matchSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       m.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = filterType === 'all' || m.type === filterType;
    return matchSearch && matchType;
  });

  // 加载/卸载模型
  const toggleModel = (id: string) => {
    setModels(prev => prev.map(m => {
      if (m.id === id) {
        const newStatus = m.status === 'loaded' ? 'available' : 'loaded';
        toast.success(newStatus === 'loaded' ? `${m.name} 已加载` : `${m.name} 已卸载`);
        return { ...m, status: newStatus as any };
      }
      return m;
    }));
  };

  // 删除模型
  const deleteModel = (id: string) => {
    const model = (models || []).find(m => m.id === id);
    if (!model) return;
    if (!confirm(`确定要删除模型 ${model.name} 吗？`)) return;
    
    setModels(prev => prev.filter(m => m.id !== id));
    toast.success(`${model.name} 已删除`);
  };

  // 拉取新模型
  const pullModel = () => {
    if (!newModelName.trim()) {
      toast.error('请输入模型名称');
      return;
    }
    
    const newModel: Model = {
      id: `new_${Date.now()}`,
      name: newModelName,
      type: 'llm',
      size: '计算中...',
      status: 'downloading',
      description: '正在下载...',
      downloadProgress: 0
    };
    
    setModels(prev => [...prev, newModel]);
    setShowAddDialog(false);
    setNewModelName('');
    toast.info(`开始下载 ${newModelName}`);
    
    // 模拟下载进度
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setModels(prev => prev.map(m => {
          if (m.id === newModel.id) {
            return { ...m, status: 'available', size: '4.2 GB', description: '下载完成', downloadProgress: undefined };
          }
          return m;
        }));
        toast.success(`${newModelName} 下载完成`);
      } else {
        setModels(prev => prev.map(m => {
          if (m.id === newModel.id) {
            return { ...m, downloadProgress: Math.round(progress) };
          }
          return m;
        }));
      }
    }, 500);
  };

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'llm': return { label: '大语言模型', variant: 'info' as const };
      case 'embedding': return { label: '嵌入模型', variant: 'success' as const };
      case 'label': return { label: '标注模型', variant: 'warning' as const };
      case 'diagnostic': return { label: '诊断模型', variant: 'danger' as const };
      default: return { label: '其他', variant: 'default' as const };
    }
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
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
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
              </div>
            ) : (
              (filteredModels || []).map((model) => {
                const typeInfo = getTypeLabel(model.type);
                return (
                  <div 
                    key={model.id}
                    className="flex items-center justify-between p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
                        model.status === 'loaded' ? "bg-success/20" : "bg-secondary"
                      )}>
                        {model.type === 'llm' && '🧠'}
                        {model.type === 'embedding' && '📐'}
                        {model.type === 'label' && '🏷️'}
                        {model.type === 'diagnostic' && '🔬'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{model.name}</span>
                          <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                          {model.status === 'loaded' && (
                            <Badge variant="success">已加载</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {model.description}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3 h-3" />
                            {model.size}
                          </span>
                          {model.parameters && (
                            <span className="flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              {model.parameters}
                            </span>
                          )}
                        </div>
                        {model.status === 'downloading' && model.downloadProgress !== undefined && (
                          <div className="mt-2 w-48">
                            <div className="h-2 bg-background rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all"
                                style={{ width: `${model.downloadProgress}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              下载中 {model.downloadProgress}%
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {model.status !== 'downloading' && (
                        <>
                          <Button 
                            variant={model.status === 'loaded' ? 'secondary' : 'default'}
                            size="sm"
                            onClick={() => toggleModel(model.id)}
                          >
                            {model.status === 'loaded' ? (
                              <>
                                <Pause className="w-4 h-4 mr-1" />
                                卸载
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 mr-1" />
                                加载
                              </>
                            )}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => deleteModel(model.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
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
            {(models || []).filter(m => m.type === 'label').length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无标注模型
              </div>
            ) : (
              (models || []).filter(m => m.type === 'label').map((model) => (
                <div 
                  key={model.id}
                  className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🏷️</span>
                    <div>
                      <div className="font-medium">{model.name}</div>
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
                placeholder="例如: llama3.1:8b, qwen2:7b"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                输入 Ollama 模型名称，将从 Ollama 仓库拉取
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={pullModel}>
              <Download className="w-4 h-4 mr-2" />
              拉取模型
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
