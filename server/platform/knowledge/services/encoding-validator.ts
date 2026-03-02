/**
 * ============================================================================
 * 统一编码校验服务
 * ============================================================================
 *
 * 基于用户现有编码规则体系，校验 3 类编码：
 *
 *   设备主体编码:  [一级][二级]-[三级][四级流水号]    如 Mgj-XC001
 *   部件编码:      [主体编码][五级][六级][七级][流水]  如 Mgj-XC001j010101
 *   部门编码:      [地区3][行业1][集团2][分公司2][队2] 如 633G010204
 *
 * 模式：单例 + get/reset 工厂函数（CLAUDE.md §9 / ARCH-002）
 */

import {
  ENCODING_CATEGORIES,
  ENCODING_ITEMS_BY_CATEGORY,
} from '../seed-data/encoding-seed';

// ─── 编码类型 ─────────────────────────────────────────────────────────

export type EncodingType = 'device' | 'component' | 'department';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  /** 解析后的各级编码值 */
  parsed?: Record<string, string>;
}

// ─── 正则定义 ─────────────────────────────────────────────────────────

/**
 * 设备主体编码: [MAFW][2位小写]-[2位大写][3位数字]
 * 示例: Mgj-XC001, Alj-ZM002, Fgd-PD010
 */
const DEVICE_REGEX = /^[MAFW][a-z]{2}-[A-Z]{2}\d{3}$/;

/**
 * 部件编码: [设备主体编码][jsfgz][2位数字][2位数字][2位数字]
 * 示例: Mgj-XC001j010101
 */
const COMPONENT_REGEX = /^[MAFW][a-z]{2}-[A-Z]{2}\d{3}[jsfgz]\d{2}\d{2}\d{2}$/;

/**
 * 部门编码: [3位数字][GSJYDW][2位数字][2位数字][2位数字]
 * 示例: 633G010204
 */
const DEPARTMENT_REGEX = /^\d{3}[A-Z]\d{2}\d{2}\d{2}$/;

const ENCODING_REGEX: Record<EncodingType, RegExp> = {
  device: DEVICE_REGEX,
  component: COMPONENT_REGEX,
  department: DEPARTMENT_REGEX,
};

// ─── 有效值集合（从 seed 构建）───────────────────────────────────────

function buildLevelSet(categoryCode: string, level: number): Set<string> {
  const items = ENCODING_ITEMS_BY_CATEGORY[categoryCode] ?? [];
  return new Set(
    items
      .filter(i => (i.metadata?.level as number) === level)
      .map(i => i.code)
  );
}

function buildLabelMap(categoryCode: string, level: number): Map<string, string> {
  const items = ENCODING_ITEMS_BY_CATEGORY[categoryCode] ?? [];
  return new Map(
    items
      .filter(i => (i.metadata?.level as number) === level)
      .map(i => [i.code, i.label])
  );
}

// ─── 校验服务类 ───────────────────────────────────────────────────────

export class EncodingValidator {
  // 设备编码有效值
  private readonly deviceL1: Set<string>; // M/A/F/W
  private readonly deviceL2: Set<string>; // gj/lj/lc/cb/ss/cc/jt/dq/gd/jz
  private readonly deviceL3: Set<string>; // AQ/CQ/MJ/XC/ZC/DG/ZM/CC/QZ/PD/LX

  // 部件编码有效值
  private readonly compL5: Set<string>;   // j/s/f/g/z
  private readonly compL6: Set<string>;   // 01-10
  private readonly compL7Codes: Set<string>; // 七级 displayCode 集合

  // 部门编码有效值
  private readonly deptRegion: Set<string>;   // 021/633/532/...
  private readonly deptIndustry: Set<string>; // G/S/J/Y/D/W

  // 标签映射（用于返回友好错误信息）
  private readonly deviceL1Labels: Map<string, string>;
  private readonly deviceL3Labels: Map<string, string>;

