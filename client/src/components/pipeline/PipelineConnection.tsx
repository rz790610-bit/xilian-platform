/**
 * Pipeline 连线组件
 * 渲染节点之间的 SVG 贝塞尔曲线连线，按领域着色
 */
import { cn } from '@/lib/utils';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { getNodeTypeInfo, type NodeDomain } from '@shared/pipelineTypes';

// 节点尺寸常量（与 PipelineNode 保持一致）
const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

export interface PipelineConnectionProps {
  connection: import('@shared/pipelineTypes').EditorConnection;
  path: string;
  isSelected: boolean;
}

// 根据领域获取连线颜色
function getStrokeColor(domain: NodeDomain): string {
  const colorMap: Record<NodeDomain, string> = {
    source: '#3b82f6',
    data_engineering: '#10b981',
    machine_learning: '#8b5cf6',
    llm: '#f59e0b',
    control: '#6b7280',
    sink: '#ef4444',
    multimodal: '#06b6d4',
  };
  return colorMap[domain] || '#6b7280';
}

export function PipelineConnection({
  connection,
  path,
  isSelected,
}: PipelineConnectionProps) {
  const { editor, removeConnection } = usePipelineEditorStore();
  const connectionId = connection.id;
  const sourceNodeId = connection.fromNodeId;

  const sourceNode = editor.nodes.find(n => n.id === sourceNodeId);
  const targetNode = editor.nodes.find(n => n.id === connection.toNodeId);

  const sourceTypeInfo = sourceNode ? getNodeTypeInfo(sourceNode.subType) : undefined;
  const domain = sourceTypeInfo?.domain as NodeDomain | undefined;
  const strokeColor = isSelected ? '#3b82f6' : (domain ? getStrokeColor(domain) : '#6b7280');

  if (!path) return null;

  const mx = sourceNode && targetNode
    ? (sourceNode.x + NODE_WIDTH + targetNode.x) / 2
    : 0;
  const my = sourceNode && targetNode
    ? (sourceNode.y + NODE_HEIGHT / 2 + targetNode.y + NODE_HEIGHT / 2) / 2
    : 0;

  return (
    <g className="cursor-pointer group" onClick={(e) => { e.stopPropagation(); /* selectConnection */ }}>
      {/* 点击热区 */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
      {/* 光晕 */}
      <path d={path} fill="none" stroke={strokeColor} strokeWidth={isSelected ? 6 : 4} opacity={0.1} />
      {/* 主连线 */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        opacity={isSelected ? 1 : 0.6}
        className="transition-all duration-150"
      />
      {/* 流动动画 */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeDasharray="6 8"
        opacity={0.4}
        className="pipeline-flow-line"
      />
      {/* 流动点 */}
      <circle r={3} fill={strokeColor} opacity={0.7}>
        <animateMotion dur="2s" repeatCount="indefinite" path={path} />
      </circle>
      {/* 选中时显示删除按钮 */}
      {isSelected && (
        <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); removeConnection(connectionId); }}>
          <circle cx={mx} cy={my} r={8} fill="#ef4444" opacity={0.9} />
          <line x1={mx - 3} y1={my - 3} x2={mx + 3} y2={my + 3} stroke="white" strokeWidth={1.5} />
          <line x1={mx + 3} y1={my - 3} x2={mx - 3} y2={my + 3} stroke="white" strokeWidth={1.5} />
        </g>
      )}
    </g>
  );
}

// 临时连线（拖拽中）
export function TempConnection({
  startX, startY, endX, endY
}: {
  startX: number; startY: number; endX: number; endY: number;
}) {
  const dx = Math.abs(endX - startX);
  const cpOffset = Math.max(50, dx * 0.4);
  const path = `M ${startX} ${startY} C ${startX + cpOffset} ${startY}, ${endX - cpOffset} ${endY}, ${endX} ${endY}`;

  return (
    <path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" opacity={0.7} />
  );
}

// 注入流动动画样式
if (typeof document !== 'undefined' && !document.querySelector('#pipeline-flow-styles')) {
  const style = document.createElement('style');
  style.id = 'pipeline-flow-styles';
  style.textContent = `
    .pipeline-flow-line { animation: pipelineFlow 1s linear infinite; }
    @keyframes pipelineFlow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -14; } }
  `;
  document.head.appendChild(style);
}
