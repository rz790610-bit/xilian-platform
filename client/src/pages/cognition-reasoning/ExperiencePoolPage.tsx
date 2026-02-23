/**
 * ============================================================================
 * 经验池 — 独立页面
 * ============================================================================
 * 复用 ExperiencePoolView 组件，提供独立路由入口
 * 后端路由: evoCognition.getSnapshot (experience pool data)
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { ExperiencePoolView } from '@/components/cognitive/ExperiencePoolView';

export default function ExperiencePoolPage() {
  return (
    <MainLayout title="经验池" subtitle="推理经验积累与模式匹配">
      <ExperiencePoolView />
    </MainLayout>
  );
}
