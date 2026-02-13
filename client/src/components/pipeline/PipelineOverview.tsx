import type { PipelineListItem } from '@shared/pipelineTypes';

interface PipelineOverviewProps {
  pipelines: PipelineListItem[];
  onEdit: (id: string) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function PipelineOverview({ pipelines, onEdit, onRun, onDelete, onRefresh, isLoading }: PipelineOverviewProps) {
  if (isLoading) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">加载中...</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pipeline 概览</h3>
        <button onClick={onRefresh} className="text-sm text-primary hover:underline">刷新</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pipelines.map(p => (
          <div key={p.id} className="p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{p.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${p.status === 'running' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{p.description || '暂无描述'}</p>
            <div className="flex gap-2">
              <button onClick={() => onEdit(p.id)} className="text-xs text-primary hover:underline">编辑</button>
              <button onClick={() => onRun(p.id)} className="text-xs text-primary hover:underline">运行</button>
              <button onClick={() => onDelete(p.id)} className="text-xs text-red-500 hover:underline">删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
