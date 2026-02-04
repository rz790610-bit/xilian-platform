/**
 * 边缘节点管理页面
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  Server, 
  Cpu, 
  HardDrive,
  Wifi,
  MapPin,
  RefreshCw,
  Plus,
  Settings,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';

// 模拟边缘节点数据
const mockNodes = [
  { id: 'edge-001', name: '车间A边缘节点', location: '上海工厂-车间A', status: 'online', cpu: 45, memory: 62, disk: 38, models: 3, lastSeen: '2026-02-04 12:30:00' },
  { id: 'edge-002', name: '车间B边缘节点', location: '上海工厂-车间B', status: 'online', cpu: 72, memory: 85, disk: 55, models: 5, lastSeen: '2026-02-04 12:29:00' },
  { id: 'edge-003', name: '仓库边缘节点', location: '上海工厂-仓库', status: 'warning', cpu: 92, memory: 88, disk: 75, models: 2, lastSeen: '2026-02-04 12:25:00' },
  { id: 'edge-004', name: '北京分厂节点', location: '北京工厂-主车间', status: 'offline', cpu: 0, memory: 0, disk: 0, models: 4, lastSeen: '2026-02-04 10:00:00' },
  { id: 'edge-005', name: '深圳分厂节点', location: '深圳工厂-生产线', status: 'online', cpu: 35, memory: 48, disk: 22, models: 6, lastSeen: '2026-02-04 12:30:00' },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: '在线', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  offline: { label: '离线', color: 'bg-gray-500', icon: <XCircle className="h-4 w-4 text-gray-500" /> },
  warning: { label: '告警', color: 'bg-yellow-500', icon: <AlertTriangle className="h-4 w-4 text-yellow-500" /> },
};

export default function EdgeNodes() {
  const [nodes] = useState(mockNodes);

  const getResourceColor = (value: number) => {
    if (value >= 90) return 'text-red-500';
    if (value >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <MainLayout title="边缘节点">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-500" />
              边缘节点管理
            </h1>
            <p className="text-sm text-muted-foreground">管理和监控边缘计算节点</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              添加节点
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-500" />
                节点总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nodes.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                在线节点
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">
                {nodes.filter(n => n.status === 'online').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-purple-500" />
                部署模型
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {nodes.reduce((sum, n) => sum + n.models, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                告警节点
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {nodes.filter(n => n.status === 'warning').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 节点列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">边缘节点列表</CardTitle>
            <CardDescription>所有注册的边缘计算节点</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>节点ID</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>位置</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>内存</TableHead>
                  <TableHead>磁盘</TableHead>
                  <TableHead>模型数</TableHead>
                  <TableHead>最后心跳</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map(node => (
                  <TableRow key={node.id}>
                    <TableCell className="font-mono text-sm">{node.id}</TableCell>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{node.location}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusConfig[node.status]?.icon}
                        <Badge className={statusConfig[node.status]?.color}>
                          {statusConfig[node.status]?.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={node.cpu} className="w-16 h-2" />
                        <span className={`text-sm ${getResourceColor(node.cpu)}`}>{node.cpu}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={node.memory} className="w-16 h-2" />
                        <span className={`text-sm ${getResourceColor(node.memory)}`}>{node.memory}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={node.disk} className="w-16 h-2" />
                        <span className={`text-sm ${getResourceColor(node.disk)}`}>{node.disk}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{node.models}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{node.lastSeen}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => toast.info('节点配置')}>
                        <Settings className="h-4 w-4" />
                      </Button>
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
