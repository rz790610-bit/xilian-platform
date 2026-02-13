/**
 * SHM 传感器数据预览页面
 * 展示真实的应力 24 通道时序波形 + 温度数据 + 统计表格
 * 数据来源: 传感器 1904000115（应力）和 1903000114（温度）
 */
import { useState, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import {
  Activity, Thermometer, BarChart3, Table2, ArrowLeft,
  TrendingUp, TrendingDown, Minus, Waves, Zap, Info,
} from 'lucide-react';
import { Link } from 'wouter';

// 注册 Chart.js 组件
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// 导入解析后的 JSON 数据
import stressData from '@/data/shm-stress-data.json';
import summaryData from '@/data/shm-summary.json';

// ============ 类型定义 ============
interface ChannelFile {
  timestamp: string;
  meanValue: number;
  pointCount: number;
  min: number;
  max: number;
  data: number[];
}

interface Channel {
  channelId: string;
  channelName: string;
  files: ChannelFile[];
  stats?: {
    totalPoints: number;
    globalMin: number;
    globalMax: number;
    globalMean: number;
  };
}

interface ChannelSummary {
  channelId: string;
  channelName: string;
  mean: number;
  min: number;
  max: number;
  totalPoints: number;
}

// ============ 颜色方案 ============
const CHANNEL_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
  '#0ea5e9', '#22c55e', '#a855f7', '#f43f5e', '#0891b2', '#65a30d',
  '#d946ef', '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
];

