/**
 * 模型库页面
 * 数据源: trpc.model.listModels（Ollama 真实模型列表）
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Box, RefreshCw, Cpu, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { trpc } from '@/lib/trpc';

function formatSize(bytes: number): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export default function ModelsManager() {
  const { data: models, isLoading, refetch, error } = trpc.model.listModels.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 2,
  });

  const modelList = Array.isArray(models) ? models : [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">模型库</h1>
            <p className="text-muted-foreground">Ollama 本地模型管理</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 连接状态 */}
        <div className="flex items-center gap-4">
          {error ? (
            <Badge variant="outline" className="text-red-400 border-red-400/30">
              <WifiOff className="h-3 w-3 mr-1" />
              Ollama 未连接 — {error.message}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-green-400 border-green-400/30">
              <Wifi className="h-3 w-3 mr-1" />
              Ollama 已连接 · {modelList.length} 个模型
            </Badge>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>已安装模型</CardTitle>
            <CardDescription>本地 Ollama 实例中已下载的模型</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : modelList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Box className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无模型</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  {error ? 'Ollama 服务未连接，请确认 Ollama 已启动。' : '使用 ollama pull 命令下载模型后，模型信息将显示在此处。'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型名称</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>参数量</TableHead>
                    <TableHead>量化</TableHead>
                    <TableHead>修改时间</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelList.map((m: any) => (
                    <TableRow key={m.name || m.model}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-4 w-4 text-muted-foreground" />
                          {m.name || m.model}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3 text-muted-foreground" />
                          {formatSize(m.size)}
                        </div>
                      </TableCell>
                      <TableCell>{m.details?.parameter_size || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.details?.quantization_level || '-'}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {m.modified_at ? new Date(m.modified_at).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-600">可用</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
