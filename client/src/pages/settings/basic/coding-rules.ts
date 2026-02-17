/**
 * 编码生成工具函数
 * 所有编码规则数据已迁移到字典管理，此文件仅保留纯编码拼接函数
 */

/**
 * 根据选择的一级、二级、三级代码和流水号生成设备主体编码
 * 格式: Xxx-XXNNN  如 Mgj-XC001
 */
export function generateDeviceCode(
  level1: string, level2: string, level3: string, seqNum: number
): string {
  const seq = String(seqNum).padStart(3, '0');
  return `${level1}${level2}-${level3}${seq}`;
}

/**
 * 生成附属设备编码
 * 格式: Xxx-XXNNNxNNNNNN  如 Mgj-XC001j010101
 */
export function generateSubDeviceCode(
  deviceCode: string, level5: string, level6: string, level7: string, seqNum: number
): string {
  const seq = String(seqNum).padStart(2, '0');
  return `${deviceCode}${level5}${level6}${level7}${seq}`;
}

/**
 * 生成部门编码
 * 格式: NNNXNNNNNN  如 633G011104
 */
export function generateDeptCode(
  region: string, industry: string, group: string, company: string, team: string
): string {
  return `${region}${industry}${group}${company}${team}`;
}
