/**
 * 数据流监控页面
 * 展示事件总线、实时计算、传感器数据流状态
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Activity, 
  Zap, 
  Server, 
  AlertTriangle, 
  Play, 
  Pause, 
  RefreshCw,
  Plus,
  Trash2,
  BarChart3,
  Clock,
  Cpu,
  Database
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';

export default function DataStream() {
  // 使用 sonner toast
  const [activeTab, setActiveTab] = useState('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  // tRPC 查询
  // Kafka 状态查询
  const kafkaStatus = trpc.eventBus.getKafkaStatus.useQuery(undefined, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const eventMetrics = trpc.eventBus.getMetrics.useQuery(undefined, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const recentEvents = trpc.eventBus.getRecentEvents.useQuery({ limit: 50 }, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const streamMetrics = trpc.stream.getMetrics.useQuery(undefined, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const recentAnomalies = trpc.stream.getRecentAnomalies.useQuery({ limit: 20 }, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const simulatorStatus = trpc.device.getSimulatorStatus.useQuery(undefined, {
    refetchInterval: autoRefresh ? refreshInterval : false,
  });
  const devices = trpc.device.listDevices.useQuery({}, {
    refetchInterval: autoRefresh ? 30000 : false,
  });
  const sensors = trpc.device.listSensors.useQuery({}, {
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Mutations
  const startSimulator = trpc.device.startSimulator.useMutation({
    onSuccess: () => {
      toast.success('数据模拟器已启动');
      simulatorStatus.refetch();
    },
  });
  const stopSimulator = trpc.device.stopSimulator.useMutation({
    onSuccess: () => {
      toast.success('数据模拟器已停止');
      simulatorStatus.refetch();
    },
  });
  const initSampleData = trpc.device.initSampleData.useMutation({
    onSuccess: () => {
      toast.success('示例数据初始化完成');
      devices.refetch();
      sensors.refetch();
    },
  });
  const setStreamRunning = trpc.stream.setRunning.useMutation({
    onSuccess: (data) => {
      toast.success(data.isRunning ? '流处理器已启动' : '流处理器已停止');
      streamMetrics.refetch();
    },
  });
  const injectAnomaly = trpc.device.injectAnomaly.useMutation({
    onSuccess: () => {
      toast.success('异常数据已注入');
      recentAnomalies.refetch();
    },
  });

  // 获取严重程度颜色
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      case 'warning': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <MainLayout title="数据流监控">
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">数据流监控</h1>
          <p className="text-sm text-muted-foreground">实时监控事件总线、流处理和传感器数据</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(refreshInterval)}
            onValueChange={(v) => setRefreshInterval(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1秒</SelectItem>
              <SelectItem value="5000">5秒</SelectItem>
              <SelectItem value="10000">10秒</SelectItem>
              <SelectItem value="30000">30秒</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {autoRefresh ? '暂停' : '自动刷新'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              eventMetrics.refetch();
              recentEvents.refetch();
              streamMetrics.refetch();
              recentAnomalies.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              事件总数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{eventMetrics.data?.totalEvents || 0}</div>
            <p className="text-xs text-muted-foreground">
              缓冲区: {eventMetrics.data?.bufferSize || 0} 条
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              流处理状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={streamMetrics.data?.isRunning ? 'default' : 'secondary'}>
                {streamMetrics.data?.isRunning ? '运行中' : '已停止'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              已处理: {streamMetrics.data?.processedReadings || 0} 条
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              检测异常
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{streamMetrics.data?.detectedAnomalies || 0}</div>
            <p className="text-xs text-muted-foreground">
              活跃窗口: {streamMetrics.data?.activeWindows || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-500" />
              模拟器状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={simulatorStatus.data?.isRunning ? 'default' : 'secondary'}>
                {simulatorStatus.data?.isRunning ? '运行中' : '已停止'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              设备数: {simulatorStatus.data?.deviceCount || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 主要内容区 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="events">事件流</TabsTrigger>
          <TabsTrigger value="anomalies">异常检测</TabsTrigger>
          <TabsTrigger value="devices">设备管理</TabsTrigger>
          <TabsTrigger value="simulator">数据模拟</TabsTrigger>
        </TabsList>

        {/* 概览 */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 事件统计 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">事件统计</CardTitle>
                <CardDescription>按主题和严重程度分类</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">按主题</h4>
                    <div className="space-y-2">
                      {eventMetrics.data?.eventsByTopic && 
                        Object.entries(eventMetrics.data.eventsByTopic).map(([topic, count]) => (
                          <div key={topic} className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{topic}</span>
                            <Badge variant="outline">{count as number}</Badge>
                          </div>
                        ))
                      }
                      {(!eventMetrics.data?.eventsByTopic || Object.keys(eventMetrics.data.eventsByTopic).length === 0) && (
                        <p className="text-sm text-muted-foreground">暂无事件数据</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">按严重程度</h4>
                    <div className="flex gap-2 flex-wrap">
                      {eventMetrics.data?.eventsBySeverity && 
                        Object.entries(eventMetrics.data.eventsBySeverity).map(([severity, count]) => (
                          <Badge key={severity} className={getSeverityColor(severity)}>
                            {severity}: {count as number}
                          </Badge>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 控制面板 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">控制面板</CardTitle>
                <CardDescription>启动/停止各模块</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">流处理器</h4>
                    <p className="text-sm text-muted-foreground">滑动窗口异常检测</p>
                  </div>
                  <Button
                    variant={streamMetrics.data?.isRunning ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => setStreamRunning.mutate({ running: !streamMetrics.data?.isRunning })}
                  >
                    {streamMetrics.data?.isRunning ? '停止' : '启动'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">数据模拟器</h4>
                    <p className="text-sm text-muted-foreground">模拟传感器数据流</p>
                  </div>
                  <Button
                    variant={simulatorStatus.data?.isRunning ? 'destructive' : 'default'}
                    size="sm"
                    onClick={() => {
                      if (simulatorStatus.data?.isRunning) {
                        stopSimulator.mutate();
                      } else {
                        startSimulator.mutate({ intervalMs: 1000 });
                      }
                    }}
                  >
                    {simulatorStatus.data?.isRunning ? '停止' : '启动'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <h4 className="font-medium">初始化示例数据</h4>
                    <p className="text-sm text-muted-foreground">创建示例设备和传感器</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => initSampleData.mutate()}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    初始化
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 事件流 */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>实时事件流</CardTitle>
              <CardDescription>最近 50 条事件</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {recentEvents.data?.map((event: any) => (
                    <div
                      key={event.eventId}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{event.topic}</Badge>
                          <Badge className={getSeverityColor(event.severity)}>
                            {event.severity}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{event.eventType}</p>
                      {event.nodeId && (
                        <p className="text-xs text-muted-foreground">
                          设备: {event.nodeId} {event.sensorId && `| 传感器: ${event.sensorId}`}
                        </p>
                      )}
                    </div>
                  ))}
                  {(!recentEvents.data || recentEvents.data.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Zap className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>暂无事件数据</p>
                      <p className="text-sm">启动数据模拟器生成测试数据</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 异常检测 */}
        <TabsContent value="anomalies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>异常检测结果</CardTitle>
              <CardDescription>基于滑动窗口的 Z-Score 异常检测</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {recentAnomalies.data?.map((anomaly: any) => (
                    <div
                      key={anomaly.detectionId}
                      className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={getSeverityColor(anomaly.severity)}>
                            {anomaly.severity}
                          </Badge>
                          <Badge variant="outline">{anomaly.algorithmType}</Badge>
                          <Badge variant={anomaly.status === 'open' ? 'destructive' : 'secondary'}>
                            {anomaly.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(anomaly.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">传感器:</span>
                          <span className="ml-1 font-medium">{anomaly.sensorId}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">当前值:</span>
                          <span className="ml-1 font-medium">{anomaly.currentValue?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">期望值:</span>
                          <span className="ml-1 font-medium">{anomaly.expectedValue?.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">偏差分数:</span>
                          <span className="ml-1 font-medium">{anomaly.score?.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!recentAnomalies.data || recentAnomalies.data.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>暂无异常检测记录</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* 注入异常测试 */}
          <Card>
            <CardHeader>
              <CardTitle>注入测试异常</CardTitle>
              <CardDescription>手动注入异常数据用于测试</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label>传感器ID</Label>
                  <Input id="anomaly-sensor" placeholder="例如: agv_001_vib" defaultValue="agv_001_vib" />
                </div>
                <div className="flex-1">
                  <Label>设备ID</Label>
                  <Input id="anomaly-device" placeholder="例如: agv_001" defaultValue="agv_001" />
                </div>
                <div className="flex-1">
                  <Label>异常值</Label>
                  <Input id="anomaly-value" type="number" placeholder="例如: 100" defaultValue="100" />
                </div>
                <Button
                  onClick={() => {
                    const sensorId = (document.getElementById('anomaly-sensor') as HTMLInputElement)?.value;
                    const nodeId = (document.getElementById('anomaly-device') as HTMLInputElement)?.value;
                    const value = Number((document.getElementById('anomaly-value') as HTMLInputElement)?.value);
                    if (sensorId && nodeId && !isNaN(value)) {
                      injectAnomaly.mutate({ sensorId, nodeId, anomalyValue: value });
                    }
                  }}
                >
                  注入异常
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 设备管理 */}
        <TabsContent value="devices" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>设备列表</CardTitle>
                <CardDescription>共 {devices.data?.length || 0} 台设备</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {devices.data?.map((device: any) => (
                      <div
                        key={device.nodeId}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{device.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {device.nodeId} | {device.type}
                            </p>
                          </div>
                          <Badge variant={device.status === 'online' ? 'default' : 'secondary'}>
                            {device.status}
                          </Badge>
                        </div>
                        {device.location && (
                          <p className="text-xs text-muted-foreground mt-1">
                            位置: {device.location}
                          </p>
                        )}
                      </div>
                    ))}
                    {(!devices.data || devices.data.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>暂无设备</p>
                        <p className="text-sm">点击"初始化示例数据"创建测试设备</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>传感器列表</CardTitle>
                <CardDescription>共 {sensors.data?.length || 0} 个传感器</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {sensors.data?.map((sensor: any) => (
                      <div
                        key={sensor.sensorId}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{sensor.name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {sensor.sensorId} | {sensor.type}
                            </p>
                          </div>
                          <Badge variant={sensor.status === 'active' ? 'default' : 'secondary'}>
                            {sensor.status}
                          </Badge>
                        </div>
                        {sensor.lastValue && (
                          <p className="text-xs text-muted-foreground mt-1">
                            最新值: {sensor.lastValue} {sensor.unit}
                          </p>
                        )}
                      </div>
                    ))}
                    {(!sensors.data || sensors.data.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Cpu className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>暂无传感器</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 数据模拟 */}
        <TabsContent value="simulator">
          <Card>
            <CardHeader>
              <CardTitle>数据模拟器</CardTitle>
              <CardDescription>模拟传感器数据流用于测试</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div>
                  <h4 className="font-medium">模拟器状态</h4>
                  <p className="text-sm text-muted-foreground">
                    {simulatorStatus.data?.isRunning 
                      ? `正在模拟 ${simulatorStatus.data.deviceCount} 台设备的数据`
                      : '模拟器已停止'
                    }
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={simulatorStatus.data?.isRunning ? 'destructive' : 'default'}
                    onClick={() => {
                      if (simulatorStatus.data?.isRunning) {
                        stopSimulator.mutate();
                      } else {
                        startSimulator.mutate({ intervalMs: 1000 });
                      }
                    }}
                  >
                    {simulatorStatus.data?.isRunning ? (
                      <>
                        <Pause className="h-4 w-4 mr-1" />
                        停止模拟
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        启动模拟
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {simulatorStatus.data?.devices && simulatorStatus.data.devices.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">模拟设备列表</h4>
                  <div className="flex flex-wrap gap-2">
                    {(simulatorStatus.data.devices || []).map((nodeId: string) => (
                      <Badge key={nodeId} variant="outline">
                        {nodeId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">使用说明</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>点击"初始化示例数据"创建示例设备和传感器</li>
                  <li>点击"启动模拟"开始生成模拟数据</li>
                  <li>启动"流处理器"进行实时异常检测</li>
                  <li>在"事件流"标签页查看实时事件</li>
                  <li>在"异常检测"标签页查看检测结果</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </MainLayout>
  );
}
