/**
 * React Native Mobile App 配置服务
 * 
 * 提供移动端配置管理，支持：
 * - 跨平台组件库配置
 * - 离线存储和同步
 * - 推送通知集成
 * - 原生功能桥接
 */

// ============ 类型定义 ============

export interface MobileAppConfig {
  app: AppInfo;
  platforms: PlatformConfig;
  offline: OfflineConfig;
  push: PushNotificationConfig;
  sync: SyncConfig;
  native: NativeFeatureConfig;
  security: MobileSecurityConfig;
}

export interface AppInfo {
  name: string;
  displayName: string;
  bundleId: string;
  version: string;
  buildNumber: number;
  minOSVersion: {
    ios: string;
    android: number;
  };
}

export interface PlatformConfig {
  ios: {
    enabled: boolean;
    teamId: string;
    signingCertificate: string;
    provisioningProfile: string;
    capabilities: string[];
  };
  android: {
    enabled: boolean;
    packageName: string;
    keystorePath: string;
    permissions: string[];
  };
}

export interface OfflineConfig {
  enabled: boolean;
  storage: {
    type: 'sqlite' | 'realm' | 'asyncstorage';
    maxSize: number;
    encryption: boolean;
  };
  cachePolicy: {
    devices: CachePolicy;
    knowledge: CachePolicy;
    analytics: CachePolicy;
    user: CachePolicy;
  };
  syncOnReconnect: boolean;
}

export interface CachePolicy {
  enabled: boolean;
  maxAge: number;
  maxItems: number;
  priority: 'high' | 'medium' | 'low';
}

export interface PushNotificationConfig {
  enabled: boolean;
  providers: {
    apns: {
      enabled: boolean;
      keyId: string;
      teamId: string;
      bundleId: string;
    };
    fcm: {
      enabled: boolean;
      projectId: string;
      senderId: string;
    };
  };
  channels: NotificationChannel[];
  defaultSound: string;
  defaultVibration: boolean;
}

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: 'default' | 'high' | 'low' | 'min' | 'max';
  sound: boolean;
  vibration: boolean;
  badge: boolean;
}

export interface SyncConfig {
  enabled: boolean;
  strategy: 'realtime' | 'periodic' | 'manual';
  interval: number;
  conflictResolution: 'server-wins' | 'client-wins' | 'manual';
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  bandwidth: {
    wifiOnly: boolean;
    maxBatchSize: number;
    compressionEnabled: boolean;
  };
}

export interface NativeFeatureConfig {
  camera: {
    enabled: boolean;
    permissions: string[];
  };
  location: {
    enabled: boolean;
    accuracy: 'high' | 'balanced' | 'low';
    backgroundUpdates: boolean;
  };
  biometrics: {
    enabled: boolean;
    types: ('fingerprint' | 'faceId' | 'iris')[];
  };
  bluetooth: {
    enabled: boolean;
    scanMode: 'low-power' | 'balanced' | 'low-latency';
  };
  nfc: {
    enabled: boolean;
    readOnly: boolean;
  };
  sensors: {
    accelerometer: boolean;
    gyroscope: boolean;
    magnetometer: boolean;
    barometer: boolean;
  };
}

export interface MobileSecurityConfig {
  certificatePinning: {
    enabled: boolean;
    pins: { host: string; sha256: string }[];
  };
  rootDetection: {
    enabled: boolean;
    action: 'warn' | 'block';
  };
  secureStorage: {
    enabled: boolean;
    keychain: boolean;
  };
  appAttestation: {
    enabled: boolean;
  };
}

export interface MobileScreen {
  name: string;
  component: string;
  navigation: 'stack' | 'tab' | 'drawer';
  options?: {
    title?: string;
    headerShown?: boolean;
    tabBarIcon?: string;
    gestureEnabled?: boolean;
  };
  children?: MobileScreen[];
}

export interface MobileComponent {
  name: string;
  type: 'native' | 'cross-platform';
  platforms: ('ios' | 'android')[];
  props: { name: string; type: string; required: boolean }[];
}

// ============ 默认配置 ============

