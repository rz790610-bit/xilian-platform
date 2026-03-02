import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Settings, Cpu, Layers, Zap,
  ChevronRight, CheckCircle, Save, Database,
} from "lucide-react";

export default function BusinessConfig() {
  const [selectedDevice, setSelectedDevice] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [generatedConfig, setGeneratedConfig] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const utils = trpc.useUtils();

  const deviceTypes = trpc.businessConfig.getDeviceTypes.useQuery(undefined, { retry: false });
  const scenarios = trpc.businessConfig.getScenarios.useQuery(
    { deviceType: selectedDevice },
    { enabled: !!selectedDevice, retry: false },
  );
  const savedConfigs = trpc.businessConfig.getSavedConfigs.useQuery(undefined, { retry: false });

  const generateMut = trpc.businessConfig.generateConfig.useMutation({
    onSuccess: (data) => {
      setGeneratedConfig(data);
      setSaveStatus("idle");
    },
  });

  const saveMut = trpc.businessConfig.saveConfig.useMutation({
    onSuccess: () => {
      setSaveStatus("saved");
      utils.businessConfig.getSavedConfigs.invalidate();
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  function handleGenerate() {
    if (!selectedDevice || !selectedScenario) return;
    generateMut.mutate({ deviceType: selectedDevice, scenario: selectedScenario });
  }

  function handleSave() {
    if (!generatedConfig) return;
    setSaveStatus("saving");
    saveMut.mutate(generatedConfig);
  }

  return (
    <MainLayout title="业务配置">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">业务配置</h2>
            <p className="text-muted-foreground">选择设备类型 + 场景，自动生成三引擎配置</p>
          </div>
          <Button variant="outline" onClick={() => deviceTypes.refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
        </div>

        {/* 配置流程 */}
        <div className="grid grid-cols-3 gap-6">
          {/* Step 1: 选择设备类型 */}
          <Card className={selectedDevice ? "border-green-500/50" : "border-primary/50"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="w-5 h-5" />
                Step 1: 设备类型
                {selectedDevice && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deviceTypes.isLoading ? <p className="text-muted-foreground text-sm">加载中...</p> : (
                <div className="space-y-2">
                  {(Array.isArray(deviceTypes.data) ? deviceTypes.data : []).map((dt: any) => {
                    const code = typeof dt === "string" ? dt : dt.code || dt.id;
                    const label = typeof dt === "string" ? dt : dt.name || dt.label || dt.code;
                    return (
                      <button
                        key={code}
                        onClick={() => { setSelectedDevice(code); setSelectedScenario(""); setGeneratedConfig(null); }}
                        className={`w-full text-left p-3 rounded text-sm transition-colors ${selectedDevice === code ? "bg-primary/10 border border-primary/50" : "bg-muted/30 hover:bg-muted/50"}`}
                      >
                        <p className="font-medium">{label}</p>
                        {dt.description && <p className="text-xs text-muted-foreground mt-1">{dt.description}</p>}
                      </button>
                    );
                  })}
                  {(!deviceTypes.data || (Array.isArray(deviceTypes.data) && deviceTypes.data.length === 0)) && (
                    <div className="text-center py-4 text-muted-foreground">
                      <Settings className="w-8 h-8 mx-auto mb-1 opacity-30" />
                      <p className="text-sm">暂无设备类型</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: 选择场景 */}
          <Card className={selectedScenario ? "border-green-500/50" : selectedDevice ? "border-primary/50" : ""}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Step 2: 业务场景
                {selectedScenario && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDevice ? (
                <p className="text-center py-4 text-muted-foreground text-sm">请先选择设备类型</p>
              ) : scenarios.isLoading ? (
                <p className="text-muted-foreground text-sm">加载中...</p>
              ) : (
                <div className="space-y-2">
                  {(Array.isArray(scenarios.data) ? scenarios.data : (scenarios.data as any)?.scenarios || []).map((s: any) => {
                    const code = typeof s === "string" ? s : s.code || s.id;
                    const label = typeof s === "string" ? s : s.name || s.label || s.code;
                    return (
                      <button
                        key={code}
                        onClick={() => { setSelectedScenario(code); setGeneratedConfig(null); }}
                        className={`w-full text-left p-3 rounded text-sm transition-colors ${selectedScenario === code ? "bg-primary/10 border border-primary/50" : "bg-muted/30 hover:bg-muted/50"}`}
                      >
                        <p className="font-medium">{label}</p>
                        {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                      </button>
                    );
                  })}
                  {(Array.isArray(scenarios.data) ? scenarios.data : (scenarios.data as any)?.scenarios || []).length === 0 && (
                    <p className="text-center py-4 text-muted-foreground text-sm">该设备类型暂无场景</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: 生成配置 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Step 3: 生成配置
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">设备:</span>
                  <Badge variant="outline">{selectedDevice || "未选择"}</Badge>
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-muted-foreground">场景:</span>
                  <Badge variant="outline">{selectedScenario || "未选择"}</Badge>
                </div>
                <Button
                  className="w-full"
                  disabled={!selectedDevice || !selectedScenario || generateMut.isPending}
                  onClick={handleGenerate}
                >
                  {generateMut.isPending ? (
                    <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> 生成中...</>
                  ) : (
                    <><Zap className="w-4 h-4 mr-1" /> 生成三引擎配置</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 生成结果 */}
        {generatedConfig && (
          <Card className="border-green-500/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" /> 生成结果
                </span>
                <Button
                  size="sm"
                  disabled={saveMut.isPending || saveStatus === "saved"}
                  onClick={handleSave}
                >
                  {saveStatus === "saving" ? (
                    <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> 保存中...</>
                  ) : saveStatus === "saved" ? (
                    <><CheckCircle className="w-4 h-4 mr-1" /> 已保存</>
                  ) : saveStatus === "error" ? (
                    <><Save className="w-4 h-4 mr-1" /> 重试保存</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1" /> 保存到数据库</>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {saveStatus === "error" && (
                <p className="text-sm text-red-500 mb-2">保存失败，请重试</p>
              )}
              <pre className="bg-muted/30 rounded p-4 text-xs overflow-auto max-h-[500px]">
                {JSON.stringify(generatedConfig, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* 已保存的配置列表 */}
        {savedConfigs.data && savedConfigs.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" /> 已保存的配置
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {savedConfigs.data.map((cfg: any) => (
                  <div
                    key={cfg.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{cfg.deviceType}</Badge>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline">{cfg.scenario}</Badge>
                      <span className="text-xs text-muted-foreground">v{cfg.version}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(cfg.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
