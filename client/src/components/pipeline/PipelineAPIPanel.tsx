import type { PipelineListItem } from '@shared/pipelineTypes';

interface PipelineAPIPanelProps {
  pipelines: PipelineListItem[];
}

export function PipelineAPIPanel({ pipelines }: PipelineAPIPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">API 端点</h3>
      <div className="space-y-3">
        {pipelines.map(p => (
          <div key={p.id} className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{p.name}</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">POST /api/pipeline/{p.id}/trigger</code>
            </div>
            <div className="text-xs text-muted-foreground">
              状态: {p.status} | 类别: {p.category || '-'}
            </div>
          </div>
        ))}
        {pipelines.length === 0 && (
          <div className="text-center text-muted-foreground py-8">暂无 Pipeline</div>
        )}
      </div>
    </div>
  );
}
