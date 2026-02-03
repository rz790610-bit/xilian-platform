/**
 * Pipeline 编辑器工具栏
 * 提供保存、运行、导入导出等操作
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';
import {
  Save,
  Play,
  Square,
  Pause,
  Download,
  Upload,
  Plus,
  List,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function PipelineToolbar() {
  const toast = useToast();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);

  const {
    currentPipelineId,
    currentPipelineName,
    currentPipelineDescription,
    validationErrors,
    isLoading,
    isSaving,
    pipelines,
    selectedPipelineStatus,
    newPipeline,
    savePipeline,
    loadPipeline,
    setPipelineInfo,
    setPipelines,
    setSelectedPipelineStatus,
    setIsLoading,
    setIsSaving,
    validate,
    editor,
  } = usePipelineEditorStore();

  // tRPC mutations
  const createPipeline = trpc.pipeline.create.useMutation();
  const startPipeline = trpc.pipeline.start.useMutation();
  const stopPipeline = trpc.pipeline.stop.useMutation();
  const pausePipeline = trpc.pipeline.pause.useMutation();
  const runPipeline = trpc.pipeline.run.useMutation();
  const deletePipeline = trpc.pipeline.delete.useMutation();

  // tRPC queries
  const { refetch: refetchPipelines } = trpc.pipeline.list.useQuery(undefined, {
    enabled: false,
  });

  const { refetch: refetchStatus } = trpc.pipeline.get.useQuery(
    { id: currentPipelineId || '' },
    {
      enabled: false,
    }
  );

  // 新建 Pipeline
  const handleNew = () => {
    if (editor.nodes.length > 0) {
      if (!confirm('当前有未保存的更改，确定要新建吗？')) {
        return;
      }
    }
    newPipeline();
    toast.info('已创建新的 Pipeline');
  };

  // 保存 Pipeline
  const handleSave = async () => {
    const validation = validate();
    if (!validation.valid) {
      toast.error(`配置验证失败: ${validation.errors[0]}`);
      return;
    }

    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      const config = savePipeline();
      if (!config) {
        toast.error('无法生成 Pipeline 配置');
        return;
      }

      await createPipeline.mutateAsync(config);
      toast.success('Pipeline 保存成功');
      setShowSaveDialog(false);
      refetchPipelines();
    } catch (error) {
      toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 运行 Pipeline
  const handleRun = async () => {
    if (!currentPipelineId) {
      toast.error('请先保存 Pipeline');
      return;
    }

    setIsLoading(true);
    try {
      const result = await runPipeline.mutateAsync({ id: currentPipelineId });
      if (result.success) {
        toast.success(`运行成功: 处理 ${result.recordsProcessed} 条记录，耗时 ${result.durationMs}ms`);
      } else {
        toast.warning(`运行完成，但有 ${result.errors} 个错误`);
      }
      refetchStatus();
    } catch (error) {
      toast.error(`运行失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 启动 Pipeline
  const handleStart = async () => {
    if (!currentPipelineId) {
      toast.error('请先保存 Pipeline');
      return;
    }

    setIsLoading(true);
    try {
      await startPipeline.mutateAsync({ id: currentPipelineId });
      toast.success('Pipeline 已启动');
      refetchStatus();
    } catch (error) {
      toast.error(`启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 停止 Pipeline
  const handleStop = async () => {
    if (!currentPipelineId) return;

    setIsLoading(true);
    try {
      await stopPipeline.mutateAsync({ id: currentPipelineId });
      toast.success('Pipeline 已停止');
      refetchStatus();
    } catch (error) {
      toast.error(`停止失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 暂停 Pipeline
  const handlePause = async () => {
    if (!currentPipelineId) return;

    setIsLoading(true);
    try {
      await pausePipeline.mutateAsync({ id: currentPipelineId });
      toast.success('Pipeline 已暂停');
      refetchStatus();
    } catch (error) {
      toast.error(`暂停失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 打开 Pipeline 列表
  const handleOpenList = async () => {
    setIsLoading(true);
    try {
      const result = await refetchPipelines();
      if (result.data) {
        setPipelines(result.data);
      }
      setShowListDialog(true);
    } catch (error) {
      toast.error('获取列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 加载选中的 Pipeline
  const handleLoadPipeline = async (pipelineId: string) => {
    setIsLoading(true);
    try {
      // 使用 refetch 并传入新的参数
      const result = await trpc.useUtils().pipeline.get.fetch({ id: pipelineId });
      loadPipeline(result.config as any);
      setSelectedPipelineStatus(result as any);
      setShowListDialog(false);
      toast.success(`已加载 Pipeline: ${result.config.name}`);
    } catch (error) {
      toast.error('加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 删除 Pipeline
  const handleDeletePipeline = async (pipelineId: string) => {
    if (!confirm('确定要删除此 Pipeline 吗？')) return;

    try {
      await deletePipeline.mutateAsync({ id: pipelineId });
      toast.success('Pipeline 已删除');
      refetchPipelines();
      if (currentPipelineId === pipelineId) {
        newPipeline();
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  // 导出配置
  const handleExport = () => {
    const config = savePipeline();
    if (!config) {
      toast.error('请先完成配置');
      return;
    }

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('配置已导出');
  };

  // 导入配置
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const config = JSON.parse(text);
        loadPipeline(config);
        toast.success('配置已导入');
      } catch (error) {
        toast.error('导入失败：无效的配置文件');
      }
    };
    input.click();
  };

  // 获取当前状态
  const currentStatus = selectedPipelineStatus?.status;
  const isRunning = currentStatus === 'running';
  const isPaused = currentStatus === 'paused';

  return (
    <>
      <div className="h-14 bg-card border-b border-border flex items-center justify-between px-4">
        {/* 左侧：Pipeline 信息 */}
        <div className="flex items-center gap-4">
          <div>
            <h2 className="font-semibold">{currentPipelineName}</h2>
            {currentPipelineId && (
              <p className="text-xs text-muted-foreground">
                ID: {currentPipelineId.slice(0, 8)}...
                {currentStatus && (
                  <span className={`ml-2 ${
                    currentStatus === 'running' ? 'text-green-500' :
                    currentStatus === 'paused' ? 'text-yellow-500' :
                    currentStatus === 'error' ? 'text-red-500' :
                    'text-muted-foreground'
                  }`}>
                    • {currentStatus}
                  </span>
                )}
              </p>
            )}
          </div>
          {validationErrors.length > 0 && (
            <div className="flex items-center gap-1 text-yellow-500 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>{validationErrors[0]}</span>
            </div>
          )}
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleNew}>
            <Plus className="w-4 h-4 mr-1" />
            新建
          </Button>

          <Button variant="outline" size="sm" onClick={handleOpenList}>
            <List className="w-4 h-4 mr-1" />
            列表
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="w-4 h-4 mr-1" />
            导入
          </Button>

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />
            导出
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button variant="outline" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            保存
          </Button>

          {currentPipelineId && (
            <>
              {isRunning ? (
                <>
                  <Button variant="outline" size="sm" onClick={handlePause} disabled={isLoading}>
                    <Pause className="w-4 h-4 mr-1" />
                    暂停
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleStop} disabled={isLoading}>
                    <Square className="w-4 h-4 mr-1" />
                    停止
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={handleRun} disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                    运行一次
                  </Button>
                  <Button variant="default" size="sm" onClick={handleStart} disabled={isLoading}>
                    <Play className="w-4 h-4 mr-1" />
                    启动
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 保存对话框 */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存 Pipeline</DialogTitle>
            <DialogDescription>
              输入 Pipeline 名称和描述
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={currentPipelineName}
                onChange={(e) => setPipelineInfo(e.target.value, currentPipelineDescription)}
                placeholder="Pipeline 名称"
              />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea
                value={currentPipelineDescription}
                onChange={(e) => setPipelineInfo(currentPipelineName, e.target.value)}
                placeholder="Pipeline 描述（可选）"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline 列表对话框 */}
      <Dialog open={showListDialog} onOpenChange={setShowListDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pipeline 列表</DialogTitle>
            <DialogDescription>
              选择要加载的 Pipeline
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {pipelines.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                暂无保存的 Pipeline
              </p>
            ) : (
              <div className="space-y-2">
                {pipelines.map(pipeline => (
                  <div
                    key={pipeline.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-secondary/50"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{pipeline.name}</div>
                      <div className="text-xs text-muted-foreground">
                        状态: {pipeline.status} | 
                        处理记录: {pipeline.metrics.totalRecordsProcessed} | 
                        错误: {pipeline.metrics.totalErrors}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLoadPipeline(pipeline.id)}
                      >
                        加载
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeletePipeline(pipeline.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
