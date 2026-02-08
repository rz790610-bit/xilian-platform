/**
 * 模型库页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Box, RefreshCw, Upload, Download } from 'lucide-react';

const mockModels = [
  { name: 'vibration-anomaly-v3', type: 'PyTorch', size: '245 MB', version: 'v3.2.1', status: 'deployed', accuracy: '96.8%' },
  { name: 'bearing-fault-classifier', type: 'TensorFlow', size: '180 MB', version: 'v2.1.0', status: 'deployed', accuracy: '94.2%' },
  { name: 'temperature-predictor', type: 'ONNX', size: '52 MB', version: 'v1.5.0', status: 'deployed', accuracy: '92.1%' },
  { name: 'acoustic-emission-detector', type: 'PyTorch', size: '310 MB', version: 'v1.0.0', status: 'testing', accuracy: '89.5%' },
  { name: 'motor-health-index', type: 'Scikit-learn', size: '12 MB', version: 'v4.0.0', status: 'deployed', accuracy: '91.3%' },
];

export default function ModelsManager() {
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
                {mockModels.map((m) => (
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
