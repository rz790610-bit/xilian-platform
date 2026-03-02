/**
 * ============================================================================
 * 统一编码注册表 — Seed Data
 * ============================================================================
 *
 * 基于用户现有编码规则体系，3 类编码：
 *
 *   设备主体编码 (4级):  [一级][二级]-[三级][四级流水号]
 *     示例: Mgj-XC001
 *     一级: M主要生产设备 / A辅助 / F设施 / W无形资产
 *     二级: gj固机 / lj流机 / lc流程 / cb船舶
 *     三级: MJ门机 / XC卸船机 / ZC装船机 / CQ场桥 / AQ岸桥
 *     四级: 001-999 流水号
 *
 *   部件编码 (在主体编码后追加):
 *     [主体编码][五级][六级][七级][流水号]
 *     示例: Mgj-XC001j010101
 *     五级: j主要机构 / s附属设备 / f附件 / g专用工具 / z随机资料
 *     六级: 01起升机构 02俯仰机构 03大车行走 04电气室 05门架 ...
 *     七级: 01起升电机 02减速箱 03卷筒 04制动器 05钢丝绳 ...
 *     流水号: 2位数字
 *
 *   部门编码 (5级):
 *     [地区3位][行业1位][集团2位][分公司2位][设备队2位]
 *     示例: 633G010204
 *     地区: 021上海 633日照 532青岛
 *     行业: G港口 S石化 J建材 Y冶金
 */

// ─── 类型定义 ─────────────────────────────────────────────────────────

export interface EncodingCategory {
  code: string;
  name: string;
  description: string;
  format: string;
  example: string;
  isSystem: 1;
}

export interface EncodingItem {
  categoryCode: string;
  code: string;
  label: string;
  value?: string;
  parentCode?: string;
  metadata?: Record<string, unknown>;
  sortOrder?: number;
}

// ─── 3 大编码类别 ─────────────────────────────────────────────────────

export const ENCODING_CATEGORIES: EncodingCategory[] = [
  {
    code: 'ENCODING_DEVICE',
    name: '设备主体编码',
    description: '设备主体编码 4 级: [一级资产属性][二级设备大类]-[三级设备小类][四级流水号]',
    format: '[MAFW][xx]-[XX][000]',
    example: 'Mgj-XC001',
    isSystem: 1,
  },
  {
    code: 'ENCODING_COMPONENT',
    name: '部件编码',
    description: '部件编码: [主体编码][五级部件属性][六级机构][七级部件][流水号]',
    format: '[主体编码][x][00][00][00]',
    example: 'Mgj-XC001j010101',
    isSystem: 1,
  },
  {
    code: 'ENCODING_DEPARTMENT',
    name: '部门编码',
    description: '部门编码 5 级: [地区3位][行业1位][集团2位][分公司2位][设备队2位]',
    format: '[000][X][00][00][00]',
    example: '633G010204',
    isSystem: 1,
  },
];

// ─── 设备主体编码有效值 ───────────────────────────────────────────────

