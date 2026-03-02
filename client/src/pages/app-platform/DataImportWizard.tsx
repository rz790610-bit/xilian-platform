/**
 * 数据导入向导 — 5 步式 CSV 导入 + HDE 诊断
 *
 * Step 1: 上传 CSV（拖拽/选择，客户端解析）
 * Step 2: 列映射（自动匹配 + 手动覆盖）
 * Step 3: 选择设备（从孪生体列表选取）
 * Step 4: 预览（数据摘要 + 前 10 行表格）
 * Step 5: 执行 HDE 诊断 + 展示结果
 */
import { useState, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Columns3,
  Server,
  Eye,
  Zap,
  AlertTriangle,
  X,
} from 'lucide-react';

// ── 类型 ───────────────────────────────────────────────
type WizardStep = 'upload' | 'mapping' | 'device' | 'preview' | 'diagnosing';

type ColumnRole = 'timestamp' | 'vibration' | 'temperature' | 'current' | 'ignore';

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  separator: string;
}

interface ColumnMapping {
  [colIndex: number]: ColumnRole;
}

// ── 步骤配置 ────────────────────────────────────────────
const STEPS: { key: WizardStep; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'upload', label: '上传文件', icon: Upload },
  { key: 'mapping', label: '列映射', icon: Columns3 },
  { key: 'device', label: '选择设备', icon: Server },
  { key: 'preview', label: '数据预览', icon: Eye },
  { key: 'diagnosing', label: '执行诊断', icon: Zap },
];

const STEP_INDEX: Record<WizardStep, number> = {
  upload: 0,
  mapping: 1,
  device: 2,
  preview: 3,
  diagnosing: 4,
};

// ── 自动匹配规则 ──────────────────────────────────────
const AUTO_MATCH: { pattern: RegExp; role: ColumnRole }[] = [
  { pattern: /^(time|timestamp|ts|时间|日期|date)/i, role: 'timestamp' },
  { pattern: /^(vib|vibration|rms|振动|加速度|acc)/i, role: 'vibration' },
  { pattern: /^(temp|temperature|温度)/i, role: 'temperature' },
  { pattern: /^(cur|current|电流|amp)/i, role: 'current' },
];

const ROLE_LABELS: Record<ColumnRole, string> = {
  timestamp: '时间戳',
  vibration: '振动RMS',
  temperature: '温度',
  current: '电流',
  ignore: '忽略',
};

// ── 诊断步骤动画 ──────────────────────────────────────
const DIAGNOSIS_PHASES = [
  '数据上传中...',
  '物理轨分析...',
  '数据轨分析...',
  'DS 融合推理...',
  '生成诊断结论...',
];

// ── CSV 解析 ────────────────────────────────────────────
function parseCSV(text: string): ParsedCSV {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], separator: ',' };

  // 检测分隔符
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const allRows = lines.map((l) => l.split(sep).map((c) => c.trim()));
  const firstRowIsHeader = allRows[0].some((c) => isNaN(Number(c)) && c !== '');
  const headers = firstRowIsHeader ? allRows[0] : allRows[0].map((_, i) => `col_${i + 1}`);
  const dataRows = firstRowIsHeader ? allRows.slice(1) : allRows;

  return { headers, rows: dataRows, separator: sep };
}

// ── 自动映射 ─────────────────────────────────────────
function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  headers.forEach((h, idx) => {
    const match = AUTO_MATCH.find((m) => m.pattern.test(h));
    mapping[idx] = match ? match.role : 'ignore';
  });
  return mapping;
}

