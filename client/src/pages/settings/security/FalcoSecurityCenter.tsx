/**
 * PortAI Nexus - 安全中心
 * 合并 Falco 运行时监控 + 安全扫描（Trivy/Semgrep/Gitleaks）
 *
 * 数据源: 待接入后端 API（Falco gRPC / Trivy CLI / Semgrep / Gitleaks）
 * 当前状态: 优雅降级 — 显示空状态 + 连接提示
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Shield,
  AlertTriangle,
  Activity,
  Eye,
  RefreshCw,
  Download,
  Bell,
  CheckCircle,
  XCircle,
  Clock,
  Bug,
  Code,
  Key,
  Play,
  FileSearch,
  PlugZap,
  Settings,
} from 'lucide-react';

// ─── 颜色映射 ───
const priorityColors: Record<string, string> = {
  Critical: 'bg-red-500',
  High: 'bg-red-500',
  Warning: 'bg-yellow-500',
  Medium: 'bg-yellow-500',
  Notice: 'bg-blue-500',
  Low: 'bg-blue-500',
  Error: 'bg-red-500',
  Info: 'bg-gray-500',
};

// ─── 空状态组件 ───
function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-muted-foreground mb-4">{icon}</div>
      <h3 className="text-sm font-medium mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-md mb-4">{description}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          <PlugZap className="h-4 w-4 mr-1" />
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default function FalcoSecurityCenter() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // ─── 数据状态（从后端获取，当前为空） ───
  const [events] = useState<any[]>([]);
  const [rules] = useState<any[]>([]);
  const [trivyResults] = useState<any[]>([]);
  const [semgrepResults] = useState<any[]>([]);
  const [gitleaksResults] = useState<any[]>([]);

  const handleStartScan = () => {
    toast.info('安全扫描服务尚未连接，请先配置 Falco / Trivy 集成');
  };

  const handleConnectService = () => {
    toast.info('请在「系统设置 > 安全集成」中配置 Falco gRPC 端点和扫描工具');
  };

  return (
    <MainLayout title="安全中心">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              安全中心
            </h1>
            <p className="text-sm text-muted-foreground">运行时安全监控 + 漏洞扫描 + 密钥检测</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleStartScan} disabled={isScanning}>
              {isScanning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  开始扫描
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info('暂无扫描报告可导出')}>
              <Download className="h-4 w-4 mr-1" />
              导出报告
            </Button>
            <Button variant="outline" size="sm" onClick={handleConnectService}>
              <Settings className="h-4 w-4 mr-1" />
              配置集成
            </Button>
          </div>
        </div>

        {/* 扫描进度 */}
        {isScanning && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>扫描进度</span>
                  <span>{scanProgress}%</span>
                </div>
                <Progress value={scanProgress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Falco 状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant="outline">未连接</Badge>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                严重事件
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">待连接数据源</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                活跃规则
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">待配置规则</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                漏洞
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">Trivy 扫描</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code className="h-4 w-4 text-muted-foreground" />
                代码问题
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">Semgrep 扫描</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                密钥泄露
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">Gitleaks 扫描</p>
            </CardContent>
          </Card>
        </div>

        {/* 主内容 Tabs */}
        <Tabs defaultValue="events" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="events" className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              安全事件
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-1">
              <Shield className="w-4 h-4" />
              检测规则
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-1">
              <Activity className="w-4 h-4" />
              Falco 配置
            </TabsTrigger>
            <TabsTrigger value="trivy" className="flex items-center gap-1">
              <Bug className="w-4 h-4" />
              Trivy
            </TabsTrigger>
            <TabsTrigger value="semgrep" className="flex items-center gap-1">
              <Code className="w-4 h-4" />
              Semgrep
            </TabsTrigger>
            <TabsTrigger value="gitleaks" className="flex items-center gap-1">
              <Key className="w-4 h-4" />
              Gitleaks
            </TabsTrigger>
          </TabsList>

          {/* ━━━ 安全事件 Tab ━━━ */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Falco 安全事件</CardTitle>
                <CardDescription>运行时安全事件监控</CardDescription>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <EmptyState
                    icon={<AlertTriangle className="h-12 w-12" />}
                    title="暂无安全事件"
                    description="连接 Falco 运行时监控后，安全事件将实时显示在此处。请先配置 Falco gRPC 端点。"
                    action={{ label: '配置 Falco 连接', onClick: handleConnectService }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead>规则</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>容器</TableHead>
                        <TableHead>命名空间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event: any) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-sm">{event.time}</TableCell>
                          <TableCell>
                            <Badge className={priorityColors[event.priority]}>{event.priority}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{event.rule}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{event.output}</TableCell>
                          <TableCell className="font-mono text-xs">{event.container}</TableCell>
                          <TableCell><Badge variant="outline">{event.namespace}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ 检测规则 Tab ━━━ */}
          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Falco 检测规则</CardTitle>
                <CardDescription>运行时安全检测规则配置</CardDescription>
              </CardHeader>
              <CardContent>
                {rules.length === 0 ? (
                  <EmptyState
                    icon={<Shield className="h-12 w-12" />}
                    title="暂无检测规则"
                    description="连接 Falco 后，检测规则将自动同步。您也可以手动添加自定义规则。"
                    action={{ label: '配置 Falco 连接', onClick: handleConnectService }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>规则名称</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>触发次数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell><Badge className={priorityColors[rule.priority]}>{rule.priority}</Badge></TableCell>
                          <TableCell>
                            <Badge className={rule.enabled ? 'bg-green-500' : 'bg-gray-500'}>
                              {rule.enabled ? '启用' : '禁用'}
                            </Badge>
                          </TableCell>
                          <TableCell>{rule.triggers}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Falco 配置 Tab ━━━ */}
          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Falco 配置</CardTitle>
                <CardDescription>Falco 运行时安全引擎配置</CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<Activity className="h-12 w-12" />}
                  title="Falco 引擎未连接"
                  description="请配置 Falco gRPC 端点以启用运行时安全监控。支持 Falco 0.35+ 版本。"
                  action={{ label: '配置连接', onClick: handleConnectService }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Trivy Tab ━━━ */}
          <TabsContent value="trivy">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Trivy 漏洞扫描</CardTitle>
                    <CardDescription>容器镜像和依赖包漏洞检测</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleStartScan} disabled={isScanning}>
                    <FileSearch className="h-4 w-4 mr-1" />
                    运行扫描
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {trivyResults.length === 0 ? (
                  <EmptyState
                    icon={<Bug className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="运行 Trivy 扫描以检测容器镜像和依赖包中的已知漏洞（CVE）。"
                    action={{ label: '配置 Trivy', onClick: handleConnectService }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CVE ID</TableHead>
                        <TableHead>严重程度</TableHead>
                        <TableHead>包名</TableHead>
                        <TableHead>当前版本</TableHead>
                        <TableHead>修复版本</TableHead>
                        <TableHead>描述</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trivyResults.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.id}</TableCell>
                          <TableCell><Badge className={priorityColors[item.severity]}>{item.severity}</Badge></TableCell>
                          <TableCell className="font-medium">{item.package}</TableCell>
                          <TableCell>{item.version}</TableCell>
                          <TableCell className="text-green-500">{item.fixedVersion}</TableCell>
                          <TableCell className="text-sm max-w-xs truncate">{item.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Semgrep Tab ━━━ */}
          <TabsContent value="semgrep">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Semgrep 代码扫描</CardTitle>
                    <CardDescription>静态代码分析和安全规则检测</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleStartScan} disabled={isScanning}>
                    <Code className="h-4 w-4 mr-1" />
                    运行扫描
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {semgrepResults.length === 0 ? (
                  <EmptyState
                    icon={<Code className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="运行 Semgrep 扫描以检测代码中的安全漏洞、硬编码密码和 SQL 注入等问题。"
                    action={{ label: '配置 Semgrep', onClick: handleConnectService }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>规则</TableHead>
                        <TableHead>严重程度</TableHead>
                        <TableHead>文件</TableHead>
                        <TableHead>行号</TableHead>
                        <TableHead>描述</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {semgrepResults.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.rule}</TableCell>
                          <TableCell><Badge className={priorityColors[item.severity]}>{item.severity}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{item.file}</TableCell>
                          <TableCell>{item.line}</TableCell>
                          <TableCell className="text-sm">{item.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Gitleaks Tab ━━━ */}
          <TabsContent value="gitleaks">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">Gitleaks 密钥检测</CardTitle>
                    <CardDescription>Git 仓库中的密钥和凭据泄露检测</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleStartScan} disabled={isScanning}>
                    <Key className="h-4 w-4 mr-1" />
                    运行扫描
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {gitleaksResults.length === 0 ? (
                  <EmptyState
                    icon={<Key className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="运行 Gitleaks 扫描以检测 Git 仓库中泄露的 API 密钥、令牌和凭据。"
                    action={{ label: '配置 Gitleaks', onClick: handleConnectService }}
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>规则</TableHead>
                        <TableHead>文件</TableHead>
                        <TableHead>行号</TableHead>
                        <TableHead>密钥（脱敏）</TableHead>
                        <TableHead>提交</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gitleaksResults.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.rule}</TableCell>
                          <TableCell className="font-mono text-xs">{item.file}</TableCell>
                          <TableCell>{item.line}</TableCell>
                          <TableCell className="font-mono text-xs text-red-400">{item.secret}</TableCell>
                          <TableCell className="font-mono text-xs">{item.commit}</TableCell>
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
