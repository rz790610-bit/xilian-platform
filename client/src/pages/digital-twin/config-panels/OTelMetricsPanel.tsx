/**
 * OTelMetricsPanel OpenTelemetry 运行时指标面板
 * 
 * 展示各模块的 OTel 指标：延迟、吞吐、错误率、资源使用
 */
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';

interface MetricDef {
  name: string;
  label: string;
  type: 'histogram' | 'counter' | 'gauge';
  unit: string;
  module: string;
}

const OTEL_METRICS: MetricDef[] = [
  { name: 'twin.sync.latency', label: '同步延迟', type: 'histogram', unit: 'ms', module: 'StateSyncEngine' },
  { name: 'twin.sync.events_total', label: '同步事件总数', type: 'counter', unit: '条', module: 'StateSyncEngine' },
  { name: 'twin.worldmodel.instances', label: 'WM 实例数', type: 'gauge', unit: '个', module: 'WorldModel' },
  { name: 'twin.worldmodel.update_latency', label: 'WM 更新延迟', type: 'histogram', unit: 'ms', module: 'WorldModel' },
  { name: 'twin.grok.requests_total', label: 'Grok 请求总数', type: 'counter', unit: '次', module: 'GrokEnhancer' },
  { name: 'twin.grok.latency', label: 'Grok 响应延迟', type: 'histogram', unit: 'ms', module: 'GrokEnhancer' },
  { name: 'twin.grok.circuit_open', label: '熔断器状态', type: 'gauge', unit: '', module: 'GrokEnhancer' },
  { name: 'twin.orchestrator.routing', label: '路由决策', type: 'counter', unit: '次', module: 'HybridOrchestrator' },
  { name: 'twin.simulation.duration', label: '仿真耗时', type: 'histogram', unit: 'ms', module: 'SimulationEngine' },
  { name: 'twin.outbox.pending', label: 'Outbox 待投递', type: 'gauge', unit: '条', module: 'OutboxRelay' },
  { name: 'twin.outbox.delivered_total', label: 'Outbox 已投递', type: 'counter', unit: '条', module: 'OutboxRelay' },
  { name: 'twin.eventbus.events_total', label: '事件总线事件数', type: 'counter', unit: '条', module: 'TwinEventBus' },
  { name: 'twin.rul.predictions_total', label: 'RUL 预测次数', type: 'counter', unit: '次', module: 'RULPredictor' },
];

interface Props {
  selectedModule?: string;
}

export default function OTelMetricsPanel({ selectedModule }: Props) {
  const filteredMetrics = selectedModule
    ? OTEL_METRICS.filter(m => m.module === selectedModule)
    : OTEL_METRICS;

  const typeColor = (type: string) => {
    switch (type) {
      case 'histogram': return 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/20';
      case 'counter': return 'text-green-600 border-green-300 bg-green-50 dark:bg-green-950/20';
      case 'gauge': return 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20';
      default: return '';
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'histogram': return 'Histogram';
      case 'counter': return 'Counter';
      case 'gauge': return 'Gauge';
      default: return type;
    }
  };

  // 按模块分组
  const grouped = filteredMetrics.reduce<Record<string, MetricDef[]>>((acc, m) => {
    if (!acc[m.module]) acc[m.module] = [];
    acc[m.module].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <PageCard title={`OTel 指标 (${filteredMetrics.length} 项)`} icon={<span className="text-xs">📈</span>} compact>
        <div className="space-y-3">
          {Object.entries(grouped).map(([module, metrics]) => (
            <div key={module}>
              <div className="text-[9px] font-medium text-muted-foreground mb-1">{module}</div>
              <div className="space-y-1">
                {metrics.map(m => (
                  <div key={m.name} className="flex items-center gap-2 p-1.5 bg-muted/20 rounded">
                    <Badge variant="outline" className={`text-[7px] w-16 justify-center ${typeColor(m.type)}`}>
                      {typeLabel(m.type)}
                    </Badge>
                    <div className="flex-1">
                      <div className="text-[9px] font-mono">{m.name}</div>
                      <div className="text-[8px] text-muted-foreground">{m.label}</div>
                    </div>
                    {m.unit && (
                      <span className="text-[8px] text-muted-foreground">{m.unit}</span>
                    )}
                    {/* 模拟实时值 */}
                    <div className="text-right">
                      <div className="text-[10px] font-mono font-semibold">
                        {m.type === 'counter' ? Math.floor(Math.random() * 10000).toLocaleString()
                          : m.type === 'gauge' ? Math.floor(Math.random() * 100)
                          : `p50: ${Math.floor(Math.random() * 100)}ms`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageCard>

      <PageCard title="Prometheus 端点" icon={<span className="text-xs">🔗</span>} compact>
        <div className="p-2 bg-muted/20 rounded">
          <div className="text-[9px] font-mono text-muted-foreground">
            GET /metrics → Prometheus 格式导出
          </div>
          <div className="text-[8px] text-muted-foreground mt-1">
            所有指标均通过 OpenTelemetry SDK 自动采集，可接入 Grafana / Datadog / 自建 Prometheus
          </div>
        </div>
      </PageCard>
    </div>
  );
}
