import { useRef, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/stores/appStore';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { 
  Upload, 
  FolderUp, 
  RefreshCw, 
  Search, 
  Trash2, 
  Tag, 
  Download,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  File
} from 'lucide-react';
import type { DataFile } from '@/types';
import { useToast } from '@/components/common/Toast';

export default function DataManage() {
  const { 
    dataFiles, 
    addDataFile, 
    removeDataFile,
    dataTags,
    selectedFiles,
    toggleFileSelect,
    clearFileSelection,
    batchMode,
    setBatchMode
  } = useAppStore();
  const toast = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('time_desc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const type = getFileType(file.name);
      const newFile: DataFile = {
        id: nanoid(),
        name: file.name,
        type,
        size: file.size,
        tags: [],
        uploadedAt: new Date()
      };
      addDataFile(newFile);
    });

    toast.success(`已上传 ${files.length} 个文件`);
    e.target.value = '';
  };

  const getFileType = (filename: string): DataFile['type'] => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['csv', 'xlsx', 'xls'].includes(ext || '')) return 'csv';
    if (['doc', 'docx', 'pdf', 'txt', 'md'].includes(ext || '')) return 'doc';
    if (['mp4', 'mp3', 'wav', 'avi'].includes(ext || '')) return 'media';
    if (['dwg', 'dxf'].includes(ext || '')) return 'cad';
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return 'image';
    return 'other';
  };

  const getFileIcon = (type: DataFile['type']) => {
    switch (type) {
      case 'csv': return <FileSpreadsheet className="w-5 h-5 text-success" />;
      case 'doc': return <FileText className="w-5 h-5 text-primary" />;
      case 'media': return <Film className="w-5 h-5 text-purple" />;
      case 'image': return <ImageIcon className="w-5 h-5 text-warning" />;
      default: return <File className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredFiles = dataFiles
    .filter(file => {
      if (typeFilter !== 'all' && file.type !== typeFilter) return false;
      if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'time_asc': return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
        case 'name_asc': return a.name.localeCompare(b.name);
        case 'size_desc': return b.size - a.size;
        default: return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      }
    });

  const handleBatchDelete = () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`确定删除选中的 ${selectedFiles.length} 个文件吗？`)) return;
    
    (selectedFiles || []).forEach(id => removeDataFile(id));
    clearFileSelection();
    toast.success('已删除选中文件');
  };

  return (
    <MainLayout title="数据管理">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">📁 数据管理</h2>
            <p className="text-muted-foreground">智能管理各类数据文件</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              上传数据
            </Button>
            <Button variant="secondary" onClick={() => folderInputRef.current?.click()}>
              <FolderUp className="w-4 h-4 mr-2" />
              上传文件夹
            </Button>
            <Button variant="ghost" size="icon" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory=""
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Search and filter */}
        <PageCard className="mb-5">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex-1 min-w-[300px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 搜索文件名、内容、标签..."
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="全部类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="csv">📊 表格数据</SelectItem>
                <SelectItem value="doc">📄 文档</SelectItem>
                <SelectItem value="media">🎬 音视频</SelectItem>
                <SelectItem value="cad">📐 CAD</SelectItem>
                <SelectItem value="image">🖼️ 图片</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="time_desc">最新上传</SelectItem>
                <SelectItem value="time_asc">最早上传</SelectItem>
                <SelectItem value="name_asc">名称 A-Z</SelectItem>
                <SelectItem value="size_desc">大小 ↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PageCard>

        {/* Batch action bar */}
        {batchMode && selectedFiles.length > 0 && (
          <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-xl mb-5">
            <span className="text-sm">已选择 {selectedFiles.length} 个文件</span>
            <div className="flex gap-2 ml-auto">
              <Button variant="secondary" size="sm" onClick={() => toast.info('移动功能开发中')}>
                移动
              </Button>
              <Button variant="secondary" size="sm" onClick={() => toast.info('标签功能开发中')}>
                <Tag className="w-4 h-4 mr-1" />
                打标签
              </Button>
              <Button variant="secondary" size="sm" onClick={() => toast.info('导出功能开发中')}>
                <Download className="w-4 h-4 mr-1" />
                导出
              </Button>
              <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                <Trash2 className="w-4 h-4 mr-1" />
                删除
              </Button>
            </div>
          </div>
        )}

        {/* File list */}
        <PageCard
          title="文件列表"
          icon="📁"
          action={
            <Button
              variant={batchMode ? 'default' : 'secondary'}
              size="sm"
              onClick={() => {
                setBatchMode(!batchMode);
                if (batchMode) clearFileSelection();
              }}
            >
              {batchMode ? '取消批量' : '批量操作'}
            </Button>
          }
        >
          {filteredFiles.length > 0 ? (
            <div className="space-y-2">
              {(filteredFiles || []).map((file) => (
                <div
                  key={file.id}
                  className={cn(
                    "flex items-center gap-4 p-4 bg-secondary rounded-xl transition-colors",
                    selectedFiles.includes(file.id) && "bg-primary/20"
                  )}
                >
                  {batchMode && (
                    <Checkbox
                      checked={selectedFiles.includes(file.id)}
                      onCheckedChange={() => toggleFileSelect(file.id)}
                    />
                  )}
                  {getFileIcon(file.type)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} · {new Date(file.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(file.tags || []).map((tag, i) => (
                      <Badge key={i} variant="info">{tag}</Badge>
                    ))}
                  </div>
                  {!batchMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        removeDataFile(file.id);
                        toast.success('文件已删除');
                      }}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <File className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无数据文件</p>
              <p className="text-sm mt-1">点击上方按钮上传文件</p>
            </div>
          )}
        </PageCard>
      </div>
    </MainLayout>
  );
}
