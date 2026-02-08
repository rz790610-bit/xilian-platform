/**
 * 资源总览页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Server, HardDrive, Cpu, MemoryStick, Activity, RefreshCw 
} from 'lucide-react';

const mockResources = [
  { name: 'CPU 使用率', value: 42, max: 100, unit: '%', status: 'normal' },
  { name: '内存使用', value: 12.8, max: 32, unit: 'GB', status: 'normal' },
  { name: '磁盘使用', value: 256, max: 500, unit: 'GB', status: 'warning' },
  { name: '网络带宽', value: 450, max: 1000, unit: 'Mbps', status: 'normal' },
];

export default function ResourcesOverview() {
  const [refreshing, setRefreshing] = useState(false);
  
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">资源总览</h1>
            <p className="text-muted-foreground">系统资源使用情况监控</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRefreshing(!refreshing)}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mockResources.map((r) => (
            <Card key={r.name}>
              <CardHeader className="pb-2">
                <CardDescription>{r.name}</CardDescription>
                <CardTitle className="text-2xl">{r.value} {r.unit}</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={(r.value / r.max) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">总量: {r.max} {r.unit}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>服务状态</CardTitle>
            <CardDescription>核心服务运行状态</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['MySQL', 'Redis', 'Kafka', 'ClickHouse', 'Neo4j', 'MinIO', 'Vault', 'Prometheus'].map((s) => (
                <div key={s} className="flex items-center gap-2 p-3 rounded-lg border">
                  <Badge variant="default" className="bg-green-500">运行中</Badge>
                  <span className="text-sm font-medium">{s}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
