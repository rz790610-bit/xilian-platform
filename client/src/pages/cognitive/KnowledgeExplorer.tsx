/**
 * ============================================================================
 * 知识探索器 — KnowledgeExplorer
 * ============================================================================
 *
 * 知识图谱可视化 + 知识结晶管理 + 特征注册表 + 模型注册表
 * 通过 tRPC 接入后端 evoKnowledge 域路由
 */

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';

// ============================================================================
// 类型
// ============================================================================

interface KGNode {
  id: string;
  label: string;
  type: 'equipment' | 'component' | 'failure' | 'symptom' | 'action' | 'condition';
  properties: Record<string, string>;
}

interface KGEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

interface Crystal {
  id: string;
  type: 'pattern' | 'rule' | 'threshold' | 'model';
  name: string;
  description: string;
  confidence: number;
  sourceCount: number;
  appliedCount: number;
  status: 'draft' | 'reviewed' | 'applied' | 'deprecated';
  createdAt: string;
}

interface Feature {
  id: string;
  name: string;
  domain: string;
  version: string;
  inputDimensions: string[];
  outputType: string;
  driftStatus: 'stable' | 'drifting' | 'critical';
  usageCount: number;
}

interface ModelEntry {
  id: string;
  name: string;
  version: string;
  type: string;
  stage: 'development' | 'staging' | 'production' | 'archived';
  accuracy: number;
  lastTrainedAt: string;
  servingCount: number;
}

// ============================================================================
// 子组件
// ============================================================================

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12 gap-3">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between">
      <span className="text-sm text-destructive">{message}</span>
      {onRetry && (
        <button className="text-xs px-3 py-1 bg-destructive text-destructive-foreground rounded" onClick={onRetry}>重试</button>
      )}
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

