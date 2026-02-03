/**
 * Pipeline 节点组件
 * 显示单个节点，包含输入/输出端口
 */

import { cn } from '@/lib/utils';
import { NODE_WIDTH, NODE_HEIGHT } from '@/stores/pipelineEditorStore';
import type { EditorNode } from '@shared/pipelineTypes';
import { SOURCE_TYPES, PROCESSOR_TYPES, SINK_TYPES } from '@shared/pipelineTypes';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface PipelineNodeProps {
  node: EditorNode;
  isSelected: boolean;
  isConnecting: boolean;
  isConnectingFrom: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: () => void;
  onOutputPortClick: (e: React.MouseEvent) => void;
  onInputPortClick: (e: React.MouseEvent) => void;
}

// 获取节点图标
function getNodeIcon(node: EditorNode): string {
  if (node.type === 'source') {
    const info = SOURCE_TYPES.find(s => s.type === node.subType);
    return info?.icon || '📥';
  } else if (node.type === 'processor') {
    const info = PROCESSOR_TYPES.find(p => p.type === node.subType);
    return info?.icon || '⚙️';
  } else if (node.type === 'sink') {
    const info = SINK_TYPES.find(s => s.type === node.subType);
    return info?.icon || '📤';
  }
  return '📦';
}

// 获取节点颜色类
function getNodeColorClass(node: EditorNode): string {
  switch (node.type) {
    case 'source':
      return 'border-emerald-500/50 bg-emerald-500/5';
    case 'processor':
      return 'border-blue-500/50 bg-blue-500/5';
    case 'sink':
      return 'border-orange-500/50 bg-orange-500/5';
    default:
      return 'border-border';
  }
}

// 获取端口颜色类
function getPortColorClass(type: EditorNode['type']): string {
  switch (type) {
    case 'source':
      return 'bg-emerald-500';
    case 'processor':
      return 'bg-blue-500';
    case 'sink':
      return 'bg-orange-500';
    default:
      return 'bg-primary';
  }
}

export function PipelineNode({
  node,
  isSelected,
  isConnecting,
  isConnectingFrom,
  onMouseDown,
  onClick,
  onOutputPortClick,
  onInputPortClick,
}: PipelineNodeProps) {
  const icon = getNodeIcon(node);
  const colorClass = getNodeColorClass(node);
  const portColorClass = getPortColorClass(node.type);

  // 是否显示输入端口（Source 没有输入端口）
  const showInputPort = node.type !== 'source';
  // 是否显示输出端口（Sink 没有输出端口）
  const showOutputPort = node.type !== 'sink';

  return (
    <div
      className={cn(
        'absolute rounded-xl border-2 cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:scale-[1.02]',
        colorClass,
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg',
        isConnectingFrom && 'ring-2 ring-yellow-500 ring-offset-2 ring-offset-background',
        isConnecting && !isConnectingFrom && showInputPort && 'ring-2 ring-green-500/50'
      )}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* 节点内容 */}
      <div className="flex items-center h-full px-4 gap-3">
        <div className="text-2xl flex-shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{node.name}</div>
          <div className="text-xs text-muted-foreground truncate capitalize">
            {node.type === 'source' ? '数据源' : node.type === 'processor' ? '处理器' : '目标'}
          </div>
        </div>
        {/* 验证状态 */}
        <div className="flex-shrink-0">
          {node.validated ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <AlertCircle className="w-4 h-4 text-yellow-500" />
          )}
        </div>
      </div>

      {/* 输入端口 */}
      {showInputPort && (
        <div
          className={cn(
            'absolute w-3 h-3 rounded-full border-2 border-background cursor-crosshair',
            'transition-transform hover:scale-125',
            portColorClass,
            isConnecting && !isConnectingFrom && 'animate-pulse scale-125'
          )}
          style={{
            left: -6,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
          onClick={onInputPortClick}
        />
      )}

      {/* 输出端口 */}
      {showOutputPort && (
        <div
          className={cn(
            'absolute w-3 h-3 rounded-full border-2 border-background cursor-crosshair',
            'transition-transform hover:scale-125',
            portColorClass,
            isConnectingFrom && 'animate-pulse scale-125'
          )}
          style={{
            right: -6,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
          onClick={onOutputPortClick}
        />
      )}

      {/* 错误提示 */}
      {node.errors && node.errors.length > 0 && (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full">
          <div className="bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg max-w-[200px] truncate">
            {node.errors[0]}
          </div>
        </div>
      )}
    </div>
  );
}