export const DEFAULT_APP_INFO: AppInfo = {
  name: 'xilian-mobile',
  displayName: 'PortAI',
  bundleId: 'com.xilian.mobile',
  version: '1.0.0',
  buildNumber: 1,
  minOSVersion: {
    ios: '14.0',
    android: 26,
  },
};

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  enabled: true,
  storage: {
    type: 'sqlite',
    maxSize: 100 * 1024 * 1024, // 100MB
    encryption: true,
  },
  cachePolicy: {
    devices: { enabled: true, maxAge: 3600, maxItems: 1000, priority: 'high' },
    knowledge: { enabled: true, maxAge: 86400, maxItems: 5000, priority: 'medium' },
    analytics: { enabled: true, maxAge: 1800, maxItems: 500, priority: 'low' },
    user: { enabled: true, maxAge: 604800, maxItems: 10, priority: 'high' },
  },
  syncOnReconnect: true,
};

export const DEFAULT_PUSH_CONFIG: PushNotificationConfig = {
  enabled: true,
  providers: {
    apns: {
      enabled: true,
      keyId: '',
      teamId: '',
      bundleId: 'com.xilian.mobile',
    },
    fcm: {
      enabled: true,
      projectId: '',
      senderId: '',
    },
  },
  channels: [
    {
      id: 'alerts',
      name: '设备告警',
      description: '设备故障和异常告警通知',
      importance: 'high',
      sound: true,
      vibration: true,
      badge: true,
    },
    {
      id: 'maintenance',
      name: '维护提醒',
      description: '设备维护计划提醒',
      importance: 'default',
      sound: true,
      vibration: false,
      badge: true,
    },
    {
      id: 'updates',
      name: '系统更新',
      description: '应用和系统更新通知',
      importance: 'low',
      sound: false,
      vibration: false,
      badge: false,
    },
  ],
  defaultSound: 'default',
  defaultVibration: true,
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: true,
  strategy: 'realtime',
  interval: 300000, // 5 minutes
  conflictResolution: 'server-wins',
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
  },
  bandwidth: {
    wifiOnly: false,
    maxBatchSize: 100,
    compressionEnabled: true,
  },
};

export const DEFAULT_NATIVE_CONFIG: NativeFeatureConfig = {
  camera: {
    enabled: true,
    permissions: ['camera', 'photo_library'],
  },
  location: {
    enabled: true,
    accuracy: 'balanced',
    backgroundUpdates: false,
  },
  biometrics: {
    enabled: true,
    types: ['fingerprint', 'faceId'],
  },
  bluetooth: {
    enabled: true,
    scanMode: 'balanced',
  },
  nfc: {
    enabled: false,
    readOnly: true,
  },
  sensors: {
    accelerometer: true,
    gyroscope: true,
    magnetometer: false,
    barometer: false,
  },
};

// ============ PortAI Nexus移动端屏幕配置 ============

export const XILIAN_MOBILE_SCREENS: MobileScreen[] = [
  {
    name: 'MainTabs',
    component: 'TabNavigator',
    navigation: 'tab',
    children: [
      {
        name: 'Dashboard',
        component: 'DashboardScreen',
        navigation: 'stack',
        options: { title: '首页', tabBarIcon: 'home' },
      },
      {
        name: 'Devices',
        component: 'DevicesScreen',
        navigation: 'stack',
        options: { title: '设备', tabBarIcon: 'device' },
        children: [
          { name: 'DeviceList', component: 'DeviceListScreen', navigation: 'stack' },
          { name: 'DeviceDetail', component: 'DeviceDetailScreen', navigation: 'stack' },
          { name: 'DeviceAlerts', component: 'DeviceAlertsScreen', navigation: 'stack' },
        ],
      },
      {
        name: 'Alerts',
        component: 'AlertsScreen',
        navigation: 'stack',
        options: { title: '告警', tabBarIcon: 'alert' },
      },
      {
        name: 'AI',
        component: 'AIScreen',
        navigation: 'stack',
        options: { title: 'AI 助手', tabBarIcon: 'ai' },
        children: [
          { name: 'AIChat', component: 'AIChatScreen', navigation: 'stack' },
          { name: 'VoiceUI', component: 'VoiceUIScreen', navigation: 'stack' },
        ],
      },
      {
        name: 'Profile',
        component: 'ProfileScreen',
        navigation: 'stack',
        options: { title: '我的', tabBarIcon: 'user' },
        children: [
          { name: 'Settings', component: 'SettingsScreen', navigation: 'stack' },
          { name: 'Notifications', component: 'NotificationsScreen', navigation: 'stack' },
        ],
      },
    ],
  },
];

