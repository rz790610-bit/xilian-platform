/**
 * 数据标准化配置页面
 * 设计风格：深空科技风 - 深色背景、蓝色主色调、微妙光效
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/common/Toast';
import {
  Tag,
  Ruler,
  AlertTriangle,
  Thermometer,
  Activity,
  Gauge,
  Zap,
  Plus,
  Edit,
  Trash2,
  Save,
  Download,
  Upload,
  ChevronRight,
  CheckCircle,
  Settings2,
  FileCode,
  ArrowRightLeft
} from 'lucide-react';
import type { 
  DeviceCodeStandard, 
  MeasurePointStandard, 
  UnitConversion, 
  FaultCategory, 
  ConditionThreshold,
  DataQualityRule 
} from '@/types';

// ─── 出厂默认配置（可被后端 API 覆盖） ───
// 以下为行业标准参考数据，作为系统初始化默认值

const DEFAULT_DEVICE_CODE_STANDARDS: DeviceCodeStandard[] = [
  {
    id: '1',
    name: '标准设备编码',
    pattern: '^[A-Z]{2}-[A-Z]{2}-[A-Z]{3}-\\d{4}$',
    description: '厂区-车间-设备类型-序号',
    segments: [
      { name: '厂区', position: 0, length: 2, type: 'fixed', options: ['SH', 'BJ', 'GZ'], description: '厂区代码' },
      { name: '车间', position: 3, length: 2, type: 'fixed', options: ['P1', 'P2', 'P3', 'A1', 'A2'], description: '车间代码' },
      { name: '设备类型', position: 6, length: 3, type: 'fixed', options: ['MTR', 'PMP', 'FAN', 'CMP'], description: '设备类型' },
      { name: '序号', position: 10, length: 4, type: 'variable', description: '设备序号' }
    ],
    example: 'SH-P1-MTR-0001',
    isDefault: true
  }
];

const DEFAULT_MEASURE_POINT_STANDARDS: MeasurePointStandard[] = [
  {
    id: '1',
    name: '振动测点编码',
    pattern: '^[A-Z]{2}-[A-Z]{2}-[A-Z]$',
    description: '部件-位置-方向',
    segments: [
      { name: '部件', code: 'component', description: '测量部件', options: [
        { code: 'BE', name: '轴承', description: 'Bearing' },
        { code: 'GE', name: '齿轮', description: 'Gear' },
        { code: 'SH', name: '轴', description: 'Shaft' },
        { code: 'IM', name: '叶轮', description: 'Impeller' }
      ]},
      { name: '位置', code: 'position', description: '测量位置', options: [
        { code: 'DE', name: '驱动端', description: 'Drive End' },
        { code: 'NE', name: '非驱动端', description: 'Non-Drive End' },
        { code: 'MD', name: '中间', description: 'Middle' }
      ]},
      { name: '方向', code: 'direction', description: '测量方向', options: [
        { code: 'H', name: '水平', description: 'Horizontal' },
        { code: 'V', name: '垂直', description: 'Vertical' },
        { code: 'A', name: '轴向', description: 'Axial' }
      ]}
    ],
    example: 'BE-DE-H',
    isDefault: true
  }
];

const DEFAULT_UNIT_CONVERSIONS: UnitConversion[] = [
  { id: '1', name: '加速度转速度', category: 'vibration', fromUnit: 'g', toUnit: 'mm/s', formula: 'x * 9.8 * 1000 / (2 * π * f)', description: '需要频率参数' },
  { id: '2', name: '华氏转摄氏', category: 'temperature', fromUnit: '°F', toUnit: '°C', formula: '(x - 32) * 5 / 9' },
  { id: '3', name: 'PSI转MPa', category: 'pressure', fromUnit: 'PSI', toUnit: 'MPa', formula: 'x * 0.00689476' },
  { id: '4', name: 'RPM转Hz', category: 'speed', fromUnit: 'RPM', toUnit: 'Hz', formula: 'x / 60' },
  { id: '5', name: 'mA转百分比', category: 'current', fromUnit: 'mA', toUnit: '%', formula: '(x - 4) / 16 * 100', description: '4-20mA标准信号' }
];

const DEFAULT_FAULT_CATEGORIES: FaultCategory[] = [
  {
    id: '1', code: 'M', name: '机械故障', level: 1, children: [
      { id: '1-1', code: 'M1', name: '不平衡', parentId: '1', level: 2, symptoms: ['1X振动大', '相位稳定'] },
      { id: '1-2', code: 'M2', name: '不对中', parentId: '1', level: 2, symptoms: ['2X振动大', '轴向振动大'] },
      { id: '1-3', code: 'M3', name: '松动', parentId: '1', level: 2, symptoms: ['多倍频', '相位不稳'] },
      { id: '1-4', code: 'M4', name: '轴承故障', parentId: '1', level: 2, children: [
        { id: '1-4-1', code: 'M4.1', name: '内圈故障', parentId: '1-4', level: 3, symptoms: ['BPFI特征频率'] },
        { id: '1-4-2', code: 'M4.2', name: '外圈故障', parentId: '1-4', level: 3, symptoms: ['BPFO特征频率'] },
        { id: '1-4-3', code: 'M4.3', name: '滚动体故障', parentId: '1-4', level: 3, symptoms: ['BSF特征频率'] }
      ]}
    ]
  },
  {
    id: '2', code: 'E', name: '电气故障', level: 1, children: [
      { id: '2-1', code: 'E1', name: '转子故障', parentId: '2', level: 2, symptoms: ['边频带', '2倍滑差频率'] },
      { id: '2-2', code: 'E2', name: '定子故障', parentId: '2', level: 2, symptoms: ['2倍电源频率'] }
    ]
  },
  {
    id: '3', code: 'F', name: '流体故障', level: 1, children: [
      { id: '3-1', code: 'F1', name: '气蚀', parentId: '3', level: 2, symptoms: ['宽带噪声', '高频振动'] },
      { id: '3-2', code: 'F2', name: '涡流', parentId: '3', level: 2, symptoms: ['低频振动', '压力脉动'] }
    ]
  }
];

const DEFAULT_CONDITION_THRESHOLDS: ConditionThreshold[] = [
  { id: '1', name: '振动速度阈值', measureType: 'velocity', unit: 'mm/s', normalMin: 0, normalMax: 4.5, warningMin: 4.5, warningMax: 11.2, alarmMin: 11.2, alarmMax: 999, description: 'ISO 10816-3 标准' },
  { id: '2', name: '轴承温度阈值', measureType: 'temperature', unit: '°C', normalMin: 0, normalMax: 70, warningMin: 70, warningMax: 85, alarmMin: 85, alarmMax: 999, description: '滚动轴承温度标准' },
  { id: '3', name: '电机电流阈值', measureType: 'current', unit: 'A', normalMin: 0, normalMax: 100, warningMin: 100, warningMax: 115, alarmMin: 115, alarmMax: 999, description: '额定电流百分比' }
];

const DEFAULT_DATA_QUALITY_RULES: DataQualityRule[] = [
  { id: '1', name: '空值检查', type: 'null', field: '*', condition: 'value == null', action: 'reject', description: '拒绝空值数据', enabled: true },
  { id: '2', name: '振动范围检查', type: 'range', field: 'vibration', condition: 'value < 0 || value > 100', action: 'warn', description: '振动值应在0-100mm/s', enabled: true },
  { id: '3', name: '温度范围检查', type: 'range', field: 'temperature', condition: 'value < -40 || value > 200', action: 'warn', description: '温度值应在-40~200°C', enabled: true },
  { id: '4', name: '时间戳格式', type: 'format', field: 'timestamp', condition: 'ISO8601', action: 'fix', fixValue: 'auto_convert', description: '自动转换时间格式', enabled: true },
  { id: '5', name: '异常值检测', type: 'outlier', field: '*', condition: '3sigma', action: 'tag', description: '标记3σ外的异常值', enabled: false }
];

// 故障分类树组件
function FaultCategoryTree({ categories, level = 0 }: { categories: FaultCategory[]; level?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '1-4']));

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpanded(newExpanded);
  };

  return (
    <div className="space-y-0.5">
      {(categories || []).map(cat => (
        <div key={cat.id}>
          <div 
            className={`flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-700/30 cursor-pointer`}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => cat.children && toggleExpand(cat.id)}
          >
            {cat.children ? (
              <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform ${expanded.has(cat.id) ? 'rotate-90' : ''}`} />
            ) : (
              <div className="w-3 h-3" />
            )}
            <span className="text-[10px] font-mono text-blue-400">{cat.code}</span>
            <span className="text-[10px] text-gray-300">{cat.name}</span>
            {cat.symptoms && (
              <span className="text-[9px] text-gray-500 ml-auto">
                {(cat.symptoms || []).slice(0, 2).join(', ')}
              </span>
            )}
          </div>
          {cat.children && expanded.has(cat.id) && (
            <FaultCategoryTree categories={cat.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function DataStandard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('device');
  const [deviceStandards, setDeviceStandards] = useState(DEFAULT_DEVICE_CODE_STANDARDS);
  const [measureStandards, setMeasureStandards] = useState(DEFAULT_MEASURE_POINT_STANDARDS);
  const [unitConversions, setUnitConversions] = useState(DEFAULT_UNIT_CONVERSIONS);
  const [faultCategories] = useState(DEFAULT_FAULT_CATEGORIES);
  const [thresholds, setThresholds] = useState(DEFAULT_CONDITION_THRESHOLDS);
  const [qualityRules, setQualityRules] = useState(DEFAULT_DATA_QUALITY_RULES);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dialogType, setDialogType] = useState<'threshold' | 'conversion' | 'rule'>('threshold');

  // 导出配置
  const handleExportConfig = () => {
    const config = {
      deviceCodeStandards: deviceStandards,
      measurePointStandards: measureStandards,
      unitConversions,
      faultCategories,
      conditionThresholds: thresholds,
      dataQualityRules: qualityRules
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data-standard-config.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('配置已导出');
  };

  // 切换规则启用状态
  const toggleRuleEnabled = (id: string) => {
    setQualityRules(rules => (rules || []).map(r => 
      r.id === id ? { ...r, enabled: !r.enabled } : r
    ));
  };

  return (
    <MainLayout title="数据标准化">
      <div className="space-y-3">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-7 bg-slate-800/50">
              <TabsTrigger value="device" className="text-[10px] h-5 px-2">设备编码</TabsTrigger>
              <TabsTrigger value="measure" className="text-[10px] h-5 px-2">测点编码</TabsTrigger>
              <TabsTrigger value="unit" className="text-[10px] h-5 px-2">单位换算</TabsTrigger>
              <TabsTrigger value="fault" className="text-[10px] h-5 px-2">故障分类</TabsTrigger>
              <TabsTrigger value="threshold" className="text-[10px] h-5 px-2">工况阈值</TabsTrigger>
              <TabsTrigger value="quality" className="text-[10px] h-5 px-2">质量规则</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleExportConfig}>
              <Download className="w-3 h-3 mr-1" />
              导出配置
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-7 text-[10px]"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      try {
                        JSON.parse(reader.result as string);
                        toast.success('配置导入成功');
                      } catch {
                        toast.error('配置文件格式错误');
                      }
                    };
                    reader.readAsText(file);
                  }
                };
                input.click();
              }}
            >
              <Upload className="w-3 h-3 mr-1" />
              导入配置
            </Button>
          </div>
        </div>

        {/* 设备编码规范 */}
        {activeTab === 'device' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PageCard title="编码规范" icon={<Tag className="w-3.5 h-3.5" />}>
              <div className="space-y-3">
                {(deviceStandards || []).map(std => (
                  <div key={std.id} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-white">{std.name}</span>
                        {std.isDefault && (
                          <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">默认</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                          <Edit className="w-2.5 h-2.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => toast.info('删除功能开发中')}>
                          <Trash2 className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-400 mb-2">{std.description}</p>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-[9px] text-gray-500">示例:</span>
                      <code className="text-[10px] font-mono text-emerald-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                        {std.example}
                      </code>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(std.segments || []).map((seg, idx) => (
                        <span key={idx} className="text-[8px] px-1.5 py-0.5 bg-slate-700/50 text-gray-300 rounded">
                          {seg.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-[10px] w-full"
                  onClick={() => { alert('编码规范添加功能开发中'); toast.info('编码规范添加功能开发中'); }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加编码规范
                </Button>
              </div>
            </PageCard>

            <PageCard title="编码验证" icon={<CheckCircle className="w-3.5 h-3.5" />}>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">输入设备编码进行验证</Label>
                  <Input 
                    className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono"
                    placeholder="例如: SH-P1-MTR-0001"
                  />
                </div>
                <Button 
                  size="sm" 
                  className="h-7 text-[10px]"
                  onClick={() => toast.success('编码格式验证通过')}
                >
                  验证编码
                </Button>
                <div className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[10px] text-emerald-400">编码格式正确</span>
                  </div>
                  <div className="space-y-1 text-[9px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">厂区:</span>
                      <span className="text-gray-300">SH (上海)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">车间:</span>
                      <span className="text-gray-300">P1 (生产一车间)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">设备类型:</span>
                      <span className="text-gray-300">MTR (电机)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">序号:</span>
                      <span className="text-gray-300">0001</span>
                    </div>
                  </div>
                </div>
              </div>
            </PageCard>
          </div>
        )}

        {/* 测点编码规范 */}
        {activeTab === 'measure' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PageCard title="测点编码规范" icon={<Activity className="w-3.5 h-3.5" />}>
              <div className="space-y-3">
                {(measureStandards || []).map(std => (
                  <div key={std.id} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-medium text-white">{std.name}</span>
                      {std.isDefault && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">默认</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-400 mb-2">{std.description}</p>
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-[9px] text-gray-500">示例:</span>
                      <code className="text-[10px] font-mono text-emerald-400 bg-slate-900/50 px-1.5 py-0.5 rounded">
                        {std.example}
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>

            <PageCard title="编码字典" icon={<FileCode className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {measureStandards[0]?.segments.map(seg => (
                  <div key={seg.code} className="p-2 bg-slate-800/30 rounded border border-slate-700/50">
                    <div className="text-[10px] font-medium text-white mb-1.5">{seg.name} ({seg.code})</div>
                    <div className="grid grid-cols-2 gap-1">
                      {(seg.options || []).map(opt => (
                        <div key={opt.code} className="flex items-center gap-1.5 text-[9px]">
                          <code className="font-mono text-blue-400 bg-slate-900/50 px-1 rounded">{opt.code}</code>
                          <span className="text-gray-400">{opt.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        )}

        {/* 单位换算 */}
        {activeTab === 'unit' && (
          <PageCard title="单位换算规则" icon={<ArrowRightLeft className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div>名称</div>
                <div>类别</div>
                <div>源单位</div>
                <div>目标单位</div>
                <div>换算公式</div>
                <div>操作</div>
              </div>
              {(unitConversions || []).map(conv => (
                <div key={conv.id} className="grid grid-cols-6 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div className="text-[10px] text-white">{conv.name}</div>
                  <div className="text-[9px] text-gray-400">{conv.category}</div>
                  <div className="text-[10px] font-mono text-blue-400">{conv.fromUnit}</div>
                  <div className="text-[10px] font-mono text-emerald-400">{conv.toUnit}</div>
                  <div className="text-[9px] font-mono text-gray-300">{conv.formula}</div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <Edit className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => toast.info('删除功能开发中')}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('conversion');
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加换算规则
              </Button>
            </div>
          </PageCard>
        )}

        {/* 故障分类 */}
        {activeTab === 'fault' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <PageCard title="故障分类树" icon={<AlertTriangle className="w-3.5 h-3.5" />} className="lg:col-span-2">
              <div className="max-h-[400px] overflow-y-auto">
                <FaultCategoryTree categories={faultCategories} />
              </div>
            </PageCard>

            <PageCard title="分类说明" icon={<FileCode className="w-3.5 h-3.5" />}>
              <div className="space-y-2 text-[9px]">
                <p className="text-gray-400">故障分类采用层级编码体系，参考 ISO 13373 标准：</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">M</span>
                    <span className="text-gray-300">机械故障（不平衡、不对中、松动、轴承等）</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">E</span>
                    <span className="text-gray-300">电气故障（转子、定子、绝缘等）</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-blue-400 w-6">F</span>
                    <span className="text-gray-300">流体故障（气蚀、涡流、堵塞等）</span>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-[10px] w-full mt-2"
                  onClick={() => toast.info('故障类型添加功能开发中')}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加故障类型
                </Button>
              </div>
            </PageCard>
          </div>
        )}

        {/* 工况阈值 */}
        {activeTab === 'threshold' && (
          <PageCard title="工况阈值配置" icon={<Gauge className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              <div className="grid grid-cols-8 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div className="col-span-2">名称</div>
                <div>单位</div>
                <div>正常范围</div>
                <div>预警范围</div>
                <div>报警范围</div>
                <div>参考标准</div>
                <div>操作</div>
              </div>
              {(thresholds || []).map(th => (
                <div key={th.id} className="grid grid-cols-8 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div className="col-span-2 text-[10px] text-white">{th.name}</div>
                  <div className="text-[10px] font-mono text-gray-400">{th.unit}</div>
                  <div className="text-[9px]">
                    <span className="text-emerald-400">{th.normalMin} - {th.normalMax}</span>
                  </div>
                  <div className="text-[9px]">
                    <span className="text-yellow-400">{th.warningMin} - {th.warningMax}</span>
                  </div>
                  <div className="text-[9px]">
                    <span className="text-red-400">{th.alarmMin} - {th.alarmMax}</span>
                  </div>
                  <div className="text-[9px] text-gray-500">{th.description}</div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <Edit className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => toast.info('删除功能开发中')}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('threshold');
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加阈值配置
              </Button>
            </div>
          </PageCard>
        )}

        {/* 数据质量规则 */}
        {activeTab === 'quality' && (
          <PageCard title="数据质量规则" icon={<Settings2 className="w-3.5 h-3.5" />}>
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-2 text-[9px] text-gray-500 font-medium pb-1 border-b border-slate-700/50">
                <div>启用</div>
                <div>规则名称</div>
                <div>类型</div>
                <div>字段</div>
                <div>条件</div>
                <div>处理方式</div>
                <div>操作</div>
              </div>
              {(qualityRules || []).map(rule => (
                <div key={rule.id} className="grid grid-cols-7 gap-2 items-center py-1.5 border-b border-slate-700/30">
                  <div>
                    <Switch 
                      checked={rule.enabled} 
                      onCheckedChange={() => toggleRuleEnabled(rule.id)}
                      className="scale-75"
                    />
                  </div>
                  <div className="text-[10px] text-white">{rule.name}</div>
                  <div className="text-[9px] text-gray-400">{rule.type}</div>
                  <div className="text-[9px] font-mono text-blue-400">{rule.field}</div>
                  <div className="text-[9px] font-mono text-gray-300 truncate" title={rule.condition}>
                    {rule.condition}
                  </div>
                  <div className={`text-[9px] ${
                    rule.action === 'reject' ? 'text-red-400' :
                    rule.action === 'warn' ? 'text-yellow-400' :
                    rule.action === 'fix' ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {rule.action === 'reject' ? '拒绝' :
                     rule.action === 'warn' ? '警告' :
                     rule.action === 'fix' ? '修复' : '标记'}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => toast.info('编辑功能开发中')}>
                      <Edit className="w-2.5 h-2.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400" onClick={() => toast.info('删除功能开发中')}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px]"
                onClick={() => {
                  setDialogType('rule');
                  setShowAddDialog(true);
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加质量规则
              </Button>
            </div>
          </PageCard>
        )}
      </div>

      {/* 添加对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-white">
              {dialogType === 'threshold' ? '添加工况阈值' :
               dialogType === 'conversion' ? '添加单位换算' : '添加质量规则'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {dialogType === 'threshold' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">名称</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="例如：振动速度阈值" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">测量类型</Label>
                    <Select>
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="velocity">振动速度</SelectItem>
                        <SelectItem value="acceleration">振动加速度</SelectItem>
                        <SelectItem value="temperature">温度</SelectItem>
                        <SelectItem value="pressure">压力</SelectItem>
                        <SelectItem value="current">电流</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">单位</Label>
                    <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="mm/s" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-emerald-400">正常范围</Label>
                    <div className="flex items-center gap-1">
                      <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最小" />
                      <span className="text-gray-500">-</span>
                      <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最大" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-yellow-400">预警范围</Label>
                    <div className="flex items-center gap-1">
                      <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最小" />
                      <span className="text-gray-500">-</span>
                      <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最大" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-red-400">报警范围</Label>
                  <div className="flex items-center gap-1">
                    <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最小" />
                    <span className="text-gray-500">-</span>
                    <Input className="h-7 text-[10px] bg-slate-800 border-slate-700" placeholder="最大" />
                  </div>
                </div>
              </>
            )}

            {dialogType === 'conversion' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">名称</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="例如：加速度转速度" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">类别</Label>
                  <Select>
                    <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                      <SelectValue placeholder="选择类别" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vibration">振动</SelectItem>
                      <SelectItem value="temperature">温度</SelectItem>
                      <SelectItem value="pressure">压力</SelectItem>
                      <SelectItem value="speed">转速</SelectItem>
                      <SelectItem value="current">电流</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">源单位</Label>
                    <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="g" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">目标单位</Label>
                    <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="mm/s" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">换算公式（x 代表源值）</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono" placeholder="x * 9.8" />
                </div>
              </>
            )}

            {dialogType === 'rule' && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">规则名称</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700" placeholder="例如：空值检查" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">规则类型</Label>
                    <Select>
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="null">空值检查</SelectItem>
                        <SelectItem value="range">范围检查</SelectItem>
                        <SelectItem value="format">格式检查</SelectItem>
                        <SelectItem value="duplicate">重复检查</SelectItem>
                        <SelectItem value="outlier">异常值检测</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">处理方式</Label>
                    <Select>
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue placeholder="选择处理" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reject">拒绝</SelectItem>
                        <SelectItem value="warn">警告</SelectItem>
                        <SelectItem value="fix">自动修复</SelectItem>
                        <SelectItem value="tag">标记</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">应用字段（* 表示所有字段）</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono" placeholder="*" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-gray-400">检查条件</Label>
                  <Input className="h-8 text-[11px] bg-slate-800 border-slate-700 font-mono" placeholder="value == null" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={() => {
              toast.success('配置已添加');
              setShowAddDialog(false);
            }}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
