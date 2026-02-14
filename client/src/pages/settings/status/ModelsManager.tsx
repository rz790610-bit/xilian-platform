/**
 * 模型库页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Box, RefreshCw, Upload, Download, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function ModelsManager() {
  const [models] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 模型仓库」中配置模型服务连接');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">模型库</h1>
            <p className="text-muted-foreground">管理已注册的 AI/ML 模型</p>
          </div>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            上传模型
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6">
            {models.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Box className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无模型</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  上传或注册 AI/ML 模型后，模型信息将显示在此处。支持 PyTorch、TensorFlow、ONNX 等框架。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置模型仓库
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>模型名称</TableHead>
                    <TableHead>框架</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>准确率</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m: any) => (
                    <TableRow key={m.name}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell><Badge variant="outline">{m.type}</Badge></TableCell>
                      <TableCell>{m.size}</TableCell>
                      <TableCell>{m.version}</TableCell>
                      <TableCell>{m.accuracy}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === 'deployed' ? 'default' : 'secondary'}>
                          {m.status === 'deployed' ? '已部署' : '测试中'}
                        </Badge>
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
