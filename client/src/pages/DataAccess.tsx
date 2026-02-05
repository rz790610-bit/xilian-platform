/**
 * 数据接入页面
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
  Database,
  FileSpreadsheet,
  Globe,
  Radio,
  Server,
  Cpu,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Upload,
  Link,
  Play,
  Pause
} from 'lucide-react';
import type { DataSource, DataSourceType } from '@/types';

// 模拟数据源列表
const mockDataSources: DataSource[] = [
  {
    id: '1',
    name: '生产线振动数据',
    type: 'file',
    description: 'CSV格式的振动传感器历史数据',
    config: { fileType: 'csv', delimiter: ',', encoding: 'utf-8' },
    status: 'connected',
    lastSync: new Date('2026-01-31T10:30:00'),
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-31')
  },
  {
    id: '2',
    name: 'InfluxDB时序数据库',
    type: 'database',
    description: '存储实时传感器数据的时序数据库',
    config: { dbType: 'influxdb', host: '192.168.1.100', port: 8086, database: 'sensors' },
    status: 'connected',
    lastSync: new Date('2026-02-01T07:00:00'),
    createdAt: new Date('2026-01-10'),
    updatedAt: new Date('2026-02-01')
  },
  {
    id: '3',
    name: '设备状态API',
    type: 'api',
    description: 'MES系统设备状态接口',
    config: { apiUrl: 'http://mes.local/api/devices', apiMethod: 'GET', apiAuth: 'bearer' },
    status: 'error',
    createdAt: new Date('2026-01-20'),
    updatedAt: new Date('2026-01-28')
  },
  {
    id: '4',
    name: 'MQTT传感器网关',
    type: 'mqtt',
    description: '实时采集传感器数据的MQTT订阅',
    config: { mqttBroker: '192.168.1.50', mqttPort: 1883, mqttTopic: 'sensors/#', mqttQos: 1 },
    status: 'syncing',
    createdAt: new Date('2026-01-25'),
    updatedAt: new Date('2026-02-01')
  },
  {
    id: '5',
    name: 'OPC-UA服务器',
    type: 'opcua',
    description: 'PLC数据采集OPC-UA连接',
    config: { opcuaEndpoint: 'opc.tcp://192.168.1.60:4840', opcuaSecurityMode: 'Sign' },
    status: 'disconnected',
    createdAt: new Date('2026-01-22'),
    updatedAt: new Date('2026-01-30')
  }
];

// 数据源类型配置
const dataSourceTypes: { type: DataSourceType; name: string; icon: React.ReactNode; description: string }[] = [
  { type: 'file', name: '文件导入', icon: <FileSpreadsheet className="w-4 h-4" />, description: 'CSV、Excel、JSON、Parquet' },
  { type: 'database', name: '数据库', icon: <Database className="w-4 h-4" />, description: 'MySQL、PostgreSQL、InfluxDB' },
  { type: 'api', name: 'API接口', icon: <Globe className="w-4 h-4" />, description: 'REST API、GraphQL' },
  { type: 'mqtt', name: 'MQTT', icon: <Radio className="w-4 h-4" />, description: 'MQTT消息队列' },
  { type: 'opcua', name: 'OPC-UA', icon: <Server className="w-4 h-4" />, description: 'OPC-UA工业协议' },
  { type: 'modbus', name: 'Modbus', icon: <Cpu className="w-4 h-4" />, description: 'Modbus TCP/RTU' }
];

// 状态图标组件
function StatusIcon({ status }: { status: DataSource['status'] }) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
    case 'disconnected':
      return <XCircle className="w-3.5 h-3.5 text-gray-400" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'syncing':
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
    default:
      return null;
  }
}

// 状态文本
function getStatusText(status: DataSource['status']) {
  const map = {
    connected: '已连接',
    disconnected: '未连接',
    error: '连接错误',
    syncing: '同步中'
  };
  return map[status];
}

// 类型图标
function getTypeIcon(type: DataSourceType) {
  const found = (dataSourceTypes || []).find(t => t.type === type);
  return found?.icon || <Database className="w-4 h-4" />;
}

export default function DataAccess() {
  const toast = useToast();
  const [dataSources, setDataSources] = useState<DataSource[]>(mockDataSources);
  const [selectedSource, setSelectedSource] = useState<DataSource | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [newSourceType, setNewSourceType] = useState<DataSourceType>('file');
  const [newSourceName, setNewSourceName] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // 过滤数据源
  const filteredSources = activeTab === 'all' 
    ? dataSources 
    : (dataSources || []).filter(s => s.type === activeTab);

  // 添加数据源
  const handleAddSource = () => {
    if (!newSourceName.trim()) {
      toast.error('请输入数据源名称');
      return;
    }
    const newSource: DataSource = {
      id: Date.now().toString(),
      name: newSourceName,
      type: newSourceType,
      config: {},
      status: 'disconnected',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setDataSources([...dataSources, newSource]);
    setShowAddDialog(false);
    setNewSourceName('');
    toast.success(`数据源 "${newSourceName}" 已创建`);
  };

  // 删除数据源
  const handleDeleteSource = (id: string) => {
    setDataSources(dataSources.filter(s => s.id !== id));
    toast.success('数据源已删除');
  };

  // 同步数据源
  const handleSyncSource = (source: DataSource) => {
    setDataSources(dataSources.map(s => 
      s.id === source.id ? { ...s, status: 'syncing' as const } : s
    ));
    toast.info(`正在同步 "${source.name}"...`);
    
    // 模拟同步完成
    setTimeout(() => {
      setDataSources(prev => prev.map(s => 
        s.id === source.id ? { ...s, status: 'connected' as const, lastSync: new Date() } : s
      ));
      toast.success(`"${source.name}" 同步完成`);
    }, 2000);
  };

  // 测试连接
  const handleTestConnection = (source: DataSource) => {
    toast.info(`正在测试 "${source.name}" 连接...`);
    setTimeout(() => {
      const success = Math.random() > 0.3;
      if (success) {
        setDataSources(prev => prev.map(s => 
          s.id === source.id ? { ...s, status: 'connected' as const } : s
        ));
        toast.success('连接测试成功');
      } else {
        setDataSources(prev => prev.map(s => 
          s.id === source.id ? { ...s, status: 'error' as const } : s
        ));
        toast.error('连接测试失败');
      }
    }, 1500);
  };

  return (
    <MainLayout title="数据接入">
      <div className="space-y-3">
        {/* 顶部操作栏 */}
        <div className="flex items-center justify-between">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-7 bg-slate-800/50">
              <TabsTrigger value="all" className="text-[10px] h-5 px-2">全部</TabsTrigger>
              <TabsTrigger value="file" className="text-[10px] h-5 px-2">文件</TabsTrigger>
              <TabsTrigger value="database" className="text-[10px] h-5 px-2">数据库</TabsTrigger>
              <TabsTrigger value="api" className="text-[10px] h-5 px-2">API</TabsTrigger>
              <TabsTrigger value="mqtt" className="text-[10px] h-5 px-2">MQTT</TabsTrigger>
              <TabsTrigger value="opcua" className="text-[10px] h-5 px-2">OPC-UA</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-7 text-[10px]" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-3 h-3 mr-1" />
            添加数据源
          </Button>
        </div>

        {/* 数据源列表 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {(filteredSources || []).map(source => (
            <PageCard key={source.id} className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  <div className="p-1.5 rounded bg-slate-700/50 text-blue-400">
                    {getTypeIcon(source.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-white">{source.name}</span>
                      <StatusIcon status={source.status} />
                      <span className={`text-[9px] ${
                        source.status === 'connected' ? 'text-emerald-400' :
                        source.status === 'error' ? 'text-red-400' :
                        source.status === 'syncing' ? 'text-blue-400' :
                        'text-gray-400'
                      }`}>
                        {getStatusText(source.status)}
                      </span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-0.5">{source.description || '暂无描述'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-gray-500">
                        类型: {dataSourceTypes.find(t => t.type === source.type)?.name}
                      </span>
                      {source.lastSync && (
                        <span className="text-[9px] text-gray-500">
                          上次同步: {source.lastSync.toLocaleString('zh-CN')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => handleSyncSource(source)}
                    disabled={source.status === 'syncing'}
                  >
                    <RefreshCw className={`w-3 h-3 ${source.status === 'syncing' ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setSelectedSource(source);
                      setShowConfigDialog(true);
                    }}
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                    onClick={() => handleDeleteSource(source.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </PageCard>
          ))}
        </div>

        {filteredSources.length === 0 && (
          <PageCard className="p-6 text-center">
            <Database className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-[11px] text-gray-400">暂无数据源</p>
            <Button 
              size="sm" 
              variant="outline" 
              className="mt-2 h-7 text-[10px]"
              onClick={() => setShowAddDialog(true)}
            >
              添加数据源
            </Button>
          </PageCard>
        )}

        {/* 数据接入统计 */}
        <div className="grid grid-cols-4 gap-2">
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-white">{dataSources.length}</div>
              <div className="text-[9px] text-gray-400">数据源总数</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">
                {(dataSources || []).filter(s => s.status === 'connected').length}
              </div>
              <div className="text-[9px] text-gray-400">已连接</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-400">
                {(dataSources || []).filter(s => s.status === 'syncing').length}
              </div>
              <div className="text-[9px] text-gray-400">同步中</div>
            </div>
          </PageCard>
          <PageCard className="p-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-red-400">
                {(dataSources || []).filter(s => s.status === 'error').length}
              </div>
              <div className="text-[9px] text-gray-400">异常</div>
            </div>
          </PageCard>
        </div>
      </div>

      {/* 添加数据源对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm text-white">添加数据源</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-400">数据源名称</Label>
              <Input 
                className="h-8 text-[11px] bg-slate-800 border-slate-700"
                placeholder="请输入数据源名称"
                value={newSourceName}
                onChange={e => setNewSourceName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-gray-400">数据源类型</Label>
              <div className="grid grid-cols-3 gap-2">
                {(dataSourceTypes || []).map(type => (
                  <button
                    key={type.type}
                    className={`p-2 rounded border text-left transition-colors ${
                      newSourceType === type.type 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                    onClick={() => setNewSourceType(type.type)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-blue-400">{type.icon}</span>
                      <span className="text-[10px] font-medium text-white">{type.name}</span>
                    </div>
                    <p className="text-[8px] text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={handleAddSource}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 配置数据源对话框 */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm text-white">
              配置数据源 - {selectedSource?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedSource && (
            <div className="space-y-3 py-2">
              <Tabs defaultValue="connection">
                <TabsList className="h-7 bg-slate-800/50">
                  <TabsTrigger value="connection" className="text-[10px] h-5 px-2">连接配置</TabsTrigger>
                  <TabsTrigger value="mapping" className="text-[10px] h-5 px-2">字段映射</TabsTrigger>
                  <TabsTrigger value="schedule" className="text-[10px] h-5 px-2">同步计划</TabsTrigger>
                </TabsList>
                
                <TabsContent value="connection" className="mt-3 space-y-3">
                  {selectedSource.type === 'file' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">文件类型</Label>
                        <Select defaultValue={selectedSource.config.fileType || 'csv'}>
                          <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="excel">Excel</SelectItem>
                            <SelectItem value="json">JSON</SelectItem>
                            <SelectItem value="parquet">Parquet</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">文件编码</Label>
                        <Select defaultValue="utf-8">
                          <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="utf-8">UTF-8</SelectItem>
                            <SelectItem value="gbk">GBK</SelectItem>
                            <SelectItem value="gb2312">GB2312</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">分隔符</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue=","
                        />
                      </div>
                      <Button size="sm" className="h-7 text-[10px] w-full">
                        <Upload className="w-3 h-3 mr-1" />
                        上传文件
                      </Button>
                    </>
                  )}
                  
                  {selectedSource.type === 'database' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">数据库类型</Label>
                          <Select defaultValue={selectedSource.config.dbType || 'mysql'}>
                            <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mysql">MySQL</SelectItem>
                              <SelectItem value="postgresql">PostgreSQL</SelectItem>
                              <SelectItem value="influxdb">InfluxDB</SelectItem>
                              <SelectItem value="timescaledb">TimescaleDB</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">端口</Label>
                          <Input 
                            className="h-8 text-[11px] bg-slate-800 border-slate-700"
                            defaultValue={selectedSource.config.port?.toString() || '3306'}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">主机地址</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue={selectedSource.config.host || ''}
                          placeholder="192.168.1.100"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">数据库名</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue={selectedSource.config.database || ''}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">用户名</Label>
                          <Input 
                            className="h-8 text-[11px] bg-slate-800 border-slate-700"
                            placeholder="root"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">密码</Label>
                          <Input 
                            type="password"
                            className="h-8 text-[11px] bg-slate-800 border-slate-700"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="ssl" />
                        <Label htmlFor="ssl" className="text-[10px] text-gray-400">启用 SSL 连接</Label>
                      </div>
                    </>
                  )}

                  {selectedSource.type === 'mqtt' && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">Broker 地址</Label>
                          <Input 
                            className="h-8 text-[11px] bg-slate-800 border-slate-700"
                            defaultValue={selectedSource.config.mqttBroker || ''}
                            placeholder="192.168.1.50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">端口</Label>
                          <Input 
                            className="h-8 text-[11px] bg-slate-800 border-slate-700"
                            defaultValue={selectedSource.config.mqttPort?.toString() || '1883'}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">订阅主题</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue={selectedSource.config.mqttTopic || ''}
                          placeholder="sensors/#"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">QoS 级别</Label>
                        <Select defaultValue={selectedSource.config.mqttQos?.toString() || '1'}>
                          <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">QoS 0 - 最多一次</SelectItem>
                            <SelectItem value="1">QoS 1 - 至少一次</SelectItem>
                            <SelectItem value="2">QoS 2 - 恰好一次</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {selectedSource.type === 'api' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">API 地址</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue={selectedSource.config.apiUrl || ''}
                          placeholder="https://api.example.com/data"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">请求方法</Label>
                          <Select defaultValue={selectedSource.config.apiMethod || 'GET'}>
                            <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-gray-400">认证方式</Label>
                          <Select defaultValue={selectedSource.config.apiAuth || 'none'}>
                            <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">无认证</SelectItem>
                              <SelectItem value="basic">Basic Auth</SelectItem>
                              <SelectItem value="bearer">Bearer Token</SelectItem>
                              <SelectItem value="apikey">API Key</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">认证令牌</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          placeholder="Bearer token 或 API Key"
                        />
                      </div>
                    </>
                  )}

                  {selectedSource.type === 'opcua' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">OPC-UA 端点</Label>
                        <Input 
                          className="h-8 text-[11px] bg-slate-800 border-slate-700"
                          defaultValue={selectedSource.config.opcuaEndpoint || ''}
                          placeholder="opc.tcp://192.168.1.60:4840"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">安全模式</Label>
                        <Select defaultValue={selectedSource.config.opcuaSecurityMode || 'None'}>
                          <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="None">无安全</SelectItem>
                            <SelectItem value="Sign">签名</SelectItem>
                            <SelectItem value="SignAndEncrypt">签名并加密</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-400">节点 ID 列表</Label>
                        <textarea 
                          className="w-full h-20 text-[11px] bg-slate-800 border border-slate-700 rounded p-2 text-white resize-none"
                          placeholder="每行一个节点ID，如：&#10;ns=2;s=Temperature&#10;ns=2;s=Pressure"
                        />
                      </div>
                    </>
                  )}

                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-7 text-[10px] w-full"
                    onClick={() => handleTestConnection(selectedSource)}
                  >
                    <Link className="w-3 h-3 mr-1" />
                    测试连接
                  </Button>
                </TabsContent>

                <TabsContent value="mapping" className="mt-3 space-y-3">
                  <p className="text-[10px] text-gray-400">配置源数据字段与标准字段的映射关系</p>
                  <div className="space-y-2">
                    {['timestamp', 'device_id', 'measure_point', 'value', 'unit'].map(field => (
                      <div key={field} className="flex items-center gap-2">
                        <Input 
                          className="h-7 text-[10px] bg-slate-800 border-slate-700 flex-1"
                          placeholder="源字段名"
                        />
                        <span className="text-gray-500">→</span>
                        <div className="flex-1 h-7 px-2 bg-slate-700/50 rounded border border-slate-600 flex items-center">
                          <span className="text-[10px] text-gray-300">{field}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]">
                    <Plus className="w-3 h-3 mr-1" />
                    添加映射
                  </Button>
                </TabsContent>

                <TabsContent value="schedule" className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] text-gray-400">启用自动同步</Label>
                    <Switch defaultChecked />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">同步间隔</Label>
                    <Select defaultValue="300">
                      <SelectTrigger className="h-8 text-[11px] bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">每分钟</SelectItem>
                        <SelectItem value="300">每5分钟</SelectItem>
                        <SelectItem value="900">每15分钟</SelectItem>
                        <SelectItem value="1800">每30分钟</SelectItem>
                        <SelectItem value="3600">每小时</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">重试次数</Label>
                    <Input 
                      type="number"
                      className="h-8 text-[11px] bg-slate-800 border-slate-700"
                      defaultValue="3"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-gray-400">超时时间（秒）</Label>
                    <Input 
                      type="number"
                      className="h-8 text-[11px] bg-slate-800 border-slate-700"
                      defaultValue="30"
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowConfigDialog(false)}>
              取消
            </Button>
            <Button size="sm" className="h-7 text-[10px]" onClick={() => {
              toast.success('配置已保存');
              setShowConfigDialog(false);
            }}>
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
