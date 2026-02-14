/**
 * ============================================================================
 * 设备类型注册中心
 * ============================================================================
 * 
 * 职责：
 *   1. 管理平台支持的设备类型（传感器、PLC、网关、机器人等）
 *   2. 定义每种设备类型的属性模型、指令集、遥测字段
 *   3. 支持运行时动态注册新设备类型（设备模板导入）
 *   4. 自动同步到前端设备管理界面
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';

// ============ 设备属性定义 ============

export interface DeviceProperty {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'datetime';
  unit?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  group?: string;
  writable?: boolean;
}

// ============ 设备指令定义 ============

export interface DeviceCommand {
  id: string;
  label: string;
  description: string;
  params?: Array<{
    name: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'enum';
    required?: boolean;
    default?: unknown;
    options?: Array<{ value: string; label: string }>;
  }>;
  /** 是否需要确认 */
  requireConfirm?: boolean;
  /** 危险等级 */
  dangerLevel?: 'safe' | 'warning' | 'danger';
}

// ============ 遥测字段定义 ============

export interface TelemetryField {
  name: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'json';
  unit?: string;
  /** 正常范围 */
  normalRange?: { min?: number; max?: number };
  /** 告警阈值 */
  alertThreshold?: { warning?: number; critical?: number };
  /** 采集频率（秒） */
  sampleIntervalSec?: number;
}

// ============ 设备类型注册项 ============

export interface DeviceTypeRegistryItem extends RegistryItemMeta {
  id: string;
  /** 设备大类 */
  deviceClass: 'sensor' | 'actuator' | 'controller' | 'gateway' | 'robot' | 'camera' | 'edge' | 'virtual';
  /** 支持的通信协议 */
  supportedProtocols: string[];
  /** 属性模型 */
  properties: DeviceProperty[];
  /** 指令集 */
  commands: DeviceCommand[];
  /** 遥测字段 */
  telemetry: TelemetryField[];
  /** 设备图片 URL */
  imageUrl?: string;
  /** 制造商 */
  manufacturer?: string;
  /** 型号 */
  model?: string;
}

// ============ 设备分类 ============

const DEVICE_CATEGORIES: CategoryMeta[] = [
  { id: 'sensor', label: '传感器', icon: '📡', order: 1, description: '温度、湿度、振动、压力等传感器', color: '#3B82F6' },
  { id: 'actuator', label: '执行器', icon: '⚡', order: 2, description: '电机、阀门、继电器等执行设备', color: '#EF4444' },
  { id: 'controller', label: '控制器', icon: '🎛️', order: 3, description: 'PLC、DCS、RTU 等控制设备', color: '#10B981' },
  { id: 'gateway', label: '网关', icon: '🌐', order: 4, description: '边缘网关、协议转换器', color: '#F59E0B' },
  { id: 'robot', label: '机器人', icon: '🤖', order: 5, description: '工业机器人、AGV、协作机器人', color: '#8B5CF6' },
  { id: 'camera', label: '视觉设备', icon: '📷', order: 6, description: '工业相机、视觉传感器', color: '#06B6D4' },
  { id: 'edge', label: '边缘设备', icon: '💻', order: 7, description: '边缘计算节点、工控机', color: '#64748B' },
  { id: 'virtual', label: '虚拟设备', icon: '🔮', order: 8, description: '数字孪生、仿真设备', color: '#EC4899' },
];

// ============ 内置设备类型 ============

