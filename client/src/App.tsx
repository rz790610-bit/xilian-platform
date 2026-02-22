import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./components/common/Toast";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

// Pages
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import AIChat from "./pages/AIChat";
import DataManage from "./pages/DataManage";
import ModelInference from "./pages/ModelInference";
import DataLabel from "./pages/DataLabel";
import DataInsight from "./pages/DataInsight";
import DataStandard from "./pages/DataStandard";
import ModelRepo from "./pages/ModelRepo";
import ModelCenter from "./pages/ModelCenter";
import {
  ModelFinetune,
  ModelEval,
  DiagAnalysis,
  DiagReport,
} from "./pages/PlaceholderPage";

// 融合诊断页面
import FusionDiagnosis from "./pages/diagnosis/FusionDiagnosis";
// 高级知识蒸馏页面
import AdvancedDistillation from "./pages/algorithm/AdvancedDistillation";
import ConditionNormalizerPage from "./pages/algorithm/ConditionNormalizer";
// 进化引擎模块页面
import FeedbackCenter from "./pages/evolution/FeedbackCenter";
import ActiveLearning from "./pages/evolution/ActiveLearning";
import AutoTrain from "./pages/evolution/AutoTrain";
import EvolutionBoard from "./pages/evolution/EvolutionBoard";
import KnowledgeManager from "./pages/KnowledgeManager";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import VectorAdmin from "./pages/VectorAdmin";

// 算法库
import { AlgorithmOverview, AlgorithmDetail, AlgorithmCategory } from "./pages/algorithm";

// v1.5 数据库模块页面
import {
  DatabaseOverview,
  ConfigManager,
  SliceManager,
  CleanManager,
  EventManager,
  StorageStatus,
  DatabaseWorkbench
} from "./pages/database";

// 平台管理 - 设计工具
import {
  PipelineEditor,
  DataStream,
  KGOrchestrator,
} from "./pages/settings/design";
// V4.0 新增页面 - Monitoring
import ClickHouseDashboard from "./pages/monitoring/ClickHouseDashboard";

// 平台管理 - 配置中心（精简：移除 ResourcesOverview、DbManagement）
import {
  Infrastructure,
  KafkaMonitor,
  AccessLayerManager,
} from "./pages/settings/config";

// 平台管理 - 状态监控（精简：移除 PluginsManager、EnginesManager、ModelsManager、ServicesOverview）
import {
  SystemTopology,
  PerformanceOverview,
  OutboxManager,
  SagaManager,
  AdaptiveSampling,
  DeduplicationManager,
  ReadReplicaManager,
  MicroserviceDashboard,
  PlatformDiagnostic,
} from "./pages/settings/status";

// 平台管理 - 安全运维（精简：移除 SmartMonitoring、SecurityScanner、VaultManager、PkiManager）
import {
  FalcoSecurityCenter
} from "./pages/settings/security";
// 平台管理 - API 网关
import GatewayManagement from "./pages/GatewayManagement";
// 平台管理 - 插件安全沙箱
import PluginSandboxManager from "./pages/settings/PluginSandboxManager";

// v5.0 进化平台仪表盘
import CognitiveDashboard from "./pages/cognitive/CognitiveDashboard";
import PerceptionMonitor from "./pages/perception/PerceptionMonitor";
import PerceptionDashboard from "./pages/perception/PerceptionDashboard";
import BPAConfigManager from "./pages/perception/BPAConfigManager";
import DimensionManager from "./pages/perception/DimensionManager";
import GuardrailConsole from "./pages/guardrail/GuardrailConsole";
import DigitalTwinView from "./pages/cognitive/DigitalTwinView";
import DigitalTwinLayout from "./pages/digital-twin/DigitalTwinLayout";
import KnowledgeExplorer from "./pages/cognitive/KnowledgeExplorer";
import CognitionEnginePage from "./pages/cognitive/CognitionEnginePage";

// 基础设置模块
import {
  DictionaryManager,
  OrganizationManager,
  DeviceManager as BasicDeviceManager,
  MechanismManager,
  ComponentManager,
  PartsLibrary,
} from "./pages/settings/basic";

