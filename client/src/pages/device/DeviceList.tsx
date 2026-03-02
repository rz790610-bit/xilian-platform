/**
 * 设备列表页面
 * 从 device / database.asset tRPC 路由获取真实数据，支持优雅降级
 */

import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit,
  Trash2,
  Eye,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ServerCrash,
  Database
} from 'lucide-react';

// ============ 类型定义 ============
interface DeviceRecord {
  id: string;
  name: string;
  type: string;
  status: string;
  location?: string;
  lastUpdate?: string;
  metadata?: Record<string, unknown>;
}

// ============ 常量配置 ============
const deviceTypeOptions = [
  { value: 'all', label: '全部类型' },
  { value: 'agv', label: 'AGV' },
  { value: 'rtg', label: 'RTG' },
  { value: 'qc', label: '岸桥' },
  { value: 'conveyor', label: '传送带' },
  { value: 'pump', label: '泵' },
  { value: 'motor', label: '电机' },
  { value: 'sensor_hub', label: '传感器集线器' },
  { value: 'gateway', label: '网关' },
  { value: 'plc', label: 'PLC' },
  { value: 'robot', label: '机器人' },
  { value: 'camera', label: '摄像头' },
  { value: 'other', label: '其他' },
];

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  online: { label: '在线', color: 'bg-green-500', icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
  offline: { label: '离线', color: 'bg-gray-500', icon: <XCircle className="h-4 w-4 text-gray-500" /> },
  error: { label: '告警', color: 'bg-yellow-500', icon: <AlertTriangle className="h-4 w-4 text-yellow-500" /> },
  maintenance: { label: '维护中', color: 'bg-blue-500', icon: <Clock className="h-4 w-4 text-blue-500" /> },
  unknown: { label: '未知', color: 'bg-gray-300', icon: <Clock className="h-4 w-4 text-gray-300" /> },
};

// ============ 骨架屏组件 ============
function DeviceListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-20" /></CardHeader>
            <CardContent><Skeleton className="h-8 w-12" /></CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
        <CardContent>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b last:border-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ 空状态组件 ============
