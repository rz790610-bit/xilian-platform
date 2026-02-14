/**
 * 密钥管理页面 (HashiCorp Vault)
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Key, RefreshCw, Plus, Shield, Lock, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function VaultManager() {
  const [secrets] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 安全集成」中配置 HashiCorp Vault 连接');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">密钥管理</h1>
            <p className="text-muted-foreground">HashiCorp Vault 密钥与证书管理</p>
          </div>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新增密钥
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>密钥总数</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Vault 状态</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Badge variant="secondary">未连接</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>今日访问次数</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground">—</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>密钥列表</CardTitle>
          </CardHeader>
          <CardContent>
            {secrets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Key className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无密钥</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  连接 HashiCorp Vault 后，密钥与证书将显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置 Vault
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>路径</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>版本</TableHead>
                    <TableHead>最后更新</TableHead>
                    <TableHead>访问次数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {secrets.map((s: any) => (
                    <TableRow key={s.path}>
                      <TableCell className="font-mono text-sm">{s.path}</TableCell>
                      <TableCell><Badge variant="outline">{s.type}</Badge></TableCell>
                      <TableCell>v{s.version}</TableCell>
                      <TableCell>{s.lastUpdated}</TableCell>
                      <TableCell>{s.accessCount}</TableCell>
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
