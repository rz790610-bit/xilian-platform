/**
 * 引擎模块页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Cog, RefreshCw, Play, Pause, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function EnginesManager() {
  const [engines] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 引擎配置」中注册引擎实例');
  };

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
        {engines.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Cog className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无引擎实例</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  注册规则引擎、CEP 引擎、推理引擎等实例后，运行状态将显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置引擎
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {engines.map((e: any) => (
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
        )}
      </div>
    </MainLayout>
  );
}
