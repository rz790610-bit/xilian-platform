/**
 * 设备分类编码标准 — 基于《设备管控系统分类编码标准》
 * 编码结构: 一级(1位大写) + 二级(2位小写) + 分隔符(-) + 三级(2位大写) + 四级(3位数字流水号)
 * 示例: Mgj-XC001
 */

/** 一级代码 — 设备大类 */
export const LEVEL1_CODES: Record<string, string> = {
  M: '主要生产设备',
  A: '辅助生产设备',
  F: '设施类',
  W: '无形资产类',
};

/** 二级代码 — 设备中类（按一级分组） */
export const LEVEL2_CODES: Record<string, Record<string, string>> = {
  M: {
    gj: '固机类', lj: '流机类', lc: '流程设备类', cb: '船舶类',
  },
  A: {
    gs: '工属具类', fc: '辅助车辆类', dl: '电力设备类', tx: '通讯设备类',
    hb: '环保设备类', jl: '计量设备类', sn: '水暖设备类', af: '安防设备类',
    xf: '消防设备类', fb: '辅助船舶类', jc: '机床类', sy: '实验检验设备类',
  },
  F: {
    mt: '码头设施类', kc: '库场设施类', fw: '房屋类', bj: '办公家具类', bs: '办公设备类',
  },
  W: {
    td: '土地使用权类', hy: '海域使用权类', rj: '软件类', xt: '系统类', zl: '专利类',
  },
};

/** 三级代码 — 设备小类（按二级分组） */
export const LEVEL3_CODES: Record<string, Record<string, string>> = {
  // 固机类
  gj: {
    MJ: '门机', XC: '卸船机', ZC: '装船机', CQ: '场桥', AQ: '岸桥',
    DQ: '堆取料机', DL: '堆料机', QL: '取料机', ZJ: '装车机', FC: '翻车机',
  },
  // 流机类
  lj: {
    QD: '汽车吊', CC: '叉车', ZZ: '装载机', WJ: '挖掘机', ZD: '正面吊',
    DG: '堆高机', QY: '牵引车', HK: '货运卡车', JQ: '集装箱牵引车', JD: '集装箱底盘车',
  },
  // 流程设备类
  lc: {
    PD: '皮带机', PC: '皮带秤', KZ: '控制系统', JS: '金属分离器',
  },
  // 船舶类
  cb: {
    GZ: '滚装船', JZ: '集装箱船',
  },
  // 工属具类
  gs: {
    ZD: '抓斗', DG: '吊钩',
  },
  // 辅助车辆类
  fc: {
    JC: '轿车', MB: '面包车', DB: '大巴车', PK: '皮卡车',
  },
  // 电力设备类
  dl: {
    BY: '变压器', KG: '开关柜', ZD: '自动化柜', ZH: '组合变', PD: '配电箱', FD: '发电机',
  },
  // 通讯设备类
  tx: {
    GP: '高频电话', LD: '雷达', CZ: '传真机', YD: '移动电话', PX: '配线架',
  },
  // 环保设备类
  hb: {
    SB: '水泵', GY: '高压喷枪', CC: '除尘器', SS: '洒水车', XC: '吸尘车', XS: '洗扫车',
  },
  // 计量设备类
  jl: {
    QH: '汽车衡', JC: '卷尺',
  },
  // 水暖设备类
  sn: {
    GL: '锅炉', SB: '水泵',
  },
  // 安防设备类
  af: {
    MJ: '门禁', ZK: '闸口', JK: '监控',
  },
  // 消防设备类
  xf: {
    MH: '灭火器', XS: '消防栓',
  },
  // 辅助船舶类
  fb: {
    XF: '消防船', BC: '驳船', TL: '拖轮',
  },
  // 机床类
  jc: {
    CC: '车床', XC: '铣床',
  },
  // 实验检验设备类
  sy: {
    FX: '分析测量仪',
  },
  // 码头设施类
  mt: {
    MT: '码头', QL: '桥梁', DL: '道路',
  },
  // 库场设施类
  kc: {
    CK: '仓库', DC: '堆场', GG: '高杆灯',
  },
  // 房屋类
  fw: {
    SC: '生产性用房', FS: '非生产性用房', JY: '简易用房',
  },
  // 办公家具类
  bj: {
    SC: '生产性家具', FS: '非生产性家具',
  },
  // 办公设备类
  bs: {
    JS: '计算机及附属设备', DY: '打印机', FY: '复印机', ZX: '照相机',
    KT: '空调', DS: '电视', YX: '音响设备', SX: '摄像机', WL: '网络设备',
  },
  // 无形资产 — 通常无三级
  td: {}, hy: {}, rj: {}, xt: {}, zl: {},
};

/** 五级代码 — 附属设备分类 */
export const LEVEL5_CODES: Record<string, string> = {
  j: '主要组成机构',
  s: '附属设施和附属设备',
  f: '附件',
  g: '专用工具',
  z: '随机资料',
};

/** 部门编码 — 地区代码 */
export const DEPT_REGION_CODES: Record<string, string> = {
  '021': '上海', '633': '日照', '532': '青岛',
};

/** 部门编码 — 行业代码 */
export const DEPT_INDUSTRY_CODES: Record<string, string> = {
  G: '港口', S: '石化', J: '建材', Y: '冶金', D: '电力', H: '化工',
};

/** 部门编码 — 企业集团（示例） */
export const DEPT_GROUP_CODES: Record<string, string> = {
  '01': '日照港集团', '02': '岚桥港集团',
};

/** 部门编码 — 分公司（以日照港为例） */
export const DEPT_COMPANY_CODES: Record<string, string> = {
  '00': '集团公司', '01': '一公司', '02': '二公司', '03': '三公司',
  '04': '裕廊公司', '05': '集发公司', '06': '港湾集团', '07': '动力公司',
  '08': '铁运公司', '09': '轮驳公司', '10': '信息中心', '11': '岚山公司', '12': '油品公司',
};

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
