/**
 * StatusBar — 底部状态栏，工业控制台风格
 * V4.1: 接入 Schema Registry，动态显示表数量、域数量、关系数量
 */
import { TOTAL_TABLE_COUNT, ALL_TABLES } from "@/data/registry";
import { DOMAINS } from "@/data/domains";
import { RELATIONS } from "@/data/relations";

export default function StatusBar() {
  const totalFields = ALL_TABLES.reduce((sum, t) => sum + t.fields.length, 0);

  return (
    <div className="h-6 flex items-center justify-between px-3 border-t border-border bg-card text-[10px] font-mono text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="status-led status-led-online" />
          <span>已连接</span>
        </div>
        <span>MySQL 8.0.45</span>
        <span>xilian@localhost:3306</span>
        <span>UTF8MB4</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{TOTAL_TABLE_COUNT} 表</span>
        <span>{totalFields} 字段</span>
        <span>{DOMAINS.length} 域</span>
        <span>{RELATIONS.length} 关系</span>
        <span className="opacity-60">Ctrl+S 保存</span>
        <span className="opacity-60">Ctrl+Enter 执行</span>
        <span>InnoDB</span>
        <span>v4.2.0-platform</span>
      </div>
    </div>
  );
}
