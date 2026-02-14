/**
 * 数据库管理页面
 * 数据源: 待接入后端 API（数据库实例管理服务）
 * 当前状态: 优雅降级 — 显示空状态 + 连接提示
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, RefreshCw, Plus, PlugZap } from 'lucide-react';
import { toast } from 'sonner';

export default function DbManagement() {
  // ─── 数据状态（从后端获取，当前为空） ───
  const [databases] = useState<any[]>([]);

  const handleConnect = () => {
    toast.info('请在「系统设置 > 数据源」中配置数据库连接信息');
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">数据库管理</h1>
            <p className="text-muted-foreground">管理和监控所有数据库实例</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleConnect}>
              <Plus className="h-4 w-4 mr-2" />
              添加数据库
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新状态
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>数据库实例</CardTitle>
            <CardDescription>当前已注册的数据库连接</CardDescription>
          </CardHeader>
          <CardContent>
            {databases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无数据库实例</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  添加 MySQL、ClickHouse、Neo4j、Redis 等数据库连接后，实例状态将显示在此处。
                </p>
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  <PlugZap className="h-4 w-4 mr-1" />
                  配置数据库连接
                </Button>
              </div>
            ) : (
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
                  {databases.map((db: any) => (
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
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
