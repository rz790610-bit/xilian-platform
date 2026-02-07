import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./components/common/Toast";

// Pages
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Pipeline from "./pages/Pipeline";
import AIChat from "./pages/AIChat";
import Documents from "./pages/Documents";
import DataManage from "./pages/DataManage";
import ModelInference from "./pages/ModelInference";
import Settings from "./pages/Settings";
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
import SystemTopology from "./pages/SystemTopology";
import DataStream from "./pages/DataStream";
import KafkaMonitor from "./pages/KafkaMonitor";
import PipelineEditor from "./pages/PipelineEditor";
import Infrastructure from "./pages/Infrastructure";
import Observability from "./pages/Observability";
import OpsDashboard from "./pages/OpsDashboard";

// 新增模块页面
import DeviceList from "./pages/device/DeviceList";
import FalcoMonitor from "./pages/security/FalcoMonitor";
import SecurityScanner from "./pages/security/SecurityScanner";
import EdgeNodes from "./pages/edge/EdgeNodes";
import ServiceMonitor from "./pages/services/ServiceMonitor";
import SmartMonitoring from "./pages/settings/SmartMonitoring";

// v1.9 性能优化模块页面
import PerformanceOverview from "./pages/PerformanceOverview";
import OutboxManager from "./pages/OutboxManager";
import SagaManager from "./pages/SagaManager";
import AdaptiveSampling from "./pages/AdaptiveSampling";
import DeduplicationManager from "./pages/DeduplicationManager";
import ReadReplicaManager from "./pages/ReadReplicaManager";
import GraphQueryManager from "./pages/GraphQueryManager";

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

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      {/* Redirect root to dashboard */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      {/* Main pages */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/agents" component={Agents} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/pipeline/editor" component={PipelineEditor} />
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
      
      {/* Data center */}
      <Route path="/data/manage" component={DataManage} />
      <Route path="/data/label" component={DataLabel} />
      <Route path="/data/insight" component={DataInsight} />
      <Route path="/data/access" component={DataAccess} />
      <Route path="/data/standard" component={DataStandard} />
      
      {/* Model center */}
      <Route path="/model/center" component={ModelCenter} />
      <Route path="/model/inference" component={ModelInference} />
      <Route path="/model/finetune" component={ModelFinetune} />
      <Route path="/model/eval" component={ModelEval} />
      <Route path="/model/repo" component={ModelRepo} />
      
      {/* Diagnosis */}
      <Route path="/diagnosis/analysis" component={DiagAnalysis} />
      <Route path="/diagnosis/report" component={DiagReport} />
      <Route path="/diagnosis/knowledge" component={KnowledgeBase} />
      
      {/* Evolution */}
      <Route path="/evolution/feedback" component={FeedbackCenter} />
      <Route path="/evolution/learning" component={ActiveLearning} />
      <Route path="/evolution/train" component={AutoTrain} />
      <Route path="/evolution/board" component={EvolutionBoard} />
      
      {/* Security Center - 安全中心 */}
      <Route path="/security/falco" component={FalcoMonitor} />
      <Route path="/security/scanner" component={SecurityScanner} />
      <Route path="/security/vault" component={SecurityScanner} />
      <Route path="/security/pki" component={SecurityScanner} />
      
      {/* Edge Computing - 边缘计算 */}
      <Route path="/edge/nodes" component={EdgeNodes} />
      <Route path="/edge/inference" component={EdgeNodes} />
      <Route path="/edge/gateway" component={EdgeNodes} />
      <Route path="/edge/tsn" component={EdgeNodes} />
      
      {/* Microservices - 微服务 */}
      <Route path="/services/ingestion" component={ServiceMonitor} />
      <Route path="/services/aggregator" component={ServiceMonitor} />
      <Route path="/services/dispatcher" component={ServiceMonitor} />
      <Route path="/services/performance" component={ServiceMonitor} />

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

      {/* Performance - 性能优化 v1.9 (保留原路径兼容 + 系统设置入口) */}
      <Route path="/performance">
        <Redirect to="/performance/overview" />
      </Route>
      <Route path="/performance/overview" component={PerformanceOverview} />
      <Route path="/performance/outbox" component={OutboxManager} />
      <Route path="/performance/saga" component={SagaManager} />
      <Route path="/performance/sampling" component={AdaptiveSampling} />
      <Route path="/performance/dedup" component={DeduplicationManager} />
      <Route path="/performance/replica" component={ReadReplicaManager} />
      <Route path="/performance/graph" component={GraphQueryManager} />
      <Route path="/settings/performance" component={PerformanceOverview} />
      <Route path="/settings/performance/outbox" component={OutboxManager} />
      <Route path="/settings/performance/saga" component={SagaManager} />
      <Route path="/settings/performance/sampling" component={AdaptiveSampling} />
      <Route path="/settings/performance/dedup" component={DeduplicationManager} />
      <Route path="/settings/performance/replica" component={ReadReplicaManager} />
      <Route path="/settings/performance/graph" component={GraphQueryManager} />
      
      {/* Settings */}
      <Route path="/settings/resources" component={Settings} />
      <Route path="/settings/databases" component={Settings} />
      <Route path="/settings/plugins" component={Settings} />
      <Route path="/settings/engines" component={Settings} />
      <Route path="/settings/topology" component={SystemTopology} />
      <Route path="/settings/datastream" component={DataStream} />
      <Route path="/settings/kafka" component={KafkaMonitor} />
      <Route path="/settings/infrastructure" component={Infrastructure} />
      <Route path="/settings/observability" component={Observability} />
      <Route path="/settings/ops" component={OpsDashboard} />
      <Route path="/settings/monitoring" component={SmartMonitoring} />
      <Route path="/settings/models" component={Settings} />
      <Route path="/settings" component={Settings} />
      
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
