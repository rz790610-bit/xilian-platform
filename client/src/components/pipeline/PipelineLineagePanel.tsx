import type { PipelineListItem } from '@shared/pipelineTypes';

interface PipelineLineagePanelProps {
  pipelines: PipelineListItem[];
}

export function PipelineLineagePanel({ pipelines }: PipelineLineagePanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">数据血缘</h3>
      <div className="space-y-3">
        {pipelines.map(p => (
          <div key={p.id} className="p-4 rounded-lg border bg-card">
            <span className="font-medium">{p.name}</span>
            <div className="text-xs text-muted-foreground mt-1">
              节点数: {p.config?.nodes?.length || 0} | 连接数: {p.config?.connections?.length || 0}
            </div>
          </div>
        ))}
        {pipelines.length === 0 && (
          <div className="text-center text-muted-foreground py-8">暂无 Pipeline 血缘数据</div>
        )}
      </div>
    </div>
  );
}
