/**
 * 基础库页面
 * 包含：单位（组织）、人员、设备、部件、机构、零件、传感器等主数据管理
 */
import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/common/Badge';
import { 
  Plus, Search, Edit2, Trash2, Save, X, ChevronRight, ChevronDown,
  Building2, Users, Cpu, Box, Cog, CircuitBoard, Radio, Eye, Upload, Download
} from 'lucide-react';

// 库类型
type LibraryType = 'organization' | 'personnel' | 'equipment' | 'component' | 'mechanism' | 'part' | 'sensor';

// 基础数据项接口
interface BaseItem {
  id: string;
  code: string;
  name: string;
  parentId?: string;
  children?: BaseItem[];
  status: 'active' | 'inactive';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: any; // 扩展字段
}

// 组织单位
interface Organization extends BaseItem {
  type: 'company' | 'department' | 'team';
  level: number;
  manager?: string;
  contact?: string;
}

// 人员
interface Personnel extends BaseItem {
  orgId: string;
  orgName?: string;
  position: string;
  phone?: string;
  email?: string;
  skills?: string[];
}

// 设备
interface Equipment extends BaseItem {
  category: string;
  model: string;
  manufacturer: string;
  installDate?: string;
  location?: string;
  orgId?: string;
  level?: string;
}

// 部件/机构/零件
interface Component extends BaseItem {
  equipmentId?: string;
  equipmentName?: string;
  type: string;
  specification?: string;
  material?: string;
}

// 传感器
interface Sensor extends BaseItem {
  equipmentId?: string;
  equipmentName?: string;
  type: string;
  protocol: 'MQTT' | 'MODBUS' | 'TCP' | 'HTTP' | 'CSV';
  address?: string;
  unit?: string;
  range?: string;
}

// 库类型配置
const libraryTypes: { key: LibraryType; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'organization', label: '组织单位', icon: <Building2 className="w-4 h-4" />, description: '公司、部门、班组等' },
  { key: 'personnel', label: '人员信息', icon: <Users className="w-4 h-4" />, description: '员工信息管理' },
  { key: 'equipment', label: '设备台账', icon: <Cpu className="w-4 h-4" />, description: '设备基础信息' },
  { key: 'component', label: '部件库', icon: <Box className="w-4 h-4" />, description: '设备部件信息' },
  { key: 'mechanism', label: '机构库', icon: <Cog className="w-4 h-4" />, description: '设备机构信息' },
  { key: 'part', label: '零件库', icon: <CircuitBoard className="w-4 h-4" />, description: '零件信息管理' },
  { key: 'sensor', label: '传感器', icon: <Radio className="w-4 h-4" />, description: '采集点配置' },
];

