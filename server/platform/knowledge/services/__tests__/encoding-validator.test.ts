/**
 * ============================================================================
 * 统一编码校验服务 — 单元测试
 * ============================================================================
 *
 * 基于用户现有编码规则体系，覆盖 3 类编码：
 *   ✓ 设备主体编码: Mgj-XC001 格式
 *   ✓ 部件编码:     Mgj-XC001j010101 格式
 *   ✓ 部门编码:     633G010204 格式
 *   ✓ 正则匹配 + 有效值校验
 *   ✓ 批量校验 + 工具方法
 *   ✓ 单例模式 + 性能
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getEncodingValidator,
  resetEncodingValidator,
  type EncodingType,
} from '../encoding-validator';
import {
  ENCODING_CATEGORIES,
  ALL_ENCODING_ITEMS,
  ENCODING_ITEMS_BY_CATEGORY,
} from '../../seed-data/encoding-seed';

describe('EncodingValidator', () => {
  beforeEach(() => {
    resetEncodingValidator();
  });

  // ─── 验收标准 1: 3 个 baseDictCategory 正确 ──────────────────────

  describe('baseDictCategory 定义', () => {
    it('应包含 3 个系统级编码类别', () => {
      expect(ENCODING_CATEGORIES).toHaveLength(3);
    });

    it('应包含 ENCODING_DEVICE', () => {
      const cat = ENCODING_CATEGORIES.find(c => c.code === 'ENCODING_DEVICE');
      expect(cat).toBeDefined();
      expect(cat!.isSystem).toBe(1);
      expect(cat!.name).toBe('设备主体编码');
    });

    it('应包含 ENCODING_COMPONENT', () => {
      const cat = ENCODING_CATEGORIES.find(c => c.code === 'ENCODING_COMPONENT');
      expect(cat).toBeDefined();
      expect(cat!.isSystem).toBe(1);
      expect(cat!.name).toBe('部件编码');
    });

    it('应包含 ENCODING_DEPARTMENT', () => {
      const cat = ENCODING_CATEGORIES.find(c => c.code === 'ENCODING_DEPARTMENT');
      expect(cat).toBeDefined();
      expect(cat!.isSystem).toBe(1);
      expect(cat!.name).toBe('部门编码');
    });

    it('所有类别 code 唯一', () => {
      const codes = ENCODING_CATEGORIES.map(c => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    it('每个类别有对应的字典项', () => {
      for (const cat of ENCODING_CATEGORIES) {
        const items = ENCODING_ITEMS_BY_CATEGORY[cat.code];
        expect(items).toBeDefined();
        expect(items.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── 验收标准 2: 设备主体编码校验 ─────────────────────────────────

  describe('设备主体编码校验', () => {
    it('Mgj-XC001 → 通过（门机-卸船机）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mgj-XC001');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsed).toEqual({
        level1: 'M', level2: 'gj', level3: 'XC', level4: '001',
      });
    });

    it('Alj-ZM002 → 通过（A类-龙门吊-驻码头）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Alj-ZM002');
      expect(result.valid).toBe(true);
    });

    it('Fgd-PD010 → 通过（F类-轨道-平地机）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Fgd-PD010');
      expect(result.valid).toBe(true);
    });

    it('Wss-AQ001 → 通过（W类-散货-岸桥）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Wss-AQ001');
      expect(result.valid).toBe(true);
    });

    it('mgj-XC001 → 拒绝（一级应大写）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'mgj-XC001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('格式不匹配'))).toBe(true);
    });

    it('MGJ-XC001 → 拒绝（二级应小写）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'MGJ-XC001');
      expect(result.valid).toBe(false);
    });

    it('Mgj-xc001 → 拒绝（三级应大写）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mgj-xc001');
      expect(result.valid).toBe(false);
    });

    it('MgjXC001 → 拒绝（缺少连字符）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'MgjXC001');
      expect(result.valid).toBe(false);
    });

    it('Mgj-XC01 → 拒绝（四级仅2位数字）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mgj-XC01');
      expect(result.valid).toBe(false);
    });

    it('Xgj-XC001 → 拒绝（无效一级 X，正则不通过）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Xgj-XC001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('格式不匹配'))).toBe(true);
    });

    it('Mzz-XC001 → 拒绝（无效二级 zz）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mzz-XC001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('二级编码'))).toBe(true);
    });

    it('Mgj-XX001 → 拒绝（无效三级 XX）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mgj-XX001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('三级编码'))).toBe(true);
    });

    it('Mgj-XC000 → 拒绝（四级流水号 000 无效）', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', 'Mgj-XC000');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('四级流水号'))).toBe(true);
    });

    it('空字符串 → 拒绝', () => {
      const v = getEncodingValidator();
      const result = v.validate('device', '');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('编码不能为空');
    });
  });

  // ─── 验收标准 3: 部件编码校验 ─────────────────────────────────────

  describe('部件编码校验', () => {
    it('Mgj-XC001j010101 → 通过（起升机构-电机-驱动端轴承）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001j010101');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsed).toEqual({
        deviceCode: 'Mgj-XC001',
        level5: 'j',
        level6: '01',
        level7: '01',
        serial: '01',
      });
    });

    it('Alj-ZM002s030201 → 通过', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Alj-ZM002s030201');
      expect(result.valid).toBe(true);
    });

    it('Mgj-XC001f050101 → 通过（俯仰机构）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001f050101');
      expect(result.valid).toBe(true);
    });

    it('Mgj-XC001g070101 → 通过（钢结构）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001g070101');
      expect(result.valid).toBe(true);
    });

    it('Mgj-XC001z080101 → 通过（安全装置）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001z080101');
      expect(result.valid).toBe(true);
    });

    it('Mgj-XC001x010101 → 拒绝（无效五级 x）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001x010101');
      expect(result.valid).toBe(false);
    });

    it('Mgj-XC001j990101 → 拒绝（无效六级 99）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001j990101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('六级编码'))).toBe(true);
    });

    it('Mgj-XC001j019901 → 拒绝（无效七级 99）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001j019901');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('七级编码'))).toBe(true);
    });

    it('Mgj-XC001j010100 → 拒绝（流水号 00 无效）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001j010100');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('流水号'))).toBe(true);
    });

    it('主体编码部分无效时也报错（X 不在正则范围 [MAFW]）', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Xgj-XC001j010101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('格式不匹配'))).toBe(true);
    });

    it('格式错误直接拒绝', () => {
      const v = getEncodingValidator();
      const result = v.validate('component', 'Mgj-XC001j01');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('格式不匹配'))).toBe(true);
    });
  });

  // ─── 验收标准 4: 部门编码校验 ─────────────────────────────────────

  describe('部门编码校验', () => {
    it('633G010204 → 通过（日照-港口-集团01-分公司02-设备队04）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633G010204');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsed).toEqual({
        region: '633', industry: 'G', group: '01', branch: '02', team: '04',
      });
    });

    it('021G010101 → 通过（上海-港口）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '021G010101');
      expect(result.valid).toBe(true);
    });

    it('532S010101 → 通过（青岛-水运）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '532S010101');
      expect(result.valid).toBe(true);
    });

    it('022J010101 → 通过（天津-交运）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '022J010101');
      expect(result.valid).toBe(true);
    });

    it('999G010101 → 拒绝（无效地区 999）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '999G010101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('地区编码'))).toBe(true);
    });

    it('633X010101 → 拒绝（无效行业 X）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633X010101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('行业编码'))).toBe(true);
    });

    it('633G000101 → 拒绝（集团编码 00 无效）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633G000101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('集团编码'))).toBe(true);
    });

    it('633G010001 → 拒绝（分公司编码 00 无效）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633G010001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('分公司编码'))).toBe(true);
    });

    it('633G010200 → 拒绝（设备队编码 00 无效）', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633G010200');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('设备队编码'))).toBe(true);
    });

    it('格式错误直接拒绝', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633g010101');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('格式不匹配'))).toBe(true);
    });

    it('位数不足拒绝', () => {
      const v = getEncodingValidator();
      const result = v.validate('department', '633G01');
      expect(result.valid).toBe(false);
    });
  });

  // ─── 正则格式校验 ─────────────────────────────────────────────────

  describe('正则格式校验', () => {
    const validCodes: Record<EncodingType, string[]> = {
      device: [
        'Mgj-XC001',
        'Alj-ZM002',
        'Fgd-PD010',
        'Wss-AQ001',
        'Mcb-CQ005',
      ],
      component: [
        'Mgj-XC001j010101',
        'Alj-ZM002s030201',
        'Fgd-PD010f050101',
        'Wss-AQ001g070101',
        'Mcb-CQ005z080101',
      ],
      department: [
        '633G010204',
        '021G010101',
        '532S020301',
        '022J010101',
        '020Y050201',
      ],
    };

    for (const [type, codes] of Object.entries(validCodes)) {
      for (const code of codes) {
        it(`${type}: ${code} → 正则通过`, () => {
          const v = getEncodingValidator();
          const regex = v.getRegex(type as EncodingType);
          expect(regex.test(code)).toBe(true);
        });
      }
    }

    const invalidFormats: Array<{ type: EncodingType; code: string; reason: string }> = [
      { type: 'device', code: 'mgj-XC001', reason: '一级小写' },
      { type: 'device', code: 'MGJ-XC001', reason: '二级大写' },
      { type: 'device', code: 'Mgj-xc001', reason: '三级小写' },
      { type: 'device', code: 'MgjXC001', reason: '缺少连字符' },
      { type: 'device', code: 'Mgj-XC01', reason: '四级仅2位' },
      { type: 'component', code: 'Mgj-XC001j01', reason: '部件段不完整' },
      { type: 'component', code: 'mgj-XC001j010101', reason: '主体一级小写' },
      { type: 'department', code: '633g010101', reason: '行业小写' },
      { type: 'department', code: '633G01', reason: '位数不足' },
      { type: 'department', code: '63G010101', reason: '地区仅2位' },
    ];

    for (const { type, code, reason } of invalidFormats) {
      it(`${type}: ${code} → 格式拒绝 (${reason})`, () => {
        const v = getEncodingValidator();
        const regex = v.getRegex(type);
        expect(regex.test(code)).toBe(false);
      });
    }
  });

  // ─── 工具方法测试 ─────────────────────────────────────────────────

  describe('工具方法', () => {
    it('getValidValues 返回设备一级有效值 (M/A/F/W)', () => {
      const v = getEncodingValidator();
      const l1 = v.getValidValues('device', 1);
      expect(l1).toContain('M');
      expect(l1).toContain('A');
      expect(l1).toContain('F');
      expect(l1).toContain('W');
      expect(l1).toHaveLength(4);
    });

    it('getValidValues 返回设备三级有效值 (AQ/CQ/MJ/XC/...)', () => {
      const v = getEncodingValidator();
      const l3 = v.getValidValues('device', 3);
      expect(l3).toContain('AQ');
      expect(l3).toContain('CQ');
      expect(l3).toContain('MJ');
      expect(l3).toContain('XC');
      expect(l3.length).toBeGreaterThanOrEqual(10);
    });

    it('getValidValues 返回部件五级有效值 (j/s/f/g/z)', () => {
      const v = getEncodingValidator();
      const l5 = v.getValidValues('component', 5);
      expect(l5).toContain('j');
      expect(l5).toContain('s');
      expect(l5).toContain('f');
      expect(l5).toContain('g');
      expect(l5).toContain('z');
      expect(l5).toHaveLength(5);
    });

    it('getValidValues 返回部门地区有效值', () => {
      const v = getEncodingValidator();
      const regions = v.getValidValues('department', 1);
      expect(regions).toContain('633');
      expect(regions).toContain('021');
      expect(regions).toContain('532');
      expect(regions.length).toBeGreaterThanOrEqual(10);
    });

    it('getChildValues 返回子级有效值', () => {
      const v = getEncodingValidator();
      const children = v.getChildValues('device', 'M');
      expect(children.length).toBeGreaterThan(0);
    });

    it('getCategories 返回 3 个类别', () => {
      const v = getEncodingValidator();
      expect(v.getCategories()).toHaveLength(3);
    });

    it('validateBatch 批量校验', () => {
      const v = getEncodingValidator();
      const results = v.validateBatch([
        { type: 'device', code: 'Mgj-XC001' },
        { type: 'component', code: 'Mgj-XC001j010101' },
        { type: 'department', code: '633G010204' },
        { type: 'device', code: 'Xgj-XC001' },     // 无效
        { type: 'department', code: '999G010101' },  // 无效
      ]);
      expect(results).toHaveLength(5);
      expect(results[0].result.valid).toBe(true);
      expect(results[1].result.valid).toBe(true);
      expect(results[2].result.valid).toBe(true);
      expect(results[3].result.valid).toBe(false);
      expect(results[4].result.valid).toBe(false);
    });
  });

  // ─── 单例模式测试 ─────────────────────────────────────────────────

  describe('单例模式', () => {
    it('getEncodingValidator 返回同一实例', () => {
      const v1 = getEncodingValidator();
      const v2 = getEncodingValidator();
      expect(v1).toBe(v2);
    });

    it('resetEncodingValidator 清除实例', () => {
      const v1 = getEncodingValidator();
      resetEncodingValidator();
      const v2 = getEncodingValidator();
      expect(v1).not.toBe(v2);
    });
  });

  // ─── 端到端集成测试 ───────────────────────────────────────────────

  describe('端到端集成测试', () => {
    it('创建 3 类编码 → 全部通过校验 → 覆盖完整链路', () => {
      const v = getEncodingValidator();

      // 设备编码
      const device = v.validate('device', 'Mgj-XC001');
      expect(device.valid).toBe(true);
      expect(device.parsed).toEqual({
        level1: 'M', level2: 'gj', level3: 'XC', level4: '001',
      });

      // 部件编码
      const component = v.validate('component', 'Mgj-XC001j010101');
      expect(component.valid).toBe(true);
      expect(component.parsed).toEqual({
        deviceCode: 'Mgj-XC001',
        level5: 'j', level6: '01', level7: '01', serial: '01',
      });

      // 部门编码
      const dept = v.validate('department', '633G010204');
      expect(dept.valid).toBe(true);
      expect(dept.parsed).toEqual({
        region: '633', industry: 'G', group: '01', branch: '02', team: '04',
      });
    });

    it('无效编码全部被正确拒绝', () => {
      const v = getEncodingValidator();

      const results = v.validateBatch([
        { type: 'device', code: 'mgj-xc001' },         // 全小写
        { type: 'device', code: 'Xgj-XC001' },          // 无效一级
        { type: 'component', code: 'Mgj-XC001x010101' },// 无效五级
        { type: 'department', code: '999G010101' },      // 无效地区
        { type: 'department', code: '633X010101' },      // 无效行业
      ]);

      for (const { result } of results) {
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('seed data 覆盖度验证', () => {
      // 验证每个类别至少有预期数量的字典项
      expect(ALL_ENCODING_ITEMS.length).toBeGreaterThan(40);
      expect(ENCODING_ITEMS_BY_CATEGORY['ENCODING_DEVICE'].length).toBeGreaterThanOrEqual(20);
      expect(ENCODING_ITEMS_BY_CATEGORY['ENCODING_COMPONENT'].length).toBeGreaterThanOrEqual(15);
      expect(ENCODING_ITEMS_BY_CATEGORY['ENCODING_DEPARTMENT'].length).toBeGreaterThanOrEqual(15);
    });

    it('未知编码类型应拒绝', () => {
      const v = getEncodingValidator();
      const result = v.validate('unknown' as EncodingType, 'Mgj-XC001');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('未知编码类型'))).toBe(true);
    });

    it('性能: 1000 次校验 < 500ms', () => {
      const v = getEncodingValidator();
      const codes = [
        { type: 'device' as const, code: 'Mgj-XC001' },
        { type: 'component' as const, code: 'Mgj-XC001j010101' },
        { type: 'department' as const, code: '633G010204' },
      ];

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const item = codes[i % codes.length];
        v.validate(item.type, item.code);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });
});
