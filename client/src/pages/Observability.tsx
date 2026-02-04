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

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)} TB`;
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'down': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'P0': return 'destructive';
      case 'P1': return 'destructive';
      case 'P2': return 'secondary';
      case 'P3': return 'outline';
      default: return 'outline';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
      case 'FATAL': return 'text-red-500';
      case 'WARN': return 'text-yellow-500';
      case 'INFO': return 'text-blue-500';
      case 'DEBUG': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

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
                <div className={`w-2 h-2 rounded-full ${getStatusColor((summary as any)?.metrics?.prometheusStatus || (summary as any)?.prometheus?.status || 'down')}`} />
                <span className="text-2xl font-bold">{(summary as any)?.metrics?.targetsUp || (summary as any)?.prometheus?.metrics?.cpu?.toFixed(0) || 0}%</span>
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
                <div className={`w-2 h-2 rounded-full ${getStatusColor((summary as any)?.logs?.elkStatus || (summary as any)?.elasticsearch?.status || 'down')}`} />
                <span className="text-2xl font-bold">{(summary as any)?.logs?.indexCount || Math.round((summary as any)?.elasticsearch?.logsPerMinute || 0)}</span>
              </div>
              <p className="text-xs text-muted-foreground">日志/分钟 · {(summary as any)?.elasticsearch?.logsPerMinute?.toFixed(0) || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Jaeger 追踪</CardTitle>
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor((summary as any)?.traces?.jaegerStatus || (summary as any)?.jaeger?.status || 'down')}`} />
                <span className="text-2xl font-bold">{(summary as any)?.traces?.samplingRate?.toFixed(0) || 100}%</span>
              </div>
              <p className="text-xs text-muted-foreground">采样率 · {(summary as any)?.traces?.tracesPerSecond?.toFixed(0) || (summary as any)?.jaeger?.services || 0} 服务</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Alertmanager</CardTitle>
              <Bell className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor((summary?.alerts as any)?.alertmanagerStatus || 'down')}`} />
                <span className="text-2xl font-bold text-red-500">{(summary?.alerts as any)?.firingAlerts || (summary?.alerts as any)?.critical || 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">活跃告警 · {(summary?.alerts as any)?.rulesEnabled || (summary?.alerts as any)?.total || 0} 规则启用</p>
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
                    {(Array.isArray(nodeMetrics) ? nodeMetrics : [nodeMetrics]).filter(Boolean).map((node: any) => (
                      <div key={node.hostname} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{node.hostname}</span>
                          <Badge variant={node.cpuUsage > 80 ? 'destructive' : 'secondary'}>
                            CPU {node.cpuUsage.toFixed(1)}%
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <MemoryStick className="h-4 w-4 text-muted-foreground" />
                            <span>内存: {node.memoryUsage.toFixed(1)}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                            <span>磁盘: {node.diskUsage.toFixed(1)}%</span>
                          </div>
                        </div>
                        <Progress value={node.cpuUsage} className="h-1" />
                      </div>
                    ))}
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
                    {gpuMetrics?.slice(0, 8).map((gpu) => (
                      <div key={gpu.gpuId} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">GPU {gpu.gpuId}</span>
                          <span className="text-xs text-muted-foreground">{gpu.temperature.toFixed(0)}°C</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress value={gpu.gpuUtilization} className="w-20 h-2" />
                          <span className="text-sm w-12 text-right">{gpu.gpuUtilization.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
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
                      {logStats && Object.entries((logStats as any).byLevel || (logStats as any).levels || {}).map(([level, count]) => (
                        <div key={level} className="flex justify-between">
                          <span className={getLogLevelColor(level)}>{level}</span>
                          <span>{count as number}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">最近 1 小时错误</p>
                      <p className="text-3xl font-bold text-red-500">{(logStats as any)?.recentErrors || (logStats as any)?.levels?.ERROR || 0}</p>
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
                    {serviceDeps?.map((dep, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span>{dep.source}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{dep.target}</span>
                        </div>
                        <Badge variant="outline">{dep.callCount} 调用</Badge>
                      </div>
                    ))}
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
                      {containerMetrics?.map((c) => (
                        <TableRow key={c.containerId}>
                          <TableCell className="font-medium">{c.containerName}</TableCell>
                          <TableCell>{c.cpuUsage.toFixed(1)}%</TableCell>
                          <TableCell>{formatBytes(c.memoryUsage)}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === 'running' ? 'default' : 'destructive'}>
                              {c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
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
                      {(Array.isArray(appMetrics) ? appMetrics : [appMetrics]).slice(0, 6).map((m: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{m.serviceName}</TableCell>
                          <TableCell>{m.requestLatencyP99.toFixed(0)}ms</TableCell>
                          <TableCell>{m.throughput.toFixed(0)}/s</TableCell>
                          <TableCell>
                            <span className={m.errorRate > 1 ? 'text-red-500' : ''}>
                              {m.errorRate.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
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
                      {gpuMetrics?.map((g) => (
                        <TableRow key={g.gpuId}>
                          <TableCell className="font-medium">GPU {g.gpuId}</TableCell>
                          <TableCell className="text-xs">{g.name}</TableCell>
                          <TableCell>
                            <span className={g.temperature > 80 ? 'text-red-500' : ''}>
                              {g.temperature.toFixed(0)}°C
                            </span>
                          </TableCell>
                          <TableCell>{g.powerUsage.toFixed(0)}W / {g.powerLimit}W</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={g.gpuUtilization} className="w-16 h-2" />
                              <span>{g.gpuUtilization.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatBytes(g.memoryUsed)} / {formatBytes(g.memoryTotal)}</TableCell>
                          <TableCell>
                            <Badge variant={g.eccErrors > 0 ? 'destructive' : 'secondary'}>
                              {g.eccErrors}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
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
                        <SelectItem value="">全部</SelectItem>
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
                        <SelectItem value="">全部服务</SelectItem>
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
                  {logs?.map((log, i) => (
                    <div key={i} className="flex gap-2 p-2 bg-muted/50 rounded">
                      <span className="text-muted-foreground w-44 shrink-0">
                        {new Date((log as any)['@timestamp'] || (log as any).timestamp).toLocaleString()}
                      </span>
                      <span className={`w-12 shrink-0 ${getLogLevelColor(log.level)}`}>
                        {log.level}
                      </span>
                      <span className="text-blue-500 w-32 shrink-0">{log.service}</span>
                      <span className="truncate">{log.message}</span>
                    </div>
                  ))}
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
                    {traces?.map((trace) => (
                      <TableRow key={trace.traceId}>
                        <TableCell className="font-mono text-xs">
                          {trace.traceId.substring(0, 16)}...
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {((trace as any).services || [(trace as any).serviceName]).map((s: string) => (
                              <Badge key={s} variant="outline" className="text-xs">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{(trace as any).spans?.length || (trace as any).spanCount}</TableCell>
                        <TableCell>{(trace.duration / 1000).toFixed(0)}ms</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(typeof (trace as any).startTime === 'number' ? (trace as any).startTime / 1000 : (trace as any).startTime).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
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
                        <SelectItem value="">全部</SelectItem>
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
                    {alerts?.map((alert) => (
                      <div key={alert.id} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{(alert as any).alertname || (alert as any).name}</span>
                          <Badge variant={getSeverityColor(alert.severity) as any}>
                            {alert.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{(alert as any).annotations?.summary || (alert as any).message}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>开始于 {new Date((alert as any).startsAt || (alert as any).startTime).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                    {(!alerts || alerts.length === 0) && (
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
                    {alertRules?.map((rule) => (
                      <div key={(rule as any).id || rule.name} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor((rule as any).severity || rule.labels?.severity) as any}>
                            {(rule as any).severity || rule.labels?.severity}
                          </Badge>
                          <span className="font-medium">{rule.name}</span>
                        </div>
                        <Badge variant={(rule as any).enabled !== false ? 'default' : 'outline'}>
                          {(rule as any).enabled !== false ? '启用' : '禁用'}
                        </Badge>
                      </div>
                    ))}
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
                      {receivers?.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{r.type}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {r.type === 'pagerduty' && 'PagerDuty 电话通知'}
                            {r.type === 'wechat' && '企业微信消息推送'}
                            {r.type === 'email' && 'Email 邮件通知'}
                          </TableCell>
                        </TableRow>
                      ))}
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
