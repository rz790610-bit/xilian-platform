import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Settings, Sliders, Target, Plus,
  Trash2, History, BarChart3, Download,
} from "lucide-react";

type TabId = "config" | "conditions" | "baselines" | "history";

export default function ConditionNormalizerConfig() {
  const [tab, setTab] = useState<TabId>("config");
  const [newCondition, setNewCondition] = useState("");

  const config = trpc.conditionNormalizer.getConfig.useQuery(undefined, { retry: false });
  const conditions = trpc.conditionNormalizer.getConditions.useQuery(undefined, { enabled: tab === "conditions", retry: false });
  const baselines = trpc.conditionNormalizer.getBaselines.useQuery(undefined, { enabled: tab === "baselines", retry: false });
  const history = trpc.conditionNormalizer.getHistory.useQuery({ limit: 50 }, { enabled: tab === "history", retry: false });
  const thresholds = trpc.conditionNormalizer.getThresholds.useQuery(undefined, { retry: false });

  const addCondition = trpc.conditionNormalizer.addCondition.useMutation({ onSuccess: () => { conditions.refetch(); setNewCondition(""); } });
  const removeCondition = trpc.conditionNormalizer.removeCondition.useMutation({ onSuccess: () => conditions.refetch() });

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "config", label: "引擎配置", icon: <Settings className="w-4 h-4" /> },
    { id: "conditions", label: "工况定义", icon: <Target className="w-4 h-4" /> },
    { id: "baselines", label: "基线管理", icon: <Sliders className="w-4 h-4" /> },
    { id: "history", label: "处理历史", icon: <History className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="工况归一化配置">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">工况归一化配置</h2>
            <p className="text-muted-foreground">数据片段处理、基线学习、阈值管理</p>
          </div>
          <Button variant="outline" onClick={() => { config.refetch(); conditions.refetch(); baselines.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        <div className="flex gap-1 border-b pb-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* 引擎配置 */}
        {tab === "config" && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>当前配置</CardTitle></CardHeader>
              <CardContent>
                {config.data ? (
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(config.data as Record<string, any>).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                        <span className="text-sm font-medium">{key}</span>
                        <Badge variant="outline">{typeof val === "object" ? JSON.stringify(val) : String(val)}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-8 text-muted-foreground">加载配置中...</p>
                )}
              </CardContent>
            </Card>

            {thresholds.data && (
              <Card>
                <CardHeader><CardTitle>自适应阈值</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(thresholds.data as Record<string, any>).map(([key, val]) => (
                      <div key={key} className="p-3 bg-muted/30 rounded">
                        <p className="text-sm font-medium">{key}</p>
                        <p className="text-xs text-muted-foreground mt-1">{typeof val === "object" ? JSON.stringify(val) : String(val)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* 工况定义 */}
        {tab === "conditions" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>工况定义</CardTitle>
                <div className="flex gap-2">
                  <Input placeholder="新工况名称..." value={newCondition} onChange={e => setNewCondition(e.target.value)} className="w-48" />
                  <Button size="sm" onClick={() => newCondition && addCondition.mutate({ name: newCondition } as any)} disabled={!newCondition || addCondition.isPending}>
                    <Plus className="w-4 h-4 mr-1" /> 添加
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {conditions.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(conditions.data) ? conditions.data : (conditions.data as any)?.conditions || Object.entries(conditions.data || {})).map((c: any, i: number) => {
                    const name = typeof c === "string" ? c : Array.isArray(c) ? c[0] : c.name || c.id;
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{String(name)}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCondition.mutate({ name: String(name) } as any)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                  {!conditions.data || (Array.isArray(conditions.data) && conditions.data.length === 0) ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无工况定义</p>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 基线管理 */}
        {tab === "baselines" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>学习基线</CardTitle>
                <Button size="sm" variant="outline"><Download className="w-4 h-4 mr-1" /> 导出</Button>
              </div>
            </CardHeader>
            <CardContent>
              {baselines.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {baselines.data && typeof baselines.data === "object" && Object.entries(baselines.data as Record<string, any>).map(([key, val]) => (
                    <div key={key} className="p-3 bg-muted/30 rounded">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{key}</span>
                        <Badge variant="outline">基线</Badge>
                      </div>
                      <pre className="text-xs mt-2 text-muted-foreground overflow-auto max-h-20">{JSON.stringify(val, null, 2)}</pre>
                    </div>
                  ))}
                  {(!baselines.data || Object.keys(baselines.data as any).length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sliders className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无基线数据</p>
                      <p className="text-xs mt-1">需要从历史数据学习基线</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 处理历史 */}
        {tab === "history" && (
          <Card>
            <CardHeader><CardTitle>处理历史</CardTitle></CardHeader>
            <CardContent>
              {history.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(history.data) ? history.data : (history.data as any)?.history || []).map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/30 text-sm">
                      <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground">{h.timestamp ? new Date(h.timestamp).toLocaleString("zh-CN") : "-"}</span>
                      <Badge variant="outline">{h.condition || h.method || "-"}</Badge>
                      <span className="flex-1 truncate text-muted-foreground">{h.result || h.status || JSON.stringify(h).slice(0, 80)}</span>
                    </div>
                  ))}
                  {(Array.isArray(history.data) ? history.data : (history.data as any)?.history || []).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无处理历史</p>
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