// 预置数据
const defaultData: Record<LibraryType, BaseItem[]> = {
  organization: [
    { id: 'org1', code: '633A01', name: '日照港集团', type: 'company', level: 1, status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'org2', code: '633A0111', name: '岚山分公司', type: 'company', level: 2, parentId: 'org1', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'org3', code: '633A011104', name: '矿石输运部', type: 'department', level: 3, parentId: 'org2', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'org4', code: '633A01110401', name: '设备维护班', type: 'team', level: 4, parentId: 'org3', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  personnel: [
    { id: 'p1', code: 'EMP001', name: '张工', orgId: 'org4', orgName: '设备维护班', position: '高级工程师', phone: '138****1234', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'p2', code: 'EMP002', name: '李技师', orgId: 'org4', orgName: '设备维护班', position: '技师', phone: '139****5678', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'p3', code: 'EMP003', name: '王班长', orgId: 'org4', orgName: '设备维护班', position: '班长', phone: '137****9012', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  equipment: [
    { id: 'eq1', code: 'M-PUMP-001', name: '1#循环水泵', category: '泵类设备', model: 'IS100-80-160', manufacturer: 'KSB', installDate: '2020-05-15', location: '泵房A区', level: 'A', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'eq2', code: 'M-FAN-001', name: '1#引风机', category: '风机设备', model: 'Y4-73-11', manufacturer: '沈鼓', installDate: '2019-08-20', location: '风机房', level: 'A', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'eq3', code: 'M-GEAR-001', name: '1#减速机', category: '减速机', model: 'ZDY355', manufacturer: 'SEW', installDate: '2021-03-10', location: '传动区', level: 'B', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'eq4', code: 'M-CONV-001', name: '1#皮带机', category: '输送机械', model: 'DTL100/63/2×250', manufacturer: '中煤', installDate: '2018-12-01', location: '输送线', level: 'A', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  component: [
    { id: 'comp1', code: 'COMP-001', name: '驱动端轴承座', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '轴承座', specification: 'SNL516', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'comp2', code: 'COMP-002', name: '联轴器', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '联轴器', specification: 'LMZ-I 280', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'comp3', code: 'COMP-003', name: '叶轮', equipmentId: 'eq2', equipmentName: '1#引风机', type: '叶轮', specification: 'Φ1600', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  mechanism: [
    { id: 'mech1', code: 'MECH-001', name: '传动机构', equipmentId: 'eq4', equipmentName: '1#皮带机', type: '传动', specification: '双电机驱动', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'mech2', code: 'MECH-002', name: '张紧机构', equipmentId: 'eq4', equipmentName: '1#皮带机', type: '张紧', specification: '液压张紧', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'mech3', code: 'MECH-003', name: '制动机构', equipmentId: 'eq4', equipmentName: '1#皮带机', type: '制动', specification: '盘式制动', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  part: [
    { id: 'part1', code: 'PART-001', name: '驱动端轴承', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '轴承', specification: '6316-2Z', material: 'GCr15', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'part2', code: 'PART-002', name: '非驱动端轴承', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '轴承', specification: '6314-2Z', material: 'GCr15', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'part3', code: 'PART-003', name: '机械密封', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '密封', specification: 'HJ92N-80', material: 'SiC/C', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  sensor: [
    { id: 's1', code: 'SEN-001', name: '驱动端振动传感器', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '振动', protocol: 'MODBUS', address: '192.168.1.101:502', unit: 'mm/s', range: '0-50', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 's2', code: 'SEN-002', name: '非驱动端振动传感器', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '振动', protocol: 'MODBUS', address: '192.168.1.102:502', unit: 'mm/s', range: '0-50', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 's3', code: 'SEN-003', name: '轴承温度传感器', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '温度', protocol: 'MQTT', address: 'sensor/pump1/temp', unit: '℃', range: '0-150', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 's4', code: 'SEN-004', name: '出口压力传感器', equipmentId: 'eq1', equipmentName: '1#循环水泵', type: '压力', protocol: 'MODBUS', address: '192.168.1.103:502', unit: 'MPa', range: '0-2', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
};

// 列配置
const columnConfigs: Record<LibraryType, { key: string; label: string; width?: string }[]> = {
  organization: [
    { key: 'code', label: '编码', width: 'w-24' },
    { key: 'name', label: '名称' },
    { key: 'type', label: '类型', width: 'w-20' },
    { key: 'level', label: '层级', width: 'w-16' },
  ],
  personnel: [
    { key: 'code', label: '工号', width: 'w-20' },
    { key: 'name', label: '姓名', width: 'w-20' },
    { key: 'orgName', label: '所属部门' },
    { key: 'position', label: '职位', width: 'w-24' },
    { key: 'phone', label: '联系电话', width: 'w-28' },
  ],
  equipment: [
    { key: 'code', label: '设备编码', width: 'w-28' },
    { key: 'name', label: '设备名称' },
    { key: 'category', label: '类别', width: 'w-20' },
    { key: 'model', label: '型号', width: 'w-28' },
    { key: 'manufacturer', label: '制造商', width: 'w-16' },
    { key: 'level', label: '等级', width: 'w-12' },
  ],
  component: [
    { key: 'code', label: '编码', width: 'w-24' },
    { key: 'name', label: '名称' },
    { key: 'equipmentName', label: '所属设备' },
    { key: 'type', label: '类型', width: 'w-20' },
    { key: 'specification', label: '规格', width: 'w-24' },
  ],
  mechanism: [
    { key: 'code', label: '编码', width: 'w-24' },
    { key: 'name', label: '名称' },
    { key: 'equipmentName', label: '所属设备' },
    { key: 'type', label: '类型', width: 'w-20' },
    { key: 'specification', label: '规格', width: 'w-24' },
  ],
  part: [
    { key: 'code', label: '编码', width: 'w-24' },
    { key: 'name', label: '名称' },
    { key: 'equipmentName', label: '所属设备' },
    { key: 'type', label: '类型', width: 'w-16' },
    { key: 'specification', label: '规格', width: 'w-24' },
    { key: 'material', label: '材质', width: 'w-16' },
  ],
  sensor: [
    { key: 'code', label: '编码', width: 'w-24' },
    { key: 'name', label: '名称' },
    { key: 'equipmentName', label: '所属设备' },
    { key: 'type', label: '类型', width: 'w-16' },
    { key: 'protocol', label: '协议', width: 'w-20' },
    { key: 'unit', label: '单位', width: 'w-16' },
  ],
};

// 本地存储键
const STORAGE_KEY = 'xilian_base_library';

export default function BaseLibrary() {
  const [activeType, setActiveType] = useState<LibraryType>('equipment');
  const [data, setData] = useState<Record<LibraryType, BaseItem[]>>(defaultData);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<BaseItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<Partial<BaseItem>>({});
  const [selectedItem, setSelectedItem] = useState<BaseItem | null>(null);

  // 加载数据
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setData(JSON.parse(saved));
      } catch {
        setData(defaultData);
      }
    }
  }, []);

  // 保存数据
  const saveData = (newData: Record<LibraryType, BaseItem[]>) => {
    setData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  };

  // 获取当前类型的数据
  const currentData = data[activeType] || [];
  const filteredData = currentData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 获取列配置
  const columns = columnConfigs[activeType] || [];

  // 添加新项
  const handleAdd = () => {
    if (!newItem.code || !newItem.name) return;
    
    const item: BaseItem = {
      id: `${activeType}_${Date.now()}`,
      code: newItem.code,
      name: newItem.name,
      status: 'active',
      sortOrder: currentData.length + 1,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      ...newItem
    };
    
    const newData = {
      ...data,
      [activeType]: [...currentData, item]
    };
    saveData(newData);
    setIsAdding(false);
    setNewItem({});
  };

  // 删除项
  const handleDelete = (id: string) => {
    if (!confirm('确定要删除此项吗？')) return;
    
    const newData = {
      ...data,
      [activeType]: currentData.filter(item => item.id !== id)
    };
    saveData(newData);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  // 切换状态
  const toggleStatus = (id: string) => {
    const newData = {
      ...data,
      [activeType]: currentData.map(item => 
        item.id === id 
          ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' as const }
          : item
      )
    };
    saveData(newData);
  };

  const activeConfig = libraryTypes.find(c => c.key === activeType);

  // 渲染详情面板
  const renderDetailPanel = () => {
    if (!selectedItem) {
      return (
        <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
          <div className="text-center">
            <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>选择一条记录查看详情</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium">{selectedItem.name}</h4>
          <Badge variant={selectedItem.status === 'active' ? 'success' : 'default'}>
            {selectedItem.status === 'active' ? '启用' : '禁用'}
          </Badge>
        </div>
        
        <div className="space-y-2 text-xs">
          {Object.entries(selectedItem).map(([key, value]) => {
            if (['id', 'children', 'sortOrder'].includes(key)) return null;
            if (value === undefined || value === null || value === '') return null;
            
            const labelMap: Record<string, string> = {
              code: '编码',
              name: '名称',
              type: '类型',
              level: '等级/层级',
              status: '状态',
              createdAt: '创建时间',
              updatedAt: '更新时间',
              parentId: '上级ID',
              orgId: '组织ID',
              orgName: '所属组织',
              position: '职位',
              phone: '电话',
              email: '邮箱',
              category: '类别',
              model: '型号',
              manufacturer: '制造商',
              installDate: '安装日期',
              location: '位置',
              equipmentId: '设备ID',
              equipmentName: '所属设备',
              specification: '规格',
              material: '材质',
              protocol: '协议',
              address: '地址',
              unit: '单位',
              range: '量程',
            };
            
            return (
              <div key={key} className="flex">
                <span className="text-muted-foreground w-20 shrink-0">{labelMap[key] || key}:</span>
                <span className="text-foreground">{String(value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <MainLayout title="基础库">
      <div className="animate-fade-up">
        {/* 页面标题 */}
        <div className="mb-4">
          <h2 className="text-base font-bold mb-1">基础库</h2>
          <p className="text-xs text-muted-foreground">管理组织、人员、设备、部件、机构、零件、传感器等主数据</p>
        </div>

        <div className="grid grid-cols-12 gap-3">
          {/* 左侧库类型列表 */}
          <div className="col-span-2">
            <PageCard title="数据类型" className="h-full">
              <div className="space-y-1">
                {libraryTypes.map((lib) => (
                  <div
                    key={lib.key}
                    onClick={() => { setActiveType(lib.key); setSelectedItem(null); }}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all ${
                      activeType === lib.key
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-muted-foreground">{lib.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium truncate">{lib.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>

          {/* 中间数据列表 */}
          <div className="col-span-7">
            <PageCard 
              title={activeConfig?.label || '数据列表'}
              action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      placeholder="搜索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-7 h-7 w-32 text-xs"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Upload className="w-3 h-3 mr-1" />
                    导入
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <Download className="w-3 h-3 mr-1" />
                    导出
                  </Button>
                  <Button size="sm" onClick={() => setIsAdding(true)} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    新增
                  </Button>
                </div>
              }
            >
              {/* 新增表单 */}
              {isAdding && (
                <div className="mb-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="text-xs font-medium mb-2">新增{activeConfig?.label}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <Input
                      placeholder="编码"
                      value={newItem.code || ''}
                      onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
                      className="h-7 text-xs"
                    />
                    <Input
                      placeholder="名称"
                      value={newItem.name || ''}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      className="h-7 text-xs"
                    />
                    {activeType === 'equipment' && (
                      <>
                        <Input
                          placeholder="类别"
                          value={(newItem as any).category || ''}
                          onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="型号"
                          value={(newItem as any).model || ''}
                          onChange={(e) => setNewItem({ ...newItem, model: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" size="sm" onClick={() => { setIsAdding(false); setNewItem({}); }} className="h-6 text-xs">
                      <X className="w-3 h-3 mr-1" />
                      取消
                    </Button>
                    <Button size="sm" onClick={handleAdd} className="h-6 text-xs">
                      <Save className="w-3 h-3 mr-1" />
                      保存
                    </Button>
                  </div>
                </div>
              )}

              {/* 数据表格 */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {columns.map(col => (
                        <th key={col.key} className={`text-left py-2 px-2 font-medium text-muted-foreground ${col.width || ''}`}>
                          {col.label}
                        </th>
                      ))}
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground w-14">状态</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground w-16">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item) => (
                      <tr 
                        key={item.id} 
                        className={`border-b border-border/50 cursor-pointer transition-colors ${
                          selectedItem?.id === item.id ? 'bg-primary/10' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => setSelectedItem(item)}
                      >
                        {columns.map(col => (
                          <td key={col.key} className={`py-2 px-2 ${col.width || ''}`}>
                            {col.key === 'code' ? (
                              <code className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{item[col.key]}</code>
                            ) : col.key === 'level' ? (
                              <Badge variant={item[col.key] === 'A' ? 'danger' : item[col.key] === 'B' ? 'warning' : 'default'}>
                                {item[col.key]}
                              </Badge>
                            ) : col.key === 'protocol' ? (
                              <Badge variant="info">{item[col.key]}</Badge>
                            ) : (
                              <span className={col.key === 'name' ? 'font-medium' : 'text-muted-foreground'}>
                                {item[col.key] || '-'}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-2">
                          <span onClick={(e) => { e.stopPropagation(); toggleStatus(item.id); }} className="cursor-pointer">
                            <Badge variant={item.status === 'active' ? 'success' : 'default'}>
                              {item.status === 'active' ? '启用' : '禁用'}
                            </Badge>
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} 
                              className="h-6 w-6 p-0"
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredData.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  暂无数据
                </div>
              )}

              {/* 统计信息 */}
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
                <span>共 {filteredData.length} 条记录</span>
                <span>启用 {filteredData.filter(i => i.status === 'active').length} 条</span>
              </div>
            </PageCard>
          </div>

          {/* 右侧详情面板 */}
          <div className="col-span-3">
            <PageCard title="详细信息" className="h-full">
              {renderDetailPanel()}
            </PageCard>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
