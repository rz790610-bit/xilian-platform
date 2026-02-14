/**
 * PKI 证书管理页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileKey, RefreshCw, Plus, AlertTriangle, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function PkiManager() {
  const [certs] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 安全集成」中配置 PKI / Vault 连接');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">PKI 证书</h1>
            <p className="text-muted-foreground">TLS/SSL 证书生命周期管理</p>
          </div>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            签发证书
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>证书总数</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>即将过期</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>CA 证书</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>证书列表</CardTitle>
          </CardHeader>
          <CardContent>
            {certs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileKey className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无证书</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  连接 PKI 服务或 HashiCorp Vault 后，TLS/SSL 证书将显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置 PKI 服务
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>通用名称 (CN)</TableHead>
                    <TableHead>签发者</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>过期时间</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certs.map((c: any) => (
                    <TableRow key={c.serial}>
                      <TableCell className="font-mono text-sm">{c.cn}</TableCell>
                      <TableCell>{c.issuer}</TableCell>
                      <TableCell><Badge variant="outline">{c.type}</Badge></TableCell>
                      <TableCell>{c.notAfter}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'valid' ? 'default' : 'destructive'} className={c.status === 'valid' ? 'bg-green-500' : 'bg-yellow-500'}>
                          {c.status === 'valid' ? '有效' : '即将过期'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
