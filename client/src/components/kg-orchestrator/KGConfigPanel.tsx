/**
 * 知识图谱编排器 — 配置面板
 * 选中节点或关系后显示配置表单
 */
import { useMemo, useState } from "react";
import { useKGOrchestratorStore } from "../../stores/kgOrchestratorStore";
import { getKGNodeTypeInfo, getKGRelationTypeInfo, ALL_KG_RELATION_TYPES } from "../../../../shared/kgOrchestratorTypes";
import type { KGConfigField } from "../../../../shared/kgOrchestratorTypes";

export default function KGConfigPanel() {
  const {
    nodes, edges, selectedNodeId, selectedEdgeId,
    updateNode, updateEdge, removeNode, removeEdge,
    selectNode, selectEdge,
  } = useKGOrchestratorStore();

  const selectedNode = useMemo(() => nodes.find(n => n.nodeId === selectedNodeId), [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find(e => e.edgeId === selectedEdgeId), [edges, selectedEdgeId]);

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-72 bg-slate-900 border-l border-slate-700/50 flex items-center justify-center">
        <div className="text-center text-slate-500 text-sm">
          <div className="text-2xl mb-2">🔧</div>
          <div>选中节点或关系</div>
          <div className="text-xs mt-1">查看和编辑配置</div>
        </div>
      </div>
    );
  }

  // ============ 节点配置 ============
  if (selectedNode) {
    const info = getKGNodeTypeInfo(selectedNode.subType);
    return (
      <div className="w-72 bg-slate-900 border-l border-slate-700/50 flex flex-col h-full">
        {/* 头部 */}
        <div className="p-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="text-lg">{info?.icon ?? "📦"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">{selectedNode.label}</div>
              <div className="text-[10px] text-slate-500">{info?.description}</div>
            </div>
            <button onClick={() => selectNode(null)} className="text-slate-500 hover:text-slate-300 text-lg">×</button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border"
              style={{ borderColor: info?.color, color: info?.color }}>
              {info?.category === 'equipment' ? '设备层' :
               info?.category === 'fault' ? '故障层' :
               info?.category === 'diagnosis' ? '诊断层' :
               info?.category === 'solution' ? '解决方案层' :
               info?.category === 'data' ? '数据层' : '机理层'}
            </span>
            <span className="text-[10px] text-slate-600">{selectedNode.nodeId.slice(0, 12)}</span>
          </div>
        </div>

        {/* 配置表单 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* 基本信息 */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">节点名称</label>
            <input
              type="text"
              value={selectedNode.label}
              onChange={e => updateNode(selectedNode.nodeId, { label: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">节点状态</label>
            <select
              value={selectedNode.nodeStatus}
              onChange={e => updateNode(selectedNode.nodeId, { nodeStatus: e.target.value as any })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="normal">正常</option>
              <option value="pending_confirm">待确认</option>
              <option value="deprecated">已废弃</option>
            </select>
          </div>

          {/* 参数配置 */}
          {info?.configSchema && info.configSchema.length > 0 && (
            <div className="border-t border-slate-700/50 pt-3">
              <div className="text-xs font-semibold text-slate-400 mb-2">参数配置</div>
              {info.configSchema.map(field => (
                <ConfigFieldInput
                  key={field.key}
                  field={field}
                  value={selectedNode.config[field.key]}
                  onChange={(val) => updateNode(selectedNode.nodeId, {
                    config: { ...selectedNode.config, [field.key]: val },
                  })}
                />
              ))}
            </div>
          )}

          {/* 运行统计 */}
          {((selectedNode.hitCount ?? 0) > 0 || (selectedNode.accuracy ?? 0) > 0) && (
            <div className="border-t border-slate-700/50 pt-3">
              <div className="text-xs font-semibold text-slate-400 mb-2">运行统计</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-slate-500">命中次数</div>
                  <div className="text-blue-400 font-semibold">{selectedNode.hitCount ?? 0}</div>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-slate-500">准确率</div>
                  <div className="text-green-400 font-semibold">{((selectedNode.accuracy ?? 0) * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="p-3 border-t border-slate-700/50 flex gap-2">
          <button
            onClick={() => { removeNode(selectedNode.nodeId); selectNode(null); }}
            className="flex-1 px-3 py-1.5 text-xs text-red-400 border border-red-800 rounded hover:bg-red-900/30"
          >
            删除节点
          </button>
        </div>
      </div>
    );
  }

  // ============ 关系配置 ============
  if (selectedEdge) {
    const relInfo = getKGRelationTypeInfo(selectedEdge.relationType);
    const srcNode = nodes.find(n => n.nodeId === selectedEdge.sourceNodeId);
    const tgtNode = nodes.find(n => n.nodeId === selectedEdge.targetNodeId);

    return (
      <div className="w-72 bg-slate-900 border-l border-slate-700/50 flex flex-col h-full">
        <div className="p-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: relInfo?.color }} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-200">{relInfo?.label ?? selectedEdge.relationType}</div>
              <div className="text-[10px] text-slate-500">{relInfo?.description}</div>
            </div>
            <button onClick={() => selectEdge(null)} className="text-slate-500 hover:text-slate-300 text-lg">×</button>
          </div>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
            <span className="truncate max-w-[80px]">{srcNode?.label ?? "?"}</span>
            <span>→</span>
            <span className="truncate max-w-[80px]">{tgtNode?.label ?? "?"}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">关系标签</label>
            <input
              type="text"
              value={selectedEdge.label ?? ""}
              onChange={e => updateEdge(selectedEdge.edgeId, { label: e.target.value })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">关系类型</label>
            <select
              value={selectedEdge.relationType}
              onChange={e => updateEdge(selectedEdge.edgeId, { relationType: e.target.value as any })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ALL_KG_RELATION_TYPES.map(r => (
                <option key={r.type} value={r.type}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">权重 (0-10)</label>
            <input
              type="number"
              min={0} max={10} step={0.1}
              value={selectedEdge.weight}
              onChange={e => updateEdge(selectedEdge.edgeId, { weight: parseFloat(e.target.value) || 1 })}
              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 运行统计 */}
          {((selectedEdge.hitCount ?? 0) > 0 || (selectedEdge.pathAccuracy ?? 0) > 0) && (
            <div className="border-t border-slate-700/50 pt-3">
              <div className="text-xs font-semibold text-slate-400 mb-2">路径统计</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-slate-500">命中次数</div>
                  <div className="text-blue-400 font-semibold">{selectedEdge.hitCount ?? 0}</div>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-slate-500">路径准确率</div>
                  <div className="text-green-400 font-semibold">{((selectedEdge.pathAccuracy ?? 0) * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-slate-700/50 flex gap-2">
          <button
            onClick={() => { removeEdge(selectedEdge.edgeId); selectEdge(null); }}
            className="flex-1 px-3 py-1.5 text-xs text-red-400 border border-red-800 rounded hover:bg-red-900/30"
          >
            删除关系
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ============ 配置字段输入组件 ============
function ConfigFieldInput({ field, value, onChange }: {
  field: KGConfigField;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const [listInput, setListInput] = useState("");

  return (
    <div className="mb-2.5">
      <label className="text-[11px] text-slate-400 block mb-1">
        {field.label}
        {field.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {field.type === "string" && (
        <input
          type="text"
          value={(value as string) ?? field.defaultValue ?? ""}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}

      {field.type === "number" && (
        <input
          type="number"
          value={(value as number) ?? field.defaultValue ?? ""}
          placeholder={field.placeholder}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}

      {field.type === "boolean" && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={(value as boolean) ?? field.defaultValue ?? false}
            onChange={e => onChange(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-blue-500"
          />
          <span className="text-xs text-slate-300">{field.description ?? "启用"}</span>
        </label>
      )}

      {field.type === "select" && (
        <select
          value={(value as string) ?? field.defaultValue ?? ""}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">请选择</option>
          {field.options?.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}

      {field.type === "json" && (
        <textarea
          value={typeof value === "string" ? value : JSON.stringify(value ?? field.defaultValue ?? {}, null, 2)}
          onChange={e => {
            try { onChange(JSON.parse(e.target.value)); } catch { onChange(e.target.value); }
          }}
          rows={3}
          className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      )}

      {field.type === "string_list" && (
        <div>
          <div className="flex gap-1 flex-wrap mb-1">
            {(Array.isArray(value) ? value : []).map((item: any, i: number) => (
              <span key={i} className="inline-flex items-center gap-1 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-[10px] text-slate-300">
                {item}
                <button onClick={() => onChange((value as string[]).filter((_, j) => j !== i))}
                  className="text-slate-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              value={listInput}
              onChange={e => setListInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && listInput.trim()) {
                  onChange([...(Array.isArray(value) ? value : []), listInput.trim()]);
                  setListInput("");
                }
              }}
              placeholder="输入后回车添加"
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {field.description && field.type !== "boolean" && (
        <div className="text-[9px] text-slate-600 mt-0.5">{field.description}</div>
      )}
    </div>
  );
}
