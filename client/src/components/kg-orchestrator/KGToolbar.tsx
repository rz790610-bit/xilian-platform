/**
 * 知识图谱编排器 — 工具栏
 */
import { useKGOrchestratorStore } from "../../stores/kgOrchestratorStore";
import { useToast } from "@/components/common/Toast";

interface KGToolbarProps {
  onSave?: () => void;
  onRunDiagnosis?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export default function KGToolbar({ onSave, onRunDiagnosis, onExport, onImport }: KGToolbarProps) {
  const {
    graphName, graphId, isDirty, status, nodes, edges,
    newGraph, clearCanvas, setZoom, zoom,
    setGraphInfo,
  } = useKGOrchestratorStore();
  const toast = useToast();

  return (
    <div className="h-11 bg-slate-900 border-b border-slate-700/50 flex items-center px-3 gap-1">
      {/* 图谱名称 */}
      <input
        type="text"
        value={graphName}
        onChange={e => setGraphInfo({ graphName: e.target.value })}
        className="bg-transparent border-none text-sm font-semibold text-slate-200 w-40 focus:outline-none focus:bg-slate-800 rounded px-1"
      />
      {isDirty && <span className="text-amber-400 text-xs">●</span>}

      <div className="w-px h-5 bg-slate-700 mx-2" />

      {/* 新建 */}
      <ToolBtn icon="📄" label="新建" onClick={() => {
        if (isDirty && !confirm("当前图谱未保存，确定新建？")) return;
        newGraph();
      }} />

      {/* 保存 */}
      <ToolBtn icon="💾" label="保存" onClick={() => {
        if (onSave) onSave();
        else toast.success("图谱已保存");
      }} highlight={isDirty} />

      <div className="w-px h-5 bg-slate-700 mx-1" />

      {/* 运行诊断 */}
      <ToolBtn icon="▶️" label="运行诊断" onClick={() => {
        if (nodes.length === 0) {
          toast.error("画布为空，无法运行诊断");
          return;
        }
        if (onRunDiagnosis) onRunDiagnosis();
        else toast.info("诊断功能开发中");
      }} accent />

      <div className="w-px h-5 bg-slate-700 mx-1" />

      {/* 导入/导出 */}
      <ToolBtn icon="📥" label="导入" onClick={() => {
        if (onImport) onImport();
        else toast.info("导入功能开发中");
      }} />
      <ToolBtn icon="📤" label="导出" onClick={() => {
        if (onExport) onExport();
        else {
          const data = JSON.stringify({
            graphId, graphName, nodes, edges, status,
            exportedAt: new Date().toISOString(),
          }, null, 2);
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `kg-${graphName}.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`已导出 ${graphName}.json`);
        }
      }} />

      {/* 清空 */}
      <ToolBtn icon="🗑️" label="清空" onClick={() => {
        if (nodes.length === 0) return;
        if (confirm(`确定清空画布？（${nodes.length} 节点，${edges.length} 关系）`)) {
          clearCanvas();
        }
      }} />

      <div className="flex-1" />

      {/* 缩放 */}
      <button onClick={() => setZoom(zoom - 0.1)}
        className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 text-sm">−</button>
      <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(zoom + 0.1)}
        className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200 text-sm">+</button>
      <button onClick={() => setZoom(1)}
        className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-300">重置</button>

      <div className="w-px h-5 bg-slate-700 mx-2" />

      {/* 状态 */}
      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
        status === 'active' ? 'border-green-700 text-green-400' :
        status === 'evolving' ? 'border-amber-700 text-amber-400' :
        status === 'archived' ? 'border-slate-600 text-slate-500' :
        'border-slate-600 text-slate-400'
      }`}>
        {status === 'draft' ? '草稿' : status === 'active' ? '已激活' : status === 'evolving' ? '进化中' : '已归档'}
      </span>
    </div>
  );
}

function ToolBtn({ icon, label, onClick, highlight, accent }: {
  icon: string; label: string; onClick: () => void; highlight?: boolean; accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
        accent
          ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-700/50"
          : highlight
            ? "text-amber-400 hover:bg-slate-800"
            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
      title={label}
    >
      <span className="text-sm">{icon}</span>
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