// ============ 统计卡片组件 ============
function StatCard({ icon, label, value, unit, color }: {
  icon: React.ReactNode; label: string; value: string | number; unit?: string; color: string;
}) {
  return (
    <div className={`${color} rounded-lg p-3 border border-white/5`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-lg font-semibold text-white">
        {value}{unit && <span className="text-xs text-gray-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

// ============ 通道选择器 ============
function ChannelSelector({ channels, selected, onToggle, onSelectAll, onClearAll }: {
  channels: ChannelSummary[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" variant="outline" onClick={onSelectAll} className="text-xs h-6 px-2">全选</Button>
        <Button size="sm" variant="outline" onClick={onClearAll} className="text-xs h-6 px-2">清空</Button>
        <span className="text-xs text-gray-500">已选 {selected.size}/{channels.length} 通道</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {channels.map((ch, i) => (
          <button
            key={ch.channelId}
            onClick={() => onToggle(ch.channelId)}
            className={`text-xs px-2 py-1.5 rounded border transition-all ${
              selected.has(ch.channelId)
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                : 'border-gray-700 bg-gray-800/50 text-gray-500 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selected.has(ch.channelId) ? CHANNEL_COLORS[i % 24] : '#4b5563' }} />
              <span>CH{ch.channelId}</span>
            </div>
            <div className="text-[10px] mt-0.5 opacity-70">{ch.mean.toFixed(1)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============ 波形图组件 ============
function WaveformChart({ channels, selectedIds, fileIndex }: {
  channels: Channel[];
  selectedIds: Set<string>;
  fileIndex: number;
}) {
  const chartData = useMemo(() => {
    const selectedChannels = channels.filter(ch => selectedIds.has(ch.channelId));
    if (selectedChannels.length === 0) return null;

    // 使用第一个选中通道的数据长度作为 x 轴
    const firstCh = selectedChannels[0];
    const file = firstCh.files[fileIndex];
    if (!file) return null;

    const pointCount = file.data.length;
    const timeStep = 1 / 20 * 10; // 降采样后每点间隔 0.5s
    const labels = Array.from({ length: pointCount }, (_, i) => (i * timeStep).toFixed(1));

    const datasets = selectedChannels.map((ch, idx) => {
      const colorIndex = channels.findIndex(c => c.channelId === ch.channelId);
      const color = CHANNEL_COLORS[colorIndex % 24];
      const fileData = ch.files[fileIndex];
      return {
        label: `CH${ch.channelId} (${fileData?.meanValue?.toFixed(2) || '?'} MPa)`,
        data: fileData?.data || [],
        borderColor: color,
        backgroundColor: color + '20',
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      };
    });

    return { labels, datasets };
  }, [channels, selectedIds, fileIndex]);

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Info className="w-5 h-5 mr-2" /> 请选择至少一个通道
      </div>
    );
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 } as const,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12, padding: 8 },
      },
      tooltip: {
        backgroundColor: '#1f2937',
        titleColor: '#f3f4f6',
        bodyColor: '#d1d5db',
        borderColor: '#374151',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        title: { display: true, text: '时间 (s)', color: '#6b7280', font: { size: 11 } },
        ticks: { color: '#6b7280', maxTicksLimit: 15, font: { size: 10 } },
        grid: { color: '#1f2937' },
      },
      y: {
        title: { display: true, text: '应力 (MPa)', color: '#6b7280', font: { size: 11 } },
        ticks: { color: '#6b7280', font: { size: 10 } },
        grid: { color: '#1f2937' },
      },
    },
  };

  return (
    <div className="h-[400px]">
      <Line data={chartData} options={options} />
    </div>
  );
}

// ============ 通道统计表格 ============
function ChannelStatsTable({ summaries }: { summaries: ChannelSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-2 px-3 text-gray-400 font-medium">通道</th>
            <th className="text-right py-2 px-3 text-gray-400 font-medium">均值 (MPa)</th>
            <th className="text-right py-2 px-3 text-gray-400 font-medium">最小值</th>
            <th className="text-right py-2 px-3 text-gray-400 font-medium">最大值</th>
            <th className="text-right py-2 px-3 text-gray-400 font-medium">极差</th>
            <th className="text-right py-2 px-3 text-gray-400 font-medium">数据点</th>
            <th className="text-center py-2 px-3 text-gray-400 font-medium">趋势</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((ch, i) => {
            const range = ch.max - ch.min;
            return (
              <tr key={ch.channelId} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[i % 24] }} />
                    <span className="text-gray-200 font-mono">{ch.channelName}</span>
                  </div>
                </td>
                <td className="text-right py-2 px-3 font-mono text-gray-200">{ch.mean.toFixed(4)}</td>
                <td className="text-right py-2 px-3 font-mono text-blue-400">{ch.min.toFixed(4)}</td>
                <td className="text-right py-2 px-3 font-mono text-red-400">{ch.max.toFixed(4)}</td>
                <td className="text-right py-2 px-3 font-mono text-yellow-400">{range.toFixed(4)}</td>
                <td className="text-right py-2 px-3 font-mono text-gray-400">{ch.totalPoints.toLocaleString()}</td>
                <td className="text-center py-2 px-3">
                  {ch.mean > 0 ? (
                    <TrendingUp className="w-4 h-4 text-red-400 inline" />
                  ) : ch.mean < -30 ? (
                    <TrendingDown className="w-4 h-4 text-blue-400 inline" />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-500 inline" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============ 通道均值柱状图 ============
function ChannelMeanChart({ summaries }: { summaries: ChannelSummary[] }) {
  const chartData = useMemo(() => ({
    labels: summaries.map(ch => `CH${ch.channelId}`),
    datasets: [
      {
        label: '均值 (MPa)',
        data: summaries.map(ch => ch.mean),
        backgroundColor: summaries.map((_, i) => CHANNEL_COLORS[i % 24] + '80'),
        borderColor: summaries.map((_, i) => CHANNEL_COLORS[i % 24]),
        borderWidth: 1,
        pointRadius: 4,
        pointBackgroundColor: summaries.map((_, i) => CHANNEL_COLORS[i % 24]),
      },
      {
        label: '最小值',
        data: summaries.map(ch => ch.min),
        borderColor: '#3b82f680',
        backgroundColor: '#3b82f610',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      },
      {
        label: '最大值',
        data: summaries.map(ch => ch.max),
        borderColor: '#ef444480',
        backgroundColor: '#ef444410',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      },
    ],
  }), [summaries]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: { color: '#9ca3af', font: { size: 10 }, boxWidth: 12 },
      },
    },
    scales: {
      x: {
        ticks: { color: '#6b7280', font: { size: 10 } },
        grid: { color: '#1f2937' },
      },
      y: {
        title: { display: true, text: 'MPa', color: '#6b7280' },
        ticks: { color: '#6b7280', font: { size: 10 } },
        grid: { color: '#1f2937' },
      },
    },
  };

  return (
    <div className="h-[300px]">
      <Line data={chartData} options={options} />
    </div>
  );
}

// ============ 主页面组件 ============
export default function SHMDataPreview() {
  const [activeTab, setActiveTab] = useState('waveform');
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(
    () => new Set(['01', '02', '03', '04', '05', '06'])
  );
  const [fileIndex, setFileIndex] = useState(0);

  const channels = stressData.channels as Channel[];
  const channelSummaries = summaryData.stress.channelSummary as ChannelSummary[];
  const tempChannels = summaryData.temperature.channels;

  const toggleChannel = useCallback((id: string) => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedChannels(new Set(channelSummaries.map(ch => ch.channelId)));
  }, [channelSummaries]);

  const clearAll = useCallback(() => {
    setSelectedChannels(new Set());
  }, []);

  // 计算全局统计
  const globalStats = useMemo(() => {
    const allMeans = channelSummaries.map(ch => ch.mean);
    const allMins = channelSummaries.map(ch => ch.min);
    const allMaxs = channelSummaries.map(ch => ch.max);
    return {
      totalPoints: channelSummaries.reduce((s, ch) => s + ch.totalPoints, 0),
      globalMin: Math.min(...allMins),
      globalMax: Math.max(...allMaxs),
      meanOfMeans: allMeans.reduce((s, v) => s + v, 0) / allMeans.length,
    };
  }, [channelSummaries]);

  const fileTimestamps = channels[0]?.files.map(f => f.timestamp) || [];

  return (
    <MainLayout title="SHM 数据预览">
      <div className="space-y-4">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/settings/config/access-layer">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> 返回接入层管理
              </Button>
            </Link>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Waves className="w-5 h-5 text-blue-400" />
                结构健康监测数据
              </h2>
              <p className="text-xs text-gray-500">
                传感器 {stressData.sensorId} · {stressData.samplingRate}Hz · {summaryData.stress.timeRange.start} ~ {summaryData.stress.timeRange.end}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-400 border-blue-400/30">
              <Activity className="w-3 h-3 mr-1" /> 应力 · 24CH
            </Badge>
            <Badge variant="outline" className="text-orange-400 border-orange-400/30">
              <Thermometer className="w-3 h-3 mr-1" /> 温度 · {tempChannels[0]?.temperature}°C
            </Badge>
          </div>
        </div>

        {/* 统计概览 */}
        <div className="grid grid-cols-6 gap-3">
          <StatCard icon={<Zap className="w-4 h-4 text-blue-400" />} label="通道数" value={24} color="bg-blue-500/10" />
          <StatCard icon={<Activity className="w-4 h-4 text-emerald-400" />} label="总数据点" value={globalStats.totalPoints.toLocaleString()} color="bg-emerald-500/10" />
          <StatCard icon={<TrendingDown className="w-4 h-4 text-cyan-400" />} label="全局最小" value={globalStats.globalMin.toFixed(2)} unit="MPa" color="bg-cyan-500/10" />
          <StatCard icon={<TrendingUp className="w-4 h-4 text-red-400" />} label="全局最大" value={globalStats.globalMax.toFixed(2)} unit="MPa" color="bg-red-500/10" />
          <StatCard icon={<Thermometer className="w-4 h-4 text-orange-400" />} label="环境温度" value={tempChannels[0]?.temperature || 'N/A'} unit="°C" color="bg-orange-500/10" />
          <StatCard icon={<BarChart3 className="w-4 h-4 text-purple-400" />} label="采样率" value={20} unit="Hz" color="bg-purple-500/10" />
        </div>

        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="waveform" className="text-sm">
              <Waves className="w-3.5 h-3.5 mr-1" /> 时序波形
            </TabsTrigger>
            <TabsTrigger value="overview" className="text-sm">
              <BarChart3 className="w-3.5 h-3.5 mr-1" /> 通道总览
            </TabsTrigger>
            <TabsTrigger value="table" className="text-sm">
              <Table2 className="w-3.5 h-3.5 mr-1" /> 数据表格
            </TabsTrigger>
          </TabsList>

          {/* 时序波形 Tab */}
          <TabsContent value="waveform" className="space-y-3 mt-3">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-gray-300">通道选择</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">时间段:</span>
                    {fileTimestamps.map((ts, i) => (
                      <Button
                        key={i}
                        size="sm"
                        variant={fileIndex === i ? 'default' : 'outline'}
                        onClick={() => setFileIndex(i)}
                        className="text-xs h-6 px-2"
                      >
                        {ts.split(' ')[1]}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ChannelSelector
                  channels={channelSummaries}
                  selected={selectedChannels}
                  onToggle={toggleChannel}
                  onSelectAll={selectAll}
                  onClearAll={clearAll}
                />
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-300">
                  应力时序波形 · {fileTimestamps[fileIndex] || ''}
                  <span className="text-xs text-gray-500 ml-2">
                    (降采样显示, 每10点取1点, 原始 {stressData.samplingRate}Hz)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WaveformChart
                  channels={channels}
                  selectedIds={selectedChannels}
                  fileIndex={fileIndex}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通道总览 Tab */}
          <TabsContent value="overview" className="space-y-3 mt-3">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-300">24 通道应力均值分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ChannelMeanChart summaries={channelSummaries} />
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300">
                    <TrendingUp className="w-4 h-4 inline mr-1 text-red-400" />
                    拉应力通道 (正值)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {channelSummaries.filter(ch => ch.mean > 0).sort((a, b) => b.mean - a.mean).map((ch, i) => (
                      <div key={ch.channelId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[parseInt(ch.channelId) - 1] }} />
                          <span className="text-gray-300 font-mono">{ch.channelName}</span>
                        </div>
                        <span className="text-red-400 font-mono">{ch.mean.toFixed(2)} MPa</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-300">
                    <TrendingDown className="w-4 h-4 inline mr-1 text-blue-400" />
                    压应力通道 (负值)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {channelSummaries.filter(ch => ch.mean < 0).sort((a, b) => a.mean - b.mean).map((ch, i) => (
                      <div key={ch.channelId} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[parseInt(ch.channelId) - 1] }} />
                          <span className="text-gray-300 font-mono">{ch.channelName}</span>
                        </div>
                        <span className="text-blue-400 font-mono">{ch.mean.toFixed(2)} MPa</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 数据表格 Tab */}
          <TabsContent value="table" className="mt-3">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-300">
                  24 通道应力统计数据
                  <span className="text-xs text-gray-500 ml-2">传感器 {stressData.sensorId} · 每通道 3600 点</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChannelStatsTable summaries={channelSummaries} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
