/**
 * React 19 Web Portal 配置服务
 * 
 * 提供 Web 端配置管理，支持：
 * - React 19 新特性配置
 * - Server Components 配置
 * - Suspense 和 Streaming SSR 配置
 * - 响应式布局和主题系统
 */

// ============ 类型定义 ============

export interface WebPortalConfig {
  // React 19 特性
  react19: {
    useTransition: boolean;
    useDeferredValue: boolean;
    useId: boolean;
    serverComponents: boolean;
    streamingSSR: boolean;
    suspenseBoundaries: boolean;
  };
  // 主题配置
  theme: ThemeConfig;
  // 布局配置
  layout: LayoutConfig;
  // 国际化配置
  i18n: I18nConfig;
  // 性能配置
  performance: PerformanceConfig;
  // 安全配置
  security: SecurityConfig;
}

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  customColors: Record<string, string>;
}

export interface LayoutConfig {
  sidebar: {
    width: number;
    collapsedWidth: number;
    position: 'left' | 'right';
    defaultCollapsed: boolean;
  };
  header: {
    height: number;
    sticky: boolean;
    showBreadcrumb: boolean;
  };
  footer: {
    height: number;
    show: boolean;
  };
  content: {
    maxWidth: number;
    padding: number;
  };
  breakpoints: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
  };
}

export interface I18nConfig {
  defaultLocale: string;
  supportedLocales: string[];
  fallbackLocale: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: {
    decimal: string;
    thousand: string;
    precision: number;
  };
}

export interface PerformanceConfig {
  lazyLoading: boolean;
  imageOptimization: boolean;
  codeSpitting: boolean;
  prefetching: boolean;
  caching: {
    enabled: boolean;
    maxAge: number;
    staleWhileRevalidate: number;
  };
  bundleAnalyzer: boolean;
}

export interface SecurityConfig {
  csp: {
    enabled: boolean;
    directives: Record<string, string[]>;
  };
  xss: {
    enabled: boolean;
    mode: 'block' | 'sanitize';
  };
  csrf: {
    enabled: boolean;
    tokenName: string;
  };
}

export interface ComponentConfig {
  name: string;
  type: 'client' | 'server' | 'shared';
  suspense: boolean;
  errorBoundary: boolean;
  lazyLoad: boolean;
  preload: boolean;
}

export interface RouteConfig {
  path: string;
  component: string;
  layout?: string;
  auth?: boolean;
  roles?: string[];
  meta?: {
    title: string;
    description?: string;
    icon?: string;
  };
  children?: RouteConfig[];
}

// ============ 默认配置 ============

export const DEFAULT_THEME: ThemeConfig = {
  mode: 'dark',
  primaryColor: '#3b82f6',
  secondaryColor: '#6366f1',
  accentColor: '#10b981',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
  customColors: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  sidebar: {
    width: 280,
    collapsedWidth: 64,
    position: 'left',
    defaultCollapsed: false,
  },
  header: {
    height: 64,
    sticky: true,
    showBreadcrumb: true,
  },
  footer: {
    height: 48,
    show: false,
  },
  content: {
    maxWidth: 1440,
    padding: 24,
  },
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },
};

export const DEFAULT_I18N: I18nConfig = {
  defaultLocale: 'zh-CN',
  supportedLocales: ['zh-CN', 'en-US', 'ja-JP'],
  fallbackLocale: 'en-US',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm:ss',
  numberFormat: {
    decimal: '.',
    thousand: ',',
    precision: 2,
  },
};

export const DEFAULT_PERFORMANCE: PerformanceConfig = {
  lazyLoading: true,
  imageOptimization: true,
  codeSpitting: true,
  prefetching: true,
  caching: {
    enabled: true,
    maxAge: 3600,
    staleWhileRevalidate: 86400,
  },
  bundleAnalyzer: false,
};

export const DEFAULT_SECURITY: SecurityConfig = {
  csp: {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https://api.xilian.com'],
    },
  },
  xss: {
    enabled: true,
    mode: 'sanitize',
  },
  csrf: {
    enabled: true,
    tokenName: 'X-CSRF-Token',
  },
};

// ============ PortAI Nexus路由配置 ============

