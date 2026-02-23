/**
 * ============================================================================
 * BPA 构建器 — 独立页面
 * ============================================================================
 * 复用 BPAConfigContent 组件，提供独立路由入口
 * 后端路由: evoPerception.list / .load / .save / .toggleEnabled / .seedDefaults
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { BPAConfigContent } from '@/pages/perception/BPAConfigManager';

export default function BPABuilderPage() {
  return (
    <MainLayout title="BPA 构建器" subtitle="基本概率分配构建与管理">
      <BPAConfigContent />
    </MainLayout>
  );
}
