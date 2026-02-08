/**
 * PKI 证书管理页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileKey, RefreshCw, Plus, AlertTriangle } from 'lucide-react';

const mockCerts = [
  { cn: '*.xilian.local', issuer: 'Xilian Root CA', type: 'Server', notAfter: '2027-02-08', serial: 'A1:B2:C3:D4', status: 'valid' },
  { cn: 'api.xilian.local', issuer: 'Xilian Root CA', type: 'Server', notAfter: '2026-08-15', serial: 'E5:F6:G7:H8', status: 'valid' },
  { cn: 'kafka.xilian.local', issuer: 'Xilian Root CA', type: 'Client', notAfter: '2026-05-20', serial: 'I9:J0:K1:L2', status: 'expiring' },
  { cn: 'Xilian Root CA', issuer: 'Self-signed', type: 'CA', notAfter: '2036-02-08', serial: 'M3:N4:O5:P6', status: 'valid' },
];

export default function PkiManager() {
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
              <CardTitle className="text-2xl">4</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>即将过期</CardDescription>
              <CardTitle className="text-2xl text-yellow-500">1</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>CA 证书</CardDescription>
              <CardTitle className="text-2xl">1</CardTitle>
            </CardHeader>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>证书列表</CardTitle>
          </CardHeader>
          <CardContent>
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
                {mockCerts.map((c) => (
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
