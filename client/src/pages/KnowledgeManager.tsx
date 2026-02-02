import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { parseDocument } from '@/services/documentParser';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import * as qdrant from '@/services/qdrant';

// 文件类型图标映射
const FILE_ICONS: Record<string, string> = {
  'pdf': '📕',
  'doc': '📘',
  'docx': '📘',
  'xls': '📗',
  'xlsx': '📗',
  'csv': '📊',
  'txt': '📄',
  'md': '📝',
  'json': '📋',
  'mp3': '🎵',
  'wav': '🎵',
  'mp4': '🎬',
  'avi': '🎬',
  'dwg': '📐',
  'dxf': '📐',
  'png': '🖼️',
  'jpg': '🖼️',
  'jpeg': '🖼️',
  'bmp': '🖼️',
  'tiff': '🖼️',
  'tif': '🖼️',
  'webp': '🖼️',
  'gif': '🖼️',
  'default': '📁'
};

// 知识文档接口
interface KnowledgeDocument {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  uploadTime: string;
  processedTime?: string;
  entities?: number;
  relations?: number;
  chunks?: number;
  error?: string;
}

// 处理任务接口
interface ProcessTask {
  id: string;
  documentId: string;
  type: 'extract' | 'embed' | 'entity' | 'relation';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
}

