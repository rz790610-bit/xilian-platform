/**
 * 基础规则配置页面
 * 包含：编码规则、计量单位、设备类别、制造商、等级、故障类型等配置
 */
import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/common/Badge';
import { 
  Plus, Search, Edit2, Trash2, Save, X, ChevronRight, ChevronDown,
  Settings, Ruler, Tag, Factory, Star, AlertTriangle, FileCode
} from 'lucide-react';

// 配置项类型
type ConfigType = 'coding' | 'unit' | 'category' | 'manufacturer' | 'level' | 'fault';

interface ConfigItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  children?: ConfigItem[];
  status: 'active' | 'inactive';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 配置类型定义
const configTypes: { key: ConfigType; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'coding', label: '编码规则', icon: <FileCode className="w-4 h-4" />, description: '设备编码生成规则配置' },
  { key: 'unit', label: '计量单位', icon: <Ruler className="w-4 h-4" />, description: '各类计量单位配置' },
  { key: 'category', label: '设备类别', icon: <Tag className="w-4 h-4" />, description: '设备分类体系配置' },
  { key: 'manufacturer', label: '制造商', icon: <Factory className="w-4 h-4" />, description: '设备制造商信息' },
  { key: 'level', label: '等级标准', icon: <Star className="w-4 h-4" />, description: '设备等级、告警等级等' },
  { key: 'fault', label: '故障类型', icon: <AlertTriangle className="w-4 h-4" />, description: '故障分类和类型定义' },
];

