/**
 * 反馈中心 — 进化引擎
 * 
 * 功能：
 * 1. 反馈统计概览（总反馈、待处理、已采纳、采纳率）
 * 2. 反馈列表（按类型/状态/优先级过滤）
 * 3. 反馈详情弹窗（查看诊断上下文 + 处理反馈）
 * 4. 新建反馈（关联诊断记录）
 * 5. 反馈趋势分析
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  MessageSquarePlus, ThumbsUp, ThumbsDown, AlertTriangle, CheckCircle2,
  Clock, Filter, Search, ArrowUpRight, Tag, ChevronRight, Send,
  TrendingUp, BarChart3, XCircle, Eye
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

// ==================== 类型 ====================

interface FeedbackItem {
  id: string;
  type: 'correction' | 'suggestion' | 'false_positive' | 'false_negative' | 'label_error';
  status: 'pending' | 'reviewing' | 'accepted' | 'rejected' | 'implemented';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  diagnosisId?: string;
  deviceName?: string;
  algorithmName?: string;
  modelVersion?: string;
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  tags: string[];
  originalPrediction?: string;
  correctedLabel?: string;
  confidence?: number;
}

// ==================== Mock 数据 ====================

const mockFeedbacks: FeedbackItem[] = [
  {
    id: 'fb-001', type: 'false_positive', status: 'pending', priority: 'high',
    title: '轴承外圈故障误报',
    description: '振动分析器在设备 CNC-A03 上报了轴承外圈故障，但现场检查确认轴承状态良好。频谱中的 BPFO 特征峰可能是由齿轮啮合频率的谐波引起的混叠。',
    diagnosisId: 'diag-20260217-001', deviceName: 'CNC-A03 数控铣床',
    algorithmName: '振动频谱分析 v2.1', modelVersion: 'bearing-fault-v3.2',
    submittedBy: '张工', submittedAt: '2026-02-17T09:15:00Z',
    tags: ['轴承', '误报', '频谱混叠'],
    originalPrediction: '轴承外圈故障 (BPFO)', correctedLabel: '正常', confidence: 0.78,
  },
  {
    id: 'fb-002', type: 'false_negative', status: 'reviewing', priority: 'critical',
    title: '电机绝缘劣化漏检',
    description: '电机 MOT-B12 在例行巡检中发现绝缘电阻偏低，但异常检测模型未能捕获此异常。建议增加电气参数的多变量关联分析。',
    diagnosisId: 'diag-20260216-045', deviceName: 'MOT-B12 主驱动电机',
    algorithmName: '多模态异常检测 v3.0', modelVersion: 'anomaly-v4.1',
    submittedBy: '李工', submittedAt: '2026-02-16T16:30:00Z',
    reviewedBy: '王主任', reviewedAt: '2026-02-17T08:00:00Z',
    tags: ['电机', '漏检', '绝缘', '电气'],
    originalPrediction: '正常', correctedLabel: '绝缘劣化', confidence: 0.92,
  },
  {
    id: 'fb-003', type: 'correction', status: 'accepted', priority: 'medium',
    title: '齿轮箱故障类型修正',
    description: '模型将齿轮箱异常诊断为"齿面磨损"，但拆检后确认是"齿根裂纹"。两种故障的频谱特征相似，但齿根裂纹在低频段有更明显的调制边带。',
    diagnosisId: 'diag-20260215-023', deviceName: 'GB-C07 齿轮箱',
    algorithmName: '齿轮箱故障诊断 v1.8', modelVersion: 'gearbox-v2.5',
    submittedBy: '赵工', submittedAt: '2026-02-15T14:20:00Z',
    reviewedBy: '王主任', reviewedAt: '2026-02-16T09:30:00Z',
    tags: ['齿轮箱', '分类错误', '频谱'],
    originalPrediction: '齿面磨损', correctedLabel: '齿根裂纹', confidence: 0.65,
  },
  {
    id: 'fb-004', type: 'suggestion', status: 'implemented', priority: 'medium',
    title: '增加温度-振动联合特征',
    description: '建议在轴承故障诊断中增加温度和振动的联合特征。单独看振动频谱可能误判，但结合温度趋势可以显著提高诊断准确率。',
    deviceName: '全局',
    algorithmName: '振动频谱分析 v2.1',
    submittedBy: '陈博士', submittedAt: '2026-02-10T11:00:00Z',
    reviewedBy: '算法组', reviewedAt: '2026-02-12T15:00:00Z',
    tags: ['特征工程', '多模态', '温度'],
  },
  {
    id: 'fb-005', type: 'label_error', status: 'accepted', priority: 'high',
    title: '训练数据标签错误批次',
    description: '发现 2025-Q4 采集的 CNC 系列设备振动数据中，约 15 个样本的故障标签存在错误（将"不对中"标记为"不平衡"）。这批数据已用于 v3.2 模型训练。',
    algorithmName: '振动频谱分析 v2.1', modelVersion: 'bearing-fault-v3.2',
    submittedBy: '数据组', submittedAt: '2026-02-14T10:00:00Z',
    reviewedBy: '王主任', reviewedAt: '2026-02-14T16:00:00Z',
    tags: ['标签错误', '训练数据', '批量'],
  },
  {
    id: 'fb-006', type: 'false_positive', status: 'rejected', priority: 'low',
    title: '泵体振动告警（正常启停）',
    description: '泵 PMP-D01 在启动阶段触发了振动异常告警，但这是正常的启动瞬态过程。',
    diagnosisId: 'diag-20260217-012', deviceName: 'PMP-D01 冷却泵',
    algorithmName: '异常检测 v3.0',
    submittedBy: '周工', submittedAt: '2026-02-17T07:45:00Z',
    tags: ['泵', '启停', '瞬态'],
    originalPrediction: '振动异常', correctedLabel: '正常（启动瞬态）', confidence: 0.55,
  },
  {
    id: 'fb-007', type: 'correction', status: 'pending', priority: 'medium',
    title: '风机叶片故障严重度修正',
    description: '模型将风机叶片不平衡评估为"轻微"，但实际振幅已超过 ISO 10816 的 Zone C 阈值，应为"中等"。',
    diagnosisId: 'diag-20260216-089', deviceName: 'FAN-E03 引风机',
    algorithmName: '旋转机械诊断 v2.0', modelVersion: 'rotating-v1.8',
    submittedBy: '孙工', submittedAt: '2026-02-16T20:10:00Z',
    tags: ['风机', '严重度', 'ISO标准'],
    originalPrediction: '叶片不平衡(轻微)', correctedLabel: '叶片不平衡(中等)', confidence: 0.71,
  },
  {
    id: 'fb-008', type: 'suggestion', status: 'reviewing', priority: 'low',
    title: '增加季节性基线调整',
    description: '夏季环境温度升高导致设备运行温度整体偏高，建议异常检测模型增加季节性基线自动调整功能。',
    deviceName: '全局',
    algorithmName: '多模态异常检测 v3.0',
    submittedBy: '李工', submittedAt: '2026-02-13T09:00:00Z',
    tags: ['季节性', '基线', '温度补偿'],
  },
];

// ==================== 工具 ====================

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  correction: { label: '诊断修正', icon: <Tag className="w-3 h-3" />, color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  suggestion: { label: '改进建议', icon: <TrendingUp className="w-3 h-3" />, color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  false_positive: { label: '误报', icon: <XCircle className="w-3 h-3" />, color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  false_negative: { label: '漏检', icon: <AlertTriangle className="w-3 h-3" />, color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  label_error: { label: '标签错误', icon: <Tag className="w-3 h-3" />, color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30' },
  reviewing: { label: '审核中', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  accepted: { label: '已采纳', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rejected: { label: '已驳回', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  implemented: { label: '已实施', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'text-zinc-400' },
  medium: { label: '中', color: 'text-blue-400' },
  high: { label: '高', color: 'text-orange-400' },
  critical: { label: '紧急', color: 'text-red-400' },
};

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==================== 主组件 ====================

export default function FeedbackCenter() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('list');

  // 统计
  const stats = useMemo(() => {
    const total = mockFeedbacks.length;
    const pending = mockFeedbacks.filter(f => f.status === 'pending').length;
    const accepted = mockFeedbacks.filter(f => f.status === 'accepted' || f.status === 'implemented').length;
    const rate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    return { total, pending, accepted, rate };
  }, []);

  // 过滤
  const filtered = useMemo(() => {
    let list = mockFeedbacks;
    if (search) list = list.filter(f => f.title.includes(search) || f.description.includes(search) || f.tags.some(t => t.includes(search)));
    if (filterType !== 'all') list = list.filter(f => f.type === filterType);
    if (filterStatus !== 'all') list = list.filter(f => f.status === filterStatus);
    if (filterPriority !== 'all') list = list.filter(f => f.priority === filterPriority);
    return list;
  }, [search, filterType, filterStatus, filterPriority]);

  // 按类型统计
  const typeStats = useMemo(() => {
    const map: Record<string, number> = {};
    mockFeedbacks.forEach(f => { map[f.type] = (map[f.type] || 0) + 1; });
    return map;
  }, []);

  return (
    <MainLayout title="反馈中心">
      <div className="animate-fade-up">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold mb-1">📥 反馈中心</h2>
            <p className="text-xs text-muted-foreground">收集诊断结果反馈，驱动模型持续进化</p>
          </div>
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowNewDialog(true)}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            新建反馈
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <StatCard value={stats.total} label="总反馈" icon="📥" />
          <StatCard value={stats.pending} label="待处理" icon="⏳" />
          <StatCard value={stats.accepted} label="已采纳" icon="✅" />
          <StatCard value={`${stats.rate}%`} label="采纳率" icon="📊" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="list" className="text-xs gap-1"><Filter className="w-3 h-3" /> 反馈列表</TabsTrigger>
            <TabsTrigger value="analysis" className="text-xs gap-1"><BarChart3 className="w-3 h-3" /> 趋势分析</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            {/* 过滤栏 */}
            <PageCard className="mb-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索反馈..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    {Object.entries(typeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="优先级" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部优先级</SelectItem>
                    {Object.entries(priorityConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PageCard>

            {/* 反馈列表 */}
            <div className="space-y-2">
              {filtered.map(fb => (
                <PageCard
                  key={fb.id}
                  className="cursor-pointer hover:border-primary/30 transition-all"
                  onClick={() => setSelectedFeedback(fb)}
                >
                  <div className="flex items-start gap-3">
                    {/* 优先级指示器 */}
                    <div className={cn(
                      "w-1 self-stretch rounded-full shrink-0",
                      fb.priority === 'critical' ? 'bg-red-500' :
                      fb.priority === 'high' ? 'bg-orange-500' :
                      fb.priority === 'medium' ? 'bg-blue-500' : 'bg-zinc-600'
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-[10px] gap-1", typeConfig[fb.type]?.color)}>
                          {typeConfig[fb.type]?.icon}
                          {typeConfig[fb.type]?.label}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px]", statusConfig[fb.status]?.color)}>
                          {statusConfig[fb.status]?.label}
                        </Badge>
                        <span className={cn("text-[10px] font-medium", priorityConfig[fb.priority]?.color)}>
                          P:{priorityConfig[fb.priority]?.label}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-foreground mb-1">{fb.title}</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">{fb.description}</p>

                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        {fb.deviceName && <span>🔧 {fb.deviceName}</span>}
                        {fb.algorithmName && <span>⚙️ {fb.algorithmName}</span>}
                        <span>👤 {fb.submittedBy}</span>
                        <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{formatTime(fb.submittedAt)}</span>
                      </div>

                      {/* 预测修正对比 */}
                      {fb.originalPrediction && fb.correctedLabel && (
                        <div className="flex items-center gap-2 mt-2 p-1.5 bg-secondary/50 rounded text-[10px]">
                          <span className="text-red-400 line-through">{fb.originalPrediction}</span>
                          <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
                          <span className="text-emerald-400 font-medium">{fb.correctedLabel}</span>
                          {fb.confidence && (
                            <span className="text-muted-foreground ml-auto">置信度: {(fb.confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      )}

                      {/* 标签 */}
                      {fb.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {fb.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-secondary rounded text-[10px] text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </PageCard>
              ))}

              {filtered.length === 0 && (
                <PageCard>
                  <div className="text-center py-8 text-muted-foreground text-xs">
                    暂无匹配的反馈记录
                  </div>
                </PageCard>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analysis">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* 按类型分布 */}
              <PageCard title="按类型分布" icon="📊">
                <div className="space-y-2">
                  {Object.entries(typeConfig).map(([key, cfg]) => {
                    const count = typeStats[key] || 0;
                    const pct = mockFeedbacks.length > 0 ? (count / mockFeedbacks.length) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] gap-1 w-20 justify-center", cfg.color)}>
                          {cfg.icon}{cfg.label}
                        </Badge>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </PageCard>

              {/* 按状态分布 */}
              <PageCard title="按状态分布" icon="📈">
                <div className="space-y-2">
                  {Object.entries(statusConfig).map(([key, cfg]) => {
                    const count = mockFeedbacks.filter(f => f.status === key).length;
                    const pct = mockFeedbacks.length > 0 ? (count / mockFeedbacks.length) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] w-16 justify-center", cfg.color)}>
                          {cfg.label}
                        </Badge>
                        <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </PageCard>

              {/* 高影响反馈 */}
              <PageCard title="高影响反馈" icon="🔥" className="md:col-span-2">
                <div className="space-y-2">
                  {mockFeedbacks
                    .filter(f => f.priority === 'critical' || f.priority === 'high')
                    .map(fb => (
                      <div
                        key={fb.id}
                        className="flex items-center gap-3 p-2 bg-secondary/30 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => { setSelectedFeedback(fb); setActiveTab('list'); }}
                      >
                        <span className={cn("text-[10px] font-bold", priorityConfig[fb.priority]?.color)}>
                          {fb.priority === 'critical' ? '🔴' : '🟠'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{fb.title}</div>
                          <div className="text-[10px] text-muted-foreground">{fb.deviceName || '全局'} · {fb.submittedBy}</div>
                        </div>
                        <Badge variant="outline" className={cn("text-[10px]", statusConfig[fb.status]?.color)}>
                          {statusConfig[fb.status]?.label}
                        </Badge>
                      </div>
                    ))}
                </div>
              </PageCard>

              {/* 模型影响评估 */}
              <PageCard title="受影响模型" icon="🧠" className="md:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">模型版本</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">反馈数</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">误报</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">漏检</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">修正</th>
                        <th className="text-center py-1.5 px-2 text-muted-foreground font-medium">建议重训</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { model: 'bearing-fault-v3.2', total: 3, fp: 1, fn: 0, corr: 1, retrain: true },
                        { model: 'anomaly-v4.1', total: 2, fp: 0, fn: 1, corr: 0, retrain: true },
                        { model: 'gearbox-v2.5', total: 1, fp: 0, fn: 0, corr: 1, retrain: false },
                        { model: 'rotating-v1.8', total: 1, fp: 0, fn: 0, corr: 1, retrain: false },
                      ].map(row => (
                        <tr key={row.model} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="py-1.5 px-2 font-mono text-foreground">{row.model}</td>
                          <td className="text-center py-1.5 px-2">{row.total}</td>
                          <td className="text-center py-1.5 px-2 text-amber-400">{row.fp}</td>
                          <td className="text-center py-1.5 px-2 text-red-400">{row.fn}</td>
                          <td className="text-center py-1.5 px-2 text-blue-400">{row.corr}</td>
                          <td className="text-center py-1.5 px-2">
                            {row.retrain ? (
                              <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-400 border-orange-500/30">建议</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            </div>
          </TabsContent>
        </Tabs>

        {/* 反馈详情弹窗 */}
        <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4" />
                反馈详情
              </DialogTitle>
            </DialogHeader>
            {selectedFeedback && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px] gap-1", typeConfig[selectedFeedback.type]?.color)}>
                    {typeConfig[selectedFeedback.type]?.icon}
                    {typeConfig[selectedFeedback.type]?.label}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[10px]", statusConfig[selectedFeedback.status]?.color)}>
                    {statusConfig[selectedFeedback.status]?.label}
                  </Badge>
                  <span className={cn("text-[10px] font-medium", priorityConfig[selectedFeedback.priority]?.color)}>
                    优先级: {priorityConfig[selectedFeedback.priority]?.label}
                  </span>
                </div>

                <h3 className="text-sm font-semibold">{selectedFeedback.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{selectedFeedback.description}</p>

                {/* 诊断上下文 */}
                <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5 text-[11px]">
                  <div className="text-xs font-semibold text-foreground mb-2">诊断上下文</div>
                  {selectedFeedback.diagnosisId && (
                    <div className="flex justify-between"><span className="text-muted-foreground">诊断ID</span><span className="font-mono">{selectedFeedback.diagnosisId}</span></div>
                  )}
                  {selectedFeedback.deviceName && (
                    <div className="flex justify-between"><span className="text-muted-foreground">设备</span><span>{selectedFeedback.deviceName}</span></div>
                  )}
                  {selectedFeedback.algorithmName && (
                    <div className="flex justify-between"><span className="text-muted-foreground">算法</span><span>{selectedFeedback.algorithmName}</span></div>
                  )}
                  {selectedFeedback.modelVersion && (
                    <div className="flex justify-between"><span className="text-muted-foreground">模型版本</span><span className="font-mono">{selectedFeedback.modelVersion}</span></div>
                  )}
                </div>

                {/* 预测修正 */}
                {selectedFeedback.originalPrediction && (
                  <div className="bg-secondary/50 rounded-lg p-3 text-[11px]">
                    <div className="text-xs font-semibold text-foreground mb-2">预测修正</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 text-center p-2 bg-red-500/10 rounded border border-red-500/20">
                        <div className="text-[10px] text-muted-foreground mb-0.5">原始预测</div>
                        <div className="text-red-400 font-medium">{selectedFeedback.originalPrediction}</div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-center p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
                        <div className="text-[10px] text-muted-foreground mb-0.5">修正标签</div>
                        <div className="text-emerald-400 font-medium">{selectedFeedback.correctedLabel}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 时间线 */}
                <div className="text-[11px] space-y-1 text-muted-foreground">
                  <div>提交: {selectedFeedback.submittedBy} · {formatTime(selectedFeedback.submittedAt)}</div>
                  {selectedFeedback.reviewedBy && (
                    <div>审核: {selectedFeedback.reviewedBy} · {formatTime(selectedFeedback.reviewedAt!)}</div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              {selectedFeedback?.status === 'pending' && (
                <>
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-emerald-400 border-emerald-500/30" onClick={() => { toast.success('反馈已采纳'); setSelectedFeedback(null); }}>
                    <ThumbsUp className="w-3 h-3" /> 采纳
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1 text-red-400 border-red-500/30" onClick={() => { toast.warning('反馈已驳回'); setSelectedFeedback(null); }}>
                    <ThumbsDown className="w-3 h-3" /> 驳回
                  </Button>
                </>
              )}
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setSelectedFeedback(null)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建反馈弹窗 */}
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <MessageSquarePlus className="w-4 h-4" />
                新建反馈
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">反馈类型</label>
                <Select defaultValue="correction">
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">优先级</label>
                <Select defaultValue="medium">
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityConfig).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">标题</label>
                <Input className="h-7 text-xs" placeholder="简要描述反馈内容..." />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">详细描述</label>
                <Textarea className="text-xs min-h-[80px]" placeholder="请详细描述问题现象、现场情况和修正建议..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">关联诊断ID</label>
                  <Input className="h-7 text-xs" placeholder="diag-..." />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">设备名称</label>
                  <Input className="h-7 text-xs" placeholder="设备名称..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">原始预测</label>
                  <Input className="h-7 text-xs" placeholder="模型原始预测..." />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">修正标签</label>
                  <Input className="h-7 text-xs" placeholder="正确标签..." />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">标签（逗号分隔）</label>
                <Input className="h-7 text-xs" placeholder="轴承, 误报, ..." />
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" variant="secondary" className="text-xs h-7" onClick={() => setShowNewDialog(false)}>取消</Button>
              <Button size="sm" className="text-xs h-7 gap-1" onClick={() => { toast.success('反馈已提交'); setShowNewDialog(false); }}>
                <Send className="w-3 h-3" /> 提交
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
