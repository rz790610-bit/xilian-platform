/**
 * 可视化设计器独立页面
 * 路由: /settings/design/visual-designer
 */
import { lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';

const VisualDesigner = lazy(() => import('@/components/designer/VisualDesigner'));

export default function VisualDesignerPage() {
  return (
    <MainLayout title="可视化设计器">
      <div className="h-[calc(100vh-64px)]">
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载可视化设计器...</div>}>
          <VisualDesigner />
        </Suspense>
      </div>
    </MainLayout>
  );
}
