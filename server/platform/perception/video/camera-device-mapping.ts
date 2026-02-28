/**
 * ============================================================================
 * 摄像头-设备映射表 — 三向映射管理
 * ============================================================================
 *
 * 核心能力：
 *   1. 三向映射：摄像头编号 ↔ 设备编码 ↔ 监控区域
 *   2. 一台设备对应多个摄像头角度（多视角覆盖）
 *   3. 基于 4 段式设备编码匹配（KNOWLEDGE_ARCHITECTURE.md §2）
 *   4. 动态注册和查询
 *
 * 映射模型：
 *
 *   Camera(N) ←→ Equipment(1)
 *   Camera(1) ←→ Zone(1)
 *   Equipment(1) ←→ Zone(N)
 *
 *   典型场景：
 *     RTG-001 的起升电机 (HOIST.MOTOR) 由 2 个摄像头覆盖：
 *       - CAM-001: 驱动端侧视（角度 A）
 *       - CAM-002: 非驱动端俯视（角度 B）
 *
 * 与其他模块的关系：
 *   - video-event-trigger.ts: 查询映射，确定触发哪个摄像头
 *   - hikvision.adapter.ts: 获取摄像头通道 ID
 *   - sensor-mapping.json: 设备编码和传感器的关联
 */

import { createModuleLogger } from '../../../core/logger';

const log = createModuleLogger('camera-device-mapping');

// ============================================================================
// 类型定义
// ============================================================================

/** 摄像头定义 */
export interface CameraDefinition {
  /** 摄像头唯一 ID（平台内部编号） */
  cameraId: string;
  /** 摄像头名称（人类可读） */
  name: string;
  /** 海康 NVR/IPC 连接标识（对应 hikvision adapter 的 connector ID） */
  connectorId: string;
  /** 海康通道号 */
  channelId: number;
  /** 码流偏好 */
  preferredStream: 'main' | 'sub';
  /** 安装位置描述 */
  position: string;
  /** 视角类型 */
  viewAngle: CameraViewAngle;
  /** PTZ 支持 */
  ptzCapable: boolean;
  /** 是否启用 */
  enabled: boolean;
}

/** 摄像头视角类型 */
export type CameraViewAngle =
  | 'side_de'      // 驱动端侧视
  | 'side_nde'     // 非驱动端侧视
  | 'top_down'     // 俯视
  | 'front'        // 正视
  | 'wide_angle'   // 广角全景
  | 'close_up'     // 特写
  | 'ptz_patrol';  // PTZ 巡航

/** 监控区域定义 */
export interface MonitoringZone {
  /** 区域唯一 ID */
  zoneId: string;
  /** 区域名称 */
  name: string;
  /** 区域描述 */
  description: string;
  /** 关联的设备编码列表（4 段式编码，如 "TROLLEY.HOIST.MOTOR"） */
  componentCodes: string[];
  /** 关联的传感器 ID 列表 */
  sensorIds: string[];
  /** 区域优先级（用于资源竞争时的摄像头分配） */
  priority: number;
}

/** 摄像头-设备映射条目 */
export interface CameraDeviceMapping {
  /** 摄像头 ID */
  cameraId: string;
  /** 设备编码（4 段式） */
  componentCode: string;
  /** 监控区域 ID */
  zoneId: string;
  /** 该摄像头对该设备的覆盖质量 (0-1)，1=最佳角度 */
  coverageQuality: number;
  /** 该摄像头视角下可观测的故障类型 */
  observableFaults: string[];
  /** 推荐的抓拍/录像预设 */
  capturePreset?: CapturePreset;
}

/** 抓拍预设 */
export interface CapturePreset {
  /** 抓拍前缓冲秒数 */
  preBufferSec: number;
  /** 抓拍后延续秒数 */
  postBufferSec: number;
  /** 使用主码流还是子码流 */
  streamType: 'main' | 'sub';
  /** 是否同时抓拍快照 */
  captureSnapshot: boolean;
  /** PTZ 预设位（如果摄像头支持 PTZ） */
  ptzPresetId?: number;
}

