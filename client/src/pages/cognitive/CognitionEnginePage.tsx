/**
 * 认知引擎 — 统一页面（8 个 Tab）
 * 使用 MainLayout 确保侧边栏正常显示
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReasoningEngineConfig from '@/components/cognitive/ReasoningEngineConfig';
import { CausalGraphView } from '@/components/cognitive/CausalGraphView';
import { ExperiencePoolView } from '@/components/cognitive/ExperiencePoolView';
import { ReasoningTraceView } from '@/components/cognitive/ReasoningTraceView';
import { FeedbackMonitorView } from '@/components/cognitive/FeedbackMonitorView';
import { PerceptionDashboardContent } from '@/pages/perception/PerceptionDashboard';
import { BPAConfigContent } from '@/pages/perception/BPAConfigManager';
import { DimensionManagerContent } from '@/pages/perception/DimensionManager';

const ENGINE_TABS = [
  { value: 'config',      label: '⚙️ 引擎配置' },
  { value: 'causal',      label: '🕸️ 因果图' },
  { value: 'experience',  label: '🧠 经验池' },
  { value: 'trace',       label: '🔍 推理追踪' },
  { value: 'feedback',    label: '🔄 反馈监控' },
  { value: 'perception',  label: '📡 感知增强' },
  { value: 'bpa',         label: '🎯 BPA 配置' },
  { value: 'dimension',   label: '📐 维度管理' },
] as const;

export default function CognitionEnginePage() {
  const [activeTab, setActiveTab] = useState<string>('config');

  return (
    <MainLayout title="认知引擎">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1">
          {ENGINE_TABS.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="config">
          <ReasoningEngineConfig />
        </TabsContent>

        <TabsContent value="causal">
          <CausalGraphView />
        </TabsContent>

        <TabsContent value="experience">
          <ExperiencePoolView />
        </TabsContent>

        <TabsContent value="trace">
          <ReasoningTraceView />
        </TabsContent>

        <TabsContent value="feedback">
          <FeedbackMonitorView />
        </TabsContent>

        <TabsContent value="perception">
          <PerceptionDashboardContent />
        </TabsContent>

        <TabsContent value="bpa">
          <BPAConfigContent />
        </TabsContent>

        <TabsContent value="dimension">
          <DimensionManagerContent />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
