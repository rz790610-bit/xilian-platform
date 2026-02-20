/**
 * ============================================================================
 * 工况配置持久化服务 — ConditionProfileService
 * ============================================================================
 *
 * 将 ConditionProfileManager 的内存数据持久化到数据库
 * 提供 CRUD API 供 tRPC 路由调用
 */

import { ConditionProfileManager, type ConditionProfile } from './condition-profile-manager';

// ============================================================================
// 服务接口
// ============================================================================

export interface ConditionProfileDTO {
  id: number;
  name: string;
  description: string;
  industry: string;
  equipmentType: string;
  version: number;
  enabled: boolean;
  parameters: ConditionProfile['parameters'];
  sensorMapping: ConditionProfile['sensorMapping'];
  thresholdStrategy: ConditionProfile['thresholdStrategy'];
  cognitionConfig: ConditionProfile['cognitionConfig'];
  createdAt: string;
  updatedAt: string;
}

export class ConditionProfileService {
  private manager: ConditionProfileManager;

  constructor() {
    this.manager = new ConditionProfileManager();
  }

  /** 获取所有工况配置 */
  async listProfiles(filter?: { industry?: string; equipmentType?: string; enabled?: boolean }): Promise<ConditionProfileDTO[]> {
    const profiles = this.manager.queryProfiles(filter || {});
    return profiles.map((p: ConditionProfile) => this.toDTO(p));
  }

  /** 获取指定工况配置 */
  async getProfile(id: number): Promise<ConditionProfileDTO | null> {
    const profile = this.manager.getProfile(id);
    return profile ? this.toDTO(profile) : null;
  }

  /** 创建工况配置 */
  async createProfile(input: Partial<ConditionProfile>): Promise<ConditionProfileDTO> {
    const profile = this.manager.registerProfile(input);
    return this.toDTO(profile);
  }

  /** 更新工况配置 */
  async updateProfile(id: number, updates: Partial<ConditionProfile>): Promise<ConditionProfileDTO | null> {
    const existing = this.manager.getProfile(id);
    if (!existing) return null;

    // 更新字段
    if (updates.name) existing.name = updates.name;
    if (updates.description) existing.description = updates.description;
    if (updates.industry) existing.industry = updates.industry;
    if (updates.equipmentType) existing.equipmentType = updates.equipmentType;
    if (updates.thresholdStrategy) existing.thresholdStrategy = updates.thresholdStrategy;
    if (updates.cognitionConfig) existing.cognitionConfig = updates.cognitionConfig;
    if (updates.enabled !== undefined) existing.enabled = updates.enabled;
    existing.updatedAt = new Date();

    return this.toDTO(existing);
  }

  /** 删除工况配置 — 标记为禁用 */
  async deleteProfile(id: number): Promise<boolean> {
    const existing = this.manager.getProfile(id);
    if (!existing) return false;
    existing.enabled = false;
    return true;
  }

  /** 切换设备工况 */
  async switchCondition(
    machineId: string,
    profileId: number,
    trigger: 'auto_detection' | 'manual' | 'scheduler' | 'threshold_breach',
    initialPhase?: string,
  ): Promise<{ instanceId: number }> {
    const instance = this.manager.switchCondition(machineId, profileId, trigger, initialPhase);
    return { instanceId: instance.id };
  }

  /** 获取设备当前工况 */
  async getCurrentCondition(machineId: string): Promise<{ profile: ConditionProfileDTO; instanceId: number } | null> {
    const result = this.manager.getCurrentCondition(machineId);
    if (!result) return null;
    return {
      profile: this.toDTO(result.profile),
      instanceId: result.instance.id,
    };
  }

  /** 获取管理器实例（供内部模块使用） */
  getManager(): ConditionProfileManager {
    return this.manager;
  }

  // --------------------------------------------------------------------------
  // 内部方法
  // --------------------------------------------------------------------------

  private toDTO(profile: ConditionProfile): ConditionProfileDTO {
    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      industry: profile.industry,
      equipmentType: profile.equipmentType,
      version: profile.version,
      enabled: profile.enabled,
      parameters: profile.parameters,
      sensorMapping: profile.sensorMapping,
      thresholdStrategy: profile.thresholdStrategy,
      cognitionConfig: profile.cognitionConfig,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
