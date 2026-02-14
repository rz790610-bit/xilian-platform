/**
 * 安全扫描页面
 * 集成 Trivy、Semgrep、Gitleaks 扫描结果
 *
 * 数据源: 待接入后端 API
 * 当前状态: 优雅降级 — 显示空状态 + 连接提示
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Shield,
  Bug,
  Code,
  Key,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  FileSearch,
  PlugZap,
} from 'lucide-react';

const severityColors: Record<string, string> = {
  Critical: 'bg-red-600',
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-blue-500',
  Error: 'bg-red-500',
  Warning: 'bg-yellow-500',
  Info: 'bg-blue-500',
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

export default function SecurityScanner() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // ─── 数据状态（从后端获取，当前为空） ───
  const [trivyResults] = useState<any[]>([]);
  const [semgrepResults] = useState<any[]>([]);
  const [gitleaksResults] = useState<any[]>([]);

  const handleStartScan = () => {
    toast.info('扫描服务尚未连接，请先在「系统设置 > 安全集成」中配置扫描工具');
  };

  const handleConnectService = () => {
    toast.info('请在「系统设置 > 安全集成」中配置 Trivy / Semgrep / Gitleaks');
  };

  return (
    <MainLayout title="安全扫描">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-blue-500" />
              安全扫描中心
            </h1>
            <p className="text-sm text-muted-foreground">漏洞扫描、代码安全、密钥检测</p>
          </div>
          <Button onClick={handleStartScan} disabled={isScanning}>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                漏洞总数
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                上次扫描
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium text-muted-foreground">从未扫描</div>
              <p className="text-xs text-muted-foreground">待连接扫描服务</p>
            </CardContent>
          </Card>
        </div>

        {/* 扫描结果 */}
        <Tabs defaultValue="trivy" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trivy" className="flex items-center gap-1">
              <Bug className="h-4 w-4" />
              Trivy 漏洞
            </TabsTrigger>
            <TabsTrigger value="semgrep" className="flex items-center gap-1">
              <Code className="h-4 w-4" />
              Semgrep 代码
            </TabsTrigger>
            <TabsTrigger value="gitleaks" className="flex items-center gap-1">
              <Key className="h-4 w-4" />
              Gitleaks 密钥
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trivy">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">依赖漏洞扫描结果</CardTitle>
                <CardDescription>Trivy 扫描发现的安全漏洞</CardDescription>
              </CardHeader>
              <CardContent>
                {trivyResults.length === 0 ? (
                  <EmptyState
                    icon={<Bug className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="连接 Trivy 扫描服务后，漏洞检测结果将显示在此处。支持容器镜像和依赖包扫描。"
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
                      {trivyResults.map((vuln: any) => (
                        <TableRow key={vuln.id}>
                          <TableCell className="font-mono text-sm">{vuln.id}</TableCell>
                          <TableCell>
                            <Badge className={severityColors[vuln.severity]}>{vuln.severity}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{vuln.package}</TableCell>
                          <TableCell className="text-red-500">{vuln.version}</TableCell>
                          <TableCell className="text-green-500">{vuln.fixedVersion}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{vuln.description}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="semgrep">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">代码安全扫描结果</CardTitle>
                <CardDescription>Semgrep 扫描发现的代码安全问题</CardDescription>
              </CardHeader>
              <CardContent>
                {semgrepResults.length === 0 ? (
                  <EmptyState
                    icon={<Code className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="连接 Semgrep 扫描服务后，代码安全问题将显示在此处。支持 SQL 注入、XSS 等检测。"
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
                      {semgrepResults.map((issue: any) => (
                        <TableRow key={issue.id}>
                          <TableCell className="font-mono text-sm">{issue.rule}</TableCell>
                          <TableCell>
                            <Badge className={severityColors[issue.severity]}>{issue.severity}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{issue.file}</TableCell>
                          <TableCell>{issue.line}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{issue.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gitleaks">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">密钥泄露检测结果</CardTitle>
                <CardDescription>Gitleaks 扫描发现的密钥泄露</CardDescription>
              </CardHeader>
              <CardContent>
                {gitleaksResults.length === 0 ? (
                  <EmptyState
                    icon={<Key className="h-12 w-12" />}
                    title="暂无扫描结果"
                    description="连接 Gitleaks 扫描服务后，密钥泄露检测结果将显示在此处。支持 AWS、GitHub 等密钥检测。"
                    action={{ label: '配置 Gitleaks', onClick: handleConnectService }}
                  />
                ) : (
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
                      {gitleaksResults.map((leak: any) => (
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
