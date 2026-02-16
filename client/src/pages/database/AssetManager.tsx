import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  RefreshCw, Plus, Search, ChevronRight, ChevronDown,
  Server, Cpu, Activity, MapPin, Trash2, Edit, Eye
} from 'lucide-react';

const statusVariant = (s: string) =>
  s === 'online' ? 'success' : s === 'offline' ? 'danger' : s === 'maintenance' ? 'warning' : 'default';

export default function AssetManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newNode, setNewNode] = useState({
    nodeId: '', code: '', name: '', level: 1, nodeType: 'company',
    rootNodeId: '', path: '', location: '', department: '',
  });

  // tRPC 查询
  const { data: assetStats, refetch: refetchStats } = trpc.database.asset.getStats.useQuery();
  const { data: treeData, refetch: refetchTree, isLoading } = trpc.database.asset.getTree.useQuery(
    searchQuery ? { search: searchQuery } : undefined
  );
  const { data: nodeDetail } = trpc.database.asset.getNode.useQuery(
    { nodeId: selectedNodeId! },
    { enabled: !!selectedNodeId }
  );
  const { data: childNodes } = trpc.database.asset.getChildren.useQuery(
    { parentNodeId: selectedNodeId! },
    { enabled: !!selectedNodeId }
  );
  const { data: nodeMPs } = trpc.database.asset.listMeasurementPoints.useQuery(
    { nodeId: selectedNodeId! },
    { enabled: !!selectedNodeId }
  );
  const { data: nodeSensors } = trpc.database.asset.listSensors.useQuery(
    selectedNodeId && nodeDetail ? { deviceCode: nodeDetail.code } : undefined,
    { enabled: !!selectedNodeId && !!nodeDetail }
  );

  // tRPC mutations
  const createNodeMutation = trpc.database.asset.createNode.useMutation({
    onSuccess: () => {
      toast.success('资产节点创建成功');
      setShowCreateDialog(false);
      refetchTree();
      refetchStats();
      setNewNode({ nodeId: '', code: '', name: '', level: 1, nodeType: 'company', rootNodeId: '', path: '', location: '', department: '' });
    },
    onError: (err) => toast.error(`创建失败: ${err.message}`),
  });

  const deleteNodeMutation = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => {
      toast.success('节点已删除');
      setSelectedNodeId(null);
      refetchTree();
      refetchStats();
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  // 构建树结构
  const buildTree = (nodes: any[]) => {
    const map = new Map<string | null, any[]>();
    nodes.forEach(n => {
      const parent = n.parentNodeId || null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent)!.push(n);
    });
    return map;
  };

  const renderTreeNode = (node: any, treeMap: Map<string | null, any[]>, depth: number = 0) => {
    const children = treeMap.get(node.nodeId) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(node.nodeId);
    const isSelected = selectedNodeId === node.nodeId;

    return (
      <div key={node.nodeId}>
        <div
          className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-xs transition-colors ${
            isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-secondary'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setSelectedNodeId(node.nodeId)}
        >
          {hasChildren ? (
            <button onClick={(e) => { e.stopPropagation(); toggleExpand(node.nodeId); }} className="p-0.5">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <span className="text-sm">
            {node.level === 1 ? '🏢' : node.level === 2 ? '🏭' : node.level === 3 ? '⚙️' : '📍'}
          </span>
          <span className="truncate flex-1">{node.name}</span>
          <Badge variant={statusVariant(node.status)} className="text-[9px] px-1.5 py-0">{node.status}</Badge>
        </div>
        {isExpanded && children.map(child => renderTreeNode(child, treeMap, depth + 1))}
      </div>
    );
  };

  const treeMap = treeData ? buildTree(treeData) : new Map();
  const rootNodes = treeMap.get(null) || [];

  const handleCreate = () => {
    if (!newNode.nodeId || !newNode.code || !newNode.name) {
      toast.error('请填写必填字段');
      return;
    }
    createNodeMutation.mutate({
      ...newNode,
      rootNodeId: newNode.rootNodeId || newNode.nodeId,
      path: newNode.path || `/${newNode.code}`,
    });
  };

  return (
    <MainLayout title="设备档案">
      <div className="p-4 space-y-4">
        {/* 顶部操作栏 */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">设备档案管理</h2>
            <p className="text-xs text-muted-foreground mt-0.5">资产树 · 测点 · 传感器</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { refetchTree(); refetchStats(); }} className="text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />刷新
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="text-xs">
              <Plus className="w-3 h-3 mr-1" />新建节点
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard value={assetStats?.total ?? 0} label="节点总数" icon="🏭" />
          <StatCard value={assetStats?.byStatus?.['online'] ?? 0} label="在线设备" icon="✅" />
          <StatCard value={assetStats?.byStatus?.['offline'] ?? 0} label="离线设备" icon="❌" />
          <StatCard value={assetStats?.byStatus?.['maintenance'] ?? 0} label="维护中" icon="🔧" />
        </div>

        {/* 主体内容 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* 左侧：设备树 */}
          <PageCard title="设备树" icon={<Server className="w-3.5 h-3.5" />} className="lg:col-span-1">
            <div className="mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="搜索设备..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 h-7 text-xs"
                />
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto space-y-0.5">
              {isLoading ? (
                <div className="text-xs text-muted-foreground text-center py-8">加载中...</div>
              ) : rootNodes.length > 0 ? (
                rootNodes.map((node: any) => renderTreeNode(node, treeMap))
              ) : (
                <div className="text-xs text-muted-foreground text-center py-8">
                  暂无资产节点，点击"新建节点"开始创建
                </div>
              )}
            </div>
          </PageCard>

          {/* 右侧：节点详情 */}
          <PageCard title={nodeDetail ? `${nodeDetail.name} 详情` : '节点详情'} icon={<Eye className="w-3.5 h-3.5" />} className="lg:col-span-2">
            {nodeDetail ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-3">
                  <TabsTrigger value="tree" className="text-xs">基本信息</TabsTrigger>
                  <TabsTrigger value="mp" className="text-xs">测点 ({nodeMPs?.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="sensor" className="text-xs">传感器 ({nodeSensors?.length ?? 0})</TabsTrigger>
                  <TabsTrigger value="children" className="text-xs">子节点 ({childNodes?.length ?? 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="tree">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-muted-foreground">节点ID：</span><span className="font-mono">{nodeDetail.nodeId}</span></div>
                    <div><span className="text-muted-foreground">编码：</span><span className="font-mono">{nodeDetail.code}</span></div>
                    <div><span className="text-muted-foreground">名称：</span>{nodeDetail.name}</div>
                    <div><span className="text-muted-foreground">类型：</span>{nodeDetail.nodeType}</div>
                    <div><span className="text-muted-foreground">层级：</span>L{nodeDetail.level}</div>
                    <div><span className="text-muted-foreground">状态：</span><Badge variant={statusVariant(nodeDetail.status)} dot>{nodeDetail.status}</Badge></div>
                    <div><span className="text-muted-foreground">位置：</span>{nodeDetail.location || '-'}</div>
                    <div><span className="text-muted-foreground">部门：</span>{nodeDetail.department || '-'}</div>
                    <div><span className="text-muted-foreground">路径：</span><span className="font-mono text-[10px]">{nodeDetail.path}</span></div>
                    <div><span className="text-muted-foreground">模板：</span>{nodeDetail.templateCode || '-'}</div>
                    <div><span className="text-muted-foreground">子节点：</span>{nodeDetail.childCount}</div>
                    <div><span className="text-muted-foreground">测点数：</span>{nodeDetail.measurementPointCount}</div>
                    <div><span className="text-muted-foreground">传感器：</span>{nodeDetail.sensorCount}</div>
                    <div><span className="text-muted-foreground">序列号：</span>{nodeDetail.serialNumber || '-'}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="destructive" className="text-xs"
                      onClick={() => deleteNodeMutation.mutate({ nodeId: nodeDetail.nodeId })}>
                      <Trash2 className="w-3 h-3 mr-1" />删除节点
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="mp">
                  <div className="space-y-2">
                    {nodeMPs && nodeMPs.length > 0 ? nodeMPs.map((mp: any) => (
                      <div key={mp.mpId} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                        <div>
                          <div className="font-medium">{mp.name}</div>
                          <div className="text-[10px] text-muted-foreground">{mp.mpId} · {mp.measurementType} · {mp.position || '未指定位置'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px]">告警: {mp.warningThreshold ?? '-'} / 危急: {mp.criticalThreshold ?? '-'}</div>
                        </div>
                      </div>
                    )) : (
                      <div className="text-xs text-muted-foreground text-center py-4">暂无测点</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="sensor">
                  <div className="space-y-2">
                    {nodeSensors && nodeSensors.length > 0 ? nodeSensors.map((s: any) => (
                      <div key={s.sensorId} className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs">
                        <div>
                          <div className="font-medium">{s.name || s.sensorId}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {s.physicalQuantity || '-'} · {s.unit || '-'} · CH{s.channel || '-'} · {s.sampleRate ?? '-'}Hz
                          </div>
                        </div>
                        <Badge variant={s.status === 'active' ? 'success' : 'danger'} dot>{s.status}</Badge>
                      </div>
                    )) : (
                      <div className="text-xs text-muted-foreground text-center py-4">暂无传感器</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="children">
                  <div className="space-y-2">
                    {childNodes && childNodes.length > 0 ? childNodes.map((child: any) => (
                      <div key={child.nodeId}
                        className="flex items-center justify-between p-2 rounded bg-secondary/50 text-xs cursor-pointer hover:bg-secondary"
                        onClick={() => setSelectedNodeId(child.nodeId)}>
                        <div>
                          <div className="font-medium">{child.name}</div>
                          <div className="text-[10px] text-muted-foreground">{child.code} · L{child.level} · {child.nodeType}</div>
                        </div>
                        <Badge variant={statusVariant(child.status)} dot>{child.status}</Badge>
                      </div>
                    )) : (
                      <div className="text-xs text-muted-foreground text-center py-4">暂无子节点</div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-12">
                请在左侧设备树中选择一个节点查看详情
              </div>
            )}
          </PageCard>
        </div>

        {/* 创建节点对话框 */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm">新建资产节点</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">节点ID *</label>
                  <Input className="h-8 text-xs" placeholder="如 NODE-001"
                    value={newNode.nodeId} onChange={e => setNewNode(p => ({ ...p, nodeId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">编码 *</label>
                  <Input className="h-8 text-xs" placeholder="如 SH-PORT-01"
                    value={newNode.code} onChange={e => setNewNode(p => ({ ...p, code: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">名称 *</label>
                <Input className="h-8 text-xs" placeholder="如 上海港区一号码头"
                  value={newNode.name} onChange={e => setNewNode(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">层级</label>
                  <Select value={String(newNode.level)} onValueChange={v => setNewNode(p => ({ ...p, level: Number(v) }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">L1 - 公司/园区</SelectItem>
                      <SelectItem value="2">L2 - 工厂/车间</SelectItem>
                      <SelectItem value="3">L3 - 产线/区域</SelectItem>
                      <SelectItem value="4">L4 - 设备</SelectItem>
                      <SelectItem value="5">L5 - 部件</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">节点类型</label>
                  <Select value={newNode.nodeType} onValueChange={v => setNewNode(p => ({ ...p, nodeType: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">公司</SelectItem>
                      <SelectItem value="factory">工厂</SelectItem>
                      <SelectItem value="workshop">车间</SelectItem>
                      <SelectItem value="line">产线</SelectItem>
                      <SelectItem value="device">设备</SelectItem>
                      <SelectItem value="component">部件</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">位置</label>
                  <Input className="h-8 text-xs" placeholder="如 A区3号厂房"
                    value={newNode.location} onChange={e => setNewNode(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">部门</label>
                  <Input className="h-8 text-xs" placeholder="如 生产部"
                    value={newNode.department} onChange={e => setNewNode(p => ({ ...p, department: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreateDialog(false)}>取消</Button>
              <Button size="sm" className="text-xs" onClick={handleCreate}
                disabled={createNodeMutation.isPending}>
                {createNodeMutation.isPending ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
