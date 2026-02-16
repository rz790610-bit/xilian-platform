import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { ArrowLeft, Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: string;
}

export default function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  const [, setLocation] = useLocation();

  return (
    <MainLayout title={title}>
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">{icon} {title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </div>

        <PageCard>
          <div className="text-center py-16">
            <Construction className="w-16 h-16 mx-auto mb-4 text-warning opacity-50" />
            <h3 className="text-xl font-semibold mb-2">功能开发中</h3>
            <p className="text-muted-foreground mb-6">
              该功能正在开发中，敬请期待...
            </p>
            <Button variant="secondary" onClick={() => setLocation('/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回首页
            </Button>
          </div>
        </PageCard>
      </div>
    </MainLayout>
  );
}

// 占位页面 — 仅保留尚无独立实现的功能
export function ModelFinetune() {
  return <PlaceholderPage title="模型微调" description="微调和定制化模型" icon="🔧" />;
}

export function ModelEval() {
  return <PlaceholderPage title="模型评估" description="评估模型性能" icon="📊" />;
}

export function DiagAnalysis() {
  return <PlaceholderPage title="诊断分析" description="智能故障诊断分析" icon="🔍" />;
}

export function DiagReport() {
  return <PlaceholderPage title="诊断报告" description="生成和管理诊断报告" icon="📝" />;
}

export function FeedbackCenter() {
  return <PlaceholderPage title="反馈中心" description="收集和管理用户反馈" icon="📥" />;
}

export function ActiveLearning() {
  return <PlaceholderPage title="主动学习" description="智能样本选择和标注" icon="🎯" />;
}

export function AutoTrain() {
  return <PlaceholderPage title="自动训练" description="自动化模型训练流程" icon="⚡" />;
}

export function EvolutionBoard() {
  return <PlaceholderPage title="进化看板" description="模型进化和性能追踪" icon="📊" />;
}
