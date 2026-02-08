/**
 * Falco 运行时安全监控页面
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Eye,
  RefreshCw,
  Filter,
  Download,
  Bell,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

// 模拟 Falco 事件数据
const mockEvents = [
  { id: 1, time: '2026-02-04 12:30:15', priority: 'Critical', rule: 'Container Escape Attempt', output: 'Detected container escape attempt via /proc/self/exe', container: 'nginx-pod-abc123', namespace: 'production' },
  { id: 2, time: '2026-02-04 12:28:42', priority: 'Warning', rule: 'Sensitive File Access', output: 'Read sensitive file /etc/shadow', container: 'app-pod-def456', namespace: 'staging' },
  { id: 3, time: '2026-02-04 12:25:10', priority: 'Notice', rule: 'Unexpected Network Connection', output: 'Outbound connection to suspicious IP 185.x.x.x', container: 'worker-pod-ghi789', namespace: 'production' },
  { id: 4, time: '2026-02-04 12:20:33', priority: 'Warning', rule: 'Privilege Escalation', output: 'Process gained elevated privileges via setuid', container: 'api-pod-jkl012', namespace: 'production' },
  { id: 5, time: '2026-02-04 12:15:55', priority: 'Critical', rule: 'Crypto Mining Detected', output: 'Detected cryptocurrency mining process', container: 'batch-pod-mno345', namespace: 'batch' },
];

const mockRules = [
  { name: 'Container Escape Detection', enabled: true, priority: 'Critical', triggers: 15 },
  { name: 'Sensitive File Access', enabled: true, priority: 'Warning', triggers: 42 },
  { name: 'Privilege Escalation', enabled: true, priority: 'Warning', triggers: 8 },
  { name: 'Crypto Mining Detection', enabled: true, priority: 'Critical', triggers: 3 },
  { name: 'Unexpected Network Connection', enabled: true, priority: 'Notice', triggers: 127 },
  { name: 'Shell Spawned in Container', enabled: false, priority: 'Notice', triggers: 0 },
];

const priorityColors: Record<string, string> = {
  Critical: 'bg-red-500',
  Warning: 'bg-yellow-500',
  Notice: 'bg-blue-500',
  Info: 'bg-gray-500',
};

export default function FalcoMonitor() {
  const [events] = useState(mockEvents);
  const [rules] = useState(mockRules);

  return (
    <MainLayout title="Falco 监控">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Falco 运行时安全监控
            </h1>
            <p className="text-sm text-muted-foreground">实时监控容器运行时安全事件</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              导出报告
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              刷新
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                Falco 状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500">运行中</Badge>
                <span className="text-sm text-muted-foreground">5 节点</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                严重事件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">
                {(events || []).filter(e => e.priority === 'Critical').length}
              </div>
              <p className="text-xs text-muted-foreground">过去24小时</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4 text-yellow-500" />
                警告事件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">
                {(events || []).filter(e => e.priority === 'Warning').length}
              </div>
              <p className="text-xs text-muted-foreground">过去24小时</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-blue-500" />
                活跃规则
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(rules || []).filter(r => r.enabled).length}/{rules.length}
              </div>
              <p className="text-xs text-muted-foreground">规则启用</p>
            </CardContent>
          </Card>
        </div>

        {/* 主内容区 */}
        <Tabs defaultValue="events" className="space-y-4">
          <TabsList>
            <TabsTrigger value="events">安全事件</TabsTrigger>
            <TabsTrigger value="rules">检测规则</TabsTrigger>
            <TabsTrigger value="config">配置管理</TabsTrigger>
          </TabsList>

          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">最近安全事件</CardTitle>
                <CardDescription>实时监控的容器安全事件</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead>规则</TableHead>
                        <TableHead>容器</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>详情</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(events || []).map(event => (
                        <TableRow key={event.id}>
                          <TableCell className="text-sm text-muted-foreground">{event.time}</TableCell>
                          <TableCell>
                            <Badge className={priorityColors[event.priority]}>{event.priority}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{event.rule}</TableCell>
                          <TableCell className="font-mono text-xs">{event.container}</TableCell>
                          <TableCell>{event.namespace}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">{event.output}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">检测规则</CardTitle>
                <CardDescription>Falco 安全检测规则配置</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>规则名称</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>触发次数</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rules || []).map(rule => (
                      <TableRow key={rule.name}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`border-${priorityColors[rule.priority].replace('bg-', '')}`}>
                            {rule.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rule.enabled ? (
                            <div className="flex items-center gap-1 text-green-500">
                              <CheckCircle className="h-4 w-4" />
                              <span>启用</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-gray-500">
                              <XCircle className="h-4 w-4" />
                              <span>禁用</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{rule.triggers}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => toast.info('编辑规则')}>
                            编辑
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Falco 配置</CardTitle>
                <CardDescription>管理 Falco 部署和配置</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">DaemonSet 状态</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">期望副本</span>
                          <span>5</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">就绪副本</span>
                          <span className="text-green-500">5</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">镜像版本</span>
                          <span>falcosecurity/falco:0.37.0</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Sidekick 状态</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">状态</span>
                          <Badge className="bg-green-500">运行中</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">输出目标</span>
                          <span>Alertmanager, Slack</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">处理事件</span>
                          <span>1,234</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