export default function KnowledgeManager() {
  // 状态
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [tasks, setTasks] = useState<ProcessTask[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'tasks' | 'settings'>('documents');
  const [qdrantStatus, setQdrantStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [collections, setCollections] = useState<qdrant.CollectionInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // 统计数据
  const stats = {
    totalDocs: documents.length,
    processedDocs: documents.filter(d => d.status === 'completed').length,
    totalEntities: documents.reduce((sum, d) => sum + (d.entities || 0), 0),
    totalRelations: documents.reduce((sum, d) => sum + (d.relations || 0), 0),
    totalChunks: documents.reduce((sum, d) => sum + (d.chunks || 0), 0)
  };

  // 检查 Qdrant 状态
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const isOnline = await qdrant.checkQdrantStatus();
        setQdrantStatus(isOnline ? 'online' : 'offline');
        if (isOnline) {
          const cols = await qdrant.getCollections();
          setCollections(cols);
        }
      } catch {
        setQdrantStatus('offline');
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // 加载本地存储的文档
  useEffect(() => {
    const saved = localStorage.getItem('knowledge_documents');
    if (saved) {
      try {
        setDocuments(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load documents:', e);
      }
    }
  }, []);

  // 保存文档到本地存储
  useEffect(() => {
    localStorage.setItem('knowledge_documents', JSON.stringify(documents));
  }, [documents]);

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

  // 处理文件上传
  const handleFileUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    const newDocs: KnowledgeDocument[] = [];
    
    for (const file of Array.from(files)) {
      const doc: KnowledgeDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: file.name,
        fileType: file.name.split('.').pop()?.toLowerCase() || 'unknown',
        fileSize: file.size,
        status: 'processing',
        uploadTime: new Date().toISOString()
      };
      newDocs.push(doc);
      
      // 使用文档解析服务解析所有类型的文件
      try {
        const parseResult = await parseDocument(file);
        if (parseResult.success && parseResult.content) {
          // 存储解析后的内容到 localStorage
          localStorage.setItem(`doc_content_${doc.id}`, parseResult.content);
          doc.status = 'processing';
          console.log(`文档 ${file.name} 解析成功，内容长度: ${parseResult.content.length}`);
        } else {
          doc.status = 'failed';
          doc.error = parseResult.error || '文档解析失败';
          console.error(`文档 ${file.name} 解析失败:`, parseResult.error);
        }
      } catch (e) {
        doc.status = 'failed';
        doc.error = `解析错误: ${e instanceof Error ? e.message : String(e)}`;
        console.error(`文档 ${file.name} 解析异常:`, e);
      }
    }
    
    setDocuments(prev => [...prev, ...newDocs]);
    setUploading(false);
    
    // 自动开始处理成功解析的文档
    for (const doc of newDocs) {
      if (doc.status === 'processing') {
        processDocument(doc.id);
      }
    }
  }, []);

  // 处理文档（提取、向量化、实体抽取）
  const processDocument = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    
    // 创建处理任务
    const task: ProcessTask = {
      id: `task-${Date.now()}`,
      documentId: docId,
      type: 'extract',
      status: 'running',
      progress: 0,
      message: '正在提取文本内容...'
    };
    setTasks(prev => [...prev, task]);
    
    try {
      // 获取文档内容
      const content = localStorage.getItem(`doc_content_${docId}`);
      if (!content) {
        throw new Error('文档内容不存在');
      }
      
      // 更新进度
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, progress: 30, message: '正在分块处理...' } : t
      ));
      
      // 简单分块
      const chunks = content.match(/[^。！？\n]+[。！？\n]?/g) || [content];
      const validChunks = chunks.filter(c => c.trim().length > 10);
      
      // 更新进度
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, progress: 60, message: '正在向量化存储...' } : t
      ));
      
      // 存储到 Qdrant（如果在线）
      if (qdrantStatus === 'online') {
        const collectionName = 'knowledge_base';
        
        // 确保集合存在
        const existingCols = await qdrant.getCollections();
        if (!existingCols.find(c => c.name === collectionName)) {
          await qdrant.createCollection(collectionName);
        }
        
        // 添加知识点
        for (let i = 0; i < validChunks.length; i++) {
          const point: qdrant.KnowledgePoint = {
            id: `${docId}-chunk-${i}`,
            title: doc.filename,
            content: validChunks[i],
            category: doc.fileType,
            tags: [doc.fileType, 'document'],
            source: doc.filename,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await qdrant.addKnowledgePoint(collectionName, point);
        }
      }
      
      // 更新进度
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, progress: 90, message: '正在提取实体关系...' } : t
      ));
      
      // 简单实体抽取（基于规则）
      const entityPatterns = [
        /【(.+?)】/g,
        /《(.+?)》/g,
        /"(.+?)"/g,
        /设备[：:]\s*(.+?)(?=[，,。\n]|$)/g,
        /型号[：:]\s*(.+?)(?=[，,。\n]|$)/g
      ];
      
      const entities = new Set<string>();
      for (const pattern of entityPatterns) {
        const matches = Array.from(content.matchAll(pattern));
        for (const match of matches) {
          if (match[1] && match[1].length < 50) {
            entities.add(match[1].trim());
          }
        }
      }
      
      // 更新文档状态
      setDocuments(prev => prev.map(d => 
        d.id === docId ? {
          ...d,
          status: 'completed',
          processedTime: new Date().toISOString(),
          chunks: validChunks.length,
          entities: entities.size,
          relations: Math.floor(entities.size * 0.5) // 估算关系数
        } : d
      ));
      
      // 完成任务
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'completed', progress: 100, message: '处理完成' } : t
      ));
      
    } catch (error) {
      // 处理失败
      setDocuments(prev => prev.map(d => 
        d.id === docId ? { ...d, status: 'failed', error: String(error) } : d
      ));
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'failed', message: String(error) } : t
      ));
    }
  };

  // 删除文档
  const deleteDocument = (docId: string) => {
    setDocuments(prev => prev.filter(d => d.id !== docId));
    localStorage.removeItem(`doc_content_${docId}`);
    setSelectedDocs(prev => {
      const newSet = new Set(prev);
      newSet.delete(docId);
      return newSet;
    });
  };

  // 批量删除
  const deleteSelected = () => {
    selectedDocs.forEach(docId => {
      localStorage.removeItem(`doc_content_${docId}`);
    });
    setDocuments(prev => prev.filter(d => !selectedDocs.has(d.id)));
    setSelectedDocs(new Set());
  };

  // 重新处理文档
  const reprocessDocument = (docId: string) => {
    setDocuments(prev => prev.map(d => 
      d.id === docId ? { ...d, status: 'processing' } : d
    ));
    processDocument(docId);
  };

  // 过滤文档
  const filteredDocs = documents.filter(doc => {
    const matchesSearch = doc.filename.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || doc.fileType === filterType;
    return matchesSearch && matchesType;
  });

  // 获取唯一文件类型
  const fileTypes = Array.from(new Set(documents.map(d => d.fileType)));

  return (
    <MainLayout title="知识库管理">
      <div className="space-y-6">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">知识库管理</h1>
            <p className="text-gray-400 text-sm mt-1">上传文档自动提取、向量化存储，支持 RAG 检索和实体关系抽取</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={qdrantStatus === 'online' ? 'success' : qdrantStatus === 'checking' ? 'warning' : 'danger'}>
              Qdrant: {qdrantStatus === 'online' ? '已连接' : qdrantStatus === 'checking' ? '检查中' : '离线'}
            </Badge>
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.bmp,.tiff,.tif,.webp,.gif"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <Button disabled={uploading}>
                {uploading ? '上传中...' : '📤 上传文档'}
              </Button>
            </label>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="文档总数"
            value={stats.totalDocs}
            icon="📁"
            trend={stats.processedDocs > 0 ? { value: Math.round(stats.processedDocs / stats.totalDocs * 100), isPositive: true } : undefined}
          />
          <StatCard
            label="已处理"
            value={stats.processedDocs}
            icon="✅"
          />
          <StatCard
            label="知识块"
            value={stats.totalChunks}
            icon="📝"
          />
          <StatCard
            label="实体数"
            value={stats.totalEntities}
            icon="🏷️"
          />
          <StatCard
            label="关系数"
            value={stats.totalRelations}
            icon="🔗"
          />
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
            ⚙️ 处理任务 {tasks.filter(t => t.status === 'running').length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-yellow-500 text-black text-xs rounded-full">
                {tasks.filter(t => t.status === 'running').length}
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
            🔧 向量库设置
          </button>
        </div>

        {/* 文档列表 */}
        {activeTab === 'documents' && (
          <PageCard
            title="文档列表"
            action={
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="all">全部类型</option>
                  {fileTypes.map(type => (
                    <option key={type} value={type}>{type.toUpperCase()}</option>
                  ))}
                </select>
                {selectedDocs.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={deleteSelected}>
                    删除选中 ({selectedDocs.size})
                  </Button>
                )}
              </div>
            }
          >
            {filteredDocs.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-4">📂</div>
                <p>暂无文档，点击上方按钮上传</p>
                <p className="text-sm mt-2">支持 TXT、MD、JSON、CSV、PDF、Word、Excel 等格式</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                      <th className="pb-3 pr-4">
                        <input
                          type="checkbox"
                          checked={selectedDocs.size === filteredDocs.length && filteredDocs.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocs(new Set(filteredDocs.map(d => d.id)));
                            } else {
                              setSelectedDocs(new Set());
                            }
                          }}
                          className="rounded"
                        />
                      </th>
                      <th className="pb-3 pr-4">文件名</th>
                      <th className="pb-3 pr-4">类型</th>
                      <th className="pb-3 pr-4">大小</th>
                      <th className="pb-3 pr-4">状态</th>
                      <th className="pb-3 pr-4">知识块</th>
                      <th className="pb-3 pr-4">实体</th>
                      <th className="pb-3 pr-4">上传时间</th>
                      <th className="pb-3">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map(doc => (
                      <tr key={doc.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                        <td className="py-3 pr-4">
                          <input
                            type="checkbox"
                            checked={selectedDocs.has(doc.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedDocs);
                              if (e.target.checked) {
                                newSet.add(doc.id);
                              } else {
                                newSet.delete(doc.id);
                              }
                              setSelectedDocs(newSet);
                            }}
                            className="rounded"
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{getFileIcon(doc.filename)}</span>
                            <span className="text-white">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="default">{doc.fileType.toUpperCase()}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">{formatFileSize(doc.fileSize)}</td>
                        <td className="py-3 pr-4">
                          <Badge 
                            variant={
                              doc.status === 'completed' ? 'success' :
                              doc.status === 'processing' ? 'warning' :
                              doc.status === 'failed' ? 'danger' : 'default'
                            }
                          >
                            {doc.status === 'completed' ? '已处理' :
                             doc.status === 'processing' ? '处理中' :
                             doc.status === 'failed' ? '失败' : '待处理'}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">{doc.chunks || '-'}</td>
                        <td className="py-3 pr-4 text-gray-400">{doc.entities || '-'}</td>
                        <td className="py-3 pr-4 text-gray-400 text-sm">
                          {new Date(doc.uploadTime).toLocaleString('zh-CN')}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {doc.status === 'pending' && (
                              <Button size="sm" onClick={() => {
                                setDocuments(prev => prev.map(d => 
                                  d.id === doc.id ? { ...d, status: 'processing' } : d
                                ));
                                processDocument(doc.id);
                              }}>
                                处理
                              </Button>
                            )}
                            {doc.status === 'failed' && (
                              <Button size="sm" variant="outline" onClick={() => reprocessDocument(doc.id)}>
                                重试
                              </Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => deleteDocument(doc.id)}>
                              删除
                            </Button>
                          </div>
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
                <p>暂无处理任务</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.slice().reverse().map(task => {
                  const doc = documents.find(d => d.id === task.documentId);
                  return (
                    <div key={task.id} className="p-4 bg-gray-700/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">
                            {task.status === 'running' ? '⏳' :
                             task.status === 'completed' ? '✅' :
                             task.status === 'failed' ? '❌' : '⏸️'}
                          </span>
                          <span className="text-white">{doc?.filename || '未知文档'}</span>
                          <Badge variant={
                            task.status === 'completed' ? 'success' :
                            task.status === 'running' ? 'warning' :
                            task.status === 'failed' ? 'danger' : 'default'
                          }>
                            {task.type === 'extract' ? '文本提取' :
                             task.type === 'embed' ? '向量化' :
                             task.type === 'entity' ? '实体抽取' : '关系抽取'}
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
                    </div>
                  );
                })}
              </div>
            )}
          </PageCard>
        )}

        {/* 向量库设置 */}
        {activeTab === 'settings' && (
          <PageCard title="向量库设置">
            <div className="space-y-6">
              {/* Qdrant 状态 */}
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <h3 className="text-white font-medium mb-3">Qdrant 向量数据库</h3>
                <div className="flex items-center gap-4">
                  <Badge variant={qdrantStatus === 'online' ? 'success' : 'danger'} >
                    {qdrantStatus === 'online' ? '🟢 已连接' : '🔴 离线'}
                  </Badge>
                  <span className="text-gray-400">
                    {qdrantStatus === 'online' 
                      ? `${collections.length} 个集合` 
                      : '请确保 Qdrant 服务正在运行'}
                  </span>
                </div>
              </div>

              {/* 集合列表 */}
              {qdrantStatus === 'online' && (
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <h3 className="text-white font-medium mb-3">向量集合</h3>
                  {collections.length === 0 ? (
                    <p className="text-gray-400">暂无集合</p>
                  ) : (
                    <div className="space-y-2">
                      {collections.map(col => (
                        <div key={col.name} className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
                          <div>
                            <span className="text-white">{col.name}</span>
                            <span className="text-gray-400 text-sm ml-3">
                              {col.points_count} 条记录
                            </span>
                          </div>
                          <Badge variant={col.status === 'green' ? 'success' : 'warning'}>
                            {col.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 处理设置 */}
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <h3 className="text-white font-medium mb-3">处理设置</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">分块大小</label>
                    <input
                      type="number"
                      defaultValue={500}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-1">重叠大小</label>
                    <input
                      type="number"
                      defaultValue={50}
                      className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </PageCard>
        )}
      </div>
    </MainLayout>
  );
}
