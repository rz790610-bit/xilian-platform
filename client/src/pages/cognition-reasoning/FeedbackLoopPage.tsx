/**
 * ============================================================================
 * 知识反馈环 — 独立页面
 * ============================================================================
 * 复用 FeedbackMonitorView 组件，提供独立路由入口
 * 后端路由: evoCognition.getDashboardMetrics (feedback loop data)
 */
import { MainLayout } from '@/components/layout/MainLayout';
import { FeedbackMonitorView } from '@/components/cognitive/FeedbackMonitorView';

export default function FeedbackLoopPage() {
  return (
    <MainLayout title="知识反馈环" subtitle="推理反馈收集与知识修订闭环">
      <FeedbackMonitorView />
    </MainLayout>
  );
}
