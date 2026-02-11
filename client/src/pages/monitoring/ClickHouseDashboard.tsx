import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CHTable { name: string; engine: string; rows: string; diskSize: string; compressRatio: string; partitions: number; }
interface CHQuery { id: string; query: string; duration: string; readRows: string; memoryUsage: string; timestamp: string; }

const MOCK_TABLES: CHTable[] = [
  { name: "ch_telemetry_1s", engine: "MergeTree", rows: "2.1B", diskSize: "156 GB", compressRatio: "12:1", partitions: 24 },
  { name: "ch_telemetry_1m", engine: "AggregatingMergeTree", rows: "35M", diskSize: "2.8 GB", compressRatio: "15:1", partitions: 24 },
  { name: "ch_telemetry_1h", engine: "AggregatingMergeTree", rows: "580K", diskSize: "48 MB", compressRatio: "18:1", partitions: 12 },
  { name: "ch_alert_events", engine: "MergeTree", rows: "12M", diskSize: "1.2 GB", compressRatio: "8:1", partitions: 12 },
  { name: "ch_model_inference_log", engine: "MergeTree", rows: "45M", diskSize: "3.5 GB", compressRatio: "10:1", partitions: 6 },
];

const MOCK_QUERIES: CHQuery[] = [
  { id: "Q-001", query: "SELECT avg(value) FROM ch_telemetry_1s WHERE device_code='M-001' AND ts > now() - INTERVAL 1 HOUR", duration: "0.12s", readRows: "3.6M", memoryUsage: "128 MB", timestamp: "2026-02-11 10:30" },
  { id: "Q-002", query: "SELECT * FROM ch_telemetry_1m WHERE ts BETWEEN '2026-02-01' AND '2026-02-11' ORDER BY ts", duration: "0.45s", readRows: "15M", memoryUsage: "512 MB", timestamp: "2026-02-11 10:28" },
  { id: "Q-003", query: "INSERT INTO ch_telemetry_1s SELECT * FROM kafka_telemetry_raw", duration: "持续运行", readRows: "-", memoryUsage: "64 MB", timestamp: "持续" },
];

export default function ClickHouseDashboard() {
  const [tables] = useState(MOCK_TABLES);
  const [queries] = useState(MOCK_QUERIES);
  
  const totalDisk = 163.548; // GB

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ClickHouse 监控</h1>
        <p className="text-muted-foreground mt-1">ClickHouse 时序数据库的存储、查询和性能监控</p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{tables.length}</div><p className="text-xs text-muted-foreground">表数量</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">2.19B</div><p className="text-xs text-muted-foreground">总行数</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{totalDisk.toFixed(1)} GB</div><p className="text-xs text-muted-foreground">磁盘占用</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-green-500">12:1</div><p className="text-xs text-muted-foreground">平均压缩比</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-500">0.28s</div><p className="text-xs text-muted-foreground">平均查询时间</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>存储分布</CardTitle><CardDescription>各表的磁盘占用和压缩情况</CardDescription></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tables.map(t => (
                <div key={t.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <code className="text-xs">{t.name}</code>
                      <Badge variant="outline" className="text-xs">{t.engine}</Badge>
                    </div>
                    <span className="text-sm font-medium">{t.diskSize}</span>
                  </div>
                  <Progress value={parseFloat(t.diskSize) / totalDisk * 100} className="h-2" />
                  <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                    <span>行数: {t.rows}</span><span>压缩比: {t.compressRatio}</span><span>分区: {t.partitions}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle>最近查询</CardTitle><CardDescription>最近执行的查询和性能指标</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => toast.success("功能开发中")}>查询分析</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {queries.map(q => (
                <div key={q.id} className="p-3 rounded border text-sm">
                  <code className="text-xs block truncate mb-2">{q.query}</code>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>耗时: <strong>{q.duration}</strong></span>
                    <span>读取行数: {q.readRows}</span>
                    <span>内存: {q.memoryUsage}</span>
                    <span>{q.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