/** 查询结果 */
export interface CameraLookupResult {
  /** 匹配的摄像头列表（按覆盖质量降序） */
  cameras: Array<CameraDefinition & { mapping: CameraDeviceMapping }>;
  /** 关联的监控区域 */
  zone: MonitoringZone | null;
}

// ============================================================================
// 摄像头-设备映射注册表
// ============================================================================

export class CameraDeviceMappingRegistry {
  /** 摄像头定义表 */
  private cameras: Map<string, CameraDefinition> = new Map();
  /** 监控区域表 */
  private zones: Map<string, MonitoringZone> = new Map();
  /** 映射关系表 */
  private mappings: CameraDeviceMapping[] = [];

  // 反向索引
  /** componentCode → CameraDeviceMapping[] */
  private byComponent: Map<string, CameraDeviceMapping[]> = new Map();
  /** cameraId → CameraDeviceMapping[] */
  private byCamera: Map<string, CameraDeviceMapping[]> = new Map();
  /** zoneId → CameraDeviceMapping[] */
  private byZone: Map<string, CameraDeviceMapping[]> = new Map();

  constructor() {
    log.info('摄像头-设备映射注册表初始化');
  }

  // --------------------------------------------------------------------------
  // 注册
  // --------------------------------------------------------------------------

  /** 注册摄像头 */
  registerCamera(camera: CameraDefinition): void {
    this.cameras.set(camera.cameraId, camera);
    log.info({ cameraId: camera.cameraId, name: camera.name }, '摄像头已注册');
  }

  /** 批量注册摄像头 */
  registerCameras(cameras: CameraDefinition[]): void {
    for (const c of cameras) this.registerCamera(c);
  }

  /** 注册监控区域 */
  registerZone(zone: MonitoringZone): void {
    this.zones.set(zone.zoneId, zone);
    log.info({ zoneId: zone.zoneId, name: zone.name, components: zone.componentCodes.length }, '监控区域已注册');
  }

  /** 批量注册监控区域 */
  registerZones(zones: MonitoringZone[]): void {
    for (const z of zones) this.registerZone(z);
  }

  /** 添加映射关系 */
  addMapping(mapping: CameraDeviceMapping): void {
    this.mappings.push(mapping);
    this.rebuildIndex(mapping);
  }

  /** 批量添加映射 */
  addMappings(mappings: CameraDeviceMapping[]): void {
    for (const m of mappings) this.addMapping(m);
  }

  // --------------------------------------------------------------------------
  // 查询（核心接口）
  // --------------------------------------------------------------------------

  /**
   * 根据设备编码查找覆盖该设备的摄像头
   *
   * 支持前缀匹配：查 "TROLLEY.HOIST" 会返回覆盖
   * "TROLLEY.HOIST.MOTOR"、"TROLLEY.HOIST.GBX" 等子组件的摄像头。
   *
   * @param componentCode 4 段式设备编码
   * @returns 匹配的摄像头列表（按覆盖质量降序）
   */
  findCamerasByComponent(componentCode: string): CameraLookupResult {
    const results: Array<CameraDefinition & { mapping: CameraDeviceMapping }> = [];
    const seenCameras = new Set<string>();

    // 精确匹配
    const exact = this.byComponent.get(componentCode) ?? [];
    for (const m of exact) {
      const cam = this.cameras.get(m.cameraId);
      if (cam && cam.enabled && !seenCameras.has(cam.cameraId)) {
        results.push({ ...cam, mapping: m });
        seenCameras.add(cam.cameraId);
      }
    }

    // 前缀匹配（输入是父级编码时，查找所有子级的映射）
    for (const [code, maps] of this.byComponent.entries()) {
      if (code !== componentCode && code.startsWith(componentCode + '.')) {
        for (const m of maps) {
          const cam = this.cameras.get(m.cameraId);
          if (cam && cam.enabled && !seenCameras.has(cam.cameraId)) {
            results.push({ ...cam, mapping: m });
            seenCameras.add(cam.cameraId);
          }
        }
      }
    }

    // 反向前缀匹配（输入是子级编码时，查找父级的映射）
    for (const [code, maps] of this.byComponent.entries()) {
      if (code !== componentCode && componentCode.startsWith(code + '.')) {
        for (const m of maps) {
          const cam = this.cameras.get(m.cameraId);
          if (cam && cam.enabled && !seenCameras.has(cam.cameraId)) {
            // 父级映射覆盖质量打折
            results.push({ ...cam, mapping: { ...m, coverageQuality: m.coverageQuality * 0.7 } });
            seenCameras.add(cam.cameraId);
          }
        }
      }
    }

    // 按覆盖质量降序排列
    results.sort((a, b) => b.mapping.coverageQuality - a.mapping.coverageQuality);

    // 查找关联区域
    const zone = this.findZoneByComponent(componentCode);

    return { cameras: results, zone };
  }