  constructor() {
    this.deviceL1 = buildLevelSet('ENCODING_DEVICE', 1);
    this.deviceL2 = buildLevelSet('ENCODING_DEVICE', 2);
    this.deviceL3 = buildLevelSet('ENCODING_DEVICE', 3);
    this.compL5 = buildLevelSet('ENCODING_COMPONENT', 5);
    this.compL6 = buildLevelSet('ENCODING_COMPONENT', 6);

    // 七级编码使用 displayCode（01-07 等）
    const compItems = ENCODING_ITEMS_BY_CATEGORY['ENCODING_COMPONENT'] ?? [];
    this.compL7Codes = new Set(
      compItems
        .filter(i => (i.metadata?.level as number) === 7)
        .map(i => (i.metadata?.displayCode as string) ?? '')
        .filter(Boolean)
    );

    this.deptRegion = buildLevelSet('ENCODING_DEPARTMENT', 1);
    this.deptIndustry = buildLevelSet('ENCODING_DEPARTMENT', 2);

    this.deviceL1Labels = buildLabelMap('ENCODING_DEVICE', 1);
    this.deviceL3Labels = buildLabelMap('ENCODING_DEVICE', 3);
  }

  /**
   * 校验编码
   */
  validate(type: EncodingType, code: string): ValidationResult {
    if (!code || typeof code !== 'string') {
      return { valid: false, errors: ['编码不能为空'] };
    }

    switch (type) {
      case 'device': return this.validateDevice(code);
      case 'component': return this.validateComponent(code);
      case 'department': return this.validateDepartment(code);
      default:
        return { valid: false, errors: [`未知编码类型: ${type}`] };
    }
  }

  /**
   * 校验设备主体编码
   * 格式: [MAFW][xx]-[XX][000]
   */
  private validateDevice(code: string): ValidationResult {
    const errors: string[] = [];

    // 1. 正则格式校验
    if (!DEVICE_REGEX.test(code)) {
      errors.push(`格式不匹配，正确格式: [MAFW][2位小写]-[2位大写][3位数字]，示例: Mgj-XC001`);
      return { valid: false, errors };
    }

    // 2. 解析各级
    const level1 = code[0];                      // M
    const level2 = code.substring(1, 3);          // gj
    const level3 = code.substring(4, 6);          // XC
    const level4 = code.substring(6, 9);          // 001

    const parsed = { level1, level2, level3, level4 };

    // 3. 一级有效值校验
    if (!this.deviceL1.has(level1)) {
      errors.push(`一级编码 "${level1}" 无效，有效值: ${Array.from(this.deviceL1).join('/')}`);
    }

    // 4. 二级有效值校验
    if (!this.deviceL2.has(level2)) {
      errors.push(`二级编码 "${level2}" 无效，有效值: ${Array.from(this.deviceL2).join('/')}`);
    }

    // 5. 三级有效值校验
    if (!this.deviceL3.has(level3)) {
      errors.push(`三级编码 "${level3}" 无效，有效值: ${Array.from(this.deviceL3).join('/')}`);
    }

    // 6. 四级范围校验
    const num = parseInt(level4, 10);
    if (num < 1 || num > 999) {
      errors.push(`四级流水号 "${level4}" 无效，范围: 001-999`);
    }

    return { valid: errors.length === 0, errors, parsed };
  }

  /**
   * 校验部件编码
   * 格式: [主体编码][jsfgz][00][00][00]
   */
  private validateComponent(code: string): ValidationResult {
    const errors: string[] = [];

    // 1. 正则格式校验
    if (!COMPONENT_REGEX.test(code)) {
      errors.push(`格式不匹配，正确格式: [主体编码][jsfgz][2位][2位][2位]，示例: Mgj-XC001j010101`);
      return { valid: false, errors };
    }

    // 2. 解析: 前 9 位是主体编码，后面是部件
    const deviceCode = code.substring(0, 9);  // Mgj-XC001
    const level5 = code[9];                   // j
    const level6 = code.substring(10, 12);    // 01
    const level7 = code.substring(12, 14);    // 01
    const serial = code.substring(14, 16);    // 01

    const parsed = { deviceCode, level5, level6, level7, serial };

    // 3. 先校验主体编码部分
    const deviceResult = this.validateDevice(deviceCode);
    if (!deviceResult.valid) {
      errors.push(`主体编码部分无效: ${deviceResult.errors.join('; ')}`);
    }

    // 4. 五级有效值校验
    if (!this.compL5.has(level5)) {
      errors.push(`五级编码 "${level5}" 无效，有效值: ${Array.from(this.compL5).join('/')}`);
    }

    // 5. 六级有效值校验
    if (!this.compL6.has(level6)) {
      errors.push(`六级编码 "${level6}" 无效，有效值: ${Array.from(this.compL6).join('/')}`);
    }

    // 6. 七级有效值校验
    if (!this.compL7Codes.has(level7)) {
      errors.push(`七级编码 "${level7}" 无效，有效值: ${Array.from(this.compL7Codes).join('/')}`);
    }

    // 7. 流水号范围
    const sn = parseInt(serial, 10);
    if (sn < 1 || sn > 99) {
      errors.push(`流水号 "${serial}" 无效，范围: 01-99`);
    }

    return { valid: errors.length === 0, errors, parsed };
  }

