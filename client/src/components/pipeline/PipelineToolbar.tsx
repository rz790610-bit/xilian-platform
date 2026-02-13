/**
 * Pipeline 编辑器工具栏
 * 提供保存、运行、导入导出、模板等操作
 * 紧凑布局，与数据库工作台风格一致
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { useToast } from '@/components/common/Toast';
import { trpc } from '@/lib/trpc';
import {
  Save, Play, Square, Download, Upload, Trash2,
  Copy, ChevronDown, ZoomIn, ZoomOut, Maximize2, Loader2, Plus, List
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { editorStateToDAGConfig, dagConfigToEditorState, validateEditorState } from '@shared/pipelineTypes';

export function PipelineToolbar() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const {
    editor,
    currentPipelineId,
    currentPipelineName,
    currentPipelineDescription,
    hasUnsavedChanges,
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
    resetEditor,
    loadEditorState,
    setZoom,
    setPan,
  } = usePipelineEditorStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);

  // tRPC mutations
  const createPipeline = trpc.pipeline.create.useMutation();
  const startPipeline = trpc.pipeline.start.useMutation();
  const stopPipeline = trpc.pipeline.stop.useMutation();
  const runPipeline = trpc.pipeline.run.useMutation();
  const deletePipeline = trpc.pipeline.delete.useMutation();

  // tRPC queries
  const { refetch: refetchPipelines } = trpc.pipeline.list.useQuery(undefined, { enabled: false });

  // 新建
  const handleNew = () => {
    if (editor.nodes.length > 0 && !confirm('当前有未保存的更改，确定要新建吗？')) return;
    newPipeline();
    toast.info('已创建新的 Pipeline');
  };

  // 保存
  const handleSave = () => {
    const validation = validate();
    if (!validation.valid) {
      toast.error(`验证失败: ${validation.errors[0]}`);
      return;
    }
    setShowSaveDialog(true);
  };

  const handleConfirmSave = async () => {
    setIsSaving(true);
    try {
      const config = savePipeline();
      if (!config) { toast.error('无法生成配置'); return; }
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

  // 运行
  const handleRun = async () => {
    if (!currentPipelineId) { toast.error('请先保存 Pipeline'); return; }
    setIsLoading(true);
    try {
      const result = await runPipeline.mutateAsync({ id: currentPipelineId });
      if (result.success) {
        toast.success(`运行成功: 处理 ${result.recordsProcessed} 条记录，耗时 ${result.durationMs}ms`);
      } else {
        toast.warning(`运行完成，但有 ${result.errors} 个错误`);
      }
    } catch (error) {
      toast.error(`运行失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 启动
  const handleStart = async () => {
    if (!currentPipelineId) { toast.error('请先保存 Pipeline'); return; }
    setIsLoading(true);
    try {
      await startPipeline.mutateAsync({ id: currentPipelineId });
      toast.success('Pipeline 已启动');
    } catch (error) {
      toast.error(`启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 停止
  const handleStop = async () => {
    if (!currentPipelineId) return;
    setIsLoading(true);
    try {
      await stopPipeline.mutateAsync({ id: currentPipelineId });
      toast.success('Pipeline 已停止');
    } catch (error) {
      toast.error(`停止失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 打开列表
  const handleOpenList = async () => {
    setIsLoading(true);
    try {
      const result = await refetchPipelines();
      if (result.data) {
        setPipelines(result.data.map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status as any,
          category: p.category as any,
          metrics: {
            totalRecordsProcessed: 0,
            totalErrors: 0,
            lastRunAt: p.lastRunAt ? new Date(p.lastRunAt).getTime() : undefined,
            averageProcessingTimeMs: 0,
          },
          createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
          updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
        })));
      }
      setShowListDialog(true);
    } catch { toast.error('获取列表失败'); }
    finally { setIsLoading(false); }
  };

  // 加载
  const handleLoadPipeline = async (pipelineId: string) => {
    setIsLoading(true);
    try {
      const result = await utils.pipeline.get.fetch({ id: pipelineId });
      loadPipeline(result.config as any);
      setSelectedPipelineStatus(result as any);
      setShowListDialog(false);
      toast.success(`已加载: ${result.config.name}`);
    } catch { toast.error('加载失败'); }
    finally { setIsLoading(false); }
  };

  // 删除
  const handleDeletePipeline = async (pipelineId: string) => {
    if (!confirm('确定要删除此 Pipeline 吗？')) return;
    try {
      await deletePipeline.mutateAsync({ id: pipelineId });
      toast.success('已删除');
      refetchPipelines();
      if (currentPipelineId === pipelineId) newPipeline();
    } catch { toast.error('删除失败'); }
  };

  // 导出
  const handleExport = () => {
    const config = savePipeline();
    if (!config) { toast.error('请先完成配置'); return; }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('配置已导出');
  };

  // 导入
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
      } catch { toast.error('导入失败：无效的配置文件'); }
    };
    input.click();
  };

  // 复制 JSON
  const handleCopyJSON = () => {
    const config = savePipeline();
    if (!config) return;
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast.success('已复制到剪贴板');
  };

  // 清空画布
  const handleReset = () => {
    if (editor.nodes.length > 0 && !confirm('确定要清空画布吗？')) return;
    resetEditor();
    toast.info('画布已清空');
  };

  // 适应画布
  const handleFitView = () => {
    setZoom(1);
    setPan(0, 0);
  };

  const currentStatus = selectedPipelineStatus?.status;
  const isRunning = currentStatus === 'running';

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-card">
        {/* Pipeline 名称和状态 */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold truncate max-w-[120px]">{currentPipelineName}</span>
          {currentPipelineId && currentStatus && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              currentStatus === 'running' ? 'bg-green-500/10 text-green-500' :
              currentStatus === 'error' ? 'bg-red-500/10 text-red-500' :
              'bg-muted text-muted-foreground'
            }`}>{currentStatus}</span>
          )}
          {hasUnsavedChanges && <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* 文件操作 */}
        <Button size="sm" variant="ghost" onClick={handleNew} className="h-7 text-xs gap-1 px-2">
          <Plus className="w-3 h-3" />新建
        </Button>
        <Button size="sm" variant="ghost" onClick={handleOpenList} className="h-7 text-xs gap-1 px-2">
          <List className="w-3 h-3" />列表
        </Button>
        <Button size="sm" variant="outline" onClick={handleSave} disabled={isSaving} className="h-7 text-xs gap-1 px-2">
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}保存
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* 运行控制 */}
        {isRunning ? (
          <Button size="sm" variant="destructive" onClick={handleStop} disabled={isLoading} className="h-7 text-xs gap-1 px-2">
            <Square className="w-3 h-3" />停止
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={handleRun} disabled={isLoading || !currentPipelineId} className="h-7 text-xs gap-1 px-2">
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}运行
            </Button>
            <Button size="sm" variant="outline" onClick={handleStart} disabled={isLoading || !currentPipelineId} className="h-7 text-xs gap-1 px-2">
              <Play className="w-3 h-3" />启动
            </Button>
          </>
        )}

        <div className="w-px h-5 bg-border mx-1" />

        {/* 缩放控制 */}
        <Button size="sm" variant="ghost" onClick={() => setZoom(Math.max(0.25, editor.zoom - 0.1))} className="h-7 w-7 p-0">
          <ZoomOut className="w-3 h-3" />
        </Button>
        <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">{Math.round(editor.zoom * 100)}%</span>
        <Button size="sm" variant="ghost" onClick={() => setZoom(Math.min(2, editor.zoom + 0.1))} className="h-7 w-7 p-0">
          <ZoomIn className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleFitView} className="h-7 w-7 p-0" title="适应画布">
          <Maximize2 className="w-3 h-3" />
        </Button>

        <div className="flex-1" />

        {/* 更多操作 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1">
              更多 <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={handleExport}>
              <Download className="w-3 h-3 mr-2" />导出 JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImport}>
              <Upload className="w-3 h-3 mr-2" />导入 JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyJSON}>
              <Copy className="w-3 h-3 mr-2" />复制为 JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleReset} className="text-red-500">
              <Trash2 className="w-3 h-3 mr-2" />清空画布
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 节点统计 */}
        <div className="text-[10px] text-muted-foreground ml-2">
          {editor.nodes.length} 节点 · {editor.connections.length} 连线
        </div>
      </div>

      {/* 保存对话框 */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存 Pipeline</DialogTitle>
            <DialogDescription>输入 Pipeline 名称和描述</DialogDescription>
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
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>取消</Button>
            <Button onClick={handleConfirmSave} disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline 列表对话框 */}
      <Dialog open={showListDialog} onOpenChange={setShowListDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pipeline 列表</DialogTitle>
            <DialogDescription>选择要加载的 Pipeline</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {pipelines.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无保存的 Pipeline</p>
            ) : (
              <div className="space-y-2">
                {pipelines.map(pipeline => (
                  <div key={pipeline.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-secondary/50">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{pipeline.name}</div>
                      <div className="text-xs text-muted-foreground">
                        状态: {pipeline.status} | 处理: {pipeline.metrics.totalRecordsProcessed} | 错误: {pipeline.metrics.totalErrors}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleLoadPipeline(pipeline.id)}>加载</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeletePipeline(pipeline.id)}>删除</Button>
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
