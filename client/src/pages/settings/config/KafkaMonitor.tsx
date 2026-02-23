/**
 * Kafka 监控仪表盘
 * 展示 Kafka 集群状态、主题信息、消费者组、吞吐量等实时指标
 */

import { useState, useEffect } from "react";
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useKafkaMetricsWs } from "@/hooks/useKafkaMetricsWs";
import { ThroughputChart } from "@/components/charts/ThroughputChart";
import { LatencyChart } from "@/components/charts/LatencyChart";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Layers,
  MessageSquare,
  RefreshCw,
  Server,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
  Radio,
} from "lucide-react";

// 状态徽章组件
function StatusBadge({ status }: { status: "connected" | "disconnected" | "memory" }) {
  const variants = {
    connected: { variant: "default" as const, icon: CheckCircle2, text: "已连接", className: "bg-green-500" },
    disconnected: { variant: "destructive" as const, icon: WifiOff, text: "未连接", className: "" },
    memory: { variant: "secondary" as const, icon: Database, text: "内存模式", className: "bg-yellow-500" },
  };

  const config = variants[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className="w-3 h-3 mr-1" />
      {config.text}
    </Badge>
  );
}

// 指标卡片组件
function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  description,
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "stable";
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {trend && (
          <div className="flex items-center mt-2">
            <TrendingUp
              className={`h-3 w-3 mr-1 ${
                trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-gray-500"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {trend === "up" ? "上升" : trend === "down" ? "下降" : "稳定"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 主题列表组件
function TopicList({ topics }: { topics: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" />
          主题列表
        </CardTitle>
        <CardDescription>已配置的 Kafka 主题</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {(topics || []).map((topic) => (
              <div
                key={topic}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{topic}</p>
                    <p className="text-xs text-muted-foreground">分区: 3 | 副本: 1</p>
                  </div>
                </div>
                <Badge variant="outline">活跃</Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// 流处理器状态组件
function StreamProcessorStatus({
  status,
  anomalyCount,
}: {
  status: {
    isRunning: boolean;
    windowCount: number;
    bufferCount: number;
  } | null;
  anomalyCount: number;
}) {
  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            流处理器
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          流处理器状态
        </CardTitle>
        <CardDescription>实时数据处理和异常检测</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">运行状态</span>
          <Badge variant={status.isRunning ? "default" : "secondary"}>
            {status.isRunning ? "运行中" : "已停止"}
          </Badge>
        </div>
        <Separator />
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{status.windowCount}</p>
            <p className="text-xs text-muted-foreground">活跃窗口</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">{anomalyCount}</p>
            <p className="text-xs text-muted-foreground">检测异常</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-500">{status.bufferCount}</p>
            <p className="text-xs text-muted-foreground">缓冲数据</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// 异常告警列表组件
function AnomalyList({
  anomalies,
}: {
  anomalies: Array<{
    id: string;
    timestamp: number;
    nodeId: string;
    sensorId: string;
    metricName: string;
    value: number;
    zScore: number;
    severity: string;
  }>;
}) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      default:
        return "bg-blue-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          异常告警
        </CardTitle>
        <CardDescription>最近检测到的异常数据</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          {anomalies.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mb-2" />
              <p>暂无异常告警</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(anomalies || []).map((anomaly) => (
                <div
                  key={anomaly.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                >
                  <div className={`w-2 h-2 rounded-full mt-2 ${getSeverityColor(anomaly.severity)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm truncate">
                        {anomaly.nodeId} / {anomaly.sensorId}
                      </p>
                      <Badge variant="outline" className="ml-2">
                        {anomaly.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {anomaly.metricName}: {anomaly.value.toFixed(2)} (Z-Score: {anomaly.zScore.toFixed(2)})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(anomaly.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Redis 状态组件
function RedisStatus() {
  const { data: status, isLoading } = trpc.redis.getStatus.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Redis 缓存
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">加载中...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Redis 缓存
        </CardTitle>
        <CardDescription>缓存服务状态</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm">连接状态</span>
          <StatusBadge status={status?.isConnected ? "connected" : status?.isConfigured ? "disconnected" : "memory"} />
        </div>
        <Separator />
        {status?.health && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">延迟</p>
              <p className="font-medium">{status.health.latencyMs}ms</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">内存使用</p>
              <p className="font-medium">{status.health.memoryUsage || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">连接客户端</p>
              <p className="font-medium">{status.health.connectedClients || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">地址</p>
              <p className="font-medium text-xs">{status.host}:{status.port}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 主页面组件
export default function KafkaMonitor() {
  const [refreshKey, setRefreshKey] = useState(0);

  // WebSocket 实时数据
  const { metrics: wsMetrics, history, isConnected: wsConnected, error: wsError, reconnect } = useKafkaMetricsWs();

  // 获取 Kafka 集群状态
  const { data: clusterStatus, isLoading: isLoadingCluster, refetch: refetchCluster } = 
    trpc.kafka.getClusterStatus.useQuery();

  // 获取主题列表
  const { data: topicsData, isLoading: isLoadingTopics } = 
    trpc.kafka.listTopics.useQuery();

  // 获取流处理器状态
  const { data: streamStatus, isLoading: isLoadingStream } = 
    trpc.kafka.getStreamProcessorStatus.useQuery();

  // 获取异常列表
  const { data: anomalies, isLoading: isLoadingAnomalies } = 
    trpc.kafka.queryAnomalies.useQuery({ limit: 20 });

  // 自动刷新（降低频率，因为有 WebSocket 实时数据）
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
      refetchCluster();
    }, 60000); // 每 60 秒刷新一次 API 数据

    return () => clearInterval(interval);
  }, [refetchCluster]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    refetchCluster();
    if (!wsConnected) {
      reconnect();
    }
  };

  const isKafkaConnected = clusterStatus?.mode === "kafka" && clusterStatus?.health?.connected;
  const topics = topicsData?.topics || [];

  // 使用 WebSocket 数据或默认值
  const currentThroughput = wsMetrics?.throughput.messagesPerSecond || 0;
  const currentLatency = wsMetrics?.latency.avgLatencyMs || 0;
  const produceLatency = wsMetrics?.latency.produceLatencyMs || 0;
  const consumeLatency = wsMetrics?.latency.consumeLatencyMs || 0;

  return (
    <MainLayout title="数据流监控">
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">数据流监控</h1>
            <p className="text-muted-foreground">Kafka 消息队列和 Redis 缓存实时状态</p>
          </div>
          <div className="flex items-center gap-2">
            {/* WebSocket 连接状态 */}
            <Badge
              variant={wsConnected ? "default" : "secondary"}
              className={wsConnected ? "bg-green-500" : ""}
            >
              <Radio className={`h-3 w-3 mr-1 ${wsConnected ? "animate-pulse" : ""}`} />
              {wsConnected ? "实时连接" : "离线"}
            </Badge>
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </Button>
          </div>
        </div>

        {/* WebSocket 错误提示 */}
        {wsError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="text-sm text-destructive">{wsError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={reconnect}>
              重新连接
            </Button>
          </div>
        )}

        {/* 状态概览卡片 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Kafka 状态"
            value={isKafkaConnected ? "已连接" : clusterStatus?.mode === "memory" ? "内存模式" : "未连接"}
            icon={isKafkaConnected ? Wifi : WifiOff}
            description={clusterStatus?.brokers?.join(", ") || "localhost:9092"}
          />
          <MetricCard
            title="实时吞吐量"
            value={currentThroughput}
            unit="msg/s"
            icon={TrendingUp}
            description="当前消息处理速率"
          />
          <MetricCard
            title="平均延迟"
            value={currentLatency}
            unit="ms"
            icon={Clock}
            description="端到端处理延迟"
          />
          <MetricCard
            title="异常告警"
            value={anomalies?.length || 0}
            icon={AlertTriangle}
            description="检测到的异常数据"
            trend={anomalies && anomalies.length > 0 ? "up" : "stable"}
          />
        </div>

        {/* 详细信息标签页 */}
        <Tabs defaultValue="realtime" className="space-y-4">
          <TabsList>
            <TabsTrigger value="realtime">实时监控</TabsTrigger>
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="topics">主题</TabsTrigger>
            <TabsTrigger value="anomalies">异常</TabsTrigger>
            <TabsTrigger value="cache">缓存</TabsTrigger>
          </TabsList>

          {/* 实时监控标签页 */}
          <TabsContent value="realtime" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* 吞吐量图表 */}
              <ThroughputChart
                timestamps={history.timestamps}
                throughput={history.throughput}
                currentValue={currentThroughput}
                isConnected={wsConnected}
              />

              {/* 延迟图表 */}
              <LatencyChart
                timestamps={history.timestamps}
                latency={history.latency}
                currentValue={currentLatency}
                produceLatency={produceLatency}
                consumeLatency={consumeLatency}
              />
            </div>

            {/* 实时指标详情 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* Broker 信息 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Broker 节点
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(wsMetrics?.brokers || []).map((broker) => (
                      <div
                        key={broker.id}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div>
                          <p className="font-medium text-sm">Broker {broker.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {broker.host}:{broker.port}
                          </p>
                        </div>
                        {broker.isController && (
                          <Badge variant="outline" className="text-xs">
                            Controller
                          </Badge>
                        )}
                      </div>
                    ))}
                    {(!wsMetrics?.brokers || wsMetrics.brokers.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        等待数据...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 主题统计 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    主题统计
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {(wsMetrics?.topics || []).slice(0, 4).map((topic) => (
                      <div
                        key={topic.name}
                        className="flex items-center justify-between p-2 rounded bg-muted/50"
                      >
                        <div>
                          <p className="font-medium text-sm truncate max-w-[150px]">
                            {topic.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {topic.partitions} 分区
                          </p>
                        </div>
                        <span className="text-sm font-mono">
                          {topic.messageCount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                    {(!wsMetrics?.topics || wsMetrics.topics.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        等待数据...
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Redis 实时状态 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Redis 状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wsMetrics?.redis ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">连接状态</span>
                        <Badge
                          variant={wsMetrics.redis.connected ? "default" : "secondary"}
                          className={wsMetrics.redis.connected ? "bg-green-500" : ""}
                        >
                          {wsMetrics.redis.connected ? "已连接" : "未连接"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">延迟</p>
                          <p className="font-medium">{wsMetrics.redis.latencyMs}ms</p>
                        </div>
                        <div className="p-2 rounded bg-muted/50">
                          <p className="text-xs text-muted-foreground">内存</p>
                          <p className="font-medium">{wsMetrics.redis.memoryUsage}</p>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-xs text-muted-foreground">连接客户端</p>
                        <p className="font-medium">{wsMetrics.redis.connectedClients}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Redis 未连接
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Kafka 集群状态 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Kafka 集群
                  </CardTitle>
                  <CardDescription>消息队列服务状态</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">连接状态</span>
                    <StatusBadge
                      status={
                        isKafkaConnected
                          ? "connected"
                          : clusterStatus?.mode === "memory"
                          ? "memory"
                          : "disconnected"
                      }
                    />
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">运行模式</p>
                      <p className="font-medium">{clusterStatus?.mode || "unknown"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Broker 地址</p>
                      <p className="font-medium text-xs">{clusterStatus?.brokers?.[0] || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">主题数</p>
                      <p className="font-medium">{clusterStatus?.health?.topics || topics.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">配置状态</p>
                      <p className="font-medium">{clusterStatus?.isConfigured ? "已配置" : "未配置"}</p>
                    </div>
                  </div>
                  {clusterStatus?.statusMessage && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground">
                      💬 {clusterStatus.statusMessage}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 流处理器状态 */}
              <StreamProcessorStatus status={streamStatus || null} anomalyCount={anomalies?.length || 0} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Redis 状态 */}
              <RedisStatus />

              {/* 系统健康度 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    系统健康度
                  </CardTitle>
                  <CardDescription>整体运行状态评估</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Kafka 服务</span>
                      <span>{isKafkaConnected ? "100%" : clusterStatus?.mode === "memory" ? "降级" : "0%"}</span>
                    </div>
                    <Progress value={isKafkaConnected ? 100 : clusterStatus?.mode === "memory" ? 50 : 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>流处理器</span>
                      <span>{streamStatus?.isRunning ? "100%" : "0%"}</span>
                    </div>
                    <Progress value={streamStatus?.isRunning ? 100 : 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>WebSocket 连接</span>
                      <span>{wsConnected ? "100%" : "0%"}</span>
                    </div>
                    <Progress value={wsConnected ? 100 : 0} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="topics">
            <TopicList topics={topics} />
          </TabsContent>

          <TabsContent value="anomalies">
            <AnomalyList anomalies={anomalies || []} />
          </TabsContent>

          <TabsContent value="cache">
            <div className="grid gap-4 md:grid-cols-2">
              <RedisStatus />
              <Card>
                <CardHeader>
                  <CardTitle>缓存使用说明</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">会话缓存</h4>
                    <p className="text-sm text-muted-foreground">
                      用户会话数据存储在 Redis 中，支持分布式部署时的会话共享。
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium">API 限流</h4>
                    <p className="text-sm text-muted-foreground">
                      基于滑动窗口算法的 API 限流，防止接口被滥用。
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-medium">实时数据缓存</h4>
                    <p className="text-sm text-muted-foreground">
                      传感器数据和设备状态的实时缓存，减少数据库查询压力。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
