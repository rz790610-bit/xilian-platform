/**
 * PortAI Nexus - 边缘计算管理
 *
 * 支持 4 个路由 Tab 切换:
 *   /edge/nodes     → 边缘节点管理
 *   /edge/inference → 边缘推理管理
 *   /edge/gateway   → 边缘网关管理
 *   /edge/tsn       → 5G TSN 管理
 *
 * 数据源: tRPC (ops.listEdgeNodes / listEdgeModels / listEdgeGateways / listTSNConfigs)
 */

import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
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
  Database,
} from 'lucide-react';

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

// ─── 空状态组件 ───
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}

// ─── 加载骨架 ───
function TableSkeleton({ rows = 5, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}><Skeleton className="h-4 w-full" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function EdgeNodes() {
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState(() => routeToTab[location] || 'nodes');

  // ─── tRPC 数据查询 ───
  const { data: edgeNodes, isLoading: nodesLoading, refetch: refetchNodes } = trpc.ops.listEdgeNodes.useQuery();
  const { data: edgeModels, isLoading: modelsLoading, refetch: refetchModels } = trpc.ops.listEdgeModels.useQuery();
  const { data: edgeGateways, isLoading: gatewaysLoading, refetch: refetchGateways } = trpc.ops.listEdgeGateways.useQuery();
  const { data: tsnConfigs, isLoading: tsnLoading, refetch: refetchTsn } = trpc.ops.listTSNConfigs.useQuery();

  const nodes = useMemo(() => edgeNodes ?? [], [edgeNodes]);
  const models = useMemo(() => edgeModels ?? [], [edgeModels]);
  const gateways = useMemo(() => edgeGateways ?? [], [edgeGateways]);
  const tsnList = useMemo(() => tsnConfigs ?? [], [tsnConfigs]);

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

  const handleRefreshAll = () => {
    refetchNodes();
    refetchModels();
    refetchGateways();
    refetchTsn();
    toast.info('正在刷新数据...');
  };

  const getResourceColor = (value: number) => {
    if (value >= 90) return 'text-red-500';
    if (value >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  // ─── 统计计算 ───
  const onlineNodes = nodes.filter((n: any) => n.status === 'online').length;
  const runningModels = models.filter((m: any) => m.status === 'running').length;
  const onlineGateways = gateways.filter((g: any) => g.status === 'online').length;
  const totalDevices = gateways.reduce((sum: number, g: any) => sum + (g.devices || g.deviceCount || 0), 0);
  const onlineTsn = tsnList.filter((t: any) => t.status === 'online').length;
  const warningCount = nodes.filter((n: any) => n.status === 'warning').length + gateways.filter((g: any) => g.status === 'warning').length;

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
            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
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
              <div className="text-2xl font-bold">{nodesLoading ? '—' : `${onlineNodes}/${nodes.length}`}</div>
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
              <div className="text-2xl font-bold">{modelsLoading ? '—' : `${runningModels}/${models.length}`}</div>
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
              <div className="text-2xl font-bold">{gatewaysLoading ? '—' : `${onlineGateways}/${gateways.length}`}</div>
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
              <div className="text-2xl font-bold">{gatewaysLoading ? '—' : totalDevices}</div>
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
              <div className="text-2xl font-bold">{tsnLoading ? '—' : `${onlineTsn}/${tsnList.length}`}</div>
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
                {nodesLoading || gatewaysLoading ? '—' : warningCount}
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
                {nodesLoading ? (
                  <TableSkeleton rows={5} cols={10} />
                ) : nodes.length === 0 ? (
                  <EmptyState
                    icon={<Server className="h-12 w-12" />}
                    title="暂无边缘节点"
                    description="请通过「添加」按钮注册新的边缘计算节点，或检查后端服务连接状态"
                  />
                ) : (
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
                      {nodes.map((node: any) => (
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
                                {statusConfig[node.status]?.label || node.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={node.cpu ?? 0} className="w-16 h-2" />
                              <span className={`text-sm ${getResourceColor(node.cpu ?? 0)}`}>{node.cpu ?? 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={node.memory ?? 0} className="w-16 h-2" />
                              <span className={`text-sm ${getResourceColor(node.memory ?? 0)}`}>{node.memory ?? 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={node.disk ?? 0} className="w-16 h-2" />
                              <span className={`text-sm ${getResourceColor(node.disk ?? 0)}`}>{node.disk ?? 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{node.models ?? node.modelCount ?? 0}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{node.lastSeen ?? node.lastHeartbeat ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => toast.info('节点配置')}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
                {modelsLoading ? (
                  <TableSkeleton rows={5} cols={10} />
                ) : models.length === 0 ? (
                  <EmptyState
                    icon={<Brain className="h-12 w-12" />}
                    title="暂无推理模型"
                    description="请部署 AI 推理模型到边缘节点，支持 ONNX / TensorRT / TFLite 框架"
                  />
                ) : (
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
                      {models.map((model: any) => (
                        <TableRow key={model.id}>
                          <TableCell className="font-medium">{model.name}</TableCell>
                          <TableCell><Badge variant="outline">{model.type}</Badge></TableCell>
                          <TableCell><Badge variant="secondary">{model.framework}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{model.node ?? model.nodeId}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {statusConfig[model.status]?.icon}
                              <Badge className={statusConfig[model.status]?.color}>
                                {statusConfig[model.status]?.label || model.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{model.qps ?? 0}</TableCell>
                          <TableCell>
                            <span className={(model.latency ?? 0) > 20 ? 'text-yellow-500' : 'text-green-500'}>
                              {model.latency ?? 0}ms
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={(model.accuracy ?? 0) >= 95 ? 'text-green-500' : 'text-yellow-500'}>
                              {model.accuracy ?? 0}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={model.gpuUsage ?? 0} className="w-12 h-2" />
                              <span className="text-sm">{model.gpuUsage ?? 0}%</span>
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
                )}
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
                    🔌 接入层管理 →
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                {gatewaysLoading ? (
                  <TableSkeleton rows={5} cols={9} />
                ) : gateways.length === 0 ? (
                  <EmptyState
                    icon={<Network className="h-12 w-12" />}
                    title="暂无协议网关"
                    description="请创建边缘协议网关以连接工业设备，支持 MQTT / OPC-UA / Modbus 等协议"
                  />
                ) : (
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
                      {gateways.map((gw: any) => (
                        <TableRow key={gw.id}>
                          <TableCell className="font-medium">{gw.name}</TableCell>
                          <TableCell><Badge variant="outline">{gw.type ?? gw.protocol}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{gw.endpoint}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {statusConfig[gw.status]?.icon}
                              <Badge className={statusConfig[gw.status]?.color}>
                                {statusConfig[gw.status]?.label || gw.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{gw.devices ?? gw.deviceCount ?? 0}</TableCell>
                          <TableCell>
                            <span className="text-green-500">{(gw.msgIn ?? gw.messagesIn ?? 0).toLocaleString()}</span>
                            {' / '}
                            <span className="text-blue-500">{(gw.msgOut ?? gw.messagesOut ?? 0).toLocaleString()}</span>
                          </TableCell>
                          <TableCell>{gw.bandwidth ?? '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{gw.uptime ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => toast.info('网关配置')}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
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
                {tsnLoading ? (
                  <TableSkeleton rows={5} cols={10} />
                ) : tsnList.length === 0 ? (
                  <EmptyState
                    icon={<Radio className="h-12 w-12" />}
                    title="暂无 5G/TSN 配置"
                    description="请配置 5G NR 基站或 TSN 时间敏感网络交换机"
                  />
                ) : (
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
                      {tsnList.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell><Badge variant="outline">{item.type}</Badge></TableCell>
                          <TableCell>{item.frequency ?? '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {statusConfig[item.status]?.icon}
                              <Badge className={statusConfig[item.status]?.color}>
                                {statusConfig[item.status]?.label || item.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={(item.latency ?? 999) <= 1 ? 'text-green-500 font-medium' : ''}>
                              {item.latency ?? '—'}ms
                            </span>
                          </TableCell>
                          <TableCell>{item.bandwidth ?? '—'}</TableCell>
                          <TableCell>{item.devices ?? item.deviceCount ?? 0}</TableCell>
                          <TableCell><Badge variant="secondary">{item.slicing ?? item.mode ?? '—'}</Badge></TableCell>
                          <TableCell>
                            <span className={(item.reliability ?? 0) >= 99.999 ? 'text-green-500 font-medium' : ''}>
                              {item.reliability ?? '—'}%
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
