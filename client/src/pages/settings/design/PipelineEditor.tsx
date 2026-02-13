/**
 * Pipeline 编排工作台
 * 企业级流程编排工具 — 覆盖数据工程、机器学习、大模型应用
 * 布局风格与数据库工作台一致：MainLayout + Tab 栏 + 内容区
 */
import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PipelineCanvas } from '@/components/pipeline/PipelineCanvas';
import { PipelineComponentPanel } from '@/components/pipeline/PipelineComponentPanel';
import { PipelineConfigPanel } from '@/components/pipeline/PipelineConfigPanel';
import { PipelineToolbar } from '@/components/pipeline/PipelineToolbar';
import { PipelineOverview } from '@/components/pipeline/PipelineOverview';
import { PipelineAPIPanel } from '@/components/pipeline/PipelineAPIPanel';
import { PipelineLineagePanel } from '@/components/pipeline/PipelineLineagePanel';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Workflow, LayoutGrid, Play, Clock, AlertCircle, CheckCircle2,
  Activity, FileJson, BookTemplate, Search, Trash2, Loader2,
  RefreshCw, ChevronRight, Database, Brain, Bot, GitBranch,
  Layers, ArrowRight, Code2, Eye
} from 'lucide-react';
import { DOMAIN_COLORS, SOURCE_NODES, DATA_ENGINEERING_NODES, ML_NODES, LLM_NODES, CONTROL_NODES, SINK_NODES, type NodeDomain } from '@shared/pipelineTypes';

type Tab = 'editor' | 'overview' | 'pipelines' | 'templates' | 'runs' | 'api' | 'lineage';

