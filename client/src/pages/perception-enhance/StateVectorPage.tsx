/**
 * ============================================================================
 * 状态向量合成器 — 独立页面
 * ============================================================================
 * 复用 DimensionManagerContent 组件，提供独立路由入口
 * 后端路由: evoPerception.list(dimensions) / .load / .saveBatch / .toggleEnabled
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { DimensionManagerContent } from '@/pages/perception/DimensionManager';

export default function StateVectorPage() {
  return (
    <MainLayout title="状态向量合成器" subtitle="多维度状态向量编码与维度管理">
      <DimensionManagerContent />
    </MainLayout>
  );
}