// ── 计算列统计 ─────────────────────────────────────────
function computeColumnStats(rows: string[][], colIndex: number) {
  const values = rows.map((r) => Number(r[colIndex])).filter((n) => !isNaN(n));
  if (values.length === 0) return { count: 0, mean: 0, min: 0, max: 0 };
  const count = values.length;
  const min = Math.min(...values.slice(0, 10000));
  const max = Math.max(...values.slice(0, 10000));
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / count;
  return { count, mean, min, max };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DataImportWizard() {
  const [, setLocation] = useLocation();

  // ── 向导状态 ──────────────────────────────────────
  const [step, setStep] = useState<WizardStep>('upload');

  // Step 1: 上传
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Step 2: 映射
  const [mapping, setMapping] = useState<ColumnMapping>({});

  // Step 3: 设备
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; code: string } | null>(null);

  // Step 5: 诊断
  const [diagPhase, setDiagPhase] = useState(0);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [diagError, setDiagError] = useState<string | null>(null);

  // ── tRPC ──────────────────────────────────────────
  const equipmentQuery = trpc.evoPipeline.listEquipmentTwins.useQuery(undefined, {
    enabled: step === 'device',
    staleTime: 30_000,
  });

  const diagnoseMutation = trpc.hdeDiagnostic.diagnose.useMutation();

  // ── 文件处理 ──────────────────────────────────────
  const processFile = useCallback((file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      try {
        const parsed = parseCSV(text);
        if (parsed.headers.length === 0) return;
        setCsv(parsed);
        setFileName(file.name);
        setMapping(autoMapColumns(parsed.headers));
        setStep('mapping');
      } catch {
        // silent — could add toast
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ── 映射校验 ──────────────────────────────────────
  const hasSensorChannel = useMemo(
    () =>
      Object.values(mapping).some(
        (r) => r === 'vibration' || r === 'temperature' || r === 'current',
      ),
    [mapping],
  );

  // ── 构建传感器数据 ────────────────────────────────
  const buildSensorData = useCallback((): Record<string, number[]> => {
    if (!csv) return {};
    const result: Record<string, number[]> = {};
    Object.entries(mapping).forEach(([idx, role]) => {
      if (role === 'ignore' || role === 'timestamp') return;
      const colIdx = Number(idx);
      const values = csv.rows.map((r) => {
        const n = Number(r[colIdx]);
        return isNaN(n) ? 0 : n;
      });
      // 如果同一 role 已有数据，以第一列为准
      if (!result[role]) result[role] = values;
    });
    return result;
  }, [csv, mapping]);

  // ── 映射摘要（预览页使用）─────────────────────────
  const mappedChannels = useMemo(() => {
    if (!csv) return [];
    return Object.entries(mapping)
      .filter(([, role]) => role !== 'ignore' && role !== 'timestamp')
      .map(([idx, role]) => {
        const colIdx = Number(idx);
        const stats = computeColumnStats(csv.rows, colIdx);
        return {
          role,
          roleLabel: ROLE_LABELS[role as ColumnRole],
          sourceColumn: csv.headers[colIdx],
          ...stats,
        };
      });
  }, [csv, mapping]);

  // ── 执行诊断 ──────────────────────────────────────
  const runDiagnosis = useCallback(async () => {
    if (!selectedDevice) return;
    setStep('diagnosing');
    setDiagPhase(0);
    setDiagResult(null);
    setDiagError(null);

    // 步骤动画
    const phaseTimer = setInterval(() => {
      setDiagPhase((p) => {
        if (p < DIAGNOSIS_PHASES.length - 1) return p + 1;
        return p;
      });
    }, 1200);

    try {
      const sensorData = buildSensorData();
      const result = await diagnoseMutation.mutateAsync({
        machineId: selectedDevice.code || selectedDevice.id,
        sensorData,
      });
      clearInterval(phaseTimer);
      setDiagPhase(DIAGNOSIS_PHASES.length - 1);
      setDiagResult(result);
    } catch (err: any) {
      clearInterval(phaseTimer);
      setDiagError(err.message || '诊断请求失败');
    }
  }, [selectedDevice, buildSensorData, diagnoseMutation]);

  // ── 步骤指示器 ────────────────────────────────────
  const currentIdx = STEP_INDEX[step];

  const StepIndicator = (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, idx) => {
        const done = currentIdx > idx;
        const active = currentIdx === idx;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {idx > 0 && (
              <div className={cn('h-px w-8', done ? 'bg-emerald-500' : 'bg-border')} />
            )}
            <div
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                done && 'bg-emerald-500/15 text-emerald-500',
                active && 'bg-primary/15 text-primary animate-pulse',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : active ? (
                <Icon className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: 上传 CSV
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const UploadStep = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          上传传感器 CSV 数据
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50',
          )}
          onClick={() => document.getElementById('csv-file-input')?.click()}
        >
          <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">拖拽 CSV 文件到此处，或点击选择</p>
          <p className="text-xs text-muted-foreground">
            支持 .csv / .tsv / .txt，自动检测分隔符
          </p>
          <input
            id="csv-file-input"
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {csv && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-muted rounded-lg">
            <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                {csv.rows.length.toLocaleString()} 行 · {csv.headers.length} 列 · 分隔符:{' '}
                {csv.separator === '\t' ? 'TAB' : csv.separator}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                setCsv(null);
                setFileName('');
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2: 列映射
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const MappingStep = csv && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns3 className="h-5 w-5 text-primary" />
          列映射
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          为每列指定数据类型。至少映射 1 个传感器通道（振动/温度/电流）才能继续。
        </p>
        <div className="space-y-3">
          {csv.headers.map((header, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{header}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  示例: {csv.rows.slice(0, 3).map((r) => r[idx] ?? '—').join(' | ')}
                </p>
              </div>
              <Select
                value={mapping[idx] ?? 'ignore'}
                onValueChange={(val) =>
                  setMapping((prev) => ({ ...prev, [idx]: val as ColumnRole }))
                }
              >
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timestamp">时间戳</SelectItem>
                  <SelectItem value="vibration">振动RMS</SelectItem>
                  <SelectItem value="temperature">温度</SelectItem>
                  <SelectItem value="current">电流</SelectItem>
                  <SelectItem value="ignore">忽略</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {!hasSensorChannel && (
          <div className="mt-4 flex items-center gap-2 text-amber-500 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" />
            请至少映射 1 个传感器通道
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 选择设备
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const DeviceStep = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-5 w-5 text-primary" />
          选择目标设备
        </CardTitle>
      </CardHeader>
      <CardContent>
        {equipmentQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">加载设备列表...</span>
          </div>
        ) : !equipmentQuery.data?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            暂无设备数据。请先在设备管理中添加设备。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {equipmentQuery.data.map((eq: any) => {
              const isSelected = selectedDevice?.id === (eq.nodeId ?? eq.id);
              return (
                <div
                  key={eq.nodeId ?? eq.id}
                  onClick={() =>
                    setSelectedDevice({
                      id: eq.nodeId ?? eq.id,
                      name: eq.name ?? eq.nodeId ?? eq.id,
                      code: eq.nodeId ?? eq.id,
                    })
                  }
                  className={cn(
                    'p-4 rounded-lg border cursor-pointer transition-all hover:border-primary/50',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border',
                  )}
                >
                  <p className="text-sm font-medium truncate">{eq.name ?? eq.nodeId}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    编码: {eq.nodeId ?? eq.id}
                  </p>
                  {eq.type && (
                    <Badge variant="secondary" className="mt-2 text-[10px]">
                      {eq.type}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 4: 预览
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const PreviewStep = csv && (
    <div className="space-y-4">
      {/* 映射摘要 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-5 w-5 text-primary" />
            数据预览
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 设备信息 */}
          {selectedDevice && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Server className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{selectedDevice.name}</p>
                <p className="text-xs text-muted-foreground">编码: {selectedDevice.code}</p>
              </div>
            </div>
          )}

          {/* 传感器通道摘要 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">传感器通道映射</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">通道</TableHead>
                  <TableHead className="text-xs">来源列</TableHead>
                  <TableHead className="text-xs text-right">采样数</TableHead>
                  <TableHead className="text-xs text-right">均值</TableHead>
                  <TableHead className="text-xs text-right">最小</TableHead>
                  <TableHead className="text-xs text-right">最大</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedChannels.map((ch, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {ch.roleLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{ch.sourceColumn}</TableCell>
                    <TableCell className="text-xs text-right">{ch.count.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{ch.mean.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{ch.min.toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{ch.max.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 原始数据前 10 行 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              原始数据（前 10 行）
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-10">#</TableHead>
                    {csv.headers.map((h, i) => (
                      <TableHead key={i} className="text-xs">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csv.rows.slice(0, 10).map((row, ri) => (
                    <TableRow key={ri}>
                      <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                      {row.map((cell, ci) => (
                        <TableCell key={ci} className="text-xs">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 5: 诊断执行
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const DiagnosingStep = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-5 w-5 text-primary" />
          HDE 双轨诊断
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 诊断步骤动画 */}
        {!diagResult && !diagError && (
          <div className="py-8 space-y-3">
            {DIAGNOSIS_PHASES.map((label, idx) => {
              const done = diagPhase > idx;
              const active = diagPhase === idx;
              return (
                <div key={idx} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={cn(
                      'text-sm transition-colors',
                      done && 'text-emerald-500',
                      active && 'text-primary font-medium',
                      !done && !active && 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 诊断错误 */}
        {diagError && (
          <div className="py-8 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 mx-auto text-red-500" />
            <p className="text-sm text-red-500">{diagError}</p>
            <Button variant="outline" size="sm" onClick={() => setStep('preview')}>
              返回预览
            </Button>
          </div>
        )}

        {/* 诊断结果 */}
        {diagResult && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 text-emerald-500 mb-4">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">诊断完成</span>
            </div>

            {diagResult.data?.diagnosis && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">故障类型</p>
                    <p className="text-sm font-semibold">
                      {diagResult.data.diagnosis.faultType ?? '—'}
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">置信度</p>
                    <p className="text-sm font-semibold">
                      {diagResult.data.diagnosis.confidence != null
                        ? `${(diagResult.data.diagnosis.confidence * 100).toFixed(1)}%`
                        : '—'}
                    </p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">严重度</p>
                    <Badge
                      variant={
                        diagResult.data.diagnosis.severity === 'critical'
                          ? 'destructive'
                          : diagResult.data.diagnosis.severity === 'warning'
                            ? 'default'
                            : 'secondary'
                      }
                    >
                      {diagResult.data.diagnosis.severity ?? '—'}
                    </Badge>
                  </div>
                </div>

                {diagResult.data.diagnosis.explanation && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground mb-1">诊断说明</p>
                    <p className="text-xs">{diagResult.data.diagnosis.explanation}</p>
                  </div>
                )}

                {diagResult.data.diagnosis.recommendations?.length > 0 && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-[10px] text-muted-foreground mb-1">维护建议</p>
                    <ul className="text-xs space-y-1">
                      {diagResult.data.diagnosis.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={() => setLocation('/app/diagnosis')}
                className="gap-1.5"
              >
                查看完整诊断报告
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStep('upload');
                  setCsv(null);
                  setFileName('');
                  setMapping({});
                  setSelectedDevice(null);
                  setDiagResult(null);
                  setDiagError(null);
                }}
              >
                重新导入
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 底部导航
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const canNext = (() => {
    if (step === 'upload') return !!csv;
    if (step === 'mapping') return hasSensorChannel;
    if (step === 'device') return !!selectedDevice;
    if (step === 'preview') return true;
    return false;
  })();

  const handleNext = () => {
    if (step === 'upload') setStep('mapping');
    else if (step === 'mapping') setStep('device');
    else if (step === 'device') setStep('preview');
    else if (step === 'preview') runDiagnosis();
  };

  const handleBack = () => {
    if (step === 'mapping') setStep('upload');
    else if (step === 'device') setStep('mapping');
    else if (step === 'preview') setStep('device');
  };

  // ── Render ────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {StepIndicator}

      {step === 'upload' && UploadStep}
      {step === 'mapping' && MappingStep}
      {step === 'device' && DeviceStep}
      {step === 'preview' && PreviewStep}
      {step === 'diagnosing' && DiagnosingStep}

      {/* 底部导航按钮 */}
      {step !== 'diagnosing' && (
        <div className="flex justify-between items-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={step === 'upload'}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            上一步
          </Button>
          <Button
            size="sm"
            onClick={handleNext}
            disabled={!canNext}
            className="gap-1.5"
          >
            {step === 'preview' ? '开始诊断' : '下一步'}
            {step === 'preview' ? (
              <Zap className="h-3.5 w-3.5" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