function Router() {
  return (
    <Switch>
      {/* Redirect root to dashboard */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      {/* ━━━ 核心业务 ━━━ */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/agents" component={Agents} />
      <Route path="/chat" component={AIChat} />
      <Route path="/docs">
        <Redirect to="/knowledge/manager" />
      </Route>
      
      {/* ━━━ 资产与数据 ━━━ */}
      {/* P2-E2: @deprecated 旧路由重定向 — 迁移完成后应移除这些条目，并在前端添加 404 页面引导 */}
      {/* 设备管理 → 统一到基础设置 */}
      <Route path="/device/list"><Redirect to="/basic/device" /></Route>
      <Route path="/device/maintenance"><Redirect to="/basic/device" /></Route>
      <Route path="/device/alerts"><Redirect to="/basic/device" /></Route>
      <Route path="/device/kpi"><Redirect to="/basic/device" /></Route>
      
      {/* 知识库 */}
      <Route path="/knowledge/manager" component={KnowledgeManager} />
      <Route path="/knowledge/graph" component={KnowledgeGraph} />
      <Route path="/knowledge/vectors" component={VectorAdmin} />
      
      {/* 数据中心 */}
      <Route path="/data/manage" component={DataManage} />
      <Route path="/data/label" component={DataLabel} />
      <Route path="/data/insight" component={DataInsight} />
      <Route path="/data/standard" component={DataStandard} />
      
      {/* 数据库模块 v1.5 */}
      <Route path="/database">
        <Redirect to="/database/overview" />
      </Route>
      <Route path="/database/overview" component={DatabaseOverview} />
      <Route path="/database/assets"><Redirect to="/basic/device" /></Route>
      <Route path="/database/config" component={ConfigManager} />
      <Route path="/database/slices" component={SliceManager} />
      <Route path="/database/clean" component={CleanManager} />
      <Route path="/database/events" component={EventManager} />
      <Route path="/database/storage" component={StorageStatus} />

      {/* ━━━ 智能引擎 ━━━ */}
      {/* 模型中心 */}
      <Route path="/model/center" component={ModelCenter} />
      <Route path="/model/inference" component={ModelInference} />
      <Route path="/model/finetune" component={ModelFinetune} />
      <Route path="/model/eval" component={ModelEval} />
      <Route path="/model/repo" component={ModelRepo} />
      
      {/* 算法库 */}
      <Route path="/algorithm/overview" component={AlgorithmOverview} />
      <Route path="/algorithm/detail/:id" component={AlgorithmDetail} />
      <Route path="/algorithm/mechanical" component={AlgorithmCategory} />
      <Route path="/algorithm/electrical" component={AlgorithmCategory} />
      <Route path="/algorithm/structural" component={AlgorithmCategory} />
      <Route path="/algorithm/anomaly" component={AlgorithmCategory} />
      <Route path="/algorithm/optimization" component={AlgorithmCategory} />
      <Route path="/algorithm/comprehensive" component={AlgorithmCategory} />
      <Route path="/algorithm/feature" component={AlgorithmCategory} />
      <Route path="/algorithm/agent" component={AlgorithmCategory} />
      <Route path="/algorithm/model" component={AlgorithmCategory} />
      <Route path="/algorithm/rule" component={AlgorithmCategory} />
      <Route path="/algorithm/compose" component={AlgorithmCategory} />
      <Route path="/algorithm/distillation" component={AdvancedDistillation} />
      <Route path="/algorithm/condition-normalizer" component={ConditionNormalizerPage} />
      <Route path="/algorithm/execution" component={AlgorithmCategory} />
      
      {/* 智能诊断 */}
      <Route path="/diagnosis/fusion" component={FusionDiagnosis} />
      <Route path="/diagnosis/analysis" component={DiagAnalysis} />
      <Route path="/diagnosis/report" component={DiagReport} />
      <Route path="/diagnosis/knowledge">
        <Redirect to="/knowledge/manager" />
      </Route>
      
      {/* 进化引擎 */}
      <Route path="/evolution/feedback" component={FeedbackCenter} />
      <Route path="/evolution/learning" component={ActiveLearning} />
      <Route path="/evolution/train" component={AutoTrain} />
      <Route path="/evolution/board" component={EvolutionBoard} />
      

      {/* ━━━ 基础设置 ━━━ */}
      <Route path="/basic/dictionary" component={DictionaryManager} />
      <Route path="/basic/organization" component={OrganizationManager} />
      <Route path="/basic/device" component={BasicDeviceManager} />
      <Route path="/basic/mechanism" component={MechanismManager} />
      <Route path="/basic/component" component={ComponentManager} />
      <Route path="/basic/parts" component={PartsLibrary} />

      {/* ━━━ 平台管理 ━━━ */}
      {/* 设计工具 */}
      <Route path="/settings/design/pipeline" component={PipelineEditor} />
      <Route path="/settings/design/datastream" component={DataStream} />
      <Route path="/settings/design/workbench" component={DatabaseWorkbench} />
      <Route path="/settings/design/kg-orchestrator" component={KGOrchestrator} />

      {/* 配置中心 */}
      <Route path="/settings/config/infrastructure" component={Infrastructure} />
      <Route path="/settings/config/kafka" component={KafkaMonitor} />
      <Route path="/settings/config/access-layer" component={AccessLayerManager} />

      {/* 状态监控 */}
      <Route path="/settings/status/topology" component={SystemTopology} />
      <Route path="/settings/status/performance" component={PerformanceOverview} />
      <Route path="/settings/status/performance/outbox" component={OutboxManager} />
      <Route path="/settings/status/performance/saga" component={SagaManager} />
      <Route path="/settings/status/performance/sampling" component={AdaptiveSampling} />
      <Route path="/settings/status/performance/dedup" component={DeduplicationManager} />
      <Route path="/settings/status/performance/replica" component={ReadReplicaManager} />
      <Route path="/settings/status/diagnostic" component={PlatformDiagnostic} />

      {/* 安全运维 */}
      <Route path="/settings/security/falco" component={FalcoSecurityCenter} />
      {/* API 网关 — 仅保留网关概览，已移入状态监控子菜单 */}
      <Route path="/settings/gateway/dashboard" component={GatewayManagement} />
      {/* 旧网关子路由重定向到网关概览 */}
      <Route path="/settings/gateway/routes"><Redirect to="/settings/gateway/dashboard" /></Route>
      <Route path="/settings/gateway/services"><Redirect to="/settings/gateway/dashboard" /></Route>
      <Route path="/settings/gateway/plugins"><Redirect to="/settings/gateway/dashboard" /></Route>
      <Route path="/settings/gateway/upstreams"><Redirect to="/settings/gateway/dashboard" /></Route>
      <Route path="/settings/gateway/consumers"><Redirect to="/settings/gateway/dashboard" /></Route>

      {/* 监控大屏 */}
      <Route path="/monitoring/clickhouse" component={ClickHouseDashboard} />

      {/* Settings redirect */}
      <Route path="/settings">
        <Redirect to="/settings/security/falco" />
      </Route>

      {/* ━━━ Legacy 向后兼容重定向 ━━━
          以下路由保留为了兼容旧版本书签/链接，
          待版本稳定后可考虑清理。
          分组：安全(9) | 拓扑(6) | 性能(4+5) | 配置(3) | 其他(2)
      */}
      <Route path="/pipeline">
        <Redirect to="/settings/design/pipeline" />
      </Route>
      {/* 已删除页面的旧路由 → 重定向到最近的保留页面 */}
      <Route path="/settings/design/db-workbench">
        <Redirect to="/settings/design/workbench" />
      </Route>
      <Route path="/database/workbench">
        <Redirect to="/settings/design/workbench" />
      </Route>
      <Route path="/settings/config/resources">
        <Redirect to="/settings/config/infrastructure" />
      </Route>
      <Route path="/settings/config/db-management">
        <Redirect to="/settings/config/infrastructure" />
      </Route>
      <Route path="/settings/status/plugins" component={PluginSandboxManager} />
      <Route path="/settings/plugin-sandbox" component={PluginSandboxManager} />
      <Route path="/settings/plugin-sandbox/:tab" component={PluginSandboxManager} />
      <Route path="/settings/status/engines">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/status/models">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/status/microservices" component={MicroserviceDashboard} />
      <Route path="/settings/security/monitoring">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/settings/security/scanner">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/settings/security/vault">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/settings/security/pki">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/falco">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/scanner">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/vault">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/pki">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/services/ingestion">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/services/aggregator">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/services/dispatcher">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/services/performance">
        <Redirect to="/settings/status/performance" />
      </Route>
      <Route path="/performance/overview">
        <Redirect to="/settings/status/performance" />
      </Route>
      <Route path="/performance/outbox">
        <Redirect to="/settings/status/performance/outbox" />
      </Route>
      <Route path="/performance/saga">
        <Redirect to="/settings/status/performance/saga" />
      </Route>
      <Route path="/performance/sampling">
        <Redirect to="/settings/status/performance/sampling" />
      </Route>
      <Route path="/performance/dedup">
        <Redirect to="/settings/status/performance/dedup" />
      </Route>
      <Route path="/performance/replica">
        <Redirect to="/settings/status/performance/replica" />
      </Route>
      <Route path="/performance/graph">
        <Redirect to="/settings/status/performance" />
      </Route>
      <Route path="/settings/design/graph-query">
        <Redirect to="/settings/status/performance" />
      </Route>
      <Route path="/settings/status/mysql">
        <Redirect to="/settings/config/infrastructure" />
      </Route>
      
      {/* ━━━ 数字孪生（独立模块） ━━━ */}
      <Route path="/digital-twin" component={DigitalTwinLayout} />
      <Route path="/digital-twin/simulation" component={DigitalTwinLayout} />
      <Route path="/digital-twin/replay" component={DigitalTwinLayout} />
      <Route path="/digital-twin/worldmodel" component={DigitalTwinLayout} />
      {/* 旧路由重定向 */}
      <Route path="/v5/digital-twin"><Redirect to="/digital-twin" /></Route>

      {/* ━━━ v5.0 进化平台仪表盘 ━━━ */}
      <Route path="/v5/cognitive" component={CognitiveDashboard} />
      <Route path="/v5/perception" component={PerceptionMonitor} />
      <Route path="/v5/perception/dashboard" component={PerceptionDashboard} />
      <Route path="/v5/perception/bpa-config" component={BPAConfigManager} />
      <Route path="/v5/perception/dimensions" component={DimensionManager} />
      <Route path="/v5/guardrail" component={GuardrailConsole} />
      <Route path="/v5/knowledge" component={KnowledgeExplorer} />

      {/* ━━━ 认知引擎子页面 ━━━ */}
      <Route path="/v5/engine" component={CognitionEnginePage} />

      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <ToastProvider>
          <TooltipProvider>
            <Router />
            <SonnerToaster position="top-right" richColors />
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
