/**
 * 数字孪生 — 世界模型页面
 *
 * Phase 3 增强：
 *   ✅ KaTeX 方程渲染（替代纯文本 formula 展示）
 *   ✅ P5-P95 带状置信区间图（Line + Filler）
 *   ✅ OTel 指标面板
 *   ✅ Grok 工具列表
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { stateLabels } from './constants';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Filler, Title, Tooltip, Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import katex from 'katex';
import 'katex/dist/katex.min.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Title, Tooltip, Legend);

// ============================================================================
// KaTeX 方程渲染组件
// ============================================================================

function KaTeXEquation({ formula, displayMode = false }: { formula: string; displayMode?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(formula, ref.current, {
        displayMode,
        throwOnError: false,
        trust: true,
        strict: false,
        macros: {
          '\\RR': '\\mathbb{R}',
          '\\NN': '\\mathbb{N}',
        },
      });
    } catch {
      // 降级为纯文本
      if (ref.current) ref.current.textContent = formula;
    }
  }, [formula, displayMode]);

  return <div ref={ref} className="overflow-x-auto" />;
}

// ============================================================================
// P5-P95 带状置信区间图
// ============================================================================

function ConfidenceBandChart({ prediction }: { prediction: any }) {
  const dimensions = useMemo(() => {
    if (!prediction?.basePrediction?.trajectory) return [];
    const first = prediction.basePrediction.trajectory[0]?.values;
    return first ? Object.keys(first) : [];
  }, [prediction]);

  const [selectedDim, setSelectedDim] = useState<string>('');

  useEffect(() => {
    if (dimensions.length > 0 && !selectedDim) {
      setSelectedDim(dimensions[0]);
    }
  }, [dimensions, selectedDim]);

  if (!prediction?.uncertainty || !prediction?.basePrediction?.trajectory || dimensions.length === 0) {
    return null;
  }

  const trajectory = prediction.basePrediction.trajectory;
  const labels = trajectory.map((_: any, i: number) => `T+${i}`);

  // 提取 P5/P50/P95 轨迹
  const p5Data = prediction.uncertainty.p5Trajectory?.map((v: Record<string, number>) => v[selectedDim] ?? 0) ?? [];
  const p50Data = prediction.uncertainty.p50Trajectory?.map((v: Record<string, number>) => v[selectedDim] ?? 0) ?? [];
  const p95Data = prediction.uncertainty.p95Trajectory?.map((v: Record<string, number>) => v[selectedDim] ?? 0) ?? [];
  const meanData = prediction.uncertainty.meanTrajectory?.map((v: Record<string, number>) => v[selectedDim] ?? 0) ?? [];
  const baseData = trajectory.map((t: any) => t.values[selectedDim] ?? 0);

  return (
    <PageCard title="P5-P95 置信区间" icon={<span>📊</span>} compact
      action={
        <select
          className="text-[10px] bg-background border border-border rounded px-1 h-5"
          value={selectedDim}
          onChange={e => setSelectedDim(e.target.value)}
        >
          {dimensions.map(d => (
            <option key={d} value={d}>{stateLabels[d] ?? d}</option>
          ))}
        </select>
      }
    >
      <div style={{ height: '220px' }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'P95 上界',
                data: p95Data,
                borderColor: 'rgba(239, 68, 68, 0.4)',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                fill: '+1',
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [4, 2],
              },
              {
                label: 'P5 下界',
                data: p5Data,
                borderColor: 'rgba(59, 130, 246, 0.4)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1,
                borderDash: [4, 2],
              },
              {
                label: 'P50 中位数',
                data: p50Data,
                borderColor: 'rgba(168, 85, 247, 0.7)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1.5,
                borderDash: [2, 2],
              },
              {
                label: '均值',
                data: meanData,
                borderColor: 'rgba(34, 197, 94, 0.8)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
              },
              {
                label: '基线预测',
                data: baseData,
                borderColor: 'rgba(251, 191, 36, 0.9)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'top', labels: { font: { size: 9 }, usePointStyle: true, pointStyleWidth: 12 } },
              tooltip: { mode: 'index', intersect: false },
              title: {
                display: true,
                text: `${stateLabels[selectedDim] ?? selectedDim} — 蒙特卡洛不确定性量化 (${prediction.uncertainty.monteCarloRuns} runs, ${prediction.uncertainty.sequenceType})`,
                font: { size: 10 },
              },
            },
            scales: {
              x: { ticks: { maxTicksLimit: 10, font: { size: 8 } }, grid: { display: false } },
              y: { ticks: { font: { size: 8 } }, grid: { color: 'rgba(128,128,128,0.12)' } },
            },
          }}
        />
      </div>
    </PageCard>
  );
}

// ============================================================================
// 主页面
// ============================================================================

export default function WorldModelPage({ equipmentId }: { equipmentId: string }) {
  const [predictHorizon, setPredictHorizon] = useState(60);
  const [includeUncertainty, setIncludeUncertainty] = useState(true);
  const [monteCarloRuns, setMonteCarloRuns] = useState(100);

  const configQuery = trpc.evoPipeline.worldmodel.getConfig.useQuery({ equipmentId }, { retry: 2 });
  const equationsQuery = trpc.evoPipeline.worldmodel.getEquations.useQuery({ equipmentId }, { retry: 2 });
  const metricsQuery = trpc.evoPipeline.metricsSummary.useQuery(undefined, { retry: 1, refetchInterval: 30000 });
  const grokToolsQuery = trpc.evoPipeline.grokTools.useQuery(undefined, { retry: 1 });

  const predictMutation = trpc.evoPipeline.worldmodel.predict.useMutation({
    onSuccess: () => toast.success('预测完成'),
    onError: (e: any) => toast.error(`预测失败: ${e.message}`),
  });

  const config = configQuery.data as any;
  const equations: any[] = equationsQuery.data ?? [];
  const prediction = predictMutation.data as any;
  const metricsSummary = metricsQuery.data as any;
  const grokTools: any[] = grokToolsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* 左侧：配置 + 物理方程（KaTeX） */}
        <div className="space-y-2">
          <PageCard title="世界模型配置" icon={<span>⚙️</span>} compact>
            {config ? (
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">设备类型</span><span className="font-mono">{config.equipmentType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">制造商</span><span>{config.manufacturer}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">型号</span><span>{config.model}</span></div>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registry 状态</span>
                  <Badge variant={config.registryStatus?.registered ? 'default' : 'secondary'} className="text-[8px]">
                    {config.registryStatus?.registered ? '已注册' : '未注册'}
                  </Badge>
                </div>
                {config.registryStatus?.registered && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">同步模式</span><span className="font-mono">{config.registryStatus.syncMode}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">状态维度</span><span>{config.registryStatus.stateVectorDimensions}</span></div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{configQuery.isLoading ? '加载中...' : '无配置数据'}</p>
            )}
          </PageCard>

          {/* 物理方程 — KaTeX 渲染 */}
          <PageCard title={`物理方程 (${equations.length})`} icon={<span>📐</span>} compact>
            {equations.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{equationsQuery.isLoading ? '加载中...' : '无物理方程数据'}</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {equations.map((eq: any) => (
                  <div key={eq.id} className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Badge variant="outline" className="text-[8px]">{eq.category}</Badge>
                      <span className="text-[10px] font-medium">{eq.name}</span>
                    </div>
                    {/* KaTeX 方程渲染 */}
                    <div className="bg-muted/50 rounded px-2 py-1.5">
                      <KaTeXEquation formula={eq.latexFormula ?? eq.formula} displayMode />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {eq.source && <span className="text-[8px] text-muted-foreground">来源: {eq.source}</span>}
                      {eq.dimensions && (
                        <div className="flex gap-0.5">
                          {(eq.dimensions as string[]).map((d: string) => (
                            <Badge key={d} variant="outline" className="text-[7px] px-1">{stateLabels[d] ?? d}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageCard>

          {/* OTel 指标摘要 */}
          <PageCard title="OTel 指标" icon={<span>📡</span>} compact>
            {metricsSummary ? (
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">已注册指标</span>
                  <Badge variant="default" className="text-[8px]">{metricsSummary.totalMetrics} / 13</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Histograms</span>
                  <span className="font-mono">{metricsSummary.histograms?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Counters</span>
                  <span className="font-mono">{metricsSummary.counters?.length ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gauges</span>
                  <span className="font-mono">{metricsSummary.gauges?.length ?? 0}</span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground py-2 text-center">加载中...</p>
            )}
          </PageCard>

          {/* Grok 工具列表 */}
          <PageCard title={`Grok 工具 (${grokTools.length})`} icon={<span>🔧</span>} compact>
            {grokTools.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">无已注册工具</p>
            ) : (
              <div className="space-y-1">
                {grokTools.map((tool: any) => (
                  <div key={tool.name} className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[8px]">{tool.loopStage}</Badge>
                      <span className="text-[10px] font-medium font-mono">{tool.name}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{tool.description}</p>
                    <div className="flex gap-1 mt-0.5">
                      {tool.permissions?.requiredRoles?.map((r: string) => (
                        <Badge key={r} variant="secondary" className="text-[7px] px-1">{r}</Badge>
                      ))}
                      <Badge variant="outline" className="text-[7px] px-1">
                        {tool.permissions?.maxCallsPerMinute}/min
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PageCard>
        </div>

        {/* 右侧：预测控制 + 结果 */}
        <div className="space-y-2">
          <PageCard title="预测控制" icon={<span>🔮</span>} compact>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-20">预测时长</Label>
                <Slider value={[predictHorizon]} onValueChange={([v]) => setPredictHorizon(v)} min={5} max={1440} step={5} className="flex-1" />
                <span className="text-[10px] font-mono w-16 text-right">{predictHorizon} min</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground w-20">不确定性</Label>
                <Switch checked={includeUncertainty} onCheckedChange={setIncludeUncertainty} />
                <span className="text-[10px] text-muted-foreground">{includeUncertainty ? '启用蒙特卡洛' : '关闭'}</span>
              </div>
              {includeUncertainty && (
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground w-20">采样次数</Label>
                  <Input className="h-6 text-xs w-20" type="number" value={monteCarloRuns} onChange={e => setMonteCarloRuns(Number(e.target.value))} min={10} max={500} />
                </div>
              )}
              <Button size="sm" className="h-7 text-xs w-full"
                onClick={() => predictMutation.mutate({ equipmentId, horizonMinutes: predictHorizon, includeUncertainty, monteCarloRuns })}
                disabled={predictMutation.isPending}
              >
                {predictMutation.isPending ? '预测中...' : '执行预测'}
              </Button>
            </div>
          </PageCard>

          {/* 预测结果 */}
          {prediction && (
            <PageCard title="预测结果" icon={<span>📊</span>} compact>
              <div className="space-y-1.5">
                <div className="text-[10px]">
                  <span className="text-muted-foreground">预测时长: </span><span className="font-mono">{prediction.horizonMinutes} min</span>
                  <span className="text-muted-foreground ml-2">耗时: </span><span className="font-mono">{prediction.durationMs} ms</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[9px] py-0.5">维度</TableHead>
                      <TableHead className="text-[9px] py-0.5">预测值</TableHead>
                      {prediction.uncertainty && (
                        <>
                          <TableHead className="text-[9px] py-0.5">P5</TableHead>
                          <TableHead className="text-[9px] py-0.5">P95</TableHead>
                          <TableHead className="text-[9px] py-0.5">σ</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(prediction.basePrediction?.trajectory?.[prediction.basePrediction.trajectory.length - 1]?.values ?? {}).map(([key, value]) => {
                      const lastP5 = prediction.uncertainty?.p5Trajectory?.[prediction.uncertainty.p5Trajectory.length - 1];
                      const lastP95 = prediction.uncertainty?.p95Trajectory?.[prediction.uncertainty.p95Trajectory.length - 1];
                      const stdDev = prediction.uncertainty?.stdDevByDimension?.[key];
                      const lastStd = Array.isArray(stdDev) ? stdDev[stdDev.length - 1] : stdDev;
                      return (
                        <TableRow key={key}>
                          <TableCell className="text-[9px] py-0.5">{stateLabels[key] ?? key}</TableCell>
                          <TableCell className="text-[9px] py-0.5 font-mono">{(value as number).toFixed(4)}</TableCell>
                          {prediction.uncertainty && (
                            <>
                              <TableCell className="text-[9px] py-0.5 font-mono text-blue-500">{lastP5?.[key]?.toFixed(4) ?? '--'}</TableCell>
                              <TableCell className="text-[9px] py-0.5 font-mono text-red-500">{lastP95?.[key]?.toFixed(4) ?? '--'}</TableCell>
                              <TableCell className="text-[9px] py-0.5 font-mono">{lastStd?.toFixed(4) ?? '--'}</TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* RUL */}
                {prediction.rul && (
                  <div className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground">RUL:</span>
                      <span className="font-bold text-sm">{prediction.rul.estimatedDays}</span>
                      <span className="text-muted-foreground">天</span>
                      <Badge variant="outline" className="text-[8px]">±{prediction.rul.confidenceIntervalDays}天</Badge>
                    </div>
                  </div>
                )}

                {/* 物理校验 */}
                {prediction.physicsValidation && (
                  <div className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-muted-foreground">物理校验:</span>
                      <Badge variant={prediction.physicsValidation.isValid ? 'default' : 'destructive'} className="text-[8px]">
                        {prediction.physicsValidation.isValid ? '通过' : `${prediction.physicsValidation.violations?.length ?? 0} 个违规`}
                      </Badge>
                      <span className="text-muted-foreground ml-1">置信度: {((prediction.physicsValidation.confidence ?? 0) * 100).toFixed(0)}%</span>
                    </div>
                    {prediction.physicsValidation.violations && prediction.physicsValidation.violations.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {prediction.physicsValidation.violations.map((v: any, i: number) => (
                          <div key={i} className="text-[9px] text-destructive">• [{v.type}] {v.message}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* AI 解释 */}
                {prediction.aiExplanation && (
                  <div className="border border-border rounded p-1.5">
                    <div className="text-[10px] font-medium mb-0.5 flex items-center gap-1">
                      🤖 AI 分析 <Badge variant="outline" className="text-[8px]">Grok</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{prediction.aiExplanation}</p>
                  </div>
                )}
              </div>
            </PageCard>
          )}

          {/* P5-P95 带状置信区间图 */}
          {prediction?.uncertainty && (
            <ConfidenceBandChart prediction={prediction} />
          )}
        </div>
      </div>
    </div>
  );
}
