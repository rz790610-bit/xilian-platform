import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { Trash2, Play, Save, X } from 'lucide-react';
import type { PipelineNode, Plugin } from '@/types';
import { toast } from 'sonner';

export default function Pipeline() {
  const { 
    plugins, 
    pipelineNodes, 
    pipelineConnections,
    addPipelineNode, 
    removePipelineNode,
    clearPipeline,
    selectedNode,
    setSelectedNode
  } = useAppStore();
  
  const [activeTab, setActiveTab] = useState('editor');
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: React.DragEvent, plugin: Plugin) => {
    e.dataTransfer.setData('plugin', JSON.stringify(plugin));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (canvasRef.current) {
      canvasRef.current.classList.add('border-primary');
    }
  };

  const handleDragLeave = () => {
    if (canvasRef.current) {
      canvasRef.current.classList.remove('border-primary');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (canvasRef.current) {
      canvasRef.current.classList.remove('border-primary');
    }

    const pluginData = e.dataTransfer.getData('plugin');
    if (!pluginData) return;

    const plugin: Plugin = JSON.parse(pluginData);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left - 60;
    const y = e.clientY - rect.top - 30;

    const newNode: PipelineNode = {
      id: nanoid(),
      pluginId: plugin.id,
      name: plugin.name,
      icon: plugin.icon,
      x: Math.max(0, x),
      y: Math.max(0, y)
    };

    addPipelineNode(newNode);
    toast.success(`已添加节点: ${plugin.name}`);
  };

  const handleRunPipeline = async () => {
    if (pipelineNodes.length === 0) {
      toast.error('请先添加节点');
      return;
    }

    setIsRunning(true);
    setExecutionLog(['开始执行 Pipeline...']);

    // 模拟执行
    for (const node of pipelineNodes) {
      await new Promise(resolve => setTimeout(resolve, 500));
      setExecutionLog(prev => [...prev, `✓ ${node.name} 执行完成 (${Math.floor(Math.random() * 100 + 50)}ms)`]);
    }

    setExecutionLog(prev => [...prev, '✅ Pipeline 执行完成']);
    setIsRunning(false);
    toast.success('Pipeline 执行完成');
  };

  const handleSavePipeline = () => {
    const name = prompt('请输入 Pipeline 名称:', '我的 Pipeline');
    if (name) {
      toast.success(`Pipeline "${name}" 已保存`);
    }
  };

  const handleClearCanvas = () => {
    if (confirm('确定要清空画布吗？')) {
      clearPipeline();
      setExecutionLog([]);
      toast.info('画布已清空');
    }
  };

  // 渲染连接线
  const renderConnections = () => {
    return pipelineConnections.map((conn) => {
      const fromNode = pipelineNodes.find(n => n.id === conn.from);
      const toNode = pipelineNodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return null;

      const x1 = fromNode.x + 120;
      const y1 = fromNode.y + 30;
      const x2 = toNode.x;
      const y2 = toNode.y + 30;
      const cx = (x1 + x2) / 2;

      return (
        <path
          key={conn.id}
          d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
          stroke="oklch(0.65 0.18 240)"
          strokeWidth="2"
          fill="none"
          className="transition-all duration-300"
        />
      );
    });
  };

  // 插件模板
  const pipelineTemplates = [
    { id: 'bearing', name: '轴承诊断', description: '完整的轴承故障诊断流程', icon: '🔩' },
    { id: 'gear', name: '齿轮诊断', description: '齿轮箱故障分析流程', icon: '⚙️' },
    { id: 'motor', name: '电机诊断', description: '电机综合诊断流程', icon: '🔌' }
  ];

  return (
    <MainLayout title="Pipeline 编排">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">Pipeline 编排</h2>
          <p className="text-muted-foreground">可视化构建数据处理流程</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="editor">🎨 编辑器</TabsTrigger>
            <TabsTrigger value="plugins">🧩 插件库</TabsTrigger>
            <TabsTrigger value="templates">📦 模板</TabsTrigger>
          </TabsList>

          <TabsContent value="editor">
            <div className="flex gap-4">
              {/* Plugin palette */}
              <div className="w-[180px] shrink-0">
                <PageCard title="插件" icon="🧩" className="sticky top-24">
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {plugins.map((plugin) => (
                      <div
                        key={plugin.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, plugin)}
                        className="flex items-center gap-2 p-2.5 bg-secondary rounded-lg cursor-grab hover:bg-accent transition-colors text-sm"
                      >
                        <span>{plugin.icon}</span>
                        <span className="truncate">{plugin.name}</span>
                      </div>
                    ))}
                  </div>
                </PageCard>
              </div>

              {/* Canvas */}
              <div className="flex-1">
                <PageCard
                  title="画布"
                  icon="📐"
                  action={
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={handleClearCanvas}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        清空
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleSavePipeline}>
                        <Save className="w-4 h-4 mr-1" />
                        保存
                      </Button>
                      <Button size="sm" onClick={handleRunPipeline} disabled={isRunning}>
                        <Play className="w-4 h-4 mr-1" />
                        运行
                      </Button>
                    </div>
                  }
                >
                  <div
                    ref={canvasRef}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className="relative w-full h-[400px] bg-gradient-to-br from-background to-secondary rounded-xl border-2 border-dashed border-border transition-colors overflow-hidden"
                  >
                    {/* Grid background */}
                    <div 
                      className="absolute inset-0 opacity-20"
                      style={{
                        backgroundImage: 'radial-gradient(circle, oklch(0.65 0.18 240 / 0.3) 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                      }}
                    />

                    {/* Connections SVG */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                      {renderConnections()}
                    </svg>

                    {/* Nodes */}
                    {pipelineNodes.map((node) => (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node.id)}
                        className={cn(
                          "absolute w-[120px] bg-card border rounded-xl p-3 cursor-pointer transition-all duration-200 group",
                          selectedNode === node.id 
                            ? "border-primary glow-primary" 
                            : "border-border hover:border-primary/50"
                        )}
                        style={{ left: node.x, top: node.y }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePipelineNode(node.id);
                          }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-danger rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <div className="text-center">
                          <span className="text-2xl block mb-1">{node.icon}</span>
                          <span className="text-xs truncate block">{node.name}</span>
                        </div>
                      </div>
                    ))}

                    {/* Empty state */}
                    {pipelineNodes.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <span className="text-4xl block mb-3">📥</span>
                          <p>拖拽左侧插件到画布</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Execution log */}
                  {executionLog.length > 0 && (
                    <div className="mt-4 p-4 bg-secondary rounded-xl">
                      <h4 className="font-medium mb-2">执行日志</h4>
                      <div className="space-y-1 text-sm font-mono">
                        {executionLog.map((log, i) => (
                          <div key={i} className={cn(
                            log.includes('✅') ? 'text-success' : 
                            log.includes('✓') ? 'text-primary' : 
                            'text-muted-foreground'
                          )}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </PageCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plugins">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plugins.map((plugin) => (
                <PageCard key={plugin.id}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center text-2xl">
                      {plugin.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{plugin.name}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{plugin.description}</p>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="info">{plugin.category}</Badge>
                        <Badge variant={plugin.enabled ? 'success' : 'default'}>
                          {plugin.enabled ? '已启用' : '已禁用'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="templates">
            <p className="text-sm text-muted-foreground mb-4">点击模板快速加载到画布</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {pipelineTemplates.map((template) => (
                <PageCard 
                  key={template.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => toast.info(`模板 "${template.name}" 功能开发中`)}
                >
                  <div className="text-center py-4">
                    <span className="text-4xl block mb-3">{template.icon}</span>
                    <h3 className="font-semibold mb-1">{template.name}</h3>
                    <p className="text-sm text-muted-foreground">{template.description}</p>
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
