import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./components/common/Toast";

// Pages
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import AIChat from "./pages/AIChat";
import DataManage from "./pages/DataManage";
import ModelInference from "./pages/ModelInference";
import DataLabel from "./pages/DataLabel";
import DataInsight from "./pages/DataInsight";
import DataAccess from "./pages/DataAccess";
import DataStandard from "./pages/DataStandard";
import ModelRepo from "./pages/ModelRepo";
import ModelCenter from "./pages/ModelCenter";
import {
  ModelFinetune,
  ModelEval,
  DiagAnalysis,
  DiagReport,
  FeedbackCenter,
  ActiveLearning,
  AutoTrain,
  EvolutionBoard
} from "./pages/PlaceholderPage";
import KnowledgeManager from "./pages/KnowledgeManager";
import KnowledgeGraph from "./pages/KnowledgeGraph";
import VectorAdmin from "./pages/VectorAdmin";

// 新增模块页面
import DeviceList from "./pages/device/DeviceList";
import EdgeNodes from "./pages/edge/EdgeNodes";

// v1.5 数据库模块页面
import {
  DatabaseOverview,
  AssetManager,
  ConfigManager,
  SliceManager,
  CleanManager,
  EventManager,
  StorageStatus,
  DatabaseWorkbench
} from "./pages/database";

// 平台管理 - 设计工具
import {
  PipelineManager,
  PipelineEditor,
  DataStream,
  GraphQueryManager,
  SchemaDesigner,
  ERDiagramPage,
  VisualDesignerPage
} from "./pages/settings/design";

// 平台管理 - 配置中心（精简：移除 ResourcesOverview、DbManagement）
import {
  Infrastructure,
  KafkaMonitor
} from "./pages/settings/config";

// 平台管理 - 状态监控（精简：移除 PluginsManager、EnginesManager、ModelsManager、ServicesOverview）
import {
  SystemTopology,
  Observability,
  PerformanceOverview,
  OutboxManager,
  SagaManager,
  AdaptiveSampling,
  DeduplicationManager,
  ReadReplicaManager
} from "./pages/settings/status";

// 平台管理 - 安全运维（精简：移除 SmartMonitoring、SecurityScanner、VaultManager、PkiManager）
import {
  OpsDashboard,
  FalcoSecurityCenter
} from "./pages/settings/security";

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
      {/* 设备管理 */}
      <Route path="/device/list" component={DeviceList} />
      <Route path="/device/maintenance" component={DeviceList} />
      <Route path="/device/alerts" component={DeviceList} />
      <Route path="/device/kpi" component={DeviceList} />
      
      {/* 知识库 */}
      <Route path="/knowledge/manager" component={KnowledgeManager} />
      <Route path="/knowledge/graph" component={KnowledgeGraph} />
      <Route path="/knowledge/vectors" component={VectorAdmin} />
      
      {/* 数据中心 */}
      <Route path="/data/manage" component={DataManage} />
      <Route path="/data/label" component={DataLabel} />
      <Route path="/data/insight" component={DataInsight} />
      <Route path="/data/access" component={DataAccess} />
      <Route path="/data/standard" component={DataStandard} />
      
      {/* 数据库模块 v1.5 */}
      <Route path="/database">
        <Redirect to="/database/overview" />
      </Route>
      <Route path="/database/overview" component={DatabaseOverview} />
      <Route path="/database/assets" component={AssetManager} />
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
      
      {/* 智能诊断 */}
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
      
      {/* 边缘计算 - 4路由，组件内根据路径切换Tab */}
      <Route path="/edge/nodes" component={EdgeNodes} />
      <Route path="/edge/inference" component={EdgeNodes} />
      <Route path="/edge/gateway" component={EdgeNodes} />
      <Route path="/edge/tsn" component={EdgeNodes} />

      {/* ━━━ 平台管理 ━━━ */}
      {/* 设计工具 */}
      <Route path="/settings/design/pipeline" component={PipelineManager} />
      <Route path="/settings/design/pipeline/editor" component={PipelineEditor} />
      <Route path="/settings/design/datastream" component={DataStream} />
      <Route path="/settings/design/graph-query" component={GraphQueryManager} />
      <Route path="/settings/design/workbench" component={DatabaseWorkbench} />
      <Route path="/settings/design/database" component={SchemaDesigner} />
      <Route path="/settings/design/er-diagram" component={ERDiagramPage} />
      <Route path="/settings/design/visual-designer" component={VisualDesignerPage} />

      {/* 配置中心 */}
      <Route path="/settings/config/infrastructure" component={Infrastructure} />
      <Route path="/settings/config/kafka" component={KafkaMonitor} />

      {/* 状态监控 */}
      <Route path="/settings/status/topology" component={SystemTopology} />
      <Route path="/settings/status/observability" component={Observability} />
      <Route path="/settings/status/performance" component={PerformanceOverview} />
      <Route path="/settings/status/performance/outbox" component={OutboxManager} />
      <Route path="/settings/status/performance/saga" component={SagaManager} />
      <Route path="/settings/status/performance/sampling" component={AdaptiveSampling} />
      <Route path="/settings/status/performance/dedup" component={DeduplicationManager} />
      <Route path="/settings/status/performance/replica" component={ReadReplicaManager} />

      {/* 安全运维 */}
      <Route path="/settings/security/ops" component={OpsDashboard} />
      <Route path="/settings/security/falco" component={FalcoSecurityCenter} />

      {/* Settings redirect */}
      <Route path="/settings">
        <Redirect to="/settings/security/ops" />
      </Route>

      {/* Legacy route redirects for backward compatibility */}
      <Route path="/pipeline">
        <Redirect to="/settings/design/pipeline" />
      </Route>
      <Route path="/pipeline/editor">
        <Redirect to="/settings/design/pipeline/editor" />
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
      <Route path="/settings/status/plugins">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/status/engines">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/status/models">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/status/microservices">
        <Redirect to="/settings/status/topology" />
      </Route>
      <Route path="/settings/security/monitoring">
        <Redirect to="/settings/security/ops" />
      </Route>
      <Route path="/settings/security/scanner">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/settings/security/vault">
        <Redirect to="/settings/security/ops" />
      </Route>
      <Route path="/settings/security/pki">
        <Redirect to="/settings/security/ops" />
      </Route>
      <Route path="/security/falco">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/scanner">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/vault">
        <Redirect to="/settings/security/ops" />
      </Route>
      <Route path="/security/pki">
        <Redirect to="/settings/security/ops" />
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
        <Redirect to="/settings/design/graph-query" />
      </Route>
      
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
          </TooltipProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
