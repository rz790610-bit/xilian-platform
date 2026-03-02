import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Wrench, Play, Search, Shield, BarChart3 } from "lucide-react";

export default function ToolingDomain() {
  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState("");

  const tools = trpc.evoTooling.registry.list.useQuery({ search: search || undefined }, { retry: false });
  const sandboxStats = trpc.evoTooling.sandbox.stats.useQuery(undefined, { retry: false });
  const grokDefs = trpc.evoTooling.grok.toolDefinitions.useQuery(undefined, { retry: false });

  const toolList = (tools.data as any)?.tools || [];

  return (
    <MainLayout title="工具域">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">工具域</h2>
            <p className="text-muted-foreground">工具注册、沙箱执行、Grok 集成</p>
          </div>
          <Button variant="outline" onClick={() => { tools.refetch(); sandboxStats.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{(tools.data as any)?.total ?? toolList.length}</div>
                  <p className="text-xs text-muted-foreground">可用工具</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{(sandboxStats.data as any)?.totalExecutions ?? 0}</div>
                  <p className="text-xs text-muted-foreground">沙箱执行数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{(Array.isArray(grokDefs.data) ? grokDefs.data : (grokDefs.data as any)?.tools || []).length}</div>
                  <p className="text-xs text-muted-foreground">Grok 工具定义</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 工具列表 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5" /> 工具注册表</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="搜索工具..." value={search} onChange={e => setSearch(e.target.value)} className="w-48" />
                <Search className="w-4 h-4 text-muted-foreground mt-2" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {tools.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : toolList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Wrench className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无已注册工具</p>
              </div>
            ) : (
              <div className="space-y-2">
                {toolList.map((t: any, i: number) => (
                  <div key={t.id || t.name || i} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                    <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name || t.id}</span>
                        {t.category && <Badge variant="outline">{t.category}</Badge>}
                        {t.version && <span className="text-xs text-muted-foreground">v{t.version}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{t.description || "-"}</p>
                    </div>
                    {t.tags && <div className="flex gap-1">{(Array.isArray(t.tags) ? t.tags.slice(0, 3) : []).map((tag: string, j: number) => <Badge key={j} variant="secondary" className="text-xs">{tag}</Badge>)}</div>}
                    <Button size="sm" variant="outline" onClick={() => setSelectedTool(t.id || t.name)}>
                      <Play className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grok 工具定义 */}
        <Card>
          <CardHeader><CardTitle>Grok Agent 工具定义</CardTitle></CardHeader>
          <CardContent>
            {grokDefs.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : (
              <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[300px]">
                {JSON.stringify(grokDefs.data, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
