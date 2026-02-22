/**
 * 认知引擎 — 独立子页面包装器
 * 每个子路由对应一个独立页面，从认知仪表盘独立出来
 */
import ReasoningEngineConfig from '@/components/cognitive/ReasoningEngineConfig';
import { CausalGraphView } from '@/components/cognitive/CausalGraphView';
import { ExperiencePoolView } from '@/components/cognitive/ExperiencePoolView';
import { ReasoningTraceView } from '@/components/cognitive/ReasoningTraceView';
import { FeedbackMonitorView } from '@/components/cognitive/FeedbackMonitorView';
import { PerceptionDashboardContent } from '@/pages/perception/PerceptionDashboard';
import { BPAConfigContent } from '@/pages/perception/BPAConfigManager';
import { DimensionManagerContent } from '@/pages/perception/DimensionManager';

function PageWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function EngineConfigPage() {
  return (
    <PageWrapper title="⚙️ 引擎配置">
      <ReasoningEngineConfig />
    </PageWrapper>
  );
}

export function CausalGraphPage() {
  return (
    <PageWrapper title="🕸️ 因果图">
      <CausalGraphView />
    </PageWrapper>
  );
}

export function ExperiencePoolPage() {
  return (
    <PageWrapper title="🧠 经验池">
      <ExperiencePoolView />
    </PageWrapper>
  );
}

export function ReasoningTracePage() {
  return (
    <PageWrapper title="🔍 推理追踪">
      <ReasoningTraceView />
    </PageWrapper>
  );
}

export function FeedbackMonitorPage() {
  return (
    <PageWrapper title="🔄 反馈监控">
      <FeedbackMonitorView />
    </PageWrapper>
  );
}

export function PerceptionEnhancePage() {
  return (
    <PageWrapper title="📡 感知增强">
      <PerceptionDashboardContent />
    </PageWrapper>
  );
}

export function BPAConfigPage() {
  return (
    <PageWrapper title="🎯 BPA 配置">
      <BPAConfigContent />
    </PageWrapper>
  );
}

export function DimensionManagePage() {
  return (
    <PageWrapper title="📐 维度管理">
      <DimensionManagerContent />
    </PageWrapper>
  );
}
