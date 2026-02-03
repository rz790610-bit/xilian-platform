/**
 * 实时延迟图表组件
 * 展示 Kafka 消息延迟的实时变化
 */

import { useMemo } from "react";
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
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";

// 注册 Chart.js 组件
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface LatencyChartProps {
  timestamps: number[];
  latency: number[];
  currentValue: number;
  produceLatency: number;
  consumeLatency: number;
}

export function LatencyChart({
  timestamps,
  latency,
  currentValue,
  produceLatency,
  consumeLatency,
}: LatencyChartProps) {
  // 格式化时间标签
  const labels = useMemo(() => {
    return timestamps.map((ts) => {
      const date = new Date(ts);
      return date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    });
  }, [timestamps]);

  // 计算统计数据
  const stats = useMemo(() => {
    if (latency.length === 0) {
      return { avg: 0, max: 0, p95: 0 };
    }
    const sorted = [...latency].sort((a, b) => a - b);
    const sum = latency.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(sorted.length * 0.95);
    return {
      avg: Math.round(sum / latency.length),
      max: Math.max(...latency),
      p95: sorted[p95Index] || 0,
    };
  }, [latency]);

  // 判断延迟状态
  const getLatencyStatus = (value: number) => {
    if (value < 10) return { status: "good", color: "text-green-500", icon: CheckCircle2 };
    if (value < 50) return { status: "warning", color: "text-yellow-500", icon: AlertTriangle };
    return { status: "critical", color: "text-red-500", icon: AlertTriangle };
  };

  const latencyStatus = getLatencyStatus(currentValue);
  const StatusIcon = latencyStatus.icon;

  // 图表数据
  const chartData = {
    labels,
    datasets: [
      {
        label: "延迟 (ms)",
        data: latency,
        borderColor: "rgb(234, 179, 8)",
        backgroundColor: "rgba(234, 179, 8, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  // 图表配置
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 300,
    },
    interaction: {
      intersect: false,
      mode: "index" as const,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (items: { label: string }[]) => `时间: ${items[0]?.label}`,
          label: (item: { raw: unknown }) => `延迟: ${item.raw} ms`,
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
        ticks: {
          maxTicksLimit: 6,
          color: "#888",
          font: {
            size: 10,
          },
        },
      },
      y: {
        display: true,
        beginAtZero: true,
        grid: {
          color: "rgba(255, 255, 255, 0.1)",
        },
        ticks: {
          color: "#888",
          font: {
            size: 10,
          },
          callback: (value: number | string) => `${value}ms`,
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              消息延迟
            </CardTitle>
            <CardDescription>端到端处理延迟</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={`${latencyStatus.color} border-current`}
          >
            <StatusIcon className="h-3 w-3 mr-1" />
            {latencyStatus.status === "good"
              ? "正常"
              : latencyStatus.status === "warning"
              ? "偏高"
              : "过高"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* 当前值显示 */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className={`text-3xl font-bold ${latencyStatus.color}`}>
            {currentValue}
          </span>
          <span className="text-sm text-muted-foreground">ms</span>
        </div>

        {/* 生产/消费延迟 */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1 p-2 rounded bg-muted/50">
            <p className="text-xs text-muted-foreground">生产延迟</p>
            <p className="font-semibold">{produceLatency} ms</p>
          </div>
          <div className="flex-1 p-2 rounded bg-muted/50">
            <p className="text-xs text-muted-foreground">消费延迟</p>
            <p className="font-semibold">{consumeLatency} ms</p>
          </div>
        </div>

        {/* 图表 */}
        <div className="h-[160px]">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">平均</p>
            <p className="font-semibold">{stats.avg} ms</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">P95</p>
            <p className="font-semibold text-yellow-500">{stats.p95} ms</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">最大</p>
            <p className="font-semibold text-red-500">{stats.max} ms</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