  /**
   * 根据传感器 ID 查找关联摄像头
   *
   * 通过 MonitoringZone 的 sensorIds 关联。
   */
  findCamerasBySensor(sensorId: string): CameraLookupResult {
    // 找到包含该传感器的区域
    for (const zone of this.zones.values()) {
      if (zone.sensorIds.includes(sensorId)) {
        // 该区域关联的所有组件编码
        const results: Array<CameraDefinition & { mapping: CameraDeviceMapping }> = [];
        const seenCameras = new Set<string>();

        for (const code of zone.componentCodes) {
          const lookup = this.findCamerasByComponent(code);
          for (const cam of lookup.cameras) {
            if (!seenCameras.has(cam.cameraId)) {
              results.push(cam);
              seenCameras.add(cam.cameraId);
            }
          }
        }

        results.sort((a, b) => b.mapping.coverageQuality - a.mapping.coverageQuality);
        return { cameras: results, zone };
      }
    }

    return { cameras: [], zone: null };
  }

  /**
   * 根据摄像头 ID 查找它监控的所有设备
   */
  findComponentsByCamera(cameraId: string): { componentCodes: string[]; zones: MonitoringZone[] } {
    const maps = this.byCamera.get(cameraId) ?? [];
    const codes = maps.map(m => m.componentCode);
    const zoneIds = new Set(maps.map(m => m.zoneId));
    const zones = [...zoneIds].map(id => this.zones.get(id)).filter(Boolean) as MonitoringZone[];
    return { componentCodes: codes, zones };
  }

  /**
   * 根据区域 ID 查找所有摄像头
   */
  findCamerasByZone(zoneId: string): CameraDefinition[] {
    const maps = this.byZone.get(zoneId) ?? [];
    return maps
      .map(m => this.cameras.get(m.cameraId))
      .filter((c): c is CameraDefinition => !!c && c.enabled);
  }

  // --------------------------------------------------------------------------
  // 获取抓拍预设
  // --------------------------------------------------------------------------

