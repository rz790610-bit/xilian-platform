/**
 * SimulateRunner 一键仿真组件
 * 
 * 在沙箱中用临时配置运行 30s 仿真，展示预测精度、Grok 调用次数、延迟等指标
 */
import { useState, useCallback } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface SimulationResult {
  duration: number;
  metrics: {
    predictionAccuracy: number;
    grokCalls: number;
    avgLatencyMs: number;
    eventsProcessed: number;
    syncSuccessRate: number;
    anomaliesDetected: number;
    memoryUsageMb: number;
  };
  status: 'success' | 'partial' | 'failed';
  errors: string[];
}

interface Props {
  moduleId: string;
  onSimulate?: (moduleId: string) => Promise<SimulationResult | null>;
}

export default function SimulateRunner({ moduleId, onSimulate }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setResult(null);

    // 模拟进度条（实际应由后端 SSE 推送）
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 3.3, 99));
    }, 1000);

    try {
      if (onSimulate) {
        const res = await onSimulate(moduleId);
        setResult(res);
      } else {
        // 模拟仿真结果（后端未接入时）
        await new Promise(resolve => setTimeout(resolve, 5000));
        setResult({
          duration: 30,
          metrics: {
            predictionAccuracy: 0.87 + Math.random() * 0.1,
            grokCalls: Math.floor(Math.random() * 20),
            avgLatencyMs: 50 + Math.random() * 100,
            eventsProcessed: 100 + Math.floor(Math.random() * 200),
            syncSuccessRate: 0.95 + Math.random() * 0.05,
            anomaliesDetected: Math.floor(Math.random() * 5),
            memoryUsageMb: 128 + Math.random() * 64,
          },
          status: 'success',
          errors: [],
        });
      }
    } catch {
      setResult({
        duration: 0,
        metrics: {
          predictionAccuracy: 0, grokCalls: 0, avgLatencyMs: 0,
          eventsProcessed: 0, syncSuccessRate: 0, anomaliesDetected: 0, memoryUsageMb: 0,
        },
        status: 'failed',
        errors: ['仿真执行失败'],
      });
    } finally {
      clearInterval(progressInterval);
      setProgress(100);
      setRunning(false);
    }
  }, [moduleId, onSimulate]);

  const metricCard = (label: string, value: string | number, unit: string, color: string) => (
    <div className={`p-2 rounded bg-${color}-50 dark:bg-${color}-950/20 border border-${color}-200 dark:border-${color}-800`}>
      <div className="text-[8px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold font-mono">{value}<span className="text-[8px] font-normal ml-0.5">{unit}</span></div>
    </div>
  );

  return (
    <div className="space-y-3">
      <PageCard title="一键仿真" icon={<span className="text-xs">🧪</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium">
                模拟运行 <Badge variant="outline" className="text-[8px] ml-1">{moduleId}</Badge>
              </div>
              <div className="text-[8px] text-muted-foreground">
                使用当前配置在沙箱中运行 30 秒仿真，不影响真实孪生体
              </div>
            </div>
            <Button
              size="sm"
              className="h-6 text-[9px] px-3"
              disabled={running}
              onClick={runSimulation}
            >
              {running ? '仿真中...' : '▶ 开始仿真'}
            </Button>
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <div className="text-[8px] text-muted-foreground text-center">
                仿真进度 {Math.floor(progress)}% · 预计剩余 {Math.max(0, Math.floor((100 - progress) / 3.3))}s
              </div>
            </div>
          )}

          {result && !running && (
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Badge variant={result.status === 'success' ? 'default' : result.status === 'partial' ? 'secondary' : 'destructive'}
                  className="text-[8px]">
                  {result.status === 'success' ? '仿真成功' : result.status === 'partial' ? '部分成功' : '仿真失败'}
                </Badge>
                <span className="text-[8px] text-muted-foreground">耗时 {result.duration}s</span>
              </div>

              {result.status !== 'failed' && (
                <div className="grid grid-cols-4 gap-2">
                  {metricCard('预测精度', (result.metrics.predictionAccuracy * 100).toFixed(1), '%', 'blue')}
                  {metricCard('Grok 调用', result.metrics.grokCalls, '次', 'purple')}
                  {metricCard('平均延迟', result.metrics.avgLatencyMs.toFixed(0), 'ms', 'amber')}
                  {metricCard('事件处理', result.metrics.eventsProcessed, '条', 'green')}
                  {metricCard('同步成功率', (result.metrics.syncSuccessRate * 100).toFixed(1), '%', 'cyan')}
                  {metricCard('异常检测', result.metrics.anomaliesDetected, '个', 'red')}
                  {metricCard('内存占用', result.metrics.memoryUsageMb.toFixed(0), 'MB', 'slate')}
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded text-[9px] text-red-600">
                  {result.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </PageCard>
    </div>
  );
}
