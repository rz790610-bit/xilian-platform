/**
 * 数字孪生 — 世界模型页面
 */
import { useState } from 'react';
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
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function WorldModelPage({ equipmentId }: { equipmentId: string }) {
  const [predictHorizon, setPredictHorizon] = useState(60);
  const [includeUncertainty, setIncludeUncertainty] = useState(true);
  const [monteCarloRuns, setMonteCarloRuns] = useState(100);

  const configQuery = trpc.evoPipeline.worldmodel.getConfig.useQuery({ equipmentId }, { retry: 2 });
  const equationsQuery = trpc.evoPipeline.worldmodel.getEquations.useQuery({ equipmentId }, { retry: 2 });

  const predictMutation = trpc.evoPipeline.worldmodel.predict.useMutation({
    onSuccess: () => toast.success('预测完成'),
    onError: (e) => toast.error(`预测失败: ${e.message}`),
  });

  const config = configQuery.data as any;
  const equations: any[] = equationsQuery.data ?? [];
  const prediction = predictMutation.data as any;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* 左侧：配置 + 物理方程 */}
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

          <PageCard title={`物理方程 (${equations.length})`} icon={<span>📐</span>} compact>
            {equations.length === 0 ? (
              <p className="text-[10px] text-muted-foreground py-2 text-center">{equationsQuery.isLoading ? '加载中...' : '无物理方程数据'}</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {equations.map((eq: any) => (
                  <div key={eq.id} className="border border-border rounded p-1.5">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Badge variant="outline" className="text-[8px]">{eq.category}</Badge>
                      <span className="text-[10px] font-medium">{eq.name}</span>
                    </div>
                    <div className="bg-muted/50 rounded px-1.5 py-0.5 font-mono text-[10px] text-foreground overflow-x-auto">
                      {eq.formula}
                    </div>
                    {eq.source && <span className="text-[8px] text-muted-foreground mt-0.5 block">来源: {eq.source}</span>}
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
                    {Object.entries(prediction.basePrediction ?? {}).map(([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="text-[9px] py-0.5">{stateLabels[key] ?? key}</TableCell>
                        <TableCell className="text-[9px] py-0.5 font-mono">{(value as number).toFixed(4)}</TableCell>
                        {prediction.uncertainty && (
                          <>
                            <TableCell className="text-[9px] py-0.5 font-mono text-blue-500">{prediction.uncertainty.p5?.[key]?.toFixed(4) ?? '--'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 font-mono text-red-500">{prediction.uncertainty.p95?.[key]?.toFixed(4) ?? '--'}</TableCell>
                            <TableCell className="text-[9px] py-0.5 font-mono">{prediction.uncertainty.stdDev?.[key]?.toFixed(4) ?? '--'}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
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

                {/* 不确定性可视化 */}
                {prediction.uncertainty && (
                  <div style={{ height: '180px' }}>
                    <Bar
                      data={{
                        labels: Object.keys(prediction.basePrediction ?? {}).map(k => stateLabels[k] ?? k),
                        datasets: [
                          { label: 'P5', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.p5?.[k] ?? 0), backgroundColor: 'hsl(210, 80%, 55%, 0.3)', borderColor: 'hsl(210, 80%, 55%)', borderWidth: 1 },
                          { label: '均值', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.mean?.[k] ?? 0), backgroundColor: 'hsl(120, 60%, 45%, 0.5)', borderColor: 'hsl(120, 60%, 45%)', borderWidth: 1 },
                          { label: 'P95', data: Object.keys(prediction.basePrediction ?? {}).map(k => prediction.uncertainty.p95?.[k] ?? 0), backgroundColor: 'hsl(340, 80%, 55%, 0.3)', borderColor: 'hsl(340, 80%, 55%)', borderWidth: 1 },
                        ],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { position: 'top', labels: { font: { size: 9 } } }, title: { display: true, text: '不确定性量化 (P5-P95)', font: { size: 10 } } },
                        scales: { x: { ticks: { font: { size: 8 } } }, y: { ticks: { font: { size: 8 } } } },
                      }}
                    />
                  </div>
                )}
              </div>
            </PageCard>
          )}
        </div>
      </div>
    </div>
  );
}