  /**
   * 获取针对特定设备组件的最佳抓拍方案
   *
   * 返回覆盖质量最高的摄像头及其抓拍预设。
   */
  getBestCaptureConfig(componentCode: string): {
    camera: CameraDefinition;
    preset: CapturePreset;
    mapping: CameraDeviceMapping;
  } | null {
    const lookup = this.findCamerasByComponent(componentCode);
    if (lookup.cameras.length === 0) return null;

    const best = lookup.cameras[0];
    const preset = best.mapping.capturePreset ?? {
      preBufferSec: 10,
      postBufferSec: 30,
      streamType: best.preferredStream,
      captureSnapshot: true,
    };

    return { camera: best, preset, mapping: best.mapping };
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  private findZoneByComponent(componentCode: string): MonitoringZone | null {
    for (const zone of this.zones.values()) {
      for (const code of zone.componentCodes) {
        if (code === componentCode || componentCode.startsWith(code + '.') || code.startsWith(componentCode + '.')) {
          return zone;
        }
      }
    }
    return null;
  }

  private rebuildIndex(mapping: CameraDeviceMapping): void {
    // byComponent
    if (!this.byComponent.has(mapping.componentCode)) {
      this.byComponent.set(mapping.componentCode, []);
    }
    this.byComponent.get(mapping.componentCode)!.push(mapping);

    // byCamera
    if (!this.byCamera.has(mapping.cameraId)) {
      this.byCamera.set(mapping.cameraId, []);
    }
    this.byCamera.get(mapping.cameraId)!.push(mapping);

    // byZone
    if (!this.byZone.has(mapping.zoneId)) {
      this.byZone.set(mapping.zoneId, []);
    }
    this.byZone.get(mapping.zoneId)!.push(mapping);
  }

  /** 获取统计信息 */
  getStats(): {
    cameraCount: number;
    zoneCount: number;
    mappingCount: number;
    enabledCameras: number;
  } {
    return {
      cameraCount: this.cameras.size,
      zoneCount: this.zones.size,
      mappingCount: this.mappings.length,
      enabledCameras: [...this.cameras.values()].filter(c => c.enabled).length,
    };
  }

  /** 获取所有摄像头 */
  getAllCameras(): CameraDefinition[] {
    return [...this.cameras.values()];
  }

  /** 获取所有区域 */
  getAllZones(): MonitoringZone[] {
    return [...this.zones.values()];
  }

  /** 获取摄像头 */
  getCamera(cameraId: string): CameraDefinition | undefined {
    return this.cameras.get(cameraId);
  }
}

// ============================================================================
// 预置的 RTG 小车总成摄像头映射
// ============================================================================

/**
 * 创建 RTG 标准摄像头布局映射
 *
 * 典型 RTG 小车总成监控布局：
 *   - 2 个摄像头覆盖起升机构（电机+减速器）
 *   - 1 个摄像头覆盖小车运行机构
 *   - 1 个广角摄像头覆盖钢丝绳区域
 *   - 1 个 PTZ 巡航摄像头覆盖全车
 */
export function createRtgTrolleyCameraMapping(
  nvrConnectorId: string,
): CameraDeviceMappingRegistry {
  const registry = new CameraDeviceMappingRegistry();

  // 摄像头定义
  registry.registerCameras([
    {
      cameraId: 'CAM-T01', name: '起升电机侧视', connectorId: nvrConnectorId,
      channelId: 1, preferredStream: 'main', position: '小车起升电机驱动端侧面',
      viewAngle: 'side_de', ptzCapable: false, enabled: true,
    },
    {
      cameraId: 'CAM-T02', name: '起升减速器俯视', connectorId: nvrConnectorId,
      channelId: 2, preferredStream: 'main', position: '小车起升减速器上方',
      viewAngle: 'top_down', ptzCapable: false, enabled: true,
    },
    {
      cameraId: 'CAM-T03', name: '运行机构侧视', connectorId: nvrConnectorId,
      channelId: 3, preferredStream: 'main', position: '小车运行电机及车轮侧面',
      viewAngle: 'side_de', ptzCapable: false, enabled: true,
    },
    {
      cameraId: 'CAM-T04', name: '钢丝绳区域广角', connectorId: nvrConnectorId,
      channelId: 4, preferredStream: 'sub', position: '钢丝绳缠绕区域广角',
      viewAngle: 'wide_angle', ptzCapable: false, enabled: true,
    },
    {
      cameraId: 'CAM-T05', name: '小车全景巡航', connectorId: nvrConnectorId,
      channelId: 5, preferredStream: 'sub', position: '小车顶部 PTZ 球机',
      viewAngle: 'ptz_patrol', ptzCapable: true, enabled: true,
    },
  ]);

  // 监控区域
  registry.registerZones([
    {
      zoneId: 'ZONE-HOIST', name: '起升机构区域', description: '起升电机、减速器、卷筒',
      componentCodes: ['TROLLEY.HOIST', 'TROLLEY.HOIST.DRUM', 'TROLLEY.HOIST.BEARING_SEAT'],
      sensorIds: ['VT-01', 'VT-02', 'VT-03', 'VT-04', 'VT-05', 'VT-06'],
      priority: 1,
    },
    {
      zoneId: 'ZONE-TRAVEL', name: '运行机构区域', description: '小车电机、减速器、车轮',
      componentCodes: ['TROLLEY.TRAVEL', 'TROLLEY.TRAVEL.WHEEL_ASSY', 'TROLLEY.TRAVEL.GBX_MOUNT'],
      sensorIds: ['VT-07', 'VT-08', 'VT-09', 'VT-10', 'VT-11'],
      priority: 2,
    },
    {
      zoneId: 'ZONE-ROPE', name: '钢丝绳区域', description: '钢丝绳、滑轮组、张紧装置',
      componentCodes: ['TROLLEY.ROPE'],
      sensorIds: [],
      priority: 3,
    },
  ]);

  // 映射关系
  registry.addMappings([
    // 起升区域
    {
      cameraId: 'CAM-T01', componentCode: 'TROLLEY.HOIST', zoneId: 'ZONE-HOIST',
      coverageQuality: 0.9, observableFaults: ['misalignment', 'bearing_wear', 'oil_leak', 'smoke'],
      capturePreset: { preBufferSec: 10, postBufferSec: 30, streamType: 'main', captureSnapshot: true },
    },
    {
      cameraId: 'CAM-T02', componentCode: 'TROLLEY.HOIST.DRUM', zoneId: 'ZONE-HOIST',
      coverageQuality: 0.85, observableFaults: ['rope_disorder', 'drum_crack', 'bearing_overheat'],
      capturePreset: { preBufferSec: 5, postBufferSec: 20, streamType: 'main', captureSnapshot: true },
    },
    {
      cameraId: 'CAM-T02', componentCode: 'TROLLEY.HOIST.BEARING_SEAT', zoneId: 'ZONE-HOIST',
      coverageQuality: 0.7, observableFaults: ['bearing_overheat', 'oil_leak'],
    },
    // 运行区域
    {
      cameraId: 'CAM-T03', componentCode: 'TROLLEY.TRAVEL', zoneId: 'ZONE-TRAVEL',
      coverageQuality: 0.85, observableFaults: ['wheel_wear', 'brake_smoke', 'coupling_misalign'],
      capturePreset: { preBufferSec: 10, postBufferSec: 30, streamType: 'main', captureSnapshot: true },
    },
    {
      cameraId: 'CAM-T03', componentCode: 'TROLLEY.TRAVEL.WHEEL_ASSY', zoneId: 'ZONE-TRAVEL',
      coverageQuality: 0.9, observableFaults: ['wheel_flat', 'bearing_wear', 'rail_damage'],
    },
    // 钢丝绳区域
    {
      cameraId: 'CAM-T04', componentCode: 'TROLLEY.ROPE', zoneId: 'ZONE-ROPE',
      coverageQuality: 0.8, observableFaults: ['rope_broken_wire', 'rope_disorder', 'sheave_wear'],
      capturePreset: { preBufferSec: 5, postBufferSec: 15, streamType: 'sub', captureSnapshot: true },
    },
    // 全景巡航覆盖所有区域（低质量备选）
    {
      cameraId: 'CAM-T05', componentCode: 'TROLLEY.HOIST', zoneId: 'ZONE-HOIST',
      coverageQuality: 0.4, observableFaults: ['smoke', 'fire'],
      capturePreset: { preBufferSec: 10, postBufferSec: 60, streamType: 'sub', captureSnapshot: true, ptzPresetId: 1 },
    },
    {
      cameraId: 'CAM-T05', componentCode: 'TROLLEY.TRAVEL', zoneId: 'ZONE-TRAVEL',
      coverageQuality: 0.3, observableFaults: ['smoke', 'fire'],
      capturePreset: { preBufferSec: 10, postBufferSec: 60, streamType: 'sub', captureSnapshot: true, ptzPresetId: 2 },
    },
  ]);

  log.info(registry.getStats(), 'RTG 小车总成摄像头映射已创建');
  return registry;
}
