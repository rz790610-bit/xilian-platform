/**
 * 密钥管理页面 (HashiCorp Vault)
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Key, RefreshCw, Plus, Shield, Lock } from 'lucide-react';

const mockSecrets = [
  { path: 'secret/database/mysql', type: 'KV v2', version: 3, lastUpdated: '2026-02-07 14:30', accessCount: 128 },
  { path: 'secret/database/redis', type: 'KV v2', version: 2, lastUpdated: '2026-02-06 09:15', accessCount: 95 },
  { path: 'secret/api/openai', type: 'KV v2', version: 5, lastUpdated: '2026-02-08 08:00', accessCount: 342 },
  { path: 'secret/tls/server-cert', type: 'PKI', version: 1, lastUpdated: '2026-01-15 10:00', accessCount: 56 },
  { path: 'secret/kafka/credentials', type: 'KV v2', version: 2, lastUpdated: '2026-02-05 16:45', accessCount: 78 },
];

export default function VaultManager() {
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
              <CardTitle className="text-2xl">5</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Vault 状态</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Badge className="bg-green-500">已解封</Badge>
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>今日访问次数</CardDescription>
              <CardTitle className="text-2xl">699</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>密钥列表</CardTitle>
          </CardHeader>
          <CardContent>
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
                {mockSecrets.map((s) => (
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
