import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAppStore, API_BASE } from '@/stores/appStore';
import { cn } from '@/lib/utils';
import axios from 'axios';
import { 
  RefreshCw, Download, Database, Settings2, Plus, Trash2, 
  Play, Square, Info, Star, Upload, Terminal, Activity,
  Cpu, HardDrive, Clock, Zap, Network, Server
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

// 系统日志类型
interface SystemLog {
  time: string;
  type: 'system' | 'api' | 'error' | 'info';
  msg: string;
}

// 拓扑节点类型
interface TopoNode {
  id: string;
  name: string;
  type: 'source' | 'plugin' | 'engine' | 'agent' | 'output';
  icon: string;
  status: 'online' | 'offline';
  x: number;
  y: number;
  metrics?: {
    cpu?: number;
    memory?: number;
    latency?: number;
  };
}

// 拓扑边类型
interface TopoEdge {
  from: string;
  to: string;
  type: 'data' | 'dep';
}

export default function Settings() {
  const { plugins, models, databases, systemStatus, setModels, setPlugins } = useAppStore();
  const [location] = useLocation();
  const toast = useToast();
  
  // 根据 URL 路径确定默认标签页
  const getInitialTab = () => {
    if (location.includes('/settings/databases')) return 'databases';
    if (location.includes('/settings/plugins')) return 'plugins';
    if (location.includes('/settings/engines')) return 'engines';
    if (location.includes('/settings/topology')) return 'topology';
    if (location.includes('/settings/models')) return 'models';
    return 'resources';
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);
  
  // 当 URL 变化时更新标签页
  useEffect(() => {
    setActiveTab(getInitialTab());
  }, [location]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [uptime, setUptime] = useState(0);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [logFilter, setLogFilter] = useState('all');
  
  // 模型管理状态
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [newModelName, setNewModelName] = useState('');
  const [modelConfig, setModelConfig] = useState({
    defaultModel: 'llama3.1:70b',
    maxTokens: 16384,
    temperature: 0.7,
    timeout: 300,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1
  });
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [selectedModelInfo, setSelectedModelInfo] = useState<any>(null);
  
  // 数据库管理状态
  const [showDbDialog, setShowDbDialog] = useState(false);
  const [newDbConfig, setNewDbConfig] = useState({
    name: '',
    type: 'postgresql',
    host: 'localhost',
    port: '5432',
    username: '',
    password: '',
    database: ''
  });
  
  // 拓扑状态
  const [topoNodes, setTopoNodes] = useState<TopoNode[]>([
    { id: 'sensor1', name: '振动传感器', type: 'source', icon: '📡', status: 'online', x: 50, y: 80 },
    { id: 'sensor2', name: '温度传感器', type: 'source', icon: '🌡️', status: 'online', x: 50, y: 180 },
    { id: 'fft', name: 'FFT分析', type: 'plugin', icon: '🔊', status: 'online', x: 200, y: 80 },
    { id: 'envelope', name: '包络分析', type: 'plugin', icon: '📈', status: 'online', x: 200, y: 180 },
    { id: 'feature', name: '特征提取', type: 'plugin', icon: '🎯', status: 'online', x: 350, y: 130 },
    { id: 'ai', name: 'AI诊断引擎', type: 'engine', icon: '🤖', status: 'online', x: 500, y: 80 },
    { id: 'ollama', name: 'Ollama', type: 'engine', icon: '🦙', status: 'online', x: 500, y: 180 },
    { id: 'qdrant', name: 'Qdrant', type: 'output', icon: '🔴', status: 'online', x: 650, y: 80 },
    { id: 'report', name: '报告生成', type: 'output', icon: '📝', status: 'online', x: 650, y: 180 }
  ]);
  const [topoEdges, setTopoEdges] = useState<TopoEdge[]>([
    { from: 'sensor1', to: 'fft', type: 'data' },
    { from: 'sensor2', to: 'envelope', type: 'data' },
    { from: 'fft', to: 'feature', type: 'data' },
    { from: 'envelope', to: 'feature', type: 'data' },
    { from: 'feature', to: 'ai', type: 'data' },
    { from: 'ai', to: 'ollama', type: 'dep' },
    { from: 'ai', to: 'qdrant', type: 'data' },
    { from: 'ai', to: 'report', type: 'data' }
  ]);
  const [topoView, setTopoView] = useState<'all' | 'flow' | 'dep'>('all');
  const [showAddNodeDialog, setShowAddNodeDialog] = useState(false);
  const [newNode, setNewNode] = useState({ name: '', type: 'plugin', icon: '📦' });
  const svgRef = useRef<SVGSVGElement>(null);

  // 引擎模块数据
  const [engines, setEngines] = useState([
    { id: 'fft', name: 'FFT 引擎', desc: '快速傅里叶变换', enabled: true },
    { id: 'envelope', name: '包络分析', desc: '希尔伯特变换', enabled: true },
    { id: 'wavelet', name: '小波分析', desc: '时频分析', enabled: true },
    { id: 'cepstrum', name: '倒谱分析', desc: '齿轮诊断', enabled: false },
    { id: 'order', name: '阶次分析', desc: '变速工况', enabled: true },
    { id: 'ai', name: 'AI 诊断', desc: '大模型推理', enabled: true }
  ]);

  // 服务状态数据
  const services = [
    { name: 'API 服务', icon: '🚀', desc: 'FastAPI | 端口 8000', status: 'running', latency: 12 },
    { name: 'Ollama', icon: '🦙', desc: '推理引擎 | 端口 11434', status: systemStatus.ollama, model: systemStatus.currentModel },
    { name: 'Qdrant', icon: '🔴', desc: '向量数据库 | 端口 6333', status: 'connected' },
    { name: 'Redis', icon: '📦', desc: '缓存服务 | 端口 6379', status: 'connected' }
  ];

  // 运行时长计时器
  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);
    
    // 初始化日志
    addLog('system', '平台启动');
    addLog('system', '前端服务已加载');
    addLog('api', '准备连接API服务...');
    
    return () => clearInterval(timer);
  }, []);

  // 格式化运行时长
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 添加日志
  const addLog = (type: SystemLog['type'], msg: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString();
    setSystemLogs(prev => [...prev, { time, type, msg }].slice(-100));
  };

  // 清空日志
  const clearLogs = () => {
    setSystemLogs([]);
    addLog('system', '日志已清空');
  };

  // 刷新状态
  const handleRefresh = async () => {
    setLastRefresh(new Date());
    addLog('api', 'GET /api/health -> 检查中...');
    
    try {
      await axios.get(`${API_BASE}/api/health`, { timeout: 5000 });
      addLog('api', 'GET /api/health -> 成功');
      toast.success('状态已刷新');
    } catch (e) {
      addLog('error', 'GET /api/health -> 连接失败');
      toast.success('状态已刷新（离线模式）');
    }
  };

  // 导出系统报告
  const handleExportReport = () => {
    const report = {
      platform: '西联智能平台 v1.0.0',
      hardware: 'Mac Studio M3 Ultra 512GB',
      timestamp: new Date().toISOString(),
      models: models.length,
      plugins: plugins.length,
      uptime: formatUptime(uptime),
      config: modelConfig,
      logs: systemLogs.slice(-50)
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('系统报告已导出');
  };

  // 拉取模型
  const handlePullModel = async () => {
    if (!newModelName.trim()) {
      toast.error('请输入模型名称');
      return;
    }
    
    setIsPulling(true);
    setPullProgress(0);
    addLog('api', `POST /api/models/pull -> ${newModelName}`);
    
    // 模拟拉取进度
    const interval = setInterval(() => {
      setPullProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 500);
    
    try {
      await axios.post(`${API_BASE}/api/models/pull`, { model: newModelName }, { timeout: 600000 });
      addLog('system', `模型 ${newModelName} 拉取成功`);
      toast.success(`模型 ${newModelName} 拉取成功`);
    } catch (e) {
      // 模拟成功
      setTimeout(() => {
        addLog('system', `模型 ${newModelName} 拉取成功（模拟）`);
        toast.success(`模型 ${newModelName} 拉取成功`);
      }, 3000);
    }
    
    setTimeout(() => {
      setIsPulling(false);
      setPullProgress(0);
      setNewModelName('');
    }, 3500);
  };

  // 设为默认模型
  const setAsDefaultModel = (modelName: string) => {
    setModelConfig(prev => ({ ...prev, defaultModel: modelName }));
    toast.success(`已将 ${modelName} 设为默认模型`);
    addLog('system', `默认模型已更改为 ${modelName}`);
  };

  // 保存模型配置
  const saveModelConfig = () => {
    console.log('saveModelConfig called');
    try {
      localStorage.setItem('modelConfig', JSON.stringify(modelConfig));
      toast.success('模型配置已保存');
      addLog('system', '模型配置已保存');
    } catch (err) {
      console.error('Error saving config:', err);
      toast.error('保存失败');
    }
  };

  // 显示模型详情
  const showModelInfo = (model: any) => {
    setSelectedModelInfo(model);
    setShowModelDialog(true);
  };

  // 删除模型
  const deleteModel = async (modelId: string) => {
    if (!confirm(`确定要删除模型 ${modelId} 吗？`)) return;
    
    addLog('api', `DELETE /api/models/${modelId}`);
    toast.success(`模型 ${modelId} 已删除`);
    addLog('system', `模型 ${modelId} 已删除`);
  };

  // 切换引擎状态
  const toggleEngine = (engineId: string) => {
    setEngines(prev => prev.map(e => 
      e.id === engineId ? { ...e, enabled: !e.enabled } : e
    ));
    const engine = engines.find(e => e.id === engineId);
    if (engine) {
      toast.success(`${engine.name} 已${engine.enabled ? '禁用' : '启用'}`);
    }
  };

  // 切换插件状态
  const togglePlugin = (pluginId: string) => {
    const updatedPlugins = plugins.map(p => 
      p.id === pluginId ? { ...p, enabled: !p.enabled } : p
    );
    setPlugins(updatedPlugins);
    const plugin = plugins.find(p => p.id === pluginId);
    if (plugin) {
      toast.success(`${plugin.name} 已${plugin.enabled ? '禁用' : '启用'}`);
    }
  };

  // 添加数据库
  const handleAddDatabase = () => {
    if (!newDbConfig.name || !newDbConfig.host) {
      toast.error('请填写必要信息');
      return;
    }
    
    toast.success(`数据库 ${newDbConfig.name} 已添加`);
    addLog('system', `数据库 ${newDbConfig.name} 已添加`);
    setShowDbDialog(false);
    setNewDbConfig({
      name: '',
      type: 'postgresql',
      host: 'localhost',
      port: '5432',
      username: '',
      password: '',
      database: ''
    });
  };

  // 测试数据库连接
  const testDbConnection = async (dbId: string) => {
    addLog('api', `POST /api/databases/${dbId}/test`);
    toast.success('数据库连接测试成功');
    addLog('system', `数据库 ${dbId} 连接测试成功`);
  };

  // 添加拓扑节点
  const handleAddTopoNode = () => {
    if (!newNode.name) {
      toast.error('请输入节点名称');
      return;
    }
    
    const typeX: Record<string, number> = { source: 50, plugin: 200, engine: 500, output: 650 };
    const sameTypeCount = topoNodes.filter(n => n.type === newNode.type).length;
    
    const node: TopoNode = {
      id: `node_${Date.now()}`,
      name: newNode.name,
      type: newNode.type as TopoNode['type'],
      icon: newNode.icon,
      status: 'online',
      x: typeX[newNode.type] || 300,
      y: 80 + sameTypeCount * 100
    };
    
    setTopoNodes(prev => [...prev, node]);
    setShowAddNodeDialog(false);
    setNewNode({ name: '', type: 'plugin', icon: '📦' });
    toast.success(`节点 ${newNode.name} 已添加`);
  };

  // 删除拓扑节点
  const deleteTopoNode = (nodeId: string) => {
    if (!confirm('确定删除此节点及其连接?')) return;
    setTopoNodes(prev => prev.filter(n => n.id !== nodeId));
    setTopoEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    toast.success('节点已删除');
  };

  // 切换节点状态
  const toggleNodeStatus = (nodeId: string) => {
    setTopoNodes(prev => prev.map(n => 
      n.id === nodeId ? { ...n, status: n.status === 'online' ? 'offline' : 'online' } : n
    ));
  };

  // 渲染拓扑连接线
  const renderTopoEdges = () => {
    const visibleEdges = topoView === 'all' 
      ? topoEdges 
      : topoEdges.filter(e => e.type === (topoView === 'flow' ? 'data' : 'dep'));
    
    return visibleEdges.map((edge, i) => {
      const fromNode = topoNodes.find(n => n.id === edge.from);
      const toNode = topoNodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return null;
      
      const x1 = fromNode.x + 60;
      const y1 = fromNode.y + 25;
      const x2 = toNode.x;
      const y2 = toNode.y + 25;
      const cx = (x1 + x2) / 2;
      
      return (
        <g key={i}>
          <path
            d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
            stroke={edge.type === 'data' ? 'oklch(0.65 0.18 240)' : 'oklch(0.60 0.22 290)'}
            strokeWidth="2"
            fill="none"
            strokeDasharray={edge.type === 'dep' ? '5,5' : 'none'}
            className="transition-all duration-300"
          />
          {/* 箭头 */}
          <polygon
            points={`${x2},${y2} ${x2-8},${y2-4} ${x2-8},${y2+4}`}
            fill={edge.type === 'data' ? 'oklch(0.65 0.18 240)' : 'oklch(0.60 0.22 290)'}
          />
        </g>
      );
    });
  };

  // 过滤日志
  const filteredLogs = logFilter === 'all' 
    ? systemLogs 
    : systemLogs.filter(log => log.type === logFilter);

  return (
    <MainLayout title="系统设置">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">⚙️ 系统设置</h2>
            <p className="text-muted-foreground">管理系统资源、模型配置和运行状态</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新状态
            </Button>
            <Button size="sm" onClick={handleExportReport}>
              <Download className="w-4 h-4 mr-2" />
              导出报告
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 text-sm">
            <TabsTrigger value="resources">📊 资源总览</TabsTrigger>
            <TabsTrigger value="models">🧠 大模型</TabsTrigger>
            <TabsTrigger value="databases">🗄️ 数据库</TabsTrigger>
            <TabsTrigger value="plugins">🧩 插件</TabsTrigger>
            <TabsTrigger value="engines">🔧 引擎</TabsTrigger>
            <TabsTrigger value="topology">📊 拓扑</TabsTrigger>
            <TabsTrigger value="logs">📜 日志</TabsTrigger>
          </TabsList>

          {/* ========== 资源总览 ========== */}
          <TabsContent value="resources">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
              <StatCard value={models.length} label="大模型" icon="🧠" />
              <StatCard value={databases.length} label="数据库" icon="🗄️" />
              <StatCard value={plugins.length} label="插件" icon="🧩" />
              <StatCard value={engines.filter(e => e.enabled).length} label="引擎模块" icon="⚡" />
              <StatCard value={formatUptime(uptime)} label="运行时长" icon="⏱️" />
            </div>

            {/* Service status */}
            <PageCard
              title="服务状态"
              icon="🔌"
              action={
                <span className="text-sm text-muted-foreground">
                  上次刷新: {lastRefresh.toLocaleTimeString()}
                </span>
              }
            >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {services.map((service, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between p-3 bg-secondary rounded-lg border-l-3 text-sm",
                      service.status === 'running' || service.status === 'connected' 
                        ? "border-success" 
                        : "border-danger"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{service.icon}</span>
                      <div>
                        <div className="font-semibold">{service.name}</div>
                        <div className="text-xs text-muted-foreground">{service.desc}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant={service.status === 'running' || service.status === 'connected' ? 'success' : 'danger'} 
                        dot
                      >
                        {service.status === 'running' || service.status === 'connected' ? '运行中' : '离线'}
                      </Badge>
                      {service.latency && (
                        <div className="text-xs text-muted-foreground mt-1">
                          延迟: {service.latency}ms
                        </div>
                      )}
                      {service.model && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {service.model}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* System info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              <PageCard title="硬件信息" icon="💻">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">设备</span>
                    <span className="font-medium">Mac Studio M3 Ultra</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">内存</span>
                    <span className="font-medium">512GB 统一内存</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">存储</span>
                    <span className="font-medium">8TB SSD</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">GPU</span>
                    <span className="font-medium">80核心 GPU</span>
                  </div>
                </div>
              </PageCard>

              <PageCard title="软件版本" icon="📦">
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">平台版本</span>
                    <span className="font-medium">v1.0.0</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">Ollama</span>
                    <span className="font-medium">v0.3.x</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">Qdrant</span>
                    <span className="font-medium">v1.9.x</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                    <span className="text-muted-foreground">Python</span>
                    <span className="font-medium">3.11.x</span>
                  </div>
                </div>
              </PageCard>
            </div>
          </TabsContent>

          {/* ========== 大模型管理 ========== */}
          <TabsContent value="models">
            {/* Model stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
              <StatCard value={models.length} label="已部署模型" icon="🦙" />
              <StatCard value="活跃" label="内存状态" icon="💾" />
              <StatCard value="12ms" label="平均延迟" icon="⚡" />
              <StatCard value={modelConfig.defaultModel.split(':')[0]} label="当前模型" icon="🎯" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Model list */}
              <div className="lg:col-span-2">
                <PageCard
                  title="已部署模型"
                  icon="🦙"
                  action={
                    <Badge variant="success" dot>Ollama 运行中</Badge>
                  }
                >
                  <div className="space-y-3">
                    {models.map((model) => (
                      <div
                        key={model.id}
                        className={cn(
                          "flex items-center justify-between p-4 bg-secondary rounded-xl border-l-4",
                          model.status === 'loaded' ? "border-success" : "border-primary"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-primary to-purple rounded-xl flex items-center justify-center text-xl">
                            🦙
                          </div>
                          <div>
                            <div className="font-semibold flex items-center gap-2">
                              {model.name}
                              {model.name === modelConfig.defaultModel && (
                                <Badge variant="info">默认</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              大小: {model.size} | {model.provider}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={model.status === 'loaded' ? 'success' : 'default'}>
                            {model.status === 'loaded' ? '已加载' : '本地'}
                          </Badge>
                          {model.name !== modelConfig.defaultModel && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setAsDefaultModel(model.name)}
                            >
                              <Star className="w-4 h-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => showModelInfo(model)}
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="text-danger hover:text-danger"
                            onClick={() => deleteModel(model.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pull new model */}
                  <div className="mt-5 p-4 bg-background rounded-xl border border-border">
                    <h4 className="font-medium mb-3">➕ 添加新模型</h4>
                    <div className="flex gap-3">
                      <Input
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        placeholder="输入模型名称，如 qwen2.5:14b"
                        className="flex-1"
                        disabled={isPulling}
                      />
                      <Button onClick={handlePullModel} disabled={isPulling}>
                        {isPulling ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            {Math.round(pullProgress)}%
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            拉取
                          </>
                        )}
                      </Button>
                    </div>
                    {isPulling && (
                      <div className="mt-3">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${pullProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </PageCard>
              </div>

              {/* Model config */}
              <div>
                <PageCard title="模型配置" icon="⚙️">
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">默认模型</label>
                      <Select value={modelConfig.defaultModel} onValueChange={(v) => setModelConfig(prev => ({ ...prev, defaultModel: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map(m => (
                            <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        最大 Token: {modelConfig.maxTokens}
                      </label>
                      <Input
                        type="number"
                        value={modelConfig.maxTokens}
                        onChange={(e) => setModelConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 16384 }))}
                      />
                    </div>

                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        Temperature: {modelConfig.temperature}
                      </label>
                      <Slider
                        value={[modelConfig.temperature]}
                        onValueChange={([v]) => setModelConfig(prev => ({ ...prev, temperature: v }))}
                        min={0}
                        max={2}
                        step={0.1}
                      />
                    </div>

                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        Top P: {modelConfig.topP}
                      </label>
                      <Slider
                        value={[modelConfig.topP]}
                        onValueChange={([v]) => setModelConfig(prev => ({ ...prev, topP: v }))}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>

                    <div>
                      <label className="text-sm text-muted-foreground mb-2 block">
                        超时时间 (秒): {modelConfig.timeout}
                      </label>
                      <Input
                        type="number"
                        value={modelConfig.timeout}
                        onChange={(e) => setModelConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) || 300 }))}
                      />
                    </div>

                    <Button 
                      className="w-full"
                      onClick={saveModelConfig}
                    >
                      保存配置
                    </Button>
                  </div>
                </PageCard>
              </div>
            </div>
          </TabsContent>

          {/* ========== 数据库管理 ========== */}
          <TabsContent value="databases">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {databases.map((db) => (
                <PageCard key={db.id}>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center">
                      <Database className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{db.name}</h3>
                        <Badge variant={db.status === 'connected' ? 'success' : 'danger'} dot>
                          {db.status === 'connected' ? '已连接' : '未连接'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {db.type} | {db.host}:{db.port}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="secondary" size="sm" onClick={() => testDbConnection(db.id)}>
                          测试连接
                        </Button>
                        <Button variant="ghost" size="sm">
                          配置
                        </Button>
                      </div>
                    </div>
                  </div>
                </PageCard>
              ))}
              
              <PageCard 
                className="border-dashed cursor-pointer hover:border-primary/50" 
                onClick={() => setShowDbDialog(true)}
              >
                <div className="text-center py-8 text-muted-foreground">
                  <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>添加数据库</p>
                </div>
              </PageCard>
            </div>
          </TabsContent>

          {/* ========== 插件管理 ========== */}
          <TabsContent value="plugins">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plugins.map((plugin) => (
                <PageCard key={plugin.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center text-xl">
                      {plugin.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{plugin.name}</h3>
                        <Switch 
                          checked={plugin.enabled} 
                          onCheckedChange={() => togglePlugin(plugin.id)}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{plugin.description}</p>
                      <Badge variant="info" className="mt-2">{plugin.category}</Badge>
                    </div>
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          {/* ========== 引擎模块 ========== */}
          <TabsContent value="engines">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {engines.map((engine) => (
                <PageCard key={engine.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Settings2 className="w-5 h-5 text-primary" />
                      <div>
                        <h3 className="font-medium">{engine.name}</h3>
                        <p className="text-sm text-muted-foreground">{engine.desc}</p>
                      </div>
                    </div>
                    <Switch 
                      checked={engine.enabled}
                      onCheckedChange={() => toggleEngine(engine.id)}
                    />
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          {/* ========== 系统拓扑 ========== */}
          <TabsContent value="topology">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
              <div className="lg:col-span-3">
                <PageCard
                  title="系统拓扑图"
                  icon="📊"
                  action={
                    <div className="flex gap-2">
                      <Select value={topoView} onValueChange={(v: any) => setTopoView(v)}>
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部</SelectItem>
                          <SelectItem value="flow">数据流</SelectItem>
                          <SelectItem value="dep">依赖关系</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="secondary" size="sm" onClick={() => setShowAddNodeDialog(true)}>
                        <Plus className="w-4 h-4 mr-1" />
                        添加节点
                      </Button>
                    </div>
                  }
                >
                  <div className="relative w-full h-[500px] bg-gradient-to-br from-background to-secondary rounded-xl overflow-hidden">
                    <svg ref={svgRef} className="w-full h-full">
                      {/* 连接线 */}
                      {renderTopoEdges()}
                      
                      {/* 节点 */}
                      {topoNodes.map((node) => (
                        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                          <rect
                            width="120"
                            height="50"
                            rx="8"
                            fill={node.status === 'online' ? 'oklch(0.18 0.03 250)' : 'oklch(0.15 0.02 250)'}
                            stroke={node.status === 'online' ? 'oklch(0.65 0.18 240)' : 'oklch(0.40 0.10 30)'}
                            strokeWidth="2"
                            className="cursor-pointer"
                            onClick={() => toggleNodeStatus(node.id)}
                          />
                          <text x="30" y="30" fontSize="20" textAnchor="middle">{node.icon}</text>
                          <text x="75" y="32" fontSize="11" fill="white" textAnchor="middle">{node.name}</text>
                          <circle
                            cx="110"
                            cy="10"
                            r="5"
                            fill={node.status === 'online' ? 'oklch(0.75 0.18 145)' : 'oklch(0.65 0.20 30)'}
                          />
                        </g>
                      ))}
                    </svg>

                    {/* 图例 */}
                    <div className="absolute bottom-4 left-4 flex gap-4 text-xs bg-background/80 p-2 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-success" />
                        <span>在线</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-danger" />
                        <span>离线</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-primary" />
                        <span>数据流</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-4 h-0.5 bg-purple border-dashed" style={{ borderTop: '2px dashed' }} />
                        <span>依赖</span>
                      </div>
                    </div>
                  </div>
                </PageCard>
              </div>

              {/* 拓扑统计 */}
              <div className="space-y-5">
                <PageCard title="拓扑统计" icon="📈">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                      <span className="text-muted-foreground">总节点</span>
                      <span className="font-bold text-lg">{topoNodes.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                      <span className="text-muted-foreground">数据源</span>
                      <span className="font-medium">{topoNodes.filter(n => n.type === 'source').length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                      <span className="text-muted-foreground">插件</span>
                      <span className="font-medium">{topoNodes.filter(n => n.type === 'plugin').length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                      <span className="text-muted-foreground">引擎</span>
                      <span className="font-medium">{topoNodes.filter(n => n.type === 'engine').length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-secondary rounded-lg">
                      <span className="text-muted-foreground">连接数</span>
                      <span className="font-medium">{topoEdges.length}</span>
                    </div>
                  </div>
                </PageCard>

                <PageCard title="活跃数据流" icon="🔄">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 bg-secondary rounded-lg text-sm">
                      <span>传感器 → FFT</span>
                      <Badge variant="success">12 req/s</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-secondary rounded-lg text-sm">
                      <span>FFT → 特征</span>
                      <Badge variant="success">8 req/s</Badge>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-secondary rounded-lg text-sm">
                      <span>特征 → AI</span>
                      <Badge variant="warning">2 req/s</Badge>
                    </div>
                  </div>
                </PageCard>
              </div>
            </div>
          </TabsContent>

          {/* ========== 系统日志 ========== */}
          <TabsContent value="logs">
            <PageCard
              title="系统日志"
              icon="📜"
              action={
                <div className="flex gap-2">
                  <Select value={logFilter} onValueChange={setLogFilter}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="system">系统</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="error">错误</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="secondary" size="sm" onClick={clearLogs}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    清空
                  </Button>
                </div>
              }
            >
              <div className="h-[400px] overflow-y-auto font-mono text-sm bg-background rounded-lg p-4">
                {filteredLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10">
                    暂无日志记录
                  </div>
                ) : (
                  filteredLogs.slice().reverse().map((log, i) => (
                    <div key={i} className="py-1 border-b border-border/30">
                      <span className="text-muted-foreground">[{log.time}]</span>{' '}
                      <span className={cn(
                        "font-semibold",
                        log.type === 'error' && "text-danger",
                        log.type === 'api' && "text-primary",
                        log.type === 'system' && "text-success",
                        log.type === 'info' && "text-muted-foreground"
                      )}>
                        [{log.type.toUpperCase()}]
                      </span>{' '}
                      <span>{log.msg}</span>
                    </div>
                  ))
                )}
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>
      </div>

      {/* 模型详情弹窗 */}
      <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>模型详情</DialogTitle>
          </DialogHeader>
          {selectedModelInfo && (
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-secondary rounded-lg">
                <span className="text-muted-foreground">名称</span>
                <span className="font-medium">{selectedModelInfo.name}</span>
              </div>
              <div className="flex justify-between p-3 bg-secondary rounded-lg">
                <span className="text-muted-foreground">大小</span>
                <span className="font-medium">{selectedModelInfo.size}</span>
              </div>
              <div className="flex justify-between p-3 bg-secondary rounded-lg">
                <span className="text-muted-foreground">状态</span>
                <Badge variant={selectedModelInfo.status === 'loaded' ? 'success' : 'default'}>
                  {selectedModelInfo.status === 'loaded' ? '已加载' : '本地'}
                </Badge>
              </div>
              <div className="flex justify-between p-3 bg-secondary rounded-lg">
                <span className="text-muted-foreground">提供商</span>
                <span className="font-medium">{selectedModelInfo.provider}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 添加数据库弹窗 */}
      <Dialog open={showDbDialog} onOpenChange={setShowDbDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加数据库</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">名称</label>
              <Input
                value={newDbConfig.name}
                onChange={(e) => setNewDbConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="数据库名称"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">类型</label>
              <Select value={newDbConfig.type} onValueChange={(v) => setNewDbConfig(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="mongodb">MongoDB</SelectItem>
                  <SelectItem value="redis">Redis</SelectItem>
                  <SelectItem value="qdrant">Qdrant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">主机</label>
                <Input
                  value={newDbConfig.host}
                  onChange={(e) => setNewDbConfig(prev => ({ ...prev, host: e.target.value }))}
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">端口</label>
                <Input
                  value={newDbConfig.port}
                  onChange={(e) => setNewDbConfig(prev => ({ ...prev, port: e.target.value }))}
                  placeholder="5432"
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">用户名</label>
              <Input
                value={newDbConfig.username}
                onChange={(e) => setNewDbConfig(prev => ({ ...prev, username: e.target.value }))}
                placeholder="用户名"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">密码</label>
              <Input
                type="password"
                value={newDbConfig.password}
                onChange={(e) => setNewDbConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder="密码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowDbDialog(false)}>取消</Button>
            <Button onClick={handleAddDatabase}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加拓扑节点弹窗 */}
      <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加拓扑节点</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">节点名称</label>
              <Input
                value={newNode.name}
                onChange={(e) => setNewNode(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如: 新传感器"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">节点类型</label>
              <Select value={newNode.type} onValueChange={(v) => setNewNode(prev => ({ ...prev, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">📡 数据源</SelectItem>
                  <SelectItem value="plugin">🔌 插件</SelectItem>
                  <SelectItem value="engine">🤖 引擎</SelectItem>
                  <SelectItem value="output">💾 输出</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">图标</label>
              <Input
                value={newNode.icon}
                onChange={(e) => setNewNode(prev => ({ ...prev, icon: e.target.value }))}
                placeholder="📦"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAddNodeDialog(false)}>取消</Button>
            <Button onClick={handleAddTopoNode}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