// ============ 跨平台组件库 ============

export const XILIAN_MOBILE_COMPONENTS: MobileComponent[] = [
  // 基础组件
  {
    name: 'Button',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'title', type: 'string', required: true },
      { name: 'onPress', type: 'function', required: true },
      { name: 'variant', type: "'primary' | 'secondary' | 'outline'", required: false },
      { name: 'disabled', type: 'boolean', required: false },
      { name: 'loading', type: 'boolean', required: false },
    ],
  },
  {
    name: 'Card',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'title', type: 'string', required: false },
      { name: 'children', type: 'ReactNode', required: true },
      { name: 'onPress', type: 'function', required: false },
    ],
  },
  {
    name: 'Input',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'value', type: 'string', required: true },
      { name: 'onChangeText', type: 'function', required: true },
      { name: 'placeholder', type: 'string', required: false },
      { name: 'secureTextEntry', type: 'boolean', required: false },
    ],
  },
  // 业务组件
  {
    name: 'DeviceCard',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'device', type: 'Device', required: true },
      { name: 'onPress', type: 'function', required: false },
      { name: 'showStatus', type: 'boolean', required: false },
    ],
  },
  {
    name: 'AlertItem',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'alert', type: 'Alert', required: true },
      { name: 'onAcknowledge', type: 'function', required: false },
      { name: 'onPress', type: 'function', required: false },
    ],
  },
  {
    name: 'KPIChart',
    type: 'cross-platform',
    platforms: ['ios', 'android'],
    props: [
      { name: 'data', type: 'TimeSeriesData[]', required: true },
      { name: 'type', type: "'line' | 'bar' | 'area'", required: false },
      { name: 'height', type: 'number', required: false },
    ],
  },
  // 原生组件
  {
    name: 'BiometricAuth',
    type: 'native',
    platforms: ['ios', 'android'],
    props: [
      { name: 'onSuccess', type: 'function', required: true },
      { name: 'onError', type: 'function', required: false },
      { name: 'promptMessage', type: 'string', required: false },
    ],
  },
  {
    name: 'QRScanner',
    type: 'native',
    platforms: ['ios', 'android'],
    props: [
      { name: 'onScan', type: 'function', required: true },
      { name: 'onError', type: 'function', required: false },
      { name: 'flashEnabled', type: 'boolean', required: false },
    ],
  },
];

// ============ Mobile App 配置服务 ============

export class MobileAppConfigService {
  private config: MobileAppConfig;
  private screens: MobileScreen[] = [];
  private components: MobileComponent[] = [];

  constructor(config?: Partial<MobileAppConfig>) {
    this.config = {
      app: { ...DEFAULT_APP_INFO, ...config?.app },
      platforms: config?.platforms || {
        ios: {
          enabled: true,
          teamId: '',
          signingCertificate: '',
          provisioningProfile: '',
          capabilities: ['push-notifications', 'background-fetch', 'associated-domains'],
        },
        android: {
          enabled: true,
          packageName: 'com.xilian.mobile',
          keystorePath: '',
          permissions: [
            'android.permission.INTERNET',
            'android.permission.CAMERA',
            'android.permission.ACCESS_FINE_LOCATION',
            'android.permission.RECEIVE_BOOT_COMPLETED',
            'android.permission.VIBRATE',
          ],
        },
      },
      offline: { ...DEFAULT_OFFLINE_CONFIG, ...config?.offline },
      push: { ...DEFAULT_PUSH_CONFIG, ...config?.push },
      sync: { ...DEFAULT_SYNC_CONFIG, ...config?.sync },
      native: { ...DEFAULT_NATIVE_CONFIG, ...config?.native },
      security: config?.security || {
        certificatePinning: {
          enabled: true,
          pins: [{ host: 'api.xilian.com', sha256: '' }],
        },
        rootDetection: {
          enabled: true,
          action: 'warn',
        },
        secureStorage: {
          enabled: true,
          keychain: true,
        },
        appAttestation: {
          enabled: false,
        },
      },
    };

    this.screens = [...XILIAN_MOBILE_SCREENS];
    this.components = [...XILIAN_MOBILE_COMPONENTS];
  }