export default function KnowledgeExplorer() {
  const [activeTab, setActiveTab] = useState<'graph' | 'crystals' | 'features' | 'models'>('graph');

  // ---- tRPC 数据查询 ----
  const graphQuery = trpc.evoKnowledge.getKnowledgeGraph.useQuery(
    { depth: 3 },
    { enabled: activeTab === 'graph', retry: 2 }
  );

  const crystalsQuery = trpc.evoKnowledge.listCrystals.useQuery(undefined, {
    enabled: activeTab === 'crystals',
    retry: 2,
  });

  const featuresQuery = trpc.evoKnowledge.listFeatures.useQuery(undefined, {
    enabled: activeTab === 'features',
    retry: 2,
  });

  const modelsQuery = trpc.evoKnowledge.listModels.useQuery(undefined, {
    enabled: activeTab === 'models',
    retry: 2,
  });

  const applyCrystalMutation = trpc.evoKnowledge.applyCrystal.useMutation({
    onSuccess: () => crystalsQuery.refetch(),
  });

  // ---- 数据解构 ----
  const graphData = graphQuery.data as { nodes: KGNode[]; edges: KGEdge[] } | undefined;
  const nodes: KGNode[] = graphData?.nodes ?? [];
  const edges: KGEdge[] = graphData?.edges ?? [];
  const crystals: Crystal[] = (crystalsQuery.data as Crystal[]) ?? [];
  const features: Feature[] = (featuresQuery.data as Feature[]) ?? [];
  const models: ModelEntry[] = (modelsQuery.data as ModelEntry[]) ?? [];

  const nodeTypeColors: Record<string, string> = {
    equipment: 'bg-blue-500', component: 'bg-green-500', failure: 'bg-red-500',
    symptom: 'bg-yellow-500', action: 'bg-purple-500', condition: 'bg-orange-500',
  };
  const nodeTypeLabels: Record<string, string> = {
    equipment: '设备', component: '部件', failure: '故障', symptom: '症状', action: '动作', condition: '工况',
  };

  const applyCrystal = useCallback((crystalId: string) => {
    applyCrystalMutation.mutate({ crystalId });
  }, [applyCrystalMutation]);

  const stageColors: Record<string, string> = { development: 'bg-gray-500', staging: 'bg-yellow-500', production: 'bg-green-500', archived: 'bg-red-500' };
  const driftColors: Record<string, string> = { stable: 'text-green-500', drifting: 'text-yellow-500', critical: 'text-red-500' };

  const currentQuery = activeTab === 'graph' ? graphQuery : activeTab === 'crystals' ? crystalsQuery : activeTab === 'features' ? featuresQuery : modelsQuery;
  const isLoading = currentQuery.isLoading;
  const error = currentQuery.error;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">知识探索器</h1>
        <p className="text-sm text-muted-foreground mt-1">知识图谱 · 知识结晶 · 特征注册表 · 模型注册表</p>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {([
          { key: 'graph' as const, label: '知识图谱' },
          { key: 'crystals' as const, label: '知识结晶' },
          { key: 'features' as const, label: '特征注册表' },
          { key: 'models' as const, label: '模型注册表' },
        ]).map(tab => (
          <button key={tab.key} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingSpinner text="正在加载数据..." />}
      {error && <ErrorBanner message={`数据加载失败: ${error.message}`} onRetry={() => currentQuery.refetch()} />}

      {/* 知识图谱 */}
      {activeTab === 'graph' && !isLoading && !error && (
        <div className="space-y-4">
          <div className="flex gap-3">
            {Object.entries(nodeTypeLabels).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-full ${nodeTypeColors[type]}`} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">节点 ({nodes.length})</h3>
            {nodes.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">暂无知识节点</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {nodes.map(node => (
                  <div key={node.id} className="flex items-center gap-2 p-2 border border-border/50 rounded">
                    <div className={`w-3 h-3 rounded-full ${nodeTypeColors[node.type]}`} />
                    <span className="text-sm text-foreground">{node.label}</span>
                    <span className="text-xs text-muted-foreground">({nodeTypeLabels[node.type]})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">关系 ({edges.length})</h3>
            {edges.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">暂无知识关系</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2">源节点</th>
                    <th className="pb-2">关系</th>
                    <th className="pb-2">目标节点</th>
                    <th className="pb-2">权重</th>
                  </tr>
                </thead>
                <tbody>
                  {edges.map((edge, i) => {
                    const srcNode = nodes.find(n => n.id === edge.source);
                    const tgtNode = nodes.find(n => n.id === edge.target);
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{srcNode?.label ?? edge.source}</td>
                        <td className="py-2 text-blue-500">{edge.relation}</td>
                        <td className="py-2 text-foreground">{tgtNode?.label ?? edge.target}</td>
                        <td className="py-2 font-mono text-foreground">{edge.weight.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 知识结晶 */}
      {activeTab === 'crystals' && !isLoading && !error && (
        <div className="space-y-3">
          {crystals.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">暂无知识结晶</div>
          ) : crystals.map(crystal => {
            const statusColors: Record<string, string> = { draft: 'bg-gray-500', reviewed: 'bg-blue-500', applied: 'bg-green-500', deprecated: 'bg-red-500' };
            const statusLabels: Record<string, string> = { draft: '草稿', reviewed: '已审核', applied: '已应用', deprecated: '已废弃' };
            const typeLabels: Record<string, string> = { pattern: '模式', rule: '规则', threshold: '阈值', model: '模型' };

            return (
              <div key={crystal.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{typeLabels[crystal.type]}</span>
                    <span className="text-sm font-medium text-foreground">{crystal.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded text-white ${statusColors[crystal.status]}`}>{statusLabels[crystal.status]}</span>
                  </div>
                  {crystal.status === 'reviewed' && (
                    <button className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-80" onClick={() => applyCrystal(crystal.id)}>应用</button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mb-2">{crystal.description}</div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>置信度: <span className="text-foreground font-mono">{Math.round(crystal.confidence * 100)}%</span></span>
                  <span>数据源: <span className="text-foreground">{crystal.sourceCount}</span></span>
                  <span>应用次数: <span className="text-foreground">{crystal.appliedCount}</span></span>
                  <span>创建: {new Date(crystal.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 特征注册表 */}
      {activeTab === 'features' && !isLoading && !error && (
        <div className="bg-card border border-border rounded-lg p-4">
          {features.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无注册特征</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2">特征名</th>
                  <th className="pb-2">领域</th>
                  <th className="pb-2">版本</th>
                  <th className="pb-2">输入维度</th>
                  <th className="pb-2">漂移状态</th>
                  <th className="pb-2">使用次数</th>
                </tr>
              </thead>
              <tbody>
                {features.map(f => (
                  <tr key={f.id} className="border-b border-border/50">
                    <td className="py-2 font-mono text-foreground">{f.name}</td>
                    <td className="py-2 text-foreground">{f.domain}</td>
                    <td className="py-2 text-muted-foreground">{f.version}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {f.inputDimensions.map(d => <span key={d} className="text-xs px-1 py-0.5 bg-muted rounded text-muted-foreground">{d}</span>)}
                      </div>
                    </td>
                    <td className={`py-2 ${driftColors[f.driftStatus]}`}>{f.driftStatus}</td>
                    <td className="py-2 text-foreground">{f.usageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 模型注册表 */}
      {activeTab === 'models' && !isLoading && !error && (
        <div className="bg-card border border-border rounded-lg p-4">
          {models.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">暂无注册模型</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2">模型名</th>
                  <th className="pb-2">版本</th>
                  <th className="pb-2">类型</th>
                  <th className="pb-2">阶段</th>
                  <th className="pb-2">准确率</th>
                  <th className="pb-2">推理次数</th>
                  <th className="pb-2">最后训练</th>
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{m.name}</td>
                    <td className="py-2 font-mono text-muted-foreground">{m.version}</td>
                    <td className="py-2 text-muted-foreground">{m.type}</td>
                    <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded text-white ${stageColors[m.stage]}`}>{m.stage}</span></td>
                    <td className="py-2 font-mono text-foreground">{Math.round(m.accuracy * 100)}%</td>
                    <td className="py-2 text-foreground">{m.servingCount}</td>
                    <td className="py-2 text-xs text-muted-foreground">{new Date(m.lastTrainedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
