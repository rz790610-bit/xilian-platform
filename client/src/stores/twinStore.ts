/**
 * ============================================================================
 * 数字孪生 Zustand Store — Phase 3
 * ============================================================================
 *
 * 职责：管理数字孪生页面的客户端状态
 *   - 设备选择
 *   - Tab 切换
 *   - 回放时间范围
 *   - 仿真任务跟踪
 *   - UI 偏好（图表类型等）
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TwinTab = 'status' | 'simulation' | 'replay' | 'worldmodel';

interface SimulationTaskProgress {
  taskId: string;
  scenarioId: number;
  progress: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  message?: string;
}

interface TwinStore {
  // 设备选择
  selectedEquipmentId: string | null;
  setSelectedEquipment: (id: string | null) => void;

  // Tab 状态
  activeTab: TwinTab;
  setActiveTab: (tab: TwinTab) => void;

  // 回放时间范围
  replayTimeRange: { start: string; end: string } | null;
  setReplayTimeRange: (range: { start: string; end: string } | null) => void;
  replayResolution: number;
  setReplayResolution: (resolution: number) => void;

  // 仿真任务进度跟踪
  activeTasks: Map<string, SimulationTaskProgress>;
  updateTaskProgress: (taskId: string, progress: SimulationTaskProgress) => void;
  removeTask: (taskId: string) => void;
  clearCompletedTasks: () => void;

  // UI 偏好
  useUPlot: boolean;
  setUseUPlot: (use: boolean) => void;
  compactMode: boolean;
  setCompactMode: (compact: boolean) => void;
}

export const useTwinStore = create<TwinStore>()(
  persist(
    (set) => ({
      // 设备选择
      selectedEquipmentId: null,
      setSelectedEquipment: (id) => set({ selectedEquipmentId: id }),

      // Tab 状态
      activeTab: 'status',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // 回放时间范围
      replayTimeRange: null,
      setReplayTimeRange: (range) => set({ replayTimeRange: range }),
      replayResolution: 60,
      setReplayResolution: (resolution) => set({ replayResolution: resolution }),

      // 仿真任务进度跟踪
      activeTasks: new Map(),
      updateTaskProgress: (taskId, progress) =>
        set((state) => {
          const newTasks = new Map(state.activeTasks);
          newTasks.set(taskId, progress);
          return { activeTasks: newTasks };
        }),
      removeTask: (taskId) =>
        set((state) => {
          const newTasks = new Map(state.activeTasks);
          newTasks.delete(taskId);
          return { activeTasks: newTasks };
        }),
      clearCompletedTasks: () =>
        set((state) => {
          const newTasks = new Map(state.activeTasks);
          for (const [id, task] of newTasks) {
            if (task.status === 'completed' || task.status === 'failed') {
              newTasks.delete(id);
            }
          }
          return { activeTasks: newTasks };
        }),

      // UI 偏好
      useUPlot: false,
      setUseUPlot: (use) => set({ useUPlot: use }),
      compactMode: true,
      setCompactMode: (compact) => set({ compactMode: compact }),
    }),
    {
      name: 'twin-store',
      partialize: (state) => ({
        selectedEquipmentId: state.selectedEquipmentId,
        activeTab: state.activeTab,
        replayResolution: state.replayResolution,
        useUPlot: state.useUPlot,
        compactMode: state.compactMode,
      }),
    },
  ),
);
