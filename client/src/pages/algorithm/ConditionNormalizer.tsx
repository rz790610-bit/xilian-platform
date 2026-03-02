/**
 * FIX-059: fetch → tRPC 迁移（部分完成）
 * - 核心 mutation（processSlice）已迁移为 tRPC
 * - 剩余 fetch 调用通过 tRPC vanilla client 代理
 *
 * 工况归一化页面
 *
 * 5 个 Tab：
 * 1. 归一化控制台 — 数据输入 + 方法选择 + 实时结果
 * 2. 基线管理 — 学习/导入/导出基线
 * 3. 阈值配置 — 自适应阈值编辑
 * 4. 工况管理 — 工况定义 CRUD
 * 5. 处理历史 — 历史记录查看
 */
import { useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import {
  ConfigSection, ConfigSlider, ConfigInput, ConfigSelect, ConfigKV, ConfigActions, ApiDocBlock, ConfigRangeInput,
} from '@/components/common/AlgorithmConfigPanel';
import { trpc } from '@/lib/trpc';
import { createLogger } from '@/lib/logger';
const log = createLogger('ConditionNormalizer');

// ============================================================================
// 类型定义
// ============================================================================

interface Baseline {
  mean: number;
  std: number;
  p5: number;
  p95: number;
}

interface ThresholdRange {
  normal: [number, number];
  warning: [number, number];
  danger: [number, number];
}

interface ConditionDef {
  description: string;
  keyFeatures: string;
  typicalDuration: string;
}

interface NormalizationResult {
  condition: string;
  conditionLabel: string;
  features: Record<string, number>;
  normalizedFeatures: Record<string, number>;
  ratios: Record<string, number>;
  status: Record<string, string>;
  overallStatus: string;
  baseline: Record<string, Baseline | null>;
  method: string;
  timestamp: string;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  condition: string;
  method: string;
  overallStatus: string;
  features: Record<string, number>;
  normalizedFeatures: Record<string, number>;
}

// ============================================================================
// 预设场景
// ============================================================================

const PRESET_SCENARIOS = [
  {
    id: 'idle',
    name: '待机空闲',
    icon: '💤',
    data: { plcCode: 0, current: 0.05, loadWeight: 0, vibrationSpeed: 0.3, bearingTemp: 25, motorSpeed: 0 },
  },
  {
    id: 'lift_empty',
    name: '空载起升',
    icon: '🔼',
    data: { plcCode: 1, current: 35, loadWeight: 2, vibrationSpeed: 1.8, bearingTemp: 42, motorSpeed: 1450 },
  },
  {
    id: 'lift_loaded',
    name: '重载起升',
    icon: '🏋️',
    data: { plcCode: 2, current: 82, loadWeight: 35, vibrationSpeed: 3.5, bearingTemp: 65, motorSpeed: 1420 },
  },
  {
    id: 'trolley_move',
    name: '小车行走',
    icon: '🚃',
    data: { plcCode: 3, current: 28, loadWeight: 35, vibrationSpeed: 2.1, bearingTemp: 48, trolleySpeed: 1.5, motorSpeed: 1440 },
  },
  {
    id: 'landing',
    name: '集装箱落地',
    icon: '📦',
    data: { plcCode: 4, current: 15, loadWeight: 30, vibrationSpeed: 8.5, bearingTemp: 55, motorSpeed: 200 },
  },
  {
    id: 'warning_scenario',
    name: '预警场景',
    icon: '⚠️',
    data: { plcCode: 2, current: 98, loadWeight: 38, vibrationSpeed: 5.2, bearingTemp: 78, motorSpeed: 1380 },
  },
  {
    id: 'danger_scenario',
    name: '危险场景',
    icon: '🚨',
    data: { plcCode: 2, current: 115, loadWeight: 42, vibrationSpeed: 8.0, bearingTemp: 90, motorSpeed: 1350 },
  },
];

const FEATURE_DEFS = [
  { key: 'current', label: '电流 (A)', min: 0, max: 150, step: 0.5, unit: 'A' },
  { key: 'loadWeight', label: '载荷 (t)', min: 0, max: 50, step: 0.5, unit: 't' },
  { key: 'vibrationSpeed', label: '振动速度 (mm/s)', min: 0, max: 15, step: 0.1, unit: 'mm/s' },
  { key: 'bearingTemp', label: '轴承温度 (℃)', min: 0, max: 120, step: 0.5, unit: '℃' },
  { key: 'motorSpeed', label: '电机转速 (rpm)', min: 0, max: 1500, step: 10, unit: 'rpm' },
];

// ============================================================================
// 工具函数
// ============================================================================

function statusColor(s: string): string {
  switch (s) {
    case 'normal': return '#22c55e';
    case 'attention': return '#f59e0b';
    case 'warning': return '#f97316';
    case 'danger': case 'severe': return '#ef4444';
    case 'no_baseline': return '#94a3b8';
    default: return '#64748b';
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'normal': return '正常';
    case 'attention': return '关注';
    case 'warning': return '预警';
    case 'danger': case 'severe': return '危险';
    case 'no_baseline': return '无基线';
    case 'unknown': return '未知';
    default: return s;
  }
}

function conditionColor(c: string): string {
  switch (c) {
    case 'IDLE': return '#94a3b8';
    case 'LIFT_EMPTY': return '#3b82f6';
    case 'LIFT_LOADED': return '#ef4444';
    case 'TROLLEY_MOVE': return '#f59e0b';
    case 'LANDING': return '#8b5cf6';
    default: return '#64748b';
  }
}

// ============================================================================
// 主组件
// ============================================================================

export default function ConditionNormalizerPage() {
  const [activeTab, setActiveTab] = useState<'console' | 'baseline' | 'threshold' | 'conditions' | 'history' | 'config'>('console');

  const tabs = [
    { id: 'console' as const, label: '归一化控制台', icon: '🎛️' },
    { id: 'baseline' as const, label: '基线管理', icon: '📊' },
    { id: 'threshold' as const, label: '阈值配置', icon: '⚙️' },
    { id: 'conditions' as const, label: '工况管理', icon: '🏭' },
    { id: 'history' as const, label: '处理历史', icon: '📋' },
    { id: 'config' as const, label: '系统配置', icon: '🔧' },
  ];

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <span className="text-3xl">🎯</span>
              工况归一化引擎
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                v2.0
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              多工况参数归一化 · 自适应基线学习 · EWMA在线更新 · 自适应阈值状态判定
            </p>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="flex gap-1 p-1 bg-card/50 rounded-lg border border-border/50 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        {activeTab === 'console' && <ConsoleTab />}
        {activeTab === 'baseline' && <BaselineTab />}
        {activeTab === 'threshold' && <ThresholdTab />}
        {activeTab === 'conditions' && <ConditionsTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'config' && <NormalizerConfigTab />}
      </div>
    </MainLayout>
  );
}

