/**
 * SimulateRunner 一键仿真组件
 *
 * 通过 tRPC 调用后端仿真引擎：创建场景 -> 执行蒙特卡洛仿真 -> 展示结果
 * 后端端点：evoPipeline.simulation.{create, execute, list}
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';

interface Props {
  moduleId: string;
}

export default function SimulateRunner({ moduleId }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 查询该设备的仿真场景列表（含最新结果）
  const simulationList = trpc.evoPipeline.simulation.list.useQuery(
    { machineId: moduleId, limit: 5 },
    { enabled: true, refetchOnWindowFocus: false },
  );

  const latestScenario = simulationList.data?.[0] ?? null;
  const latestResult = latestScenario?.latestResult ?? null;

  // 创建仿真场景
  const createMutation = trpc.evoPipeline.simulation.create.useMutation();

  // 执行仿真
  const executeMutation = trpc.evoPipeline.simulation.execute.useMutation();

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setError(null);

    // 模拟进度条推进（后端异步执行，前端用轮询 + 进度动画）
    progressTimerRef.current = setInterval(() => {
      setProgress(prev => Math.min(prev + 2, 90));
    }, 800);

    try {
      // 1. 创建仿真场景
      const scenario = await createMutation.mutateAsync({
        machineId: moduleId,
        name: `沙箱仿真 ${new Date().toLocaleString('zh-CN')}`,
        description: `模块 ${moduleId} 的一键仿真测试`,
        horizonSteps: 30,
        monteCarloRuns: 50,
        method: 'sobol_qmc',
      });

      // 2. 执行仿真
      await executeMutation.mutateAsync({
        scenarioId: Number(scenario.id),
      });

      // 3. 轮询等待结果完成
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 60; // 最多轮询 60 次（约 60 秒）

        pollTimerRef.current = setInterval(async () => {
          attempts++;
          try {
            const result = await simulationList.refetch();
            const latest = result.data?.[0];

            if (latest && latest.latestResult && String(latest.id) === String(scenario.id)) {
              // 仿真完成
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setProgress(100);
              resolve();
              return;
            }

            // 检查场景状态是否为 failed
            if (latest && String(latest.id) === String(scenario.id) && latest.status === 'failed') {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              reject(new Error('仿真执行失败'));
              return;
            }

            if (attempts >= maxAttempts) {
              if (pollTimerRef.current) clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              // 超时但不报错，可能仍在执行中，刷新列表即可看到结果
              resolve();
            }
          } catch {
            // 忽略单次轮询错误，继续尝试
          }
        }, 1000);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '仿真执行失败';
      setError(message);
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setProgress(100);
      setRunning(false);
      // 最终刷新一次列表
      simulationList.refetch();
    }
  }, [moduleId, createMutation, executeMutation, simulationList]);

  const statusBadge = (status: string | undefined) => {
    if (!status) return null;
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      completed: { label: '仿真成功', variant: 'default' },
      running: { label: '运行中', variant: 'secondary' },
      draft: { label: '草稿', variant: 'outline' },
      failed: { label: '仿真失败', variant: 'destructive' },
      queued: { label: '排队中', variant: 'outline' },
    };
    const info = map[status] ?? { label: status, variant: 'outline' as const };
    return <Badge variant={info.variant} className="text-[8px]">{info.label}</Badge>;
  };

  const riskBadge = (level: string | null | undefined) => {
    if (!level) return null;
    const colorMap: Record<string, string> = {
      low: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400',
      critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
    };
    const labelMap: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险', critical: '严重' };
    return (
      <span className={`text-[8px] px-1.5 py-0.5 rounded ${colorMap[level] ?? ''}`}>
        {labelMap[level] ?? level}
      </span>
    );
  };

  const metricCard = (label: string, value: string | number, unit: string, color: string) => (
    <div className={`p-2 rounded bg-${color}-50 dark:bg-${color}-950/20 border border-${color}-200 dark:border-${color}-800`}>
      <div className="text-[8px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold font-mono">{value}<span className="text-[8px] font-normal ml-0.5">{unit}</span></div>
    </div>
  );

  return (
    <div className="space-y-3">
      <PageCard title="一键仿真" icon={<span className="text-xs">&#x1F9EA;</span>} compact>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium">
                模拟运行 <Badge variant="outline" className="text-[8px] ml-1">{moduleId}</Badge>
              </div>
              <div className="text-[8px] text-muted-foreground">
                使用当前配置在沙箱中运行蒙特卡洛仿真，不影响真实孪生体
              </div>
            </div>
            <Button
              size="sm"
              className="h-6 text-[9px] px-3"
              disabled={running}
              onClick={runSimulation}
            >
              {running ? '仿真中...' : '\u25B6 开始仿真'}
            </Button>
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <div className="text-[8px] text-muted-foreground text-center">
                {createMutation.isPending && '正在创建仿真场景...'}
                {executeMutation.isPending && '正在提交执行...'}
                {!createMutation.isPending && !executeMutation.isPending && `仿真进度 ${Math.floor(progress)}%`}
              </div>
            </div>
          )}

          {error && !running && (
            <div className="p-2 bg-red-50 dark:bg-red-950/20 rounded text-[9px] text-red-600">
              <div>&#x2022; {error}</div>
            </div>
          )}

          {latestScenario && !running && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                {statusBadge(latestScenario.status)}
                {latestResult && riskBadge(latestResult.riskLevel)}
                {latestResult && (
                  <span className="text-[8px] text-muted-foreground">
                    耗时 {((latestResult.durationMs ?? 0) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>

              <div className="text-[9px] text-muted-foreground truncate">
                {latestScenario.name}
              </div>

              {latestResult && (
                <div className="grid grid-cols-4 gap-2">
                  {metricCard('风险等级', latestResult.riskLevel ?? '-', '', 'blue')}
                  {metricCard('MC 采样', latestResult.monteCarloRuns ?? 0, '次', 'purple')}
                  {metricCard('执行耗时', ((latestResult.durationMs ?? 0) / 1000).toFixed(1), 's', 'amber')}
                  {metricCard('场景 ID', latestResult.id ?? '-', '', 'green')}
                </div>
              )}

              {/* 历史仿真记录 */}
              {(simulationList.data?.length ?? 0) > 1 && (
                <div className="pt-1 border-t border-border/50">
                  <div className="text-[8px] text-muted-foreground mb-1">历史记录</div>
                  {simulationList.data?.slice(1, 4).map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 text-[8px] text-muted-foreground py-0.5">
                      {statusBadge(s.status)}
                      <span className="truncate flex-1">{s.name}</span>
                      {s.latestResult && riskBadge(s.latestResult.riskLevel)}
                      <span>{s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-CN') : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </PageCard>
    </div>
  );
}