const DEVICE_ITEMS: EncodingItem[] = [
  // === 一级：资产属性（1 位大写字母）===
  { categoryCode: 'ENCODING_DEVICE', code: 'M', label: '主要生产设备', sortOrder: 1, metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'A', label: '辅助生产设备', sortOrder: 2, metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'F', label: '设施',         sortOrder: 3, metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'W', label: '无形资产',     sortOrder: 4, metadata: { level: 1 } },

  // === 二级：设备大类（2 位小写字母）===
  { categoryCode: 'ENCODING_DEVICE', code: 'gj', label: '固定式起重机', parentCode: 'M', sortOrder: 1,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'lj', label: '流动式起重机', parentCode: 'M', sortOrder: 2,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'lc', label: '流程设备',     parentCode: 'M', sortOrder: 3,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'cb', label: '船舶',         parentCode: 'M', sortOrder: 4,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'ss', label: '输送设备',     parentCode: 'M', sortOrder: 5,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'cc', label: '仓储设备',     parentCode: 'M', sortOrder: 6,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'jt', label: '交通车辆',     parentCode: 'A', sortOrder: 7,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'dq', label: '电气设备',     parentCode: 'A', sortOrder: 8,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'gd', label: '管道设备',     parentCode: 'F', sortOrder: 9,  metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'jz', label: '建筑设施',     parentCode: 'F', sortOrder: 10, metadata: { level: 2 } },

  // === 三级：设备小类（2 位大写字母）— 港机核心设备 ===
  { categoryCode: 'ENCODING_DEVICE', code: 'AQ', label: '岸桥',       parentCode: 'gj', sortOrder: 1,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'CQ', label: '场桥',       parentCode: 'gj', sortOrder: 2,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'MJ', label: '门机',       parentCode: 'gj', sortOrder: 3,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'XC', label: '卸船机',     parentCode: 'gj', sortOrder: 4,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'ZC', label: '装船机',     parentCode: 'gj', sortOrder: 5,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'DG', label: '堆高机',     parentCode: 'gj', sortOrder: 6,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'ZM', label: '正面吊',     parentCode: 'lj', sortOrder: 7,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'CC', label: '叉车',       parentCode: 'lj', sortOrder: 8,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'QZ', label: '汽车吊',     parentCode: 'lj', sortOrder: 9,  metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'PD', label: '皮带机',     parentCode: 'ss', sortOrder: 10, metadata: { level: 3 } },
  { categoryCode: 'ENCODING_DEVICE', code: 'LX', label: '料斗',       parentCode: 'ss', sortOrder: 11, metadata: { level: 3 } },
];

// ─── 部件编码有效值 ───────────────────────────────────────────────────

