/**
 * 安全扫描页面
 * 数据源: Trivy / Semgrep / Gitleaks 均未部署 → 显示部署引导
 * Docker 容器数据来自: trpc.docker.listEngines
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield, Bug, Code, Key, RefreshCw, AlertTriangle, Info, ExternalLink, Container,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';

function ScannerTab({ name, description, icon: Icon, docUrl, features }: {
  name: string; description: string; icon: any; docUrl: string; features: string[];
}) {
  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">{name} 未部署</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {name} 功能概览
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                {f}
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={docUrl} target="_blank" rel="noopener">
              <ExternalLink className="h-3 w-3 mr-1" />
              查看部署文档
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SecurityScanner() {
  const { data: dockerData, isLoading } = trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 30000 });
  const containers = dockerData?.engines || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6" />
              安全扫描
            </h1>
            <p className="text-muted-foreground">容器镜像漏洞 · 代码安全审计 · 密钥泄露检测</p>
          </div>
        </div>

        {/* 扫描工具状态 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Bug className="h-3 w-3" /> Trivy</CardDescription>
              <CardTitle className="text-lg">
                <Badge variant="secondary">未部署</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">容器镜像漏洞扫描</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Code className="h-3 w-3" /> Semgrep</CardDescription>
              <CardTitle className="text-lg">
                <Badge variant="secondary">未部署</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">静态代码安全分析</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Key className="h-3 w-3" /> Gitleaks</CardDescription>
              <CardTitle className="text-lg">
                <Badge variant="secondary">未部署</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Git 密钥泄露检测</p>
            </CardContent>
          </Card>
        </div>

        {/* 待扫描容器列表 */}
        {containers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>待扫描容器镜像</CardTitle>
              <CardDescription>部署 Trivy 后可自动扫描以下 {containers.length} 个容器镜像的安全漏洞</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {containers.map((c: any) => (
                  <div key={c.containerName || c.name} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
                    <Container className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.containerName || c.name}</span>
                    <span className="text-muted-foreground font-mono text-xs truncate flex-1">{c.image || '-'}</span>
                    <Badge variant="outline" className="shrink-0">待扫描</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="trivy">
          <TabsList>
            <TabsTrigger value="trivy"><Bug className="h-4 w-4 mr-1" /> Trivy</TabsTrigger>
            <TabsTrigger value="semgrep"><Code className="h-4 w-4 mr-1" /> Semgrep</TabsTrigger>
            <TabsTrigger value="gitleaks"><Key className="h-4 w-4 mr-1" /> Gitleaks</TabsTrigger>
          </TabsList>

          <TabsContent value="trivy" className="mt-4">
            <ScannerTab
              name="Trivy"
              icon={Bug}
              description="部署 Trivy 后可自动扫描所有 Docker 容器镜像的 CVE 漏洞、OS 包漏洞和语言依赖漏洞。"
              docUrl="https://aquasecurity.github.io/trivy/"
              features={[
                '容器镜像 CVE 漏洞扫描（支持 Alpine、Debian、Ubuntu、CentOS 等）',
                '语言依赖漏洞检测（npm、pip、maven、go modules 等）',
                'IaC 配置安全检查（Dockerfile、Kubernetes YAML、Terraform）',
                '密钥泄露检测（API 密钥、密码、证书等）',
                'SBOM（软件物料清单）生成',
              ]}
            />
          </TabsContent>

          <TabsContent value="semgrep" className="mt-4">
            <ScannerTab
              name="Semgrep"
              icon={Code}
              description="部署 Semgrep 后可对项目源代码进行静态安全分析，检测 SQL 注入、XSS、SSRF 等安全漏洞。"
              docUrl="https://semgrep.dev/docs/getting-started/"
              features={[
                '支持 30+ 编程语言的安全规则扫描',
                '内置 2000+ 安全规则（OWASP Top 10 覆盖）',
                '自定义规则编写（YAML 格式，支持模式匹配）',
                'CI/CD 集成（GitHub Actions、GitLab CI）',
                '实时代码审查和修复建议',
              ]}
            />
          </TabsContent>

          <TabsContent value="gitleaks" className="mt-4">
            <ScannerTab
              name="Gitleaks"
              icon={Key}
              description="部署 Gitleaks 后可扫描 Git 仓库提交历史中的密钥泄露，防止敏感信息意外提交。"
              docUrl="https://github.com/gitleaks/gitleaks"
              features={[
                '扫描 Git 提交历史中的 API 密钥、密码、令牌',
                '支持 150+ 密钥类型检测（AWS、GCP、Azure、GitHub 等）',
                '自定义规则和白名单配置',
                'Pre-commit hook 集成（提交前自动检查）',
                'CI/CD 管道集成',
              ]}
            />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