  /**
   * 校验部门编码
   * 格式: [000][X][00][00][00]
   */
  private validateDepartment(code: string): ValidationResult {
    const errors: string[] = [];

    // 1. 正则格式校验
    if (!DEPARTMENT_REGEX.test(code)) {
      errors.push(`格式不匹配，正确格式: [3位地区][1位行业][2位集团][2位分公司][2位设备队]，示例: 633G010204`);
      return { valid: false, errors };
    }

    // 2. 解析
    const region = code.substring(0, 3);      // 633
    const industry = code[3];                  // G
    const group = code.substring(4, 6);        // 01
    const branch = code.substring(6, 8);       // 02
    const team = code.substring(8, 10);        // 04

    const parsed = { region, industry, group, branch, team };

    // 3. 地区有效值校验
    if (!this.deptRegion.has(region)) {
      errors.push(`地区编码 "${region}" 无效，有效值: ${Array.from(this.deptRegion).join('/')}`);
    }

    // 4. 行业有效值校验
    if (!this.deptIndustry.has(industry)) {
      errors.push(`行业编码 "${industry}" 无效，有效值: ${Array.from(this.deptIndustry).join('/')}`);
    }

    // 5. 集团/分公司/设备队范围
    const gNum = parseInt(group, 10);
    const bNum = parseInt(branch, 10);
    const tNum = parseInt(team, 10);
    if (gNum < 1 || gNum > 99) errors.push(`集团编码 "${group}" 无效，范围: 01-99`);
    if (bNum < 1 || bNum > 99) errors.push(`分公司编码 "${branch}" 无效，范围: 01-99`);
    if (tNum < 1 || tNum > 99) errors.push(`设备队编码 "${team}" 无效，范围: 01-99`);

    return { valid: errors.length === 0, errors, parsed };
  }

  /** 批量校验 */
  validateBatch(
    items: Array<{ type: EncodingType; code: string }>
  ): Array<{ code: string; result: ValidationResult }> {
    return items.map(({ type, code }) => ({
      code,
      result: this.validate(type, code),
    }));
  }

  /** 获取编码正则 */
  getRegex(type: EncodingType): RegExp {
    return ENCODING_REGEX[type];
  }

  /** 获取所有编码类别 */
  getCategories(): typeof ENCODING_CATEGORIES {
    return ENCODING_CATEGORIES;
  }

  /** 获取某类编码某级的有效值列表 */
  getValidValues(type: EncodingType, level: number): string[] {
    const catCode = type === 'device' ? 'ENCODING_DEVICE'
      : type === 'component' ? 'ENCODING_COMPONENT'
      : 'ENCODING_DEPARTMENT';
    const items = ENCODING_ITEMS_BY_CATEGORY[catCode] ?? [];
    return items
      .filter(i => (i.metadata?.level as number) === level)
      .map(i => i.code);
  }

  /** 获取某个值的子级有效值 */
  getChildValues(type: EncodingType, parentCode: string): string[] {
    const catCode = type === 'device' ? 'ENCODING_DEVICE'
      : type === 'component' ? 'ENCODING_COMPONENT'
      : 'ENCODING_DEPARTMENT';
    const items = ENCODING_ITEMS_BY_CATEGORY[catCode] ?? [];
    return items
      .filter(i => i.parentCode === parentCode)
      .map(i => i.code);
  }
}

// ─── 单例 + 工厂函数（ARCH-002 模式）───────────────────────────────

let instance: EncodingValidator | null = null;

export function getEncodingValidator(): EncodingValidator {
  if (!instance) {
    instance = new EncodingValidator();
  }
  return instance;
}

export function resetEncodingValidator(): void {
  instance = null;
}