// 预置数据
const defaultData: Record<ConfigType, ConfigItem[]> = {
  coding: [
    { id: 'c1', code: 'M', name: '机械设备', description: '机械类设备编码前缀', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'c2', code: 'E', name: '电气设备', description: '电气类设备编码前缀', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'c3', code: 'I', name: '仪表设备', description: '仪表类设备编码前缀', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'c4', code: 'P', name: '管道设备', description: '管道类设备编码前缀', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  unit: [
    { id: 'u1', code: 'mm', name: '毫米', description: '长度单位', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u2', code: 'm', name: '米', description: '长度单位', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u3', code: 'kg', name: '千克', description: '质量单位', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u4', code: 't', name: '吨', description: '质量单位', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u5', code: '℃', name: '摄氏度', description: '温度单位', status: 'active', sortOrder: 5, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u6', code: 'MPa', name: '兆帕', description: '压力单位', status: 'active', sortOrder: 6, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u7', code: 'mm/s', name: '毫米每秒', description: '振动速度单位', status: 'active', sortOrder: 7, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'u8', code: 'rpm', name: '转每分', description: '转速单位', status: 'active', sortOrder: 8, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  category: [
    { id: 'cat1', code: 'CONV', name: '输送机械', description: '皮带机、链式输送机等', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat2', code: 'CRANE', name: '起重机械', description: '门机、桥吊、堆取料机等', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat3', code: 'PUMP', name: '泵类设备', description: '离心泵、往复泵等', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat4', code: 'FAN', name: '风机设备', description: '离心风机、轴流风机等', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat5', code: 'COMP', name: '压缩机', description: '空压机、制冷压缩机等', status: 'active', sortOrder: 5, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat6', code: 'MOTOR', name: '电机设备', description: '异步电机、同步电机等', status: 'active', sortOrder: 6, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat7', code: 'GEAR', name: '减速机', description: '齿轮箱、减速器等', status: 'active', sortOrder: 7, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'cat8', code: 'HYD', name: '液压设备', description: '液压泵、液压缸等', status: 'active', sortOrder: 8, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  manufacturer: [
    { id: 'm1', code: 'SKF', name: 'SKF', description: '瑞典轴承制造商', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'm2', code: 'FAG', name: 'FAG', description: '德国轴承制造商', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'm3', code: 'NSK', name: 'NSK', description: '日本轴承制造商', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'm4', code: 'SEW', name: 'SEW', description: '德国减速机制造商', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'm5', code: 'ABB', name: 'ABB', description: '瑞士电气设备制造商', status: 'active', sortOrder: 5, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'm6', code: 'SIEMENS', name: '西门子', description: '德国电气设备制造商', status: 'active', sortOrder: 6, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  level: [
    { id: 'l1', code: 'A', name: '关键设备', description: '停机将导致重大生产损失', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l2', code: 'B', name: '重要设备', description: '停机将影响部分生产', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l3', code: 'C', name: '一般设备', description: '停机影响较小', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l4', code: 'DANGER', name: '危险', description: '告警等级-危险', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l5', code: 'ALARM', name: '报警', description: '告警等级-报警', status: 'active', sortOrder: 5, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l6', code: 'WARNING', name: '预警', description: '告警等级-预警', status: 'active', sortOrder: 6, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'l7', code: 'NORMAL', name: '正常', description: '告警等级-正常', status: 'active', sortOrder: 7, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
  fault: [
    { id: 'f1', code: 'UNBALANCE', name: '不平衡', description: '转子质量不平衡', status: 'active', sortOrder: 1, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f2', code: 'MISALIGN', name: '不对中', description: '轴系对中不良', status: 'active', sortOrder: 2, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f3', code: 'LOOSENESS', name: '松动', description: '机械松动', status: 'active', sortOrder: 3, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f4', code: 'BEARING', name: '轴承故障', description: '滚动轴承损伤', status: 'active', sortOrder: 4, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f5', code: 'GEAR', name: '齿轮故障', description: '齿轮磨损或损伤', status: 'active', sortOrder: 5, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f6', code: 'CAVITATION', name: '气蚀', description: '泵气蚀现象', status: 'active', sortOrder: 6, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f7', code: 'RESONANCE', name: '共振', description: '结构共振', status: 'active', sortOrder: 7, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: 'f8', code: 'ELECTRICAL', name: '电气故障', description: '电机电气问题', status: 'active', sortOrder: 8, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ],
};

// 本地存储键
const STORAGE_KEY = 'xilian_base_rules';

export default function BaseRules() {
  const [activeType, setActiveType] = useState<ConfigType>('coding');
  const [data, setData] = useState<Record<ConfigType, ConfigItem[]>>(defaultData);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<ConfigItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ConfigItem>>({});

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
  const saveData = (newData: Record<ConfigType, ConfigItem[]>) => {
    setData(newData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  };

  // 获取当前类型的数据
  const currentData = data[activeType] || [];
  const filteredData = currentData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 添加新项
  const handleAdd = () => {
    if (!newItem.code || !newItem.name) return;
    
    const item: ConfigItem = {
      id: `${activeType}_${Date.now()}`,
      code: newItem.code,
      name: newItem.name,
      description: newItem.description || '',
      status: 'active',
      sortOrder: currentData.length + 1,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    
    const newData = {
      ...data,
      [activeType]: [...currentData, item]
    };
    saveData(newData);
    setIsAdding(false);
    setNewItem({});
  };

  // 更新项
  const handleUpdate = () => {
    if (!editingItem) return;
    
    const newData = {
      ...data,
      [activeType]: currentData.map(item => 
        item.id === editingItem.id 
          ? { ...editingItem, updatedAt: new Date().toISOString().split('T')[0] }
          : item
      )
    };
    saveData(newData);
    setEditingItem(null);
  };

  // 删除项
  const handleDelete = (id: string) => {
    if (!confirm('确定要删除此项吗？')) return;
    
    const newData = {
      ...data,
      [activeType]: currentData.filter(item => item.id !== id)
    };
    saveData(newData);
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

  const activeConfig = configTypes.find(c => c.key === activeType);

  return (
    <MainLayout title="基础规则配置">
      <div className="animate-fade-up">
        {/* 页面标题 */}
        <div className="mb-4">
          <h2 className="text-base font-bold mb-1">基础规则配置</h2>
          <p className="text-xs text-muted-foreground">配置系统基础规则，包括编码规则、计量单位、设备类别等</p>
        </div>

        <div className="grid grid-cols-12 gap-3">
          {/* 左侧配置类型列表 */}
          <div className="col-span-3">
            <PageCard title="配置类型" className="h-full">
              <div className="space-y-1">
                {configTypes.map((config) => (
                  <div
                    key={config.key}
                    onClick={() => setActiveType(config.key)}
                    className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all ${
                      activeType === config.key
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-muted-foreground">{config.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{config.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{config.description}</div>
                    </div>
                    {activeType === config.key && (
                      <ChevronRight className="w-3 h-3 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            </PageCard>
          </div>

          {/* 右侧配置内容 */}
          <div className="col-span-9">
            <PageCard 
              title={activeConfig?.label || '配置项'}
              action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      placeholder="搜索..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-7 h-7 w-40 text-xs"
                    />
                  </div>
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
                  <div className="grid grid-cols-3 gap-2">
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
                    <Input
                      placeholder="描述（可选）"
                      value={newItem.description || ''}
                      onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                      className="h-7 text-xs"
                    />
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
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">编码</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">名称</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">描述</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">状态</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">更新时间</th>
                      <th className="text-right py-2 px-2 font-medium text-muted-foreground">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                        {editingItem?.id === item.id ? (
                          <>
                            <td className="py-2 px-2">
                              <Input
                                value={editingItem.code}
                                onChange={(e) => setEditingItem({ ...editingItem, code: e.target.value })}
                                className="h-6 text-xs w-20"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                value={editingItem.name}
                                onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                className="h-6 text-xs w-24"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Input
                                value={editingItem.description || ''}
                                onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                                className="h-6 text-xs"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant={editingItem.status === 'active' ? 'success' : 'default'}>
                                {editingItem.status === 'active' ? '启用' : '禁用'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">{item.updatedAt}</td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={handleUpdate} className="h-6 w-6 p-0">
                                  <Save className="w-3 h-3 text-green-500" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingItem(null)} className="h-6 w-6 p-0">
                                  <X className="w-3 h-3 text-muted-foreground" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-2">
                              <code className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{item.code}</code>
                            </td>
                            <td className="py-2 px-2 font-medium">{item.name}</td>
                            <td className="py-2 px-2 text-muted-foreground">{item.description || '-'}</td>
                            <td className="py-2 px-2">
                              <span onClick={() => toggleStatus(item.id)} className="cursor-pointer">
                                <Badge variant={item.status === 'active' ? 'success' : 'default'}>
                                  {item.status === 'active' ? '启用' : '禁用'}
                                </Badge>
                              </span>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">{item.updatedAt}</td>
                            <td className="py-2 px-2 text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => setEditingItem(item)} className="h-6 w-6 p-0">
                                  <Edit2 className="w-3 h-3 text-muted-foreground hover:text-primary" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="h-6 w-6 p-0">
                                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
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
        </div>
      </div>
    </MainLayout>
  );
}
