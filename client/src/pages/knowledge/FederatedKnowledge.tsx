import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Globe, Package, GitMerge,
  BarChart3, History, Shield,
} from "lucide-react";

type TabId = "packages" | "fusion" | "stats";

export default function FederatedKnowledge() {
  const [tab, setTab] = useState<TabId>("packages");

  const packages = trpc.federated.listPackages.useQuery(undefined, { retry: false });
  const fusionHistory = trpc.federated.getFusionHistory.useQuery(undefined, { enabled: tab === "fusion", retry: false });
  const stats = trpc.federated.getStats.useQuery(undefined, { enabled: tab === "stats", retry: false });

  const pkgList = (packages.data as any)?.packages || [];

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "packages", label: "知识包", icon: <Package className="w-4 h-4" /> },
    { id: "fusion", label: "融合历史", icon: <GitMerge className="w-4 h-4" /> },
    { id: "stats", label: "统计", icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <MainLayout title="联邦知识蒸馏">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">联邦知识蒸馏</h2>
            <p className="text-muted-foreground">跨客户脱敏知识包融合 (FedAvg / FedProx)</p>
          </div>
          <Button variant="outline" onClick={() => { packages.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{(packages.data as any)?.total ?? pkgList.length}</div>
                  <p className="text-xs text-muted-foreground">知识包总数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{(fusionHistory.data as any)?.total ?? 0}</div>
                  <p className="text-xs text-muted-foreground">融合次数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{new Set(pkgList.map((p: any) => p.siteId)).size}</div>
                  <p className="text-xs text-muted-foreground">参与站点</p>
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

        {tab === "packages" && (
          <Card>
            <CardHeader><CardTitle>已接收的知识包</CardTitle></CardHeader>
            <CardContent>
              {packages.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : pkgList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>暂无知识包</p>
                  <p className="text-xs mt-1">等待现场上传脱敏知识包</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pkgList.map((p: any) => (
                    <div key={p.packageId} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium font-mono">{p.packageId?.slice(0, 8)}...</span>
                          <Badge variant="outline">{p.siteId}</Badge>
                          <span className="text-xs text-muted-foreground">v{p.version}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          数据集: {p.localTraining?.datasetSize ?? "-"} | 准确率: {p.localTraining?.accuracy ? (p.localTraining.accuracy * 100).toFixed(1) + "%" : "-"} | 三元组: {p.knowledgeTriples?.length ?? "-"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{p.timestamp ? new Date(p.timestamp).toLocaleDateString("zh-CN") : "-"}</span>
                      <Badge variant={p.signature ? "default" : "secondary"}>
                        <Shield className="w-3 h-3 mr-1" />{p.signature ? "已签名" : "未签名"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "fusion" && (
          <Card>
            <CardHeader><CardTitle>融合历史</CardTitle></CardHeader>
            <CardContent>
              {fusionHistory.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : (
                <div className="space-y-2">
                  {((fusionHistory.data as any)?.history || []).map((h: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded bg-muted/30">
                      <GitMerge className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{h.fusionId}</span>
                          <Badge variant="outline">v{h.globalModelVersion}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          三元组: {h.tripleCount} | 签名: {h.signatureCount} | 参与者: {h.contributors} | 冲突解决: {h.conflictsResolved}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{h.durationMs}ms</span>
                      <span className="text-xs text-muted-foreground">{h.fusedAt ? new Date(h.fusedAt).toLocaleString("zh-CN") : "-"}</span>
                    </div>
                  ))}
                  {((fusionHistory.data as any)?.history || []).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <History className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>暂无融合历史</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "stats" && (
          <Card>
            <CardHeader><CardTitle>融合统计</CardTitle></CardHeader>
            <CardContent>
              {stats.isLoading ? <p className="text-center py-8 text-muted-foreground">加载中...</p> : stats.data ? (
                <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[500px]">
                  {JSON.stringify(stats.data, null, 2)}
                </pre>
              ) : <p className="text-center py-4 text-muted-foreground">暂无统计数据</p>}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
