/**
 * 安全扫描页面
 * 集成 Trivy、Semgrep、Gitleaks 扫描结果
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
  FileSearch
} from 'lucide-react';

// 模拟扫描结果
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

const severityColors: Record<string, string> = {
  Critical: 'bg-red-600',
  High: 'bg-red-500',
  Medium: 'bg-yellow-500',
  Low: 'bg-blue-500',
  Error: 'bg-red-500',
  Warning: 'bg-yellow-500',
  Info: 'bg-blue-500',
};

export default function SecurityScanner() {
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
                <Bug className="h-4 w-4 text-red-500" />
                漏洞总数
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                上次扫描
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">2026-02-04 12:00</div>
              <p className="text-xs text-muted-foreground">2小时前</p>
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
                    {mockTrivyResults.map(vuln => (
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
                    {mockSemgrepResults.map(issue => (
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
                    {mockGitleaksResults.map(leak => (
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
