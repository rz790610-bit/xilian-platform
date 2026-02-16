/**
 * 密钥管理页面 (HashiCorp Vault)
 * 数据源: infrastructure.getVaultHealth / infrastructure.getVaultOverview / infrastructure.listSecrets / infrastructure.listVaultPolicies / infrastructure.listVaultMounts
 */
import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Key, RefreshCw, Plus, Shield, Lock, Trash2, Eye, EyeOff, Copy, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function VaultManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSecretPath, setNewSecretPath] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [selectedMount, setSelectedMount] = useState('secret');
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  const { data: vaultHealth, isLoading: healthLoading } = trpc.infrastructure.getVaultHealth.useQuery(undefined, { refetchInterval: 30000 });
  const { data: vaultOverview, isLoading: overviewLoading } = trpc.infrastructure.getVaultOverview.useQuery(undefined, { refetchInterval: 30000 });
  const { data: secrets, isLoading: secretsLoading, refetch: refetchSecrets } = trpc.infrastructure.listSecrets.useQuery({ path: selectedMount }, { refetchInterval: 60000 });
  const { data: policies, isLoading: policiesLoading } = trpc.infrastructure.listVaultPolicies.useQuery(undefined, { refetchInterval: 60000 });
  const { data: mounts } = trpc.infrastructure.listVaultMounts.useQuery(undefined, { refetchInterval: 60000 });

  const writeSecretMutation = trpc.infrastructure.writeSecret.useMutation({
    onSuccess: () => { toast.success('密钥已创建'); setShowCreateDialog(false); setNewSecretPath(''); setNewSecretKey(''); setNewSecretValue(''); refetchSecrets(); },
    onError: (err: any) => toast.error('创建失败: ' + err.message),
  });
  const deleteSecretMutation = trpc.infrastructure.deleteSecret.useMutation({
    onSuccess: () => { toast.success('密钥已删除'); refetchSecrets(); },
    onError: (err: any) => toast.error('删除失败: ' + err.message),
  });

  const isLoading = healthLoading || overviewLoading;
  const isConnected = vaultHealth?.initialized && !vaultHealth?.sealed;

  const toggleReveal = (path: string) => {
    setRevealedSecrets(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">密钥管理</h1>
            <p className="text-muted-foreground">HashiCorp Vault 密钥与证书管理</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchSecrets()}><RefreshCw className="h-4 w-4 mr-2" />刷新</Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} disabled={!isConnected}><Plus className="h-4 w-4 mr-2" />新增密钥</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {isLoading ? Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16" /></CardContent></Card>) : (
            <>
              <Card><CardHeader className="pb-2"><CardDescription>Vault 状态</CardDescription></CardHeader><CardContent>
                <div className="flex items-center gap-2">
                  {isConnected ? <Badge variant="default" className="bg-green-500/10 text-green-400 border-green-500/30">已连接</Badge>
                    : vaultHealth?.sealed ? <Badge variant="default" className="bg-amber-500/10 text-amber-400 border-amber-500/30">已封存</Badge>
                    : <Badge variant="default" className="bg-red-500/10 text-red-400 border-red-500/30">未连接</Badge>}
                  <span className="text-xs text-muted-foreground">v{vaultHealth?.version || '-'}</span>
                </div>
              </CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>密钥引擎</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{vaultOverview?.mounts ?? 0}</div><p className="text-xs text-muted-foreground">已挂载引擎</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>访问策略</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{Array.isArray(policies) ? policies.length : 0}</div><p className="text-xs text-muted-foreground">已配置策略</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>密钥数量</CardDescription></CardHeader><CardContent><div className="text-2xl font-bold">{Array.isArray(secrets) ? secrets.length : 0}</div><p className="text-xs text-muted-foreground">当前路径下</p></CardContent></Card>
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" />密钥列表</CardTitle><CardDescription>当前挂载点下的密钥</CardDescription></div>
              {Array.isArray(mounts) && mounts.length > 0 && (
                <Select value={selectedMount} onValueChange={setSelectedMount}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="选择挂载点" /></SelectTrigger>
                  <SelectContent>{mounts.map((m: any) => <SelectItem key={m.path || m} value={typeof m === 'string' ? m : m.path}>{typeof m === 'string' ? m : m.path}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {secretsLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              : !isConnected ? (
                <div className="text-center py-12">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Vault 未连接</h3>
                  <p className="text-muted-foreground mb-4">请确保 HashiCorp Vault 服务已启动并配置正确</p>
                </div>
              ) : !secrets || (Array.isArray(secrets) && secrets.length === 0) ? (
                <div className="text-center py-12"><Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" /><h3 className="text-lg font-semibold mb-2">暂无密钥</h3><p className="text-muted-foreground">当前路径下没有密钥，点击「新增密钥」创建</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>路径</TableHead><TableHead>键数量</TableHead><TableHead>类型</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(Array.isArray(secrets) ? secrets : []).map((secret: any, idx: number) => (
                      <TableRow key={secret.path || secret.name || idx}>
                        <TableCell className="font-mono text-sm"><div className="flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" />{secret.path || secret.name || '-'}</div></TableCell>
                        <TableCell>{secret.keys?.length ?? '-'}</TableCell>
                        <TableCell><Badge variant="outline">{secret.type || 'kv-v2'}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm">{secret.createdAt ? new Date(secret.createdAt).toLocaleString('zh-CN') : '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => toggleReveal(secret.path || secret.name)}>{revealedSecrets.has(secret.path || secret.name) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(secret.path || secret.name); toast.success('路径已复制'); }}><Copy className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={() => { if (confirm('确定删除？')) deleteSecretMutation.mutate({ path: secret.path || secret.name }); }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />访问策略</CardTitle><CardDescription>Vault ACL 策略列表</CardDescription></CardHeader>
          <CardContent>
            {policiesLoading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
              : !Array.isArray(policies) || policies.length === 0 ? <p className="text-center text-muted-foreground py-6">暂无策略数据</p>
              : <div className="flex flex-wrap gap-2">{policies.map((p: any, i: number) => <Badge key={typeof p === 'string' ? p : p.name || i} variant="outline">{typeof p === 'string' ? p : p.name}</Badge>)}</div>}
          </CardContent>
        </Card>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>新增密钥</DialogTitle><DialogDescription>在 Vault 中创建新的密钥</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div><Label>挂载点</Label><Input value={selectedMount} disabled className="mt-1" /></div>
              <div><Label>路径</Label><Input value={newSecretPath} onChange={(e) => setNewSecretPath(e.target.value)} placeholder="例如: my-app/config" className="mt-1" /></div>
              <div><Label>键名</Label><Input value={newSecretKey} onChange={(e) => setNewSecretKey(e.target.value)} placeholder="例如: API_KEY" className="mt-1" /></div>
              <div><Label>值</Label><Textarea value={newSecretValue} onChange={(e) => setNewSecretValue(e.target.value)} placeholder="密钥值" className="mt-1" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
              <Button onClick={() => { if (!newSecretPath || !newSecretKey || !newSecretValue) { toast.error('请填写完整信息'); return; } writeSecretMutation.mutate({ path: selectedMount + '/' + newSecretPath, data: { [newSecretKey]: newSecretValue } }); }} disabled={writeSecretMutation.isPending}>{writeSecretMutation.isPending ? '创建中...' : '创建'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
