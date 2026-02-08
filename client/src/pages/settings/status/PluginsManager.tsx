/**
 * 插件管理页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Puzzle, RefreshCw, Download, Settings } from 'lucide-react';

const mockPlugins = [
  { name: 'Falco Runtime Security', version: '0.37.1', status: 'active', description: '运行时安全监控插件' },
  { name: 'Trivy Scanner', version: '0.48.0', status: 'active', description: '容器镜像漏洞扫描' },
  { name: 'Prometheus Exporter', version: '2.45.0', status: 'active', description: '指标导出插件' },
  { name: 'Grafana Dashboard', version: '10.2.0', status: 'active', description: '可视化仪表板' },
  { name: 'Semgrep SAST', version: '1.52.0', status: 'inactive', description: '静态代码分析' },
  { name: 'Gitleaks', version: '8.18.0', status: 'active', description: '密钥泄露检测' },
];

export default function PluginsManager() {
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockPlugins.map((p) => (
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
      </div>
    </MainLayout>
  );
}