export const XILIAN_ROUTES: RouteConfig[] = [
  {
    path: '/',
    component: 'Home',
    meta: { title: '首页', icon: 'home' },
  },
  {
    path: '/dashboard',
    component: 'Dashboard',
    auth: true,
    meta: { title: '仪表盘', icon: 'dashboard' },
  },
  {
    path: '/devices',
    component: 'DeviceLayout',
    auth: true,
    meta: { title: '设备管理', icon: 'device' },
    children: [
      { path: '', component: 'DeviceList', meta: { title: '设备列表' } },
      { path: ':id', component: 'DeviceDetail', meta: { title: '设备详情' } },
      { path: ':id/maintenance', component: 'DeviceMaintenance', meta: { title: '维护记录' } },
    ],
  },
  {
    path: '/knowledge',
    component: 'KnowledgeLayout',
    auth: true,
    meta: { title: '知识图谱', icon: 'knowledge' },
    children: [
      { path: '', component: 'KnowledgeGraph', meta: { title: '图谱浏览' } },
      { path: 'search', component: 'KnowledgeSearch', meta: { title: '知识搜索' } },
      { path: 'manage', component: 'KnowledgeManager', meta: { title: '知识管理' } },
    ],
  },
  {
    path: '/analytics',
    component: 'AnalyticsLayout',
    auth: true,
    meta: { title: '数据分析', icon: 'analytics' },
    children: [
      { path: '', component: 'AnalyticsDashboard', meta: { title: '分析概览' } },
      { path: 'timeseries', component: 'TimeSeriesAnalysis', meta: { title: '时序分析' } },
      { path: 'anomaly', component: 'AnomalyDetection', meta: { title: '异常检测' } },
      { path: 'prediction', component: 'PredictiveMaintenance', meta: { title: '预测维护' } },
    ],
  },
  {
    path: '/ai',
    component: 'AILayout',
    auth: true,
    meta: { title: 'AI 助手', icon: 'ai' },
    children: [
      { path: '', component: 'AIChat', meta: { title: '智能对话' } },
      { path: 'voice', component: 'VoiceUI', meta: { title: '语音交互' } },
      { path: 'agents', component: 'AIAgents', meta: { title: 'AI 代理' } },
    ],
  },
  {
    path: '/system',
    component: 'SystemLayout',
    auth: true,
    roles: ['admin'],
    meta: { title: '系统管理', icon: 'system' },
    children: [
      { path: '', component: 'SystemOverview', meta: { title: '系统概览' } },
      { path: 'users', component: 'UserManagement', meta: { title: '用户管理' } },
      { path: 'roles', component: 'RoleManagement', meta: { title: '角色管理' } },
      { path: 'logs', component: 'SystemLogs', meta: { title: '系统日志' } },
      { path: 'settings', component: 'SystemSettings', meta: { title: '系统设置' } },
    ],
  },
];

// ============ 组件配置 ============

export const XILIAN_COMPONENTS: ComponentConfig[] = [
  // Server Components
  { name: 'DeviceList', type: 'server', suspense: true, errorBoundary: true, lazyLoad: false, preload: true },
  { name: 'KnowledgeGraph', type: 'server', suspense: true, errorBoundary: true, lazyLoad: false, preload: true },
  { name: 'AnalyticsDashboard', type: 'server', suspense: true, errorBoundary: true, lazyLoad: false, preload: true },
  
  // Client Components
  { name: 'AIChat', type: 'client', suspense: true, errorBoundary: true, lazyLoad: true, preload: false },
  { name: 'VoiceUI', type: 'client', suspense: true, errorBoundary: true, lazyLoad: true, preload: false },
  { name: 'DeviceDetail', type: 'client', suspense: true, errorBoundary: true, lazyLoad: true, preload: false },
  
  // Shared Components
  { name: 'Header', type: 'shared', suspense: false, errorBoundary: false, lazyLoad: false, preload: true },
  { name: 'Sidebar', type: 'shared', suspense: false, errorBoundary: false, lazyLoad: false, preload: true },
  { name: 'Footer', type: 'shared', suspense: false, errorBoundary: false, lazyLoad: false, preload: true },
];

// ============ Web Portal 配置服务 ============

export class WebPortalConfigService {
  private config: WebPortalConfig;
  private routes: RouteConfig[] = [];
  private components: ComponentConfig[] = [];

