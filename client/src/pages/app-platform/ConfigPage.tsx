/**
 * 基础配置页面（客户版）
 * 两个 Tab: 报警阈值 + 巡检周期
 * 数据通过 tRPC 持久化到 alertRules / scheduledTasks 表
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RTG_SENSORS,
} from '@/components/digital-twin/rtg-model/rtg-constants';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  Calendar,
  Save,
  Thermometer,
  Waves,
  RotateCcw,
  Loader2,
} from 'lucide-react';

// ── 阈值编辑状态 ─────────────────────────────────────
interface ThresholdEdit {
  sensorId: string;
  warning: string;
  alarm: string;
  /** DB row id when a persisted alertRule already exists */
  dbId?: number;
}

// ── 巡检周期配置 ─────────────────────────────────────
interface InspectionConfig {
  deviceType: string;
  cycle: 'daily' | 'weekly' | 'monthly';
  items: string;
  /** DB row id when a persisted scheduledTask already exists */
  dbId?: number;
}

const DEFAULT_INSPECTIONS: InspectionConfig[] = [
  { deviceType: 'RTG', cycle: 'daily', items: '外观检查、油液检查、异响排查' },
  { deviceType: 'STS', cycle: 'weekly', items: '结构焊缝检查、钢丝绳检查、电气连接' },
  { deviceType: 'AGV', cycle: 'monthly', items: '电池组检测、导航系统校准、制动性能' },
];

const CYCLE_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
};

const CYCLE_TO_CRON: Record<string, string> = {
  daily: '0 8 * * *',
  weekly: '0 8 * * 1',
  monthly: '0 8 1 * *',
};

const CRON_TO_CYCLE: Record<string, 'daily' | 'weekly' | 'monthly'> = {
  '0 8 * * *': 'daily',
  '0 8 * * 1': 'weekly',
  '0 8 1 * *': 'monthly',
};

