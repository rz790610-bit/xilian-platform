/**
 * 应用平台 Zustand Store
 * 管理设备选择、过滤状态、活动 Tab
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppPlatformTab = 'health' | 'diagnosis' | 'alerts';

interface AppPlatformStore {
  // 设备选择
  selectedDeviceCode: string | null;
  setSelectedDeviceCode: (code: string | null) => void;

  // 活动 Tab
  activeTab: AppPlatformTab;
  setActiveTab: (tab: AppPlatformTab) => void;

  // 健康总览过滤
  healthSearch: string;
  setHealthSearch: (q: string) => void;
  healthTypeFilter: string;
  setHealthTypeFilter: (t: string) => void;
  healthStatusFilter: string;
  setHealthStatusFilter: (s: string) => void;

  // 预警过滤
  alertSeverityFilter: string;
  setAlertSeverityFilter: (s: string) => void;
  alertAckFilter: string;
  setAlertAckFilter: (s: string) => void;
  alertDeviceSearch: string;
  setAlertDeviceSearch: (q: string) => void;
}

export const useAppPlatformStore = create<AppPlatformStore>()(
  persist(
    (set) => ({
      selectedDeviceCode: null,
      setSelectedDeviceCode: (code) => set({ selectedDeviceCode: code }),

      activeTab: 'health',
      setActiveTab: (tab) => set({ activeTab: tab }),

      healthSearch: '',
      setHealthSearch: (q) => set({ healthSearch: q }),
      healthTypeFilter: 'all',
      setHealthTypeFilter: (t) => set({ healthTypeFilter: t }),
      healthStatusFilter: 'all',
      setHealthStatusFilter: (s) => set({ healthStatusFilter: s }),

      alertSeverityFilter: 'all',
      setAlertSeverityFilter: (s) => set({ alertSeverityFilter: s }),
      alertAckFilter: 'all',
      setAlertAckFilter: (s) => set({ alertAckFilter: s }),
      alertDeviceSearch: '',
      setAlertDeviceSearch: (q) => set({ alertDeviceSearch: q }),
    }),
    {
      name: 'app-platform-store',
      partialize: (state) => ({
        selectedDeviceCode: state.selectedDeviceCode,
        activeTab: state.activeTab,
      }),
    },
  ),
);