  // ============ 配置管理 ============

  getConfig(): MobileAppConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<MobileAppConfig>): void {
    Object.assign(this.config, updates);
  }

  // ============ 离线存储 ============

  getOfflineConfig(): OfflineConfig {
    return { ...this.config.offline };
  }

  /**
   * 生成离线存储 Schema
   */
  generateOfflineSchema(): string {
    return `
-- 设备缓存表
CREATE TABLE IF NOT EXISTS cached_devices (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 知识节点缓存表
CREATE TABLE IF NOT EXISTS cached_knowledge (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 待同步队列
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_devices_expires ON cached_devices(expires_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_expires ON cached_knowledge(expires_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_type ON sync_queue(type);
    `.trim();
  }

  // ============ 推送通知 ============

  getPushConfig(): PushNotificationConfig {
    return { ...this.config.push };
  }

  getNotificationChannels(): NotificationChannel[] {
    return [...this.config.push.channels];
  }

  addNotificationChannel(channel: NotificationChannel): void {
    this.config.push.channels.push(channel);
  }

  // ============ 同步配置 ============

  getSyncConfig(): SyncConfig {
    return { ...this.config.sync };
  }

  setSyncStrategy(strategy: SyncConfig['strategy']): void {
    this.config.sync.strategy = strategy;
  }

  // ============ 原生功能 ============

  getNativeConfig(): NativeFeatureConfig {
    return { ...this.config.native };
  }

  isFeatureEnabled(feature: keyof NativeFeatureConfig): boolean {
    const featureConfig = this.config.native[feature];
    return typeof featureConfig === 'object' && 'enabled' in featureConfig 
      ? featureConfig.enabled 
      : false;
  }

  // ============ 屏幕和组件 ============

  getScreens(): MobileScreen[] {
    return [...this.screens];
  }

  getComponents(): MobileComponent[] {
    return [...this.components];
  }

  getCrossPlatformComponents(): MobileComponent[] {
    return this.components.filter(c => c.type === 'cross-platform');
  }

  getNativeComponents(): MobileComponent[] {
    return this.components.filter(c => c.type === 'native');
  }

  // ============ 代码生成 ============

  /**
   * 生成导航配置代码
   */
  generateNavigationConfig(): string {
    const generateScreenCode = (screens: MobileScreen[], indent: number = 0): string => {
      const spaces = '  '.repeat(indent);
      return screens.map(screen => {
        let code = `${spaces}<${screen.navigation === 'tab' ? 'Tab' : 'Stack'}.Screen\n`;
        code += `${spaces}  name="${screen.name}"\n`;
        code += `${spaces}  component={${screen.component}}\n`;
        if (screen.options) {
          code += `${spaces}  options={${JSON.stringify(screen.options)}}\n`;
        }
        code += `${spaces}/>`;
        return code;
      }).join('\n');
    };

    return `
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

export const AppNavigator = () => (
  <Tab.Navigator>
${generateScreenCode(this.screens[0]?.children || [], 2)}
  </Tab.Navigator>
);
    `.trim();
  }

  /**
   * 生成 Android 权限配置
   */
  generateAndroidPermissions(): string {
    return this.config.platforms.android.permissions
      .map(p => `<uses-permission android:name="${p}" />`)
      .join('\n');
  }

  /**
   * 生成 iOS 能力配置
   */
  generateIOSCapabilities(): string {
    return this.config.platforms.ios.capabilities
      .map(c => `<string>${c}</string>`)
      .join('\n');
  }

  // ============ 安全配置 ============

  getSecurityConfig(): MobileSecurityConfig {
    return { ...this.config.security };
  }

  /**
   * 生成证书固定配置
   */
  generateCertificatePinningConfig(): string {
    if (!this.config.security.certificatePinning.enabled) {
      return '// Certificate pinning disabled';
    }

    const pins = this.config.security.certificatePinning.pins;
    return `
const certificatePins = {
${pins.map(p => `  '${p.host}': '${p.sha256}'`).join(',\n')}
};
    `.trim();
  }
}

// 导出单例
export const mobileAppConfig = new MobileAppConfigService();
