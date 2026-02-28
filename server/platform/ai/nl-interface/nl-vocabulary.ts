/**
 * ============================================================================
 * 港机领域词汇表
 * ============================================================================
 *
 * 中文自然语言 → 标准化设备/部件/传感器标识符映射。
 * 用于 NL 意图解析阶段的预处理：从用户输入中提取结构化实体引用。
 *
 * 设计原则：
 *   - 覆盖港机运维常见中文别名和缩写
 *   - 映射到 ADR-004 统一编码体系中的标准标识符
 *   - 纯函数，无副作用，可独立测试
 */

// ============================================================================
// 设备类型映射
// ============================================================================

/** 设备类型词汇：中文别名 → 标准设备类型码 */
export const DEVICE_TYPE_VOCAB: Record<string, string> = {
  '岸桥': 'STS', '桥吊': 'STS', '集装箱桥': 'STS', 'STS': 'STS',
  '场桥': 'RTG', '轮胎吊': 'RTG', 'RTG': 'RTG',
  '门机': 'RMG', '轨道吊': 'RMG', 'RMG': 'RMG',
  '正面吊': 'RSC', 'RSC': 'RSC',
  '堆高机': 'ECH', 'ECH': 'ECH',
  '叉车': 'FLT', 'FLT': 'FLT',
  '集卡': 'AGV', '无人集卡': 'AGV', 'AGV': 'AGV',
};

// ============================================================================
// 机构映射
// ============================================================================

/** 机构词汇：中文别名 → 标准机构码 */
export const MECHANISM_VOCAB: Record<string, string> = {
  '起升': 'hoist', '起升机构': 'hoist', 'hoist': 'hoist',
  '小车': 'trolley', '小车机构': 'trolley', 'trolley': 'trolley',
  '大车': 'gantry', '大车机构': 'gantry', 'gantry': 'gantry',
  '俯仰': 'boom', '臂架': 'boom', 'boom': 'boom',
  '回转': 'slew', '旋转': 'slew', 'slew': 'slew',
};

// ============================================================================
// 部件映射
// ============================================================================

/** 部件词汇：中文别名 → 标准部件码 */
export const COMPONENT_VOCAB: Record<string, string> = {
  '电机': 'motor', '马达': 'motor',
  '减速箱': 'gearbox', '齿轮箱': 'gearbox', '减速机': 'gearbox',
  '制动器': 'brake', '刹车': 'brake',
  '轴承': 'bearing',
  '钢丝绳': 'wire_rope', '钢缆': 'wire_rope',
  '吊具': 'spreader',
  '变频器': 'vfd', '变频': 'vfd',
  '编码器': 'encoder',
  '联轴器': 'coupling',
  '滑轮': 'sheave', '天轮': 'sheave',
};

// ============================================================================
// 传感器/参数映射
// ============================================================================

/** 传感器/测量参数词汇：中文别名 → 标准传感器类型码 */
export const SENSOR_VOCAB: Record<string, string> = {
  '振动': 'vibration', '振幅': 'vibration',
  '温度': 'temperature', '温升': 'temperature',
  '电流': 'current', '电机电流': 'motor_current',
  '电压': 'voltage',
  '转速': 'speed', 'rpm': 'speed',
  '风速': 'wind_speed',
  '载荷': 'load', '负载': 'load',
  '油压': 'oil_pressure',
  '噪声': 'noise',
};

// ============================================================================
// 状态/动作词汇
// ============================================================================

/** 状态与动作词汇映射 */
export const STATUS_VOCAB: Record<string, string> = {
  '正常': 'normal', '运行': 'running', '停机': 'stopped',
  '告警': 'alarm', '报警': 'alarm', '警告': 'warning',
  '故障': 'fault', '异常': 'abnormal',
  '维修': 'maintenance', '保养': 'maintenance',
  '检修': 'inspection',
};

// ============================================================================
// 工具函数
// ============================================================================

