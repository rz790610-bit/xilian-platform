/**
 * 数据库管理页面
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, RefreshCw, Settings, Activity } from 'lucide-react';

const mockDatabases = [
  { name: 'xilian_main', type: 'MySQL', size: '2.4 GB', tables: 54, connections: 12, status: 'healthy' },
  { name: 'xilian_timeseries', type: 'ClickHouse', size: '18.7 GB', tables: 8, connections: 5, status: 'healthy' },
  { name: 'xilian_graph', type: 'Neo4j', size: '1.2 GB', tables: 15, connections: 3, status: 'healthy' },
  { name: 'xilian_cache', type: 'Redis', size: '512 MB', tables: 0, connections: 24, status: 'healthy' },
];

export default function DbManagement() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">数据库管理</h1>
            <p className="text-muted-foreground">管理和监控所有数据库实例</p>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新状态
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>数据库实例</CardTitle>
            <CardDescription>当前已注册的数据库连接</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>表数量</TableHead>
                  <TableHead>连接数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockDatabases.map((db) => (
                  <TableRow key={db.name}>
                    <TableCell className="font-medium">{db.name}</TableCell>
                    <TableCell><Badge variant="outline">{db.type}</Badge></TableCell>
                    <TableCell>{db.size}</TableCell>
                    <TableCell>{db.tables}</TableCell>
                    <TableCell>{db.connections}</TableCell>
                    <TableCell><Badge variant="default" className="bg-green-500">{db.status}</Badge></TableCell>
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
