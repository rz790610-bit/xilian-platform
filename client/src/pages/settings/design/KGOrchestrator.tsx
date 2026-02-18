/**
 * 知识图谱编排器 — 主页面
 * 位于: 设计工具 > 知识图谱编排
 * 5 个 Tab: 图谱画布 | 场景模板 | 诊断运行 | 自进化面板 | 图谱列表
 */
import { useState, useMemo, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useKGOrchestratorStore } from "../../../stores/kgOrchestratorStore";
import { useToast } from "@/components/common/Toast";
import KGCanvas from "../../../components/kg-orchestrator/KGCanvas";
import KGComponentPanel from "../../../components/kg-orchestrator/KGComponentPanel";
import KGConfigPanel from "../../../components/kg-orchestrator/KGConfigPanel";
import KGToolbar from "../../../components/kg-orchestrator/KGToolbar";
import type {
  KGEditorNode, KGEditorEdge, KGScenario,
} from "@shared/kgOrchestratorTypes";

// ─── Tab 定义 ───
const TABS = [
  { id: "canvas", label: "图谱画布", icon: "🕸️" },
  { id: "templates", label: "场景模板", icon: "📋" },
  { id: "diagnosis", label: "诊断运行", icon: "🔬" },
  { id: "evolution", label: "自进化面板", icon: "🔄" },
  { id: "list", label: "图谱列表", icon: "📁" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── 场景模板数据 ───
interface ScenarioTemplate {
  id: string;
  name: string;
  scenario: KGScenario;
  description: string;
  icon: string;
  tags: string[];
  build: () => { nodes: KGEditorNode[]; edges: KGEditorEdge[] };
}

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: "crane-vibration",
    name: "起重机振动诊断",
    scenario: "vibration_diagnosis",
    description: "基于振动信号的起重机故障诊断图谱，覆盖轴承、齿轮、电机等关键部件的振动特征分析、故障模式识别和维修方案推荐",
    icon: "🏗️",
    tags: ["振动", "起重机", "轴承", "齿轮"],
    build: () => {
      const nodes: KGEditorNode[] = [
        { nodeId: "n1", category: "equipment", subType: "device", label: "桥式起重机", x: 400, y: 60, config: { deviceType: "crane", model: "QD-50t" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n2", category: "equipment", subType: "component", label: "主减速箱", x: 200, y: 160, config: { componentType: "gearbox" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n3", category: "equipment", subType: "component", label: "主电机", x: 400, y: 160, config: { componentType: "motor" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n4", category: "equipment", subType: "component", label: "卷筒轴承", x: 600, y: 160, config: { componentType: "bearing" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n5", category: "equipment", subType: "sensor", label: "振动传感器-驱动端", x: 100, y: 280, config: { sensorType: "vibration", measurementType: "acceleration", unit: "mm/s²" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n6", category: "equipment", subType: "sensor", label: "振动传感器-非驱动端", x: 300, y: 280, config: { sensorType: "vibration", measurementType: "velocity", unit: "mm/s" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n7", category: "equipment", subType: "sensor", label: "温度传感器", x: 500, y: 280, config: { sensorType: "temperature", unit: "℃" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n8", category: "data", subType: "realtime_data", label: "MQTT实时数据", x: 100, y: 400, config: { mqttTopic: "crane/+/vibration", samplingFrequency: 10240, bufferWindow: 10 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n9", category: "data", subType: "historical_data", label: "历史故障数据", x: 300, y: 400, config: { dataSource: "clickhouse", timeRange: "最近2年" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n10", category: "diagnosis", subType: "feature_extraction", label: "FFT频谱分析", x: 100, y: 530, config: { method: "fft", windowSize: 4096, outputFeatures: ["基频", "2x", "3x", "BPFO", "BPFI", "BSF"] }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n11", category: "diagnosis", subType: "feature_extraction", label: "包络分析", x: 300, y: 530, config: { method: "envelope", windowSize: 2048, outputFeatures: ["包络峰值", "包络RMS"] }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n12", category: "mechanism", subType: "threshold_model", label: "ISO 10816阈值", x: 500, y: 400, config: { normalRange: "0-1.8 mm/s", cautionRange: "1.8-4.5 mm/s", warningRange: "4.5-11.2 mm/s", dangerRange: ">11.2 mm/s" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n13", category: "fault", subType: "fault_mode", label: "齿轮磨损", x: 100, y: 660, config: { severity: "medium", frequency: "齿啮合频率及边带" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n14", category: "fault", subType: "fault_mode", label: "轴承内圈故障", x: 300, y: 660, config: { severity: "high", frequency: "BPFI及谐波" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n15", category: "fault", subType: "fault_mode", label: "电机不平衡", x: 500, y: 660, config: { severity: "medium", frequency: "1x转频" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n16", category: "diagnosis", subType: "diagnosis_rule", label: "振动诊断规则引擎", x: 300, y: 790, config: { operator: "gt", threshold: 4.5 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n17", category: "diagnosis", subType: "inference_engine", label: "GNN故障推理", x: 500, y: 790, config: { engineType: "gnn", maxHops: 3, confidenceThreshold: 0.7 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n18", category: "solution", subType: "repair", label: "更换轴承", x: 100, y: 920, config: { steps: ["停机", "拆卸端盖", "取出旧轴承", "安装新轴承", "回装端盖", "试运行"], requiredParts: ["SKF 6310-2RS"], estimatedTime: 240, successRate: 95, cost: 3500 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n19", category: "solution", subType: "repair", label: "齿轮更换", x: 300, y: 920, config: { steps: ["停机", "拆卸箱盖", "更换齿轮副", "调整啮合间隙", "回装", "跑合试验"], requiredParts: ["主动齿轮", "从动齿轮"], estimatedTime: 480, successRate: 90, cost: 12000 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n20", category: "solution", subType: "emergency", label: "紧急降速", x: 500, y: 920, config: { actionType: "slowdown", executionCondition: "振动值 > 11.2 mm/s", autoExecute: true }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n21", category: "solution", subType: "prevention", label: "定期润滑计划", x: 700, y: 920, config: { period: 30, checkItems: ["润滑脂量", "油品分析", "振动基线"], triggerCondition: "运行时间 > 720h" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n22", category: "mechanism", subType: "physical_model", label: "轴承振动力学", x: 700, y: 400, config: { modelType: "vibration_dynamics", formula: "f_BPFI = (N/2)*(1+d/D*cosα)*RPM/60", applicableConditions: "转速 50-3000 RPM" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n23", category: "mechanism", subType: "degradation_model", label: "轴承退化曲线", x: 700, y: 530, config: { degradationFunction: "exponential", initialValue: 100, accelerationFactor: 1.2 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "n24", category: "data", subType: "knowledge_base", label: "设备维修手册", x: 700, y: 660, config: { searchTopK: 5, similarityThreshold: 0.75 }, nodeStatus: "normal", hitCount: 0 },
      ];
      const edges: KGEditorEdge[] = [
        { edgeId: "e1", sourceNodeId: "n1", targetNodeId: "n2", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "e2", sourceNodeId: "n1", targetNodeId: "n3", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "e3", sourceNodeId: "n1", targetNodeId: "n4", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "e4", sourceNodeId: "n2", targetNodeId: "n5", relationType: "HAS_SENSOR", label: "安装传感器", weight: 1, hitCount: 0 },
        { edgeId: "e5", sourceNodeId: "n2", targetNodeId: "n6", relationType: "HAS_SENSOR", label: "安装传感器", weight: 1, hitCount: 0 },
        { edgeId: "e6", sourceNodeId: "n3", targetNodeId: "n7", relationType: "HAS_SENSOR", label: "安装传感器", weight: 1, hitCount: 0 },
        { edgeId: "e7", sourceNodeId: "n8", targetNodeId: "n10", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "e8", sourceNodeId: "n8", targetNodeId: "n11", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "e9", sourceNodeId: "n9", targetNodeId: "n16", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "e10", sourceNodeId: "n10", targetNodeId: "n13", relationType: "FEEDS", label: "特征→故障", weight: 1, hitCount: 0 },
        { edgeId: "e11", sourceNodeId: "n11", targetNodeId: "n14", relationType: "FEEDS", label: "特征→故障", weight: 1, hitCount: 0 },
        { edgeId: "e12", sourceNodeId: "n12", targetNodeId: "n15", relationType: "TRIGGERS", label: "超阈值触发", weight: 1, hitCount: 0 },
        { edgeId: "e13", sourceNodeId: "n13", targetNodeId: "n16", relationType: "DIAGNOSED_BY", label: "诊断依据", weight: 1, hitCount: 0 },
        { edgeId: "e14", sourceNodeId: "n14", targetNodeId: "n16", relationType: "DIAGNOSED_BY", label: "诊断依据", weight: 1, hitCount: 0 },
        { edgeId: "e15", sourceNodeId: "n15", targetNodeId: "n17", relationType: "DIAGNOSED_BY", label: "诊断依据", weight: 1, hitCount: 0 },
        { edgeId: "e16", sourceNodeId: "n16", targetNodeId: "n17", relationType: "FEEDS", label: "规则→推理", weight: 1, hitCount: 0 },
        { edgeId: "e17", sourceNodeId: "n14", targetNodeId: "n18", relationType: "RESOLVED_BY", label: "解决方案", weight: 1, hitCount: 0 },
        { edgeId: "e18", sourceNodeId: "n13", targetNodeId: "n19", relationType: "RESOLVED_BY", label: "解决方案", weight: 1, hitCount: 0 },
        { edgeId: "e19", sourceNodeId: "n15", targetNodeId: "n20", relationType: "TRIGGERS", label: "触发应急", weight: 1, hitCount: 0 },
        { edgeId: "e20", sourceNodeId: "n17", targetNodeId: "n21", relationType: "RESOLVED_BY", label: "预防策略", weight: 1, hitCount: 0 },
        { edgeId: "e21", sourceNodeId: "n22", targetNodeId: "n10", relationType: "REFERENCES", label: "机理参考", weight: 1, hitCount: 0 },
        { edgeId: "e22", sourceNodeId: "n23", targetNodeId: "n14", relationType: "CAUSES", label: "退化导致", weight: 1, hitCount: 0 },
        { edgeId: "e23", sourceNodeId: "n24", targetNodeId: "n17", relationType: "REFERENCES", label: "知识引用", weight: 1, hitCount: 0 },
        { edgeId: "e24", sourceNodeId: "n13", targetNodeId: "n14", relationType: "AFFECTS", label: "影响", weight: 0.6, hitCount: 0 },
      ];
      return { nodes, edges };
    },
  },
  {
    id: "degradation-prediction",
    name: "设备退化预测",
    scenario: "degradation_prediction",
    description: "基于退化模型和历史数据的设备剩余寿命预测图谱，支持 Weibull/指数退化曲线和多传感器融合",
    icon: "📉",
    tags: ["退化", "寿命预测", "RUL"],
    build: () => {
      const nodes: KGEditorNode[] = [
        { nodeId: "d1", category: "equipment", subType: "device", label: "目标设备", x: 350, y: 60, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d2", category: "equipment", subType: "component", label: "关键部件A", x: 200, y: 160, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d3", category: "equipment", subType: "component", label: "关键部件B", x: 500, y: 160, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d4", category: "equipment", subType: "sensor", label: "振动传感器", x: 100, y: 280, config: { sensorType: "vibration" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d5", category: "equipment", subType: "sensor", label: "温度传感器", x: 300, y: 280, config: { sensorType: "temperature" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d6", category: "equipment", subType: "sensor", label: "电流传感器", x: 500, y: 280, config: { sensorType: "current" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d7", category: "data", subType: "realtime_data", label: "实时采集", x: 100, y: 400, config: { samplingFrequency: 1000 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d8", category: "data", subType: "historical_data", label: "历史退化数据", x: 400, y: 400, config: { dataSource: "clickhouse", timeRange: "全生命周期" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d9", category: "diagnosis", subType: "feature_extraction", label: "健康指标提取", x: 200, y: 530, config: { method: "statistical", outputFeatures: ["RMS", "峰值", "峭度", "偏度"] }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d10", category: "mechanism", subType: "degradation_model", label: "Weibull退化模型", x: 450, y: 530, config: { degradationFunction: "weibull", initialValue: 100 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d11", category: "diagnosis", subType: "inference_engine", label: "RUL预测引擎", x: 350, y: 660, config: { engineType: "gnn", maxHops: 2, confidenceThreshold: 0.8 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d12", category: "fault", subType: "fault_mode", label: "预计故障", x: 350, y: 790, config: { severity: "high" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d13", category: "solution", subType: "prevention", label: "预防性维护计划", x: 200, y: 920, config: { period: 90, checkItems: ["健康度评估", "趋势分析"] }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "d14", category: "solution", subType: "emergency", label: "提前更换", x: 500, y: 920, config: { actionType: "switchover", autoExecute: false }, nodeStatus: "normal", hitCount: 0 },
      ];
      const edges: KGEditorEdge[] = [
        { edgeId: "de1", sourceNodeId: "d1", targetNodeId: "d2", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "de2", sourceNodeId: "d1", targetNodeId: "d3", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "de3", sourceNodeId: "d2", targetNodeId: "d4", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "de4", sourceNodeId: "d2", targetNodeId: "d5", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "de5", sourceNodeId: "d3", targetNodeId: "d6", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "de6", sourceNodeId: "d7", targetNodeId: "d9", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "de7", sourceNodeId: "d8", targetNodeId: "d10", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "de8", sourceNodeId: "d9", targetNodeId: "d11", relationType: "FEEDS", label: "特征→预测", weight: 1, hitCount: 0 },
        { edgeId: "de9", sourceNodeId: "d10", targetNodeId: "d11", relationType: "FEEDS", label: "模型→预测", weight: 1, hitCount: 0 },
        { edgeId: "de10", sourceNodeId: "d11", targetNodeId: "d12", relationType: "CAUSES", label: "预测故障", weight: 1, hitCount: 0 },
        { edgeId: "de11", sourceNodeId: "d12", targetNodeId: "d13", relationType: "RESOLVED_BY", label: "预防", weight: 1, hitCount: 0 },
        { edgeId: "de12", sourceNodeId: "d12", targetNodeId: "d14", relationType: "TRIGGERS", label: "触发更换", weight: 1, hitCount: 0 },
      ];
      return { nodes, edges };
    },
  },
  {
    id: "fault-propagation",
    name: "故障传播分析",
    scenario: "fault_propagation",
    description: "分析故障在设备间的传播路径和影响范围，支持多跳传播追溯和影响评估",
    icon: "🔥",
    tags: ["传播", "影响分析", "级联故障"],
    build: () => {
      const nodes: KGEditorNode[] = [
        { nodeId: "f1", category: "equipment", subType: "device", label: "液压系统", x: 350, y: 60, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f2", category: "equipment", subType: "component", label: "液压泵", x: 150, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f3", category: "equipment", subType: "component", label: "液压阀", x: 350, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f4", category: "equipment", subType: "component", label: "液压缸", x: 550, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f5", category: "fault", subType: "fault_mode", label: "泵内泄漏", x: 100, y: 340, config: { severity: "medium" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f6", category: "fault", subType: "symptom", label: "压力下降", x: 300, y: 340, config: { signalType: "pressure" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f7", category: "fault", subType: "symptom", label: "温度升高", x: 500, y: 340, config: { signalType: "temperature" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f8", category: "fault", subType: "fault_mode", label: "阀卡滞", x: 350, y: 480, config: { severity: "high" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f9", category: "fault", subType: "fault_mode", label: "缸动作迟缓", x: 550, y: 480, config: { severity: "high" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f10", category: "diagnosis", subType: "inference_engine", label: "传播路径推理", x: 350, y: 620, config: { engineType: "gnn", maxHops: 5 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f11", category: "solution", subType: "emergency", label: "系统停机", x: 200, y: 760, config: { actionType: "shutdown", autoExecute: true }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "f12", category: "solution", subType: "repair", label: "更换密封件", x: 500, y: 760, config: { steps: ["停机", "泄压", "拆卸泵体", "更换密封", "回装", "试压"], estimatedTime: 180 }, nodeStatus: "normal", hitCount: 0 },
      ];
      const edges: KGEditorEdge[] = [
        { edgeId: "fe1", sourceNodeId: "f1", targetNodeId: "f2", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fe2", sourceNodeId: "f1", targetNodeId: "f3", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fe3", sourceNodeId: "f1", targetNodeId: "f4", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fe4", sourceNodeId: "f5", targetNodeId: "f6", relationType: "MANIFESTS", label: "表现为", weight: 1, hitCount: 0 },
        { edgeId: "fe5", sourceNodeId: "f5", targetNodeId: "f7", relationType: "MANIFESTS", label: "表现为", weight: 0.8, hitCount: 0 },
        { edgeId: "fe6", sourceNodeId: "f6", targetNodeId: "f8", relationType: "CAUSES", label: "导致", weight: 0.7, hitCount: 0 },
        { edgeId: "fe7", sourceNodeId: "f8", targetNodeId: "f9", relationType: "CAUSES", label: "导致", weight: 0.9, hitCount: 0 },
        { edgeId: "fe8", sourceNodeId: "f5", targetNodeId: "f10", relationType: "DIAGNOSED_BY", label: "诊断", weight: 1, hitCount: 0 },
        { edgeId: "fe9", sourceNodeId: "f8", targetNodeId: "f10", relationType: "DIAGNOSED_BY", label: "诊断", weight: 1, hitCount: 0 },
        { edgeId: "fe10", sourceNodeId: "f9", targetNodeId: "f11", relationType: "TRIGGERS", label: "触发停机", weight: 1, hitCount: 0 },
        { edgeId: "fe11", sourceNodeId: "f5", targetNodeId: "f12", relationType: "RESOLVED_BY", label: "修复", weight: 1, hitCount: 0 },
        { edgeId: "fe12", sourceNodeId: "f2", targetNodeId: "f3", relationType: "AFFECTS", label: "影响", weight: 0.6, hitCount: 0 },
        { edgeId: "fe13", sourceNodeId: "f3", targetNodeId: "f4", relationType: "AFFECTS", label: "影响", weight: 0.8, hitCount: 0 },
      ];
      return { nodes, edges };
    },
  },
  {
    id: "multimodal-diagnosis",
    name: "多模态融合诊断",
    scenario: "multimodal_fusion",
    description: "融合振动、温度、电流、声音等多模态数据的综合诊断图谱，通过 GNN 推理引擎实现端到端故障定位",
    icon: "🧠",
    tags: ["多模态", "融合", "GNN", "端到端"],
    build: () => {
      const nodes: KGEditorNode[] = [
        { nodeId: "m1", category: "equipment", subType: "device", label: "工业电机", x: 350, y: 60, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m2", category: "equipment", subType: "sensor", label: "振动传感器", x: 100, y: 180, config: { sensorType: "vibration" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m3", category: "equipment", subType: "sensor", label: "温度传感器", x: 280, y: 180, config: { sensorType: "temperature" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m4", category: "equipment", subType: "sensor", label: "电流传感器", x: 460, y: 180, config: { sensorType: "current" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m5", category: "equipment", subType: "sensor", label: "声学传感器", x: 640, y: 180, config: { sensorType: "acoustic" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m6", category: "diagnosis", subType: "feature_extraction", label: "振动特征提取", x: 100, y: 340, config: { method: "fft" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m7", category: "diagnosis", subType: "feature_extraction", label: "温度趋势分析", x: 280, y: 340, config: { method: "statistical" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m8", category: "diagnosis", subType: "feature_extraction", label: "电流谐波分析", x: 460, y: 340, config: { method: "fft" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m9", category: "diagnosis", subType: "feature_extraction", label: "声纹特征提取", x: 640, y: 340, config: { method: "wavelet" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m10", category: "diagnosis", subType: "inference_engine", label: "多模态GNN融合", x: 350, y: 500, config: { engineType: "gnn", maxHops: 4, confidenceThreshold: 0.75 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m11", category: "fault", subType: "fault_mode", label: "轴承故障", x: 150, y: 650, config: { severity: "high" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m12", category: "fault", subType: "fault_mode", label: "绕组故障", x: 350, y: 650, config: { severity: "critical" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m13", category: "fault", subType: "fault_mode", label: "转子偏心", x: 550, y: 650, config: { severity: "medium" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m14", category: "solution", subType: "repair", label: "轴承更换", x: 150, y: 800, config: { estimatedTime: 240 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m15", category: "solution", subType: "repair", label: "绕组重绕", x: 350, y: 800, config: { estimatedTime: 960 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "m16", category: "solution", subType: "emergency", label: "紧急停机", x: 550, y: 800, config: { actionType: "shutdown", autoExecute: true }, nodeStatus: "normal", hitCount: 0 },
      ];
      const edges: KGEditorEdge[] = [
        { edgeId: "me1", sourceNodeId: "m1", targetNodeId: "m2", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "me2", sourceNodeId: "m1", targetNodeId: "m3", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "me3", sourceNodeId: "m1", targetNodeId: "m4", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "me4", sourceNodeId: "m1", targetNodeId: "m5", relationType: "HAS_SENSOR", label: "安装", weight: 1, hitCount: 0 },
        { edgeId: "me5", sourceNodeId: "m2", targetNodeId: "m6", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "me6", sourceNodeId: "m3", targetNodeId: "m7", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "me7", sourceNodeId: "m4", targetNodeId: "m8", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "me8", sourceNodeId: "m5", targetNodeId: "m9", relationType: "FEEDS", label: "数据供给", weight: 1, hitCount: 0 },
        { edgeId: "me9", sourceNodeId: "m6", targetNodeId: "m10", relationType: "FEEDS", label: "融合输入", weight: 1, hitCount: 0 },
        { edgeId: "me10", sourceNodeId: "m7", targetNodeId: "m10", relationType: "FEEDS", label: "融合输入", weight: 1, hitCount: 0 },
        { edgeId: "me11", sourceNodeId: "m8", targetNodeId: "m10", relationType: "FEEDS", label: "融合输入", weight: 1, hitCount: 0 },
        { edgeId: "me12", sourceNodeId: "m9", targetNodeId: "m10", relationType: "FEEDS", label: "融合输入", weight: 1, hitCount: 0 },
        { edgeId: "me13", sourceNodeId: "m10", targetNodeId: "m11", relationType: "CAUSES", label: "诊断结果", weight: 0.85, hitCount: 0 },
        { edgeId: "me14", sourceNodeId: "m10", targetNodeId: "m12", relationType: "CAUSES", label: "诊断结果", weight: 0.72, hitCount: 0 },
        { edgeId: "me15", sourceNodeId: "m10", targetNodeId: "m13", relationType: "CAUSES", label: "诊断结果", weight: 0.65, hitCount: 0 },
        { edgeId: "me16", sourceNodeId: "m11", targetNodeId: "m14", relationType: "RESOLVED_BY", label: "修复", weight: 1, hitCount: 0 },
        { edgeId: "me17", sourceNodeId: "m12", targetNodeId: "m15", relationType: "RESOLVED_BY", label: "修复", weight: 1, hitCount: 0 },
        { edgeId: "me18", sourceNodeId: "m12", targetNodeId: "m16", relationType: "TRIGGERS", label: "触发", weight: 1, hitCount: 0 },
      ];
      return { nodes, edges };
    },
  },
  {
    id: "fleet-learning",
    name: "Fleet 学习图谱",
    scenario: "fleet_learning",
    description: "跨设备群的知识共享和迁移学习图谱，从多台同类设备中提取共性故障模式，实现群体智慧诊断",
    icon: "🌐",
    tags: ["Fleet", "迁移学习", "群体智慧"],
    build: () => {
      const nodes: KGEditorNode[] = [
        { nodeId: "fl1", category: "equipment", subType: "berth", label: "泊位群组", x: 350, y: 60, config: { berthId: "B1-B8" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl2", category: "equipment", subType: "device", label: "起重机#1", x: 100, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl3", category: "equipment", subType: "device", label: "起重机#2", x: 300, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl4", category: "equipment", subType: "device", label: "起重机#3", x: 500, y: 180, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl5", category: "data", subType: "historical_data", label: "#1历史数据", x: 100, y: 330, config: { dataSource: "clickhouse" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl6", category: "data", subType: "historical_data", label: "#2历史数据", x: 300, y: 330, config: { dataSource: "clickhouse" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl7", category: "data", subType: "historical_data", label: "#3历史数据", x: 500, y: 330, config: { dataSource: "clickhouse" }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl8", category: "diagnosis", subType: "inference_engine", label: "Fleet GNN 聚合", x: 300, y: 480, config: { engineType: "gnn", maxHops: 3 }, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl9", category: "fault", subType: "anomaly_pattern", label: "共性故障模式A", x: 150, y: 620, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl10", category: "fault", subType: "anomaly_pattern", label: "共性故障模式B", x: 450, y: 620, config: {}, nodeStatus: "normal", hitCount: 0 },
        { nodeId: "fl11", category: "solution", subType: "prevention", label: "群体预防策略", x: 300, y: 760, config: { period: 60, checkItems: ["共性特征监控", "迁移模型更新"] }, nodeStatus: "normal", hitCount: 0 },
      ];
      const edges: KGEditorEdge[] = [
        { edgeId: "fle1", sourceNodeId: "fl1", targetNodeId: "fl2", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fle2", sourceNodeId: "fl1", targetNodeId: "fl3", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fle3", sourceNodeId: "fl1", targetNodeId: "fl4", relationType: "HAS_PART", label: "包含", weight: 1, hitCount: 0 },
        { edgeId: "fle4", sourceNodeId: "fl2", targetNodeId: "fl5", relationType: "FEEDS", label: "数据", weight: 1, hitCount: 0 },
        { edgeId: "fle5", sourceNodeId: "fl3", targetNodeId: "fl6", relationType: "FEEDS", label: "数据", weight: 1, hitCount: 0 },
        { edgeId: "fle6", sourceNodeId: "fl4", targetNodeId: "fl7", relationType: "FEEDS", label: "数据", weight: 1, hitCount: 0 },
        { edgeId: "fle7", sourceNodeId: "fl5", targetNodeId: "fl8", relationType: "FEEDS", label: "聚合", weight: 1, hitCount: 0 },
        { edgeId: "fle8", sourceNodeId: "fl6", targetNodeId: "fl8", relationType: "FEEDS", label: "聚合", weight: 1, hitCount: 0 },
        { edgeId: "fle9", sourceNodeId: "fl7", targetNodeId: "fl8", relationType: "FEEDS", label: "聚合", weight: 1, hitCount: 0 },
        { edgeId: "fle10", sourceNodeId: "fl8", targetNodeId: "fl9", relationType: "CAUSES", label: "发现", weight: 0.9, hitCount: 0 },
        { edgeId: "fle11", sourceNodeId: "fl8", targetNodeId: "fl10", relationType: "CAUSES", label: "发现", weight: 0.75, hitCount: 0 },
        { edgeId: "fle12", sourceNodeId: "fl9", targetNodeId: "fl11", relationType: "RESOLVED_BY", label: "预防", weight: 1, hitCount: 0 },
        { edgeId: "fle13", sourceNodeId: "fl10", targetNodeId: "fl11", relationType: "RESOLVED_BY", label: "预防", weight: 1, hitCount: 0 },
        { edgeId: "fle14", sourceNodeId: "fl9", targetNodeId: "fl10", relationType: "SIMILAR_TO", label: "相似", weight: 0.6, hitCount: 0 },
      ];
      return { nodes, edges };
    },
  },
];

// ─── 主页面组件 ───
export default function KGOrchestrator() {
  const [activeTab, setActiveTab] = useState<TabId>("canvas");
  const store = useKGOrchestratorStore();
  const toast = useToast();

  // 加载模板
  const handleUseTemplate = useCallback((tpl: ScenarioTemplate) => {
    if (store.isDirty && !confirm("当前图谱未保存，确定加载模板？")) return;
    const { nodes, edges } = tpl.build();
    store.newGraph(tpl.name, tpl.scenario);
    store.loadEditorState(nodes, edges);
    store.setGraphInfo({ graphDescription: tpl.description, tags: tpl.tags });
    setActiveTab("canvas");
    toast.success(`已加载模板: ${tpl.name}`);
  }, [store, toast]);

  return (
    <MainLayout title="知识图谱编排">
    <div className="flex flex-col bg-slate-950 text-slate-200" style={{ height: 'calc(100vh - 80px)', minHeight: '600px' }}>
      {/* Tab 栏 */}
      <div className="shrink-0 flex items-center border-b border-slate-800 bg-slate-900/80 px-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="text-[10px] text-slate-600 mr-2">
          {store.nodes.length} 节点 · {store.edges.length} 关系
        </span>
      </div>

      {/* Tab 内容 */}
      {activeTab === "canvas" && <CanvasTab />}
      {activeTab === "templates" && <TemplatesTab onUseTemplate={handleUseTemplate} />}
      {activeTab === "diagnosis" && <DiagnosisTab />}
      {activeTab === "evolution" && <EvolutionTab />}
      {activeTab === "list" && <GraphListTab />}
    </div>
    </MainLayout>
  );
}

// ─── 图谱画布 Tab ───
function CanvasTab() {
  return (
    <div className="flex-1 flex overflow-hidden">
      <KGComponentPanel />
      <div className="flex-1 flex flex-col">
        <KGToolbar />
        <KGCanvas />
      </div>
      <KGConfigPanel />
    </div>
  );
}

// ─── 场景模板 Tab ───
function TemplatesTab({ onUseTemplate }: { onUseTemplate: (tpl: ScenarioTemplate) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return SCENARIO_TEMPLATES;
    const q = search.toLowerCase();
    return SCENARIO_TEMPLATES.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }, [search]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-100 mb-1">场景模板</h2>
          <p className="text-xs text-slate-500">选择预置的诊断图谱模板，快速构建知识图谱</p>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索模板..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 mb-6 focus:outline-none focus:border-blue-600"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(tpl => {
            const { nodes, edges } = tpl.build();
            const categories = new Set(nodes.map(n => n.category));
            return (
              <div key={tpl.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-2xl">{tpl.icon}</span>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-slate-100">{tpl.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{tpl.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {tpl.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">{tag}</span>
                  ))}
                </div>

                <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-4">
                  <span>{nodes.length} 节点</span>
                  <span>{edges.length} 关系</span>
                  <span>{categories.size} 层级</span>
                </div>

                {/* 节点类别预览 */}
                <div className="flex gap-1 mb-4 flex-wrap">
                  {Array.from(categories).map(cat => {
                    const colors: Record<string, string> = {
                      equipment: "bg-blue-900/40 text-blue-400 border-blue-800/50",
                      fault: "bg-red-900/40 text-red-400 border-red-800/50",
                      diagnosis: "bg-purple-900/40 text-purple-400 border-purple-800/50",
                      solution: "bg-green-900/40 text-green-400 border-green-800/50",
                      data: "bg-slate-700/40 text-slate-400 border-slate-600/50",
                      mechanism: "bg-stone-700/40 text-stone-400 border-stone-600/50",
                    };
                    const labels: Record<string, string> = {
                      equipment: "设备层", fault: "故障层", diagnosis: "诊断层",
                      solution: "方案层", data: "数据层", mechanism: "机理层",
                    };
                    return (
                      <span key={cat} className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[cat] || ""}`}>
                        {labels[cat] || cat}
                      </span>
                    );
                  })}
                </div>

                <button
                  onClick={() => onUseTemplate(tpl)}
                  className="w-full py-2 bg-blue-600/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-700/50 hover:bg-blue-600/30 transition-colors"
                >
                  使用此模板
                </button>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            没有匹配的模板
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 诊断运行 Tab ───
function DiagnosisTab() {
  const { nodes, edges } = useKGOrchestratorStore();
  const diagnosisNodes = nodes.filter(n => n.category === "diagnosis");
  const faultNodes = nodes.filter(n => n.category === "fault");
  const solutionNodes = nodes.filter(n => n.category === "solution");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-bold text-slate-100 mb-1">诊断运行</h2>
        <p className="text-xs text-slate-500 mb-6">基于当前图谱执行诊断推理</p>

        {nodes.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-3xl mb-3">🕸️</p>
            <p className="text-sm">请先在图谱画布中构建诊断图谱，或从模板库加载</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 图谱概览 */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="总节点" value={nodes.length} icon="🔵" />
              <StatCard label="总关系" value={edges.length} icon="🔗" />
              <StatCard label="诊断节点" value={diagnosisNodes.length} icon="🧠" />
              <StatCard label="故障模式" value={faultNodes.length} icon="⚠️" />
            </div>

            {/* 诊断链路 */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-200 mb-3">诊断链路分析</h3>
              <div className="space-y-2">
                {diagnosisNodes.map(dn => {
                  const inEdges = edges.filter(e => e.targetNodeId === dn.nodeId);
                  const outEdges = edges.filter(e => e.sourceNodeId === dn.nodeId);
                  return (
                    <div key={dn.nodeId} className="flex items-center gap-2 text-xs bg-slate-900/50 rounded-lg p-3">
                      <span className="text-purple-400">🧠</span>
                      <span className="font-medium text-slate-200">{dn.label}</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-slate-400">{inEdges.length} 输入</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-slate-400">{outEdges.length} 输出</span>
                      <span className="text-slate-600">|</span>
                      <span className="text-[10px] text-slate-500">{dn.subType}</span>
                    </div>
                  );
                })}
                {diagnosisNodes.length === 0 && (
                  <p className="text-xs text-slate-500">图谱中没有诊断节点</p>
                )}
              </div>
            </div>

            {/* 故障→方案映射 */}
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-bold text-slate-200 mb-3">故障 → 解决方案映射</h3>
              <div className="space-y-2">
                {faultNodes.map(fn => {
                  const solutions = edges
                    .filter(e => e.sourceNodeId === fn.nodeId && (e.relationType === "RESOLVED_BY" || e.relationType === "TRIGGERS"))
                    .map(e => nodes.find(n => n.nodeId === e.targetNodeId))
                    .filter(Boolean);
                  return (
                    <div key={fn.nodeId} className="flex items-start gap-2 text-xs bg-slate-900/50 rounded-lg p-3">
                      <span className="text-red-400 mt-0.5">⚠️</span>
                      <div className="flex-1">
                        <span className="font-medium text-slate-200">{fn.label}</span>
                        {solutions.length > 0 ? (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {solutions.map(s => (
                              <span key={s!.nodeId} className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-800/50">
                                {s!.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 ml-2">无解决方案</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {faultNodes.length === 0 && (
                  <p className="text-xs text-slate-500">图谱中没有故障节点</p>
                )}
              </div>
            </div>

            {/* 运行按钮 */}
            <button className="w-full py-3 bg-blue-600/20 text-blue-400 text-sm font-medium rounded-xl border border-blue-700/50 hover:bg-blue-600/30 transition-colors">
              ▶️ 运行诊断推理（{diagnosisNodes.length} 诊断节点 → {solutionNodes.length} 方案）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-center">
      <span className="text-lg">{icon}</span>
      <div className="text-xl font-bold text-slate-100 mt-1">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

// ─── 自进化面板 Tab ───
function EvolutionTab() {
  const { nodes, edges, graphName, version } = useKGOrchestratorStore();

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-lg font-bold text-slate-100 mb-1">自进化面板</h2>
        <p className="text-xs text-slate-500 mb-6">图谱自升级、自补充数据维度、迭代优化</p>

        {/* 进化状态 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📊</span>
              <span className="text-sm font-bold text-slate-200">准确率驱动升级</span>
            </div>
            <div className="text-2xl font-bold text-green-400 mb-1">—</div>
            <p className="text-[10px] text-slate-500">当诊断准确率低于阈值时，自动触发图谱结构优化</p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">目标准确率</span>
                <span className="text-slate-300">≥ 85%</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">当前版本</span>
                <span className="text-slate-300">v{version}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">升级次数</span>
                <span className="text-slate-300">0</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔍</span>
              <span className="text-sm font-bold text-slate-200">新模式发现</span>
            </div>
            <div className="text-2xl font-bold text-amber-400 mb-1">—</div>
            <p className="text-[10px] text-slate-500">从诊断历史中发现未覆盖的故障模式，自动补充到图谱</p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">已发现模式</span>
                <span className="text-slate-300">0</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">待确认</span>
                <span className="text-slate-300">0</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">自动采纳率</span>
                <span className="text-slate-300">—</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🌐</span>
              <span className="text-sm font-bold text-slate-200">Fleet 学习</span>
            </div>
            <div className="text-2xl font-bold text-blue-400 mb-1">—</div>
            <p className="text-[10px] text-slate-500">跨设备群的知识共享和迁移学习，扩展数据维度</p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">参与设备</span>
                <span className="text-slate-300">0</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">共享模式</span>
                <span className="text-slate-300">0</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">迁移成功率</span>
                <span className="text-slate-300">—</span>
              </div>
            </div>
          </div>
        </div>

        {/* 进化历史 */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-slate-200 mb-3">进化历史</h3>
          <div className="text-center py-8 text-slate-500 text-xs">
            <p className="text-2xl mb-2">🔄</p>
            <p>图谱 "{graphName}" 尚未开始进化</p>
            <p className="mt-1">当图谱激活并接入实时数据后，自进化引擎将自动启动</p>
          </div>
        </div>

        {/* 图谱健康度 */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">图谱健康度评估</h3>
          <div className="space-y-3">
            <HealthItem label="节点覆盖度" desc="6大类别是否都有节点" value={getNodeCoverage(nodes)} />
            <HealthItem label="关系完整度" desc="关键因果链是否完整" value={getEdgeCoverage(nodes, edges)} />
            <HealthItem label="方案覆盖度" desc="每个故障是否有对应方案" value={getSolutionCoverage(nodes, edges)} />
            <HealthItem label="数据接入度" desc="数据层节点是否配置完整" value={getDataCoverage(nodes)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthItem({ label, desc, value }: { label: string; desc: string; value: number }) {
  const color = value >= 80 ? "text-green-400" : value >= 50 ? "text-amber-400" : "text-red-400";
  const bg = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div>
          <span className="text-xs font-medium text-slate-200">{label}</span>
          <span className="text-[10px] text-slate-500 ml-2">{desc}</span>
        </div>
        <span className={`text-xs font-bold ${color}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function getNodeCoverage(nodes: KGEditorNode[]): number {
  const allCats = ["equipment", "fault", "diagnosis", "solution", "data", "mechanism"];
  const present = new Set(nodes.map(n => n.category));
  return nodes.length === 0 ? 0 : Math.round((allCats.filter(c => present.has(c as any)).length / allCats.length) * 100);
}

function getEdgeCoverage(nodes: KGEditorNode[], edges: KGEditorEdge[]): number {
  if (nodes.length === 0) return 0;
  const maxEdges = nodes.length * (nodes.length - 1) / 2;
  return Math.min(100, Math.round((edges.length / Math.max(1, maxEdges * 0.15)) * 100));
}

function getSolutionCoverage(nodes: KGEditorNode[], edges: KGEditorEdge[]): number {
  const faults = nodes.filter(n => n.category === "fault");
  if (faults.length === 0) return 0;
  const resolved = faults.filter(f =>
    edges.some(e => e.sourceNodeId === f.nodeId && (e.relationType === "RESOLVED_BY" || e.relationType === "TRIGGERS"))
  );
  return Math.round((resolved.length / faults.length) * 100);
}

function getDataCoverage(nodes: KGEditorNode[]): number {
  const dataNodes = nodes.filter(n => n.category === "data");
  if (dataNodes.length === 0) return 0;
  const configured = dataNodes.filter(n => Object.keys(n.config || {}).length > 0);
  return Math.round((configured.length / dataNodes.length) * 100);
}

// ─── 图谱列表 Tab ───
function GraphListTab() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-100">图谱列表</h2>
            <p className="text-xs text-slate-500">管理已保存的知识图谱</p>
          </div>
          <button className="px-3 py-1.5 bg-blue-600/20 text-blue-400 text-xs rounded-lg border border-blue-700/50 hover:bg-blue-600/30">
            + 新建图谱
          </button>
        </div>

        <div className="text-center py-16 text-slate-500">
          <p className="text-3xl mb-3">📁</p>
          <p className="text-sm">暂无已保存的图谱</p>
          <p className="text-xs mt-1">在图谱画布中构建并保存，或从场景模板创建</p>
        </div>
      </div>
    </div>
  );
}
