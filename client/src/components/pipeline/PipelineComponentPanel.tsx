/**
 * Pipeline 组件面板
 * 显示可拖拽的数据源、处理器和目标连接器
 * 支持自动发现：扫描平台已有资源动态生成组件
 */

import { cn } from '@/lib/utils';
import { SOURCE_TYPES, PROCESSOR_TYPES, SINK_TYPES } from '@shared/pipelineTypes';
import type { EditorNodeType, NodeSubType } from '@shared/pipelineTypes';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { trpc } from '@/lib/trpc';
import { ChevronDown, ChevronRight, Search, RefreshCw, Zap, Loader2, AlertCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// ============ 组件项 ============

interface ComponentItemProps {
  type: EditorNodeType;
  subType: NodeSubType;
  name: string;
  description: string;
  icon: string;
  disabled?: boolean;
  tags?: string[];
  status?: string;
  isDiscovered?: boolean;
  defaultConfig?: Record<string, unknown>;
}

function ComponentItem({ type, subType, name, description, icon, disabled, tags, status, isDiscovered, defaultConfig }: ComponentItemProps) {
  const handleDragStart = (e: React.DragEvent) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type,
      subType,
      ...(isDiscovered ? { discovered: true, defaultConfig, originalName: name } : {}),
    }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-2.5 p-2.5 rounded-lg border border-border',
        'transition-all duration-200 group',
        disabled
          ? 'opacity-50 cursor-not-allowed bg-muted'
          : 'cursor-grab hover:border-primary/50 hover:bg-secondary/50 hover:shadow-sm active:cursor-grabbing',
        isDiscovered && 'border-dashed'
      )}
    >
      <div className="text-xl flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-xs leading-tight truncate">{name}</span>
          {isDiscovered && (
            <Zap className="w-3 h-3 text-amber-500 flex-shrink-0" />
          )}
          {status === 'degraded' && (
            <AlertCircle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
          )}
          {status === 'offline' && (
            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">{description}</div>
        {tags && tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-[9px] bg-secondary/60 text-muted-foreground px-1.5 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============ 可折叠分组 ============

interface CollapsibleSectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  badge?: string;
}

function CollapsibleSection({ title, icon, children, count, defaultOpen = true, badge }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left font-medium text-xs hover:text-primary transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span>{icon}</span>
        <span className="flex-1">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded-full">{count}</span>
        )}
        {badge && (
          <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
      </button>
      {isOpen && <div className="space-y-1.5 pl-5">{children}</div>}
    </div>
  );
}

// ============ 主面板 ============

export function PipelineComponentPanel({ className }: { className?: string }) {
  const { editor } = usePipelineEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiscovered, setShowDiscovered] = useState(true);
  const [panelTab, setPanelTab] = useState<'builtin' | 'discovered'>('builtin');

  // 自动发现查询
  const discoveryQuery = trpc.pipeline.discoverResources.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5分钟缓存
    refetchOnWindowFocus: false,
  });

  const discoveredComponents = discoveryQuery.data?.components || [];
  const discoverySummary = discoveryQuery.data?.summary;

  // 搜索过滤
  const filteredBuiltin = useMemo(() => {
    if (!searchQuery) return { sources: SOURCE_TYPES, processors: PROCESSOR_TYPES, sinks: SINK_TYPES };
    const q = searchQuery.toLowerCase();
    return {
      sources: SOURCE_TYPES.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
      processors: PROCESSOR_TYPES.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)),
      sinks: SINK_TYPES.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)),
    };
  }, [searchQuery]);

  const filteredDiscovered = useMemo(() => {
    if (!searchQuery) return discoveredComponents;
    const q = searchQuery.toLowerCase();
    return discoveredComponents.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.tags.some((t: string) => t.toLowerCase().includes(q))
    );
  }, [searchQuery, discoveredComponents]);

  // 按资源类型分组发现的组件
  const discoveredGroups = useMemo(() => {
    const groups: Record<string, typeof filteredDiscovered> = {};
    for (const c of filteredDiscovered) {
      const key = c.resourceOrigin || c.resourceType;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }, [filteredDiscovered]);

  // 资源类型图标映射
  const resourceIcons: Record<string, string> = {
    'mysql-table': '🐬',
    'kafka-topic': '📨',
    'qdrant-collection': '🧮',
    'clickhouse-table': '⚡',
    'model': '🤖',
    'redis': '💾',
    'neo4j': '🕸️',
    'minio-bucket': '📦',
    'mqtt-topic': '🔌',
    'plugin': '🧩',
  };

  return (
    <div className={cn("h-full bg-card border-r border-border flex flex-col overflow-hidden", className)}>
      {/* 头部 */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">组件库</h3>
          <div className="flex items-center gap-1">
            {discoverySummary && (
              <span className="text-[10px] text-muted-foreground">
                {discoverySummary.totalComponents} 发现
              </span>
            )}
          </div>
        </div>

        {/* 搜索 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="搜索组件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-8 text-xs"
          />
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-secondary/30 rounded-md p-0.5">
          <button
            onClick={() => setPanelTab('builtin')}
            className={cn(
              'flex-1 text-[11px] py-1 rounded transition-colors',
              panelTab === 'builtin' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            内置组件
          </button>
          <button
            onClick={() => setPanelTab('discovered')}
            className={cn(
              'flex-1 text-[11px] py-1 rounded transition-colors flex items-center justify-center gap-1',
              panelTab === 'discovered' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Zap className="w-3 h-3" />
            自动发现
            {discoveredComponents.length > 0 && (
              <span className="text-[9px] bg-amber-500/20 text-amber-600 px-1 rounded-full">{discoveredComponents.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {panelTab === 'builtin' ? (
          <>
            {/* 内置数据源 */}
            <CollapsibleSection title="数据源" icon="📥" count={filteredBuiltin.sources.length}>
              {filteredBuiltin.sources.map(source => (
                <ComponentItem
                  key={source.type}
                  type="source"
                  subType={source.type}
                  name={source.name}
                  description={source.description}
                  icon={source.icon}
                />
              ))}
            </CollapsibleSection>

            {/* 内置处理器 */}
            <CollapsibleSection title="处理器" icon="⚙️" count={filteredBuiltin.processors.length}>
              {filteredBuiltin.processors.map(processor => (
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

            {/* 内置目标连接器 */}
            <CollapsibleSection title="目标连接器" icon="📤" count={filteredBuiltin.sinks.length}>
              {filteredBuiltin.sinks.map(sink => (
                <ComponentItem
                  key={sink.type}
                  type="sink"
                  subType={sink.type}
                  name={sink.name}
                  description={sink.description}
                  icon={sink.icon}
                />
              ))}
            </CollapsibleSection>
          </>
        ) : (
          <>
            {/* 自动发现区域 */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                扫描平台资源自动生成组件
              </p>
              <button
                onClick={() => discoveryQuery.refetch()}
                disabled={discoveryQuery.isFetching}
                className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 disabled:opacity-50"
              >
                {discoveryQuery.isFetching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                刷新
              </button>
            </div>

            {discoveryQuery.isLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span className="text-xs">正在扫描平台资源...</span>
              </div>
            )}

            {discoveryQuery.isError && (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                <AlertCircle className="w-5 h-5 text-red-400 mb-2" />
                <span className="text-xs">扫描失败</span>
                <button
                  onClick={() => discoveryQuery.refetch()}
                  className="text-xs text-primary mt-2"
                >
                  重试
                </button>
              </div>
            )}

            {!discoveryQuery.isLoading && Object.keys(discoveredGroups).length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Zap className="w-5 h-5 mb-2 opacity-50" />
                <span className="text-xs">暂未发现可用资源</span>
                <span className="text-[10px] mt-1">连接数据库或启动服务后重新扫描</span>
              </div>
            )}

            {/* 按资源来源分组显示 */}
            {Object.entries(discoveredGroups).map(([origin, components]) => {
              const firstComp = components[0];
              const groupIcon = resourceIcons[firstComp.resourceType] || '📡';
              const sourceCount = components.filter(c => c.nodeType === 'source').length;
              const sinkCount = components.filter(c => c.nodeType === 'sink').length;
              const procCount = components.filter(c => c.nodeType === 'processor').length;

              return (
                <CollapsibleSection
                  key={origin}
                  title={origin}
                  icon={groupIcon}
                  count={components.length}
                  defaultOpen={true}
                  badge="自动"
                >
                  {components.map(comp => (
                    <ComponentItem
                      key={comp.id}
                      type={comp.nodeType as EditorNodeType}
                      subType={comp.resourceType as NodeSubType}
                      name={comp.name}
                      description={comp.description}
                      icon={comp.icon}
                      tags={comp.tags}
                      status={comp.status}
                      isDiscovered={true}
                      defaultConfig={comp.defaultConfig}
                    />
                  ))}
                </CollapsibleSection>
              );
            })}

            {/* 发现摘要 */}
            {discoverySummary && discoverySummary.totalComponents > 0 && (
              <div className="mt-4 p-2.5 bg-secondary/20 rounded-lg space-y-1.5">
                <div className="text-[10px] font-medium text-muted-foreground">发现摘要</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="text-center">
                    <div className="text-sm font-bold">{discoverySummary.byNodeType?.source || 0}</div>
                    <div className="text-[9px] text-muted-foreground">数据源</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">{discoverySummary.byNodeType?.processor || 0}</div>
                    <div className="text-[9px] text-muted-foreground">处理器</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold">{discoverySummary.byNodeType?.sink || 0}</div>
                    <div className="text-[9px] text-muted-foreground">写入器</div>
                  </div>
                </div>
                {discoverySummary.scanDurationMs > 0 && (
                  <div className="text-[9px] text-muted-foreground text-center">
                    扫描耗时 {discoverySummary.scanDurationMs}ms · {Object.keys(discoverySummary.byResourceType || {}).length} 类资源
                  </div>
                )}
                {discoverySummary.errors?.length > 0 && (
                  <div className="text-[9px] text-yellow-600">
                    {discoverySummary.errors.length} 个扫描器报错
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
