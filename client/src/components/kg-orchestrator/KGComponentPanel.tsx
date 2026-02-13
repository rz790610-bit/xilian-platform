/**
 * 知识图谱编排器 — 组件面板
 * 6 大类节点，支持搜索和拖拽
 */
import { useState, useCallback } from "react";
import { KG_NODE_CATEGORIES } from "../../../../shared/kgOrchestratorTypes";
import type { KGNodeTypeInfo } from "../../../../shared/kgOrchestratorTypes";

export default function KGComponentPanel() {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = useCallback((cat: string) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, info: KGNodeTypeInfo) => {
    e.dataTransfer.setData("application/kg-node", JSON.stringify({
      category: info.category,
      subType: info.subType,
      label: info.label,
    }));
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const filteredCategories = KG_NODE_CATEGORIES.map(cat => ({
    ...cat,
    nodes: cat.nodes.filter(n =>
      !search || n.label.includes(search) || n.description.includes(search) || n.subType.includes(search.toLowerCase())
    ),
  })).filter(cat => cat.nodes.length > 0);

  return (
    <div className="w-60 bg-slate-900 border-r border-slate-700/50 flex flex-col h-full">
      {/* 搜索 */}
      <div className="p-3 border-b border-slate-700/50">
        <input
          type="text"
          placeholder="搜索节点..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 节点列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredCategories.map(cat => (
          <div key={cat.category}>
            {/* 类别标题 */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800/50 border-b border-slate-800"
              onClick={() => toggleCategory(cat.category)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span className="ml-auto text-slate-600">{cat.nodes.length}</span>
              <svg className={`w-3 h-3 transition-transform ${collapsed[cat.category] ? "" : "rotate-90"}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* 节点项 */}
            {!collapsed[cat.category] && cat.nodes.map(node => (
              <div
                key={node.subType}
                draggable
                onDragStart={(e) => handleDragStart(e, node)}
                className="flex items-center gap-2.5 px-3 py-2 mx-2 my-0.5 rounded-md cursor-grab hover:bg-slate-800 active:bg-slate-700 transition-colors group"
              >
                <span className="text-base flex-shrink-0">{node.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-200 truncate">{node.label}</div>
                  <div className="text-[10px] text-slate-500 truncate">{node.description}</div>
                </div>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: node.color }} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* 底部统计 */}
      <div className="p-2 border-t border-slate-700/50 text-center">
        <span className="text-[10px] text-slate-500">
          {KG_NODE_CATEGORIES.reduce((s, c) => s + c.nodes.length, 0)} 种节点类型 · 6 大类
        </span>
      </div>
    </div>
  );
}
