/**
 * 微服务监控总览页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Server, Activity, RefreshCw, Zap, ArrowUpRight } from 'lucide-react';

const mockServices = [
  { name: '数据摄入服务', id: 'ingestion', status: 'healthy', qps: 98500, latency: 2.3, errorRate: 0.01, replicas: '5/5', cpu: 65, memory: 72 },
  { name: '实时聚合服务', id: 'aggregator', status: 'healthy', qps: 45200, latency: 8.5, errorRate: 0.02, replicas: '3/3', cpu: 78, memory: 65 },
  { name: '事件分发服务', id: 'dispatcher', status: 'healthy', qps: 32100, latency: 1.2, errorRate: 0.005, replicas: '3/3', cpu: 42, memory: 55 },
  { name: '性能模块', id: 'performance', status: 'warning', qps: 12800, latency: 25.6, errorRate: 0.15, replicas: '2/3', cpu: 89, memory: 82 },
];

export default function ServicesOverview() {
  const [refreshing, setRefreshing] = useState(false);
  
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">微服务监控</h1>
            <p className="text-muted-foreground">Go 高并发微服务集群状态</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshing(!refreshing)}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockServices.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{s.name}</CardTitle>
                  <Badge variant={s.status === 'healthy' ? 'default' : 'destructive'} className={s.status === 'healthy' ? 'bg-green-500' : ''}>
                    {s.status === 'healthy' ? '健康' : '告警'}
                  </Badge>
                </div>
                <CardDescription>副本: {s.replicas}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">QPS</p>
                    <p className="text-lg font-bold">{(s.qps / 1000).toFixed(1)}K</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">P99 延迟</p>
                    <p className="text-lg font-bold">{s.latency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">错误率</p>
                    <p className="text-lg font-bold">{s.errorRate}%</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>CPU</span><span>{s.cpu}%</span></div>
                  <Progress value={s.cpu} className="h-1.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs"><span>Memory</span><span>{s.memory}%</span></div>
                  <Progress value={s.memory} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
