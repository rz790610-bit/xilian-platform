/**
 * 运维仪表盘页面
 * 包含集群概览、存储监控、数据流监控、API 网关、安全态势、自动化运维、边缘计算
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Box,
  Cloud,
  Cpu,
  Database,
  Globe,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Play,
  RefreshCw,
  Router,
  Server,
  Settings,
  Shield,
  Zap,
} from 'lucide-react';

export default function OpsDashboard() {
  const [activeTab, setActiveTab] = useState('cluster');
  const [refreshing, setRefreshing] = useState(false);

  // 获取仪表盘数据
  const { data: clusterData, refetch: refetchCluster } = trpc.ops.getClusterOverview.useQuery();
  const { data: storageData, refetch: refetchStorage } = trpc.ops.getStorageOverview.useQuery();
  const { data: dataflowData, refetch: refetchDataflow } = trpc.ops.getDataFlowOverview.useQuery();
  const { data: gatewayData, refetch: refetchGateway } = trpc.ops.getApiGatewayOverview.useQuery();
  const { data: securityData, refetch: refetchSecurity } = trpc.ops.getSecurityPosture.useQuery();

  // 获取自动化运维数据
  const { data: scalingPolicies } = trpc.ops.listScalingPolicies.useQuery();
  const { data: healingRules } = trpc.ops.listHealingRules.useQuery();
  const { data: backupPolicies } = trpc.ops.listBackupPolicies.useQuery();
  const { data: rollbackPolicies } = trpc.ops.listRollbackPolicies.useQuery();

  // 获取边缘计算数据
  const { data: edgeNodes } = trpc.ops.listEdgeNodes.useQuery();
  const { data: edgeModels } = trpc.ops.listEdgeModels.useQuery();
  const { data: edgeGateways } = trpc.ops.listEdgeGateways.useQuery();

  // Mutations
  const triggerScalingMutation = trpc.ops.triggerScaling.useMutation({
    onSuccess: () => {
      alert('扩缩容操作已触发');
    },
    onError: (error) => {
      alert(`操作失败: ${error.message}`);
    }
  });

  const triggerHealingMutation = trpc.ops.triggerHealing.useMutation({
    onSuccess: () => {
      alert('自愈操作已触发');
    },
    onError: (error) => {
      alert(`操作失败: ${error.message}`);
    }
  });

  const triggerBackupMutation = trpc.ops.triggerBackup.useMutation({
    onSuccess: () => {
      alert('备份操作已触发');
    },
    onError: (error) => {
      alert(`操作失败: ${error.message}`);
    }
  });

  const triggerRollbackMutation = trpc.ops.triggerRollback.useMutation({
    onSuccess: () => {
      alert('回滚操作已触发');
    },
    onError: (error) => {
      alert(`操作失败: ${error.message}`);
    }
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refetchCluster(),
      refetchStorage(),
      refetchDataflow(),
      refetchGateway(),
      refetchSecurity(),
    ]);
    setRefreshing(false);
  };

  // 操作处理函数
  const handleTriggerScaling = (policyId: string, targetReplicas: number) => {
    if (confirm(`确定要执行扩缩容操作吗？目标副本数: ${targetReplicas}`)) {
      triggerScalingMutation.mutate({ policyId, targetReplicas });
    }
  };

  const handleTriggerHealing = (ruleId: string, target: string) => {
    if (confirm(`确定要触发自愈操作吗？目标: ${target}`)) {
      triggerHealingMutation.mutate({ ruleId, target });
    }
  };

  const handleTriggerBackup = (policyId: string) => {
    if (confirm('确定要立即执行备份吗？')) {
      triggerBackupMutation.mutate({ policyId });
    }
  };

  const handleTriggerRollback = (policyId: string, targetRevision: number) => {
    if (confirm(`确定要回滚到版本 ${targetRevision} 吗？`)) {
      triggerRollbackMutation.mutate({ policyId, targetRevision, reason: '手动回滚' });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
      case 'Ready':
      case 'RUNNING':
      case 'connected':
      case 'active':
        return 'bg-green-500';
      case 'degraded':
      case 'warning':
        return 'bg-yellow-500';
      case 'unhealthy':
      case 'offline':
      case 'NotReady':
      case 'FAILED':
      case 'disconnected':
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'up') return <ArrowUp className="h-3 w-3 text-green-500" />;
    if (trend === 'down') return <ArrowDown className="h-3 w-3 text-red-500" />;
    return null;
  };

  return (
    <MainLayout title="运维仪表盘">
      <div className="space-y-6">
        {/* 顶部操作栏 */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold">运维中心</h2>
            <Badge variant="outline" className="text-green-600">
              系统正常
            </Badge>
          </div>
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">集群节点</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {clusterData?.summary.healthyNodes || 0}/{clusterData?.summary.totalNodes || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {clusterData?.summary.runningPods || 0} Pods 运行中
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">存储系统</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">6/6</div>
              <p className="text-xs text-muted-foreground">
                数据库服务正常
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">数据流</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(dataflowData?.kafka.metrics.messagesPerSecond.value || 0)}
              </div>
              <p className="text-xs text-muted-foreground">消息/秒</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API 网关</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(gatewayData?.kong.metrics.requestsPerSecond.value || 0)}
              </div>
              <p className="text-xs text-muted-foreground">请求/秒</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">安全评分</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {securityData?.overview.score || 0}
                <span className="text-sm ml-1 text-muted-foreground">
                  ({securityData?.overview.grade || '-'})
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {securityData?.vulnerabilities.summary.total || 0} 漏洞待处理
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 主要内容 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="cluster">集群</TabsTrigger>
            <TabsTrigger value="storage">存储</TabsTrigger>
            <TabsTrigger value="dataflow">数据流</TabsTrigger>
            <TabsTrigger value="gateway">网关</TabsTrigger>
            <TabsTrigger value="security">安全</TabsTrigger>
            <TabsTrigger value="automation">自动化</TabsTrigger>
            <TabsTrigger value="edge">边缘</TabsTrigger>
          </TabsList>

          {/* 集群概览 Tab */}
          <TabsContent value="cluster" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 资源使用 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    资源使用
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Cpu className="h-4 w-4" /> CPU
                      </span>
                      <span>{clusterData?.resources.cpu.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.cpu.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <MemoryStick className="h-4 w-4" /> 内存
                      </span>
                      <span>{clusterData?.resources.memory.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.memory.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <HardDrive className="h-4 w-4" /> 存储
                      </span>
                      <span>{clusterData?.resources.storage.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.storage.percent || 0} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Zap className="h-4 w-4" /> GPU
                      </span>
                      <span>{clusterData?.resources.gpu.percent.toFixed(1)}%</span>
                    </div>
                    <Progress value={clusterData?.resources.gpu.percent || 0} />
                  </div>
                </CardContent>
              </Card>

              {/* 节点列表 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    节点状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>节点</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clusterData?.nodes.slice(0, 5).map((node) => (
                        <TableRow key={node.name}>
                          <TableCell className="font-medium">{node.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{node.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(node.status)}`} />
                              {node.status}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {node.cpu.value.toFixed(0)}%
                              {getTrendIcon(node.cpu.trend)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {node.memory.value.toFixed(0)}%
                              {getTrendIcon(node.memory.trend)}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* 告警和事件 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    告警摘要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-red-500">
                        {clusterData?.alerts.critical || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">严重</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-500">
                        {clusterData?.alerts.warning || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">警告</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-500">
                        {clusterData?.alerts.info || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">信息</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">
                        {clusterData?.alerts.total || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">总计</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    最近事件
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {clusterData?.events.slice(0, 3).map((event, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Badge variant={event.type === 'Warning' ? 'destructive' : 'secondary'}>
                          {event.type}
                        </Badge>
                        <div className="flex-1">
                          <div className="font-medium">{event.reason}</div>
                          <div className="text-muted-foreground text-xs">{event.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 存储监控 Tab */}
          <TabsContent value="storage" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* ClickHouse */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-yellow-500" />
                    ClickHouse
                  </CardTitle>
                  <CardDescription>时序数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.clickhouse.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">QPS</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.clickhouse.metrics.queriesPerSecond.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">写入速率</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.clickhouse.metrics.insertRowsPerSecond.value || 0)} rows/s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">复制延迟</span>
                    <span className="font-medium">
                      {storageData?.databases.clickhouse.metrics.replicationLag.value.toFixed(2)}s
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* PostgreSQL */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    PostgreSQL
                  </CardTitle>
                  <CardDescription>关系型数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.postgresql.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">TPS</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.postgresql.metrics.transactionsPerSecond.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">缓存命中率</span>
                    <span className="font-medium">
                      {storageData?.databases.postgresql.metrics.cacheHitRatio.value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">连接数</span>
                    <span className="font-medium">
                      {storageData?.databases.postgresql.connections.active}/{storageData?.databases.postgresql.connections.max}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Neo4j */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-green-500" />
                    Neo4j
                  </CardTitle>
                  <CardDescription>图数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.neo4j.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">节点数</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.neo4j.metrics.nodeCount.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">关系数</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.neo4j.metrics.relationshipCount.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">QPS</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.neo4j.metrics.queriesPerSecond.value || 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Qdrant */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Box className="h-5 w-5 text-purple-500" />
                    Qdrant
                  </CardTitle>
                  <CardDescription>向量数据存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.qdrant.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">搜索延迟</span>
                    <span className="font-medium">
                      {storageData?.databases.qdrant.metrics.searchLatency.value.toFixed(1)}ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">内存使用</span>
                    <span className="font-medium">
                      {storageData?.databases.qdrant.metrics.memoryUsage.value.toFixed(1)} GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Collections</span>
                    <span className="font-medium">
                      {storageData?.databases.qdrant.collections.length || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Redis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-red-500" />
                    Redis
                  </CardTitle>
                  <CardDescription>缓存集群</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.redis.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">OPS</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.redis.metrics.opsPerSecond.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">命中率</span>
                    <span className="font-medium">
                      {storageData?.databases.redis.metrics.hitRate.value.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">内存使用</span>
                    <span className="font-medium">
                      {storageData?.databases.redis.metrics.memoryUsed.value.toFixed(1)} GB
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* MinIO */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-orange-500" />
                    MinIO
                  </CardTitle>
                  <CardDescription>对象存储</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">状态</span>
                    <Badge variant="outline" className="text-green-600">
                      {storageData?.databases.minio.status.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">对象数</span>
                    <span className="font-medium">
                      {formatNumber(storageData?.databases.minio.metrics.totalObjects.value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">总大小</span>
                    <span className="font-medium">
                      {storageData?.databases.minio.metrics.totalSize.value.toFixed(0)} GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">带宽</span>
                    <span className="font-medium">
                      {storageData?.databases.minio.metrics.bandwidth.value.toFixed(0)} MB/s
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 数据流监控 Tab */}
          <TabsContent value="dataflow" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kafka */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Kafka 集群
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">
                        {formatNumber(dataflowData?.kafka.metrics.messagesPerSecond.value || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">消息/秒</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">
                        {dataflowData?.kafka.metrics.totalLag.value || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">消费延迟</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Topic</TableHead>
                        <TableHead>分区</TableHead>
                        <TableHead>消息/秒</TableHead>
                        <TableHead>Lag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataflowData?.kafka.topics.slice(0, 4).map((topic) => (
                        <TableRow key={topic.name}>
                          <TableCell className="font-medium">{topic.name}</TableCell>
                          <TableCell>{topic.partitions}</TableCell>
                          <TableCell>{formatNumber(topic.messagesPerSecond)}</TableCell>
                          <TableCell>{topic.consumerLag}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Flink */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Flink 作业
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-green-500">
                        {dataflowData?.flink.metrics.runningJobs.value || 0}
                      </div>
                      <div className="text-xs text-muted-foreground">运行中</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold">
                        {dataflowData?.flink.metrics.uptime.value.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">可用性</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>作业名称</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>并行度</TableHead>
                        <TableHead>检查点</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataflowData?.flink.jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">{job.name}</TableCell>
                          <TableCell>
                            <Badge variant={job.status === 'RUNNING' ? 'default' : 'destructive'}>
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{job.parallelism}</TableCell>
                          <TableCell>{job.checkpoints.completed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Airflow 和 Connectors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Airflow DAGs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>DAG ID</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>成功率</TableHead>
                        <TableHead>调度</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataflowData?.airflow.dags.map((dag) => (
                        <TableRow key={dag.dagId}>
                          <TableCell className="font-medium">{dag.dagId}</TableCell>
                          <TableCell>
                            <Badge variant={dag.lastRun.state === 'success' ? 'default' : dag.lastRun.state === 'running' ? 'secondary' : 'destructive'}>
                              {dag.lastRun.state}
                            </Badge>
                          </TableCell>
                          <TableCell>{dag.successRate.toFixed(1)}%</TableCell>
                          <TableCell className="text-xs">{dag.schedule}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Router className="h-5 w-5" />
                    Kafka Connectors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>任务</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dataflowData?.connectors.list.map((conn) => (
                        <TableRow key={conn.name}>
                          <TableCell className="font-medium">{conn.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{conn.type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={conn.status === 'RUNNING' ? 'default' : 'destructive'}>
                              {conn.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{conn.tasks.running}/{conn.tasks.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* API 网关 Tab */}
          <TabsContent value="gateway" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Kong 指标 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Kong 网关
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">
                        {formatNumber(gatewayData?.kong.metrics.requestsPerSecond.value || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">请求/秒</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">
                        {gatewayData?.kong.metrics.latencyP99.value || 0}ms
                      </div>
                      <div className="text-xs text-muted-foreground">P99 延迟</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">
                        {gatewayData?.kong.metrics.errorRate.value.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">错误率</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>路由</TableHead>
                        <TableHead>QPS</TableHead>
                        <TableHead>P50</TableHead>
                        <TableHead>错误率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gatewayData?.kong.routes.map((route) => (
                        <TableRow key={route.name}>
                          <TableCell className="font-medium">{route.name}</TableCell>
                          <TableCell>{formatNumber(route.requestsPerSecond)}</TableCell>
                          <TableCell>{route.latencyP50}ms</TableCell>
                          <TableCell>{route.errorRate.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Istio 指标 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    Istio 服务网格
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold">
                        {formatNumber(gatewayData?.istio.metrics.meshRequestsPerSecond.value || 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">网格 QPS</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold text-green-500">
                        {gatewayData?.istio.metrics.meshSuccessRate.value.toFixed(2)}%
                      </div>
                      <div className="text-xs text-muted-foreground">成功率</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-xl font-bold text-green-500">
                        {gatewayData?.istio.metrics.mtlsEnabled.value}%
                      </div>
                      <div className="text-xs text-muted-foreground">mTLS</div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>服务</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>QPS</TableHead>
                        <TableHead>成功率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gatewayData?.istio.services.map((svc) => (
                        <TableRow key={svc.name}>
                          <TableCell className="font-medium">{svc.name}</TableCell>
                          <TableCell>{svc.namespace}</TableCell>
                          <TableCell>{formatNumber(svc.requestsPerSecond)}</TableCell>
                          <TableCell>{svc.successRate.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 安全态势 Tab */}
          <TabsContent value="security" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 安全评分 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    安全评分
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="text-6xl font-bold mb-2">
                    {securityData?.overview.score || 0}
                  </div>
                  <Badge variant={securityData?.overview.grade === 'A' ? 'default' : securityData?.overview.grade === 'B' ? 'secondary' : 'destructive'}>
                    等级 {securityData?.overview.grade}
                  </Badge>
                  <div className="mt-4 text-sm text-muted-foreground">
                    趋势: {securityData?.overview.trend === 'improving' ? '↑ 改善中' : securityData?.overview.trend === 'stable' ? '→ 稳定' : '↓ 下降'}
                  </div>
                </CardContent>
              </Card>

              {/* 漏洞摘要 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    漏洞摘要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-2 bg-red-500/10 rounded">
                      <div className="text-2xl font-bold text-red-500">
                        {securityData?.vulnerabilities.summary.critical || 0}
                      </div>
                      <div className="text-xs">严重</div>
                    </div>
                    <div className="text-center p-2 bg-orange-500/10 rounded">
                      <div className="text-2xl font-bold text-orange-500">
                        {securityData?.vulnerabilities.summary.high || 0}
                      </div>
                      <div className="text-xs">高危</div>
                    </div>
                    <div className="text-center p-2 bg-yellow-500/10 rounded">
                      <div className="text-2xl font-bold text-yellow-500">
                        {securityData?.vulnerabilities.summary.medium || 0}
                      </div>
                      <div className="text-xs">中危</div>
                    </div>
                    <div className="text-center p-2 bg-blue-500/10 rounded">
                      <div className="text-2xl font-bold text-blue-500">
                        {securityData?.vulnerabilities.summary.low || 0}
                      </div>
                      <div className="text-xs">低危</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 合规状态 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    合规框架
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {securityData?.compliance.frameworks.slice(0, 3).map((fw) => (
                    <div key={fw.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{fw.name}</span>
                        <span className="font-medium">{fw.score}%</span>
                      </div>
                      <Progress value={fw.score} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* 运行时安全和密钥管理 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Falco 运行时安全</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-xl font-bold text-red-500">
                        {securityData?.runtime.falco.events.byPriority.CRITICAL || 0}
                      </div>
                      <div className="text-xs">严重</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-yellow-500">
                        {securityData?.runtime.falco.events.byPriority.WARNING || 0}
                      </div>
                      <div className="text-xs">警告</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-blue-500">
                        {securityData?.runtime.falco.events.byPriority.NOTICE || 0}
                      </div>
                      <div className="text-xs">通知</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold">
                        {securityData?.runtime.falco.events.total || 0}
                      </div>
                      <div className="text-xs">总计</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Vault 密钥管理</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xl font-bold">
                        {securityData?.secrets.vault.secrets.total || 0}
                      </div>
                      <div className="text-xs">密钥总数</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-yellow-500">
                        {securityData?.secrets.vault.certificates.expiringSoon || 0}
                      </div>
                      <div className="text-xs">即将过期</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-500">
                        {securityData?.secrets.vault.leases.active || 0}
                      </div>
                      <div className="text-xs">活跃租约</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 自动化运维 Tab */}
          <TabsContent value="automation" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 自动扩缩容 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    自动扩缩容策略
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>目标</TableHead>
                        <TableHead>副本范围</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scalingPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.target.name}</TableCell>
                          <TableCell>{policy.minReplicas}-{policy.maxReplicas}</TableCell>
                          <TableCell>
                            <Switch checked={policy.enabled} disabled />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!scalingPolicies || scalingPolicies.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            暂无扩缩容策略
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 故障自愈 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    故障自愈规则
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>条件</TableHead>
                        <TableHead>动作</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {healingRules?.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>{rule.condition.type}</TableCell>
                          <TableCell>{rule.action.type}</TableCell>
                          <TableCell>
                            <Switch checked={rule.enabled} disabled />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!healingRules || healingRules.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            暂无自愈规则
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 备份策略 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    备份策略
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>源</TableHead>
                        <TableHead>调度</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {backupPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.source.name}</TableCell>
                          <TableCell className="text-xs">{policy.schedule}</TableCell>
                          <TableCell>
                            <Switch checked={policy.enabled} disabled />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!backupPolicies || backupPolicies.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            暂无备份策略
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 版本回滚 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 rotate-180" />
                    版本回滚策略
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>目标</TableHead>
                        <TableHead>自动回滚</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rollbackPolicies?.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell>{policy.target.name}</TableCell>
                          <TableCell>
                            <Badge variant={policy.strategy.autoRollback ? 'default' : 'outline'}>
                              {policy.strategy.autoRollback ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Switch checked={policy.enabled} disabled />
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!rollbackPolicies || rollbackPolicies.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            暂无回滚策略
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 边缘计算 Tab */}
          <TabsContent value="edge" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 边缘节点 */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    边缘节点
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>区域</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                        <TableHead>GPU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {edgeNodes?.map((node) => (
                        <TableRow key={node.id}>
                          <TableCell className="font-medium">{node.name}</TableCell>
                          <TableCell>{node.location.zone}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(node.status)}`} />
                              {node.status}
                            </div>
                          </TableCell>
                          <TableCell>{node.metrics.cpu.toFixed(0)}%</TableCell>
                          <TableCell>{node.metrics.memory.toFixed(0)}%</TableCell>
                          <TableCell>{node.metrics.gpu?.toFixed(0) || '-'}%</TableCell>
                        </TableRow>
                      ))}
                      {(!edgeNodes || edgeNodes.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            暂无边缘节点
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 边缘模型 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    部署模型
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {edgeModels?.map((model) => (
                    <div key={model.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{model.name}</span>
                        <Badge variant={model.status === 'ready' ? 'default' : 'secondary'}>
                          {model.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>版本: {model.version}</div>
                        <div>类型: {model.type}</div>
                        <div>延迟: {model.performance.latency}ms</div>
                      </div>
                    </div>
                  ))}
                  {(!edgeModels || edgeModels.length === 0) && (
                    <div className="text-center text-muted-foreground py-4">
                      暂无部署模型
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 边缘网关 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Router className="h-5 w-5" />
                  边缘网关
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>端点</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>设备数</TableHead>
                      <TableHead>消息收/发</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {edgeGateways?.map((gw) => (
                      <TableRow key={gw.id}>
                        <TableCell className="font-medium">{gw.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{gw.type.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{gw.endpoint}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(gw.status)}`} />
                            {gw.status}
                          </div>
                        </TableCell>
                        <TableCell>{gw.connectedDevices}</TableCell>
                        <TableCell>
                          {formatNumber(gw.metrics.messagesReceived)}/{formatNumber(gw.metrics.messagesSent)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!edgeGateways || edgeGateways.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          暂无边缘网关
                        </TableCell>
                      </TableRow>
                    )}
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
