/**
 * Pipeline 组件面板
 * 显示可拖拽的数据源、处理器和目标连接器
 */

import { cn } from '@/lib/utils';
import { SOURCE_TYPES, PROCESSOR_TYPES, SINK_TYPES } from '@shared/pipelineTypes';
import type { EditorNodeType, NodeSubType } from '@shared/pipelineTypes';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface ComponentItemProps {
  type: EditorNodeType;
  subType: NodeSubType;
  name: string;
  description: string;
  icon: string;
  disabled?: boolean;
}

function ComponentItem({ type, subType, name, description, icon, disabled }: ComponentItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify({ type, subType }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border border-border',
        'transition-all duration-200',
        disabled
          ? 'opacity-50 cursor-not-allowed bg-muted'
          : 'cursor-grab hover:border-primary/50 hover:bg-secondary/50 hover:shadow-sm active:cursor-grabbing'
      )}
    >
      <div className="text-2xl flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      </div>
    </div>
  );
}

interface CollapsibleSectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, icon, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left font-medium text-sm hover:text-primary transition-colors"
      >
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span>{icon}</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className="space-y-2 pl-6">{children}</div>}
    </div>
  );
}

export function PipelineComponentPanel({ className }: { className?: string }) {
  const { editor } = usePipelineEditorStore();

  // 检查是否已有 Source 或 Sink
  const hasSource = editor.nodes.some(n => n.type === 'source');
  const hasSink = editor.nodes.some(n => n.type === 'sink');

  return (
    <div className="w-64 h-full bg-card border-r border-border overflow-y-auto">
      <div className="p-4 border-b border-border">
        <h3 className="font-semibold">组件库</h3>
        <p className="text-xs text-muted-foreground mt-1">拖拽组件到画布</p>
      </div>

      <div className="p-4 space-y-6">
        {/* 数据源 */}
        <CollapsibleSection title="数据源" icon="📥">
          {SOURCE_TYPES.map(source => (
            <ComponentItem
              key={source.type}
              type="source"
              subType={source.type}
              name={source.name}
              description={source.description}
              icon={source.icon}
              disabled={hasSource}
            />
          ))}
          {hasSource && (
            <p className="text-xs text-muted-foreground italic">
              每个 Pipeline 只能有一个数据源
            </p>
          )}
        </CollapsibleSection>

        {/* 处理器 */}
        <CollapsibleSection title="处理器" icon="⚙️">
          {PROCESSOR_TYPES.map(processor => (
            <ComponentItem
              key={processor.type}
              type="processor"
              subType={processor.type}
              name={processor.name}
              description={processor.description}
              icon={processor.icon}
            />
          ))}
        </CollapsibleSection>

        {/* 目标连接器 */}
        <CollapsibleSection title="目标连接器" icon="📤">
          {SINK_TYPES.map(sink => (
            <ComponentItem
              key={sink.type}
              type="sink"
              subType={sink.type}
              name={sink.name}
              description={sink.description}
              icon={sink.icon}
              disabled={hasSink}
            />
          ))}
          {hasSink && (
            <p className="text-xs text-muted-foreground italic">
              每个 Pipeline 只能有一个目标连接器
            </p>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
