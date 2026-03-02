import { useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter,
} from "recharts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 常量
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const IMPL_LABELS: Record<string, string> = {
  builtin: "内置算法", pipeline_node: "Pipeline 桥接", plugin: "插件引擎",
  external: "外部服务", kg_operator: "KG 算子",
};
const CATEGORY_LABELS: Record<string, string> = {
  mechanical: "机械算法", electrical: "电气算法", structural: "结构算法",
  anomaly_detection: "异常检测", optimization: "优化算法", comprehensive: "综合算法",
  feature_extraction: "特征提取", agent_plugin: "Agent插件", model_iteration: "模型迭代",
  rule_learning: "规则自动学习", signal_processing: "信号处理", feature_engineering: "特征工程",
  machine_learning: "机器学习", deep_learning: "深度学习", predictive_maintenance: "预测性维护",
  statistical_analysis: "统计分析", time_series: "时序分析",
};
const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: "正常", color: "bg-green-500/10 text-green-700 border-green-300" },
  attention: { label: "关注", color: "bg-yellow-500/10 text-yellow-700 border-yellow-300" },
  warning: { label: "警告", color: "bg-orange-500/10 text-orange-700 border-orange-300" },
  critical: { label: "严重", color: "bg-red-500/10 text-red-700 border-red-300" },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extractFields(schema: any): any[] {
  if (!schema) return [];
  if (Array.isArray(schema)) return schema;
  if (schema.fields && Array.isArray(schema.fields)) return schema.fields;
  return [];
}

/** 解析 CSV 文本为数值数组 */
function parseCSV(text: string): { data: number[] | number[][]; headers: string[]; rowCount: number; colCount: number; preview: string[][]; stats?: { min: number; max: number; mean: number; std: number }; detectedTimestampCol?: string } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { data: [], headers: [], rowCount: 0, colCount: 0, preview: [] };

  // 检测分隔符
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const rows = lines.map(l => l.split(sep).map(c => c.trim()));
  const firstRowIsHeader = rows[0].some(c => isNaN(Number(c)) && c !== '');
  const headers = firstRowIsHeader ? rows[0] : rows[0].map((_, i) => `col_${i}`);
  const dataRows = firstRowIsHeader ? rows.slice(1) : rows;
  const numericRows = dataRows.map(r => r.map(c => {
    const n = Number(c);
    return isNaN(n) ? 0 : n;
  }));

  const colCount = headers.length;
  // 预览只取前 8 行
  const preview = [headers, ...dataRows.slice(0, 8)];

  // 单列 → 1D 数组 + 统计信息
  if (colCount === 1) {
    const flat = numericRows.map(r => r[0]);
    const min = Math.min(...flat.slice(0, 10000));
    const max = Math.max(...flat.slice(0, 10000));
    const sum = flat.reduce((a, b) => a + b, 0);
    const mean = sum / flat.length;
    const variance = flat.slice(0, 10000).reduce((a, b) => a + (b - mean) ** 2, 0) / Math.min(flat.length, 10000);
    const std = Math.sqrt(variance);
    return { data: flat, headers, rowCount: flat.length, colCount, preview, stats: { min, max, mean, std } };
  }

  // 多列 → 智能提取信号列
  // 检测第一列是否为单调递增（时间戳/序号），如果是则取第二列作为信号
  if (colCount >= 2) {
    const col0 = numericRows.map(r => r[0]);
    let isMonotonic = true;
    for (let i = 1; i < Math.min(col0.length, 100); i++) {
      if (col0[i] <= col0[i - 1]) { isMonotonic = false; break; }
    }
    if (isMonotonic) {
      // 第一列是时间戳/序号，取第二列作为信号数据
      const signalCol = numericRows.map(r => r[1]);
      const min = Math.min(...signalCol.slice(0, 10000));
      const max = Math.max(...signalCol.slice(0, 10000));
      const sum = signalCol.reduce((a, b) => a + b, 0);
      const mean = sum / signalCol.length;
      const variance = signalCol.slice(0, 10000).reduce((a, b) => a + (b - mean) ** 2, 0) / Math.min(signalCol.length, 10000);
      const std = Math.sqrt(variance);
      return {
        data: signalCol,
        headers: [headers[1]],
        rowCount: signalCol.length,
        colCount: 1,
        preview,
        stats: { min, max, mean, std },
        detectedTimestampCol: headers[0],
      };
    }
  }

  return { data: numericRows, headers, rowCount: numericRows.length, colCount, preview };
}

