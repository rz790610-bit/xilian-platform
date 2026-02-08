/**
 * Pipeline 可视化编辑器页面
 * 工程化商用版本 - 与后端 API 完全对接
 */

import { useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PipelineCanvas } from '@/components/pipeline/PipelineCanvas';
import { PipelineComponentPanel } from '@/components/pipeline/PipelineComponentPanel';
import { PipelineConfigPanel } from '@/components/pipeline/PipelineConfigPanel';
import { PipelineToolbar } from '@/components/pipeline/PipelineToolbar';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default function PipelineEditor() {
  const {
    selectedPipelineStatus,
    currentPipelineId,
    setSelectedPipelineStatus,
  } = usePipelineEditorStore();

  // 定时刷新运行中的 Pipeline 状态
  const { data: statusData } = trpc.pipeline.get.useQuery(
    { id: currentPipelineId || '' },
    {
      enabled: !!currentPipelineId && selectedPipelineStatus?.status === 'running',
      refetchInterval: 5000,
    }
  );

  useEffect(() => {
    if (statusData) {
      setSelectedPipelineStatus(statusData as any);
    }
  }, [statusData, setSelectedPipelineStatus]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* 工具栏 */}
        <PipelineToolbar />

        {/* 主内容区 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧组件面板 */}
          <PipelineComponentPanel />

          {/* 中间画布 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-4">
              <PipelineCanvas className="h-full" />
            </div>

            {/* 底部状态面板 */}
            {selectedPipelineStatus && (
              <div className="h-32 border-t border-border bg-card p-4">
                <div className="grid grid-cols-4 gap-4 h-full">
                  {/* 状态 */}
                  <Card className="bg-secondary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        运行状态
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-lg font-bold ${
                        selectedPipelineStatus.status === 'running' ? 'text-green-500' :
                        selectedPipelineStatus.status === 'paused' ? 'text-yellow-500' :
                        selectedPipelineStatus.status === 'error' ? 'text-red-500' :
                        'text-muted-foreground'
                      }`}>
                        {selectedPipelineStatus.status === 'running' ? '运行中' :
                         selectedPipelineStatus.status === 'paused' ? '已暂停' :
                         selectedPipelineStatus.status === 'stopped' ? '已停止' :
                         selectedPipelineStatus.status === 'error' ? '错误' :
                         selectedPipelineStatus.status}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 处理记录数 */}
                  <Card className="bg-secondary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        处理记录
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold">
                        {selectedPipelineStatus.metrics.totalRecordsProcessed.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 错误数 */}
                  <Card className="bg-secondary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        错误数
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`text-lg font-bold ${
                        selectedPipelineStatus.metrics.totalErrors > 0 ? 'text-red-500' : ''
                      }`}>
                        {selectedPipelineStatus.metrics.totalErrors}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 平均处理时间 */}
                  <Card className="bg-secondary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        平均耗时
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold">
                        {selectedPipelineStatus.metrics.averageProcessingTimeMs.toFixed(0)} ms
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>

          {/* 右侧配置面板 */}
          <PipelineConfigPanel />
        </div>
      </div>
    </DashboardLayout>
  );
}
