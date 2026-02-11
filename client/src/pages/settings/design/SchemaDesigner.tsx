/**
 * Schema 设计器独立页面
 * 路由: /settings/design/database
 * 提供完整的 Schema Registry 浏览、搜索、DDL 导出功能
 */
import { useState, lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const SchemaTableManagement = lazy(() => import('@/components/designer/TableManagement'));
const SchemaDataBrowser = lazy(() => import('@/components/designer/DataBrowser'));
const SchemaSqlEditor = lazy(() => import('@/components/designer/SqlEditor'));
const SchemaStatusBar = lazy(() => import('@/components/designer/StatusBar'));
const ExportDDLDialog = lazy(() => import('@/components/designer/ExportDDLDialog'));

export default function SchemaDesigner() {
  const [ddlOpen, setDdlOpen] = useState(false);

  return (
    <MainLayout title="Schema 设计">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">V4 Schema Registry</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              完整的数据库 Schema 定义、浏览、搜索和 DDL 导出
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDdlOpen(true)}>
            <Download className="w-3 h-3 mr-1" />导出 DDL
          </Button>
          <Suspense fallback={null}>
            <ExportDDLDialog open={ddlOpen} onOpenChange={setDdlOpen} />
          </Suspense>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载 Schema 管理器...</div>}>
          <div className="space-y-4">
            <SchemaTableManagement />
            <div className="border-t border-border pt-4">
              <SchemaDataBrowser />
            </div>
            <div className="border-t border-border pt-4">
              <SchemaSqlEditor />
            </div>
            <SchemaStatusBar />
          </div>
        </Suspense>
      </div>
    </MainLayout>
  );
}
