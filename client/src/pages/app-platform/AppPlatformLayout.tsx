/**
 * 应用平台布局（客户界面入口）
 * 使用 CustomerLayout 替代 MainLayout，侧边栏导航 6 个页面
 */
import { lazy } from 'react';
import { useRoute } from 'wouter';
import { CustomerLayout } from '@/components/layout/CustomerLayout';

import HealthOverviewPage from './HealthOverviewPage';
import DiagnosisPage from './DiagnosisPage';
import AlertHandlingPage from './AlertHandlingPage';
import EquipmentPage from './EquipmentPage';
import ConfigPage from './ConfigPage';
const AlgorithmSimplePage = lazy(() => import('./AlgorithmSimplePage'));
const DataImportWizard = lazy(() => import('./DataImportWizard'));

// ── 页面标题映射 ─────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  health: '设备健康总览',
  diagnosis: '智能诊断',
  alerts: '预警处置',
  equipment: '设备管理',
  config: '基础配置',
  algorithms: '算法工具',
  import: '数据导入',
};

export default function AppPlatformLayout() {
  const [isDiagRoot] = useRoute('/app/diagnosis');
  const [isDiagDevice] = useRoute('/app/diagnosis/:deviceCode');
  const [isAlerts] = useRoute('/app/alerts');
  const [isEquipment] = useRoute('/app/equipment');
  const [isConfig] = useRoute('/app/config');
  const [isAlgorithms] = useRoute('/app/algorithms');
  const [isImport] = useRoute('/app/import');

  // 路由匹配渲染子页面
  let page: React.ReactNode;
  let titleKey: string;

  if (isDiagRoot || isDiagDevice) {
    page = <DiagnosisPage />;
    titleKey = 'diagnosis';
  } else if (isAlerts) {
    page = <AlertHandlingPage />;
    titleKey = 'alerts';
  } else if (isEquipment) {
    page = <EquipmentPage />;
    titleKey = 'equipment';
  } else if (isConfig) {
    page = <ConfigPage />;
    titleKey = 'config';
  } else if (isAlgorithms) {
    page = <AlgorithmSimplePage />;
    titleKey = 'algorithms';
  } else if (isImport) {
    page = <DataImportWizard />;
    titleKey = 'import';
  } else {
    page = <HealthOverviewPage />;
    titleKey = 'health';
  }

  return (
    <CustomerLayout title={PAGE_TITLES[titleKey]}>
      {page}
    </CustomerLayout>
  );
}
