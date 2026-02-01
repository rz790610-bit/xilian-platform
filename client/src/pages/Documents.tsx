import { useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/appStore';
import { nanoid } from 'nanoid';
import { Trash2, Upload, FileText } from 'lucide-react';
import type { Document } from '@/types';
import { useToast } from '@/components/common/Toast';

export default function Documents() {
  const { documents, addDocument, removeDocument, setDocuments } = useAppStore();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const doc: Document = {
        id: nanoid(),
        filename: file.name,
        size: file.size,
        type: file.name.split('.').pop() || 'unknown',
        uploadedAt: new Date()
      };
      addDocument(doc);
    }

    toast.success(`已上传 ${files.length} 个文件`);
    e.target.value = '';
  };

  const handleDelete = (id: string) => {
    removeDocument(id);
    toast.success('文档已删除');
  };

  const handleClearAll = () => {
    if (confirm('确定要清空所有文档吗？')) {
      setDocuments([]);
      toast.info('已清空所有文档');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const totalChars = documents.reduce((sum, doc) => sum + (doc.content?.length || 0), 0);

  return (
    <MainLayout title="文档管理">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">文档管理</h2>
          <p className="text-muted-foreground">上传和管理分析文档</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* Upload area */}
          <PageCard title="上传文档" icon="📤">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">点击上传 .docx .txt .md 文件</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.txt,.md"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </PageCard>

          {/* Stats */}
          <PageCard title="统计信息" icon="📊">
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                value={documents.length}
                label="文档数量"
                icon="📄"
              />
              <StatCard
                value={totalChars}
                label="总字符数"
                icon="📝"
              />
            </div>
          </PageCard>
        </div>

        {/* Document list */}
        <PageCard
          title="文档列表"
          icon="📚"
          action={
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleClearAll}
              disabled={documents.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              清空
            </Button>
          }
        >
          {documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-secondary rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <div>
                      <div className="font-medium">{doc.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    className="text-danger hover:text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无文档</p>
            </div>
          )}
        </PageCard>
      </div>
    </MainLayout>
  );
}
