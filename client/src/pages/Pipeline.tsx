import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { Trash2, Play, Save, X, Download, Upload, FileJson } from 'lucide-react';
import type { PipelineNode, Plugin, PipelineConnection } from '@/types';
import { useToast } from '@/components/common/Toast';

// Pipeline 配置文件格式
interface PipelineConfig {
  version: string;
  name: string;
  description?: string;
  createdAt: string;
  nodes: PipelineNode[];
  connections: PipelineConnection[];
}

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
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState('editor');
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  // 导出 Pipeline 配置
  const handleExportPipeline = () => {
    if (pipelineNodes.length === 0) {
      toast.error('画布为空，无法导出');
      return;
    }

    const name = prompt('请输入配置文件名称:', 'pipeline-config');
    if (!name) return;

    const config: PipelineConfig = {
      version: '1.0.0',
      name: name,
      description: `Pipeline 配置文件 - ${name}`,
      createdAt: new Date().toISOString(),
      nodes: pipelineNodes,
      connections: pipelineConnections
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`配置已导出为 ${name}.json`);
  };

  // 导入 Pipeline 配置
  const handleImportPipeline = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const config: PipelineConfig = JSON.parse(content);

        // 验证配置文件格式
        if (!config.version || !config.nodes || !Array.isArray(config.nodes)) {
          toast.error('无效的配置文件格式');
          return;
        }

        // 确认是否覆盖当前配置
        if (pipelineNodes.length > 0) {
          if (!confirm('当前画布不为空，导入将覆盖现有配置。是否继续？')) {
            return;
          }
        }

        // 清空当前配置
        clearPipeline();

        // 导入节点（生成新的 ID 以避免冲突）
        const idMap = new Map<string, string>();
        
        config.nodes.forEach((node) => {
          const newId = nanoid();
          idMap.set(node.id, newId);
          
          const newNode: PipelineNode = {
            ...node,
            id: newId
          };
          addPipelineNode(newNode);
        });

        // 导入连接（使用新的 ID）
        const { addPipelineConnection } = useAppStore.getState();
        config.connections?.forEach((conn) => {
          const newConn: PipelineConnection = {
            id: nanoid(),
            from: idMap.get(conn.from) || conn.from,
            to: idMap.get(conn.to) || conn.to
          };
          addPipelineConnection(newConn);
        });

        toast.success(`已导入配置: ${config.name || file.name}`);
        setExecutionLog([`📥 已导入配置文件: ${config.name || file.name}`, `节点数量: ${config.nodes.length}`, `连接数量: ${config.connections?.length || 0}`]);
      } catch (error) {
        console.error('Import error:', error);
        toast.error('配置文件解析失败，请检查文件格式');
      }
    };

    reader.readAsText(file);
    // 清空 input 以便可以重复选择同一文件
    e.target.value = '';
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
                      {/* 导入按钮 */}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={() => importInputRef.current?.click()}
                        title="导入配置"
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        导入
                      </Button>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportPipeline}
                        className="hidden"
                      />
                      
                      {/* 导出按钮 */}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={handleExportPipeline}
                        title="导出配置"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        导出
                      </Button>
                      
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
                          <p className="text-sm mt-2">或点击「导入」加载配置文件</p>
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
                            log.includes('📥') ? 'text-cyan' :
                            'text-muted-foreground'
                          )}>
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </PageCard>

                {/* 配置文件说明 */}
                <PageCard className="mt-4" title="配置文件说明" icon="📄">
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>
                      <FileJson className="w-4 h-4 inline mr-2 text-primary" />
                      <strong>导出</strong>：将当前 Pipeline 配置导出为 JSON 文件，包含所有节点和连接信息
                    </p>
                    <p>
                      <Upload className="w-4 h-4 inline mr-2 text-success" />
                      <strong>导入</strong>：从 JSON 配置文件加载 Pipeline，支持 .json 格式
                    </p>
                    <div className="mt-3 p-3 bg-background rounded-lg border border-border">
                      <p className="text-xs font-mono">
                        配置文件格式示例：<br/>
                        {`{ "version": "1.0.0", "name": "...", "nodes": [...], "connections": [...] }`}
                      </p>
                    </div>
                  </div>
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
