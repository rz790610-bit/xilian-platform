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
import {
  ModelFinetune,
  ModelEval,
  DiagAnalysis,
  DiagReport,
  KnowledgeBase,
  FeedbackCenter,
  ActiveLearning,
  AutoTrain,
  EvolutionBoard
} from "./pages/PlaceholderPage";

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
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/chat" component={AIChat} />
      <Route path="/docs" component={Documents} />
      
      {/* Data center */}
      <Route path="/data/manage" component={DataManage} />
      <Route path="/data/label" component={DataLabel} />
      <Route path="/data/insight" component={DataInsight} />
      <Route path="/data/access" component={DataAccess} />
      <Route path="/data/standard" component={DataStandard} />
      
      {/* Model center */}
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
      
      {/* Settings */}
      <Route path="/settings/resources" component={Settings} />
      <Route path="/settings/databases" component={Settings} />
      <Route path="/settings/plugins" component={Settings} />
      <Route path="/settings/engines" component={Settings} />
      <Route path="/settings/topology" component={Settings} />
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
