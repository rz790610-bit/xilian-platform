/**
 * ER 关系图独立页面
 * 路由: /settings/design/er-diagram
 */
import { lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';

const ERDiagram = lazy(() => import('@/components/designer/ERDiagram'));

export default function ERDiagramPage() {
  return (
    <MainLayout title="ER 关系图">
      <div className="h-[calc(100vh-64px)]">
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载 ER 图...</div>}>
          <ERDiagram />
        </Suspense>
      </div>
    </MainLayout>
  );
}
