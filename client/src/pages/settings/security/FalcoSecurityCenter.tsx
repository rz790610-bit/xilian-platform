/**
 * PortAI Nexus - 安全中心
 * 合并 Falco 运行时监控 + 安全扫描（Trivy/Semgrep/Gitleaks）
 * 
 * 数据源: 纯前端 Mock（原 FalcoMonitor + SecurityScanner 均为 Mock）
 * 后端依赖: 无
 * 数据库依赖: 无
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
  FileSearch
} from 'lucide-react';

// ━━━ Falco Mock 数据 ━━━
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

// ━━━ Scanner Mock 数据 ━━━
const mockTrivyResults = [
  { id: 'CVE-2024-1234', severity: 'Critical', package: 'openssl', version: '1.1.1k', fixedVersion: '1.1.1l', description: 'Buffer overflow vulnerability' },
  { id: 'CVE-2024-5678', severity: 'High', package: 'lodash', version: '4.17.20', fixedVersion: '4.17.21', description: 'Prototype pollution' },
  { id: 'CVE-2024-9012', severity: 'Medium', package: 'axios', version: '0.21.0', fixedVersion: '0.21.1', description: 'SSRF vulnerability' },
];

const mockSemgrepResults = [
  { id: 1, rule: 'hardcoded-password', severity: 'Error', file: 'src/config.ts', line: 42, message: 'Hardcoded password detected' },
  { id: 2, rule: 'sql-injection', severity: 'Warning', file: 'src/db/query.ts', line: 78, message: 'Potential SQL injection' },
  { id: 3, rule: 'xss-vulnerability', severity: 'Warning', file: 'src/components/Input.tsx', line: 23, message: 'Potential XSS vulnerability' },
];

const mockGitleaksResults = [
  { id: 1, rule: 'aws-access-key', file: '.env.example', line: 5, secret: 'AKIA***************', commit: 'abc123' },
  { id: 2, rule: 'github-token', file: 'scripts/deploy.sh', line: 12, secret: 'ghp_***************', commit: 'def456' },
];

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

export default function FalcoSecurityCenter() {
  const [events] = useState(mockEvents);
  const [rules] = useState(mockRules);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const handleStartScan = () => {
    setIsScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScanning(false);
          toast.success('扫描完成');
          return 100;
        }
        return prev + 10;
      });
    }, 500);
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bug className="h-4 w-4 text-red-500" />
                漏洞
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockTrivyResults.length}</div>
              <p className="text-xs text-muted-foreground">Trivy 扫描</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code className="h-4 w-4 text-yellow-500" />
                代码问题
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockSemgrepResults.length}</div>
              <p className="text-xs text-muted-foreground">Semgrep 扫描</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Key className="h-4 w-4 text-orange-500" />
                密钥泄露
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mockGitleaksResults.length}</div>
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
              Trivy 漏洞
            </TabsTrigger>
            <TabsTrigger value="semgrep" className="flex items-center gap-1">
              <Code className="w-4 h-4" />
              代码安全
            </TabsTrigger>
            <TabsTrigger value="gitleaks" className="flex items-center gap-1">
              <Key className="w-4 h-4" />
              密钥检测
            </TabsTrigger>
          </TabsList>

          {/* ━━━ Falco 安全事件 Tab ━━━ */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">最近安全事件</CardTitle>
                <CardDescription>Falco 实时监控的容器安全事件</CardDescription>
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

          {/* ━━━ Falco 检测规则 Tab ━━━ */}
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
                          <Badge variant="outline">{rule.priority}</Badge>
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

          {/* ━━━ Falco 配置 Tab ━━━ */}
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

          {/* ━━━ Trivy 漏洞扫描 Tab ━━━ */}
          <TabsContent value="trivy">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">依赖漏洞扫描结果</CardTitle>
                <CardDescription>Trivy 扫描发现的安全漏洞</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {(mockTrivyResults || []).map(vuln => (
                      <TableRow key={vuln.id}>
                        <TableCell className="font-mono text-sm">{vuln.id}</TableCell>
                        <TableCell>
                          <Badge className={priorityColors[vuln.severity]}>{vuln.severity}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{vuln.package}</TableCell>
                        <TableCell className="text-red-500">{vuln.version}</TableCell>
                        <TableCell className="text-green-500">{vuln.fixedVersion}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{vuln.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Semgrep 代码安全 Tab ━━━ */}
          <TabsContent value="semgrep">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">代码安全扫描结果</CardTitle>
                <CardDescription>Semgrep 扫描发现的代码安全问题</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {(mockSemgrepResults || []).map(issue => (
                      <TableRow key={issue.id}>
                        <TableCell className="font-mono text-sm">{issue.rule}</TableCell>
                        <TableCell>
                          <Badge className={priorityColors[issue.severity]}>{issue.severity}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{issue.file}</TableCell>
                        <TableCell>{issue.line}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━ Gitleaks 密钥检测 Tab ━━━ */}
          <TabsContent value="gitleaks">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">密钥泄露检测结果</CardTitle>
                <CardDescription>Gitleaks 扫描发现的密钥泄露</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>规则</TableHead>
                      <TableHead>文件</TableHead>
                      <TableHead>行号</TableHead>
                      <TableHead>密钥（部分）</TableHead>
                      <TableHead>提交</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(mockGitleaksResults || []).map(leak => (
                      <TableRow key={leak.id}>
                        <TableCell className="font-mono text-sm">{leak.rule}</TableCell>
                        <TableCell className="font-medium">{leak.file}</TableCell>
                        <TableCell>{leak.line}</TableCell>
                        <TableCell className="font-mono text-sm text-red-500">{leak.secret}</TableCell>
                        <TableCell className="font-mono text-xs">{leak.commit}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => toast.info('查看详情')}>
                            查看
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
