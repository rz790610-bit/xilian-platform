/**
 * 高级知识蒸馏页面 — DistilLib v2.4 前端
 *
 * 4 个 Tab:
 *   1. 蒸馏控制台 — 配置 + 训练 + 实时结果
 *   2. 策略推荐 — 根据场景自动推荐权重/温度
 *   3. 损失分析 — 各分量可视化 + 温度曲线
 *   4. 训练历史 — 时间线 + 详情弹窗
 */
import { useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  ConfigSection, ConfigSlider, ConfigSelect, ConfigKV, ConfigActions, ApiDocBlock,
} from "@/components/common/AlgorithmConfigPanel";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Cell, PieChart, Pie,
} from "recharts";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 常量
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LOSS_COLORS: Record<string, string> = {
  hard: "#3b82f6",
  response: "#ef4444",
  feature: "#22c55e",
  relation: "#f97316",
  fusion: "#8b5cf6",
  total: "#6366f1",
};

const LOSS_LABELS: Record<string, string> = {
  hard: "硬标签损失 (α)",
  response: "响应蒸馏 (β)",
  feature: "特征蒸馏 (γ)",
  relation: "关系蒸馏",
  fusion: "融合蒸馏",
  total: "总损失",
};

const PRESET_SCENARIOS = [
  { name: "轻量单模态", modalities: [64], computeBudget: 5e5, numClasses: 5, datasetSize: 5000 },
  { name: "标准双模态", modalities: [128, 64], computeBudget: 1e6, numClasses: 10, datasetSize: 10000 },
  { name: "复杂多模态", modalities: [256, 128, 64], computeBudget: 5e6, numClasses: 50, datasetSize: 50000 },
  { name: "超大规模", modalities: [512, 256, 128], computeBudget: 1e7, numClasses: 100, datasetSize: 200000 },
  { name: "港机振动+电流", modalities: [128, 64], computeBudget: 2e6, numClasses: 8, datasetSize: 20000 },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数据生成器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateDemoData(nSamples: number, featureDim: number, nClasses: number): { features: number[][]; labels: number[] } {
  const features: number[][] = [];
  const labels: number[] = [];
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let i = 0; i < nSamples; i++) {
    const label = i % nClasses;
    const feat: number[] = [];
    for (let j = 0; j < featureDim; j++) {
      feat.push((rng() - 0.5) * 2 + label * 0.3 + (j % 3) * 0.1);
    }
    features.push(feat);
    labels.push(label);
  }
  return { features, labels };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主组件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AdvancedDistillation() {
  const [activeTab, setActiveTab] = useState("console");

  // 训练配置
  const [epochs, setEpochs] = useState(15);
  const [learningRate, setLearningRate] = useState(0.001);
  const [patience, setPatience] = useState(5);
  const [nClasses, setNClasses] = useState(5);
  const [nSamples, setNSamples] = useState(200);
  const [teacherHidden, setTeacherHidden] = useState(512);
  const [studentHidden, setStudentHidden] = useState(128);
  const [teacherFeat, setTeacherFeat] = useState(256);
  const [studentFeat, setStudentFeat] = useState(128);
  const [tempMin, setTempMin] = useState(2);
  const [tempMax, setTempMax] = useState(4);

  // 损失权重
  const [alpha, setAlpha] = useState(0.3);
  const [beta, setBeta] = useState(0.4);
  const [gamma, setGamma] = useState(0.3);
  const [relation, setRelation] = useState(0);
  const [fusion, setFusion] = useState(0);

  // 模态配置
  const [modalityDims, setModalityDims] = useState("128,64");

  // 训练结果
  const [trainResult, setTrainResult] = useState<any>(null);
  const [isTraining, setIsTraining] = useState(false);

  // 策略推荐
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [strategyResult, setStrategyResult] = useState<any>(null);

  // 历史弹窗
  const [detailDialog, setDetailDialog] = useState<any>(null);

  // tRPC
  const utils = trpc.useUtils();
  const configQuery = trpc.advancedDistillation.getConfig.useQuery();
  const lossQuery = trpc.advancedDistillation.getLossComponents.useQuery();
  const historyQuery = trpc.advancedDistillation.getHistory.useQuery({ limit: 50 });
  const trainMutation = trpc.advancedDistillation.train.useMutation();
  const strategyMutation = trpc.advancedDistillation.recommendStrategy.useMutation();
  const saveConfigMutation = trpc.advancedDistillation.saveConfig.useMutation();

  // 解析模态维度
  const parsedDims = useMemo(() => {
    return modalityDims.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
  }, [modalityDims]);

  const totalDim = useMemo(() => parsedDims.reduce((a, b) => a + b, 0), [parsedDims]);

  // 执行训练
  const handleTrain = useCallback(async () => {
    if (parsedDims.length === 0) {
      toast.error("请配置至少一个模态维度");
      return;
    }
    if (nSamples < 20) {
      toast.error("样本数至少需要 20");
      return;
    }

    setIsTraining(true);
    try {
      const data = generateDemoData(nSamples, totalDim, nClasses);
      const result = await trainMutation.mutateAsync({
        config: {
          weights: { alpha, beta, gamma, relation, fusion },
          tempRange: [tempMin, tempMax],
          datasetSize: nSamples,
          teacherInputDims: parsedDims,
          teacherHiddenDim: teacherHidden,
          teacherFeatDim: teacherFeat,
          studentInputDims: parsedDims,
          studentHiddenDim: studentHidden,
          studentFeatDim: studentFeat,
          nClasses,
          epochs,
          learningRate,
          patience,
          validationSplit: 0.2,
        },
        trainingData: data,
      });
      setTrainResult(result.data);
      historyQuery.refetch();
      toast.success(`蒸馏完成！最佳验证准确率: ${(result.data.bestValAcc * 100).toFixed(1)}%`);
    } catch (err: any) {
      toast.error(`训练失败: ${err.message}`);
    } finally {
      setIsTraining(false);
    }
  }, [parsedDims, nSamples, nClasses, alpha, beta, gamma, relation, fusion, tempMin, tempMax, teacherHidden, studentHidden, teacherFeat, studentFeat, epochs, learningRate, patience, totalDim, trainMutation, historyQuery]);

  // 策略推荐
  const handleRecommend = useCallback(async () => {
    const preset = PRESET_SCENARIOS[selectedPreset];
    try {
      const result = await strategyMutation.mutateAsync({
        modalities: preset.modalities,
        computeBudget: preset.computeBudget,
        numClasses: preset.numClasses,
        datasetSize: preset.datasetSize,
      });
      setStrategyResult(result.data);

      // 自动应用推荐权重
      if (result.data?.weights) {
        const w = result.data.weights;
        if (w.alpha !== undefined) setAlpha(w.alpha);
        if (w.beta !== undefined) setBeta(w.beta);
        if (w.gamma !== undefined) setGamma(w.gamma);
        if (w.relation !== undefined) setRelation(w.relation);
        if (w.fusion !== undefined) setFusion(w.fusion);
      }
      if (result.data?.tempRange) {
        setTempMin(result.data.tempRange[0]);
        setTempMax(result.data.tempRange[1]);
      }
      setModalityDims(preset.modalities.join(","));
      setNClasses(preset.numClasses);
      setNSamples(Math.min(preset.datasetSize, 500));

      toast.success("策略已推荐并自动应用到配置");
    } catch (err: any) {
      toast.error(`推荐失败: ${err.message}`);
    }
  }, [selectedPreset, strategyMutation]);

  // 保存配置
  const handleSaveConfig = useCallback(async () => {
    try {
      await saveConfigMutation.mutateAsync({
        weights: { alpha, beta, gamma, relation, fusion },
        tempRange: [tempMin, tempMax],
        datasetSize: nSamples,
        teacherInputDims: parsedDims,
        teacherHiddenDim: teacherHidden,
        teacherFeatDim: teacherFeat,
        studentInputDims: parsedDims,
        studentHiddenDim: studentHidden,
        studentFeatDim: studentFeat,
        nClasses,
        epochs,
        learningRate,
        patience,
        validationSplit: 0.2,
      });
      utils.advancedDistillation.getConfig.invalidate();
      toast.success('配置已保存');
    } catch (err: any) {
      toast.error(`保存失败: ${err.message}`);
    }
  }, [alpha, beta, gamma, relation, fusion, tempMin, tempMax, nSamples, parsedDims, teacherHidden, teacherFeat, studentHidden, studentFeat, nClasses, epochs, learningRate, patience, saveConfigMutation, utils]);

  // 训练曲线数据
  const epochChartData = useMemo(() => {
    if (!trainResult?.epochs) return [];
    return trainResult.epochs.map((e: any) => ({
      epoch: e.epoch + 1,
      trainLoss: parseFloat(e.trainLoss.toFixed(4)),
      valAcc: parseFloat((e.valAcc * 100).toFixed(1)),
      temperature: parseFloat(e.temperature.toFixed(2)),
      hard: parseFloat((e.lossDetails?.hard || 0).toFixed(4)),
      response: parseFloat((e.lossDetails?.response || 0).toFixed(4)),
      feature: parseFloat((e.lossDetails?.feature || 0).toFixed(4)),
      relation: parseFloat((e.lossDetails?.relation || 0).toFixed(4)),
      fusion: parseFloat((e.lossDetails?.fusion || 0).toFixed(4)),
    }));
  }, [trainResult]);

  // 损失分量饼图
  const lossPieData = useMemo(() => {
    if (!trainResult?.epochs?.length) return [];
    const last = trainResult.epochs[trainResult.epochs.length - 1].lossDetails;
    return Object.entries(last || {})
      .filter(([k]) => k !== "total" && (last[k] as number) > 0)
      .map(([k, v]) => ({
        name: LOSS_LABELS[k] || k,
        value: parseFloat((v as number).toFixed(4)),
        fill: LOSS_COLORS[k] || "#999",
      }));
  }, [trainResult]);

  // 雷达图
  const radarData = useMemo(() => {
    if (!trainResult?.finalMetrics) return [];
    const m = trainResult.finalMetrics;
    return [
      { metric: "准确率", value: (m.valAcc * 100) },
      { metric: "精确率", value: (m.studentPrecision * 100) },
      { metric: "召回率", value: (m.studentRecall * 100) },
      { metric: "F1", value: (m.studentF1 * 100) },
      { metric: "压缩比", value: Math.min(m.compressionRatio * 20, 100) },
      { metric: "师生一致", value: (m.teacherStudentAgreement * 100) },
    ];
  }, [trainResult]);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* 页面头部 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">高级知识蒸馏</h1>
            <p className="text-muted-foreground mt-1">
              DistilLib v2.4 — 动态温度 · 特征蒸馏 · 关系蒸馏 · 多模态融合蒸馏
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">v2.4</Badge>
            <Badge variant="secondary" className="text-xs">
              {parsedDims.length} 模态 · {totalDim}D
            </Badge>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="console">🎛️ 蒸馏控制台</TabsTrigger>
            <TabsTrigger value="strategy">🧠 策略推荐</TabsTrigger>
            <TabsTrigger value="analysis">📊 损失分析</TabsTrigger>
            <TabsTrigger value="history">📋 训练历史</TabsTrigger>
            <TabsTrigger value="config">⚙️ 系统配置</TabsTrigger>
          </TabsList>

          {/* ━━━━━━━━━━━━━━━ Tab 1: 蒸馏控制台 ━━━━━━━━━━━━━━━ */}
          <TabsContent value="console" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 左: 模型架构 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">模型架构</CardTitle>
                  <CardDescription>教师-学生网络配置</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">模态维度 (逗号分隔)</Label>
                    <Input value={modalityDims} onChange={e => setModalityDims(e.target.value)} placeholder="128,64" className="mt-1" />
                    <p className="text-xs text-muted-foreground mt-1">总维度: {totalDim}D · {parsedDims.length} 模态</p>
                  </div>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-blue-600">🏫 教师模型 (大容量)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">隐藏层</Label>
                        <Input type="number" value={teacherHidden} onChange={e => setTeacherHidden(+e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">特征维度</Label>
                        <Input type="number" value={teacherFeat} onChange={e => setTeacherFeat(+e.target.value)} className="mt-1" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-green-600">🎓 学生模型 (轻量)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">隐藏层</Label>
                        <Input type="number" value={studentHidden} onChange={e => setStudentHidden(+e.target.value)} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">特征维度</Label>
                        <Input type="number" value={studentFeat} onChange={e => setStudentFeat(+e.target.value)} className="mt-1" />
                      </div>
                    </div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">分类数</Label>
                      <Input type="number" value={nClasses} onChange={e => setNClasses(+e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">样本数</Label>
                      <Input type="number" value={nSamples} onChange={e => setNSamples(+e.target.value)} className="mt-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 中: 损失权重 + 温度 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">蒸馏损失权重</CardTitle>
                  <CardDescription>5 种损失分量的权重配置</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "α 硬标签损失", value: alpha, set: setAlpha, color: LOSS_COLORS.hard, desc: "CE(student, labels)" },
                    { label: "β 响应蒸馏", value: beta, set: setBeta, color: LOSS_COLORS.response, desc: "KL(T_soft ∥ S_soft)×T²" },
                    { label: "γ 特征蒸馏", value: gamma, set: setGamma, color: LOSS_COLORS.feature, desc: "MSE(proj(s), t)" },
                    { label: "关系蒸馏", value: relation, set: setRelation, color: LOSS_COLORS.relation, desc: "MSE(S_sim, T_sim)" },
                    { label: "融合蒸馏", value: fusion, set: setFusion, color: LOSS_COLORS.fusion, desc: "Σ KL(T_sub ∥ S_sub)/M" },
                  ].map(({ label, value, set, color, desc }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                          {label}
                        </Label>
                        <span className="text-xs font-mono">{value.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[value]}
                        onValueChange={([v]) => set(v)}
                        min={0} max={1} step={0.05}
                        className="mt-1"
                      />
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  ))}
                  <Separator />
                  <div>
                    <Label className="text-xs">动态温度范围</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input type="number" value={tempMin} onChange={e => setTempMin(+e.target.value)} className="w-20" step={0.5} />
                      <span className="text-xs text-muted-foreground">~</span>
                      <Input type="number" value={tempMax} onChange={e => setTempMax(+e.target.value)} className="w-20" step={0.5} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">EMA 平滑 + warmup 5 epochs + 自适应 beta</p>
                  </div>
                </CardContent>
              </Card>

              {/* 右: 训练参数 + 执行 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">训练参数</CardTitle>
                  <CardDescription>优化器与早停配置</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs">训练轮数 (Epochs)</Label>
                    <Slider value={[epochs]} onValueChange={([v]) => setEpochs(v)} min={5} max={100} step={5} className="mt-1" />
                    <p className="text-xs text-muted-foreground mt-1 text-right">{epochs}</p>
                  </div>
                  <div>
                    <Label className="text-xs">学习率</Label>
                    <Select value={String(learningRate)} onValueChange={v => setLearningRate(+v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.01">1e-2</SelectItem>
                        <SelectItem value="0.001">1e-3</SelectItem>
                        <SelectItem value="0.0001">1e-4</SelectItem>
                        <SelectItem value="0.00001">1e-5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">早停耐心值</Label>
                    <Slider value={[patience]} onValueChange={([v]) => setPatience(v)} min={2} max={20} step={1} className="mt-1" />
                    <p className="text-xs text-muted-foreground mt-1 text-right">{patience}</p>
                  </div>
                  <Separator />
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                    <p className="text-xs font-medium">配置摘要</p>
                    <p className="text-[10px] text-muted-foreground">教师: {parsedDims.join("+")}→{teacherHidden}→{nClasses}</p>
                    <p className="text-[10px] text-muted-foreground">学生: {parsedDims.join("+")}→{studentHidden}→{nClasses}</p>
                    <p className="text-[10px] text-muted-foreground">权重: α={alpha} β={beta} γ={gamma} R={relation} F={fusion}</p>
                    <p className="text-[10px] text-muted-foreground">温度: [{tempMin}, {tempMax}] · 动态EMA</p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleTrain}
                    disabled={isTraining}
                  >
                    {isTraining ? "⏳ 蒸馏训练中..." : "🚀 开始蒸馏训练"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* 训练结果 */}
            {trainResult && (
              <div className="space-y-4">
                {/* 指标卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {[
                    { label: "学生准确率", value: `${(trainResult.finalMetrics.valAcc * 100).toFixed(1)}%`, color: "text-green-600" },
                    { label: "教师准确率", value: `${(trainResult.finalMetrics.teacherAccuracy * 100).toFixed(1)}%`, color: "text-blue-600" },
                    { label: "压缩比", value: `${trainResult.finalMetrics.compressionRatio.toFixed(1)}x`, color: "text-purple-600" },
                    { label: "师生一致率", value: `${(trainResult.finalMetrics.teacherStudentAgreement * 100).toFixed(1)}%`, color: "text-orange-600" },
                    { label: "F1 分数", value: `${(trainResult.finalMetrics.studentF1 * 100).toFixed(1)}%`, color: "text-cyan-600" },
                    { label: "训练耗时", value: `${trainResult.durationMs}ms`, color: "text-gray-600" },
                  ].map(({ label, value, color }) => (
                    <Card key={label} className="p-3">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className={`text-lg font-bold ${color}`}>{value}</p>
                    </Card>
                  ))}
                </div>

                {/* 训练曲线 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">训练损失 & 验证准确率</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={epochChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="epoch" fontSize={10} />
                          <YAxis yAxisId="loss" fontSize={10} />
                          <YAxis yAxisId="acc" orientation="right" fontSize={10} domain={[0, 100]} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line yAxisId="loss" type="monotone" dataKey="trainLoss" stroke="#6366f1" name="总损失" strokeWidth={2} dot={false} />
                          <Line yAxisId="acc" type="monotone" dataKey="valAcc" stroke="#22c55e" name="验证准确率%" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">学生模型性能雷达图</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <RadarChart data={radarData}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="metric" fontSize={10} />
                          <PolarRadiusAxis domain={[0, 100]} fontSize={9} />
                          <Radar name="学生" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ━━━━━━━━━━━━━━━ Tab 2: 策略推荐 ━━━━━━━━━━━━━━━ */}
          <TabsContent value="strategy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">场景选择</CardTitle>
                <CardDescription>选择预设场景或自定义，引擎将自动推荐最优蒸馏策略</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {PRESET_SCENARIOS.map((s, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedPreset(i)}
                      className={`cursor-pointer rounded-lg border p-3 transition-all ${
                        selectedPreset === i
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {s.modalities.length} 模态 · {s.numClasses} 类 · {(s.datasetSize / 1000).toFixed(0)}K 样本
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        维度: [{s.modalities.join(", ")}]
                      </p>
                    </div>
                  ))}
                </div>
                <Button onClick={handleRecommend} disabled={strategyMutation.isPending}>
                  {strategyMutation.isPending ? "推荐中..." : "🧠 推荐策略并应用"}
                </Button>
              </CardContent>
            </Card>

            {strategyResult && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">推荐策略</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-xs font-medium">策略基线</TableCell>
                          <TableCell>
                            <Badge variant={strategyResult.base === "lightweight" ? "secondary" : "default"}>
                              {strategyResult.base === "lightweight" ? "轻量级" : "综合型"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-xs font-medium">温度范围</TableCell>
                          <TableCell className="text-xs font-mono">[{strategyResult.tempRange?.[0]}, {strategyResult.tempRange?.[1]}]</TableCell>
                        </TableRow>
                        {Object.entries(strategyResult.weights || {}).map(([k, v]) => (
                          <TableRow key={k}>
                            <TableCell className="text-xs font-medium">{k}</TableCell>
                            <TableCell className="text-xs font-mono">{(v as number).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">推荐权重分布</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={Object.entries(strategyResult.weights || {}).map(([k, v]) => ({
                        name: k, value: v as number, fill: LOSS_COLORS[k] || "#999"
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Bar dataKey="value" name="权重">
                          {Object.entries(strategyResult.weights || {}).map(([k], i) => (
                            <Cell key={i} fill={LOSS_COLORS[k] || "#999"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* 算法说明 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">策略推荐算法 — recommend_strategy()</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertTitle className="text-xs">决策逻辑</AlertTitle>
                  <AlertDescription className="text-xs space-y-1 mt-1">
                    <p>1. <strong>轻量级评分</strong> = 0.4 × (计算预算低?) + 0.3 × (单模态?) + 0.3 × (类别数≤50?)</p>
                    <p>2. 评分 &gt; 0.5 → <Badge variant="secondary" className="text-[10px]">lightweight</Badge>，否则 → <Badge className="text-[10px]">comprehensive</Badge></p>
                    <p>3. 多模态 → 自动添加 fusion=0.2；复杂任务 → 自动添加 relation=0.2</p>
                    <p>4. 温度范围: 复杂任务或大数据集 → [3,6]，否则 → [2,4]</p>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━━━━━━━━━━━━━ Tab 3: 损失分析 ━━━━━━━━━━━━━━━ */}
          <TabsContent value="analysis" className="space-y-4">
            {!trainResult ? (
              <Alert>
                <AlertTitle>尚无训练数据</AlertTitle>
                <AlertDescription>请先在「蒸馏控制台」执行一次训练</AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 损失分量曲线 */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">损失分量趋势</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={epochChartData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="epoch" fontSize={10} />
                          <YAxis fontSize={10} />
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          {Object.entries(LOSS_COLORS).filter(([k]) => k !== "total").map(([key, color]) => (
                            <Area
                              key={key}
                              type="monotone"
                              dataKey={key}
                              stackId="1"
                              stroke={color}
                              fill={color}
                              fillOpacity={0.3}
                              name={LOSS_LABELS[key]}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* 损失分量占比 */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">最终损失占比</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={lossPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {lossPieData.map((entry: any, i: number) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* 动态温度曲线 */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">动态温度变化</CardTitle>
                    <CardDescription>DynamicTemperature: EMA(α=0.9) + warmup(5 epochs) + adaptive β</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={epochChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="epoch" fontSize={10} />
                        <YAxis fontSize={10} domain={[0, "auto"]} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="temperature" stroke="#f59e0b" name="温度 T" strokeWidth={2} dot />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* 损失分量说明 */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">损失分量详解</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">分量</TableHead>
                          <TableHead className="text-xs">公式</TableHead>
                          <TableHead className="text-xs">说明</TableHead>
                          <TableHead className="text-xs">权重</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(lossQuery.data || []).map((c: any) => (
                          <TableRow key={c.key}>
                            <TableCell className="text-xs">
                              <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: c.color }} />
                              {c.icon} {c.name}
                            </TableCell>
                            <TableCell className="text-xs font-mono">{c.formula}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.key === "hard" && "学生对真实标签的分类损失"}
                              {c.key === "response" && "教师软标签知识迁移，T² 缩放"}
                              {c.key === "feature" && "投影层 + L2 归一化 + MSE 对齐"}
                              {c.key === "relation" && "样本间余弦相似度矩阵对齐"}
                              {c.key === "fusion" && "子集模态 KL 对齐（多模态专用）"}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {c.key === "hard" && alpha.toFixed(2)}
                              {c.key === "response" && beta.toFixed(2)}
                              {c.key === "feature" && gamma.toFixed(2)}
                              {c.key === "relation" && relation.toFixed(2)}
                              {c.key === "fusion" && fusion.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ━━━━━━━━━━━━━━━ Tab 4: 训练历史 ━━━━━━━━━━━━━━━ */}
          <TabsContent value="history" className="space-y-4">
            {historyQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : !historyQuery.data?.items?.length ? (
              <Alert>
                <AlertTitle>暂无训练记录</AlertTitle>
                <AlertDescription>执行蒸馏训练后，记录将自动保存在此处</AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">训练记录 ({historyQuery.data.total} 条)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">时间</TableHead>
                          <TableHead className="text-xs">策略</TableHead>
                          <TableHead className="text-xs">模态</TableHead>
                          <TableHead className="text-xs">学生准确率</TableHead>
                          <TableHead className="text-xs">压缩比</TableHead>
                          <TableHead className="text-xs">耗时</TableHead>
                          <TableHead className="text-xs">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyQuery.data.items.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs">{new Date(item.timestamp).toLocaleString("zh-CN")}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">
                                {item.result.strategy?.base || "unknown"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {item.config.studentInputDims?.join("+")}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-green-600">
                              {(item.result.bestValAcc * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.result.finalMetrics.compressionRatio.toFixed(1)}x
                            </TableCell>
                            <TableCell className="text-xs">{item.result.durationMs}ms</TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" className="text-xs h-7"
                                onClick={() => setDetailDialog(item)}>
                                详情
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ━━━━━━━━━━━━━━━ Tab 5: 系统配置 ━━━━━━━━━━━━━━━ */}
          <TabsContent value="config" className="space-y-4">
            <DistillConfigTab
              alpha={alpha} setAlpha={setAlpha}
              beta={beta} setBeta={setBeta}
              gamma={gamma} setGamma={setGamma}
              relation={relation} setRelation={setRelation}
              fusion={fusion} setFusion={setFusion}
              tempMin={tempMin} setTempMin={setTempMin}
              tempMax={tempMax} setTempMax={setTempMax}
              teacherHidden={teacherHidden} setTeacherHidden={setTeacherHidden}
              studentHidden={studentHidden} setStudentHidden={setStudentHidden}
              teacherFeat={teacherFeat} setTeacherFeat={setTeacherFeat}
              studentFeat={studentFeat} setStudentFeat={setStudentFeat}
              epochs={epochs} setEpochs={setEpochs}
              learningRate={learningRate} setLearningRate={setLearningRate}
              patience={patience} setPatience={setPatience}
              nClasses={nClasses} setNClasses={setNClasses}
              modalityDims={modalityDims} setModalityDims={setModalityDims}
              onSaveConfig={handleSaveConfig}
              isSaving={saveConfigMutation.isPending}
            />
          </TabsContent>
        </Tabs>

        {/* 详情弹窗 */}
        <Dialog open={!!detailDialog} onOpenChange={() => setDetailDialog(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>训练详情 — {detailDialog?.id}</DialogTitle>
            </DialogHeader>
            {detailDialog && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "最佳准确率", value: `${(detailDialog.result.bestValAcc * 100).toFixed(1)}%` },
                    { label: "压缩比", value: `${detailDialog.result.finalMetrics.compressionRatio.toFixed(1)}x` },
                    { label: "师生一致率", value: `${(detailDialog.result.finalMetrics.teacherStudentAgreement * 100).toFixed(1)}%` },
                    { label: "教师准确率", value: `${(detailDialog.result.finalMetrics.teacherAccuracy * 100).toFixed(1)}%` },
                    { label: "F1", value: `${(detailDialog.result.finalMetrics.studentF1 * 100).toFixed(1)}%` },
                    { label: "耗时", value: `${detailDialog.result.durationMs}ms` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-muted/50 rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="text-sm font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-medium mb-2">配置参数</p>
                  <pre className="text-[10px] bg-muted p-3 rounded-lg overflow-x-auto">
                    {JSON.stringify(detailDialog.config, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-medium mb-2">训练曲线</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={detailDialog.result.epochs.map((e: any, i: number) => ({
                      epoch: i + 1,
                      loss: parseFloat(e.trainLoss.toFixed(4)),
                      acc: parseFloat((e.valAcc * 100).toFixed(1)),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="epoch" fontSize={10} />
                      <YAxis yAxisId="l" fontSize={10} />
                      <YAxis yAxisId="a" orientation="right" fontSize={10} domain={[0, 100]} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Line yAxisId="l" type="monotone" dataKey="loss" stroke="#6366f1" name="损失" dot={false} />
                      <Line yAxisId="a" type="monotone" dataKey="acc" stroke="#22c55e" name="准确率%" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 高级知识蒸馏系统配置 Tab
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DistillConfigTab(props: {
  alpha: number; setAlpha: (v: number) => void;
  beta: number; setBeta: (v: number) => void;
  gamma: number; setGamma: (v: number) => void;
  relation: number; setRelation: (v: number) => void;
  fusion: number; setFusion: (v: number) => void;
  tempMin: number; setTempMin: (v: number) => void;
  tempMax: number; setTempMax: (v: number) => void;
  teacherHidden: number; setTeacherHidden: (v: number) => void;
  studentHidden: number; setStudentHidden: (v: number) => void;
  teacherFeat: number; setTeacherFeat: (v: number) => void;
  studentFeat: number; setStudentFeat: (v: number) => void;
  epochs: number; setEpochs: (v: number) => void;
  learningRate: number; setLearningRate: (v: number) => void;
  patience: number; setPatience: (v: number) => void;
  nClasses: number; setNClasses: (v: number) => void;
  modalityDims: string; setModalityDims: (v: string) => void;
  onSaveConfig: () => Promise<void>;
  isSaving: boolean;
}) {
  const {
    alpha, setAlpha, beta, setBeta, gamma, setGamma, relation, setRelation, fusion, setFusion,
    tempMin, setTempMin, tempMax, setTempMax,
    teacherHidden, setTeacherHidden, studentHidden, setStudentHidden,
    teacherFeat, setTeacherFeat, studentFeat, setStudentFeat,
    epochs, setEpochs, learningRate, setLearningRate, patience, setPatience,
    nClasses, setNClasses, modalityDims, setModalityDims,
    onSaveConfig, isSaving,
  } = props;

  const [dirty, setDirty] = useState(false);

  const handleReset = () => {
    setAlpha(0.3); setBeta(0.4); setGamma(0.3); setRelation(0); setFusion(0);
    setTempMin(2); setTempMax(4);
    setTeacherHidden(512); setStudentHidden(128);
    setTeacherFeat(256); setStudentFeat(128);
    setEpochs(50); setLearningRate(0.001); setPatience(5);
    setNClasses(5); setModalityDims("128,64");
    setDirty(true);
    toast.info("已恢复默认配置");
  };

  const handleExport = () => {
    const config = {
      weights: { alpha, beta, gamma, relation, fusion },
      temperature: { min: tempMin, max: tempMax },
      model: {
        teacherHiddenDim: teacherHidden, studentHiddenDim: studentHidden,
        teacherFeatDim: teacherFeat, studentFeatDim: studentFeat,
      },
      training: { epochs, learningRate, patience, nClasses },
      modalityDims: modalityDims.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `distillation-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = (fn: (v: number) => void) => (v: number) => { fn(v); setDirty(true); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 列1: 损失权重 */}
        <ConfigSection title="损失权重配置" icon={<span>⚖️</span>} description="5 种蒸馏损失分量的权重">
          <ConfigSlider label="α 硬标签损失" value={alpha} onChange={s(setAlpha)} min={0} max={1} step={0.05}
            description="学生对真实标签的交叉熵" />
          <ConfigSlider label="β 响应蒸馏" value={beta} onChange={s(setBeta)} min={0} max={1} step={0.05}
            description="教师-学生 soft logits KL 散度" />
          <ConfigSlider label="γ 特征蒸馏" value={gamma} onChange={s(setGamma)} min={0} max={1} step={0.05}
            description="中间层特征投影 MSE" />
          <ConfigSlider label="关系蒸馏" value={relation} onChange={s(setRelation)} min={0} max={1} step={0.05}
            description="样本间余弦相似度矩阵对齐" />
          <ConfigSlider label="融合蒸馏" value={fusion} onChange={s(setFusion)} min={0} max={1} step={0.05}
            description="多模态子集 KL 对齐" />
          <div className="pt-2 border-t border-border/30">
            <ConfigKV label="权重总和" value={
              <span className={`font-mono font-bold ${
                Math.abs(alpha + beta + gamma + relation + fusion - 1.0) < 0.01 ? 'text-green-400' : 'text-amber-400'
              }`}>
                {(alpha + beta + gamma + relation + fusion).toFixed(2)}
              </span>
            } />
          </div>
        </ConfigSection>

        {/* 列2: 温度 + 模型架构 */}
        <div className="space-y-4">
          <ConfigSection title="动态温度" icon={<span>🌡️</span>} description="EMA 自适应温度范围">
            <ConfigSlider label="温度下界" value={tempMin} onChange={s(setTempMin)} min={0.5} max={10} step={0.5} />
            <ConfigSlider label="温度上界" value={tempMax} onChange={s(setTempMax)} min={1} max={20} step={0.5} />
            <ConfigKV label="EMA 系数 (α)" value="0.9" mono />
            <ConfigKV label="Warmup 轮数" value="5" mono />
          </ConfigSection>

          <ConfigSection title="模型架构" icon={<span>🏗️</span>} description="教师/学生网络维度">
            <ConfigSlider label="教师隐藏层" value={teacherHidden} onChange={s(setTeacherHidden)} min={64} max={1024} step={64} unit="dim" />
            <ConfigSlider label="学生隐藏层" value={studentHidden} onChange={s(setStudentHidden)} min={32} max={512} step={32} unit="dim" />
            <ConfigSlider label="教师特征维度" value={teacherFeat} onChange={s(setTeacherFeat)} min={64} max={512} step={64} unit="dim" />
            <ConfigSlider label="学生特征维度" value={studentFeat} onChange={s(setStudentFeat)} min={32} max={256} step={32} unit="dim" />
            <ConfigKV label="压缩比" value={
              <span className="font-mono font-bold text-primary">{(teacherHidden / studentHidden).toFixed(1)}x</span>
            } />
          </ConfigSection>
        </div>

        {/* 列3: 训练参数 */}
        <div className="space-y-4">
          <ConfigSection title="训练参数" icon={<span>📈</span>} description="训练超参数配置">
            <ConfigSlider label="训练轮数" value={epochs} onChange={s(setEpochs)} min={5} max={200} step={5} unit="epochs" />
            <ConfigSlider label="学习率" value={learningRate} onChange={s(setLearningRate)} min={0.0001} max={0.01} step={0.0001}
              formatValue={v => v.toFixed(4)} />
            <ConfigSlider label="早停耐心" value={patience} onChange={s(setPatience)} min={2} max={20} step={1} unit="epochs" />
            <ConfigSlider label="分类数" value={nClasses} onChange={s(setNClasses)} min={2} max={20} step={1} />
          </ConfigSection>

          <ConfigSection title="模态配置" icon={<span>🔀</span>} description="多模态输入维度（逗号分隔）">
            <input
              value={modalityDims}
              onChange={e => { setModalityDims(e.target.value); setDirty(true); }}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground font-mono"
              placeholder="128,64,32"
            />
            <ConfigKV label="模态数量" value={
              <span className="font-mono">{modalityDims.split(',').filter(s => s.trim()).length}</span>
            } />
            <ConfigKV label="总维度" value={
              <span className="font-mono">{modalityDims.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)).reduce((a, b) => a + b, 0)}D</span>
            } />
          </ConfigSection>
        </div>
      </div>

      {/* API 文档 */}
      <ApiDocBlock
        title="Python 算法对接"
        icon={<span>🐍</span>}
        endpoints={[
          { method: 'POST', path: '/api/trpc/advancedDistillation.train', description: '执行高级蒸馏训练', body: '{ config: {...}, trainingData: [...] }' },
          { method: 'POST', path: '/api/trpc/advancedDistillation.recommendStrategy', description: '策略推荐', body: '{ modalities, computeBudget, numClasses, datasetSize }' },
          { method: 'GET', path: '/api/trpc/advancedDistillation.getConfig', description: '获取默认配置' },
          { method: 'GET', path: '/api/trpc/advancedDistillation.getLossComponents', description: '获取损失分量说明' },
          { method: 'GET', path: '/api/trpc/advancedDistillation.getHistory', description: '获取训练历史' },
          { method: 'GET', path: '/api/trpc/advancedDistillation.getHistoryItem', description: '获取单条训练详情' },
        ]}
        pythonExample={`import requests\n\nBASE = "http://localhost:3000/api/trpc"\n\n# 1. 执行蒸馏训练\nres = requests.post(f"{BASE}/advancedDistillation.train", json={\n    "config": {\n        "weights": {"alpha": 0.3, "beta": 0.4, "gamma": 0.3, "relation": 0, "fusion": 0},\n        "tempRange": [2, 4],\n        "teacherInputDims": [128, 64],\n        "teacherHiddenDim": 512,\n        "studentHiddenDim": 128,\n        "nClasses": 5,\n        "epochs": 50,\n        "learningRate": 0.001\n    },\n    "trainingData": [...]\n})\nprint(res.json())\n\n# 2. 策略推荐\nres = requests.post(f"{BASE}/advancedDistillation.recommendStrategy", json={\n    "modalities": [128, 64],\n    "computeBudget": "medium",\n    "numClasses": 5,\n    "datasetSize": 1000\n})\nprint(res.json())`}
        note="核心算法（DynamicTemperature、FeatureDistillLoss、RelationDistillLoss、多模态融合）已在 TypeScript 端 1:1 实现。"
      />

      {/* 操作按钮 */}
      <ConfigActions
        onSave={async () => { await onSaveConfig(); setDirty(false); }}
        onReset={handleReset}
        onExport={handleExport}
        dirty={dirty}
        saveLabel={isSaving ? "保存中..." : "保存配置"}
      />
    </div>
  );
}