const BUILTIN_DEVICE_TYPES: DeviceTypeRegistryItem[] = [
  {
    id: 'temperature_sensor', label: '温度传感器', icon: '🌡️',
    description: '工业温度传感器（PT100/PT1000/热电偶）',
    category: 'sensor', deviceClass: 'sensor',
    tags: ['temperature', 'pt100', 'thermocouple'],
    supportedProtocols: ['modbus', 'mqtt', 'opcua'],
    properties: [
      { name: 'sensorType', label: '传感器类型', type: 'enum', required: true, options: [
        { value: 'pt100', label: 'PT100' }, { value: 'pt1000', label: 'PT1000' },
        { value: 'thermocouple_k', label: '热电偶 K 型' }, { value: 'thermocouple_j', label: '热电偶 J 型' },
      ]},
      { name: 'measureRange', label: '量程', type: 'string', default: '-50~400°C' },
      { name: 'accuracy', label: '精度', type: 'string', default: '±0.5°C' },
      { name: 'installLocation', label: '安装位置', type: 'string', group: '安装信息' },
    ],
    commands: [
      { id: 'calibrate', label: '校准', description: '执行零点校准', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'reset', label: '复位', description: '恢复出厂设置', requireConfirm: true, dangerLevel: 'danger' },
    ],
    telemetry: [
      { name: 'temperature', label: '温度', type: 'number', unit: '°C', normalRange: { min: -50, max: 400 }, alertThreshold: { warning: 300, critical: 380 }, sampleIntervalSec: 1 },
      { name: 'resistance', label: '电阻值', type: 'number', unit: 'Ω', sampleIntervalSec: 5 },
    ],
  },
  {
    id: 'vibration_sensor', label: '振动传感器', icon: '📳',
    description: '工业振动传感器（加速度/速度/位移）',
    category: 'sensor', deviceClass: 'sensor',
    tags: ['vibration', 'acceleration', 'velocity'],
    supportedProtocols: ['modbus', 'mqtt', 'opcua'],
    properties: [
      { name: 'measureType', label: '测量类型', type: 'enum', required: true, options: [
        { value: 'acceleration', label: '加速度' }, { value: 'velocity', label: '速度' }, { value: 'displacement', label: '位移' },
      ]},
      { name: 'frequency', label: '频率范围', type: 'string', default: '10Hz~10kHz' },
      { name: 'sensitivity', label: '灵敏度', type: 'string', default: '100mV/g' },
      { name: 'axis', label: '测量轴', type: 'enum', default: 'triaxial', options: [
        { value: 'single', label: '单轴' }, { value: 'biaxial', label: '双轴' }, { value: 'triaxial', label: '三轴' },
      ]},
    ],
    commands: [
      { id: 'calibrate', label: '校准', description: '执行振动基线校准', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'set_threshold', label: '设置阈值', description: '设置振动告警阈值', params: [
        { name: 'warningLevel', label: '预警值', type: 'number', required: true },
        { name: 'criticalLevel', label: '报警值', type: 'number', required: true },
      ]},
    ],
    telemetry: [
      { name: 'vibration_x', label: 'X轴振动', type: 'number', unit: 'mm/s', normalRange: { min: 0, max: 10 }, alertThreshold: { warning: 7, critical: 10 }, sampleIntervalSec: 0.1 },
      { name: 'vibration_y', label: 'Y轴振动', type: 'number', unit: 'mm/s', normalRange: { min: 0, max: 10 }, sampleIntervalSec: 0.1 },
      { name: 'vibration_z', label: 'Z轴振动', type: 'number', unit: 'mm/s', normalRange: { min: 0, max: 10 }, sampleIntervalSec: 0.1 },
      { name: 'temperature', label: '传感器温度', type: 'number', unit: '°C', sampleIntervalSec: 10 },
    ],
  },
  {
    id: 'pressure_sensor', label: '压力传感器', icon: '🔴',
    description: '工业压力/差压传感器',
    category: 'sensor', deviceClass: 'sensor',
    tags: ['pressure', 'differential'],
    supportedProtocols: ['modbus', 'mqtt', 'opcua'],
    properties: [
      { name: 'pressureType', label: '压力类型', type: 'enum', required: true, options: [
        { value: 'gauge', label: '表压' }, { value: 'absolute', label: '绝对压力' }, { value: 'differential', label: '差压' },
      ]},
      { name: 'range', label: '量程', type: 'string', default: '0~10 MPa' },
      { name: 'output', label: '输出信号', type: 'enum', default: '4-20mA', options: [
        { value: '4-20mA', label: '4-20mA' }, { value: '0-10V', label: '0-10V' }, { value: 'digital', label: '数字' },
      ]},
    ],
    commands: [
      { id: 'zero', label: '零点校准', description: '执行零点校准', requireConfirm: true, dangerLevel: 'warning' },
    ],
    telemetry: [
      { name: 'pressure', label: '压力', type: 'number', unit: 'MPa', normalRange: { min: 0, max: 10 }, alertThreshold: { warning: 8, critical: 9.5 }, sampleIntervalSec: 1 },
    ],
  },
  {
    id: 'plc_controller', label: 'PLC 控制器', icon: '🎛️',
    description: '可编程逻辑控制器（Siemens/Allen-Bradley/Mitsubishi）',
    category: 'controller', deviceClass: 'controller',
    tags: ['plc', 'siemens', 'allen-bradley', 'mitsubishi'],
    supportedProtocols: ['opcua', 'modbus', 'mqtt'],
    properties: [
      { name: 'brand', label: '品牌', type: 'enum', required: true, options: [
        { value: 'siemens', label: 'Siemens' }, { value: 'allen_bradley', label: 'Allen-Bradley' },
        { value: 'mitsubishi', label: 'Mitsubishi' }, { value: 'schneider', label: 'Schneider' },
        { value: 'omron', label: 'Omron' }, { value: 'beckhoff', label: 'Beckhoff' },
      ]},
      { name: 'model', label: '型号', type: 'string', required: true, description: '如 S7-1500, CompactLogix' },
      { name: 'firmwareVersion', label: '固件版本', type: 'string' },
      { name: 'ioModules', label: 'I/O 模块数', type: 'number' },
      { name: 'programName', label: '运行程序', type: 'string' },
    ],
    commands: [
      { id: 'start', label: '启动', description: '启动 PLC 运行', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'stop', label: '停止', description: '停止 PLC 运行', requireConfirm: true, dangerLevel: 'danger' },
      { id: 'restart', label: '重启', description: '重启 PLC', requireConfirm: true, dangerLevel: 'danger' },
      { id: 'download', label: '下载程序', description: '下载 PLC 程序', requireConfirm: true, dangerLevel: 'danger',
        params: [{ name: 'programFile', label: '程序文件', type: 'string', required: true }],
      },
    ],
    telemetry: [
      { name: 'cpuLoad', label: 'CPU 负载', type: 'number', unit: '%', normalRange: { min: 0, max: 100 }, alertThreshold: { warning: 80, critical: 95 }, sampleIntervalSec: 5 },
      { name: 'memoryUsage', label: '内存使用', type: 'number', unit: '%', sampleIntervalSec: 10 },
      { name: 'cycleTime', label: '扫描周期', type: 'number', unit: 'ms', normalRange: { min: 1, max: 100 }, sampleIntervalSec: 5 },
      { name: 'runMode', label: '运行模式', type: 'string', sampleIntervalSec: 10 },
    ],
  },
  {
    id: 'edge_gateway', label: '边缘网关', icon: '🌐',
    description: '工业边缘网关（协议转换、数据聚合、边缘计算）',
    category: 'gateway', deviceClass: 'gateway',
    tags: ['gateway', 'edge', 'protocol-converter'],
    supportedProtocols: ['mqtt', 'http', 'opcua', 'modbus'],
    properties: [
      { name: 'gatewayType', label: '网关类型', type: 'enum', required: true, options: [
        { value: 'protocol', label: '协议转换网关' }, { value: 'compute', label: '边缘计算网关' },
        { value: 'aggregation', label: '数据聚合网关' }, { value: 'hybrid', label: '混合网关' },
      ]},
      { name: 'os', label: '操作系统', type: 'string', default: 'Linux' },
      { name: 'maxDevices', label: '最大接入设备数', type: 'number', default: 100 },
      { name: 'supportedDownstream', label: '下行协议', type: 'string', description: 'Modbus RTU, BACnet, CAN, etc.' },
      { name: 'supportedUpstream', label: '上行协议', type: 'string', description: 'MQTT, HTTP, OPC-UA' },
    ],
    commands: [
      { id: 'restart', label: '重启', description: '重启网关服务', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'update_firmware', label: '固件升级', description: 'OTA 固件升级', requireConfirm: true, dangerLevel: 'danger',
        params: [{ name: 'firmwareUrl', label: '固件 URL', type: 'string', required: true }],
      },
      { id: 'sync_config', label: '同步配置', description: '从平台同步最新配置', dangerLevel: 'safe' },
    ],
    telemetry: [
      { name: 'cpuUsage', label: 'CPU 使用率', type: 'number', unit: '%', normalRange: { min: 0, max: 100 }, alertThreshold: { warning: 80, critical: 95 }, sampleIntervalSec: 10 },
      { name: 'memoryUsage', label: '内存使用率', type: 'number', unit: '%', sampleIntervalSec: 10 },
      { name: 'diskUsage', label: '磁盘使用率', type: 'number', unit: '%', alertThreshold: { warning: 85, critical: 95 }, sampleIntervalSec: 60 },
      { name: 'connectedDevices', label: '已连接设备数', type: 'number', sampleIntervalSec: 30 },
      { name: 'dataRate', label: '数据吞吐量', type: 'number', unit: 'msg/s', sampleIntervalSec: 5 },
      { name: 'uptime', label: '运行时间', type: 'number', unit: 's', sampleIntervalSec: 60 },
    ],
  },
  {
    id: 'industrial_robot', label: '工业机器人', icon: '🦾',
    description: '工业机器人（六轴/SCARA/Delta/协作机器人）',
    category: 'robot', deviceClass: 'robot',
    tags: ['robot', 'arm', 'cobot', 'scara'],
    supportedProtocols: ['opcua', 'mqtt', 'http'],
    properties: [
      { name: 'robotType', label: '机器人类型', type: 'enum', required: true, options: [
        { value: '6axis', label: '六轴机器人' }, { value: 'scara', label: 'SCARA' },
        { value: 'delta', label: 'Delta' }, { value: 'cobot', label: '协作机器人' },
        { value: 'agv', label: 'AGV/AMR' },
      ]},
      { name: 'brand', label: '品牌', type: 'enum', options: [
        { value: 'fanuc', label: 'FANUC' }, { value: 'kuka', label: 'KUKA' },
        { value: 'abb', label: 'ABB' }, { value: 'yaskawa', label: 'Yaskawa' },
        { value: 'universal_robots', label: 'Universal Robots' }, { value: 'other', label: '其他' },
      ]},
      { name: 'payload', label: '负载', type: 'number', unit: 'kg' },
      { name: 'reach', label: '臂展', type: 'number', unit: 'mm' },
      { name: 'repeatability', label: '重复定位精度', type: 'string', default: '±0.05mm' },
    ],
    commands: [
      { id: 'home', label: '回原点', description: '机器人回到原点位置', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'start_program', label: '启动程序', description: '运行指定程序', requireConfirm: true, dangerLevel: 'warning',
        params: [{ name: 'programId', label: '程序编号', type: 'string', required: true }],
      },
      { id: 'stop', label: '停止', description: '停止当前运动', requireConfirm: false, dangerLevel: 'safe' },
      { id: 'emergency_stop', label: '急停', description: '紧急停止', requireConfirm: false, dangerLevel: 'danger' },
    ],
    telemetry: [
      { name: 'jointAngles', label: '关节角度', type: 'json', sampleIntervalSec: 0.1 },
      { name: 'tcpPosition', label: 'TCP 位置', type: 'json', sampleIntervalSec: 0.1 },
      { name: 'speed', label: '运行速度', type: 'number', unit: '%', normalRange: { min: 0, max: 100 }, sampleIntervalSec: 1 },
      { name: 'torque', label: '关节力矩', type: 'json', sampleIntervalSec: 1 },
      { name: 'programStatus', label: '程序状态', type: 'string', sampleIntervalSec: 5 },
      { name: 'cycleCount', label: '循环计数', type: 'number', sampleIntervalSec: 10 },
    ],
  },
  {
    id: 'industrial_camera', label: '工业相机', icon: '📷',
    description: '工业视觉相机（面阵/线阵/3D）',
    category: 'camera', deviceClass: 'camera',
    tags: ['camera', 'vision', 'inspection'],
    supportedProtocols: ['http', 'mqtt'],
    properties: [
      { name: 'cameraType', label: '相机类型', type: 'enum', required: true, options: [
        { value: 'area_scan', label: '面阵相机' }, { value: 'line_scan', label: '线阵相机' },
        { value: '3d', label: '3D 相机' }, { value: 'thermal', label: '热成像' },
      ]},
      { name: 'resolution', label: '分辨率', type: 'string', default: '1920x1080' },
      { name: 'frameRate', label: '帧率', type: 'number', unit: 'fps', default: 30 },
      { name: 'interface', label: '接口', type: 'enum', options: [
        { value: 'gige', label: 'GigE Vision' }, { value: 'usb3', label: 'USB3 Vision' },
        { value: 'cameralink', label: 'Camera Link' }, { value: 'coaxpress', label: 'CoaXPress' },
      ]},
    ],
    commands: [
      { id: 'trigger', label: '触发拍照', description: '手动触发一次拍照', dangerLevel: 'safe' },
      { id: 'set_exposure', label: '设置曝光', description: '调整曝光时间', params: [
        { name: 'exposureUs', label: '曝光时间(μs)', type: 'number', required: true },
      ], dangerLevel: 'safe' },
      { id: 'set_roi', label: '设置 ROI', description: '设置感兴趣区域', dangerLevel: 'safe' },
    ],
    telemetry: [
      { name: 'frameCount', label: '帧计数', type: 'number', sampleIntervalSec: 1 },
      { name: 'temperature', label: '传感器温度', type: 'number', unit: '°C', alertThreshold: { warning: 60, critical: 75 }, sampleIntervalSec: 10 },
      { name: 'status', label: '状态', type: 'string', sampleIntervalSec: 5 },
    ],
  },
  {
    id: 'digital_twin', label: '数字孪生体', icon: '🔮',
    description: '虚拟设备/数字孪生实例',
    category: 'virtual', deviceClass: 'virtual',
    tags: ['digital-twin', 'simulation', 'virtual'],
    supportedProtocols: ['mqtt', 'http', 'websocket'],
    properties: [
      { name: 'twinType', label: '孪生类型', type: 'enum', required: true, options: [
        { value: 'device', label: '设备孪生' }, { value: 'process', label: '工艺孪生' },
        { value: 'system', label: '系统孪生' }, { value: 'environment', label: '环境孪生' },
      ]},
      { name: 'physicalDeviceId', label: '物理设备 ID', type: 'string', description: '关联的物理设备' },
      { name: 'modelUrl', label: '3D 模型 URL', type: 'string', placeholder: '/models/device.glb' },
      { name: 'syncInterval', label: '同步间隔(s)', type: 'number', default: 1 },
      { name: 'simulationEnabled', label: '启用仿真', type: 'boolean', default: false },
    ],
    commands: [
      { id: 'sync', label: '立即同步', description: '从物理设备同步最新状态', dangerLevel: 'safe' },
      { id: 'start_simulation', label: '启动仿真', description: '启动数字孪生仿真', requireConfirm: true, dangerLevel: 'warning' },
      { id: 'stop_simulation', label: '停止仿真', description: '停止仿真', dangerLevel: 'safe' },
    ],
    telemetry: [
      { name: 'syncStatus', label: '同步状态', type: 'string', sampleIntervalSec: 5 },
      { name: 'lastSyncAt', label: '最后同步时间', type: 'string', sampleIntervalSec: 10 },
      { name: 'deviation', label: '偏差值', type: 'number', unit: '%', normalRange: { min: 0, max: 10 }, alertThreshold: { warning: 5, critical: 10 }, sampleIntervalSec: 5 },
    ],
  },
];

