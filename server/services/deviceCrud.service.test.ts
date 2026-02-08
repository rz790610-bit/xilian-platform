/**
 * 设备管理 CRUD API 单元测试
 * 西联智能平台 - 设备生命周期管理测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DeviceCrudService,
  DeviceType,
  DeviceStatus,
  CreateDeviceInput,
  UpdateDeviceInput,
  DeviceFilter,
} from './deviceCrud.service';

// Mock 数据库
vi.mock('../db', () => ({
  getDb: vi.fn(() => null),
}));

// Mock 事件总线
vi.mock('../eventBus', () => ({
  eventBus: {
    publish: vi.fn().mockResolvedValue(undefined),
  },
  TOPICS: {
    DEVICE_STATUS: 'device.status',
  },
}));

describe('DeviceCrudService', () => {
  let service: DeviceCrudService;

  beforeEach(() => {
    service = new DeviceCrudService();
    vi.clearAllMocks();
  });

  // ============================================
  // 元数据测试
  // ============================================

  describe('元数据', () => {
    it('应该返回设备类型列表', () => {
      const types = service.getDeviceTypes();
      
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types.some(t => t.value === 'agv')).toBe(true);
      expect(types.some(t => t.value === 'rtg')).toBe(true);
      expect(types.some(t => t.value === 'plc')).toBe(true);
      
      // 检查结构
      for (const type of types) {
        expect(type).toHaveProperty('value');
        expect(type).toHaveProperty('label');
        expect(typeof type.value).toBe('string');
        expect(typeof type.label).toBe('string');
      }
    });

    it('应该返回设备状态列表', () => {
      const statuses = service.getDeviceStatuses();
      
      expect(Array.isArray(statuses)).toBe(true);
      expect(statuses.length).toBe(5);
      expect(statuses.some(s => s.value === 'online')).toBe(true);
      expect(statuses.some(s => s.value === 'offline')).toBe(true);
      expect(statuses.some(s => s.value === 'error')).toBe(true);
      
      // 检查结构
      for (const status of statuses) {
        expect(status).toHaveProperty('value');
        expect(status).toHaveProperty('label');
        expect(status).toHaveProperty('color');
      }
    });

    it('应该包含所有预期的设备类型', () => {
      const types = service.getDeviceTypes();
      const expectedTypes: DeviceType[] = [
        'agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor',
        'sensor_hub', 'gateway', 'plc', 'robot', 'camera',
        'rfid_reader', 'weighbridge', 'other'
      ];
      
      for (const expected of expectedTypes) {
        expect(types.some(t => t.value === expected)).toBe(true);
      }
    });

    it('应该包含所有预期的设备状态', () => {
      const statuses = service.getDeviceStatuses();
      const expectedStatuses: DeviceStatus[] = [
        'online', 'offline', 'maintenance', 'error', 'unknown'
      ];
      
      for (const expected of expectedStatuses) {
        expect(statuses.some(s => s.value === expected)).toBe(true);
      }
    });
  });

  // ============================================
  // 数据库不可用时的行为测试
  // ============================================

  describe('数据库不可用时的行为', () => {
    it('list 应该返回空分页结果', async () => {
      const result = await service.list();
      
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(0);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });

    it('getById 应该返回 null', async () => {
      const result = await service.getById('test-device');
      expect(result).toBeNull();
    });

    it('getStatistics 应该返回空统计', async () => {
      const result = await service.getStatistics();
      
      expect(result.total).toBe(0);
      expect(result.byStatus.online).toBe(0);
      expect(result.byStatus.offline).toBe(0);
      expect(result.onlineRate).toBe(0);
    });

    it('healthCheck 应该返回 null', async () => {
      const result = await service.healthCheck('test-device');
      expect(result).toBeNull();
    });

    it('healthCheckBatch 应该返回空数组', async () => {
      const result = await service.healthCheckBatch(['device1', 'device2']);
      expect(result).toEqual([]);
    });
  });

  // ============================================
  // 输入验证测试
  // ============================================

  describe('输入验证', () => {
    it('应该验证设备类型枚举', () => {
      const types = service.getDeviceTypes();
      const validTypes = types.map(t => t.value);
      
      expect(validTypes).toContain('agv');
      expect(validTypes).toContain('rtg');
      expect(validTypes).not.toContain('invalid_type');
    });

    it('应该验证设备状态枚举', () => {
      const statuses = service.getDeviceStatuses();
      const validStatuses = statuses.map(s => s.value);
      
      expect(validStatuses).toContain('online');
      expect(validStatuses).toContain('offline');
      expect(validStatuses).not.toContain('invalid_status');
    });
  });

  // ============================================
  // 分页参数测试
  // ============================================

  describe('分页参数', () => {
    it('应该使用默认分页参数', async () => {
      const result = await service.list();
      
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it('应该正确计算总页数', async () => {
      // 由于数据库不可用，总数为0
      const result = await service.list({}, { page: 1, pageSize: 10 });
      
      expect(result.totalPages).toBe(0);
      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(false);
    });
  });

  // ============================================
  // 过滤条件构建测试
  // ============================================

  describe('过滤条件', () => {
    it('应该支持单个类型过滤', async () => {
      const filter: DeviceFilter = { type: 'agv' };
      const result = await service.list(filter);
      
      // 数据库不可用，但应该正常返回空结果
      expect(result.items).toEqual([]);
    });

    it('应该支持多个类型过滤', async () => {
      const filter: DeviceFilter = { type: ['agv', 'rtg'] };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持状态过滤', async () => {
      const filter: DeviceFilter = { status: 'online' };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持搜索过滤', async () => {
      const filter: DeviceFilter = { search: 'test' };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持位置过滤', async () => {
      const filter: DeviceFilter = { location: 'A区' };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持部门过滤', async () => {
      const filter: DeviceFilter = { department: '生产部' };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持保修状态过滤', async () => {
      const filter: DeviceFilter = { hasWarranty: true };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });

    it('应该支持组合过滤', async () => {
      const filter: DeviceFilter = {
        type: 'agv',
        status: 'online',
        location: 'A区',
        search: 'test',
      };
      const result = await service.list(filter);
      
      expect(result.items).toEqual([]);
    });
  });

  // ============================================
  // 排序测试
  // ============================================

  describe('排序', () => {
    it('应该支持按名称排序', async () => {
      const result = await service.list({}, { sortBy: 'name', sortOrder: 'asc' });
      expect(result.items).toEqual([]);
    });

    it('应该支持按类型排序', async () => {
      const result = await service.list({}, { sortBy: 'type', sortOrder: 'asc' });
      expect(result.items).toEqual([]);
    });

    it('应该支持按状态排序', async () => {
      const result = await service.list({}, { sortBy: 'status', sortOrder: 'desc' });
      expect(result.items).toEqual([]);
    });

    it('应该支持按创建时间排序', async () => {
      const result = await service.list({}, { sortBy: 'createdAt', sortOrder: 'desc' });
      expect(result.items).toEqual([]);
    });

    it('应该支持按更新时间排序', async () => {
      const result = await service.list({}, { sortBy: 'updatedAt', sortOrder: 'desc' });
      expect(result.items).toEqual([]);
    });

    it('应该支持按心跳时间排序', async () => {
      const result = await service.list({}, { sortBy: 'lastHeartbeat', sortOrder: 'desc' });
      expect(result.items).toEqual([]);
    });
  });

  // ============================================
  // 批量操作结果格式测试
  // ============================================

  describe('批量操作结果格式', () => {
    it('批量创建应该返回正确的结果格式', async () => {
      const inputs: CreateDeviceInput[] = [
        { deviceId: 'test1', name: 'Test 1', type: 'agv' },
        { deviceId: 'test2', name: 'Test 2', type: 'rtg' },
      ];
      
      const result = await service.createBatch(inputs);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');
      expect(typeof result.success).toBe('number');
      expect(typeof result.failed).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('批量更新应该返回正确的结果格式', async () => {
      const result = await service.updateBatch(['device1', 'device2'], { name: 'Updated' });
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');
    });

    it('批量删除应该返回正确的结果格式', async () => {
      const result = await service.deleteBatch(['device1', 'device2']);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');
    });

    it('批量状态更新应该返回正确的结果格式', async () => {
      const result = await service.updateStatusBatch(['device1', 'device2'], 'online');
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('errors');
    });
  });

  // ============================================
  // 统计信息格式测试
  // ============================================

  describe('统计信息格式', () => {
    it('应该返回完整的统计信息结构', async () => {
      const stats = await service.getStatistics();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byStatus');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('byDepartment');
      expect(stats).toHaveProperty('onlineRate');
      expect(stats).toHaveProperty('warrantyExpiringSoon');
      expect(stats).toHaveProperty('recentlyOffline');
      
      // 检查 byStatus 结构
      expect(stats.byStatus).toHaveProperty('online');
      expect(stats.byStatus).toHaveProperty('offline');
      expect(stats.byStatus).toHaveProperty('maintenance');
      expect(stats.byStatus).toHaveProperty('error');
      expect(stats.byStatus).toHaveProperty('unknown');
    });
  });

  // ============================================
  // 健康检查结果格式测试
  // ============================================

  describe('健康检查结果格式', () => {
    it('批量健康检查应该返回数组', async () => {
      const result = await service.healthCheckBatch(['device1', 'device2']);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ============================================
// 类型测试
// ============================================

describe('类型定义', () => {
  it('DeviceType 应该包含所有预期值', () => {
    const validTypes: DeviceType[] = [
      'agv', 'rtg', 'qc', 'asc', 'conveyor', 'pump', 'motor',
      'sensor_hub', 'gateway', 'plc', 'robot', 'camera',
      'rfid_reader', 'weighbridge', 'other'
    ];
    
    // 类型检查 - 如果类型定义正确，这些赋值应该通过编译
    for (const type of validTypes) {
      const t: DeviceType = type;
      expect(t).toBe(type);
    }
  });

  it('DeviceStatus 应该包含所有预期值', () => {
    const validStatuses: DeviceStatus[] = [
      'online', 'offline', 'maintenance', 'error', 'unknown'
    ];
    
    for (const status of validStatuses) {
      const s: DeviceStatus = status;
      expect(s).toBe(status);
    }
  });
});

// ============================================
// 边界条件测试
// ============================================

describe('边界条件', () => {
  let service: DeviceCrudService;

  beforeEach(() => {
    service = new DeviceCrudService();
  });

  it('空过滤条件应该正常工作', async () => {
    const result = await service.list({});
    expect(result).toBeDefined();
  });

  it('空分页参数应该使用默认值', async () => {
    const result = await service.list({}, {});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('空设备ID数组的批量操作应该返回空结果', async () => {
    const result = await service.healthCheckBatch([]);
    expect(result).toEqual([]);
  });

  it('空标签数组过滤应该正常工作', async () => {
    const result = await service.list({ tags: [] });
    expect(result).toBeDefined();
  });
});
