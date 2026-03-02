/**
 * P2-9 技术情报页面 — TechIntelligencePage
 *
 * 功能：
 * 1. 最新发现 — 触发扫描 + 发现列表 + 算法候选
 * 2. 差距分析 — 生成差距报告 + 路线图
 * 3. 主题搜索 — 输入关键词搜索技术文档
 * 4. 扫描历史 — 历史扫描记录
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  Search, Loader2, Radar, TrendingUp, FileText, Clock,
  AlertTriangle, ChevronRight, ExternalLink, Layers, BarChart3,
  Cpu, Zap, Target, BookOpen,
} from 'lucide-react';

// ==================== 常量 ====================

const SOURCE_LABELS: Record<string, string> = {
  arxiv: 'arXiv', ieee: 'IEEE', standard: '标准', patent: '专利', industry_report: '行业报告',
};

const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'text-green-400' },
  medium: { label: '中', color: 'text-yellow-400' },
  high: { label: '高', color: 'text-orange-400' },
  very_high: { label: '极高', color: 'text-red-400' },
};

const COMPLEXITY_COLORS: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-red-500/20 text-red-400',
};

// ==================== 主组件 ====================

export default function TechIntelligencePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [gapFocusAreas, setGapFocusAreas] = useState('');

  // tRPC queries
  const scanHistoryQuery = trpc.ai.intelligence.getScanHistory.useQuery();
  const algorithmSuggestQuery = trpc.ai.intelligence.suggestAlgorithms.useQuery();

  // tRPC mutations
  const runScanMutation = trpc.ai.intelligence.runScan.useMutation({
    onSuccess: () => {
      toast({ title: '扫描完成', description: '新的技术发现已更新', variant: 'success' });
      scanHistoryQuery.refetch();
      algorithmSuggestQuery.refetch();
    },
    onError: (err) => toast({ title: '扫描失败', description: err.message, variant: 'destructive' }),
  });

  const searchTopicMutation = trpc.ai.intelligence.searchTopic.useMutation({
    onSuccess: () => toast({ title: '搜索完成', variant: 'success' }),
    onError: (err) => toast({ title: '搜索失败', description: err.message, variant: 'destructive' }),
  });

  const gapReportMutation = trpc.ai.intelligence.generateGapReport.useMutation({
    onSuccess: () => toast({ title: '差距报告生成完成', variant: 'success' }),
    onError: (err) => toast({ title: '报告生成失败', description: err.message, variant: 'destructive' }),
  });

  // 派生数据
  const latestScan = scanHistoryQuery.data?.[scanHistoryQuery.data.length - 1];
  const allFindings = latestScan?.findings ?? [];
  const algorithms = algorithmSuggestQuery.data ?? [];

  return (
    <MainLayout title="AI 技术情报">
      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="累计扫描"
          value={`${scanHistoryQuery.data?.length ?? 0} 次`}
          icon={<Radar className="w-5 h-5" />}
        />
        <StatCard
          label="最新发现"
          value={`${allFindings.length} 项`}
          icon={<FileText className="w-5 h-5" />}
        />
        <StatCard
          label="算法候选"
          value={`${algorithms.length} 个`}
          icon={<Cpu className="w-5 h-5" />}
        />
        <StatCard
          label="差距报告"
          value={gapReportMutation.data ? '已生成' : '未生成'}
          icon={<BarChart3 className="w-5 h-5" />}
        />
      </div>

      <Tabs defaultValue="findings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="findings">最新发现</TabsTrigger>
          <TabsTrigger value="gap">差距分析</TabsTrigger>
          <TabsTrigger value="search">主题搜索</TabsTrigger>
          <TabsTrigger value="history">扫描历史</TabsTrigger>
        </TabsList>

        {/* ━━━ Tab1: 最新发现 ━━━ */}
        <TabsContent value="findings">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => runScanMutation.mutate()} disabled={runScanMutation.isPending}>
                {runScanMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />扫描中...</>
                ) : (
                  <><Radar className="w-4 h-4 mr-2" />触发扫描</>
                )}
              </Button>
            </div>

            {/* 发现列表 */}
            {allFindings.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {allFindings.map((f: any) => (
                  <PageCard key={f.findingId} title={f.title}>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{SOURCE_LABELS[f.source] ?? f.source}</Badge>
                        <span className="text-xs text-zinc-400">相关度 {(f.relevanceScore * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-sm text-zinc-300">{f.summary}</p>
                      {f.techniques?.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs text-zinc-400">提取的技术:</span>
                          {f.techniques.map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-zinc-800/50">
                              <Zap className="w-3 h-3 text-yellow-400 shrink-0" />
                              <span className="font-medium">{t.name}</span>
                              <span className="text-zinc-500">{t.category}</span>
                              {t.noveltyScore > 0.7 && <Badge className="text-[10px] bg-purple-500/20 text-purple-400">新颖</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                      {f.applicableEquipment?.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {f.applicableEquipment.map((eq: string) => (
                            <Badge key={eq} variant="outline" className="text-[10px]">{eq}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </PageCard>
                ))}
              </div>
            ) : (
              <PageCard title="暂无发现">
                <p className="text-zinc-500 text-center py-8">点击"触发扫描"开始搜索最新技术动态</p>
              </PageCard>
            )}

            {/* 算法候选 */}
            {algorithms.length > 0 && (
              <PageCard title={`算法候选推荐 (${algorithms.length})`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-700 text-zinc-400">
                        <th className="text-left py-2 px-3">算法名称</th>
                        <th className="text-left py-2 px-3">来源差距</th>
                        <th className="text-center py-2 px-3">预期改善</th>
                        <th className="text-center py-2 px-3">复杂度</th>
                        <th className="text-center py-2 px-3">预估工时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {algorithms.map((a: any, i: number) => (
                        <tr key={i} className="border-b border-zinc-800">
                          <td className="py-2 px-3 font-medium">{a.name}</td>
                          <td className="py-2 px-3 text-zinc-400">{a.sourceGap}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-green-400">+{(a.expectedImprovement * 100).toFixed(0)}%</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge className={cn('text-xs', COMPLEXITY_COLORS[a.complexity])}>
                              {a.complexity}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-center text-zinc-400">{a.estimatedEffortDays}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PageCard>
            )}
          </div>
        </TabsContent>

        {/* ━━━ Tab2: 差距分析 ━━━ */}
        <TabsContent value="gap">
          <div className="space-y-4">
            <PageCard title="生成差距报告">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <span className="text-sm text-zinc-400">聚焦领域（可选，逗号分隔）</span>
                  <Input
                    placeholder="如: 振动分析,轴承诊断,电气故障"
                    value={gapFocusAreas}
                    onChange={e => setGapFocusAreas(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => gapReportMutation.mutate({
                    focusAreas: gapFocusAreas ? gapFocusAreas.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                  })}
                  disabled={gapReportMutation.isPending}
                >
                  {gapReportMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                  ) : (
                    <><BarChart3 className="w-4 h-4 mr-2" />生成差距报告</>
                  )}
                </Button>
              </div>
            </PageCard>

            {gapReportMutation.data && (
              <>
                {/* 概述 */}
                <PageCard title="差距报告概述">
                  <p className="text-sm text-zinc-300 mb-3">{gapReportMutation.data.summary}</p>
                  <div className="flex gap-2 flex-wrap">
                    {gapReportMutation.data.focusAreas?.map((area: string) => (
                      <Badge key={area} variant="outline">{area}</Badge>
                    ))}
                  </div>
                </PageCard>

                {/* 差距表 */}
                {gapReportMutation.data.gaps?.length > 0 && (
                  <PageCard title={`技术差距 (${gapReportMutation.data.gaps.length})`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-700 text-zinc-400">
                            <th className="text-left py-2 px-3">当前能力</th>
                            <th className="text-center py-2 px-3">当前精度</th>
                            <th className="text-left py-2 px-3">最新技术</th>
                            <th className="text-center py-2 px-3">报告精度</th>
                            <th className="text-center py-2 px-3">差距</th>
                            <th className="text-center py-2 px-3">实施难度</th>
                            <th className="text-center py-2 px-3">优先分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gapReportMutation.data.gaps.map((g: any) => (
                            <tr key={g.gapId} className="border-b border-zinc-800">
                              <td className="py-2 px-3">{g.currentCapability.name}</td>
                              <td className="py-2 px-3 text-center font-mono">{(g.currentCapability.accuracy * 100).toFixed(0)}%</td>
                              <td className="py-2 px-3 text-blue-400">{g.stateOfArt.technique}</td>
                              <td className="py-2 px-3 text-center font-mono text-green-400">{(g.stateOfArt.reportedAccuracy * 100).toFixed(0)}%</td>
                              <td className="py-2 px-3 text-center font-mono text-orange-400">{(g.gapMagnitude * 100).toFixed(0)}%</td>
                              <td className="py-2 px-3 text-center">
                                <span className={EFFORT_LABELS[g.implementationEffort]?.color}>
                                  {EFFORT_LABELS[g.implementationEffort]?.label ?? g.implementationEffort}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center font-mono">{g.priorityScore?.toFixed(1) ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PageCard>
                )}

                {/* 路线图 */}
                {gapReportMutation.data.roadmap && (
                  <PageCard title="改进路线图">
                    <div className="space-y-4">
                      {gapReportMutation.data.roadmap.phases?.map((phase: any) => (
                        <div key={phase.phase} className="p-3 rounded-lg border border-zinc-700">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-blue-500/20 text-blue-400">Phase {phase.phase}</Badge>
                            <span className="font-medium text-sm">{phase.name}</span>
                            <span className="text-xs text-zinc-400 ml-auto">{phase.duration}</span>
                          </div>
                          {phase.candidates?.map((c: any, j: number) => (
                            <div key={j} className="flex items-center gap-2 text-xs ml-4 mt-1">
                              <ChevronRight className="w-3 h-3 text-zinc-500" />
                              <span>{c.name}</span>
                              <span className="text-green-400">+{(c.expectedImprovement * 100).toFixed(0)}%</span>
                              <span className="text-zinc-500">{c.estimatedEffortDays}d</span>
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="flex gap-4 text-sm text-zinc-400">
                        <span>总工时: {gapReportMutation.data.roadmap.totalEstimatedEffortDays}d</span>
                        <span>预期总改善: +{(gapReportMutation.data.roadmap.expectedOverallImprovement * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </PageCard>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ━━━ Tab3: 主题搜索 ━━━ */}
        <TabsContent value="search">
          <div className="space-y-4">
            <PageCard title="主题搜索">
              <div className="flex gap-4">
                <Input
                  placeholder="输入技术关键词，如: transformer bearing fault diagnosis"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchQuery.trim() && searchTopicMutation.mutate({ query: searchQuery.trim() })}
                  className="flex-1"
                />
                <Button
                  onClick={() => searchTopicMutation.mutate({ query: searchQuery.trim() })}
                  disabled={!searchQuery.trim() || searchTopicMutation.isPending}
                >
                  {searchTopicMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <><Search className="w-4 h-4 mr-2" />搜索</>
                  )}
                </Button>
              </div>
            </PageCard>

            {searchTopicMutation.data && (
              <>
                {/* 文档结果 */}
                {searchTopicMutation.data.documents?.length > 0 && (
                  <PageCard title={`相关文档 (${searchTopicMutation.data.documents.length})`}>
                    <div className="space-y-3">
                      {searchTopicMutation.data.documents.map((doc: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg border border-zinc-700">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{doc.title}</p>
                              {doc.authors?.length > 0 && (
                                <p className="text-xs text-zinc-400 mt-0.5">{doc.authors.join(', ')}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs">{SOURCE_LABELS[doc.sourceType] ?? doc.sourceType}</Badge>
                              <span className="text-xs text-zinc-400">{(doc.relevanceScore * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <p className="text-xs text-zinc-300 mt-2">{doc.summary}</p>
                          {doc.url && (
                            <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline mt-1 inline-flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />查看原文
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </PageCard>
                )}

                {/* 提取技术 */}
                {searchTopicMutation.data.techniques?.length > 0 && (
                  <PageCard title={`提取的技术 (${searchTopicMutation.data.techniques.length})`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-700 text-zinc-400">
                            <th className="text-left py-2 px-3">名称</th>
                            <th className="text-left py-2 px-3">分类</th>
                            <th className="text-left py-2 px-3">描述</th>
                            <th className="text-center py-2 px-3">报告精度</th>
                            <th className="text-center py-2 px-3">新颖度</th>
                          </tr>
                        </thead>
                        <tbody>
                          {searchTopicMutation.data.techniques.map((t: any, i: number) => (
                            <tr key={i} className="border-b border-zinc-800">
                              <td className="py-2 px-3 font-medium">{t.name}</td>
                              <td className="py-2 px-3 text-zinc-400">{t.category}</td>
                              <td className="py-2 px-3 text-xs text-zinc-400 max-w-xs truncate">{t.description}</td>
                              <td className="py-2 px-3 text-center font-mono">
                                {t.reportedAccuracy ? `${(t.reportedAccuracy * 100).toFixed(0)}%` : '-'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Progress value={t.noveltyScore * 100} className="h-1.5 w-16 mx-auto" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PageCard>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ━━━ Tab4: 扫描历史 ━━━ */}
        <TabsContent value="history">
          <PageCard title="扫描历史">
            {scanHistoryQuery.isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
              </div>
            ) : (scanHistoryQuery.data?.length ?? 0) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-700 text-zinc-400">
                      <th className="text-left py-2 px-3">报告 ID</th>
                      <th className="text-center py-2 px-3">扫描时间</th>
                      <th className="text-center py-2 px-3">来源数</th>
                      <th className="text-center py-2 px-3">文档总数</th>
                      <th className="text-center py-2 px-3">相关文档</th>
                      <th className="text-center py-2 px-3">发现数</th>
                      <th className="text-center py-2 px-3">算法候选</th>
                      <th className="text-center py-2 px-3">耗时</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(scanHistoryQuery.data ?? [])].reverse().map((r: any) => (
                      <tr key={r.reportId} className="border-b border-zinc-800">
                        <td className="py-2 px-3 font-mono text-xs">{r.reportId.slice(0, 8)}...</td>
                        <td className="py-2 px-3 text-center text-xs">{new Date(r.scanDate).toLocaleString()}</td>
                        <td className="py-2 px-3 text-center">{r.sourcesScanned}</td>
                        <td className="py-2 px-3 text-center">{r.documentsFound}</td>
                        <td className="py-2 px-3 text-center text-green-400">{r.relevantDocuments}</td>
                        <td className="py-2 px-3 text-center">{r.findings?.length ?? 0}</td>
                        <td className="py-2 px-3 text-center">{r.candidates?.length ?? 0}</td>
                        <td className="py-2 px-3 text-center text-xs text-zinc-400">{(r.durationMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-zinc-500 text-center py-8">暂无扫描记录，点击"触发扫描"开始</p>
            )}
          </PageCard>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
