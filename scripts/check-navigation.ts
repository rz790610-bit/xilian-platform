/**
 * 导航节点和路由完整性检查脚本
 * Navigation and Route Integrity Check Script
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path?: string;
  children?: NavItem[];
}

interface CheckResult {
  path: string;
  label: string;
  hasRoute: boolean;
  hasPage: boolean;
  pageFile?: string;
}

// 从 App.tsx 提取所有路由路径
function extractRoutesFromApp(): Set<string> {
  const appPath = path.join(__dirname, '../client/src/App.tsx');
  const content = fs.readFileSync(appPath, 'utf-8');
  const routeRegex = /path="([^"]+)"/g;
  const routes = new Set<string>();
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.add(match[1]);
  }
  return routes;
}

// 检查页面文件是否存在
function checkPageExists(routePath: string): { exists: boolean; file?: string } {
  const pagesDir = path.join(__dirname, '../client/src/pages');
  
  // 常见的路径到文件映射
  const pathMappings: Record<string, string[]> = {
    '/dashboard': ['Dashboard.tsx'],
    '/agents': ['Agents.tsx'],
    '/chat': ['AIChat.tsx'],
    '/pipeline': ['Pipeline.tsx'],
    '/docs': ['Documents.tsx'],
    '/device/list': ['device/DeviceList.tsx'],
    '/device/maintenance': ['device/DeviceList.tsx'],
    '/device/alerts': ['device/DeviceList.tsx'],
    '/device/kpi': ['device/DeviceList.tsx'],
    '/knowledge/manager': ['KnowledgeManager.tsx'],
    '/knowledge/graph': ['KnowledgeGraph.tsx'],
    '/knowledge/vectors': ['VectorAdmin.tsx'],
    '/base/rules': ['BaseRules.tsx'],
    '/base/library': ['BaseLibrary.tsx'],
    '/data/manage': ['DataManage.tsx'],
    '/data/label': ['DataLabel.tsx'],
    '/data/insight': ['DataInsight.tsx'],
    '/data/access': ['DataAccess.tsx'],
    '/data/standard': ['DataStandard.tsx'],
    '/model/center': ['ModelCenter.tsx'],
    '/model/inference': ['ModelInference.tsx'],
    '/model/finetune': ['PlaceholderPage.tsx'],
    '/model/eval': ['PlaceholderPage.tsx'],
    '/model/repo': ['ModelRepo.tsx'],
    '/diagnosis/analysis': ['PlaceholderPage.tsx'],
    '/diagnosis/report': ['PlaceholderPage.tsx'],
    '/diagnosis/knowledge': ['KnowledgeBase.tsx'],
    '/evolution/feedback': ['PlaceholderPage.tsx'],
    '/evolution/learning': ['PlaceholderPage.tsx'],
    '/evolution/train': ['PlaceholderPage.tsx'],
    '/evolution/board': ['PlaceholderPage.tsx'],
    '/security/falco': ['security/FalcoMonitor.tsx'],
    '/security/scanner': ['security/SecurityScanner.tsx'],
    '/security/vault': ['security/SecurityScanner.tsx'],
    '/security/pki': ['security/SecurityScanner.tsx'],
    '/edge/nodes': ['edge/EdgeNodes.tsx'],
    '/edge/inference': ['edge/EdgeNodes.tsx'],
    '/edge/gateway': ['edge/EdgeNodes.tsx'],
    '/edge/tsn': ['edge/EdgeNodes.tsx'],
    '/services/ingestion': ['services/ServiceMonitor.tsx'],
    '/services/aggregator': ['services/ServiceMonitor.tsx'],
    '/services/dispatcher': ['services/ServiceMonitor.tsx'],
    '/services/performance': ['services/ServiceMonitor.tsx'],
    '/settings/resources': ['Settings.tsx'],
    '/settings/databases': ['Settings.tsx'],
    '/settings/plugins': ['Settings.tsx'],
    '/settings/engines': ['Settings.tsx'],
    '/settings/topology': ['SystemTopology.tsx'],
    '/settings/datastream': ['DataStream.tsx'],
    '/settings/kafka': ['KafkaMonitor.tsx'],
    '/settings/infrastructure': ['Infrastructure.tsx'],
    '/settings/observability': ['Observability.tsx'],
    '/settings/ops': ['OpsDashboard.tsx'],
    '/settings/monitoring': ['settings/SmartMonitoring.tsx'],
    '/settings/models': ['Settings.tsx'],
    '/settings': ['Settings.tsx'],
  };

  const files = pathMappings[routePath];
  if (files) {
    for (const file of files) {
      const fullPath = path.join(pagesDir, file);
      if (fs.existsSync(fullPath)) {
        return { exists: true, file };
      }
    }
  }
  
  return { exists: false };
}

// 递归收集所有导航路径
function collectNavPaths(items: NavItem[], results: CheckResult[] = []): CheckResult[] {
  for (const item of items) {
    if (item.path) {
      results.push({
        path: item.path,
        label: item.label,
        hasRoute: false,
        hasPage: false,
      });
    }
    if (item.children) {
      collectNavPaths(item.children, results);
    }
  }
  return results;
}

// 主检查函数
function runCheck() {
  console.log('='.repeat(60));
  console.log('西联智能平台 - 导航节点和路由完整性检查');
  console.log('='.repeat(60));
  console.log('');

  const routes = extractRoutesFromApp();
  const navPaths = collectNavPaths(navigationConfig as NavItem[]);

  let missingRoutes = 0;
  let missingPages = 0;

  console.log('检查结果:');
  console.log('-'.repeat(60));

  for (const item of navPaths) {
    item.hasRoute = routes.has(item.path);
    const pageCheck = checkPageExists(item.path);
    item.hasPage = pageCheck.exists;
    item.pageFile = pageCheck.file;

    const routeStatus = item.hasRoute ? '✅' : '❌';
    const pageStatus = item.hasPage ? '✅' : '❌';

    if (!item.hasRoute) missingRoutes++;
    if (!item.hasPage) missingPages++;

    console.log(`${routeStatus} ${pageStatus} ${item.path.padEnd(30)} ${item.label}`);
    if (!item.hasRoute) {
      console.log(`     ⚠️  缺少路由配置`);
    }
    if (!item.hasPage) {
      console.log(`     ⚠️  缺少页面文件`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`总计: ${navPaths.length} 个导航项`);
  console.log(`路由配置: ${navPaths.length - missingRoutes}/${navPaths.length} 完整`);
  console.log(`页面文件: ${navPaths.length - missingPages}/${navPaths.length} 完整`);
  
  if (missingRoutes === 0 && missingPages === 0) {
    console.log('');
    console.log('✅ 所有导航节点检查通过！');
  } else {
    console.log('');
    console.log(`❌ 发现 ${missingRoutes} 个缺失路由，${missingPages} 个缺失页面`);
  }
  console.log('='.repeat(60));
}

runCheck();
