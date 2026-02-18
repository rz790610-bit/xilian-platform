/**
 * 编码规则常量与兼容函数
 * 
 * 所有编码生成逻辑已迁移到后端 generateCode 引擎
 * 前端通过 trpc.database.config.generateCode.mutate() 调用
 * 
 * 此文件保留规则代码常量供前端引用
 * 编码规则定义存储在 base_code_rules 表中
 * 种子数据: scripts/seed-code-rules.mjs
 */

/** 编码规则代码常量 */
export const RULE_CODES = {
  /** L1 设备主体编码 */
  DEVICE: 'DEVICE_CODE',
  /** L2 机构编码 */
  MECHANISM: 'MECHANISM_CODE',
  /** L3 部件编码 */
  COMPONENT: 'COMPONENT_CODE',
  /** L4 组件编码 */
  PART_L4: 'PART_L4_CODE',
  /** L5 零件编码 */
  PART_L5: 'PART_L5_CODE',
  /** 部门编码 */
  DEPT: 'DEPT_CODE',
} as const;

/**
 * @deprecated 使用后端 generateCode 引擎替代
 */
export function generateDeviceCode(
  level1: string, level2: string, level3: string, seqNum: number
): string {
  const seq = String(seqNum).padStart(3, '0');
  return `${level1}${level2}-${level3}${seq}`;
}

/**
 * @deprecated 使用后端 generateCode 引擎替代
 */
export function generateSubDeviceCode(
  deviceCode: string, level5: string, level6: string, level7: string, seqNum: number
): string {
  const seq = String(seqNum).padStart(2, '0');
  return `${deviceCode}${level5}${level6}${level7}${seq}`;
}

/**
 * @deprecated 使用后端 generateCode 引擎替代
 */
export function generateDeptCode(
  region: string, industry: string, group: string, company: string, team: string
): string {
  return `${region}${industry}${group}${company}${team}`;
}