// ============ 创建并初始化注册中心实例 ============

class DeviceTypeRegistry extends BaseRegistry<DeviceTypeRegistryItem> {
  constructor() {
    super('DeviceTypeRegistry');
    this.registerCategories(DEVICE_CATEGORIES);
    this.registerAll(BUILTIN_DEVICE_TYPES);
  }

  /** 按设备大类查询 */
  getByDeviceClass(deviceClass: string): DeviceTypeRegistryItem[] {
    return this.listItems().filter(item => item.deviceClass === deviceClass);
  }

  /** 按支持的协议查询 */
  getByProtocol(protocol: string): DeviceTypeRegistryItem[] {
    return this.listItems().filter(item => item.supportedProtocols.includes(protocol));
  }

  /** 获取设备类型的指令集 */
  getCommands(deviceTypeId: string): DeviceCommand[] {
    return this.get(deviceTypeId)?.commands || [];
  }

  /** 获取设备类型的遥测字段 */
  getTelemetry(deviceTypeId: string): TelemetryField[] {
    return this.get(deviceTypeId)?.telemetry || [];
  }

  /** 获取设备类型的属性模型 */
  getProperties(deviceTypeId: string): DeviceProperty[] {
    return this.get(deviceTypeId)?.properties || [];
  }
}

// ============ 导出单例 ============

export const deviceTypeRegistry = new DeviceTypeRegistry();
