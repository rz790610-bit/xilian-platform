/**
 * Pipeline 可视化编辑器画布组件
 * 支持缩放、平移、节点拖拽、连线
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePipelineEditorStore, NODE_WIDTH, NODE_HEIGHT } from '@/stores/pipelineEditorStore';
import { PipelineNode } from './PipelineNode';
import { PipelineConnection } from './PipelineConnection';
import type { EditorNode, SourceType, ProcessorType, SinkType, EditorNodeType } from '@shared/pipelineTypes';
import { SOURCE_TYPES, PROCESSOR_TYPES, SINK_TYPES } from '@shared/pipelineTypes';

interface PipelineCanvasProps {
  className?: string;
}

export function PipelineCanvas({ className }: PipelineCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const {
    editor,
    isConnecting,
    connectingFromNodeId,
    addNode,
    updateNodePosition,
    selectNode,
    startConnection,
    completeConnection,
    cancelConnection,
    setZoom,
    setPan,
  } = usePipelineEditorStore();

  // 处理滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom(editor.zoom + delta);
  }, [editor.zoom, setZoom]);

  // 处理画布拖拽开始
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // 只有点击画布空白区域才开始平移
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-background')) {
      if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
        setIsPanning(true);
        setPanStart({ x: e.clientX - editor.panX, y: e.clientY - editor.panY });
      } else if (e.button === 0) {
        // 左键拖拽画布平移
        setIsPanning(true);
        setPanStart({ x: e.clientX - editor.panX, y: e.clientY - editor.panY });
        selectNode(null);
        if (isConnecting) {
          cancelConnection();
        }
      }
    }
  }, [editor.panX, editor.panY, isConnecting, selectNode, cancelConnection]);

  // 处理画布拖拽移动
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
    } else if (draggedNode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - editor.panX) / editor.zoom - dragOffset.x;
        const y = (e.clientY - rect.top - editor.panY) / editor.zoom - dragOffset.y;
        updateNodePosition(draggedNode, Math.max(0, x), Math.max(0, y));
      }
    }
  }, [isPanning, panStart, draggedNode, dragOffset, editor.panX, editor.panY, editor.zoom, setPan, updateNodePosition]);

  // 处理画布拖拽结束
  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggedNode(null);
  }, []);

  // 处理节点拖拽开始
  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    const node = editor.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const x = (e.clientX - rect.left - editor.panX) / editor.zoom;
      const y = (e.clientY - rect.top - editor.panY) / editor.zoom;
      setDragOffset({ x: x - node.x, y: y - node.y });
      setDraggedNode(nodeId);
    }
  }, [editor.nodes, editor.panX, editor.panY, editor.zoom]);

  // 处理节点点击
  const handleNodeClick = useCallback((nodeId: string) => {
    if (isConnecting) {
      completeConnection(nodeId);
    } else {
      selectNode(nodeId);
    }
  }, [isConnecting, completeConnection, selectNode]);

  // 处理节点输出端口点击（开始连线）
  const handleOutputPortClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    startConnection(nodeId);
  }, [startConnection]);

  // 处理节点输入端口点击（完成连线）
  const handleInputPortClick = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnecting) {
      completeConnection(nodeId);
    }
  }, [isConnecting, completeConnection]);

  // 处理拖放（从组件面板拖入）
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const { type, subType } = JSON.parse(data) as { type: EditorNodeType; subType: string };
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - editor.panX) / editor.zoom - NODE_WIDTH / 2;
        const y = (e.clientY - rect.top - editor.panY) / editor.zoom - NODE_HEIGHT / 2;
        addNode(type, subType as SourceType | ProcessorType | SinkType, Math.max(0, x), Math.max(0, y));
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  }, [editor.panX, editor.panY, editor.zoom, addNode]);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConnecting) {
        cancelConnection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnecting, cancelConnection]);

  // 计算连线的 SVG 路径
  const getConnectionPath = (fromNode: EditorNode, toNode: EditorNode) => {
    const fromX = fromNode.x + NODE_WIDTH;
    const fromY = fromNode.y + NODE_HEIGHT / 2;
    const toX = toNode.x;
    const toY = toNode.y + NODE_HEIGHT / 2;
    
    const controlPointOffset = Math.min(100, Math.abs(toX - fromX) / 2);
    
    return `M ${fromX} ${fromY} C ${fromX + controlPointOffset} ${fromY}, ${toX - controlPointOffset} ${toY}, ${toX} ${toY}`;
  };

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative w-full h-full overflow-hidden bg-background',
        'border-2 border-dashed border-border rounded-xl',
        isConnecting && 'cursor-crosshair',
        isPanning && 'cursor-grabbing',
        className
      )}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseLeave={handleCanvasMouseUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 网格背景 */}
      <div
        className="canvas-background absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, oklch(0.5 0 0 / 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, oklch(0.5 0 0 / 0.05) 1px, transparent 1px)
          `,
          backgroundSize: `${20 * editor.zoom}px ${20 * editor.zoom}px`,
          backgroundPosition: `${editor.panX}px ${editor.panY}px`,
        }}
      />

      {/* 可变换的内容层 */}
      <div
        className="absolute"
        style={{
          transform: `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* 连接线 SVG */}
        <svg
          className="absolute inset-0 pointer-events-none"
          style={{ overflow: 'visible', width: '100%', height: '100%' }}
        >
          {editor.connections.map(conn => {
            const fromNode = editor.nodes.find(n => n.id === conn.fromNodeId);
            const toNode = editor.nodes.find(n => n.id === conn.toNodeId);
            if (!fromNode || !toNode) return null;

            return (
              <PipelineConnection
                key={conn.id}
                connection={conn}
                path={getConnectionPath(fromNode, toNode)}
                isSelected={false}
              />
            );
          })}
        </svg>

        {/* 节点 */}
        {editor.nodes.map(node => (
          <PipelineNode
            key={node.id}
            node={node}
            isSelected={editor.selectedNodeId === node.id}
            isConnecting={isConnecting}
            isConnectingFrom={connectingFromNodeId === node.id}
            onMouseDown={(e) => handleNodeDragStart(node.id, e)}
            onClick={() => handleNodeClick(node.id)}
            onOutputPortClick={(e) => handleOutputPortClick(node.id, e)}
            onInputPortClick={(e) => handleInputPortClick(node.id, e)}
          />
        ))}
      </div>

      {/* 空状态提示 */}
      {editor.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-4">📥</div>
            <p className="text-lg font-medium">拖拽组件到画布</p>
            <p className="text-sm mt-2">从左侧组件面板拖入数据源、处理器和目标连接器</p>
          </div>
        </div>
      )}

      {/* 连线提示 */}
      {isConnecting && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg text-sm">
          点击目标节点完成连接，按 ESC 取消
        </div>
      )}

      {/* 缩放控制 */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 shadow-sm">
        <button
          onClick={() => setZoom(editor.zoom - 0.1)}
          className="w-6 h-6 flex items-center justify-center hover:bg-secondary rounded"
          disabled={editor.zoom <= 0.25}
        >
          −
        </button>
        <span className="text-sm font-mono w-12 text-center">
          {Math.round(editor.zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(editor.zoom + 0.1)}
          className="w-6 h-6 flex items-center justify-center hover:bg-secondary rounded"
          disabled={editor.zoom >= 2}
        >
          +
        </button>
      </div>
    </div>
  );
}