  constructor(config?: Partial<WebPortalConfig>) {
    this.config = {
      react19: {
        useTransition: true,
        useDeferredValue: true,
        useId: true,
        serverComponents: true,
        streamingSSR: true,
        suspenseBoundaries: true,
      },
      theme: { ...DEFAULT_THEME, ...config?.theme },
      layout: { ...DEFAULT_LAYOUT, ...config?.layout },
      i18n: { ...DEFAULT_I18N, ...config?.i18n },
      performance: { ...DEFAULT_PERFORMANCE, ...config?.performance },
      security: { ...DEFAULT_SECURITY, ...config?.security },
    };

    this.routes = [...XILIAN_ROUTES];
    this.components = [...XILIAN_COMPONENTS];
  }

  // ============ 配置管理 ============

  /**
   * 获取完整配置
   */
  getConfig(): WebPortalConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<WebPortalConfig>): void {
    if (updates.theme) {
      this.config.theme = { ...this.config.theme, ...updates.theme };
    }
    if (updates.layout) {
      this.config.layout = { ...this.config.layout, ...updates.layout };
    }
    if (updates.i18n) {
      this.config.i18n = { ...this.config.i18n, ...updates.i18n };
    }
    if (updates.performance) {
      this.config.performance = { ...this.config.performance, ...updates.performance };
    }
    if (updates.security) {
      this.config.security = { ...this.config.security, ...updates.security };
    }
    if (updates.react19) {
      this.config.react19 = { ...this.config.react19, ...updates.react19 };
    }
  }

  // ============ 主题管理 ============

  /**
   * 获取主题配置
   */
  getTheme(): ThemeConfig {
    return { ...this.config.theme };
  }

  /**
   * 设置主题模式
   */
  setThemeMode(mode: 'light' | 'dark' | 'system'): void {
    this.config.theme.mode = mode;
  }

  /**
   * 设置主色调
   */
  setPrimaryColor(color: string): void {
    this.config.theme.primaryColor = color;
  }

  /**
   * 生成 CSS 变量
   */
  generateCSSVariables(): string {
    const theme = this.config.theme;
    return `
:root {
  --primary-color: ${theme.primaryColor};
  --secondary-color: ${theme.secondaryColor};
  --accent-color: ${theme.accentColor};
  --font-family: ${theme.fontFamily};
  --font-size-xs: ${theme.fontSize.xs};
  --font-size-sm: ${theme.fontSize.sm};
  --font-size-base: ${theme.fontSize.base};
  --font-size-lg: ${theme.fontSize.lg};
  --font-size-xl: ${theme.fontSize.xl};
  --font-size-2xl: ${theme.fontSize['2xl']};
  --border-radius-sm: ${theme.borderRadius.sm};
  --border-radius-md: ${theme.borderRadius.md};
  --border-radius-lg: ${theme.borderRadius.lg};
  --border-radius-full: ${theme.borderRadius.full};
  --shadow-sm: ${theme.shadows.sm};
  --shadow-md: ${theme.shadows.md};
  --shadow-lg: ${theme.shadows.lg};
  --shadow-xl: ${theme.shadows.xl};
  --color-success: ${theme.customColors.success};
  --color-warning: ${theme.customColors.warning};
  --color-error: ${theme.customColors.error};
  --color-info: ${theme.customColors.info};
}
    `.trim();
  }

  // ============ 路由管理 ============

  /**
   * 获取所有路由
   */
  getRoutes(): RouteConfig[] {
    return [...this.routes];
  }

  /**
   * 添加路由
   */
  addRoute(route: RouteConfig): void {
    this.routes.push(route);
  }

  /**
   * 获取扁平化路由
   */
  getFlatRoutes(): RouteConfig[] {
    const flatRoutes: RouteConfig[] = [];
    
    const flatten = (routes: RouteConfig[], parentPath: string = '') => {
      for (const route of routes) {
        const fullPath = parentPath ? `${parentPath}/${route.path}`.replace(/\/+/g, '/') : route.path;
        flatRoutes.push({ ...route, path: fullPath });
        if (route.children) {
          flatten(route.children, fullPath);
        }
      }
    };

    flatten(this.routes);
    return flatRoutes;
  }

  /**
   * 生成路由配置代码
   */
  generateRouteConfig(): string {
    const generateRouteCode = (routes: RouteConfig[], indent: number = 0): string => {
      const spaces = '  '.repeat(indent);
      return routes.map(route => {
        let code = `${spaces}{\n`;
        code += `${spaces}  path: '${route.path}',\n`;
        code += `${spaces}  element: <${route.component} />,\n`;
        if (route.auth) {
          code += `${spaces}  auth: true,\n`;
        }
        if (route.roles) {
          code += `${spaces}  roles: ${JSON.stringify(route.roles)},\n`;
        }
        if (route.children && route.children.length > 0) {
          code += `${spaces}  children: [\n`;
          code += generateRouteCode(route.children, indent + 2);
          code += `${spaces}  ],\n`;
        }
        code += `${spaces}}`;
        return code;
      }).join(',\n');
    };

    return `const routes = [\n${generateRouteCode(this.routes, 1)}\n];`;
  }

  // ============ 组件管理 ============

  /**
   * 获取所有组件配置
   */
  getComponents(): ComponentConfig[] {
    return [...this.components];
  }

  /**
   * 获取 Server Components
   */
  getServerComponents(): ComponentConfig[] {
    return this.components.filter(c => c.type === 'server');
  }

  /**
   * 获取 Client Components
   */
  getClientComponents(): ComponentConfig[] {
    return this.components.filter(c => c.type === 'client');
  }

  /**
   * 获取需要预加载的组件
   */
  getPreloadComponents(): ComponentConfig[] {
    return this.components.filter(c => c.preload);
  }

  /**
   * 生成组件导入代码
   */
  generateComponentImports(): string {
    const imports: string[] = [];
    
    for (const component of this.components) {
      if (component.lazyLoad) {
        imports.push(`const ${component.name} = lazy(() => import('./pages/${component.name}'));`);
      } else {
        imports.push(`import ${component.name} from './pages/${component.name}';`);
      }
    }

    return imports.join('\n');
  }

  // ============ React 19 特性 ============

  /**
   * 获取 React 19 配置
   */
  getReact19Config(): WebPortalConfig['react19'] {
    return { ...this.config.react19 };
  }

  /**
   * 生成 Suspense 边界代码
   */
  generateSuspenseBoundary(componentName: string, fallback: string = 'Loading...'): string {
    return `
<Suspense fallback={<div>${fallback}</div>}>
  <${componentName} />
</Suspense>
    `.trim();
  }

  /**
   * 生成 Error Boundary 代码
   */
  generateErrorBoundary(componentName: string): string {
    return `
<ErrorBoundary fallback={<ErrorFallback />}>
  <${componentName} />
</ErrorBoundary>
    `.trim();
  }

  // ============ 性能优化 ============

  /**
   * 获取性能配置
   */
  getPerformanceConfig(): PerformanceConfig {
    return { ...this.config.performance };
  }

  /**
   * 生成预加载链接
   */
  generatePreloadLinks(): string {
    const preloadComponents = this.getPreloadComponents();
    return preloadComponents.map(c => 
      `<link rel="modulepreload" href="/src/pages/${c.name}.tsx" />`
    ).join('\n');
  }

  // ============ 安全配置 ============

  /**
   * 获取安全配置
   */
  getSecurityConfig(): SecurityConfig {
    return { ...this.config.security };
  }

  /**
   * 生成 CSP 头
   */
  generateCSPHeader(): string {
    const csp = this.config.security.csp;
    if (!csp.enabled) return '';

    return Object.entries(csp.directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
  }

  // ============ 国际化 ============

  /**
   * 获取国际化配置
   */
  getI18nConfig(): I18nConfig {
    return { ...this.config.i18n };
  }

  /**
   * 设置默认语言
   */
  setDefaultLocale(locale: string): void {
    if (this.config.i18n.supportedLocales.includes(locale)) {
      this.config.i18n.defaultLocale = locale;
    }
  }

  // ============ 布局配置 ============

  /**
   * 获取布局配置
   */
  getLayoutConfig(): LayoutConfig {
    return { ...this.config.layout };
  }

  /**
   * 生成布局 CSS
   */
  generateLayoutCSS(): string {
    const layout = this.config.layout;
    return `
.app-layout {
  --sidebar-width: ${layout.sidebar.width}px;
  --sidebar-collapsed-width: ${layout.sidebar.collapsedWidth}px;
  --header-height: ${layout.header.height}px;
  --footer-height: ${layout.footer.height}px;
  --content-max-width: ${layout.content.maxWidth}px;
  --content-padding: ${layout.content.padding}px;
}

@media (max-width: ${layout.breakpoints.md}px) {
  .app-layout {
    --sidebar-width: 0px;
  }
}
    `.trim();
  }
}

// 导出单例
export const webPortalConfig = new WebPortalConfigService();