// ── 传感器组标签 ──────────────────────────────────────
const GROUP_LABELS: Record<string, string> = {
  hoist: '起升机构',
  trolley: '小车运行',
  gantry: '大车电机',
};

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState('thresholds');
  const { success: toastSuccess, error: toastError } = useToast();
  const utils = trpc.useUtils();

  // ── 远程数据查询 ──────────────────────────────────────
  const alertRulesQuery = trpc.platformSystem.alertRules.list.useQuery(
    { pageSize: 100 },
    { staleTime: 30_000 },
  );

  const scheduledTasksQuery = trpc.platformSystem.scheduledTasks.list.useQuery(
    { taskType: 'inspection' },
    { staleTime: 30_000 },
  );

  // ── 远程 mutations ────────────────────────────────────
  const createAlertRule = trpc.platformSystem.alertRules.create.useMutation();
  const updateAlertRule = trpc.platformSystem.alertRules.update.useMutation();
  const createScheduledTask = trpc.platformSystem.scheduledTasks.create.useMutation();
  const updateScheduledTask = trpc.platformSystem.scheduledTasks.update.useMutation();

  // ── 阈值编辑状态 ────────────────────────────────────
  const [thresholdEdits, setThresholdEdits] = useState<Record<string, ThresholdEdit>>(() => {
    const initial: Record<string, ThresholdEdit> = {};
    for (const s of RTG_SENSORS) {
      initial[s.id] = {
        sensorId: s.id,
        warning: String(s.thresholds.warning),
        alarm: String(s.thresholds.alarm),
      };
    }
    return initial;
  });

  const [thresholdSaving, setThresholdSaving] = useState(false);

  // ── 巡检配置 ────────────────────────────────────────
  const [inspections, setInspections] = useState<InspectionConfig[]>(DEFAULT_INSPECTIONS);
  const [inspectionSaving, setInspectionSaving] = useState(false);

  // ── 从 DB 初始化阈值编辑状态 ─────────────────────────
  useEffect(() => {
    if (!alertRulesQuery.data?.rows) return;
    const dbRules = alertRulesQuery.data.rows;

    setThresholdEdits((prev) => {
      const next = { ...prev };
      for (const s of RTG_SENSORS) {
        const ruleCode = `threshold-${s.id}`;
        const dbRule = dbRules.find(
          (r) => r.ruleCode === ruleCode && r.isDeleted === 0,
        );
        if (dbRule) {
          const condition = dbRule.condition as { warning?: number; alarm?: number } | null;
          next[s.id] = {
            sensorId: s.id,
            warning: condition?.warning != null ? String(condition.warning) : String(s.thresholds.warning),
            alarm: condition?.alarm != null ? String(condition.alarm) : String(s.thresholds.alarm),
            dbId: dbRule.id,
          };
        }
      }
      return next;
    });
  }, [alertRulesQuery.data]);

  // ── 从 DB 初始化巡检配置 ──────────────────────────────
  useEffect(() => {
    if (!scheduledTasksQuery.data?.rows) return;
    const dbTasks = scheduledTasksQuery.data.rows;

    setInspections((prev) => {
      return prev.map((cfg) => {
        const taskCode = `inspection-${cfg.deviceType}`;
        const dbTask = dbTasks.find(
          (t) => t.taskCode === taskCode && t.isDeleted === 0,
        );
        if (dbTask) {
          const params = dbTask.params as { deviceType?: string; items?: string } | null;
          const cycle = dbTask.cronExpression
            ? CRON_TO_CYCLE[dbTask.cronExpression] ?? cfg.cycle
            : cfg.cycle;
          return {
            deviceType: cfg.deviceType,
            cycle,
            items: params?.items ?? cfg.items,
            dbId: dbTask.id,
          };
        }
        return cfg;
      });
    });
  }, [scheduledTasksQuery.data]);

  // ── 传感器分组 ──────────────────────────────────────
  const sensorGroups = useMemo(() => {
    const groups: Record<string, typeof RTG_SENSORS> = {};
    for (const s of RTG_SENSORS) {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push(s);
    }
    return groups;
  }, []);

  // ── 阈值更新 ────────────────────────────────────────
  const handleThresholdChange = (sensorId: string, field: 'warning' | 'alarm', value: string) => {
    setThresholdEdits((prev) => ({
      ...prev,
      [sensorId]: { ...prev[sensorId], [field]: value },
    }));
  };

  const handleThresholdSave = useCallback(async () => {
    // 校验所有值为正数
    for (const edit of Object.values(thresholdEdits)) {
      const w = parseFloat(edit.warning);
      const a = parseFloat(edit.alarm);
      if (isNaN(w) || isNaN(a) || w <= 0 || a <= 0) {
        toastError('阈值必须为正数，请检查输入');
        return;
      }
      if (w >= a) {
        toastError('预警阈值必须小于报警阈值');
        return;
      }
    }

    setThresholdSaving(true);
    try {
      const promises = RTG_SENSORS.map((sensor) => {
        const edit = thresholdEdits[sensor.id];
        const condition = {
          operator: 'gte' as const,
          threshold: parseFloat(edit.alarm),
          warning: parseFloat(edit.warning),
          alarm: parseFloat(edit.alarm),
        };

        if (edit.dbId) {
          // 已有 DB 记录 → update
          return updateAlertRule.mutateAsync({
            id: edit.dbId,
            name: sensor.label,
            condition,
          });
        } else {
          // 新建
          return createAlertRule.mutateAsync({
            ruleCode: `threshold-${sensor.id}`,
            name: sensor.label,
            deviceType: 'RTG',
            measurementType: sensor.measurementType,
            condition,
          });
        }
      });

      await Promise.all(promises);
      await utils.platformSystem.alertRules.list.invalidate();
      toastSuccess('报警阈值配置已保存');
    } catch (err) {
      toastError(`保存阈值失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setThresholdSaving(false);
    }
  }, [thresholdEdits, createAlertRule, updateAlertRule, utils, toastSuccess, toastError]);

  const handleThresholdReset = () => {
    const reset: Record<string, ThresholdEdit> = {};
    for (const s of RTG_SENSORS) {
      // 保留 dbId 以便下次保存时走 update 而非 create
      const existing = thresholdEdits[s.id];
      reset[s.id] = {
        sensorId: s.id,
        warning: String(s.thresholds.warning),
        alarm: String(s.thresholds.alarm),
        dbId: existing?.dbId,
      };
    }
    setThresholdEdits(reset);
  };

  // ── 巡检配置更新 ────────────────────────────────────
  const handleInspectionCycleChange = (idx: number, cycle: string) => {
    setInspections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], cycle: cycle as InspectionConfig['cycle'] };
      return next;
    });
  };

  const handleInspectionItemsChange = (idx: number, items: string) => {
    setInspections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], items };
      return next;
    });
  };

  const handleInspectionSave = useCallback(async () => {
    setInspectionSaving(true);
    try {
      const promises = inspections.map((config) => {
        const cronExpression = CYCLE_TO_CRON[config.cycle];
        const params = { deviceType: config.deviceType, items: config.items };

        if (config.dbId) {
          return updateScheduledTask.mutateAsync({
            id: config.dbId,
            name: `${config.deviceType} 巡检任务`,
            cronExpression,
            params,
          });
        } else {
          return createScheduledTask.mutateAsync({
            taskCode: `inspection-${config.deviceType}`,
            name: `${config.deviceType} 巡检任务`,
            taskType: 'inspection',
            handler: 'inspection-handler',
            cronExpression,
            params,
          });
        }
      });

      await Promise.all(promises);
      await utils.platformSystem.scheduledTasks.list.invalidate();
      toastSuccess('巡检周期配置已保存');
    } catch (err) {
      toastError(`保存巡检配置失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setInspectionSaving(false);
    }
  }, [inspections, createScheduledTask, updateScheduledTask, utils, toastSuccess, toastError]);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="thresholds" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            报警阈值
          </TabsTrigger>
          <TabsTrigger value="inspection" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            巡检周期
          </TabsTrigger>
        </TabsList>

        {/* ── 报警阈值 ──────────────────────────────────── */}
        <TabsContent value="thresholds" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              RTG 轮胎吊 16 个 VT 传感器的预警和报警阈值配置
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleThresholdReset} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                恢复默认
              </Button>
              <Button
                size="sm"
                onClick={handleThresholdSave}
                disabled={thresholdSaving}
                className="gap-1.5"
              >
                {thresholdSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {thresholdSaving ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </div>

          {(['hoist', 'trolley', 'gantry'] as const).map((groupKey) => {
            const sensors = sensorGroups[groupKey] ?? [];
            return (
              <Card key={groupKey}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Waves className="h-4 w-4 text-primary" />
                    {GROUP_LABELS[groupKey] ?? groupKey}
                    <Badge variant="outline" className="text-[10px] ml-1">{sensors.length} 个传感器</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">编号</TableHead>
                        <TableHead className="w-[180px]">名称</TableHead>
                        <TableHead className="w-[80px]">类型</TableHead>
                        <TableHead className="w-[80px]">单位</TableHead>
                        <TableHead className="w-[120px]">预警阈值</TableHead>
                        <TableHead className="w-[120px]">报警阈值</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sensors.map((sensor) => {
                        const edit = thresholdEdits[sensor.id];
                        const isTemp = sensor.measurementType === 'temperature';
                        return (
                          <TableRow key={sensor.id}>
                            <TableCell className="font-mono text-sm">{sensor.id}</TableCell>
                            <TableCell className="text-sm">{sensor.label}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isTemp ? (
                                  <Thermometer className="h-3 w-3 text-orange-500" />
                                ) : (
                                  <Waves className="h-3 w-3 text-blue-500" />
                                )}
                                <span className="text-xs">
                                  {isTemp ? '温度' : '振动'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{sensor.unit}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.1"
                                value={edit?.warning ?? ''}
                                onChange={(e) => handleThresholdChange(sensor.id, 'warning', e.target.value)}
                                className="h-8 w-[100px] text-sm text-yellow-500"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.1"
                                value={edit?.alarm ?? ''}
                                onChange={(e) => handleThresholdChange(sensor.id, 'alarm', e.target.value)}
                                className="h-8 w-[100px] text-sm text-red-500"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── 巡检周期 ──────────────────────────────────── */}
        <TabsContent value="inspection" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              不同设备类型的巡检周期与检查项配置
            </p>
            <Button
              size="sm"
              onClick={handleInspectionSave}
              disabled={inspectionSaving}
              className="gap-1.5"
            >
              {inspectionSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {inspectionSaving ? '保存中...' : '保存配置'}
            </Button>
          </div>

          <div className="space-y-3">
            {inspections.map((config, idx) => (
              <Card key={config.deviceType}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="space-y-1.5 min-w-[120px]">
                      <Label className="text-xs text-muted-foreground">设备类型</Label>
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Badge variant="outline">{config.deviceType}</Badge>
                      </div>
                    </div>

                    <div className="space-y-1.5 min-w-[120px]">
                      <Label className="text-xs text-muted-foreground">巡检周期</Label>
                      <Select
                        value={config.cycle}
                        onValueChange={(v) => handleInspectionCycleChange(idx, v)}
                      >
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">每日</SelectItem>
                          <SelectItem value="weekly">每周</SelectItem>
                          <SelectItem value="monthly">每月</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                      <Label className="text-xs text-muted-foreground">检查项目</Label>
                      <Input
                        value={config.items}
                        onChange={(e) => handleInspectionItemsChange(idx, e.target.value)}
                        className="h-8 text-sm"
                        placeholder="用逗号分隔检查项..."
                      />
                    </div>

                    <div className="pt-5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          config.cycle === 'daily' && 'text-blue-500 border-blue-500/30',
                          config.cycle === 'weekly' && 'text-yellow-500 border-yellow-500/30',
                          config.cycle === 'monthly' && 'text-emerald-500 border-emerald-500/30',
                        )}
                      >
                        {CYCLE_LABELS[config.cycle]}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