// 统计卡片
function StatCard({ value, label, icon, color }: { value: string | number; label: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-secondary/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color || ''}`}>{value}</div>
    </div>
  );
}

// 领域图标映射
const DOMAIN_ICONS: Record<string, React.ReactNode> = {
  source: <Database className="w-3.5 h-3.5" />,
  data_engineering: <Layers className="w-3.5 h-3.5" />,
  machine_learning: <Brain className="w-3.5 h-3.5" />,
  llm: <Bot className="w-3.5 h-3.5" />,
  control: <GitBranch className="w-3.5 h-3.5" />,
  sink: <ArrowRight className="w-3.5 h-3.5" />,
};

// 领域分类（替代 NODE_CATEGORIES）
const DOMAIN_CATEGORIES: Record<NodeDomain, { label: string; count: number }> = {
  source: { label: '数据源', count: SOURCE_NODES.length },
  data_engineering: { label: '数据工程', count: DATA_ENGINEERING_NODES.length },
  machine_learning: { label: '机器学习', count: ML_NODES.length },
  llm: { label: '大模型应用', count: LLM_NODES.length },
  control: { label: '流程控制', count: CONTROL_NODES.length },
  sink: { label: '目标输出', count: SINK_NODES.length },
  multimodal: { label: '多模态', count: 0 },
};

export default function PipelineEditor() {
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [pipelineSearch, setPipelineSearch] = useState('');

  const {
    editor,
    selectedPipelineStatus,
    currentPipelineId,
    currentPipelineName,
    pipelines,
    setSelectedPipelineStatus,
    setPipelines,
    loadPipeline,
    newPipeline,
    setIsLoading,
  } = usePipelineEditorStore();

  // 定时刷新运行中的 Pipeline 状态
  const { data: statusData } = trpc.pipeline.get.useQuery(
    { id: currentPipelineId || '' },
    {
      enabled: !!currentPipelineId && selectedPipelineStatus?.status === 'running',
      refetchInterval: 5000,
    }
  );

  // 获取 Pipeline 列表 — 在需要列表的 Tab 中启用
  const needsList = ['pipelines', 'runs', 'overview', 'api', 'lineage'].includes(activeTab);
  const { data: pipelineList, refetch: refetchList, isLoading: listLoading } = trpc.pipeline.list.useQuery(
    undefined,
    { enabled: needsList }
  );

  // 删除管道
  const deleteMutation = trpc.pipeline.delete.useMutation({
    onSuccess: () => refetchList(),
  });

  // 运行管道
  const runMutation = trpc.pipeline.run.useMutation({
    onSuccess: () => refetchList(),
  });

  useEffect(() => {
    if (statusData) setSelectedPipelineStatus(statusData as any);
  }, [statusData]);

  useEffect(() => {
    if (pipelineList) {
      // 将 getAllPipelines 返回值转换为 PipelineListItem 格式
      const items = pipelineList.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status as any,
        category: (p.category || 'custom') as any,
        metrics: {
          totalRecordsProcessed: 0,
          totalErrors: 0,
          lastRunAt: p.lastRunAt ? new Date(p.lastRunAt).getTime() : undefined,
          averageProcessingTimeMs: 0,
        },
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : undefined,
      }));
      setPipelines(items);
    }
  }, [pipelineList]);

  // Tab 定义
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'editor', label: '编排画布', icon: <Workflow className="w-3.5 h-3.5" /> },
    { id: 'overview', label: '管道总览', icon: <Eye className="w-3.5 h-3.5" /> },
    { id: 'pipelines', label: 'Pipeline 列表', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: 'templates', label: '模板库', icon: <BookTemplate className="w-3.5 h-3.5" /> },
    { id: 'runs', label: '运行记录', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'api', label: 'API 端点', icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: 'lineage', label: '数据血缘', icon: <GitBranch className="w-3.5 h-3.5" /> },
  ];

  // 模板数据
  const templates = [
    {
      id: 'sensor-collect',
      name: '传感器数据采集',
      description: 'MQTT → 数据清洗 → ClickHouse 时序存储',
      domain: 'source' as NodeDomain,
      nodes: 4,
      tags: ['IoT', '时序数据'],
    },
    {
      id: 'fault-predict',
      name: '设备故障预警',
      description: 'ClickHouse → 特征工程 → 异常检测 → 告警通知',
      domain: 'machine_learning' as NodeDomain,
      nodes: 5,
      tags: ['ML', '预测性维护'],
    },
    {
      id: 'rag-pipeline',
      name: 'RAG 检索增强',
      description: '文档 → 文本分割 → 向量化 → Qdrant 存储',
      domain: 'llm' as NodeDomain,
      nodes: 5,
      tags: ['LLM', 'RAG'],
    },
    {
      id: 'etl-sync',
      name: 'ETL 数据同步',
      description: 'MySQL → 数据转换 → Schema 验证 → ClickHouse',
      domain: 'data_engineering' as NodeDomain,
      nodes: 4,
      tags: ['ETL', '数据同步'],
    },
    {
      id: 'smart-qa',
      name: '智能问答',
      description: '用户输入 → 向量检索 → Prompt 模板 → LLM 调用',
      domain: 'llm' as NodeDomain,
      nodes: 5,
      tags: ['LLM', '问答'],
    },
    {
      id: 'event-driven',
      name: '事件驱动处理',
      description: 'Kafka → 条件分支 → 多路处理 → 聚合通知',
      domain: 'control' as NodeDomain,
      nodes: 6,
      tags: ['事件驱动', '流处理'],
    },
    {
      id: 'knowledge-graph',
      name: '知识图谱构建',
      description: 'MySQL → 实体抽取 → 关系构建 → Neo4j 存储',
      domain: 'data_engineering' as NodeDomain,
      nodes: 5,
      tags: ['知识图谱', 'NLP'],
    },
  ];

  // 处理管道总览中的操作
  const handleOverviewEdit = (pipeline: any) => {
    loadPipeline(pipeline.config as any);
    setSelectedPipelineStatus(pipeline as any);
    setActiveTab('editor');
  };

  const handleOverviewRun = (id: string) => {
    runMutation.mutate({ id, trigger: 'manual' });
  };

  const handleOverviewDelete = (id: string) => {
    if (confirm('确定删除此管道？')) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <MainLayout title="Pipeline 编排">
      <div className="p-4 space-y-3">
        {/* 顶部标签栏 */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          {/* 右侧状态指示器 */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{editor.nodes.length} 节点</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{editor.connections.length} 连线</span>
            {currentPipelineId && selectedPipelineStatus && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className={
                  selectedPipelineStatus.status === 'running' ? 'text-green-500' :
                  selectedPipelineStatus.status === 'error' ? 'text-red-500' :
                  'text-muted-foreground'
                }>
                  {selectedPipelineStatus.status === 'running' ? '● 运行中' :
                   selectedPipelineStatus.status === 'stopped' ? '○ 已停止' :
                   selectedPipelineStatus.status === 'error' ? '● 错误' :
                   selectedPipelineStatus.status}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ====== 编排画布 Tab ====== */}
        {activeTab === 'editor' && (
          <div className="flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
            {/* 工具栏 */}
            <PipelineToolbar />

            {/* 主内容区：左侧组件面板 + 中间画布 + 右侧配置面板 */}
            <div className="flex-1 flex overflow-hidden border border-border rounded-b-lg">
              {/* 左侧组件面板 */}
              <PipelineComponentPanel className="w-56 border-r border-border shrink-0" />

              {/* 中间画布 */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <PipelineCanvas className="flex-1" />

                {/* 底部运行状态 */}
                {selectedPipelineStatus && (
                  <div className="border-t border-border bg-card/50 px-4 py-2">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <Activity className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">状态:</span>
                        <span className={
                          selectedPipelineStatus.status === 'running' ? 'text-green-500 font-medium' :
                          selectedPipelineStatus.status === 'error' ? 'text-red-500 font-medium' :
                          'text-muted-foreground'
                        }>
                          {selectedPipelineStatus.status === 'running' ? '运行中' :
                           selectedPipelineStatus.status === 'stopped' ? '已停止' :
                           selectedPipelineStatus.status === 'error' ? '错误' :
                           selectedPipelineStatus.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">处理:</span>
                        <span className="font-mono">{selectedPipelineStatus.metrics?.totalRecordsProcessed?.toLocaleString() || 0}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <AlertCircle className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">错误:</span>
                        <span className={`font-mono ${(selectedPipelineStatus.metrics?.totalErrors || 0) > 0 ? 'text-red-500' : ''}`}>
                          {selectedPipelineStatus.metrics?.totalErrors || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">耗时:</span>
                        <span className="font-mono">{selectedPipelineStatus.metrics?.averageProcessingTimeMs?.toFixed(0) || 0} ms</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 右侧配置面板 */}
              {editor.selectedNodeId && (
                <PipelineConfigPanel className="w-64 border-l border-border shrink-0" />
              )}
            </div>
          </div>
        )}

        {/* ====== 管道总览 Tab ====== */}
        {activeTab === 'overview' && (
          <PipelineOverview
            pipelines={pipelines}
            onEdit={handleOverviewEdit}
            onRun={handleOverviewRun}
            onDelete={handleOverviewDelete}
            onRefresh={() => refetchList()}
            isLoading={listLoading}
          />
        )}

        {/* ====== Pipeline 列表 Tab ====== */}
        {activeTab === 'pipelines' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">已保存的 Pipeline</h3>
              <Button size="sm" variant="outline" onClick={() => refetchList()} className="text-xs h-7">
                <RefreshCw className={`w-3 h-3 mr-1 ${listLoading ? 'animate-spin' : ''}`} />刷新
              </Button>
              <Button size="sm" onClick={() => { newPipeline(); setActiveTab('editor'); }} className="text-xs h-7">
                <Workflow className="w-3 h-3 mr-1" />新建
              </Button>
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={pipelineSearch}
                  onChange={(e) => setPipelineSearch(e.target.value)}
                  placeholder="搜索..."
                  className="h-7 text-xs pl-7 w-48"
                />
              </div>
            </div>

            {/* 统计 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard value={pipelines.length} label="总数" icon="📋" />
              <StatCard value={pipelines.filter(p => p.status === 'running').length} label="运行中" icon="🟢" color="text-green-500" />
              <StatCard value={pipelines.filter(p => p.status === 'stopped').length} label="已停止" icon="⏹️" />
              <StatCard value={pipelines.filter(p => p.status === 'error').length} label="异常" icon="🔴" color="text-red-500" />
            </div>

            {/* 列表 */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">名称</th>
                    <th className="text-left px-3 py-2 font-medium">状态</th>
                    <th className="text-left px-3 py-2 font-medium">节点数</th>
                    <th className="text-left px-3 py-2 font-medium">处理记录</th>
                    <th className="text-left px-3 py-2 font-medium">错误</th>
                    <th className="text-right px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines
                    .filter(p => !pipelineSearch || p.name.toLowerCase().includes(pipelineSearch.toLowerCase()))
                    .map(pipeline => (
                    <tr key={pipeline.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium">{pipeline.name}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                          pipeline.status === 'running' ? 'bg-green-500/10 text-green-600' :
                          pipeline.status === 'error' ? 'bg-red-500/10 text-red-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {pipeline.status === 'running' ? '● 运行中' :
                           pipeline.status === 'stopped' ? '○ 已停止' :
                           pipeline.status === 'error' ? '● 错误' :
                           pipeline.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{pipeline.config?.nodes?.length || '-'}</td>
                      <td className="px-3 py-2 font-mono">{pipeline.metrics?.totalRecordsProcessed?.toLocaleString() || 0}</td>
                      <td className="px-3 py-2 font-mono">{pipeline.metrics?.totalErrors || 0}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => {
                          loadPipeline(pipeline.config as any);
                          setSelectedPipelineStatus(pipeline as any);
                          setActiveTab('editor');
                        }}>
                          编辑 <ChevronRight className="w-3 h-3 ml-0.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pipelines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                        暂无 Pipeline，点击「新建」创建第一个
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====== 模板库 Tab ====== */}
        {activeTab === 'templates' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Pipeline 模板库</h3>
              <span className="text-[10px] text-muted-foreground">选择模板快速创建 Pipeline</span>
            </div>

            {/* 领域分类统计 */}
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(DOMAIN_CATEGORIES).map(([domain, cat]) => {
                const count = templates.filter(t => t.domain === domain).length;
                if (count === 0) return null;
                const colors = DOMAIN_COLORS[domain as NodeDomain];
                return (
                  <div key={domain} className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${colors?.bg || 'bg-muted'} ${colors?.text || 'text-muted-foreground'}`}>
                    {DOMAIN_ICONS[domain]}
                    <span>{cat.label}</span>
                    <span className="font-mono">({count})</span>
                  </div>
                );
              })}
            </div>

            {/* 模板卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map(tpl => {
                const colors = DOMAIN_COLORS[tpl.domain];
                return (
                  <div key={tpl.id} className="border border-border rounded-lg p-3 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => {
                      // TODO: 加载模板到编辑器
                      newPipeline();
                      setActiveTab('editor');
                    }}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors?.bg || 'bg-muted'}`}>
                        {DOMAIN_ICONS[tpl.domain]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{tpl.name}</div>
                        <div className="text-[10px] text-muted-foreground">{tpl.nodes} 个节点</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2 line-clamp-2">{tpl.description}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {tpl.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">{tag}</Badge>
                      ))}
                    </div>
                    <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" className="w-full h-6 text-[10px]">
                        使用此模板 <ChevronRight className="w-3 h-3 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ====== 运行记录 Tab ====== */}
        {activeTab === 'runs' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">运行记录</h3>
              <Button size="sm" variant="outline" onClick={() => refetchList()} className="text-xs h-7">
                <RefreshCw className={`w-3 h-3 mr-1 ${listLoading ? 'animate-spin' : ''}`} />刷新
              </Button>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Pipeline</th>
                    <th className="text-left px-3 py-2 font-medium">状态</th>
                    <th className="text-left px-3 py-2 font-medium">处理记录</th>
                    <th className="text-left px-3 py-2 font-medium">错误数</th>
                    <th className="text-left px-3 py-2 font-medium">平均耗时</th>
                    <th className="text-left px-3 py-2 font-medium">最后运行</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelines.map(pipeline => (
                    <tr key={pipeline.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-3 py-2 font-medium">{pipeline.name}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                          pipeline.status === 'running' ? 'bg-green-500/10 text-green-600' :
                          pipeline.status === 'error' ? 'bg-red-500/10 text-red-600' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {pipeline.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{pipeline.metrics?.totalRecordsProcessed?.toLocaleString() || 0}</td>
                      <td className="px-3 py-2 font-mono">{pipeline.metrics?.totalErrors || 0}</td>
                      <td className="px-3 py-2 font-mono">{pipeline.metrics?.averageProcessingTimeMs?.toFixed(0) || 0} ms</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {pipeline.metrics?.lastRunAt ? new Date(pipeline.metrics.lastRunAt).toLocaleString('zh-CN') : '-'}
                      </td>
                    </tr>
                  ))}
                  {pipelines.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                        暂无运行记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ====== API 端点 Tab ====== */}
        {activeTab === 'api' && (
          <PipelineAPIPanel pipelines={pipelines} />
        )}

        {/* ====== 数据血缘 Tab ====== */}
        {activeTab === 'lineage' && (
          <PipelineLineagePanel pipelines={pipelines} />
        )}
      </div>
    </MainLayout>
  );
}
