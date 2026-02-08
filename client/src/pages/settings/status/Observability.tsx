/**
 * 可观测性管理页面
 * 包含 Prometheus/Grafana、ELK、Jaeger/OTel、Alertmanager 功能
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
import { trpc } from '@/lib/trpc';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Clock,
  Cpu,
  Database,
  FileText,
  GitBranch,
  HardDrive,
  MemoryStick,
  Network,
  RefreshCw,
  Search,
  Server,
  Settings,
  Zap,
} from 'lucide-react';

// 安全获取数字值
const safeNumber = (val: any, defaultVal: number = 0): number => {
  if (val === null || val === undefined || isNaN(val)) return defaultVal;
  return Number(val);
};

// 安全获取字符串值
const safeString = (val: any, defaultVal: string = ''): string => {
  if (val === null || val === undefined) return defaultVal;
  return String(val);
};

// 安全转换为数组
const safeArray = <T,>(val: any): T[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
};

export default function Observability() {
  const [activeTab, setActiveTab] = useState('overview');
  const [logLevel, setLogLevel] = useState<string>('');
  const [logService, setLogService] = useState<string>('');
  const [alertSeverity, setAlertSeverity] = useState<string>('');

  // 获取可观测性概览
  const { data: summary, refetch: refetchSummary } = trpc.observability.getSummary.useQuery();

  // 获取节点指标
  const { data: nodeMetrics } = trpc.observability.getNodeMetrics.useQuery();

  // 获取容器指标
  const { data: containerMetrics } = trpc.observability.getContainerMetrics.useQuery();

  // 获取 GPU 指标
  const { data: gpuMetrics } = trpc.observability.getGpuMetrics.useQuery();

  // 获取应用指标
  const { data: appMetrics } = trpc.observability.getApplicationMetrics.useQuery();

  // 获取日志
  const { data: logs } = trpc.observability.searchLogs.useQuery({
    level: logLevel as any || undefined,
    service: logService || undefined,
    limit: 50,
  });

  // 获取日志统计
  const { data: logStats } = trpc.observability.getLogStats.useQuery();

  // 获取追踪
  const { data: traces } = trpc.observability.searchTraces.useQuery({ limit: 20 });

  // 获取服务依赖
  const { data: serviceDeps } = trpc.observability.getServiceDependencies.useQuery();

  // 获取告警
  const { data: alerts } = trpc.observability.getAlerts.useQuery({
    severity: alertSeverity as any || undefined,
  });

  // 获取告警规则
  const { data: alertRules } = trpc.observability.getAlertRules.useQuery();

  // 获取告警接收器
  const { data: receivers } = trpc.observability.getReceivers.useQuery();

  const formatBytes = (bytes: any) => {
    const b = safeNumber(bytes);
    if (b >= 1024 * 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };

  const getStatusColor = (status: any) => {
    const s = safeString(status);
    switch (s) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity: any) => {
    const s = safeString(severity);
    switch (s) {
      case 'P0': return 'destructive';
      case 'P1': return 'destructive';
      case 'P2': return 'secondary';
      case 'P3': return 'outline';
      default: return 'outline';
    }
  };

  const getLogLevelColor = (level: any) => {
    const l = safeString(level);
    switch (l) {
      case 'ERROR':
      case 'FATAL': return 'text-red-500';
      case 'WARN': return 'text-yellow-500';
      case 'INFO': return 'text-blue-500';
      case 'DEBUG': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  // 安全获取 summary 数据
  const summaryData = summary || {};
  const prometheusStatus = (summaryData as any)?.metrics?.prometheusStatus || (summaryData as any)?.prometheus?.status || 'down';
  const targetsUp = safeNumber((summaryData as any)?.metrics?.targetsUp || (summaryData as any)?.prometheus?.metrics?.cpu, 0);
  const elkStatus = (summaryData as any)?.logs?.elkStatus || (summaryData as any)?.elasticsearch?.status || 'down';
  const logsPerMinute = safeNumber((summaryData as any)?.logs?.indexCount || (summaryData as any)?.elasticsearch?.logsPerMinute, 0);
  const jaegerStatus = (summaryData as any)?.traces?.jaegerStatus || (summaryData as any)?.jaeger?.status || 'down';
  const samplingRate = safeNumber((summaryData as any)?.traces?.samplingRate, 100);
  const jaegerServices = safeNumber((summaryData as any)?.traces?.tracesPerSecond || (summaryData as any)?.jaeger?.services, 0);
  const alertmanagerStatus = (summaryData as any)?.alerts?.alertmanagerStatus || 'down';
  const firingAlerts = safeNumber((summaryData as any)?.alerts?.firingAlerts || (summaryData as any)?.alerts?.critical, 0);
  const rulesEnabled = safeNumber((summaryData as any)?.alerts?.rulesEnabled || (summaryData as any)?.alerts?.total, 0);

  // 安全转换数据为数组
  const nodeMetricsArray = safeArray<any>(nodeMetrics);
  const containerMetricsArray = safeArray<any>(containerMetrics);
  const gpuMetricsArray = safeArray<any>(gpuMetrics);
  const appMetricsArray = safeArray<any>(appMetrics);
  const logsArray = safeArray<any>(logs);
  const tracesArray = safeArray<any>(traces);
  const serviceDepsArray = safeArray<any>(serviceDeps);
  const alertsArray = safeArray<any>(alerts);
  const alertRulesArray = safeArray<any>(alertRules);
  const receiversArray = safeArray<any>(receivers);

  // 安全获取 logStats
  const logStatsData = logStats || {};
  const logLevels = (logStatsData as any)?.byLevel || (logStatsData as any)?.levels || {};
  const recentErrors = safeNumber((logStatsData as any)?.recentErrors || (logStatsData as any)?.levels?.ERROR, 0);

  return (
    <MainLayout title="可观测性">
      <div className="space-y-6">
        {/* 概览卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prometheus</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(prometheusStatus)}`} />
                <span className="text-2xl font-bold">{targetsUp.toFixed(0)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">目标在线</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ELK 日志</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(elkStatus)}`} />
                <span className="text-2xl font-bold">{Math.round(logsPerMinute)}</span>
              </div>
              <p className="text-xs text-muted-foreground">日志/分钟 · {logsPerMinute.toFixed(0)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jaeger 追踪</CardTitle>
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(jaegerStatus)}`} />
                <span className="text-2xl font-bold">{samplingRate.toFixed(0)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">采样率 · {jaegerServices.toFixed(0)} 服务</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertmanager</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(alertmanagerStatus)}`} />
                <span className="text-2xl font-bold text-red-500">{firingAlerts}</span>
              </div>
              <p className="text-xs text-muted-foreground">活跃告警 · {rulesEnabled} 规则启用</p>
            </CardContent>
          </Card>
        </div>

        {/* 主要内容 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="metrics">指标监控</TabsTrigger>
            <TabsTrigger value="logs">日志分析</TabsTrigger>
            <TabsTrigger value="traces">分布式追踪</TabsTrigger>
            <TabsTrigger value="alerts">告警管理</TabsTrigger>
          </TabsList>

          {/* 概览 Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 节点状态 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Server className="h-5 w-5" />
                    节点状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {nodeMetricsArray.filter(Boolean).map((node: any, index: number) => {
                      const hostname = safeString(node?.hostname, `node-${index}`);
                      const cpuUsage = safeNumber(node?.cpuUsage);
                      const memoryUsage = safeNumber(node?.memoryUsage);
                      const diskUsage = safeNumber(node?.diskUsage);
                      return (
                        <div key={hostname} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{hostname}</span>
                            <Badge variant={cpuUsage > 80 ? 'destructive' : 'secondary'}>
                              CPU {cpuUsage.toFixed(1)}%
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2">
                              <MemoryStick className="h-4 w-4 text-muted-foreground" />
                              <span>内存: {memoryUsage.toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-4 w-4 text-muted-foreground" />
                              <span>磁盘: {diskUsage.toFixed(1)}%</span>
                            </div>
                          </div>
                          <Progress value={cpuUsage} className="h-1" />
                        </div>
                      );
                    })}
                    {nodeMetricsArray.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">暂无节点数据</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* GPU 状态 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    GPU 状态
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {gpuMetricsArray.slice(0, 8).map((gpu: any, index: number) => {
                      const gpuId = safeNumber(gpu?.gpuId, index);
                      const temperature = safeNumber(gpu?.temperature);
                      const gpuUtilization = safeNumber(gpu?.gpuUtilization);
                      return (
                        <div key={gpuId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">GPU {gpuId}</span>
                            <span className="text-xs text-muted-foreground">{temperature.toFixed(0)}°C</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={gpuUtilization} className="w-20 h-2" />
                            <span className="text-sm w-12 text-right">{gpuUtilization.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {gpuMetricsArray.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">暂无 GPU 数据</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 日志统计 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    日志统计
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">按级别</p>
                      {Object.entries(logLevels).map(([level, count]) => (
                        <div key={level} className="flex justify-between">
                          <span className={getLogLevelColor(level)}>{level}</span>
                          <span>{safeNumber(count)}</span>
                        </div>
                      ))}
                      {Object.keys(logLevels).length === 0 && (
                        <p className="text-muted-foreground text-sm">暂无数据</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">最近 1 小时错误</p>
                      <p className="text-3xl font-bold text-red-500">{recentErrors}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 服务依赖 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="h-5 w-5" />
                    服务依赖
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {serviceDepsArray.map((dep: any, i: number) => {
                      const source = safeString(dep?.source, 'unknown');
                      const target = safeString(dep?.target, 'unknown');
                      const callCount = safeNumber(dep?.callCount);
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span>{source}</span>
                            <span className="text-muted-foreground">→</span>
                            <span>{target}</span>
                          </div>
                          <Badge variant="outline">{callCount} 调用</Badge>
                        </div>
                      );
                    })}
                    {serviceDepsArray.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">暂无服务依赖数据</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 指标监控 Tab */}
          <TabsContent value="metrics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 容器指标 */}
              <Card>
                <CardHeader>
                  <CardTitle>容器指标 (cAdvisor)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>容器</TableHead>
                        <TableHead>CPU</TableHead>
                        <TableHead>内存</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containerMetricsArray.map((c: any, index: number) => {
                        const containerId = safeString(c?.containerId, `container-${index}`);
                        const containerName = safeString(c?.containerName, 'unknown');
                        const cpuUsage = safeNumber(c?.cpuUsage);
                        const memoryUsage = safeNumber(c?.memoryUsage);
                        const status = safeString(c?.status, 'unknown');
                        return (
                          <TableRow key={containerId}>
                            <TableCell className="font-medium">{containerName}</TableCell>
                            <TableCell>{cpuUsage.toFixed(1)}%</TableCell>
                            <TableCell>{formatBytes(memoryUsage)}</TableCell>
                            <TableCell>
                              <Badge variant={status === 'running' ? 'default' : 'destructive'}>
                                {status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {containerMetricsArray.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">暂无容器数据</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* 应用指标 */}
              <Card>
                <CardHeader>
                  <CardTitle>应用指标 (Histogram)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>服务</TableHead>
                        <TableHead>P99 延迟</TableHead>
                        <TableHead>吞吐量</TableHead>
                        <TableHead>错误率</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appMetricsArray.slice(0, 6).map((m: any, i: number) => {
                        const serviceName = safeString(m?.serviceName, `service-${i}`);
                        const requestLatencyP99 = safeNumber(m?.requestLatencyP99);
                        const throughput = safeNumber(m?.throughput);
                        const errorRate = safeNumber(m?.errorRate);
                        return (
                          <TableRow key={`${serviceName}-${i}`}>
                            <TableCell className="font-medium">{serviceName}</TableCell>
                            <TableCell>{requestLatencyP99.toFixed(0)}ms</TableCell>
                            <TableCell>{throughput.toFixed(0)}/s</TableCell>
                            <TableCell>
                              <span className={errorRate > 1 ? 'text-red-500' : ''}>
                                {errorRate.toFixed(2)}%
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {appMetricsArray.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">暂无应用指标数据</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* GPU DCGM 指标 */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>GPU DCGM 指标</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>GPU ID</TableHead>
                        <TableHead>型号</TableHead>
                        <TableHead>温度</TableHead>
                        <TableHead>功耗</TableHead>
                        <TableHead>GPU 利用率</TableHead>
                        <TableHead>显存使用</TableHead>
                        <TableHead>ECC 错误</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gpuMetricsArray.map((g: any, index: number) => {
                        const gpuId = safeNumber(g?.gpuId, index);
                        const name = safeString(g?.name, 'Unknown GPU');
                        const temperature = safeNumber(g?.temperature);
                        const powerUsage = safeNumber(g?.powerUsage);
                        const powerLimit = safeNumber(g?.powerLimit, 400);
                        const gpuUtilization = safeNumber(g?.gpuUtilization);
                        const memoryUsed = safeNumber(g?.memoryUsed);
                        const memoryTotal = safeNumber(g?.memoryTotal, 80 * 1024 * 1024 * 1024);
                        const eccErrors = safeNumber(g?.eccErrors);
                        return (
                          <TableRow key={gpuId}>
                            <TableCell className="font-medium">GPU {gpuId}</TableCell>
                            <TableCell className="text-xs">{name}</TableCell>
                            <TableCell>
                              <span className={temperature > 80 ? 'text-red-500' : ''}>
                                {temperature.toFixed(0)}°C
                              </span>
                            </TableCell>
                            <TableCell>{powerUsage.toFixed(0)}W / {powerLimit}W</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={gpuUtilization} className="w-16 h-2" />
                                <span>{gpuUtilization.toFixed(0)}%</span>
                              </div>
                            </TableCell>
                            <TableCell>{formatBytes(memoryUsed)} / {formatBytes(memoryTotal)}</TableCell>
                            <TableCell>
                              <Badge variant={eccErrors > 0 ? 'destructive' : 'secondary'}>
                                {eccErrors}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {gpuMetricsArray.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">暂无 GPU 数据</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 日志分析 Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>日志搜索 (ELK)</span>
                  <div className="flex items-center gap-2">
                    <Select value={logLevel} onValueChange={setLogLevel}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="日志级别" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="DEBUG">DEBUG</SelectItem>
                        <SelectItem value="INFO">INFO</SelectItem>
                        <SelectItem value="WARN">WARN</SelectItem>
                        <SelectItem value="ERROR">ERROR</SelectItem>
                        <SelectItem value="FATAL">FATAL</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={logService} onValueChange={setLogService}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="服务" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部服务</SelectItem>
                        <SelectItem value="api-gateway">api-gateway</SelectItem>
                        <SelectItem value="knowledge-service">knowledge-service</SelectItem>
                        <SelectItem value="model-service">model-service</SelectItem>
                        <SelectItem value="pipeline-service">pipeline-service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardTitle>
                <CardDescription>
                  Filebeat 收集 → Logstash Grok 解析 → Elasticsearch 30天归档 → Kibana 分析
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-sm">
                  {logsArray.map((log: any, i: number) => {
                    const timestamp = (log as any)?.['@timestamp'] || (log as any)?.timestamp || Date.now();
                    const level = safeString(log?.level, 'INFO');
                    const service = safeString(log?.service, 'unknown');
                    const message = safeString(log?.message, '');
                    return (
                      <div key={i} className="flex gap-2 p-2 bg-muted/50 rounded">
                        <span className="text-muted-foreground w-44 shrink-0">
                          {new Date(timestamp).toLocaleString()}
                        </span>
                        <span className={`w-12 shrink-0 ${getLogLevelColor(level)}`}>
                          {level}
                        </span>
                        <span className="text-blue-500 w-32 shrink-0">{service}</span>
                        <span className="truncate">{message}</span>
                      </div>
                    );
                  })}
                  {logsArray.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">暂无日志数据</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 分布式追踪 Tab */}
          <TabsContent value="traces" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>分布式追踪 (Jaeger/OTel)</CardTitle>
                <CardDescription>
                  OpenTelemetry SDK 埋点 · 10% 采样率 · Span 标签: request-id, user-id, device-id
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Trace ID</TableHead>
                      <TableHead>服务</TableHead>
                      <TableHead>Span 数量</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tracesArray.map((trace: any, index: number) => {
                      const traceId = safeString(trace?.traceId, `trace-${index}`);
                      const services = safeArray<string>((trace as any)?.services || ((trace as any)?.serviceName ? [(trace as any)?.serviceName] : []));
                      const spanCount = safeNumber((trace as any)?.spans?.length || (trace as any)?.spanCount);
                      const duration = safeNumber(trace?.duration);
                      const startTime = (trace as any)?.startTime;
                      const startTimeMs = typeof startTime === 'number' && startTime > 1e12 ? startTime / 1000 : startTime;
                      return (
                        <TableRow key={traceId}>
                          <TableCell className="font-mono text-xs">
                            {traceId.substring(0, 16)}...
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {services.filter(Boolean).map((s: string, idx: number) => (
                                <Badge key={`${s}-${idx}`} variant="outline" className="text-xs">
                                  {s}
                                </Badge>
                              ))}
                              {services.length === 0 && <span className="text-muted-foreground">-</span>}
                            </div>
                          </TableCell>
                          <TableCell>{spanCount}</TableCell>
                          <TableCell>{(duration / 1000).toFixed(0)}ms</TableCell>
                          <TableCell className="text-muted-foreground">
                            {startTimeMs ? new Date(startTimeMs).toLocaleString() : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {tracesArray.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">暂无追踪数据</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 告警管理 Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 活跃告警 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>活跃告警</span>
                    <Select value={alertSeverity} onValueChange={setAlertSeverity}>
                      <SelectTrigger className="w-24">
                        <SelectValue placeholder="级别" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="P0">P0</SelectItem>
                        <SelectItem value="P1">P1</SelectItem>
                        <SelectItem value="P2">P2</SelectItem>
                        <SelectItem value="P3">P3</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {alertsArray.map((alert: any, index: number) => {
                      const id = safeString(alert?.id, `alert-${index}`);
                      const alertname = safeString((alert as any)?.alertname || (alert as any)?.name, 'Unknown Alert');
                      const severity = safeString(alert?.severity, 'P3');
                      const summary = safeString((alert as any)?.annotations?.summary || (alert as any)?.message, '');
                      const startsAt = (alert as any)?.startsAt || (alert as any)?.startTime || Date.now();
                      return (
                        <div key={id} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{alertname}</span>
                            <Badge variant={getSeverityColor(severity) as any}>
                              {severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{summary}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>开始于 {new Date(startsAt).toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                    {alertsArray.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">暂无活跃告警</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 告警规则 */}
              <Card>
                <CardHeader>
                  <CardTitle>告警规则</CardTitle>
                  <CardDescription>
                    P0 → PagerDuty 电话 · P1 → 企业微信 · P2 → Email
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {alertRulesArray.map((rule: any, index: number) => {
                      const id = safeString((rule as any)?.id || rule?.name, `rule-${index}`);
                      const name = safeString(rule?.name, 'Unknown Rule');
                      const severity = safeString((rule as any)?.severity || rule?.labels?.severity, 'P3');
                      const enabled = (rule as any)?.enabled !== false;
                      return (
                        <div key={id} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <Badge variant={getSeverityColor(severity) as any}>
                              {severity}
                            </Badge>
                            <span className="font-medium">{name}</span>
                          </div>
                          <Badge variant={enabled ? 'default' : 'outline'}>
                            {enabled ? '启用' : '禁用'}
                          </Badge>
                        </div>
                      );
                    })}
                    {alertRulesArray.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">暂无告警规则</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 告警接收器 */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>告警接收器</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>配置</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiversArray.map((r: any, index: number) => {
                        const name = safeString(r?.name, `receiver-${index}`);
                        const type = safeString(r?.type, 'unknown');
                        return (
                          <TableRow key={name}>
                            <TableCell className="font-medium">{name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{type}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {type === 'pagerduty' && 'PagerDuty 电话通知'}
                              {type === 'wechat' && '企业微信消息推送'}
                              {type === 'email' && 'Email 邮件通知'}
                              {!['pagerduty', 'wechat', 'email'].includes(type) && '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {receiversArray.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">暂无告警接收器</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