function EmptyState({ hasError }: { hasError?: boolean }) {
  return (
    <Card className="py-16">
      <CardContent className="flex flex-col items-center justify-center text-center">
        {hasError ? (
          <>
            <ServerCrash className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">数据源未连接</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              无法连接到设备管理数据库。请检查数据库配置是否正确，或联系管理员。
            </p>
          </>
        ) : (
          <>
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">暂无设备数据</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              尚未添加任何设备。点击"添加设备"按钮开始注册您的第一台设备。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============ 主组件 ============
export default function DeviceList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewDeviceId, setViewDeviceId] = useState<string | null>(null);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const [configDeviceId, setConfigDeviceId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Debounce search term to avoid excessive server requests
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [searchTerm]);

  // ============ tRPC 数据获取 ============
  const deviceQuery = trpc.device.listDevices.useQuery(
    {
      type: typeFilter !== 'all' ? typeFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      search: debouncedSearch || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    {
      retry: 1,
      refetchInterval: 30000, // 30秒自动刷新
    }
  );

  // stats 通过 list 结果计算，无独立 stats 端点
  const statsQuery = { data: null as any, refetch: () => deviceQuery.refetch() };

  const createMutation = trpc.device.createDevice.useMutation({
    onSuccess: () => {
      toast.success('设备添加成功');
      setIsAddDialogOpen(false);
      deviceQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err: any) => toast.error(`添加失败: ${err.message}`),
  });

  const deleteMutation = trpc.device.deleteDevice.useMutation({
    onSuccess: () => {
      toast.success('设备已删除');
      deviceQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err: any) => toast.error(`删除失败: ${err.message}`),
  });

  // 查看设备详情
  const viewQuery = trpc.device.getDevice.useQuery(
    { nodeId: viewDeviceId! },
    { enabled: !!viewDeviceId, retry: 1 }
  );

  // 编辑设备 — 复用 view query 获取初始数据
  const editQuery = trpc.device.getDevice.useQuery(
    { nodeId: editDeviceId! },
    { enabled: !!editDeviceId, retry: 1 }
  );
  const updateMutation = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => {
      toast.success('设备信息已更新');
      setEditDeviceId(null);
      deviceQuery.refetch();
    },
    onError: (err: any) => toast.error(`更新失败: ${err.message}`),
  });

  // 设备配置 — 传感器列表
  const configSensorsQuery = trpc.device.listSensors.useQuery(
    { nodeId: configDeviceId! },
    { enabled: !!configDeviceId, retry: 1 }
  );
  const configDeviceQuery = trpc.device.getDevice.useQuery(
    { nodeId: configDeviceId! },
    { enabled: !!configDeviceId, retry: 1 }
  );

  // ============ 数据处理 ============
  const rawData = deviceQuery.data;
  const devices: DeviceRecord[] = Array.isArray(rawData)
    ? rawData.map((d: any) => ({
        id: d.nodeId ?? d.id,
        name: d.name,
        type: d.type ?? d.nodeType,
        status: d.status,
        location: d.location,
        lastUpdate: d.lastHeartbeat ?? d.lastUpdate,
        metadata: d.metadata,
      }))
    : (rawData as any)?.items ?? (rawData as any)?.data ?? [];
  const totalCount = Array.isArray(rawData) ? rawData.length : ((rawData as any)?.total ?? devices.length);
  const isLoading = deviceQuery.isLoading;
  const isError = deviceQuery.isError;

  const stats = statsQuery.data as any;
  const onlineCount = stats?.online ?? devices.filter((d: DeviceRecord) => d.status === 'online').length;
  const errorCount = stats?.error ?? stats?.warning ?? devices.filter((d: DeviceRecord) => d.status === 'error').length;
  const offlineCount = stats?.offline ?? devices.filter((d: DeviceRecord) => d.status === 'offline').length;

  // ============ 事件处理 ============
  const handleAddDevice = (formData: FormData) => {
    const name = formData.get('name') as string;
    const type = formData.get('type') as string;
    const location = formData.get('location') as string;
    if (!name) { toast.error('请输入设备名称'); return; }
    createMutation.mutate({
      name,
      type: (type || 'other') as any,
      nodeId: `DEV-${Date.now()}`,
      location: location || undefined,
    });
  };

  const handleDeleteDevice = (id: string) => {
    if (confirm('确定要删除该设备吗？')) {
      deleteMutation.mutate({ nodeId: id });
    }
  };

  const handleRefresh = () => {
    deviceQuery.refetch();
    statsQuery.refetch();
    toast.info('正在刷新数据...');
  };

  // ============ 加载状态 ============
  if (isLoading) {
    return (
      <MainLayout title="设备列表">
        <DeviceListSkeleton />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="设备列表">
      <div className="space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">设备列表</h1>
            <p className="text-sm text-muted-foreground">
              管理和监控所有设备
              {isError && <span className="text-yellow-500 ml-2">（数据源连接异常，显示可能不完整）</span>}
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                添加设备
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={(e) => { e.preventDefault(); handleAddDevice(new FormData(e.currentTarget)); }}>
                <DialogHeader>
                  <DialogTitle>添加新设备</DialogTitle>
                  <DialogDescription>填写设备信息以添加新设备</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right">设备名称</Label>
                    <Input id="name" name="name" className="col-span-3" placeholder="输入设备名称" required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="type" className="text-right">设备类型</Label>
                    <Select name="type">
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="选择设备类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {deviceTypeOptions.slice(1).map(type => (
                          <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="location" className="text-right">位置</Label>
                    <Input id="location" name="location" className="col-span-3" placeholder="输入设备位置" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" type="button" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? '添加中...' : '添加'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">设备总数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                在线设备
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{onlineCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                告警设备
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-500">{errorCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-gray-500" />
                离线设备
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-500">{offlineCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* 筛选和搜索 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              筛选条件
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索设备名称或ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="设备类型" />
                </SelectTrigger>
                <SelectContent>
                  {deviceTypeOptions.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="设备状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="online">在线</SelectItem>
                  <SelectItem value="offline">离线</SelectItem>
                  <SelectItem value="error">告警</SelectItem>
                  <SelectItem value="maintenance">维护中</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleRefresh}>
                <RefreshCw className={`h-4 w-4 ${deviceQuery.isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 设备列表 */}
        {isError && devices.length === 0 ? (
          <EmptyState hasError />
        ) : devices.length === 0 ? (
          <EmptyState />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">设备列表</CardTitle>
              <CardDescription>共 {totalCount} 台设备 {totalCount > pageSize && `（第 ${page} 页）`}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>设备ID</TableHead>
                    <TableHead>设备名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>位置</TableHead>
                    <TableHead>最后更新</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device: DeviceRecord) => (
                    <TableRow key={device.id}>
                      <TableCell className="font-mono text-sm">{device.id}</TableCell>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {deviceTypeOptions.find(t => t.value === device.type)?.label || device.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusConfig[device.status]?.icon ?? statusConfig.unknown.icon}
                          <span>{statusConfig[device.status]?.label ?? device.status}</span>
                        </div>
                      </TableCell>
                      <TableCell>{(device.metadata as any)?.location ?? device.location ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {device.lastUpdate ? new Date(device.lastUpdate).toLocaleString('zh-CN') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="查看详情" onClick={() => setViewDeviceId(device.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="编辑设备" onClick={() => setEditDeviceId(device.id)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="设备配置" onClick={() => setConfigDeviceId(device.id)}>
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="删除设备" onClick={() => handleDeleteDevice(device.id)} disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {/* 分页 */}
              {totalCount > pageSize && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    共 {totalCount} 条，每页 {pageSize} 条
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      上一页
                    </Button>
                    <Button variant="outline" size="sm" disabled={page * pageSize >= totalCount} onClick={() => setPage(p => p + 1)}>
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ============ 查看设备详情对话框 ============ */}
        <Dialog open={!!viewDeviceId} onOpenChange={(open) => { if (!open) setViewDeviceId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>设备详情</DialogTitle>
              <DialogDescription>查看设备的完整信息</DialogDescription>
            </DialogHeader>
            {viewQuery.isLoading && viewDeviceId ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : viewQuery.data ? (
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">节点ID</span>
                  <span className="col-span-2 font-mono">{viewQuery.data.nodeId}</span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">设备编码</span>
                  <span className="col-span-2 font-mono">{viewQuery.data.deviceCode}</span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">名称</span>
                  <span className="col-span-2">{viewQuery.data.name}</span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">类型</span>
                  <span className="col-span-2">
                    <Badge variant="outline">
                      {deviceTypeOptions.find(t => t.value === viewQuery.data!.type)?.label || viewQuery.data!.type}
                    </Badge>
                  </span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">状态</span>
                  <span className="col-span-2 flex items-center gap-2">
                    {statusConfig[viewQuery.data.status]?.icon ?? statusConfig.unknown.icon}
                    {statusConfig[viewQuery.data.status]?.label ?? viewQuery.data.status}
                  </span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">位置</span>
                  <span className="col-span-2">{viewQuery.data.location || '-'}</span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">型号</span>
                  <span className="col-span-2">{viewQuery.data.model || '-'}</span>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground">制造商</span>
                  <span className="col-span-2">{viewQuery.data.manufacturer || '-'}</span>
                </div>
                {viewQuery.data.sensorCount !== undefined && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">传感器数量</span>
                      <span className="col-span-2">{viewQuery.data.sensorCount}</span>
                    </div>
                  </>
                )}
                {viewQuery.data.lastHeartbeat && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <span className="text-muted-foreground">最后心跳</span>
                      <span className="col-span-2">{new Date(viewQuery.data.lastHeartbeat).toLocaleString('zh-CN')}</span>
                    </div>
                  </>
                )}
              </div>
            ) : viewQuery.isError ? (
              <p className="text-sm text-destructive py-4">无法加载设备详情，请稍后重试。</p>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDeviceId(null)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============ 编辑设备对话框 ============ */}
        <Dialog open={!!editDeviceId} onOpenChange={(open) => { if (!open) setEditDeviceId(null); }}>
          <DialogContent>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!editDeviceId) return;
              const fd = new FormData(e.currentTarget);
              updateMutation.mutate({
                nodeId: editDeviceId,
                name: (fd.get('edit-name') as string) || undefined,
                status: (fd.get('edit-status') as string) || undefined,
                location: (fd.get('edit-location') as string) || undefined,
                department: (fd.get('edit-department') as string) || undefined,
                serialNumber: (fd.get('edit-serial') as string) || undefined,
              });
            }}>
              <DialogHeader>
                <DialogTitle>编辑设备</DialogTitle>
                <DialogDescription>修改设备信息（仅修改非空字段）</DialogDescription>
              </DialogHeader>
              {editQuery.isLoading && editDeviceId ? (
                <div className="space-y-3 py-4">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : editQuery.data ? (
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-name" className="text-right">名称</Label>
                    <Input id="edit-name" name="edit-name" className="col-span-3" defaultValue={editQuery.data.name} />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-status" className="text-right">状态</Label>
                    <Select name="edit-status" defaultValue={editQuery.data.status}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">在线</SelectItem>
                        <SelectItem value="offline">离线</SelectItem>
                        <SelectItem value="error">告警</SelectItem>
                        <SelectItem value="maintenance">维护中</SelectItem>
                        <SelectItem value="unknown">未知</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-location" className="text-right">位置</Label>
                    <Input id="edit-location" name="edit-location" className="col-span-3" defaultValue={editQuery.data.location || ''} />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-department" className="text-right">部门</Label>
                    <Input id="edit-department" name="edit-department" className="col-span-3" defaultValue="" placeholder="输入所属部门" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-serial" className="text-right">序列号</Label>
                    <Input id="edit-serial" name="edit-serial" className="col-span-3" defaultValue="" placeholder="输入序列号" />
                  </div>
                </div>
              ) : editQuery.isError ? (
                <p className="text-sm text-destructive py-4">无法加载设备信息。</p>
              ) : null}
              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setEditDeviceId(null)}>取消</Button>
                <Button type="submit" disabled={updateMutation.isPending || editQuery.isLoading}>
                  {updateMutation.isPending ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* ============ 设备配置对话框 ============ */}
        <Dialog open={!!configDeviceId} onOpenChange={(open) => { if (!open) setConfigDeviceId(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                设备配置
                {configDeviceQuery.data && ` — ${configDeviceQuery.data.name}`}
              </DialogTitle>
              <DialogDescription>查看设备传感器配置和运行参数</DialogDescription>
            </DialogHeader>
            {(configSensorsQuery.isLoading || configDeviceQuery.isLoading) && configDeviceId ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {/* 设备基本配置 */}
                {configDeviceQuery.data && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">设备信息</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm bg-muted/50 rounded-lg p-3">
                      <div><span className="text-muted-foreground">节点ID: </span><span className="font-mono">{configDeviceQuery.data.nodeId}</span></div>
                      <div><span className="text-muted-foreground">类型: </span>{deviceTypeOptions.find(t => t.value === configDeviceQuery.data!.type)?.label || configDeviceQuery.data!.type}</div>
                      <div><span className="text-muted-foreground">状态: </span>{statusConfig[configDeviceQuery.data.status]?.label ?? configDeviceQuery.data.status}</div>
                      <div><span className="text-muted-foreground">位置: </span>{configDeviceQuery.data.location || '-'}</div>
                    </div>
                  </div>
                )}

                {/* 传感器列表 */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">
                    传感器配置
                    {configSensorsQuery.data && ` (${configSensorsQuery.data.length})`}
                  </h4>
                  {configSensorsQuery.data && configSensorsQuery.data.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>传感器ID</TableHead>
                          <TableHead>名称</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>单位</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>最新值</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {configSensorsQuery.data.map((sensor) => (
                          <TableRow key={sensor.sensorId}>
                            <TableCell className="font-mono text-sm">{sensor.sensorId}</TableCell>
                            <TableCell>{sensor.name || '-'}</TableCell>
                            <TableCell><Badge variant="outline">{sensor.type || '-'}</Badge></TableCell>
                            <TableCell>{sensor.unit || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={sensor.status === 'active' ? 'default' : 'secondary'}>
                                {sensor.status === 'active' ? '活跃' : sensor.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{sensor.lastValue != null ? sensor.lastValue : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">暂无传感器配置</p>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDeviceId(null)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
