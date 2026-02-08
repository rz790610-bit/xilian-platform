import { useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';

// 文件类型图标映射
const FILE_ICONS: Record<string, string> = {
  'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗',
  'csv': '📊', 'txt': '📄', 'md': '📝', 'json': '📋',
  'mp3': '🎵', 'wav': '🎵', 'mp4': '🎬', 'avi': '🎬',
  'dwg': '📐', 'dxf': '📐',
  'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'bmp': '🖼️',
  'tiff': '🖼️', 'tif': '🖼️', 'webp': '🖼️', 'gif': '🖼️',
  'default': '📁'
};

// 处理任务接口
interface ProcessTask {
  id: string;
  filename: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  result?: {
    chunks: number;
    entities: number;
    relations: number;
  };
}

export default function KnowledgeManager() {
  const [tasks, setTasks] = useState<ProcessTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'tasks' | 'settings'>('documents');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const toast = useToast();

  // ━━━ tRPC Queries ━━━
  const qdrantStatusQuery = trpc.knowledge.qdrantStatus.useQuery(undefined, {
    refetchInterval: 30000
  });
  const collectionsQuery = trpc.knowledge.listCollections.useQuery();
  const documentsQuery = trpc.knowledge.documents.useQuery(
    { collectionId: selectedCollectionId! },
    { enabled: selectedCollectionId !== null }
  );
  const statsQuery = trpc.knowledge.stats.useQuery(
    { collectionId: selectedCollectionId! },
    { enabled: selectedCollectionId !== null }
  );

  // ━━━ tRPC Mutations ━━━
  const createCollectionMutation = trpc.knowledge.createCollection.useMutation({
    onSuccess: () => {
      toast.success('集合创建成功');
      collectionsQuery.refetch();
      setShowCreateDialog(false);
      setNewCollectionName('');
      setNewCollectionDesc('');
    },
    onError: (err) => toast.error(`创建失败: ${err.message}`)
  });

  const deleteCollectionMutation = trpc.knowledge.deleteCollection.useMutation({
    onSuccess: () => {
      toast.success('集合已删除');
      collectionsQuery.refetch();
      setSelectedCollectionId(null);
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`)
  });

  const processDocumentMutation = trpc.knowledge.processDocument.useMutation();

  // ━━━ 自动选择第一个集合 ━━━
  const collections = collectionsQuery.data || [];
  if (selectedCollectionId === null && collections.length > 0) {
    setSelectedCollectionId(collections[0].id);
  }

  // ━━━ 数据 ━━━
  const qdrantStatus = qdrantStatusQuery.data;
  const documents = documentsQuery.data || [];
  const stats = statsQuery.data || { totalPoints: 0, totalDocuments: 0, totalNodes: 0, totalEdges: 0 };

  // 获取文件图标
  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return FILE_ICONS[ext] || FILE_ICONS.default;
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ━━━ 文件上传处理 ━━━
  const handleFileUpload = useCallback(async (files: FileList) => {
    if (selectedCollectionId === null) {
      toast.warning('请先选择或创建一个知识集合');
      return;
    }

    setUploading(true);

    for (const file of Array.from(files)) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const task: ProcessTask = {
        id: taskId,
        filename: file.name,
        status: 'uploading',
        progress: 10,
        message: '正在读取文件...'
      };
      setTasks(prev => [task, ...prev]);

      try {
        // 读取文件为 base64
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, progress: 30, message: '正在解析和向量化...', status: 'processing' } : t
        ));

        // 调用后端一站式处理：解析 → 分块 → 向量化 → 实体抽取 → 图谱生成
        const result = await processDocumentMutation.mutateAsync({
          collectionId: selectedCollectionId,
          content: base64,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          extractEntities: true
        });

        setTasks(prev => prev.map(t =>
          t.id === taskId ? {
            ...t,
            status: 'completed',
            progress: 100,
            message: '处理完成',
            result: {
              chunks: result?.chunks || 0,
              entities: result?.entities || 0,
              relations: result?.relations || 0
            }
          } : t
        ));

        toast.success(`${file.name} 处理完成`);
      } catch (error) {
        setTasks(prev => prev.map(t =>
          t.id === taskId ? {
            ...t,
            status: 'failed',
            progress: 0,
            message: `处理失败: ${error instanceof Error ? error.message : String(error)}`
          } : t
        ));
        toast.error(`${file.name} 处理失败`);
      }
    }

    setUploading(false);
    // 刷新文档列表和统计
    documentsQuery.refetch();
    statsQuery.refetch();
  }, [selectedCollectionId, processDocumentMutation, documentsQuery, statsQuery, toast]);

  // 过滤文档
  const filteredDocs = documents.filter((doc: any) =>
    doc.filename?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout title="知识库管理">
      <div className="space-y-6">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">知识库管理</h1>
            <p className="text-gray-400 text-sm mt-1">
              上传文档自动解析、向量化存储，支持 RAG 检索和实体关系抽取
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={qdrantStatus?.connected ? 'success' : 'danger'}>
              Qdrant: {qdrantStatus?.connected ? '已连接' : '离线'}
            </Badge>
            {/* 集合选择器 */}
            <Select
              value={selectedCollectionId?.toString() || ''}
              onValueChange={(v) => setSelectedCollectionId(Number(v))}
            >
              <SelectTrigger className="w-[180px] bg-gray-800 border-gray-600 text-white">
                <SelectValue placeholder="选择知识集合" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((c: any) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)}>
              ➕ 新建集合
            </Button>
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp,.gif"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <Button disabled={uploading || selectedCollectionId === null}>
                {uploading ? '上传中...' : '📤 上传文档'}
              </Button>
            </label>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="文档总数" value={stats.totalDocuments || 0} icon="📁" />
          <StatCard label="知识点" value={stats.totalPoints || 0} icon="📝" />
          <StatCard label="图谱节点" value={stats.totalNodes || 0} icon="🏷️" />
          <StatCard label="图谱关系" value={stats.totalEdges || 0} icon="🔗" />
          <StatCard label="集合数" value={collections.length} icon="📦" />
        </div>

        {/* 标签页 */}
        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === 'documents'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            📄 文档列表
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === 'tasks'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            ⚙️ 处理任务 {tasks.filter(t => t.status === 'processing' || t.status === 'uploading').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {tasks.filter(t => t.status === 'processing' || t.status === 'uploading').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-t-lg transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🔧 集合管理
          </button>
        </div>

        {/* 文档列表 */}
        {activeTab === 'documents' && (
          <PageCard
            title={`文档列表${selectedCollectionId ? '' : ' — 请先选择集合'}`}
            action={
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <Button variant="outline" size="sm" onClick={() => documentsQuery.refetch()}>
                  🔃 刷新
                </Button>
              </div>
            }
          >
            {!selectedCollectionId ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-4">📦</div>
                <p>请先选择或创建一个知识集合</p>
              </div>
            ) : documentsQuery.isLoading ? (
              <div className="text-center py-12 text-gray-400">加载中...</div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-4">📂</div>
                <p>暂无文档，点击上方按钮上传</p>
                <p className="text-sm mt-2">支持 TXT、MD、JSON、CSV、PDF、Word、Excel、图片等格式</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="pb-3 pr-4">文件名</th>
                      <th className="pb-3 pr-4">类型</th>
                      <th className="pb-3 pr-4">状态</th>
                      <th className="pb-3 pr-4">上传时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc: any) => (
                      <tr key={doc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{getFileIcon(doc.filename || '')}</span>
                            <span className="text-white">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="default">{doc.mimeType || 'unknown'}</Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={
                            doc.status === 'completed' ? 'success' :
                            doc.status === 'processing' ? 'warning' :
                            doc.status === 'failed' ? 'danger' : 'default'
                          }>
                            {doc.status === 'completed' ? '已处理' :
                             doc.status === 'processing' ? '处理中' :
                             doc.status === 'failed' ? '失败' : '待处理'}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-gray-400 text-sm">
                          {doc.createdAt ? new Date(doc.createdAt).toLocaleString('zh-CN') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageCard>
        )}

        {/* 处理任务 */}
        {activeTab === 'tasks' && (
          <PageCard title="处理任务">
            {tasks.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-4">⚙️</div>
                <p>暂无处理任务，上传文档后将自动创建</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map(task => (
                  <div key={task.id} className="p-4 bg-gray-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">
                          {task.status === 'uploading' ? '📤' :
                           task.status === 'processing' ? '⏳' :
                           task.status === 'completed' ? '✅' : '❌'}
                        </span>
                        <span className="text-white">{task.filename}</span>
                        <Badge variant={
                          task.status === 'completed' ? 'success' :
                          task.status === 'failed' ? 'danger' : 'warning'
                        }>
                          {task.status === 'uploading' ? '上传中' :
                           task.status === 'processing' ? '处理中' :
                           task.status === 'completed' ? '完成' : '失败'}
                        </Badge>
                      </div>
                      <span className="text-gray-400 text-sm">{task.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-600 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          task.status === 'completed' ? 'bg-green-500' :
                          task.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    {task.message && (
                      <p className="text-sm text-gray-400 mt-2">{task.message}</p>
                    )}
                    {task.result && (
                      <div className="flex gap-4 mt-2 text-sm text-gray-300">
                        <span>📝 {task.result.chunks} 知识块</span>
                        <span>🏷️ {task.result.entities} 实体</span>
                        <span>🔗 {task.result.relations} 关系</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        )}

        {/* 集合管理 */}
        {activeTab === 'settings' && (
          <PageCard title="集合管理">
            <div className="space-y-6">
              {/* Qdrant 状态 */}
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <h3 className="text-white font-medium mb-3">Qdrant 向量数据库</h3>
                <div className="flex items-center gap-4">
                  <Badge variant={qdrantStatus?.connected ? 'success' : 'danger'}>
                    {qdrantStatus?.connected ? '🟢 已连接' : '🔴 离线'}
                  </Badge>
                  <span className="text-gray-400">
                    {qdrantStatus?.connected
                      ? `${qdrantStatus.url || 'localhost:6333'}`
                      : '请确保 Qdrant 服务正在运行'}
                  </span>
                </div>
              </div>

              {/* 集合列表 */}
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-medium">知识集合 ({collections.length})</h3>
                  <Button size="sm" onClick={() => setShowCreateDialog(true)}>
                    ➕ 新建集合
                  </Button>
                </div>
                {collections.length === 0 ? (
                  <p className="text-gray-400">暂无集合，请创建一个知识集合开始使用</p>
                ) : (
                  <div className="space-y-2">
                    {collections.map((col: any) => (
                      <div key={col.id} className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
                        <div>
                          <span className="text-white font-medium">{col.name}</span>
                          {col.description && (
                            <span className="text-gray-400 text-sm ml-3">{col.description}</span>
                          )}
                          <span className="text-gray-500 text-xs ml-3">
                            创建于 {new Date(col.createdAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant={selectedCollectionId === col.id ? 'default' : 'outline'}
                            onClick={() => setSelectedCollectionId(col.id)}
                          >
                            {selectedCollectionId === col.id ? '当前选中' : '选择'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm(`确定删除集合「${col.name}」？此操作不可恢复。`)) {
                                deleteCollectionMutation.mutate({ id: col.id });
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </PageCard>
        )}
      </div>

      {/* 新建集合对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">新建知识集合</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400">集合名称</label>
              <Input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="例如：设备手册、故障案例"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400">描述（可选）</label>
              <Input
                value={newCollectionDesc}
                onChange={(e) => setNewCollectionDesc(e.target.value)}
                placeholder="简要描述集合用途"
                className="bg-gray-700 border-gray-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button
              onClick={() => createCollectionMutation.mutate({
                name: newCollectionName.trim(),
                description: newCollectionDesc.trim() || undefined
              })}
              disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
            >
              {createCollectionMutation.isPending ? '创建中...' : '确认创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
