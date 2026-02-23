/**
 * ============================================================================
 * 因果图 — 独立页面
 * ============================================================================
 * 复用 CausalGraphView 组件，提供独立路由入口
 * 后端路由: evoCognition.getSnapshot (causal graph data)
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { CausalGraphView } from '@/components/cognitive/CausalGraphView';

export default function CausalGraphPage() {
  return (
    <MainLayout title="因果图" subtitle="因果关系图谱可视化与路径追溯">
      <CausalGraphView />
    </MainLayout>
  );
}
