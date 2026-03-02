import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw, Cpu, Send, MessageSquare, Zap,
  Bot, Clock, Activity, Trash2,
} from "lucide-react";

export default function GrokDiagnostic() {
  const [deviceCode, setDeviceCode] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"quick" | "deep" | "predictive">("quick");
  const [sessionId, setSessionId] = useState(`session_${Date.now()}`);
  const [results, setResults] = useState<any[]>([]);

  const status = trpc.grokDiagnostic.status.useQuery();
  const history = trpc.grokDiagnostic.sessionHistory.useQuery(
    { sessionId },
    { enabled: !!sessionId, retry: false },
  );
  const diagnoseMut = trpc.grokDiagnostic.diagnose.useMutation({
    onSuccess: (data) => {
      setResults(prev => [{ ...data, timestamp: Date.now(), deviceCode, description, mode }, ...prev]);
    },
  });
  const clearMut = trpc.grokDiagnostic.clearSession.useMutation({
    onSuccess: () => { setSessionId(`session_${Date.now()}`); setResults([]); },
  });

  function handleDiagnose() {
    if (!deviceCode || !description) return;
    diagnoseMut.mutate({ deviceCode, description, mode, sessionId });
  }

  const agentStatus = status.data;

  return (
    <MainLayout title="Grok AI 诊断">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Grok AI 诊断代理</h2>
            <p className="text-muted-foreground">基于 AI 的设备故障诊断、多轮对话、批量诊断</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => status.refetch()}>
              <RefreshCw className="w-4 h-4 mr-1" /> 刷新
            </Button>
          </div>
        </div>

        {/* Agent 状态 */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">
                    <Badge variant={agentStatus?.enabled ? "default" : "secondary"}>
                      {agentStatus?.enabled ? "就绪" : "不可用"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Agent 状态</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{agentStatus?.model || "-"}</div>
                  <p className="text-xs text-muted-foreground">推理模型</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-500" />
                <div>
                  <div className="text-2xl font-bold">{agentStatus?.activeSessions ?? 0}</div>
                  <p className="text-xs text-muted-foreground">活跃会话</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{(agentStatus as any)?.totalDiagnoses ?? 0}</div>
                  <p className="text-xs text-muted-foreground">累计诊断</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 诊断输入 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" /> 发起诊断
              </CardTitle>
              <div className="flex gap-2">
                <select className="border rounded px-2 py-1 text-sm bg-background" value={mode} onChange={e => setMode(e.target.value as any)}>
                  <option value="quick">快速诊断</option>
                  <option value="deep">深度诊断</option>
                  <option value="predictive">预测性诊断</option>
                </select>
                <Button size="sm" variant="ghost" onClick={() => clearMut.mutate({ sessionId })}>
                  <Trash2 className="w-4 h-4 mr-1" /> 清除会话
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="设备编码 (如: QC-001)"
                value={deviceCode}
                onChange={e => setDeviceCode(e.target.value)}
                className="w-48"
              />
              <Input
                placeholder="故障描述 (至少5个字符)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={handleDiagnose}
                disabled={diagnoseMut.isPending || !deviceCode || description.length < 5}
              >
                {diagnoseMut.isPending ? (
                  <><RefreshCw className="w-4 h-4 mr-1 animate-spin" /> 诊断中...</>
                ) : (
                  <><Send className="w-4 h-4 mr-1" /> 发送</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 诊断结果 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" /> 诊断结果
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 && !history.data?.found ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bot className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>暂无诊断结果</p>
                <p className="text-xs mt-1">输入设备编码和故障描述，发起诊断</p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.map((r, i) => (
                  <Card key={i} className="bg-muted/30">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{r.deviceCode}</Badge>
                          <Badge variant={r.mode === "deep" ? "default" : r.mode === "predictive" ? "destructive" : "secondary"}>
                            {r.mode === "quick" ? "快速" : r.mode === "deep" ? "深度" : "预测性"}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleString("zh-CN")}</span>
                      </div>
                      <p className="text-sm mb-2 text-muted-foreground">问题: {r.description}</p>
                      {r.success && r.data ? (
                        <div className="space-y-2">
                          {r.data.diagnosis && (
                            <div className="bg-background rounded p-3">
                              <p className="text-sm font-medium mb-1">诊断结论:</p>
                              <p className="text-sm">{typeof r.data.diagnosis === "string" ? r.data.diagnosis : JSON.stringify(r.data.diagnosis, null, 2)}</p>
                            </div>
                          )}
                          {r.data.recommendation && (
                            <div className="bg-background rounded p-3">
                              <p className="text-sm font-medium mb-1">维修建议:</p>
                              <p className="text-sm">{typeof r.data.recommendation === "string" ? r.data.recommendation : JSON.stringify(r.data.recommendation)}</p>
                            </div>
                          )}
                          {r.data.confidence !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">置信度:</span>
                              <Badge>{(r.data.confidence * 100).toFixed(1)}%</Badge>
                            </div>
                          )}
                          {!r.data.diagnosis && !r.data.recommendation && (
                            <pre className="text-xs bg-background rounded p-3 overflow-auto max-h-40">{JSON.stringify(r.data, null, 2)}</pre>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-destructive">诊断失败</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {/* 历史消息 */}
                {history.data?.found && history.data.messages.map((m: any, i: number) => (
                  <div key={`hist-${i}`} className={`p-3 rounded text-sm ${m.role === "assistant" ? "bg-blue-500/10 ml-4" : "bg-muted/30 mr-4"}`}>
                    <span className="text-xs font-medium">{m.role === "assistant" ? "AI" : "用户"}: </span>
                    {m.content}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
