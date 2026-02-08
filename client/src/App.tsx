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
import Documents from "./pages/Documents";
import DataManage from "./pages/DataManage";
import ModelInference from "./pages/ModelInference";
import DataLabel from "./pages/DataLabel";
import DataInsight from "./pages/DataInsight";
import DataAccess from "./pages/DataAccess";
import DataStandard from "./pages/DataStandard";
import ModelRepo from "./pages/ModelRepo";
import ModelCenter from "./pages/ModelCenter";
import BaseRules from "./pages/BaseRules";
import BaseLibrary from "./pages/BaseLibrary";
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
import KnowledgeBase from "./pages/KnowledgeBase";
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

// 系统设置 - 设计工具
import {
  PipelineManager,
  PipelineEditor,
  DataStream,
  GraphQueryManager
} from "./pages/settings/design";

// 系统设置 - 配置中心
import {
  Infrastructure,
  KafkaMonitor,
  ResourcesOverview,
  DbManagement
} from "./pages/settings/config";

// 系统设置 - 状态监控
import {
  PluginsManager,
  SystemTopology,
  EnginesManager,
  ModelsManager,
  Observability,
  PerformanceOverview,
  OutboxManager,
  SagaManager,
  AdaptiveSampling,
  DeduplicationManager,
  ReadReplicaManager,
  ServicesOverview
} from "./pages/settings/status";

// 系统设置 - 安全运维
import {
  OpsDashboard,
  SmartMonitoring,
  FalcoMonitor,
  SecurityScanner,
  VaultManager,
  PkiManager
} from "./pages/settings/security";

function Router() {
  return (
    <Switch>
      {/* Redirect root to dashboard */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      {/* Main pages */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/agents" component={Agents} />
      <Route path="/chat" component={AIChat} />
      <Route path="/docs" component={Documents} />
      
      {/* Device Management - 设备管理 */}
      <Route path="/device/list" component={DeviceList} />
      <Route path="/device/maintenance" component={DeviceList} />
      <Route path="/device/alerts" component={DeviceList} />
      <Route path="/device/kpi" component={DeviceList} />
      
      {/* Knowledge - 知识库 */}
      <Route path="/knowledge/manager" component={KnowledgeManager} />
      <Route path="/knowledge/graph" component={KnowledgeGraph} />
      <Route path="/knowledge/vectors" component={VectorAdmin} />
      
      {/* Base data - 基础数据 */}
      <Route path="/base/rules" component={BaseRules} />
      <Route path="/base/library" component={BaseLibrary} />
      
      {/* Data center - 数据中心 */}
      <Route path="/data/manage" component={DataManage} />
      <Route path="/data/label" component={DataLabel} />
      <Route path="/data/insight" component={DataInsight} />
      <Route path="/data/access" component={DataAccess} />
      <Route path="/data/standard" component={DataStandard} />
      
      {/* Model center - 模型中心 */}
      <Route path="/model/center" component={ModelCenter} />
      <Route path="/model/inference" component={ModelInference} />
      <Route path="/model/finetune" component={ModelFinetune} />
      <Route path="/model/eval" component={ModelEval} />
      <Route path="/model/repo" component={ModelRepo} />
      
      {/* Diagnosis - 智能诊断 */}
      <Route path="/diagnosis/analysis" component={DiagAnalysis} />
      <Route path="/diagnosis/report" component={DiagReport} />
      <Route path="/diagnosis/knowledge" component={KnowledgeBase} />
      
      {/* Evolution - 进化引擎 */}
      <Route path="/evolution/feedback" component={FeedbackCenter} />
      <Route path="/evolution/learning" component={ActiveLearning} />
      <Route path="/evolution/train" component={AutoTrain} />
      <Route path="/evolution/board" component={EvolutionBoard} />
      
      {/* Edge Computing - 边缘计算 */}
      <Route path="/edge/nodes" component={EdgeNodes} />
      <Route path="/edge/inference" component={EdgeNodes} />
      <Route path="/edge/gateway" component={EdgeNodes} />
      <Route path="/edge/tsn" component={EdgeNodes} />

      {/* Database - 数据库模块 v1.5 */}
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
      <Route path="/database/workbench" component={DatabaseWorkbench} />

      {/* ============================================ */}
      {/* 系统设置 - 设计工具 */}
      {/* ============================================ */}
      <Route path="/settings/design/pipeline" component={PipelineManager} />
      <Route path="/settings/design/pipeline/editor" component={PipelineEditor} />
      <Route path="/settings/design/db-workbench" component={DatabaseWorkbench} />
      <Route path="/settings/design/datastream" component={DataStream} />
      <Route path="/settings/design/graph-query" component={GraphQueryManager} />

      {/* ============================================ */}
      {/* 系统设置 - 配置中心 */}
      {/* ============================================ */}
      <Route path="/settings/config/infrastructure" component={Infrastructure} />
      <Route path="/settings/config/kafka" component={KafkaMonitor} />
      <Route path="/settings/config/resources" component={ResourcesOverview} />
      <Route path="/settings/config/db-management" component={DbManagement} />

      {/* ============================================ */}
      {/* 系统设置 - 状态监控 */}
      {/* ============================================ */}
      <Route path="/settings/status/plugins" component={PluginsManager} />
      <Route path="/settings/status/topology" component={SystemTopology} />
      <Route path="/settings/status/engines" component={EnginesManager} />
      <Route path="/settings/status/models" component={ModelsManager} />
      <Route path="/settings/status/observability" component={Observability} />
      <Route path="/settings/status/performance" component={PerformanceOverview} />
      <Route path="/settings/status/performance/outbox" component={OutboxManager} />
      <Route path="/settings/status/performance/saga" component={SagaManager} />
      <Route path="/settings/status/performance/sampling" component={AdaptiveSampling} />
      <Route path="/settings/status/performance/dedup" component={DeduplicationManager} />
      <Route path="/settings/status/performance/replica" component={ReadReplicaManager} />
      <Route path="/settings/status/microservices" component={ServicesOverview} />

      {/* ============================================ */}
      {/* 系统设置 - 安全运维 */}
      {/* ============================================ */}
      <Route path="/settings/security/ops" component={OpsDashboard} />
      <Route path="/settings/security/monitoring" component={SmartMonitoring} />
      <Route path="/settings/security/falco" component={FalcoMonitor} />
      <Route path="/settings/security/scanner" component={SecurityScanner} />
      <Route path="/settings/security/vault" component={VaultManager} />
      <Route path="/settings/security/pki" component={PkiManager} />

      {/* Settings redirect */}
      <Route path="/settings">
        <Redirect to="/settings/config/resources" />
      </Route>

      {/* Legacy route redirects for backward compatibility */}
      <Route path="/pipeline">
        <Redirect to="/settings/design/pipeline" />
      </Route>
      <Route path="/pipeline/editor">
        <Redirect to="/settings/design/pipeline/editor" />
      </Route>
      <Route path="/security/falco">
        <Redirect to="/settings/security/falco" />
      </Route>
      <Route path="/security/scanner">
        <Redirect to="/settings/security/scanner" />
      </Route>
      <Route path="/security/vault">
        <Redirect to="/settings/security/vault" />
      </Route>
      <Route path="/security/pki">
        <Redirect to="/settings/security/pki" />
      </Route>
      <Route path="/services/ingestion">
        <Redirect to="/settings/status/microservices" />
      </Route>
      <Route path="/services/aggregator">
        <Redirect to="/settings/status/microservices" />
      </Route>
      <Route path="/services/dispatcher">
        <Redirect to="/settings/status/microservices" />
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
