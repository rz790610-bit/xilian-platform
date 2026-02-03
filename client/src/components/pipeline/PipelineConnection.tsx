/**
 * Pipeline 连接线组件
 * 显示节点之间的连接
 */

import { cn } from '@/lib/utils';
import type { EditorConnection } from '@shared/pipelineTypes';

interface PipelineConnectionProps {
  connection: EditorConnection;
  path: string;
  isSelected: boolean;
}

export function PipelineConnection({
  connection,
  path,
  isSelected,
}: PipelineConnectionProps) {
  return (
    <g className="pipeline-connection">
      {/* 连接线阴影/光晕效果 */}
      <path
        d={path}
        fill="none"
        stroke="oklch(0.65 0.18 240 / 0.2)"
        strokeWidth={isSelected ? 8 : 6}
        className="transition-all duration-200"
      />
      
      {/* 主连接线 */}
      <path
        d={path}
        fill="none"
        stroke="oklch(0.65 0.18 240)"
        strokeWidth={isSelected ? 3 : 2}
        className={cn(
          'transition-all duration-200',
          isSelected && 'stroke-primary'
        )}
      />
      
      {/* 动画流动效果 */}
      <path
        d={path}
        fill="none"
        stroke="oklch(0.8 0.15 240)"
        strokeWidth={2}
        strokeDasharray="8 12"
        className="animate-flow"
        style={{
          animation: 'flowAnimation 1.5s linear infinite',
        }}
      />
      
      {/* 箭头指示 */}
      <circle
        r={4}
        fill="oklch(0.65 0.18 240)"
        className="animate-flow-dot"
      >
        <animateMotion
          dur="1.5s"
          repeatCount="indefinite"
          path={path}
        />
      </circle>
    </g>
  );
}

// 添加全局样式
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes flowAnimation {
    from {
      stroke-dashoffset: 0;
    }
    to {
      stroke-dashoffset: -20;
    }
  }
`;
if (!document.querySelector('#pipeline-connection-styles')) {
  styleSheet.id = 'pipeline-connection-styles';
  document.head.appendChild(styleSheet);
}
