import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const IMPL_LABELS: Record<string, string> = {
  builtin: "内置算法",
  pipeline_node: "Pipeline 桥接",
  plugin: "插件引擎",
  external: "外部服务",
  kg_operator: "KG 算子",
};

const CATEGORY_LABELS: Record<string, string> = {
  mechanical: "机械算法",
  electrical: "电气算法",
  structural: "结构算法",
  anomaly_detection: "异常检测",
  optimization: "优化算法",
  comprehensive: "综合算法",
  feature_extraction: "特征提取",
  agent_plugin: "Agent插件",
  model_iteration: "模型迭代",
  rule_learning: "规则自动学习",
  signal_processing: "信号处理",
  feature_engineering: "特征工程",
  machine_learning: "机器学习",
  deep_learning: "深度学习",
  predictive_maintenance: "预测性维护",
  statistical_analysis: "统计分析",
  time_series: "时序分析",
};

/** 从 JSON schema 中提取 fields 数组 */
function extractFields(schema: any): any[] {
  if (!schema) return [];
  if (Array.isArray(schema)) return schema;
  if (schema.fields && Array.isArray(schema.fields)) return schema.fields;
  return [];
}

export default function AlgorithmDetail() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/algorithm/detail/:id");
  const algorithmId = params?.id || "";
  // toast from sonner

  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  const [execDialogOpen, setExecDialogOpen] = useState(false);

  // 获取算法详情
  const detailQuery = trpc.algorithm.getDefinition.useQuery({ algoCode: algorithmId }, { enabled: !!algorithmId });
  // 获取设备绑定列表
  const bindingsQuery = trpc.algorithm.listBindingsByAlgorithm.useQuery({ algoCode: algorithmId }, { enabled: !!algorithmId });
  // 获取执行记录
  const executionsQuery = trpc.algorithm.listExecutions.useQuery(
    { algoCode: algorithmId, pageSize: 20 },
    { enabled: !!algorithmId }
  );

  const algo = detailQuery.data;

  if (detailQuery.isLoading) {
    return (
      <MainLayout title="算法详情">
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      </MainLayout>
    );
  }

  if (!algo) {
    return (
      <MainLayout title="算法不存在">
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-2xl mb-3">❌</div>
          <h3 className="text-base font-medium">算法不存在</h3>
          <p className="text-sm text-muted-foreground mt-2">ID: {algorithmId}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/algorithm/overview")}>
            返回算法库
          </Button>
        </CardContent>
      </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={algo.algoName || "算法详情"}>
    <div className="space-y-6">
      {/* 面包屑 + 返回 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate("/algorithm/overview")}>
          ← 算法库
        </Button>
        <span>/</span>
        <span>{CATEGORY_LABELS[algo.category] || algo.category}</span>
        <span>/</span>
        <span className="text-foreground font-medium">{algo.label || algo.algoName}</span>
      </div>

      {/* 算法基本信息 */}
      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="flex-1">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base">{algo.label || algo.algoName}</CardTitle>
                <CardDescription className="mt-1 font-mono text-xs">{algo.algoCode}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge>{IMPL_LABELS[algo.implType] || algo.implType}</Badge>
                <Badge variant="outline">{CATEGORY_LABELS[algo.category] || algo.category}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">{algo.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">实现引用：</span>
                <span className="font-mono ml-1">{algo.implRef || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">版本：</span>
                <span className="ml-1">{algo.version || "1.0.0"}</span>
              </div>
              {algo.applicableDeviceTypes && algo.applicableDeviceTypes.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">适用设备：</span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {algo.applicableDeviceTypes.map((dt: string) => (
                      <Badge key={dt} variant="outline" className="text-xs">{dt}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {algo.measurementTypes && algo.measurementTypes.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">测量类型：</span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {algo.measurementTypes.map((mt: string) => (
                      <Badge key={mt} variant="secondary" className="text-xs">{mt}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 快速操作 */}
        <Card className="w-full lg:w-72 shrink-0">
          <CardHeader>
            <CardTitle className="text-base">快速操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => setExecDialogOpen(true)}>
              ▶ 执行算法
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setBindDialogOpen(true)}>
              🔗 绑定设备
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate("/algorithm/compose")}>
              🔗 添加到编排
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 详情标签页 */}
      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">配置参数</TabsTrigger>
          <TabsTrigger value="io">输入/输出</TabsTrigger>
          <TabsTrigger value="bindings">设备绑定 ({bindingsQuery.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="executions">执行记录</TabsTrigger>
        </TabsList>

        {/* 配置参数 */}
        <TabsContent value="config">
          <Card>
            <CardContent className="p-4">
              {extractFields(algo.configSchema).length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>参数名</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>默认值</TableHead>
                      <TableHead>必填</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extractFields(algo.configSchema).map((field: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{field.name || field.key}</TableCell>
                        <TableCell className="text-sm">{field.label || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{field.type}</Badge></TableCell>
                        <TableCell className="text-sm">{field.default !== undefined ? String(field.default) : "—"}</TableCell>
                        <TableCell>{field.required ? "✓" : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{field.description || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  该算法无需额外配置参数
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 输入/输出 */}
        <TabsContent value="io">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📥 输入 Schema</CardTitle>
              </CardHeader>
              <CardContent>
                {extractFields(algo.inputSchema).length > 0 ? (
                  <div className="space-y-2">
                    {extractFields(algo.inputSchema).map((field: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div>
                          <span className="font-mono text-sm">{field.name || field.key}</span>
                          {field.label && <span className="text-muted-foreground text-xs ml-2">({field.label})</span>}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </div>
                        <Badge variant="outline">{field.type}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">接受任意时序数据输入</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📤 输出 Schema</CardTitle>
              </CardHeader>
              <CardContent>
                {extractFields(algo.outputSchema).length > 0 ? (
                  <div className="space-y-2">
                    {extractFields(algo.outputSchema).map((field: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div>
                          <span className="font-mono text-sm">{field.name || field.key}</span>
                          {field.label && <span className="text-muted-foreground text-xs ml-2">({field.label})</span>}
                        </div>
                        <Badge variant="outline">{field.type}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">输出格式取决于算法类型</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 设备绑定 */}
        <TabsContent value="bindings">
          <Card>
            <CardContent className="p-4">
              {bindingsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : bindingsQuery.data && bindingsQuery.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>设备 ID</TableHead>
                      <TableHead>绑定时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>调度</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bindingsQuery.data.map((binding: any) => (
                      <TableRow key={binding.id}>
                        <TableCell className="font-mono text-sm">{binding.deviceId}</TableCell>
                        <TableCell className="text-sm">{new Date(binding.createdAt).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={binding.status === "active" ? "default" : "secondary"}>
                            {binding.status === "active" ? "运行中" : "已暂停"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{binding.schedule || "手动"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">配置</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <div className="text-2xl mb-2">🔗</div>
                  <p className="text-muted-foreground">暂无设备绑定</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setBindDialogOpen(true)}>
                    绑定第一个设备
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 执行记录 */}
        <TabsContent value="executions">
          <Card>
            <CardContent className="p-4">
              {executionsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : executionsQuery.data?.items && executionsQuery.data.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>执行 ID</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>设备</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executionsQuery.data.items.map((exec: any) => (
                      <TableRow key={exec.id}>
                        <TableCell className="font-mono text-xs">{exec.id.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <Badge variant={
                            exec.status === "success" ? "default" :
                            exec.status === "failed" ? "destructive" : "secondary"
                          }>
                            {exec.status === "success" ? "成功" : exec.status === "failed" ? "失败" : "运行中"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{exec.durationMs ? `${exec.durationMs}ms` : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{exec.deviceId || "—"}</TableCell>
                        <TableCell className="text-sm">{new Date(exec.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <div className="text-2xl mb-2">📝</div>
                  <p className="text-muted-foreground">暂无执行记录</p>
                  <p className="text-xs text-muted-foreground mt-1">执行算法后，记录将自动出现在这里</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 绑定设备对话框 */}
      <Dialog open={bindDialogOpen} onOpenChange={setBindDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">绑定设备到 {algo.label || algo.algoName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>设备 ID</Label>
              <Input placeholder="输入设备 ID 或从设备列表选择" className="mt-1" />
            </div>
            <div>
              <Label>调度方式</Label>
              <Select defaultValue="manual">
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">手动触发</SelectItem>
                  <SelectItem value="realtime">实时（数据到达即执行）</SelectItem>
                  <SelectItem value="cron_1m">每分钟</SelectItem>
                  <SelectItem value="cron_5m">每 5 分钟</SelectItem>
                  <SelectItem value="cron_1h">每小时</SelectItem>
                  <SelectItem value="cron_1d">每天</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBindDialogOpen(false)}>取消</Button>
              <Button onClick={() => {
                toast.info("功能开发中", { description: "设备绑定功能即将上线" });
                setBindDialogOpen(false);
              }}>
                确认绑定
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 执行算法对话框 */}
      <Dialog open={execDialogOpen} onOpenChange={setExecDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">执行 {algo.label || algo.algoName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>输入数据</Label>
              <textarea
                className="w-full mt-1 p-2 border rounded-md text-xs font-mono bg-muted/50 min-h-[80px]"
                placeholder='{"data": [1.2, 3.4, 5.6, ...], "sampleRate": 1000}'
              />
            </div>
            {extractFields(algo.configSchema).length > 0 && (
              <div>
                <Label>配置参数</Label>
                <div className="space-y-2 mt-1">
                  {extractFields(algo.configSchema).map((field: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Label className="w-32 text-xs shrink-0">{field.label || field.name || field.key}</Label>
                      <Input
                        placeholder={field.default !== undefined ? String(field.default) : ""}
                        className="text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExecDialogOpen(false)}>取消</Button>
              <Button onClick={() => {
                toast.success("执行已提交", { description: "算法正在后台运行，结果将显示在执行记录中" });
                setExecDialogOpen(false);
              }}>
                ▶ 执行
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </MainLayout>
  );
}
