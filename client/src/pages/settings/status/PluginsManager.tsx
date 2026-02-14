/**
 * 插件管理页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Puzzle, RefreshCw, Download, Settings, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function PluginsManager() {
  const [plugins] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 插件市场」中浏览和安装插件');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">插件管理</h1>
            <p className="text-muted-foreground">管理系统扩展插件</p>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            安装插件
          </Button>
        </div>
        {plugins.length === 0 ? (
          <Card>
            <CardContent className="py-16">
              <div className="flex flex-col items-center justify-center text-center">
                <Puzzle className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无插件</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  从插件市场安装扩展插件后，插件状态将显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  浏览插件市场
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((p: any) => (
              <Card key={p.name}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    <Switch checked={p.status === 'active'} />
                  </div>
                  <CardDescription>{p.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">v{p.version}</Badge>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                      {p.status === 'active' ? '已启用' : '已禁用'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
