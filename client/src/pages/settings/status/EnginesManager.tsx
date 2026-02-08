/**
 * 引擎模块页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Cog, RefreshCw, Play, Pause } from 'lucide-react';

const mockEngines = [
  { name: '规则引擎', type: 'Rule Engine', status: 'running', load: 35, tasks: 128 },
  { name: 'CEP 引擎', type: 'Complex Event Processing', status: 'running', load: 62, tasks: 45 },
  { name: '推理引擎', type: 'Inference Engine', status: 'running', load: 78, tasks: 12 },
  { name: '聚合引擎', type: 'Aggregation Engine', status: 'running', load: 41, tasks: 256 },
  { name: '调度引擎', type: 'Scheduler Engine', status: 'idle', load: 5, tasks: 0 },
];

export default function EnginesManager() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">引擎模块</h1>
            <p className="text-muted-foreground">管理和监控系统核心引擎</p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockEngines.map((e) => (
            <Card key={e.name}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{e.name}</CardTitle>
                  <Badge variant={e.status === 'running' ? 'default' : 'secondary'}>
                    {e.status === 'running' ? '运行中' : '空闲'}
                  </Badge>
                </div>
                <CardDescription>{e.type}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>负载</span>
                  <span>{e.load}%</span>
                </div>
                <Progress value={e.load} className="h-2" />
                <p className="text-xs text-muted-foreground">活跃任务: {e.tasks}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}