/** 设备编号提取正则（匹配 "3号" 或 "03号" 等） */
export const DEVICE_NUMBER_PATTERN = /(\d+)\s*号/;

/**
 * 从自然语言文本中提取设备引用
 *
 * @param text - 用户输入的中文文本
 * @returns 提取出的设备类型、编号、机构、部件
 */
export function resolveDeviceReference(text: string): {
  type?: string;
  number?: string;
  mechanism?: string;
  component?: string;
} {
  const result: {
    type?: string;
    number?: string;
    mechanism?: string;
    component?: string;
  } = {};

  // 设备类型（按词汇长度降序匹配，优先匹配长词）
  const sortedDeviceKeys = Object.keys(DEVICE_TYPE_VOCAB).sort((a, b) => b.length - a.length);
  for (const key of sortedDeviceKeys) {
    if (text.includes(key)) {
      result.type = DEVICE_TYPE_VOCAB[key];
      break;
    }
  }

  // 设备编号
  const numMatch = text.match(DEVICE_NUMBER_PATTERN);
  if (numMatch) result.number = numMatch[1];

  // 机构（按词汇长度降序）
  const sortedMechKeys = Object.keys(MECHANISM_VOCAB).sort((a, b) => b.length - a.length);
  for (const key of sortedMechKeys) {
    if (text.includes(key)) {
      result.mechanism = MECHANISM_VOCAB[key];
      break;
    }
  }

  // 部件（按词汇长度降序）
  const sortedCompKeys = Object.keys(COMPONENT_VOCAB).sort((a, b) => b.length - a.length);
  for (const key of sortedCompKeys) {
    if (text.includes(key)) {
      result.component = COMPONENT_VOCAB[key];
      break;
    }
  }

  return result;
}

/**
 * 标准化设备ID
 *
 * @param type - 设备类型码（如 STS）
 * @param number - 设备编号（如 "3"）
 * @returns 标准化设备ID（如 "STS-003"）
 */
export function normalizeDeviceId(type: string, number: string): string {
  return `${type}-${number.padStart(3, '0')}`;
}

/**
 * 获取所有已知词汇的摘要文本（用于 LLM prompt 上下文注入）
 *
 * @returns 格式化的词汇摘要字符串
 */
export function getVocabularySummary(): string {
  const sections: string[] = [];

  sections.push('【设备类型】');
  const deviceTypes = Array.from(new Set(Object.values(DEVICE_TYPE_VOCAB)));
  for (const code of deviceTypes) {
    const aliases = Object.entries(DEVICE_TYPE_VOCAB)
      .filter(([, v]) => v === code)
      .map(([k]) => k)
      .filter(k => k !== code);
    sections.push(`  ${code}: ${aliases.join('、')}`);
  }

  sections.push('【机构】');
  const mechanisms = Array.from(new Set(Object.values(MECHANISM_VOCAB)));
  for (const code of mechanisms) {
    const aliases = Object.entries(MECHANISM_VOCAB)
      .filter(([, v]) => v === code)
      .map(([k]) => k)
      .filter(k => k !== code);
    sections.push(`  ${code}: ${aliases.join('、')}`);
  }

  sections.push('【部件】');
  const components = Array.from(new Set(Object.values(COMPONENT_VOCAB)));
  for (const code of components) {
    const aliases = Object.entries(COMPONENT_VOCAB)
      .filter(([, v]) => v === code)
      .map(([k]) => k)
      .filter(k => k !== code);
    sections.push(`  ${code}: ${aliases.join('、')}`);
  }

  sections.push('【传感器/参数】');
  const sensors = Array.from(new Set(Object.values(SENSOR_VOCAB)));
  for (const code of sensors) {
    const aliases = Object.entries(SENSOR_VOCAB)
      .filter(([, v]) => v === code)
      .map(([k]) => k)
      .filter(k => k !== code);
    sections.push(`  ${code}: ${aliases.join('、')}`);
  }

  return sections.join('\n');
}
