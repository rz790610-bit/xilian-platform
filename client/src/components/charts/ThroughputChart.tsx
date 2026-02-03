/**
 * 实时吞吐量图表组件
 * 展示 Kafka 消息吞吐量的实时变化
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
import { TrendingUp, Wifi, WifiOff } from "lucide-react";

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

interface ThroughputChartProps {
  timestamps: number[];
  throughput: number[];
  currentValue: number;
  isConnected: boolean;
}

export function ThroughputChart({
  timestamps,
  throughput,
  currentValue,
  isConnected,
}: ThroughputChartProps) {
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
    if (throughput.length === 0) {
      return { avg: 0, max: 0, min: 0 };
    }
    const sum = throughput.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round(sum / throughput.length),
      max: Math.max(...throughput),
      min: Math.min(...throughput),
    };
  }, [throughput]);

  // 图表数据
  const chartData = {
    labels,
    datasets: [
      {
        label: "消息/秒",
        data: throughput,
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
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
          label: (item: { raw: unknown }) => `吞吐量: ${item.raw} msg/s`,
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
          callback: (value: number | string) => `${value}`,
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
              <TrendingUp className="h-4 w-4" />
              消息吞吐量
            </CardTitle>
            <CardDescription>实时消息处理速率</CardDescription>
          </div>
          <Badge
            variant={isConnected ? "default" : "secondary"}
            className={isConnected ? "bg-green-500" : ""}
          >
            {isConnected ? (
              <>
                <Wifi className="h-3 w-3 mr-1" />
                实时
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 mr-1" />
                离线
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* 当前值显示 */}
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold text-blue-500">{currentValue}</span>
          <span className="text-sm text-muted-foreground">msg/s</span>
        </div>

        {/* 图表 */}
        <div className="h-[200px]">
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">平均</p>
            <p className="font-semibold">{stats.avg}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">最大</p>
            <p className="font-semibold text-green-500">{stats.max}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">最小</p>
            <p className="font-semibold text-orange-500">{stats.min}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
