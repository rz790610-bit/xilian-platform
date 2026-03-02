import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Puzzle, Shield, Power, PowerOff,
  Search, Eye, Play, Trash2, BarChart3,
} from "lucide-react";

type TabId = "plugins" | "security" | "audit";

export default function PluginManager() {
  const [tab, setTab] = useState<TabId>("plugins");
  const [search, setSearch] = useState("");

  const plugins = trpc.plugin.list.useQuery(undefined, { retry: false });
  const types = trpc.plugin.getTypes.useQuery(undefined, { retry: false });
  const securityOverview = trpc.plugin.getSecurityDashboard.useQuery(undefined, { enabled: tab === "security", retry: false });
  const auditLog = trpc.plugin.getAuditLog.useQuery({}, { enabled: tab === "audit", retry: false });

  const enableMut = trpc.plugin.enable.useMutation({ onSuccess: () => plugins.refetch() });
  const disableMut = trpc.plugin.disable.useMutation({ onSuccess: () => plugins.refetch() });
  const uninstallMut = trpc.plugin.uninstall.useMutation({ onSuccess: () => plugins.refetch() });

  const allPlugins = Array.isArray(plugins.data) ? plugins.data : (plugins.data as any)?.plugins || [];
  const filtered = search
    ? allPlugins.filter((p: any) => (p.name || p.id || "").toLowerCase().includes(search.toLowerCase()))
    : allPlugins;

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "plugins", label: "插件列表", icon: <Puzzle className="w-4 h-4" /> },
    { id: "security", label: "安全概览", icon: <Shield className="w-4 h-4" /> },
    { id: "audit", label: "审计日志", icon: <Eye className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="插件管理">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">插件管理</h2>
            <p className="text-muted-foreground">插件生命周期管理、权限控制、安全审查</p>
          </div>
          <Button variant="outline" onClick={() => plugins.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Puzzle className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{allPlugins.length}</div>
                  <p className="text-xs text-muted-foreground">插件总数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Power className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{allPlugins.filter((p: any) => p.enabled || p.status === "active").length}</div>
                  <p className="text-xs text-muted-foreground">已启用</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{(Array.isArray(types.data) ? types.data : []).length}</div>
                  <p className="text-xs text-muted-foreground">插件类型</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{allPlugins.filter((p: any) => p.status === "error" || p.health === "unhealthy").length}</div>
                  <p className="text-xs text-muted-foreground">异常插件</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-1 border-b pb-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 插件列表 */}
        {tab === "plugins" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>已安装插件</CardTitle>
                <div className="flex gap-2">
                  <Input placeholder="搜索插件..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
                  <Search className="w-4 h-4 text-muted-foreground mt-2" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {plugins.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : filtered.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Puzzle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>暂无插件</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((p: any) => (
                    <div key={p.id || p.name} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                      <Puzzle className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.name || p.id}</span>
                          <Badge variant="outline">{p.type || "unknown"}</Badge>
                          {p.version && <span className="text-xs text-muted-foreground">v{p.version}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{p.description || "No description"}</p>
                      </div>
                      <Badge variant={p.enabled || p.status === "active" ? "default" : p.status === "error" ? "destructive" : "secondary"}>
                        {p.enabled || p.status === "active" ? "已启用" : p.status === "error" ? "异常" : "已禁用"}
                      </Badge>
                      <div className="flex gap-1">
                        {p.enabled || p.status === "active" ? (
                          <Button size="sm" variant="ghost" onClick={() => disableMut.mutate({ id: p.id })} title="禁用">
                            <PowerOff className="w-3 h-3" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => enableMut.mutate({ id: p.id })} title="启用">
                            <Power className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("确认卸载？")) uninstallMut.mutate({ id: p.id }); }} title="卸载">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 安全概览 */}
        {tab === "security" && (
          <Card>
            <CardHeader><CardTitle>插件安全概览</CardTitle></CardHeader>
            <CardContent>
              {securityOverview.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : securityOverview.data ? (
                <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[500px]">
                  {JSON.stringify(securityOverview.data, null, 2)}
                </pre>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>安全概览加载失败</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 审计日志 */}
        {tab === "audit" && (
          <Card>
            <CardHeader><CardTitle>审计日志</CardTitle></CardHeader>
            <CardContent>
              {auditLog.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(auditLog.data) ? auditLog.data : (auditLog.data as any)?.logs || []).map((log: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{log.timestamp ? new Date(log.timestamp).toLocaleString("zh-CN") : "-"}</span>
                      <Badge variant="outline">{log.action || log.type || "-"}</Badge>
                      <span className="flex-1 truncate">{log.pluginId || log.plugin || "-"}: {log.message || log.detail || "-"}</span>
                      <Badge variant={log.result === "success" ? "default" : "secondary"}>{log.result || "ok"}</Badge>
                    </div>
                  ))}
                  {(Array.isArray(auditLog.data) ? auditLog.data : (auditLog.data as any)?.logs || []).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Eye className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无审计日志</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
