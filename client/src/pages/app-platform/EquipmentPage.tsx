/**
 * 设备管理页面（客户版）
 * 搜索 + 状态过滤 + 表格 + 新增/编辑 Dialog
 * 复用 tRPC: database.asset.getTree / createNode / updateNode / deleteNode
 */
import { useState, useMemo, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/common/Toast';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Settings,
} from 'lucide-react';

// ── 表单状态 ──────────────────────────────────────────
interface DeviceForm {
  nodeId: string;
  code: string;
  name: string;
  location: string;
  department: string;
  serialNumber: string;
}

const EMPTY_FORM: DeviceForm = {
  nodeId: '',
  code: '',
  name: '',
  location: '',
  department: '',
  serialNumber: '',
};

export default function EquipmentPage() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceForm>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── 数据查询 ────────────────────────────────────────
  const treeQuery = trpc.database.asset.getTree.useQuery(
    { level: 1 },
    { retry: 2 },
  );
  const devices = treeQuery.data ?? [];

  // ── Mutations ───────────────────────────────────────
  const createMut = trpc.database.asset.createNode.useMutation({
    onSuccess: () => {
      toast.success('设备创建成功');
      treeQuery.refetch();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.database.asset.updateNode.useMutation({
    onSuccess: () => {
      toast.success('设备更新成功');
      treeQuery.refetch();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.database.asset.deleteNode.useMutation({
    onSuccess: () => {
      toast.success('设备已删除');
      treeQuery.refetch();
      setDeleteConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // ── 过滤 ────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...devices];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          (d.name ?? '').toLowerCase().includes(q) ||
          (d.nodeId ?? '').toLowerCase().includes(q) ||
          (d.code ?? '').toLowerCase().includes(q),
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter((d) => d.status === statusFilter);
    }
    return list;
  }, [devices, search, statusFilter]);

  // ── Dialog 逻辑 ─────────────────────────────────────
  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }, []);

  const openEdit = useCallback((device: Record<string, unknown>) => {
    setEditingId(device.nodeId as string);
    setForm({
      nodeId: (device.nodeId as string) ?? '',
      code: (device.code as string) ?? '',
      name: (device.name as string) ?? '',
      location: (device.location as string) ?? '',
      department: (device.department as string) ?? '',
      serialNumber: (device.serialNumber as string) ?? '',
    });
    setShowDialog(true);
  }, []);

  const closeDialog = useCallback(() => {
    setShowDialog(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!form.name.trim()) {
      toast.warning('请输入设备名称');
      return;
    }

    if (editingId) {
      updateMut.mutate({
        nodeId: editingId,
        name: form.name,
        location: form.location || undefined,
        department: form.department || undefined,
        serialNumber: form.serialNumber || undefined,
      });
    } else {
      if (!form.nodeId.trim() || !form.code.trim()) {
        toast.warning('请输入设备编号和编码');
        return;
      }
      createMut.mutate({
        nodeId: form.nodeId,
        code: form.code,
        name: form.name,
        level: 1,
        nodeType: 'device',
        rootNodeId: form.nodeId,
        path: `/${form.nodeId}`,
        location: form.location || undefined,
        department: form.department || undefined,
        serialNumber: form.serialNumber || undefined,
      });
    }
  }, [form, editingId, createMut, updateMut, toast]);

  const isMutating = createMut.isPending || updateMut.isPending;

  // ── 状态集合（去重）─────────────────────────────────
  const statusOptions = useMemo(() => {
    const s = new Set(devices.map((d) => d.status).filter(Boolean));
    return Array.from(s).sort() as string[];
  }, [devices]);

  // ── Loading ─────────────────────────────────────────
  if (treeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>加载设备数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 工具栏 ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索设备名称或编号..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="设备状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {statusOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={openCreate} className="gap-1.5 ml-auto">
          <Plus className="h-4 w-4" />
          新增设备
        </Button>
      </div>

      {/* ── 设备表格 ──────────────────────────────────────── */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">编号</TableHead>
              <TableHead className="w-[180px]">名称</TableHead>
              <TableHead className="w-[100px]">编码</TableHead>
              <TableHead className="w-[100px]">位置</TableHead>
              <TableHead className="w-[100px]">部门</TableHead>
              <TableHead className="w-[80px]">状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {treeQuery.error ? '数据加载失败' : '暂无设备数据'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((device) => {
                const d = device as Record<string, unknown>;
                const status = (d.status as string) ?? 'active';
                return (
                  <TableRow key={d.nodeId as string}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-1.5">
                        <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                        {d.nodeId as string}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{d.name as string}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.code as string}</TableCell>
                    <TableCell className="text-sm">{(d.location as string) || '-'}</TableCell>
                    <TableCell className="text-sm">{(d.department as string) || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          status === 'active' && 'text-emerald-500 border-emerald-500/30',
                          status === 'inactive' && 'text-gray-400 border-gray-400/30',
                          status === 'maintenance' && 'text-yellow-500 border-yellow-500/30',
                        )}
                      >
                        {status === 'active' ? '运行' : status === 'inactive' ? '停用' : status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(d)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => setDeleteConfirm(d.nodeId as string)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        共 {filtered.length} 台设备
      </div>

      {/* ── 新增/编辑 Dialog ──────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑设备' : '新增设备'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editingId && (
              <>
                <div className="space-y-1.5">
                  <Label>设备编号 *</Label>
                  <Input
                    value={form.nodeId}
                    onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))}
                    placeholder="如: RTG-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>设备编码 *</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="如: GJM-RTG-001"
                  />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>设备名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如: 1号轮胎吊"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>位置</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="如: A 区泊位"
                />
              </div>
              <div className="space-y-1.5">
                <Label>部门</Label>
                <Input
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  placeholder="如: 装卸部"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>序列号</Label>
              <Input
                value={form.serialNumber}
                onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))}
                placeholder="如: SN-2024-0001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>取消</Button>
            <Button onClick={handleSubmit} disabled={isMutating} className="gap-1.5">
              {isMutating && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除确认 Dialog ──────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            确定要删除设备 <span className="font-mono font-medium text-foreground">{deleteConfirm}</span> 吗？此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMut.mutate({ nodeId: deleteConfirm })}
              disabled={deleteMut.isPending}
              className="gap-1.5"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
