/**
 * PortAI Nexus - 边缘计算管理
 * 
 * 支持 4 个路由 Tab 切换:
 *   /edge/nodes     → 边缘节点管理
 *   /edge/inference → 边缘推理管理
 *   /edge/gateway   → 边缘网关管理
 *   /edge/tsn       → 5G TSN 管理
 * 
 * 数据源: 纯前端 Mock（原 EdgeNodes 为 Mock）
 * 后端依赖: 无（ops.listEdgeNodes 等已在 OpsDashboard 中使用）
 * 数据库依赖: 无
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  AlertTriangle,
  Brain,
  Router,
  Radio,
  Zap,
  Clock,
  BarChart3,
  Network,
  Globe,
  Play,
  Square,
  Download,
} from 'lucide-react';

// ━━━ Mock 数据 ━━━

const mockNodes = [
  { id: 'edge-001', name: '车间A边缘节点', location: '上海工厂-车间A', status: 'online', cpu: 45, memory: 62, disk: 38, models: 3, lastSeen: '2026-02-04 12:30:00' },
  { id: 'edge-002', name: '车间B边缘节点', location: '上海工厂-车间B', status: 'online', cpu: 72, memory: 85, disk: 55, models: 5, lastSeen: '2026-02-04 12:29:00' },
  { id: 'edge-003', name: '仓库边缘节点', location: '上海工厂-仓库', status: 'warning', cpu: 92, memory: 88, disk: 75, models: 2, lastSeen: '2026-02-04 12:25:00' },
  { id: 'edge-004', name: '北京分厂节点', location: '北京工厂-主车间', status: 'offline', cpu: 0, memory: 0, disk: 0, models: 4, lastSeen: '2026-02-04 10:00:00' },
  { id: 'edge-005', name: '深圳分厂节点', location: '深圳工厂-生产线', status: 'online', cpu: 35, memory: 48, disk: 22, models: 6, lastSeen: '2026-02-04 12:30:00' },
];

const mockInferenceModels = [
  { id: 'model-001', name: '设备异常检测 v2.1', type: 'anomaly-detection', framework: 'ONNX', node: 'edge-001', status: 'running', qps: 120, latency: 8.5, accuracy: 96.2, gpuUsage: 45 },
  { id: 'model-002', name: '振动频谱分析 v1.8', type: 'signal-processing', framework: 'TensorRT', node: 'edge-002', status: 'running', qps: 85, latency: 12.3, accuracy: 94.8, gpuUsage: 62 },
  { id: 'model-003', name: '视觉质检 v3.0', type: 'image-classification', framework: 'ONNX', node: 'edge-002', status: 'running', qps: 30, latency: 35.2, accuracy: 98.1, gpuUsage: 78 },
  { id: 'model-004', name: '温度预测 v1.2', type: 'regression', framework: 'TFLite', node: 'edge-003', status: 'warning', qps: 200, latency: 3.1, accuracy: 91.5, gpuUsage: 15 },
  { id: 'model-005', name: '语音指令识别 v2.0', type: 'speech-recognition', framework: 'ONNX', node: 'edge-005', status: 'running', qps: 50, latency: 22.8, accuracy: 95.3, gpuUsage: 55 },
  { id: 'model-006', name: '预测性维护 v1.5', type: 'predictive', framework: 'TensorRT', node: 'edge-001', status: 'stopped', qps: 0, latency: 0, accuracy: 93.7, gpuUsage: 0 },
];

const mockGateways = [
  { id: 'gw-001', name: 'MQTT 主网关', type: 'MQTT', endpoint: 'mqtt://10.0.1.100:1883', status: 'online', devices: 128, msgIn: 15200, msgOut: 8400, bandwidth: '12.5 MB/s', uptime: '45天 12小时' },
  { id: 'gw-002', name: 'OPC-UA 网关', type: 'OPC-UA', endpoint: 'opc.tcp://10.0.1.101:4840', status: 'online', devices: 64, msgIn: 8500, msgOut: 3200, bandwidth: '5.8 MB/s', uptime: '30天 8小时' },
  { id: 'gw-003', name: 'Modbus 网关', type: 'Modbus', endpoint: 'tcp://10.0.1.102:502', status: 'online', devices: 256, msgIn: 25000, msgOut: 12000, bandwidth: '8.2 MB/s', uptime: '60天 3小时' },
  { id: 'gw-004', name: 'HTTP REST 网关', type: 'HTTP', endpoint: 'https://10.0.1.103:8443', status: 'warning', devices: 32, msgIn: 4200, msgOut: 4100, bandwidth: '3.1 MB/s', uptime: '15天 6小时' },
  { id: 'gw-005', name: 'CoAP 网关', type: 'CoAP', endpoint: 'coap://10.0.1.104:5683', status: 'offline', devices: 0, msgIn: 0, msgOut: 0, bandwidth: '0 MB/s', uptime: '-' },
];

const mockTsnConfig = [
  { id: 'tsn-001', name: '5G 基站 A', type: '5G NR', frequency: '3.5 GHz', status: 'online', latency: 1.2, bandwidth: '1.2 Gbps', devices: 45, slicing: 'URLLC', reliability: 99.999 },
  { id: 'tsn-002', name: '5G 基站 B', type: '5G NR', frequency: '3.5 GHz', status: 'online', latency: 1.5, bandwidth: '800 Mbps', devices: 32, slicing: 'eMBB', reliability: 99.99 },
  { id: 'tsn-003', name: 'TSN 交换机 1', type: 'TSN 802.1Qbv', frequency: '-', status: 'online', latency: 0.05, bandwidth: '10 Gbps', devices: 24, slicing: 'Time-Aware', reliability: 99.9999 },
  { id: 'tsn-004', name: 'TSN 交换机 2', type: 'TSN 802.1CB', frequency: '-', status: 'online', latency: 0.03, bandwidth: '10 Gbps', devices: 16, slicing: 'Redundancy', reliability: 99.9999 },
  { id: 'tsn-005', name: '5G 小基站', type: '5G mmWave', frequency: '28 GHz', status: 'warning', latency: 0.8, bandwidth: '4 Gbps', devices: 12, slicing: 'URLLC', reliability: 99.9 },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: '在线', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  running: { label: '运行中', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  offline: { label: '离线', color: 'bg-gray-500', icon: <XCircle className="h-4 w-4 text-gray-500" /> },
  stopped: { label: '已停止', color: 'bg-gray-500', icon: <XCircle className="h-4 w-4 text-gray-500" /> },
  warning: { label: '告警', color: 'bg-yellow-500', icon: <AlertTriangle className="h-4 w-4 text-yellow-500" /> },
};

// 路由 → Tab 映射
const routeToTab: Record<string, string> = {
  '/edge/nodes': 'nodes',
  '/edge/inference': 'inference',
  '/edge/gateway': 'gateway',
  '/edge/tsn': 'tsn',
};

const tabToRoute: Record<string, string> = {
  nodes: '/edge/nodes',
  inference: '/edge/inference',
  gateway: '/edge/gateway',
  tsn: '/edge/tsn',
};

export default function EdgeNodes() {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(() => routeToTab[location] || 'nodes');

  // 路由变化时同步 Tab
  useEffect(() => {
    const tab = routeToTab[location];
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location]);

  // Tab 变化时同步路由
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const route = tabToRoute[tab];
    if (route && route !== location) {
      setLocation(route);
    }
  };

  const getResourceColor = (value: number) => {
    if (value >= 90) return 'text-red-500';
    if (value >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const onlineNodes = mockNodes.filter(n => n.status === 'online').length;
  const runningModels = mockInferenceModels.filter(m => m.status === 'running').length;
  const onlineGateways = mockGateways.filter(g => g.status === 'online').length;
  const totalDevices = mockGateways.reduce((sum, g) => sum + g.devices, 0);

  return (
    <MainLayout title="边缘计算">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Router className="h-5 w-5 text-blue-500" />
              边缘计算管理
            </h1>
            <p className="text-sm text-muted-foreground">管理边缘节点、推理模型、协议网关和 5G/TSN 网络</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info('刷新数据')}>
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
            <Button size="sm" onClick={() => toast.info('添加资源')}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Server className="h-4 w-4 text-blue-500" />节点
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onlineNodes}/{mockNodes.length}</div>
              <p className="text-xs text-muted-foreground">在线</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />推理模型
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{runningModels}/{mockInferenceModels.length}</div>
              <p className="text-xs text-muted-foreground">运行中</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Network className="h-4 w-4 text-green-500" />网关
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onlineGateways}/{mockGateways.length}</div>
              <p className="text-xs text-muted-foreground">在线</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wifi className="h-4 w-4 text-orange-500" />接入设备
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDevices}</div>
              <p className="text-xs text-muted-foreground">已连接</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Radio className="h-4 w-4 text-cyan-500" />5G/TSN
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockTsnConfig.filter(t => t.status === 'online').length}/{mockTsnConfig.length}</div>
              <p className="text-xs text-muted-foreground">在线</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />告警
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {mockNodes.filter(n => n.status === 'warning').length + mockGateways.filter(g => g.status === 'warning').length}
              </div>
              <p className="text-xs text-muted-foreground">待处理</p>
            </CardContent>
          </Card>
        </div>

        {/* 主内容 Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="nodes" className="flex items-center gap-1">
              <Server className="w-4 h-4" />
              边缘节点
            </TabsTrigger>
            <TabsTrigger value="inference" className="flex items-center gap-1">
              <Brain className="w-4 h-4" />
              边缘推理
            </TabsTrigger>
            <TabsTrigger value="gateway" className="flex items-center gap-1">
              <Network className="w-4 h-4" />
              边缘网关
            </TabsTrigger>
            <TabsTrigger value="tsn" className="flex items-center gap-1">
              <Radio className="w-4 h-4" />
              5G TSN
            </TabsTrigger>
          </TabsList>

          {/* ━━━ 边缘节点 Tab ━━━ */}
          <TabsContent value="nodes">
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
                    {mockNodes.map(node => (
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
                        <TableCell><Badge variant="outline">{node.models}</Badge></TableCell>
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
          </TabsContent>

          {/* ━━━ 边缘推理 Tab ━━━ */}
          <TabsContent value="inference">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">边缘推理模型</CardTitle>
                <CardDescription>部署在边缘节点上的 AI 推理模型</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模型名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>框架</TableHead>
                      <TableHead>部署节点</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>QPS</TableHead>
                      <TableHead>延迟</TableHead>
                      <TableHead>准确率</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockInferenceModels.map(model => (
                      <TableRow key={model.id}>
                        <TableCell className="font-medium">{model.name}</TableCell>
                        <TableCell><Badge variant="outline">{model.type}</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{model.framework}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{model.node}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusConfig[model.status]?.icon}
                            <Badge className={statusConfig[model.status]?.color}>
                              {statusConfig[model.status]?.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{model.qps}</TableCell>
                        <TableCell>
                          <span className={model.latency > 20 ? 'text-yellow-500' : 'text-green-500'}>
                            {model.latency}ms
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={model.accuracy >= 95 ? 'text-green-500' : 'text-yellow-500'}>
                            {model.accuracy}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={model.gpuUsage} className="w-12 h-2" />
                            <span className="text-sm">{model.gpuUsage}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {model.status === 'running' ? (
                              <Button variant="ghost" size="icon" onClick={() => toast.info('停止模型')}>
                                <Square className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" onClick={() => toast.info('启动模型')}>
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => toast.info('模型配置')}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ 边缘网关 Tab ━━━ */}
          <TabsContent value="gateway">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">协议网关</CardTitle>
                    <CardDescription>边缘协议转换网关（MQTT / OPC-UA / Modbus / HTTP / CoAP）</CardDescription>
                  </div>
                  <a href="/settings/config/access-layer" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    \uD83D\uDD0C 接入层管理 \u2192
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>协议</TableHead>
                      <TableHead>端点</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>设备数</TableHead>
                      <TableHead>消息收/发</TableHead>
                      <TableHead>带宽</TableHead>
                      <TableHead>运行时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockGateways.map(gw => (
                      <TableRow key={gw.id}>
                        <TableCell className="font-medium">{gw.name}</TableCell>
                        <TableCell><Badge variant="outline">{gw.type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{gw.endpoint}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusConfig[gw.status]?.icon}
                            <Badge className={statusConfig[gw.status]?.color}>
                              {statusConfig[gw.status]?.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{gw.devices}</TableCell>
                        <TableCell>
                          <span className="text-green-500">{gw.msgIn.toLocaleString()}</span>
                          {' / '}
                          <span className="text-blue-500">{gw.msgOut.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>{gw.bandwidth}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{gw.uptime}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => toast.info('网关配置')}>
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ 5G TSN Tab ━━━ */}
          <TabsContent value="tsn">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">5G / TSN 网络</CardTitle>
                <CardDescription>5G NR 基站和 TSN 时间敏感网络交换机</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>频段</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>延迟</TableHead>
                      <TableHead>带宽</TableHead>
                      <TableHead>设备数</TableHead>
                      <TableHead>切片/模式</TableHead>
                      <TableHead>可靠性</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockTsnConfig.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell><Badge variant="outline">{item.type}</Badge></TableCell>
                        <TableCell>{item.frequency}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusConfig[item.status]?.icon}
                            <Badge className={statusConfig[item.status]?.color}>
                              {statusConfig[item.status]?.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={item.latency <= 1 ? 'text-green-500 font-medium' : ''}>
                            {item.latency}ms
                          </span>
                        </TableCell>
                        <TableCell>{item.bandwidth}</TableCell>
                        <TableCell>{item.devices}</TableCell>
                        <TableCell><Badge variant="secondary">{item.slicing}</Badge></TableCell>
                        <TableCell>
                          <span className={item.reliability >= 99.999 ? 'text-green-500 font-medium' : ''}>
                            {item.reliability}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => toast.info('配置')}>
                            <Settings className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