const COMPONENT_ITEMS: EncodingItem[] = [
  // === 五级：部件属性（1 位小写字母）===
  { categoryCode: 'ENCODING_COMPONENT', code: 'j', label: '主要机构', sortOrder: 1, metadata: { level: 5 } },
  { categoryCode: 'ENCODING_COMPONENT', code: 's', label: '附属设备', sortOrder: 2, metadata: { level: 5 } },
  { categoryCode: 'ENCODING_COMPONENT', code: 'f', label: '附件',     sortOrder: 3, metadata: { level: 5 } },
  { categoryCode: 'ENCODING_COMPONENT', code: 'g', label: '专用工具', sortOrder: 4, metadata: { level: 5 } },
  { categoryCode: 'ENCODING_COMPONENT', code: 'z', label: '随机资料', sortOrder: 5, metadata: { level: 5 } },

  // === 六级：机构编号（2 位数字）===
  { categoryCode: 'ENCODING_COMPONENT', code: '01', label: '起升机构',   parentCode: 'j', sortOrder: 1,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '02', label: '俯仰机构',   parentCode: 'j', sortOrder: 2,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '03', label: '大车行走机构', parentCode: 'j', sortOrder: 3,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '04', label: '电气室',     parentCode: 'j', sortOrder: 4,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '05', label: '门架',       parentCode: 'j', sortOrder: 5,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '06', label: '小车行走机构', parentCode: 'j', sortOrder: 6,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '07', label: '回转机构',   parentCode: 'j', sortOrder: 7,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '08', label: '液压系统',   parentCode: 'j', sortOrder: 8,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '09', label: '抓斗/吊具', parentCode: 'j', sortOrder: 9,  metadata: { level: 6 } },
  { categoryCode: 'ENCODING_COMPONENT', code: '10', label: '臂架系统',   parentCode: 'j', sortOrder: 10, metadata: { level: 6 } },

  // === 七级：部件编号（2 位数字）— 起升机构下 ===
  { categoryCode: 'ENCODING_COMPONENT', code: '01_01', label: '起升电机',   parentCode: '01', sortOrder: 1, metadata: { level: 7, displayCode: '01' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_02', label: '减速箱',     parentCode: '01', sortOrder: 2, metadata: { level: 7, displayCode: '02' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_03', label: '卷筒',       parentCode: '01', sortOrder: 3, metadata: { level: 7, displayCode: '03' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_04', label: '制动器',     parentCode: '01', sortOrder: 4, metadata: { level: 7, displayCode: '04' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_05', label: '钢丝绳',     parentCode: '01', sortOrder: 5, metadata: { level: 7, displayCode: '05' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_06', label: '联轴器',     parentCode: '01', sortOrder: 6, metadata: { level: 7, displayCode: '06' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '01_07', label: '吊具/抓斗', parentCode: '01', sortOrder: 7, metadata: { level: 7, displayCode: '07' } },
  // === 七级：大车行走下 ===
  { categoryCode: 'ENCODING_COMPONENT', code: '03_01', label: '行走电机',   parentCode: '03', sortOrder: 1, metadata: { level: 7, displayCode: '01' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '03_02', label: '减速箱',     parentCode: '03', sortOrder: 2, metadata: { level: 7, displayCode: '02' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '03_03', label: '车轮组',     parentCode: '03', sortOrder: 3, metadata: { level: 7, displayCode: '03' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '03_04', label: '制动器',     parentCode: '03', sortOrder: 4, metadata: { level: 7, displayCode: '04' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '03_05', label: '轨道',       parentCode: '03', sortOrder: 5, metadata: { level: 7, displayCode: '05' } },
  // === 七级：俯仰机构下 ===
  { categoryCode: 'ENCODING_COMPONENT', code: '02_01', label: '俯仰电机',   parentCode: '02', sortOrder: 1, metadata: { level: 7, displayCode: '01' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '02_02', label: '减速箱',     parentCode: '02', sortOrder: 2, metadata: { level: 7, displayCode: '02' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '02_03', label: '齿条/油缸', parentCode: '02', sortOrder: 3, metadata: { level: 7, displayCode: '03' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '02_04', label: '制动器',     parentCode: '02', sortOrder: 4, metadata: { level: 7, displayCode: '04' } },
  // === 七级：电气室下 ===
  { categoryCode: 'ENCODING_COMPONENT', code: '04_01', label: '变频器',     parentCode: '04', sortOrder: 1, metadata: { level: 7, displayCode: '01' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '04_02', label: 'PLC',        parentCode: '04', sortOrder: 2, metadata: { level: 7, displayCode: '02' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '04_03', label: '变压器',     parentCode: '04', sortOrder: 3, metadata: { level: 7, displayCode: '03' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '04_04', label: '电缆',       parentCode: '04', sortOrder: 4, metadata: { level: 7, displayCode: '04' } },
  { categoryCode: 'ENCODING_COMPONENT', code: '04_05', label: '集电器',     parentCode: '04', sortOrder: 5, metadata: { level: 7, displayCode: '05' } },
];

// ─── 部门编码有效值 ───────────────────────────────────────────────────

const DEPARTMENT_ITEMS: EncodingItem[] = [
  // === 地区编码（3 位数字）===
  { categoryCode: 'ENCODING_DEPARTMENT', code: '021', label: '上海', sortOrder: 1,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '633', label: '日照', sortOrder: 2,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '532', label: '青岛', sortOrder: 3,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '022', label: '天津', sortOrder: 4,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '020', label: '广州', sortOrder: 5,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '755', label: '深圳', sortOrder: 6,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '574', label: '宁波', sortOrder: 7,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '592', label: '厦门', sortOrder: 8,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '411', label: '大连', sortOrder: 9,  metadata: { level: 1 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: '539', label: '连云港', sortOrder: 10, metadata: { level: 1 } },

  // === 行业编码（1 位大写字母）===
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'G', label: '港口', sortOrder: 1, metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'S', label: '石化', sortOrder: 2, metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'J', label: '建材', sortOrder: 3, metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'Y', label: '冶金', sortOrder: 4, metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'D', label: '电力', sortOrder: 5, metadata: { level: 2 } },
  { categoryCode: 'ENCODING_DEPARTMENT', code: 'W', label: '物流', sortOrder: 6, metadata: { level: 2 } },
];

// ─── 汇总导出 ─────────────────────────────────────────────────────────

export const ALL_ENCODING_ITEMS: EncodingItem[] = [
  ...DEVICE_ITEMS,
  ...COMPONENT_ITEMS,
  ...DEPARTMENT_ITEMS,
];

/** 按 categoryCode 分组的快捷访问 */
export const ENCODING_ITEMS_BY_CATEGORY: Record<string, EncodingItem[]> = {
  ENCODING_DEVICE: DEVICE_ITEMS,
  ENCODING_COMPONENT: COMPONENT_ITEMS,
  ENCODING_DEPARTMENT: DEPARTMENT_ITEMS,
};
