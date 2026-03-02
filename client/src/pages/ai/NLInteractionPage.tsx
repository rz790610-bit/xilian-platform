/**
 * P2-9 自然语言交互页面 — NLInteractionPage
 *
 * 功能：
 * 1. 聊天界面 — 用户发送自然语言问题，AI 返回结构化回答
 * 2. 设备上下文 — 可选设备 ID 限定查询范围
 * 3. 智能建议 — 根据上下文推荐常用查询
 * 4. 图表渲染 — 支持 ChartSpec 中 line/bar/gauge/table 的渲染
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  Send, Loader2, Bot, User, MessageSquare, Sparkles,
  Monitor, BarChart3, Table, Gauge, TrendingUp,
} from 'lucide-react';

// ==================== 类型 ====================

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: string;
  charts?: any[];
  suggestions?: string[];
  confidence?: number;
  durationMs?: number;
}

// ==================== 常量 ====================

const INTENT_LABELS: Record<string, string> = {
  device_status_query: '设备状态',
  sensor_data_query: '传感器数据',
  diagnosis_query: '诊断查询',
  alert_query: '告警查询',
  maintenance_query: '维护查询',
  comparison_query: '对比查询',
  prediction_query: '预测查询',
  knowledge_query: '知识查询',
  operation_query: '操作查询',
  report_query: '报告查询',
  config_query: '配置查询',
  general_query: '通用查询',
};

const SUPPORTED_INTENTS = [
  { intent: 'device_status_query', example: '3号岸桥当前状态怎样？' },
  { intent: 'sensor_data_query', example: '起升机构振动值多少？' },
  { intent: 'diagnosis_query', example: '最近有什么故障诊断结果？' },
  { intent: 'alert_query', example: '当前有哪些未处理的告警？' },
  { intent: 'maintenance_query', example: '什么时候需要维护？' },
  { intent: 'comparison_query', example: '1号和3号岸桥对比' },
  { intent: 'prediction_query', example: '预测剩余使用寿命' },
  { intent: 'knowledge_query', example: '轴承故障有哪些特征？' },
];

// ==================== Chart 渲染组件 ====================

function ChartRenderer({ chart }: { chart: any }) {
  const data = chart.data as Record<string, any>;

  if (chart.type === 'gauge') {
    const value = data.value ?? data.current ?? 0;
    const max = data.max ?? 100;
    const pct = Math.min((value / max) * 100, 100);
    return (
      <div className="p-3 rounded-lg border border-zinc-700">
        <p className="text-xs text-zinc-400 mb-2">{chart.title}</p>
        <div className="flex items-center gap-3">
          <Progress value={pct} className="flex-1 h-3" />
          <span className="text-sm font-mono">{value}/{max}</span>
        </div>
      </div>
    );
  }

  if (chart.type === 'table') {
    const rows = (data.rows ?? data.items ?? []) as any[];
    const columns = (data.columns ?? Object.keys(rows[0] ?? {})) as string[];
    return (
      <div className="p-3 rounded-lg border border-zinc-700 overflow-x-auto">
        <p className="text-xs text-zinc-400 mb-2">{chart.title}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-700">
              {columns.map((col: string) => (
                <th key={col} className="text-left py-1 px-2 text-zinc-400 font-normal">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row: any, i: number) => (
              <tr key={i} className="border-b border-zinc-800">
                {columns.map((col: string) => (
                  <td key={col} className="py-1 px-2">{String(row[col] ?? '-')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // line / bar — 简化展示
  if (chart.type === 'line' || chart.type === 'bar') {
    const values = (data.values ?? data.series ?? []) as number[];
    const labels = (data.labels ?? data.categories ?? []) as string[];
    const maxVal = Math.max(...values, 1);
    return (
      <div className="p-3 rounded-lg border border-zinc-700">
        <p className="text-xs text-zinc-400 mb-2">{chart.title}</p>
        <div className="flex items-end gap-1 h-24">
          {values.slice(0, 20).map((v: number, i: number) => (
            <div key={i} className="flex flex-col items-center flex-1 gap-1">
              <div
                className={cn('w-full rounded-t', chart.type === 'bar' ? 'bg-blue-500' : 'bg-emerald-500')}
                style={{ height: `${(v / maxVal) * 80}px`, minHeight: '2px' }}
              />
              {labels[i] && <span className="text-[10px] text-zinc-500 truncate w-full text-center">{labels[i]}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // heatmap fallback
  return (
    <div className="p-3 rounded-lg border border-zinc-700">
      <p className="text-xs text-zinc-400 mb-2">{chart.title} ({chart.type})</p>
      <pre className="text-xs text-zinc-500 overflow-x-auto">{JSON.stringify(data, null, 2).slice(0, 300)}</pre>
    </div>
  );
}

// ==================== 主组件 ====================

export default function NLInteractionPage() {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 状态
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [machineId, setMachineId] = useState('');
  const [conversationId] = useState(() => crypto.randomUUID());
  const [sessionId] = useState(() => crypto.randomUUID());

  // tRPC
  const converseMutation = trpc.ai.nl.converse.useMutation({
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        id: data.requestId,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(data.timestamp),
        intent: data.intent?.intent,
        charts: data.charts,
        suggestions: data.suggestions,
        confidence: data.intent?.confidence,
        durationMs: data.durationMs,
      };
      setMessages(prev => [...prev, assistantMsg]);
    },
    onError: (err) => {
      toast({ title: 'AI 回复失败', description: err.message, variant: 'destructive' });
      // Add error message
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `抱歉，处理请求时出现错误：${err.message}`,
        timestamp: new Date(),
      }]);
    },
  });

  const suggestQuery = trpc.ai.nl.suggest.useQuery(
    { machineId: machineId || undefined, recentQueries: messages.filter(m => m.role === 'user').slice(-3).map(m => m.content) },
    { enabled: true, refetchInterval: 60000 },
  );

  // 自动滚动
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 发送消息
  const handleSend = useCallback(() => {
    const query = inputValue.trim();
    if (!query || converseMutation.isPending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');

    converseMutation.mutate({
      query,
      sessionId,
      conversationId,
      machineId: machineId || undefined,
      history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
    });
  }, [inputValue, converseMutation, sessionId, conversationId, machineId, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInputValue(text);
  };

  return (
    <MainLayout title="AI 自然语言交互">
      <div className="flex gap-4 h-[calc(100vh-140px)]">
        {/* 左侧边栏 (25%) */}
        <div className="w-1/4 space-y-4 shrink-0">
          {/* 设备上下文 */}
          <PageCard title="设备上下文">
            <div className="space-y-2">
              <Label className="text-xs">设备 ID（可选）</Label>
              <Input
                placeholder="如 GJM12，留空则全局查询"
                value={machineId}
                onChange={e => setMachineId(e.target.value)}
              />
              {machineId && (
                <Badge variant="outline" className="text-xs">
                  <Monitor className="w-3 h-3 mr-1" />{machineId}
                </Badge>
              )}
            </div>
          </PageCard>

          {/* 智能建议 */}
          <PageCard title="智能建议">
            <div className="flex flex-wrap gap-2">
              {(suggestQuery.data ?? []).map((s, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs h-auto py-1.5 px-2 whitespace-normal text-left"
                  onClick={() => handleSuggestionClick(s)}
                >
                  <Sparkles className="w-3 h-3 mr-1 shrink-0" />
                  {s}
                </Button>
              ))}
              {(!suggestQuery.data || suggestQuery.data.length === 0) && (
                <p className="text-xs text-zinc-500">暂无建议</p>
              )}
            </div>
          </PageCard>

          {/* 支持意图 */}
          <PageCard title="支持的查询类型">
            <div className="space-y-2">
              {SUPPORTED_INTENTS.map(({ intent, example }) => (
                <Button
                  key={intent}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs h-auto py-1.5 text-left"
                  onClick={() => handleSuggestionClick(example)}
                >
                  <Badge variant="outline" className="text-[10px] mr-2 shrink-0">
                    {INTENT_LABELS[intent]}
                  </Badge>
                  <span className="truncate text-zinc-400">{example}</span>
                </Button>
              ))}
            </div>
          </PageCard>
        </div>

        {/* 主聊天区 (75%) */}
        <div className="flex-1 flex flex-col border border-zinc-800 rounded-xl overflow-hidden">
          {/* 消息列表 */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-64 text-zinc-500">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">输入自然语言问题，开始与 AI 对话</p>
                    <p className="text-xs text-zinc-600 mt-1">支持设备状态、传感器数据、诊断、告警等查询</p>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
                >
                  {/* 头像 */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                    msg.role === 'user' ? 'bg-blue-500/20' : 'bg-emerald-500/20',
                  )}>
                    {msg.role === 'user' ? <User className="w-4 h-4 text-blue-400" /> : <Bot className="w-4 h-4 text-emerald-400" />}
                  </div>

                  {/* 消息体 */}
                  <div className={cn('max-w-[75%] space-y-2', msg.role === 'user' ? 'items-end' : '')}>
                    {/* 意图标签 */}
                    {msg.intent && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {INTENT_LABELS[msg.intent] ?? msg.intent}
                        </Badge>
                        {msg.confidence != null && (
                          <span className="text-[10px] text-zinc-500">{(msg.confidence * 100).toFixed(0)}%</span>
                        )}
                        {msg.durationMs != null && (
                          <span className="text-[10px] text-zinc-500">{msg.durationMs}ms</span>
                        )}
                      </div>
                    )}

                    {/* 消息文本 */}
                    <div className={cn(
                      'p-3 rounded-lg text-sm',
                      msg.role === 'user'
                        ? 'bg-blue-500/20 text-blue-100'
                        : 'bg-zinc-800 text-zinc-200',
                    )}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* 图表 */}
                    {msg.charts && msg.charts.length > 0 && (
                      <div className="space-y-2">
                        {msg.charts.map((chart: any, i: number) => (
                          <ChartRenderer key={i} chart={chart} />
                        ))}
                      </div>
                    )}

                    {/* 后续建议 */}
                    {msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestions.map((s, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="text-xs h-auto py-1 px-2"
                            onClick={() => handleSuggestionClick(s)}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 加载指示器 */}
              {converseMutation.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/20">
                    <Bot className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <span className="text-sm text-zinc-400">AI 思考中...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* 底部输入区 */}
          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-2">
              <Input
                placeholder="输入问题，如：3号岸桥起升机构振动值是多少？"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={converseMutation.isPending}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim() || converseMutation.isPending}
                size="icon"
              >
                {converseMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