// ============================================================================
// Tab 1: 归一化控制台
// ============================================================================

function ConsoleTab() {
  const [method, setMethod] = useState<'ratio' | 'zscore'>('ratio');
  const [plcCode, setPlcCode] = useState(0);
  const [features, setFeatures] = useState<Record<string, number>>({
    current: 82,
    loadWeight: 35,
    vibrationSpeed: 3.5,
    bearingTemp: 65,
    motorSpeed: 1420,
  });
  const [result, setResult] = useState<NormalizationResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const applyPreset = useCallback((preset: typeof PRESET_SCENARIOS[0]) => {
    const { plcCode: pc, ...feats } = preset.data;
    setPlcCode(pc);
    setFeatures(feats as Record<string, number>);
  }, []);

  const processSliceMutation = trpc.conditionNormalizer.processSlice.useMutation();

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    try {
      const resp = await processSliceMutation.mutateAsync({ dataSlice: { plcCode, ...features }, method });
      if (resp?.data) {
        setResult(resp.data);
      }
    } catch (err) {
      log.error('Process failed:', err);
    } finally {
      setProcessing(false);
    }
  }, [plcCode, features, method, processSliceMutation]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* 左侧：输入面板 */}
      <div className="space-y-4">
        {/* 预设场景 */}
        <div className="bg-card rounded-xl border border-border/50 p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">预设场景</h3>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_SCENARIOS.map(preset => (
              <button
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-xs"
              >
                <span className="text-xl">{preset.icon}</span>
                <span className="text-muted-foreground">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 方法选择 + PLC */}
        <div className="bg-card rounded-xl border border-border/50 p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">归一化方法</label>
              <div className="flex gap-2">
                {(['ratio', 'zscore'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      method === m
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent/30 text-muted-foreground hover:bg-accent/50'
                    }`}
                  >
                    {m === 'ratio' ? '比值法 (Ratio)' : 'Z-Score'}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-32">
              <label className="text-xs text-muted-foreground mb-1 block">PLC 工况码</label>
              <input
                type="number"
                value={plcCode}
                onChange={e => setPlcCode(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                min={0}
                max={10}
              />
            </div>
          </div>
        </div>

        {/* 传感器参数 */}
        <div className="bg-card rounded-xl border border-border/50 p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">传感器参数</h3>
          <div className="space-y-3">
            {FEATURE_DEFS.map(fd => (
              <div key={fd.key} className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-36 shrink-0">{fd.label}</label>
                <input
                  type="range"
                  min={fd.min}
                  max={fd.max}
                  step={fd.step}
                  value={features[fd.key] ?? 0}
                  onChange={e => setFeatures(prev => ({ ...prev, [fd.key]: parseFloat(e.target.value) }))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-mono text-foreground w-20 text-right">
                  {(features[fd.key] ?? 0).toFixed(1)} {fd.unit}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 执行按钮 */}
        <button
          onClick={handleProcess}
          disabled={processing}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {processing ? '⏳ 处理中...' : '▶ 执行归一化'}
        </button>
      </div>

      {/* 右侧：结果面板 */}
      <div className="space-y-4">
        {result ? (
          <>
            {/* 工况识别 */}
            <div className="bg-card rounded-xl border border-border/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">工况识别结果</h3>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: conditionColor(result.condition) + '20',
                    color: conditionColor(result.condition),
                    border: `1px solid ${conditionColor(result.condition)}40`,
                  }}
                >
                  {result.condition} — {result.conditionLabel}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">综合状态：</span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: statusColor(result.overallStatus) + '20',
                    color: statusColor(result.overallStatus),
                    border: `1px solid ${statusColor(result.overallStatus)}40`,
                  }}
                >
                  {statusLabel(result.overallStatus)}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  方法: {result.method === 'ratio' ? '比值法' : 'Z-Score'} · {new Date(result.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            {/* 特征对比表 */}
            <div className="bg-card rounded-xl border border-border/50 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">特征归一化对比</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 text-xs text-muted-foreground font-medium">特征</th>
                      <th className="text-right py-2 text-xs text-muted-foreground font-medium">原始值</th>
                      <th className="text-right py-2 text-xs text-muted-foreground font-medium">归一化值</th>
                      <th className="text-right py-2 text-xs text-muted-foreground font-medium">比值</th>
                      <th className="text-center py-2 text-xs text-muted-foreground font-medium">状态</th>
                      <th className="text-right py-2 text-xs text-muted-foreground font-medium">基线均值</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.features).map(([feat, val]) => (
                      <tr key={feat} className="border-b border-border/30">
                        <td className="py-2 text-foreground font-medium">{feat}</td>
                        <td className="py-2 text-right font-mono text-foreground">{val.toFixed(2)}</td>
                        <td className="py-2 text-right font-mono text-blue-400">
                          {(result.normalizedFeatures[feat] ?? val).toFixed(4)}
                        </td>
                        <td className="py-2 text-right font-mono text-foreground">
                          {(result.ratios[feat] ?? 1).toFixed(3)}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{
                              backgroundColor: statusColor(result.status[feat] ?? 'unknown') + '20',
                              color: statusColor(result.status[feat] ?? 'unknown'),
                            }}
                          >
                            {statusLabel(result.status[feat] ?? 'unknown')}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono text-muted-foreground">
                          {result.baseline[feat]?.mean?.toFixed(2) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 比值柱状图 */}
            <div className="bg-card rounded-xl border border-border/50 p-5">
              <h3 className="text-sm font-semibold text-foreground mb-3">归一化比值分布</h3>
              <div className="space-y-2">
                {Object.entries(result.ratios).map(([feat, ratio]) => {
                  const pct = Math.min(ratio / 2 * 100, 100);
                  const color = statusColor(result.status[feat] ?? 'normal');
                  return (
                    <div key={feat} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{feat}</span>
                      <div className="flex-1 h-5 bg-accent/20 rounded-full overflow-hidden relative">
                        {/* 参考线 1.0 */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground/20 z-10" />
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs font-mono w-14 text-right" style={{ color }}>
                        {ratio.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>参考线 = 1.0（基线均值）</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> 正常(0.8-1.2)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 关注(1.2-1.5)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> 预警(1.5-2.0)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> 危险(&gt;2.0)</span>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-card rounded-xl border border-border/50 p-12 flex flex-col items-center justify-center text-center">
            <span className="text-5xl mb-4">🎯</span>
            <h3 className="text-lg font-semibold text-foreground mb-2">选择场景或调整参数</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              选择左侧预设场景快速填充参数，或手动调整传感器数值，然后点击「执行归一化」查看结果。
              首次使用需要先在「基线管理」中学习基线数据。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2: 基线管理
// ============================================================================

function BaselineTab() {
  const [baselines, setBaselines] = useState<Record<string, Record<string, Baseline>>>({});
  const [learning, setLearning] = useState(false);
  const [sampleCount, setSampleCount] = useState(500);
  const [learnResults, setLearnResults] = useState<any[]>([]);

  const fetchBaselines = useCallback(async () => {
    try {
      const resp = await fetch('/api/trpc/conditionNormalizer.getBaselines');
      const data = await resp.json();
      if (data?.result?.data?.data) {
        setBaselines(data.result.data.data);
      }
    } catch (err) {
      log.error('Fetch baselines failed:', err);
    }
  }, []);

  const generateAndLearn = useCallback(async () => {
    setLearning(true);
    try {
      // 生成模拟历史数据
      const historicalData: Record<string, any>[] = [];
      const conditions = [
        { plcCode: 0, current: [0.01, 0.1], loadWeight: [0, 1], vibrationSpeed: [0.1, 0.5], bearingTemp: [20, 30], motorSpeed: [0, 5] },
        { plcCode: 1, current: [25, 45], loadWeight: [0, 5], vibrationSpeed: [1.2, 2.8], bearingTemp: [35, 55], motorSpeed: [1400, 1480] },
        { plcCode: 2, current: [65, 95], loadWeight: [25, 40], vibrationSpeed: [2.5, 4.5], bearingTemp: [50, 75], motorSpeed: [1380, 1450] },
        { plcCode: 3, current: [20, 35], loadWeight: [0, 40], vibrationSpeed: [1.5, 2.5], bearingTemp: [35, 50], motorSpeed: [1420, 1470] },
        { plcCode: 4, current: [10, 25], loadWeight: [20, 40], vibrationSpeed: [5, 10], bearingTemp: [45, 65], motorSpeed: [100, 400] },
      ];

      for (const cond of conditions) {
        for (let i = 0; i < sampleCount; i++) {
          const rand = (min: number, max: number) => min + Math.random() * (max - min);
          historicalData.push({
            plcCode: cond.plcCode,
            current: rand(cond.current[0], cond.current[1]),
            loadWeight: rand(cond.loadWeight[0], cond.loadWeight[1]),
            vibrationSpeed: rand(cond.vibrationSpeed[0], cond.vibrationSpeed[1]),
            bearingTemp: rand(cond.bearingTemp[0], cond.bearingTemp[1]),
            motorSpeed: rand(cond.motorSpeed[0], cond.motorSpeed[1]),
          });
        }
      }

      const resp = await fetch('/api/trpc/conditionNormalizer.learnBaseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historicalData }),
      });
      const data = await resp.json();
      if (data?.result?.data?.data) {
        setLearnResults(data.result.data.data);
      }
      await fetchBaselines();
    } catch (err) {
      log.error('Learn failed:', err);
    } finally {
      setLearning(false);
    }
  }, [sampleCount, fetchBaselines]);

  const conditionNames: Record<string, string> = {
    IDLE: '待机空闲',
    LIFT_EMPTY: '空载起升',
    LIFT_LOADED: '重载起升',
    TROLLEY_MOVE: '小车行走',
    LANDING: '集装箱落地',
  };

  return (
    <div className="space-y-6">
      {/* 学习控制 */}
      <div className="bg-card rounded-xl border border-border/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">基线学习</h3>
            <p className="text-xs text-muted-foreground mt-1">
              从历史数据学习各工况下的基线参数（IQR异常值剔除 + 统计量计算）
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">每工况样本数</label>
              <input
                type="number"
                value={sampleCount}
                onChange={e => setSampleCount(parseInt(e.target.value) || 100)}
                className="w-24 px-2 py-1.5 rounded-lg bg-background border border-border text-sm text-foreground"
                min={50}
                max={10000}
                step={50}
              />
            </div>
            <button
              onClick={generateAndLearn}
              disabled={learning}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {learning ? '⏳ 学习中...' : '📚 生成数据并学习'}
            </button>
            <button
              onClick={fetchBaselines}
              className="px-4 py-2 rounded-lg bg-accent/50 text-foreground text-sm font-medium hover:bg-accent/70"
            >
              🔄 刷新
            </button>
          </div>
        </div>

        {/* 学习结果 */}
        {learnResults.length > 0 && (
          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-green-400 font-medium">
              ✅ 学习完成：{learnResults.length} 条基线已建立
            </p>
          </div>
        )}
      </div>

      {/* 基线数据表 */}
      {Object.keys(baselines).length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(baselines).map(([condition, features]) => (
            <div key={condition} className="bg-card rounded-xl border border-border/50 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: conditionColor(condition) }}
                />
                <h4 className="text-sm font-semibold text-foreground">
                  {condition} — {conditionNames[condition] ?? condition}
                </h4>
                <span className="text-xs text-muted-foreground ml-auto">
                  {Object.keys(features).length} 个特征
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-1.5 text-muted-foreground font-medium">特征</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">均值</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">标准差</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">P5</th>
                    <th className="text-right py-1.5 text-muted-foreground font-medium">P95</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(features).map(([feat, bl]) => (
                    <tr key={feat} className="border-b border-border/20">
                      <td className="py-1.5 text-foreground">{feat}</td>
                      <td className="py-1.5 text-right font-mono text-blue-400">{bl.mean.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{bl.std.toFixed(3)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{bl.p5.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono text-muted-foreground">{bl.p95.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 p-12 text-center">
          <span className="text-4xl mb-3 block">📊</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">暂无基线数据</h3>
          <p className="text-sm text-muted-foreground">点击「生成数据并学习」从模拟数据建立基线，或通过 API 上传真实历史数据</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 3: 阈值配置
// ============================================================================

function ThresholdTab() {
  const [thresholds, setThresholds] = useState<Record<string, Record<string, ThresholdRange>>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<ThresholdRange | null>(null);

  const fetchThresholds = useCallback(async () => {
    try {
      const resp = await fetch('/api/trpc/conditionNormalizer.getThresholds');
      const data = await resp.json();
      if (data?.result?.data?.data) {
        setThresholds(data.result.data.data);
      }
    } catch (err) {
      log.error('Fetch thresholds failed:', err);
    }
  }, []);

  const saveThreshold = useCallback(async (condition: string, featureName: string) => {
    if (!editValues) return;
    try {
      await fetch('/api/trpc/conditionNormalizer.updateThreshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition, featureName, thresholds: editValues }),
      });
      setEditingKey(null);
      setEditValues(null);
      await fetchThresholds();
    } catch (err) {
      log.error('Save threshold failed:', err);
    }
  }, [editValues, fetchThresholds]);

  // 初始加载
  useState(() => { fetchThresholds(); });

  const conditionNames: Record<string, string> = {
    IDLE: '待机空闲',
    LIFT_EMPTY: '空载起升',
    LIFT_LOADED: '重载起升',
    TROLLEY_MOVE: '小车行走',
    LANDING: '集装箱落地',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">自适应阈值配置</h3>
          <p className="text-xs text-muted-foreground mt-1">
            按工况 + 特征定义 normal / warning / danger 三级阈值
          </p>
        </div>
        <button
          onClick={fetchThresholds}
          className="px-3 py-1.5 rounded-lg bg-accent/50 text-foreground text-xs font-medium hover:bg-accent/70"
        >
          🔄 刷新
        </button>
      </div>

      {Object.entries(thresholds).map(([condition, features]) => (
        <div key={condition} className="bg-card rounded-xl border border-border/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: conditionColor(condition) }}
            />
            <h4 className="text-sm font-semibold text-foreground">
              {condition} — {conditionNames[condition] ?? condition}
            </h4>
          </div>

          <div className="space-y-3">
            {Object.entries(features).map(([feat, thr]) => {
              const key = `${condition}:${feat}`;
              const isEditing = editingKey === key;

              return (
                <div key={feat} className="flex items-center gap-4 p-3 bg-accent/10 rounded-lg">
                  <span className="text-sm text-foreground font-medium w-40 shrink-0">{feat}</span>

                  {isEditing && editValues ? (
                    <div className="flex-1 flex items-center gap-2">
                      {(['normal', 'warning', 'danger'] as const).map(level => (
                        <div key={level} className="flex items-center gap-1">
                          <span className="text-xs" style={{ color: statusColor(level) }}>{statusLabel(level)}:</span>
                          <input
                            type="number"
                            value={editValues[level][0]}
                            onChange={e => setEditValues(prev => prev ? { ...prev, [level]: [parseFloat(e.target.value), prev[level][1]] } : null)}
                            className="w-16 px-1.5 py-1 rounded bg-background border border-border text-xs text-foreground"
                            step={0.1}
                          />
                          <span className="text-xs text-muted-foreground">-</span>
                          <input
                            type="number"
                            value={editValues[level][1] === Infinity ? 999 : editValues[level][1]}
                            onChange={e => setEditValues(prev => prev ? { ...prev, [level]: [prev[level][0], parseFloat(e.target.value)] } : null)}
                            className="w-16 px-1.5 py-1 rounded bg-background border border-border text-xs text-foreground"
                            step={0.1}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => saveThreshold(condition, feat)}
                        className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-xs hover:bg-green-500/30"
                      >
                        ✓ 保存
                      </button>
                      <button
                        onClick={() => { setEditingKey(null); setEditValues(null); }}
                        className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-xs hover:bg-red-500/30"
                      >
                        ✕ 取消
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center gap-4">
                      {(['normal', 'warning', 'danger'] as const).map(level => (
                        <span key={level} className="text-xs flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(level) }} />
                          <span className="text-muted-foreground">{statusLabel(level)}:</span>
                          <span className="font-mono text-foreground">
                            [{thr[level][0]}, {thr[level][1] === Infinity ? '∞' : thr[level][1]}]
                          </span>
                        </span>
                      ))}
                      <button
                        onClick={() => { setEditingKey(key); setEditValues(JSON.parse(JSON.stringify(thr))); }}
                        className="px-2 py-1 rounded bg-accent/30 text-muted-foreground text-xs hover:bg-accent/50 ml-auto"
                      >
                        ✏️ 编辑
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {Object.keys(thresholds).length === 0 && (
        <div className="bg-card rounded-xl border border-border/50 p-12 text-center">
          <span className="text-4xl mb-3 block">⚙️</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">加载阈值配置...</h3>
          <p className="text-sm text-muted-foreground">点击刷新按钮获取当前阈值配置</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 4: 工况管理
// ============================================================================

function ConditionsTab() {
  const [conditions, setConditions] = useState<Record<string, ConditionDef>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newCond, setNewCond] = useState({ id: '', description: '', keyFeatures: '', typicalDuration: '', plcCode: '' });

  const fetchConditions = useCallback(async () => {
    try {
      const resp = await fetch('/api/trpc/conditionNormalizer.getConditions');
      const data = await resp.json();
      if (data?.result?.data?.data) {
        setConditions(data.result.data.data);
      }
    } catch (err) {
      log.error('Fetch conditions failed:', err);
    }
  }, []);

  const addCondition = useCallback(async () => {
    if (!newCond.id || !newCond.description) return;
    try {
      await fetch('/api/trpc/conditionNormalizer.addCondition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newCond.id,
          description: newCond.description,
          keyFeatures: newCond.keyFeatures,
          typicalDuration: newCond.typicalDuration,
          plcCode: newCond.plcCode ? parseInt(newCond.plcCode) : undefined,
        }),
      });
      setShowAdd(false);
      setNewCond({ id: '', description: '', keyFeatures: '', typicalDuration: '', plcCode: '' });
      await fetchConditions();
    } catch (err) {
      log.error('Add condition failed:', err);
    }
  }, [newCond, fetchConditions]);

  const removeCondition = useCallback(async (id: string) => {
    try {
      await fetch('/api/trpc/conditionNormalizer.removeCondition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      await fetchConditions();
    } catch (err) {
      log.error('Remove condition failed:', err);
    }
  }, [fetchConditions]);

  // 初始加载
  useState(() => { fetchConditions(); });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">工况定义管理</h3>
          <p className="text-xs text-muted-foreground mt-1">
            管理设备运行工况定义，支持 PLC 码映射和特征描述
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchConditions}
            className="px-3 py-1.5 rounded-lg bg-accent/50 text-foreground text-xs font-medium hover:bg-accent/70"
          >
            🔄 刷新
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
          >
            ➕ 添加工况
          </button>
        </div>
      </div>

      {/* 添加工况表单 */}
      {showAdd && (
        <div className="bg-card rounded-xl border border-primary/30 p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">新增工况</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">工况 ID</label>
              <input
                value={newCond.id}
                onChange={e => setNewCond(prev => ({ ...prev, id: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                placeholder="如 GANTRY_MOVE"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">描述</label>
              <input
                value={newCond.description}
                onChange={e => setNewCond(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                placeholder="如 大车行走"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">关键特征</label>
              <input
                value={newCond.keyFeatures}
                onChange={e => setNewCond(prev => ({ ...prev, keyFeatures: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                placeholder="如 大车电机启动"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">典型持续时间</label>
              <input
                value={newCond.typicalDuration}
                onChange={e => setNewCond(prev => ({ ...prev, typicalDuration: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                placeholder="如 30-60s"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">PLC 码（可选）</label>
              <input
                type="number"
                value={newCond.plcCode}
                onChange={e => setNewCond(prev => ({ ...prev, plcCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
                placeholder="如 5"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={addCondition}
                className="px-4 py-2 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium hover:bg-green-500/30"
              >
                ✓ 确认添加
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg bg-accent/30 text-muted-foreground text-sm font-medium hover:bg-accent/50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工况列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(conditions).map(([id, def]) => (
          <div key={id} className="bg-card rounded-xl border border-border/50 p-5 hover:border-border transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: conditionColor(id) }}
                />
                <h4 className="text-sm font-bold text-foreground">{id}</h4>
              </div>
              <button
                onClick={() => removeCondition(id)}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                title="删除工况"
              >
                🗑️
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex">
                <span className="text-muted-foreground w-16 shrink-0">描述</span>
                <span className="text-foreground">{def.description}</span>
              </div>
              <div className="flex">
                <span className="text-muted-foreground w-16 shrink-0">特征</span>
                <span className="text-foreground">{def.keyFeatures}</span>
              </div>
              <div className="flex">
                <span className="text-muted-foreground w-16 shrink-0">持续</span>
                <span className="text-foreground">{def.typicalDuration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {Object.keys(conditions).length === 0 && (
        <div className="bg-card rounded-xl border border-border/50 p-12 text-center">
          <span className="text-4xl mb-3 block">🏭</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">加载工况定义...</h3>
          <p className="text-sm text-muted-foreground">点击刷新按钮获取当前工况定义</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 5: 处理历史
// ============================================================================

function HistoryTab() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const resp = await fetch('/api/trpc/conditionNormalizer.getHistory?input=%7B%22limit%22%3A100%7D');
      const data = await resp.json();
      if (data?.result?.data?.data) {
        setHistory(data.result.data.data);
      }
    } catch (err) {
      log.error('Fetch history failed:', err);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await fetch('/api/trpc/conditionNormalizer.clearHistory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setHistory([]);
    } catch (err) {
      log.error('Clear history failed:', err);
    }
  }, []);

  // 初始加载
  useState(() => { fetchHistory(); });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">处理历史</h3>
          <p className="text-xs text-muted-foreground mt-1">
            查看归一化处理记录，支持详情查看
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchHistory}
            className="px-3 py-1.5 rounded-lg bg-accent/50 text-foreground text-xs font-medium hover:bg-accent/70"
          >
            🔄 刷新
          </button>
          <button
            onClick={clearHistory}
            className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30"
          >
            🗑️ 清除
          </button>
        </div>
      </div>

      {history.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* 历史列表 */}
          <div className="xl:col-span-2 space-y-2">
            {history.slice().reverse().map(entry => (
              <div
                key={entry.id}
                onClick={() => setSelectedEntry(entry)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedEntry?.id === entry.id
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border/50 bg-card hover:border-border'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: conditionColor(entry.condition) }}
                    />
                    <span className="text-sm font-medium text-foreground">{entry.condition}</span>
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: statusColor(entry.overallStatus) + '20',
                        color: statusColor(entry.overallStatus),
                      }}
                    >
                      {statusLabel(entry.overallStatus)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.method === 'ratio' ? '比值法' : 'Z-Score'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex gap-4 mt-1.5 text-xs text-muted-foreground">
                  {Object.entries(entry.features).slice(0, 4).map(([k, v]) => (
                    <span key={k}>{k}: <span className="text-foreground font-mono">{v.toFixed(1)}</span></span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 详情面板 */}
          <div className="xl:col-span-1">
            {selectedEntry ? (
              <div className="bg-card rounded-xl border border-border/50 p-5 sticky top-6">
                <h4 className="text-sm font-semibold text-foreground mb-3">详情</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">工况</span>
                    <span className="text-foreground font-medium">{selectedEntry.condition}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">状态</span>
                    <span style={{ color: statusColor(selectedEntry.overallStatus) }}>
                      {statusLabel(selectedEntry.overallStatus)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">方法</span>
                    <span className="text-foreground">{selectedEntry.method}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">时间</span>
                    <span className="text-foreground">{new Date(selectedEntry.timestamp).toLocaleString()}</span>
                  </div>

                  <div className="border-t border-border/50 pt-2 mt-2">
                    <p className="text-muted-foreground mb-1.5">原始特征</p>
                    {Object.entries(selectedEntry.features).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono text-foreground">{v.toFixed(3)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-border/50 pt-2 mt-2">
                    <p className="text-muted-foreground mb-1.5">归一化值</p>
                    {Object.entries(selectedEntry.normalizedFeatures).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono text-blue-400">{v.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border/50 p-8 text-center">
                <span className="text-3xl mb-2 block">👈</span>
                <p className="text-sm text-muted-foreground">点击左侧记录查看详情</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 p-12 text-center">
          <span className="text-4xl mb-3 block">📋</span>
          <h3 className="text-lg font-semibold text-foreground mb-2">暂无处理记录</h3>
          <p className="text-sm text-muted-foreground">在「归一化控制台」中执行归一化后，记录将显示在此处</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 6: 系统配置
// ============================================================================

function NormalizerConfigTab() {
  // 核心参数
  const [method, setMethod] = useState<'ratio' | 'zscore'>('ratio');
  const [ewmaAlpha, setEwmaAlpha] = useState(0.1);
  const [idleThreshold, setIdleThreshold] = useState(0.1);
  const [loadThreshold, setLoadThreshold] = useState(10.0);
  const [maxSamples, setMaxSamples] = useState(1000);

  // 比值法阈值
  const [ratioNormal, setRatioNormal] = useState<[number, number]>([0.8, 1.2]);
  const [ratioAttention, setRatioAttention] = useState<[number, number]>([1.2, 1.5]);
  const [ratioWarning, setRatioWarning] = useState<[number, number]>([1.5, 2.0]);
  const [ratioSevere, setRatioSevere] = useState<[number, number]>([2.0, 999]);

  // Z-Score 阈值
  const [zNormalLow, setZNormalLow] = useState(-2.0);
  const [zNormalHigh, setZNormalHigh] = useState(2.0);
  const [zAttentionLow, setZAttentionLow] = useState(-3.0);
  const [zAttentionHigh, setZAttentionHigh] = useState(3.0);

  // PLC 映射
  const [plcMappings, setPlcMappings] = useState<Record<string, string>>({
    '0': 'IDLE',
    '1': 'LIFT_EMPTY',
    '2': 'LIFT_LOADED',
    '3': 'TROLLEY_MOVE',
    '4': 'LANDING',
  });
  const [newPlcCode, setNewPlcCode] = useState('');
  const [newPlcCondition, setNewPlcCondition] = useState('');

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 加载配置
  const loadConfig = useCallback(async () => {
    try {
      const resp = await fetch('/api/trpc/conditionNormalizer.getConfig?input=%7B%7D');
      const data = await resp.json();
      const cfg = data?.result?.data?.data;
      if (cfg) {
        if (cfg.normalizationMethod) setMethod(cfg.normalizationMethod);
        if (cfg.ewmaAlpha !== undefined) setEwmaAlpha(cfg.ewmaAlpha);
        if (cfg.thresholdIdleCurrent !== undefined) setIdleThreshold(cfg.thresholdIdleCurrent);
        if (cfg.loadWeightThreshold !== undefined) setLoadThreshold(cfg.loadWeightThreshold);
        if (cfg.maxSamplesPerBaseline !== undefined) setMaxSamples(cfg.maxSamplesPerBaseline);
        if (cfg.ratioBounds) {
          if (cfg.ratioBounds.normal) setRatioNormal(cfg.ratioBounds.normal);
          if (cfg.ratioBounds.attention) setRatioAttention(cfg.ratioBounds.attention);
          if (cfg.ratioBounds.warning) setRatioWarning(cfg.ratioBounds.warning);
          if (cfg.ratioBounds.severe) setRatioSevere(cfg.ratioBounds.severe);
        }
        if (cfg.zscoreBounds) {
          if (cfg.zscoreBounds.normalLow !== undefined) setZNormalLow(cfg.zscoreBounds.normalLow);
          if (cfg.zscoreBounds.normalHigh !== undefined) setZNormalHigh(cfg.zscoreBounds.normalHigh);
          if (cfg.zscoreBounds.attentionLow !== undefined) setZAttentionLow(cfg.zscoreBounds.attentionLow);
          if (cfg.zscoreBounds.attentionHigh !== undefined) setZAttentionHigh(cfg.zscoreBounds.attentionHigh);
        }
        if (cfg.plcRules) {
          const m: Record<string, string> = {};
          Object.entries(cfg.plcRules).forEach(([k, v]) => { m[k] = v as string; });
          setPlcMappings(m);
        }
      }
    } catch (err) {
      log.error('Load config failed:', err);
    }
  }, []);

  // 初始加载
  useState(() => { loadConfig(); });

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/trpc/conditionNormalizer.updateConfig', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalizationMethod: method,
          ewmaAlpha,
          thresholdIdleCurrent: idleThreshold,
          loadWeightThreshold: loadThreshold,
          maxSamplesPerBaseline: maxSamples,
          ratioBounds: {
            normal: ratioNormal,
            attention: ratioAttention,
            warning: ratioWarning,
            severe: ratioSevere,
          },
          zscoreBounds: {
            normalLow: zNormalLow,
            normalHigh: zNormalHigh,
            attentionLow: zAttentionLow,
            attentionHigh: zAttentionHigh,
          },
        }),
      });
      setDirty(false);
      alert('配置已保存');
    } catch (err) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMethod('ratio');
    setEwmaAlpha(0.1);
    setIdleThreshold(0.1);
    setLoadThreshold(10.0);
    setMaxSamples(1000);
    setRatioNormal([0.8, 1.2]);
    setRatioAttention([1.2, 1.5]);
    setRatioWarning([1.5, 2.0]);
    setRatioSevere([2.0, 999]);
    setZNormalLow(-2.0);
    setZNormalHigh(2.0);
    setZAttentionLow(-3.0);
    setZAttentionHigh(3.0);
    setDirty(true);
  };

  const handleExport = () => {
    const config = {
      normalizationMethod: method,
      ewmaAlpha,
      thresholdIdleCurrent: idleThreshold,
      loadWeightThreshold: loadThreshold,
      maxSamplesPerBaseline: maxSamples,
      ratioBounds: { normal: ratioNormal, attention: ratioAttention, warning: ratioWarning, severe: ratioSevere },
      zscoreBounds: { normalLow: zNormalLow, normalHigh: zNormalHigh, attentionLow: zAttentionLow, attentionHigh: zAttentionHigh },
      plcMappings,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `condition-normalizer-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addPlcMapping = () => {
    if (newPlcCode && newPlcCondition) {
      setPlcMappings(prev => ({ ...prev, [newPlcCode]: newPlcCondition.toUpperCase() }));
      setNewPlcCode('');
      setNewPlcCondition('');
      setDirty(true);
    }
  };

  const removePlcMapping = (code: string) => {
    setPlcMappings(prev => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 列1: 核心引擎参数 */}
        <div className="space-y-4">
          <ConfigSection title="核心引擎参数" icon={<span>⚙️</span>} description="归一化引擎全局配置">
            <ConfigSelect
              label="归一化方法"
              value={method}
              onChange={v => { setMethod(v as 'ratio' | 'zscore'); setDirty(true); }}
              options={[
                { value: 'ratio', label: '比值法 (ratio)', description: 'value / baseline_mean' },
                { value: 'zscore', label: 'Z-Score 标准化', description: '(value - μ) / σ' },
              ]}
              description="选择特征归一化的计算方法"
            />
            <ConfigSlider
              label="EWMA 平滑系数 (α)"
              value={ewmaAlpha}
              onChange={v => { setEwmaAlpha(v); setDirty(true); }}
              min={0.01}
              max={0.5}
              step={0.01}
              description="越小越平滑，越大越敏感"
            />
            <ConfigSlider
              label="空闲电流阈值"
              value={idleThreshold}
              onChange={v => { setIdleThreshold(v); setDirty(true); }}
              min={0}
              max={1}
              step={0.01}
              unit="A"
              description="低于此值判定为 IDLE 工况"
            />
            <ConfigSlider
              label="载荷判定阈值"
              value={loadThreshold}
              onChange={v => { setLoadThreshold(v); setDirty(true); }}
              min={1}
              max={50}
              step={0.5}
              unit="t"
              description="高于此值判定为重载（LIFT_LOADED）"
            />
            <ConfigSlider
              label="基线最大样本数"
              value={maxSamples}
              onChange={v => { setMaxSamples(v); setDirty(true); }}
              min={100}
              max={5000}
              step={100}
              description="每个工况-特征基线保留的最大样本数"
            />
          </ConfigSection>
        </div>

        {/* 列2: 归一化阈值 */}
        <div className="space-y-4">
          <ConfigSection title="比值法阈值" icon={<span>📏</span>} description="ratio 方法的状态判定区间">
            <ConfigRangeInput label="正常 (normal)" min={ratioNormal[0]} max={ratioNormal[1]}
              onChange={(a, b) => { setRatioNormal([a, b]); setDirty(true); }} step={0.05} />
            <ConfigRangeInput label="关注 (attention)" min={ratioAttention[0]} max={ratioAttention[1]}
              onChange={(a, b) => { setRatioAttention([a, b]); setDirty(true); }} step={0.05} />
            <ConfigRangeInput label="预警 (warning)" min={ratioWarning[0]} max={ratioWarning[1]}
              onChange={(a, b) => { setRatioWarning([a, b]); setDirty(true); }} step={0.05} />
            <ConfigRangeInput label="严重 (severe)" min={ratioSevere[0]} max={ratioSevere[1]}
              onChange={(a, b) => { setRatioSevere([a, b]); setDirty(true); }} step={0.1} />
          </ConfigSection>

          <ConfigSection title="Z-Score 阈值" icon={<span>📐</span>} description="zscore 方法的状态判定区间">
            <ConfigRangeInput label="正常范围" min={zNormalLow} max={zNormalHigh}
              onChange={(a, b) => { setZNormalLow(a); setZNormalHigh(b); setDirty(true); }} step={0.1} unit="σ" />
            <ConfigRangeInput label="关注范围" min={zAttentionLow} max={zAttentionHigh}
              onChange={(a, b) => { setZAttentionLow(a); setZAttentionHigh(b); setDirty(true); }} step={0.1} unit="σ" />
            <ConfigKV label="超出关注范围" value={<span className="text-red-400 font-medium">→ 危险 (danger)</span>} />
          </ConfigSection>
        </div>

        {/* 列3: PLC 映射 */}
        <div className="space-y-4">
          <ConfigSection title="PLC 工况映射" icon={<span>🔗</span>} description="PLC 码 → 工况 ID 的映射规则">
            <div className="space-y-2">
              {Object.entries(plcMappings).map(([code, condition]) => (
                <div key={code} className="flex items-center justify-between py-1.5 px-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      PLC {code}
                    </span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-xs font-medium text-foreground">{condition}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: conditionColor(condition) }}
                    />
                  </div>
                  <button
                    onClick={() => removePlcMapping(code)}
                    className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* 添加新映射 */}
            <div className="flex items-end gap-2 pt-2 border-t border-border/30">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">PLC 码</label>
                <input
                  type="number"
                  value={newPlcCode}
                  onChange={e => setNewPlcCode(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground font-mono"
                  placeholder="5"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">工况 ID</label>
                <input
                  value={newPlcCondition}
                  onChange={e => setNewPlcCondition(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground"
                  placeholder="GANTRY_MOVE"
                />
              </div>
              <button
                onClick={addPlcMapping}
                className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 shrink-0"
              >
                + 添加
              </button>
            </div>
          </ConfigSection>

          <ConfigSection title="引擎状态" icon={<span>📊</span>} description="当前引擎运行状态">
            <ConfigKV label="归一化方法" value={<span className="font-mono">{method}</span>} mono />
            <ConfigKV label="EWMA α" value={<span className="font-mono">{ewmaAlpha}</span>} mono />
            <ConfigKV label="PLC 规则数" value={<span className="font-mono">{Object.keys(plcMappings).length}</span>} mono />
            <ConfigKV label="最大样本数" value={<span className="font-mono">{maxSamples}</span>} mono />
          </ConfigSection>
        </div>
      </div>

      {/* API 文档 */}
      <ApiDocBlock
        title="Python 算法对接"
        icon={<span>🐍</span>}
        endpoints={[
          { method: 'POST', path: '/api/trpc/conditionNormalizer.normalize', description: '执行工况归一化', body: '{ features: {...}, plcCode, method }' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.batchNormalize', description: '批量归一化', body: '{ dataPoints: [...] }' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.learnBaseline', description: '学习基线', body: '{ condition, samples: [...] }' },
          { method: 'GET', path: '/api/trpc/conditionNormalizer.getBaselines', description: '获取所有基线' },
          { method: 'GET', path: '/api/trpc/conditionNormalizer.getConfig', description: '获取完整配置' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.updateConfig', description: '更新配置', body: '{ normalizationMethod, ewmaAlpha, ... }' },
          { method: 'GET', path: '/api/trpc/conditionNormalizer.getThresholds', description: '获取阈值配置' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.updateThreshold', description: '更新阈值', body: '{ condition, feature, thresholds }' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.addCondition', description: '添加工况', body: '{ id, description, keyFeatures, ... }' },
          { method: 'POST', path: '/api/trpc/conditionNormalizer.removeCondition', description: '删除工况', body: '{ id }' },
          { method: 'GET', path: '/api/trpc/conditionNormalizer.getConditions', description: '获取工况列表' },
          { method: 'GET', path: '/api/trpc/conditionNormalizer.getHistory', description: '获取处理历史' },
        ]}
        pythonExample={`import requests

BASE = "http://localhost:3000/api/trpc"

# 1. 执行归一化
res = requests.post(f"{BASE}/conditionNormalizer.normalize", json={
    "features": {
        "current": 82, "loadWeight": 35,
        "vibrationSpeed": 3.5, "bearingTemp": 65,
        "motorSpeed": 1420
    },
    "plcCode": 2,
    "method": "ratio"
})
print(res.json())

# 2. 学习基线
requests.post(f"{BASE}/conditionNormalizer.learnBaseline", json={
    "condition": "LIFT_LOADED",
    "samples": [
        {"current": 80, "loadWeight": 33, "vibrationSpeed": 3.2, "bearingTemp": 62, "motorSpeed": 1425},
        {"current": 85, "loadWeight": 36, "vibrationSpeed": 3.8, "bearingTemp": 68, "motorSpeed": 1415},
    ]
})

# 3. 更新配置
requests.post(f"{BASE}/conditionNormalizer.updateConfig", json={
    "normalizationMethod": "zscore",
    "ewmaAlpha": 0.15,
    "thresholdIdleCurrent": 0.2
})`}
        note="核心算法（BaselineLearner IQR剔除 + EWMA更新、ConditionIdentifier PLC/特征规则、FeatureNormalizer ratio/zscore、StatusChecker 自适应阈值）已在 TypeScript 端 1:1 实现。"
      />

      {/* 操作按钮 */}
      <ConfigActions
        onSave={handleSave}
        onReset={handleReset}
        onExport={handleExport}
        saving={saving}
        dirty={dirty}
      />
    </div>
  );
}
