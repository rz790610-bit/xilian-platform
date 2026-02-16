/**
 * PKI 证书管理页面
 * 数据源: PKI/Vault 未部署 → 显示 Docker 容器 TLS 概览 + 部署引导
 * 容器数据来自: trpc.docker.listEngines
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileKey, Plus, Info, ExternalLink, Container, Shield } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export default function PkiManager() {
  const { data: dockerData, isLoading } = trpc.docker.listEngines.useQuery(undefined, { refetchInterval: 30000 });
  const containers = dockerData?.engines || [];

  // 检测哪些容器可能暴露了 HTTPS 端口
  const tlsContainers = containers.filter((c: any) => {
    const ports = c.ports || [];
    return ports.some((p: any) => {
      const port = typeof p === 'string' ? p : `${p.hostPort || ''}${p.containerPort || ''}`;
      return port.includes('443') || port.includes('8443') || port.includes('9443');
    });
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PKI 证书</h1>
            <p className="text-muted-foreground">TLS/SSL 证书生命周期管理</p>
          </div>
        </div>

        {/* PKI 未部署提示 */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-400">PKI 服务未部署</p>
                <p className="text-xs text-muted-foreground mt-1">
                  TLS/SSL 证书生命周期管理需要部署 PKI 服务（如 HashiCorp Vault PKI、CFSSL、Step CA 等）。
                  部署后可实现自动签发、续期、吊销证书。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>证书总数</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">需要 PKI 服务</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>即将过期</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">需要 PKI 服务</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>TLS 容器</CardDescription>
              <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-8 w-12" /> : tlsContainers.length}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">暴露 HTTPS 端口的容器</p>
            </CardContent>
          </Card>
        </div>

        {/* TLS 容器概览 */}
        {tlsContainers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>TLS 相关容器</CardTitle>
              <CardDescription>以下容器暴露了 HTTPS 端口，可能需要证书管理</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tlsContainers.map((c: any) => (
                  <div key={c.containerName || c.name} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Container className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.containerName || c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{c.image || '-'}</p>
                    </div>
                    <Badge variant={c.status === 'running' ? 'default' : 'secondary'} className={c.status === 'running' ? 'bg-green-600' : ''}>
                      {c.status === 'running' ? '运行中' : c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 推荐 PKI 方案 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              推荐 PKI 方案
            </CardTitle>
            <CardDescription>选择适合您场景的 PKI 服务</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">HashiCorp Vault PKI</h4>
                <p className="text-xs text-muted-foreground mb-3">企业级 PKI，支持自动签发、ACME 协议、证书轮换。适合大规模微服务场景。</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://developer.hashicorp.com/vault/docs/secrets/pki" target="_blank" rel="noopener">
                    <ExternalLink className="h-3 w-3 mr-1" /> 文档
                  </a>
                </Button>
              </div>
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">Step CA</h4>
                <p className="text-xs text-muted-foreground mb-3">开源私有 CA，支持 ACME、SSH 证书、OIDC 集成。轻量级，适合中小规模。</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://smallstep.com/docs/step-ca/" target="_blank" rel="noopener">
                    <ExternalLink className="h-3 w-3 mr-1" /> 文档
                  </a>
                </Button>
              </div>
              <div className="p-4 rounded-lg border">
                <h4 className="font-medium mb-1">cert-manager</h4>
                <p className="text-xs text-muted-foreground mb-3">Kubernetes 原生证书管理，支持 Let's Encrypt 自动签发。适合 K8s 环境。</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://cert-manager.io/docs/" target="_blank" rel="noopener">
                    <ExternalLink className="h-3 w-3 mr-1" /> 文档
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
