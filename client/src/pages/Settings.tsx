import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { RefreshCw, Download, Database, Plug, Settings2, Network } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { plugins, models, databases, systemStatus } = useAppStore();
  const [activeTab, setActiveTab] = useState('resources');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleRefresh = () => {
    setLastRefresh(new Date());
    toast.success('状态已刷新');
  };

  const handleExportConfig = () => {
    const config = {
      plugins,
      models,
      databases,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xilian-config.json';
    a.click();
    toast.success('配置已导出');
  };

  // 服务状态数据
  const services = [
    { name: 'API 服务', icon: '🚀', desc: 'FastAPI | 端口 8000', status: 'running', latency: 12 },
    { name: 'Ollama', icon: '🦙', desc: '推理引擎 | 端口 11434', status: systemStatus.ollama, model: systemStatus.currentModel },
    { name: 'Qdrant', icon: '🔴', desc: '向量数据库 | 端口 6333', status: 'connected' },
    { name: 'Redis', icon: '📦', desc: '缓存服务 | 端口 6379', status: 'connected' }
  ];

  // 引擎模块数据
  const engines = [
    { id: 'fft', name: 'FFT 引擎', desc: '快速傅里叶变换', enabled: true },
    { id: 'envelope', name: '包络分析', desc: '希尔伯特变换', enabled: true },
    { id: 'wavelet', name: '小波分析', desc: '时频分析', enabled: true },
    { id: 'cepstrum', name: '倒谱分析', desc: '齿轮诊断', enabled: false },
    { id: 'order', name: '阶次分析', desc: '变速工况', enabled: true },
    { id: 'ai', name: 'AI 诊断', desc: '大模型推理', enabled: true }
  ];

  return (
    <MainLayout title="系统设置">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">资源总览</h2>
            <p className="text-muted-foreground">查看系统资源和运行状态</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新状态
            </Button>
            <Button size="sm" onClick={handleExportConfig}>
              <Download className="w-4 h-4 mr-2" />
              导出配置
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="resources">📊 资源总览</TabsTrigger>
            <TabsTrigger value="databases">🗄️ 数据库</TabsTrigger>
            <TabsTrigger value="plugins">🧩 插件</TabsTrigger>
            <TabsTrigger value="engines">🔧 引擎</TabsTrigger>
            <TabsTrigger value="topology">📊 拓扑</TabsTrigger>
          </TabsList>

          {/* Resources */}
          <TabsContent value="resources">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
              <StatCard
                value={models.length}
                label="大模型"
                icon="🧠"
              />
              <StatCard
                value={databases.length}
                label="数据库"
                icon="🗄️"
              />
              <StatCard
                value={plugins.length}
                label="插件"
                icon="🧩"
              />
              <StatCard
                value={engines.filter(e => e.enabled).length}
                label="功能模块"
                icon="📦"
              />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {services.map((service, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 bg-secondary rounded-xl border-l-4 border-success"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{service.icon}</span>
                      <div>
                        <div className="font-semibold">{service.name}</div>
                        <div className="text-xs text-muted-foreground">{service.desc}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="success" dot>运行中</Badge>
                      {service.latency && (
                        <div className="text-xs text-muted-foreground mt-1">
                          延迟: {service.latency}ms
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>
          </TabsContent>

          {/* Databases */}
          <TabsContent value="databases">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                        {db.host}:{db.port}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="secondary" size="sm" onClick={() => toast.info('测试连接成功')}>
                          测试连接
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toast.info('配置功能开发中')}>
                          配置
                        </Button>
                      </div>
                    </div>
                  </div>
                </PageCard>
              ))}
              
              <PageCard className="border-dashed cursor-pointer hover:border-primary/50" onClick={() => toast.info('添加数据库功能开发中')}>
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>添加数据库</p>
                </div>
              </PageCard>
            </div>
          </TabsContent>

          {/* Plugins */}
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
                        <Badge variant={plugin.enabled ? 'success' : 'default'}>
                          {plugin.enabled ? '启用' : '禁用'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{plugin.description}</p>
                      <Badge variant="info" className="mt-2">{plugin.category}</Badge>
                    </div>
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          {/* Engines */}
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
                    <Badge variant={engine.enabled ? 'success' : 'default'}>
                      {engine.enabled ? '已启用' : '已禁用'}
                    </Badge>
                  </div>
                </PageCard>
              ))}
            </div>
          </TabsContent>

          {/* Topology */}
          <TabsContent value="topology">
            <PageCard title="系统拓扑" icon="📊">
              <div className="relative w-full h-[500px] bg-gradient-to-br from-background to-secondary rounded-xl overflow-hidden">
                {/* Simple topology visualization */}
                <svg className="w-full h-full">
                  {/* Nodes */}
                  <g transform="translate(100, 100)">
                    <circle r="30" fill="oklch(0.65 0.18 240 / 0.3)" stroke="oklch(0.65 0.18 240)" strokeWidth="2" />
                    <text textAnchor="middle" dy="5" fill="white" fontSize="12">传感器</text>
                  </g>
                  <g transform="translate(300, 100)">
                    <circle r="30" fill="oklch(0.72 0.12 200 / 0.3)" stroke="oklch(0.72 0.12 200)" strokeWidth="2" />
                    <text textAnchor="middle" dy="5" fill="white" fontSize="12">FFT</text>
                  </g>
                  <g transform="translate(500, 100)">
                    <circle r="30" fill="oklch(0.60 0.22 290 / 0.3)" stroke="oklch(0.60 0.22 290)" strokeWidth="2" />
                    <text textAnchor="middle" dy="5" fill="white" fontSize="12">AI诊断</text>
                  </g>
                  <g transform="translate(300, 250)">
                    <circle r="30" fill="oklch(0.75 0.18 145 / 0.3)" stroke="oklch(0.75 0.18 145)" strokeWidth="2" />
                    <text textAnchor="middle" dy="5" fill="white" fontSize="12">Qdrant</text>
                  </g>
                  <g transform="translate(500, 250)">
                    <circle r="30" fill="oklch(0.78 0.15 70 / 0.3)" stroke="oklch(0.78 0.15 70)" strokeWidth="2" />
                    <text textAnchor="middle" dy="5" fill="white" fontSize="12">Ollama</text>
                  </g>
                  
                  {/* Connections */}
                  <line x1="130" y1="100" x2="270" y2="100" stroke="oklch(0.65 0.18 240)" strokeWidth="2" />
                  <line x1="330" y1="100" x2="470" y2="100" stroke="oklch(0.65 0.18 240)" strokeWidth="2" />
                  <line x1="300" y1="130" x2="300" y2="220" stroke="oklch(0.65 0.18 240 / 0.5)" strokeWidth="2" strokeDasharray="5,5" />
                  <line x1="500" y1="130" x2="500" y2="220" stroke="oklch(0.65 0.18 240 / 0.5)" strokeWidth="2" strokeDasharray="5,5" />
                </svg>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 flex gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-success" />
                    <span>运行中</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-warning" />
                    <span>已停止</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-0.5 bg-primary" />
                    <span>数据流</span>
                  </div>
                </div>
              </div>
            </PageCard>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
