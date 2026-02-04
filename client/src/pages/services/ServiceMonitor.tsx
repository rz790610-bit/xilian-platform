/**
 * 微服务监控页面
 * 监控 Go 高并发服务状态
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  Server, 
  Activity, 
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Gauge
} from 'lucide-react';

// 模拟服务数据
const mockServices = [
  {
    id: 'sensor-ingestion',
    name: '数据摄入服务',
    description: '100K+ QPS 传感器数据摄入',
    status: 'healthy',
    replicas: { ready: 5, total: 5 },
    metrics: { qps: 98500, latencyP50: 2.3, latencyP99: 15.8, errorRate: 0.01 },
    resources: { cpu: 65, memory: 72 }
  },
  {
    id: 'realtime-aggregator',
    name: '实时聚合服务',
    description: '50K+ QPS 实时数据聚合',
    status: 'healthy',
    replicas: { ready: 3, total: 3 },
    metrics: { qps: 52300, latencyP50: 5.1, latencyP99: 28.4, errorRate: 0.02 },
    resources: { cpu: 78, memory: 85 }
  },
  {
    id: 'event-dispatcher',
    name: '事件分发服务',
    description: '200K+ QPS 事件分发',
    status: 'degraded',
    replicas: { ready: 4, total: 5 },
    metrics: { qps: 185000, latencyP50: 1.2, latencyP99: 8.5, errorRate: 0.15 },
    resources: { cpu: 92, memory: 88 }
  }
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  healthy: { label: '健康', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  degraded: { label: '降级', color: 'bg-yellow-500', icon: <Clock className="h-4 w-4 text-yellow-500" /> },
  unhealthy: { label: '异常', color: 'bg-red-500', icon: <XCircle className="h-4 w-4 text-red-500" /> },
};

export default function ServiceMonitor() {
  const [services] = useState(mockServices);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getResourceColor = (value: number) => {
    if (value >= 90) return 'text-red-500';
    if (value >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <MainLayout title="微服务监控">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-500" />
              微服务监控
            </h1>
            <p className="text-sm text-muted-foreground">Go 高并发服务状态监控</p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>

        {/* 总览统计 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                总 QPS
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(services.reduce((sum, s) => sum + s.metrics.qps, 0))}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-green-500" />
                较昨日 +12.5%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                平均延迟 P50
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(services.reduce((sum, s) => sum + s.metrics.latencyP50, 0) / services.length).toFixed(1)}ms
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowDownRight className="h-3 w-3 text-green-500" />
                较昨日 -5.2%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                平均错误率
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(services.reduce((sum, s) => sum + s.metrics.errorRate, 0) / services.length).toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground">目标 &lt; 0.1%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-purple-500" />
                服务实例
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {services.reduce((sum, s) => sum + s.replicas.ready, 0)}/
                {services.reduce((sum, s) => sum + s.replicas.total, 0)}
              </div>
              <p className="text-xs text-muted-foreground">就绪/总数</p>
            </CardContent>
          </Card>
        </div>

        {/* 服务详情 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {services.map(service => (
            <Card key={service.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{service.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    {statusConfig[service.status]?.icon}
                    <Badge className={statusConfig[service.status]?.color}>
                      {statusConfig[service.status]?.label}
                    </Badge>
                  </div>
                </div>
                <CardDescription>{service.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 副本状态 */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">副本</span>
                  <span className="font-medium">{service.replicas.ready}/{service.replicas.total}</span>
                </div>

                {/* 性能指标 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">QPS</span>
                    <span className="font-medium">{formatNumber(service.metrics.qps)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">延迟 P50/P99</span>
                    <span className="font-medium">{service.metrics.latencyP50}ms / {service.metrics.latencyP99}ms</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">错误率</span>
                    <span className={`font-medium ${service.metrics.errorRate > 0.1 ? 'text-red-500' : 'text-green-500'}`}>
                      {service.metrics.errorRate}%
                    </span>
                  </div>
                </div>

                {/* 资源使用 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CPU</span>
                    <span className={`font-medium ${getResourceColor(service.resources.cpu)}`}>
                      {service.resources.cpu}%
                    </span>
                  </div>
                  <Progress value={service.resources.cpu} className="h-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">内存</span>
                    <span className={`font-medium ${getResourceColor(service.resources.memory)}`}>
                      {service.resources.memory}%
                    </span>
                  </div>
                  <Progress value={service.resources.memory} className="h-2" />
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={() => toast.info('查看详情')}>
                  查看详情
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