/** 解析 JSON 文件内容 */
function parseJSON(text: string): { inputData: Record<string, any>; summary: string } {
  const parsed = JSON.parse(text);
  // 如果已经是 AlgorithmInput 格式（有 data 字段），直接使用
  if (parsed.data !== undefined) {
    const dataLen = Array.isArray(parsed.data) ? parsed.data.length : Object.keys(parsed.data).length;
    return {
      inputData: parsed,
      summary: `JSON 格式，data 字段包含 ${dataLen} 个元素${parsed.sampleRate ? `，采样率 ${parsed.sampleRate} Hz` : ''}`,
    };
  }
  // 如果是纯数组，包装为 { data }
  if (Array.isArray(parsed)) {
    return {
      inputData: { data: parsed },
      summary: `JSON 数组，${parsed.length} 个元素`,
    };
  }
  // 其他对象格式，作为整体 inputData
  return {
    inputData: parsed,
    summary: `JSON 对象，${Object.keys(parsed).length} 个字段: ${Object.keys(parsed).slice(0, 5).join(', ')}`,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 结果可视化组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VisualizationChart({ viz }: { viz: any }) {
  const chartData = useMemo(() => {
    if (!viz?.series?.[0]?.data) return [];
    const xData = viz.xAxis?.data || viz.series[0].data.map((_: any, i: number) => i);
    return xData.map((x: any, i: number) => {
      const point: Record<string, any> = { x: typeof x === 'number' ? x : i };
      viz.series.forEach((s: any) => {
        const val = Array.isArray(s.data[i]) ? s.data[i][1] : s.data[i];
        point[s.name] = val;
      });
      return point;
    });
  }, [viz]);

  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];

  if (viz.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} label={viz.xAxis ? { value: `${viz.xAxis.label || ''}${viz.xAxis.unit ? ` (${viz.xAxis.unit})` : ''}`, position: 'insideBottom', offset: -5, fontSize: 11 } : undefined} />
          <YAxis tick={{ fontSize: 11 }} label={viz.yAxis ? { value: `${viz.yAxis.label || ''}${viz.yAxis.unit ? ` (${viz.yAxis.unit})` : ''}`, angle: -90, position: 'insideLeft', fontSize: 11 } : undefined} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {viz.series.map((s: any, i: number) => (
            <Bar key={s.name} dataKey={s.name} fill={s.color || colors[i % colors.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (viz.type === 'scatter') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          {viz.series.map((s: any, i: number) => (
            <Scatter key={s.name} name={s.name} data={chartData} fill={s.color || colors[i % colors.length]} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  // 默认折线图（line, spectrum, waterfall 等）
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="x" tick={{ fontSize: 11 }} label={viz.xAxis ? { value: `${viz.xAxis.label || ''}${viz.xAxis.unit ? ` (${viz.xAxis.unit})` : ''}`, position: 'insideBottom', offset: -5, fontSize: 11 } : undefined} />
        <YAxis tick={{ fontSize: 11 }} label={viz.yAxis ? { value: `${viz.yAxis.label || ''}${viz.yAxis.unit ? ` (${viz.yAxis.unit})` : ''}`, angle: -90, position: 'insideLeft', fontSize: 11 } : undefined} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {viz.series.map((s: any, i: number) => (
          <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color || colors[i % colors.length]} dot={false} strokeWidth={1.5} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 算法测试面板组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type TestPhase = 'upload' | 'configure' | 'running' | 'result';

interface ParsedData {
  inputData: Record<string, any>;
  summary: string;
  preview?: string[][];
  stats?: { min: number; max: number; mean: number; std: number };
  fileName: string;
  fileSize: number;
}

function AlgorithmTestPanel({ algo, onClose }: { algo: any; onClose: () => void }) {
  const [phase, setPhase] = useState<TestPhase>('upload');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [sampleRate, setSampleRate] = useState('1000');
  const [jsonInput, setJsonInput] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'json'>('file');
  const [executionResult, setExecutionResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const executeMutation = trpc.algorithm.execute.useMutation({
    onSuccess: (result) => {
      setExecutionResult(result);
      setPhase('result');
      if (result.status === 'completed') {
        toast.success("算法执行完成");
      } else {
        toast.error("算法执行失败", { description: result.results?.error as string });
      }
    },
    onError: (err) => {
      toast.error("执行请求失败", { description: err.message });
      setPhase('configure');
    },
  });

  const configFields = extractFields(algo.configSchema);

  // 初始化配置默认值
  const initConfigDefaults = useCallback(() => {
    const defaults: Record<string, string> = {};
    configFields.forEach((f: any) => {
      if (f.default !== undefined) {
        defaults[f.name || f.key] = String(f.default);
      }
    });
    setConfigValues(defaults);
  }, [configFields]);

  // 处理文件（通用函数，接受 File 对象）
  const processFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) { toast.error("文件读取失败"); return; }

      try {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'json') {
          const { inputData, summary } = parseJSON(text);
          setParsedData({ inputData, summary, fileName: file.name, fileSize: file.size });
        } else {
          // CSV / TXT / TSV
          const { data, headers, rowCount, colCount, preview, stats, detectedTimestampCol } = parseCSV(text);
          const inputData: Record<string, any> = { data };
          // 尝试从文件名提取采样率（格式如 ..._12800_51200_...）
          const srMatch = file.name.match(/(\d{3,6})_(\d{3,6})_/);
          if (srMatch) {
            const possibleSr = Number(srMatch[1]);
            if (possibleSr >= 100 && possibleSr <= 102400) {
              inputData.sampleRate = possibleSr;
              setSampleRate(String(possibleSr));
            }
          }
          const sizeStr = file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${(file.size / 1024).toFixed(1)} KB`;
          setParsedData({
            inputData,
            summary: `${rowCount.toLocaleString()} 采样点 · ${colCount} 通道 · ${sizeStr}${stats ? ` · 范围 [${stats.min.toFixed(1)}, ${stats.max.toFixed(1)}]` : ''}${detectedTimestampCol ? ` · 已跳过时间列"${detectedTimestampCol}"` : ''}`,
            preview,
            stats,
            fileName: file.name,
            fileSize: file.size,
          });
        }
        initConfigDefaults();
        setPhase('configure');
        toast.success("文件解析成功");
      } catch (err: any) {
        toast.error("文件解析失败", { description: err.message });
      }
    };
    reader.onerror = () => { toast.error("文件读取失败"); };
    reader.readAsText(file);
  }, [initConfigDefaults]);

  // input onChange 处理
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // 重置 input value，允许重复选择同一文件
    e.target.value = '';
  }, [processFile]);

  // 拖拽处理
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // 处理 JSON 直接输入
  const handleJsonSubmit = useCallback(() => {
    if (!jsonInput.trim()) { toast.error("请输入 JSON 数据"); return; }
    try {
      const { inputData, summary } = parseJSON(jsonInput);
      setParsedData({ inputData, summary, fileName: '手动输入', fileSize: jsonInput.length });
      initConfigDefaults();
      setPhase('configure');
      toast.success("JSON 解析成功");
    } catch (err: any) {
      toast.error("JSON 格式错误", { description: err.message });
    }
  }, [jsonInput, initConfigDefaults]);

  // 执行算法
  const handleExecute = useCallback(() => {
    if (!parsedData) return;

    // 构造 inputData
    const inputData = { ...parsedData.inputData };
    // 如果数据中没有 sampleRate 且用户填了，添加进去
    if (inputData.sampleRate === undefined && sampleRate) {
      inputData.sampleRate = Number(sampleRate);
    }

    // 构造 config
    const config: Record<string, any> = {};
    configFields.forEach((f: any) => {
      const key = f.name || f.key;
      const val = configValues[key];
      if (val !== undefined && val !== '') {
        // 尝试转换类型
        if (f.type === 'number' || f.type === 'float' || f.type === 'integer') {
          config[key] = Number(val);
        } else if (f.type === 'boolean') {
          config[key] = val === 'true';
        } else {
          config[key] = val;
        }
      }
    });

    setPhase('running');
    executeMutation.mutate({
      algoCode: algo.algoCode,
      inputData,
      config: Object.keys(config).length > 0 ? config : undefined,
    });
  }, [parsedData, sampleRate, configValues, configFields, algo.algoCode, executeMutation]);

  // ── 上传阶段 ──
  if (phase === 'upload') {
    return (
      <div className="space-y-3">
        {/* 输入模式切换 */}
        <div className="flex gap-1.5">
          <Button variant={inputMode === 'file' ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2" onClick={() => setInputMode('file')}>
            上传文件
          </Button>
          <Button variant={inputMode === 'json' ? 'default' : 'outline'} size="sm" className="text-xs h-7 px-2" onClick={() => setInputMode('json')}>
            JSON 输入
          </Button>
        </div>

        {inputMode === 'file' ? (
          <div
            className="border-2 border-dashed rounded-md p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.value = '';
              fileInputRef.current?.click();
            }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,.txt,.tsv"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <p className="text-sm font-medium">点击或拖拽文件到此处</p>
            <p className="text-xs text-muted-foreground mt-1">
              支持 CSV / JSON / TXT / TSV
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{"data": [1.2, 3.4, ...], "sampleRate": 1000}'
              className="font-mono text-[11px] min-h-[120px]"
            />
            <Button onClick={handleJsonSubmit} size="sm" className="w-full text-xs h-7">
              解析 JSON
            </Button>
          </div>
        )}

        {/* 快速测试 */}
        <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => {
          const sampleRateVal = 1000;
          const n = sampleRateVal;
          const data: number[] = [];
          for (let i = 0; i < n; i++) {
            const t = i / sampleRateVal;
            data.push(
              Math.sin(2 * Math.PI * 50 * t) * 2.0 +
              Math.sin(2 * Math.PI * 150 * t) * 0.8 +
              (Math.random() - 0.5) * 0.3
            );
          }
          setParsedData({
            inputData: { data, sampleRate: sampleRateVal },
            summary: `模拟信号: ${n} 点, ${sampleRateVal} Hz, 50Hz+150Hz`,
            fileName: '模拟数据',
            fileSize: 0,
          });
          setSampleRate(String(sampleRateVal));
          initConfigDefaults();
          setPhase('configure');
          toast.success("已生成模拟数据");
        }}>
          生成模拟振动信号（快速测试）
        </Button>
      </div>
    );
  }

  // ── 配置阶段 ──
  if (phase === 'configure') {
    return (
      <div className="space-y-3">
        {/* 数据摘要 - 紧凑版 */}
        <div className="bg-muted/30 rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{parsedData?.fileName}</p>
              <p className="text-[11px] text-muted-foreground">{parsedData?.summary}</p>
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2 shrink-0" onClick={() => { setParsedData(null); setPhase('upload'); }}>
              更换
            </Button>
          </div>
          {/* 统计信息（单列数值数据时显示） */}
          {parsedData?.stats && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              <div className="bg-background rounded px-2 py-1">
                <p className="text-[10px] text-muted-foreground">最小值</p>
                <p className="text-xs font-mono font-medium">{parsedData.stats.min.toFixed(1)}</p>
              </div>
              <div className="bg-background rounded px-2 py-1">
                <p className="text-[10px] text-muted-foreground">最大值</p>
                <p className="text-xs font-mono font-medium">{parsedData.stats.max.toFixed(1)}</p>
              </div>
              <div className="bg-background rounded px-2 py-1">
                <p className="text-[10px] text-muted-foreground">均值</p>
                <p className="text-xs font-mono font-medium">{parsedData.stats.mean.toFixed(2)}</p>
              </div>
              <div className="bg-background rounded px-2 py-1">
                <p className="text-[10px] text-muted-foreground">标准差</p>
                <p className="text-xs font-mono font-medium">{parsedData.stats.std.toFixed(2)}</p>
              </div>
            </div>
          )}
          {/* 数据预览 - 仅显示前几行 */}
          {parsedData?.preview && parsedData.preview.length > 1 && !parsedData.stats && (
            <div className="mt-2 overflow-x-auto max-h-[100px]">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    {parsedData.preview[0].map((h, i) => (
                      <th key={i} className="border border-border px-1.5 py-0.5 bg-muted text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedData.preview.slice(1, 6).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-border px-1.5 py-0.5 font-mono">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 采样率 */}
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">采样率 (Hz)</Label>
          <Input
            value={sampleRate}
            onChange={(e) => setSampleRate(e.target.value)}
            placeholder="1000"
            className="w-28 h-7 text-xs"
          />
        </div>

        {/* 配置参数 */}
        {configFields.length > 0 && (
          <div>
            <Label className="text-xs font-medium">配置参数</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {configFields.map((field: any) => {
                const key = field.name || field.key;
                return (
                  <div key={key} className="space-y-0.5">
                    <Label className="text-[11px]">
                      {field.label || key}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    {field.type === 'boolean' ? (
                      <Select
                        value={configValues[key] || (field.default !== undefined ? String(field.default) : '')}
                        onValueChange={(v) => setConfigValues(prev => ({ ...prev, [key]: v }))}
                      >
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue placeholder="选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">是</SelectItem>
                          <SelectItem value="false">否</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : field.type === 'enum' && field.options ? (
                      <Select
                        value={configValues[key] || (field.default !== undefined ? String(field.default) : '')}
                        onValueChange={(v) => setConfigValues(prev => ({ ...prev, [key]: v }))}
                      >
                        <SelectTrigger className="text-xs h-7">
                          <SelectValue placeholder="选择" />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options as string[]).map((opt: string) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={configValues[key] || ''}
                        onChange={(e) => setConfigValues(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={field.default !== undefined ? `${field.default}` : ''}
                        className="text-xs h-7"
                      />
                    )}
                    {field.description && (
                      <p className="text-[10px] text-muted-foreground leading-tight">{field.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setParsedData(null); setPhase('upload'); }}>
            ← 返回
          </Button>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
              const sr = 1000;
              const data: number[] = [];
              for (let i = 0; i < sr; i++) {
                const t = i / sr;
                data.push(
                  Math.sin(2 * Math.PI * 50 * t) * 2.0 +
                  Math.sin(2 * Math.PI * 150 * t) * 0.8 +
                  (Math.random() - 0.5) * 0.3
                );
              }
              setParsedData({
                inputData: { data, sampleRate: sr },
                summary: `模拟信号: ${sr} 点, ${sr} Hz, 50Hz+150Hz`,
                fileName: '模拟数据',
                fileSize: 0,
              });
              setSampleRate(String(sr));
              toast.success("已生成模拟数据");
            }}>
              模拟信号
            </Button>
            <Button size="sm" className="text-xs h-7" onClick={handleExecute} disabled={!parsedData}>
              ▶ 执行算法
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── 执行中 ──
  if (phase === 'running') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 rounded-full animate-spin border-t-primary" />
        </div>
        <p className="font-medium">正在执行 {algo.label || algo.algoName}...</p>
        <p className="text-sm text-muted-foreground">算法正在处理数据，请稍候</p>
        <Progress value={undefined} className="w-64" />
      </div>
    );
  }

  // ── 结果展示 ──
  if (phase === 'result' && executionResult) {
    const diagnosis = executionResult.output?.diagnosis;
    const visualizations = executionResult.output?.visualizations || [];
    const results = executionResult.output?.results || {};
    const metadata = executionResult.output?.metadata;
    const sevInfo = diagnosis?.severity ? SEVERITY_MAP[diagnosis.severity] || SEVERITY_MAP.normal : SEVERITY_MAP.normal;

    return (
      <ScrollArea className="max-h-[70vh]">
        <div className="space-y-5 pr-4">
          {/* 执行状态 */}
          <Alert variant={executionResult.status === 'success' ? 'default' : 'destructive'}>
            <AlertTitle className="flex items-center gap-2">
              {executionResult.status === 'success' ? '✅' : '❌'}
              执行{executionResult.status === 'success' ? '成功' : '失败'}
            </AlertTitle>
            <AlertDescription>
              执行 ID: {executionResult.executionId} · 耗时: {executionResult.metrics?.durationMs || 0}ms
            </AlertDescription>
          </Alert>

          {/* 诊断结论 */}
          {diagnosis && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  🩺 诊断结论
                  <Badge className={sevInfo.color}>{sevInfo.label}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{diagnosis.summary}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-xs text-muted-foreground">置信度</p>
                    <p className="text-lg font-bold">{((diagnosis.confidence || 0) * 100).toFixed(1)}%</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-xs text-muted-foreground">紧急程度</p>
                    <p className="text-sm font-medium">{diagnosis.urgency || '—'}</p>
                  </div>
                  {diagnosis.faultType && (
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-xs text-muted-foreground">故障类型</p>
                      <p className="text-sm font-medium">{diagnosis.faultType}</p>
                    </div>
                  )}
                  {diagnosis.referenceStandard && (
                    <div className="bg-muted/50 rounded p-2">
                      <p className="text-xs text-muted-foreground">参考标准</p>
                      <p className="text-sm font-medium">{diagnosis.referenceStandard}</p>
                    </div>
                  )}
                </div>
                {diagnosis.rootCause && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">根因分析</p>
                    <p className="text-sm bg-muted/50 rounded p-2">{diagnosis.rootCause}</p>
                  </div>
                )}
                {diagnosis.recommendations && diagnosis.recommendations.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">建议措施</p>
                    <ul className="text-sm space-y-1">
                      {diagnosis.recommendations.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 可视化图表 */}
          {visualizations.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">📈 可视化结果</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {visualizations.map((viz: any, i: number) => (
                    <div key={i}>
                      <p className="text-sm font-medium mb-2">{viz.title}</p>
                      <VisualizationChart viz={viz} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 计算结果数据 */}
          {Object.keys(results).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">📋 计算结果</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(results).map(([key, value]) => {
                    // 跳过过长的数组
                    const displayValue = Array.isArray(value) && (value as any[]).length > 20
                      ? `[${(value as any[]).slice(0, 5).join(', ')}, ... 共 ${(value as any[]).length} 项]`
                      : typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value);
                    const isLong = displayValue.length > 100;
                    return (
                      <div key={key} className="flex items-start gap-3 p-2 bg-muted/30 rounded">
                        <span className="font-mono text-xs text-muted-foreground shrink-0 w-40">{key}</span>
                        <span className={`text-sm break-all ${isLong ? 'font-mono text-xs' : ''}`}>{displayValue}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 执行元数据 */}
          {metadata && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">⚙️ 执行元数据</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">执行耗时</span>
                    <p className="font-medium">{metadata.executionTimeMs}ms</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">输入数据点</span>
                    <p className="font-medium">{metadata.inputDataPoints}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">算法版本</span>
                    <p className="font-medium">{metadata.algorithmVersion}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">参数</span>
                    <p className="font-mono text-xs">{JSON.stringify(metadata.parameters).slice(0, 50)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 原始输出（折叠） */}
          {executionResult.status === 'error' && executionResult.output?.error && (
            <Alert variant="destructive">
              <AlertTitle>错误详情</AlertTitle>
              <AlertDescription className="font-mono text-xs mt-1">
                {executionResult.output.error as string}
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          {/* 操作按钮 */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setExecutionResult(null); setPhase('configure'); }}>
              ← 修改参数重新执行
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setExecutionResult(null); setParsedData(null); setPhase('upload'); }}>
                上传新数据
              </Button>
              <Button variant="outline" onClick={onClose}>
                关闭
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function AlgorithmDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/algorithm/detail/:id");
  const algorithmId = params?.id || "";

  // 已有独立页面的算法自动重定向
  const DEDICATED_PAGES: Record<string, string> = {
    'ds_evidence_fusion': '/diagnosis/fusion',
    'condition_normalization': '/algorithm/condition-normalizer',
    'model_distillation': '/algorithm/distillation',
  };
  if (DEDICATED_PAGES[algorithmId]) {
    navigate(DEDICATED_PAGES[algorithmId], { replace: true });
    return null;
  }

  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [bindDeviceCode, setBindDeviceCode] = useState("");
  const [bindSchedule, setBindSchedule] = useState("manual");

  // 获取算法详情
  const detailQuery = trpc.algorithm.getDefinition.useQuery({ algoCode: algorithmId }, { enabled: !!algorithmId });
  // 获取设备绑定列表
  const bindingsQuery = trpc.algorithm.listBindingsByAlgorithm.useQuery({ algoCode: algorithmId }, { enabled: !!algorithmId });
  // 获取执行记录
  const executionsQuery = trpc.algorithm.listExecutions.useQuery(
    { algoCode: algorithmId, pageSize: 20 },
    { enabled: !!algorithmId }
  );

  const utils = trpc.useUtils();
  const createBindingMutation = trpc.algorithm.createBinding.useMutation({
    onSuccess: () => {
      toast.success("设备绑定成功");
      utils.algorithm.listBindingsByAlgorithm.invalidate({ algoCode: algorithmId });
      setBindDialogOpen(false);
      setBindDeviceCode("");
      setBindSchedule("manual");
    },
    onError: (err) => {
      toast.error("绑定失败", { description: err.message });
    },
  });

  const algo = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <MainLayout title="算法详情">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!algo) {
    return (
      <MainLayout title="算法不存在">
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-2xl mb-3">❌</div>
            <h3 className="text-base font-medium">算法不存在</h3>
            <p className="text-sm text-muted-foreground mt-2">ID: {algorithmId}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/algorithm/overview")}>
              返回算法库
            </Button>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={algo.algoName || "算法详情"}>
      <div className="space-y-6">
        {/* 面包屑 + 返回 */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
            ← 算法库
          </Button>
          <span>/</span>
          <span>{CATEGORY_LABELS[algo.category] || algo.category}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{algo.label || algo.algoName}</span>
        </div>

        {/* 算法基本信息 */}
        <div className="flex flex-col lg:flex-row gap-6">
          <Card className="flex-1">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{algo.label || algo.algoName}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">{algo.algoCode}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge>{IMPL_LABELS[algo.implType] || algo.implType}</Badge>
                  <Badge variant="outline">{CATEGORY_LABELS[algo.category] || algo.category}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">{algo.description}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">实现引用：</span>
                  <span className="font-mono ml-1">{algo.implRef || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">版本：</span>
                  <span className="ml-1">{algo.version || "1.0.0"}</span>
                </div>
                {algo.applicableDeviceTypes && algo.applicableDeviceTypes.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">适用设备：</span>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {algo.applicableDeviceTypes.map((dt: string) => (
                        <Badge key={dt} variant="outline" className="text-xs">{dt}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {algo.measurementTypes && algo.measurementTypes.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">测量类型：</span>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {algo.measurementTypes.map((mt: string) => (
                        <Badge key={mt} variant="secondary" className="text-xs">{mt}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 快速操作 */}
          <Card className="w-full lg:w-72 shrink-0">
            <CardHeader>
              <CardTitle className="text-base">快速操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => setTestDialogOpen(true)}>
                🧪 测试算法
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setBindDialogOpen(true)}>
                🔗 绑定设备
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate("/algorithm/compose")}>
                🔗 添加到编排
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 详情标签页 */}
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">配置参数</TabsTrigger>
            <TabsTrigger value="io">输入/输出</TabsTrigger>
            <TabsTrigger value="bindings">设备绑定 ({bindingsQuery.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="executions">执行记录</TabsTrigger>
          </TabsList>

          {/* 配置参数 */}
          <TabsContent value="config">
            <Card>
              <CardContent className="p-4">
                {extractFields(algo.configSchema).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>参数名</TableHead>
                        <TableHead>标签</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>默认值</TableHead>
                        <TableHead>必填</TableHead>
                        <TableHead>说明</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extractFields(algo.configSchema).map((field: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{field.name || field.key}</TableCell>
                          <TableCell className="text-sm">{field.label || "—"}</TableCell>
                          <TableCell><Badge variant="outline">{field.type}</Badge></TableCell>
                          <TableCell className="text-sm">{field.default !== undefined ? String(field.default) : "—"}</TableCell>
                          <TableCell>{field.required ? "✓" : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{field.description || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    该算法无需额外配置参数
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 输入/输出 */}
          <TabsContent value="io">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">📥 输入 Schema</CardTitle>
                </CardHeader>
                <CardContent>
                  {extractFields(algo.inputSchema).length > 0 ? (
                    <div className="space-y-2">
                      {extractFields(algo.inputSchema).map((field: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <div>
                            <span className="font-mono text-sm">{field.name || field.key}</span>
                            {field.label && <span className="text-muted-foreground text-xs ml-2">({field.label})</span>}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </div>
                          <Badge variant="outline">{field.type}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">接受任意时序数据输入</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">📤 输出 Schema</CardTitle>
                </CardHeader>
                <CardContent>
                  {extractFields(algo.outputSchema).length > 0 ? (
                    <div className="space-y-2">
                      {extractFields(algo.outputSchema).map((field: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <div>
                            <span className="font-mono text-sm">{field.name || field.key}</span>
                            {field.label && <span className="text-muted-foreground text-xs ml-2">({field.label})</span>}
                          </div>
                          <Badge variant="outline">{field.type}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">输出格式取决于算法类型</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 设备绑定 */}
          <TabsContent value="bindings">
            <Card>
              <CardContent className="p-4">
                {bindingsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : bindingsQuery.data && bindingsQuery.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>设备 ID</TableHead>
                        <TableHead>绑定时间</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>调度</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bindingsQuery.data.map((binding: any) => (
                        <TableRow key={binding.id}>
                          <TableCell className="font-mono text-sm">{binding.nodeId}</TableCell>
                          <TableCell className="text-sm">{new Date(binding.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={binding.status === "active" ? "default" : "secondary"}>
                              {binding.status === "active" ? "运行中" : "已暂停"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{binding.schedule || "手动"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm">配置</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-2xl mb-2">🔗</div>
                    <p className="text-muted-foreground">暂无设备绑定</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setBindDialogOpen(true)}>
                      绑定第一个设备
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 执行记录 */}
          <TabsContent value="executions">
            <Card>
              <CardContent className="p-4">
                {executionsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : executionsQuery.data?.items && executionsQuery.data.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>执行 ID</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>耗时</TableHead>
                        <TableHead>设备</TableHead>
                        <TableHead>时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {executionsQuery.data.items.map((exec: any) => (
                        <TableRow key={exec.id}>
                          <TableCell className="font-mono text-xs">{String(exec.id).slice(0, 8)}{String(exec.id).length > 8 ? '...' : ''}</TableCell>
                          <TableCell>
                            <Badge variant={
                              exec.status === "success" ? "default" :
                              exec.status === "failed" ? "destructive" : "secondary"
                            }>
                              {exec.status === "success" ? "成功" : exec.status === "failed" ? "失败" : "运行中"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{exec.durationMs ? `${exec.durationMs}ms` : "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{exec.nodeId || "—"}</TableCell>
                          <TableCell className="text-sm">{new Date(exec.createdAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-2xl mb-2">📝</div>
                    <p className="text-muted-foreground">暂无执行记录</p>
                    <p className="text-xs text-muted-foreground mt-1">执行算法后，记录将自动出现在这里</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 绑定设备对话框 */}
        <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">绑定设备到 {algo.label || algo.algoName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>设备编码</Label>
                <Input
                  placeholder="输入设备编码（如 STS-001）"
                  className="mt-1"
                  value={bindDeviceCode}
                  onChange={(e) => setBindDeviceCode(e.target.value)}
                />
              </div>
              <div>
                <Label>调度方式</Label>
                <Select value={bindSchedule} onValueChange={setBindSchedule}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">手动触发</SelectItem>
                    <SelectItem value="realtime">实时（数据到达即执行）</SelectItem>
                    <SelectItem value="cron_1m">每分钟</SelectItem>
                    <SelectItem value="cron_5m">每 5 分钟</SelectItem>
                    <SelectItem value="cron_1h">每小时</SelectItem>
                    <SelectItem value="cron_1d">每天</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBindDialogOpen(false)}>取消</Button>
                <Button
                  disabled={!bindDeviceCode.trim() || createBindingMutation.isPending}
                  onClick={() => {
                    createBindingMutation.mutate({
                      algoCode: algorithmId,
                      deviceCode: bindDeviceCode.trim(),
                      schedule: bindSchedule !== "manual" ? { type: bindSchedule } : undefined,
                    });
                  }}
                >
                  {createBindingMutation.isPending ? "绑定中..." : "确认绑定"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 算法测试对话框 */}
        <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
          <DialogContent className="max-w-xl max-h-[80vh] flex flex-col p-0">
            <DialogHeader className="px-5 pt-5 pb-0">
              <DialogTitle className="text-sm flex items-center gap-2">
                测试 {algo.label || algo.algoName}
                <Badge variant="outline" className="font-mono text-[10px]">{algo.algoCode}</Badge>
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 pb-5" style={{ minHeight: 0 }}>
              <AlgorithmTestPanel algo={algo} onClose={() => setTestDialogOpen(false)} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
