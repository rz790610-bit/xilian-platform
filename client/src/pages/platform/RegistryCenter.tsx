import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Database, Search, Layers, List } from "lucide-react";

export default function RegistryCenter() {
  const [selectedRegistry, setSelectedRegistry] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const registries = trpc.registry.listRegistries.useQuery(undefined, { retry: false });
  const queryResult = trpc.registry.query.useQuery(
    { registry: selectedRegistry, search: searchTerm || undefined },
    { enabled: !!selectedRegistry, retry: false },
  );
  const categories = trpc.registry.listCategories.useQuery(
    { registry: selectedRegistry },
    { enabled: !!selectedRegistry, retry: false },
  );

  const registryList = Array.isArray(registries.data) ? registries.data : (registries.data as any)?.registries || Object.entries(registries.data || {}).map(([k, v]) => ({ name: k, ...((typeof v === "object" && v) || {}) }));

  return (
    <MainLayout title="注册中心">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">统一注册中心</h2>
            <p className="text-muted-foreground">所有模块的元数据、类型、配置自动同步</p>
          </div>
          <Button variant="outline" onClick={() => registries.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* 左侧：注册中心列表 */}
          <Card className="col-span-1">
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" /> 注册中心</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {registryList.map((r: any, i: number) => {
                  const name = r.name || r.id || String(i);
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedRegistry(name)}
                      className={`w-full text-left p-2 rounded text-sm transition-colors ${selectedRegistry === name ? "bg-primary/10 border border-primary/50" : "hover:bg-muted/50"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{name}</span>
                        {r.count !== undefined && <Badge variant="outline">{r.count}</Badge>}
                      </div>
                    </button>
                  );
                })}
                {registryList.length === 0 && (
                  <p className="text-center py-4 text-muted-foreground text-sm">暂无注册中心</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 右侧：查询结果 */}
          <div className="col-span-3 space-y-4">
            {!selectedRegistry ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>请从左侧选择注册中心</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1" />
                  <Button variant="outline" onClick={() => queryResult.refetch()}><Search className="w-4 h-4" /></Button>
                </div>

                {categories.data && (
                  <div className="flex gap-2 flex-wrap">
                    {(Array.isArray(categories.data) ? categories.data : []).map((c: any, i: number) => (
                      <Badge key={i} variant="outline" className="cursor-pointer">{typeof c === "string" ? c : c.name || c.id}</Badge>
                    ))}
                  </div>
                )}

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><List className="w-5 h-5" /> {selectedRegistry}</CardTitle></CardHeader>
                  <CardContent>
                    {queryResult.isLoading ? <p className="text-center py-4 text-muted-foreground">加载中...</p> : queryResult.data ? (
                      <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[500px]">
                        {JSON.stringify(queryResult.data, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-center py-4 text-muted-foreground">暂无数据</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
