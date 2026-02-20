import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { trpc } from '@/lib/trpc';
import { Upload, Play, FileUp } from 'lucide-react';
import { useToast } from '@/components/common/Toast';
import axios from 'axios';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

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

export default function ModelInference() {
  const { selectedModel, setSelectedModel } = useAppStore();
  const { data: models } = trpc.model.listModels.useQuery();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [sampleRate, setSampleRate] = useState('10000');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<{
    rms: number;
    peak: number;
    freq: number;
    cf: number;
    spectrum?: { freqs: number[]; amplitude: number[] };
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      toast.error('请先选择文件');
      return;
    }

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post(
        // [P1-A2 修复] 使用相对路径替代硬编码 localhost:8000
        `/api/analyze?sample_rate=${sampleRate}`,
        formData
      );

      setResult({
        rms: response.data.signal?.rms || 0,
        peak: response.data.signal?.peak || 0,
        freq: response.data.spectrum?.dominant_freq || 0,
        cf: response.data.signal?.crest_factor || 0,
        spectrum: response.data.spectrum
      });
      toast.success('分析完成');
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误';
      toast.error(`分析失败：${msg}，请确认分析服务已启动`);
    }
    setIsAnalyzing(false);
  };

  const chartData = result?.spectrum ? {
    labels: (result.spectrum.freqs || []).filter(f => f <= 2000).map(f => f.toFixed(0)),
    datasets: [{
      label: '频谱幅值',
      data: (result.spectrum.amplitude || []).slice(0, (result.spectrum.freqs || []).filter(f => f <= 2000).length),
      borderColor: 'oklch(0.65 0.18 240)',
      backgroundColor: 'oklch(0.65 0.18 240 / 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 0
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        title: { display: true, text: '频率 (Hz)', color: 'oklch(0.55 0.03 250)' },
        ticks: { color: 'oklch(0.55 0.03 250)' },
        grid: { color: 'oklch(0.28 0.04 250 / 0.3)' }
      },
      y: {
        title: { display: true, text: '幅值', color: 'oklch(0.55 0.03 250)' },
        ticks: { color: 'oklch(0.55 0.03 250)' },
        grid: { color: 'oklch(0.28 0.04 250 / 0.3)' }
      }
    }
  };

  return (
    <MainLayout title="模型推理">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="mb-7">
          <h2 className="text-2xl font-bold mb-2">模型推理</h2>
          <p className="text-muted-foreground">上传振动数据进行智能分析</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Input section */}
          <div className="space-y-5">
            <PageCard title="数据输入" icon="📤">
              <div className="space-y-4">
                <div>
                  <Label>选择模型</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {(models || []).filter(m => m.type === 'llm').map((model) => (
                        <SelectItem key={model.modelId} value={model.name}>
                          {model.displayName || model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>采样率 (Hz)</Label>
                  <Input
                    type="number"
                    value={sampleRate}
                    onChange={(e) => setSampleRate(e.target.value)}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>上传文件</Label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {file ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileUp className="w-5 h-5 text-primary" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">点击选择 CSV 文件</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleAnalyze}
                  disabled={!file || isAnalyzing}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isAnalyzing ? '分析中...' : '开始分析'}
                </Button>
              </div>
            </PageCard>
          </div>

          {/* Results section */}
          <div className="lg:col-span-2 space-y-5">
            {result ? (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    value={result.rms.toFixed(3)}
                    label="RMS 值"
                    icon="📊"
                  />
                  <StatCard
                    value={result.peak.toFixed(3)}
                    label="峰值"
                    icon="📈"
                  />
                  <StatCard
                    value={result.freq.toFixed(1)}
                    label="主频 (Hz)"
                    icon="🔊"
                  />
                  <StatCard
                    value={result.cf.toFixed(2)}
                    label="峰值因子"
                    icon="⚡"
                  />
                </div>

                {/* Chart */}
                {chartData && (
                  <PageCard title="频谱分析" icon="📈">
                    <div className="h-[300px]">
                      <Line data={chartData} options={chartOptions} />
                    </div>
                  </PageCard>
                )}
              </>
            ) : (
              <PageCard>
                <div className="text-center py-16 text-muted-foreground">
                  <span className="text-5xl block mb-4">📊</span>
                  <p>上传数据文件并点击分析查看结果</p>
                </div>
              </PageCard>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
