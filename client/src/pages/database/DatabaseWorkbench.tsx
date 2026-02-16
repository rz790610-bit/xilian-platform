import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  Database, Table2, Play, Plus, Trash2, RefreshCw, Search,
  ChevronRight, ChevronDown, Eye, Edit3, Download, Upload,
  Terminal, Zap, Link2, Layers, HardDrive, Activity, Settings,
  ArrowUpDown, Filter, X, Check, AlertTriangle, Copy, Code2,
  LayoutGrid, List, Server, Wifi, WifiOff,
  GitBranch, Palette, BookOpen, Key, Hash, Type, Calendar, FileJson, Network, ArrowRight, Cpu, MapPin, ZoomIn, ZoomOut, Maximize2, EyeOff
} from 'lucide-react';

// Schema Registry 设计器组件（懒加载）
const ERDiagram = lazy(() => import('@/components/designer/ERDiagram'));
const VisualDesigner = lazy(() => import('@/components/designer/VisualDesigner'));
const SchemaTableManagement = lazy(() => import('@/components/designer/TableManagement'));
const SchemaDataBrowser = lazy(() => import('@/components/designer/DataBrowser'));
const SchemaSqlEditor = lazy(() => import('@/components/designer/SqlEditor'));
const SchemaStatusBar = lazy(() => import('@/components/designer/StatusBar'));
const ExportDDLDialog = lazy(() => import('@/components/designer/ExportDDLDialog'));

// ============ 类型 ============
type Tab = 'overview' | 'tables' | 'data' | 'sql' | 'create' | 'schema' | 'erd' | 'designer';
type TableDetailTab = 'columns' | 'indexes' | 'foreignKeys' | 'ddl' | 'api';

interface ColumnDef {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string;
  autoIncrement: boolean;
  primaryKey: boolean;
  unique: boolean;
  comment: string;
}

const COLUMN_TYPES = [
  'INT', 'BIGINT', 'TINYINT', 'SMALLINT', 'FLOAT', 'DOUBLE', 'DECIMAL(10,2)',
  'VARCHAR(255)', 'VARCHAR(100)', 'VARCHAR(50)', 'CHAR(36)', 'TEXT', 'LONGTEXT',
  'DATE', 'DATETIME', 'TIMESTAMP',
  'BOOLEAN', 'JSON', 'BLOB', 'ENUM',
];

// ============ 主组件 ============
export default function DatabaseWorkbench() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetailTab, setTableDetailTab] = useState<TableDetailTab>('columns');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM asset_tree_nodes LIMIT 20;');
  const [sqlHistory, setSqlHistory] = useState<string[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [dataPage, setDataPage] = useState(1);
  const [dataPageSize] = useState(50);
  const [dataFilters, setDataFilters] = useState<Array<{ column: string; operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'like' | 'is_null' | 'not_null'; value: string }>>([]);
  const [orderBy, setOrderBy] = useState<string | undefined>();
  const [orderDir, setOrderDir] = useState<'ASC' | 'DESC'>('ASC');
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [insertMode, setInsertMode] = useState(false);
  const [ddlDialogOpen, setDdlDialogOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, string>>({});

  // 建表向导状态
  const [newTableName, setNewTableName] = useState('');
  const [newTableComment, setNewTableComment] = useState('');
  const [newColumns, setNewColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'INT', nullable: false, defaultValue: '', autoIncrement: true, primaryKey: true, unique: false, comment: '主键' },
    { name: 'created_at', type: 'TIMESTAMP', nullable: false, defaultValue: 'CURRENT_TIMESTAMP', autoIncrement: false, primaryKey: false, unique: false, comment: '创建时间' },
  ]);

  // ============ tRPC 查询 ============
  const { data: connStatus, refetch: refetchConn, isLoading: loadingConn } = trpc.database.workbench.connection.getStatus.useQuery();
  const { data: tables, refetch: refetchTables, isLoading: loadingTables } = trpc.database.workbench.table.list.useQuery();
  const { data: moduleStats, refetch: refetchModules } = trpc.database.workbench.module.getStats.useQuery();

  const { data: columns } = trpc.database.workbench.table.getColumns.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable }
  );
  const { data: indexes } = trpc.database.workbench.table.getIndexes.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable && tableDetailTab === 'indexes' }
  );
  const { data: foreignKeys } = trpc.database.workbench.table.getForeignKeys.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable && tableDetailTab === 'foreignKeys' }
  );
  const { data: createSQL } = trpc.database.workbench.table.getCreateSQL.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable && tableDetailTab === 'ddl' }
  );
  const { data: apiEndpoints } = trpc.database.workbench.module.getApiEndpoints.useQuery(
    { tableName: selectedTable! },
    { enabled: !!selectedTable && tableDetailTab === 'api' }
  );

  const { data: rowData, refetch: refetchData, isLoading: loadingData } = trpc.database.workbench.data.queryRows.useQuery(
    {
      tableName: selectedTable!,
      page: dataPage,
      pageSize: dataPageSize,
      orderBy,
      orderDir,
      filters: dataFilters.length > 0 ? dataFilters : undefined,
    },
    { enabled: !!selectedTable && activeTab === 'data' }
  );

  // ============ tRPC Mutations ============
  const testConnMutation = trpc.database.workbench.connection.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) toast.success(`连接成功，延迟 ${data.latency}ms`);
      else toast.error(`连接失败: ${data.error}`);
    },
  });

  const executeSqlMutation = trpc.database.workbench.sql.execute.useMutation({
    onSuccess: (data) => {
      if (data.type === 'error') toast.error(data.error || 'SQL 执行失败');
      else if (data.type === 'mutation') toast.success(`执行成功，影响 ${data.affectedRows} 行 (${data.executionTime}ms)`);
      else toast.success(`查询完成，返回 ${data.rows?.length || 0} 行 (${data.executionTime}ms)`);
    },
  });

  const createTableMutation = trpc.database.workbench.table.create.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('表创建成功');
        refetchTables();
        setActiveTab('tables');
        setNewTableName('');
        setNewTableComment('');
        setNewColumns([
          { name: 'id', type: 'INT', nullable: false, defaultValue: '', autoIncrement: true, primaryKey: true, unique: false, comment: '主键' },
          { name: 'created_at', type: 'TIMESTAMP', nullable: false, defaultValue: 'CURRENT_TIMESTAMP', autoIncrement: false, primaryKey: false, unique: false, comment: '创建时间' },
        ]);
      } else toast.error(data.error || '创建失败');
    },
  });

  const dropTableMutation = trpc.database.workbench.table.drop.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('表已删除');
        refetchTables();
        setSelectedTable(null);
      } else toast.error(data.error || '删除失败');
    },
  });

  const truncateTableMutation = trpc.database.workbench.table.truncate.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('表数据已清空');
        refetchData();
      } else toast.error(data.error || '清空失败');
    },
  });

  const insertRowMutation = trpc.database.workbench.data.insertRow.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('记录已插入');
        refetchData();
        setInsertMode(false);
        setNewRowData({});
      } else toast.error(data.error || '插入失败');
    },
  });

  const updateRowMutation = trpc.database.workbench.data.updateRow.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('记录已更新');
        refetchData();
        setEditingRow(null);
      } else toast.error(data.error || '更新失败');
    },
  });

  const deleteRowMutation = trpc.database.workbench.data.deleteRow.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('记录已删除');
        refetchData();
      } else toast.error(data.error || '删除失败');
    },
  });

  // ============ 事件处理 ============
  const handleExecuteSQL = useCallback(() => {
    if (!sqlQuery.trim()) return;
    setSqlHistory(prev => [sqlQuery, ...prev.slice(0, 19)]);
    executeSqlMutation.mutate({ query: sqlQuery.trim() });
  }, [sqlQuery]);

  const handleCreateTable = useCallback(() => {
    if (!newTableName.trim()) { toast.error('请输入表名'); return; }
    if (newColumns.length === 0) { toast.error('至少需要一个字段'); return; }
    createTableMutation.mutate({
      tableName: newTableName.trim(),
      columns: newColumns,
      comment: newTableComment || undefined,
    });
  }, [newTableName, newTableComment, newColumns]);

  const handleSelectTable = useCallback((name: string) => {
    setSelectedTable(name);
    setDataPage(1);
    setDataFilters([]);
    setOrderBy(undefined);
    setEditingRow(null);
    setInsertMode(false);
  }, []);

  const handleSort = useCallback((col: string) => {
    if (orderBy === col) {
      setOrderDir(prev => prev === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(col);
      setOrderDir('ASC');
    }
    setDataPage(1);
  }, [orderBy]);

  const getPrimaryKeyColumn = useMemo(() => {
    return columns?.find(c => c.key === 'PRI')?.name || columns?.[0]?.name || 'id';
  }, [columns]);

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    if (!tableSearch) return tables;
    const q = tableSearch.toLowerCase();
    return tables.filter(t => t.name.toLowerCase().includes(q) || (t.linkedModule || '').includes(q));
  }, [tables, tableSearch]);

  // ============ 渲染 ============
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: '连接总览', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'tables', label: '表管理', icon: <Table2 className="w-3.5 h-3.5" /> },
    { id: 'data', label: '数据浏览', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: 'sql', label: 'SQL 工作台', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'create', label: '创建表', icon: <Plus className="w-3.5 h-3.5" /> },
    { id: 'schema', label: 'Schema 设计', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'erd', label: 'ER 关系图', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'designer', label: '可视化设计器', icon: <Palette className="w-3.5 h-3.5" /> },
  ];

  return (
    <MainLayout title="数据库工作台">
      <div className="p-4 space-y-3">
        {/* 顶部标签栏 */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs">
            {connStatus?.connected ? (
              <><Wifi className="w-3 h-3 text-green-500" /><span className="text-green-600">已连接</span></>
            ) : (
              <><WifiOff className="w-3 h-3 text-red-500" /><span className="text-red-600">未连接</span></>
            )}
            <span className="text-muted-foreground">{connStatus?.database || '-'}</span>
          </div>
        </div>

        {/* ====== 连接总览 ====== */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">数据库连接状态</h3>
              <Button size="sm" variant="outline" onClick={() => { refetchConn(); refetchModules(); }} className="text-xs h-7">
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingConn ? 'animate-spin' : ''}`} />刷新
              </Button>
              <Button size="sm" variant="outline" onClick={() => testConnMutation.mutate()} className="text-xs h-7" disabled={testConnMutation.isPending}>
                <Zap className="w-3 h-3 mr-1" />测试连接
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard value={connStatus?.connected ? '在线' : '离线'} label="连接状态" icon={connStatus?.connected ? '✅' : '❌'} />
              <StatCard value={connStatus?.totalTables ?? 0} label="数据表" icon="📊" />
              <StatCard value={connStatus?.dataSize ?? '0 B'} label="数据大小" icon="💾" />
              <StatCard value={connStatus?.indexSize ?? '0 B'} label="索引大小" icon="📇" />
            </div>

            <PageCard title="连接详情" icon={<Server className="w-3.5 h-3.5" />}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                {[
                  ['主机', connStatus?.host],
                  ['端口', connStatus?.port],
                  ['数据库', connStatus?.database],
                  ['版本', connStatus?.version],
                  ['字符集', connStatus?.charset],
                  ['运行时间', connStatus?.uptime ? `${Math.floor(connStatus.uptime / 3600)}h ${Math.floor((connStatus.uptime % 3600) / 60)}m` : '-'],
                  ['最大连接数', connStatus?.maxConnections],
                  ['当前连接数', connStatus?.currentConnections],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between p-2 rounded bg-secondary/50">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-foreground">{String(value ?? '-')}</span>
                  </div>
                ))}
              </div>
            </PageCard>

            {/* 模块关联统计 */}
            <PageCard title="模块数据分布" icon={<Layers className="w-3.5 h-3.5" />}>
              <div className="space-y-2">
                {moduleStats?.map(mod => (
                  <div key={mod.module} className="flex items-center gap-3 p-2 rounded bg-secondary/30 text-xs">
                    <span className="font-medium w-24 text-foreground">{mod.module}</span>
                    <div className="flex-1 bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${Math.min(100, (mod.tables / (connStatus?.totalTables || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground w-16 text-right">{mod.tables} 表</span>
                    <span className="text-muted-foreground w-20 text-right">{mod.totalRows} 行</span>
                    <span className="font-mono text-muted-foreground w-20 text-right">{formatBytes(mod.dataSize)}</span>
                  </div>
                ))}
              </div>
            </PageCard>
          </div>
        )}

        {/* ====== 表管理 ====== */}
        {activeTab === 'tables' && (
          <div className="flex gap-3 h-[calc(100vh-180px)]">
            {/* 左侧表列表 */}
            <div className="w-64 flex-shrink-0 flex flex-col border rounded-lg overflow-hidden">
              <div className="p-2 border-b bg-secondary/30">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="搜索表名或模块..."
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-background border border-input focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredTables.map(table => (
                  <button
                    key={table.name}
                    onClick={() => handleSelectTable(table.name)}
                    className={`w-full text-left px-3 py-2 text-xs border-b border-border/50 hover:bg-secondary/50 transition-colors ${
                      selectedTable === table.name ? 'bg-primary/10 border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Table2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="font-mono text-foreground truncate">{table.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 pl-4.5">
                      <span className="text-[10px] text-muted-foreground">{table.rows} 行</span>
                      {table.linkedModule && (
                        <Badge variant="default" className="text-[9px] px-1 py-0">{table.linkedModule}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-2 border-t bg-secondary/30 text-[10px] text-muted-foreground text-center">
                共 {filteredTables.length} 张表
              </div>
            </div>

            {/* 右侧表详情 */}
            <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
              {selectedTable ? (
                <>
                  <div className="p-2 border-b bg-secondary/30 flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono text-sm font-medium">{selectedTable}</span>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" className="text-xs h-6" onClick={() => { setActiveTab('data'); }}>
                      <Eye className="w-3 h-3 mr-1" />浏览数据
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-6 text-orange-600" onClick={() => {
                      if (confirm(`确定清空表 ${selectedTable} 的所有数据？`)) truncateTableMutation.mutate({ tableName: selectedTable });
                    }}>
                      <Trash2 className="w-3 h-3 mr-1" />清空
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-6 text-red-600" onClick={() => {
                      if (confirm(`确定删除表 ${selectedTable}？此操作不可恢复！`)) dropTableMutation.mutate({ tableName: selectedTable });
                    }}>
                      <Trash2 className="w-3 h-3 mr-1" />删除表
                    </Button>
                  </div>

                  {/* 子标签 */}
                  <div className="flex border-b">
                    {([
                      { id: 'columns' as const, label: '字段' },
                      { id: 'indexes' as const, label: '索引' },
                      { id: 'foreignKeys' as const, label: '外键' },
                      { id: 'ddl' as const, label: 'DDL' },
                      { id: 'api' as const, label: 'API' },
                    ]).map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTableDetailTab(t.id)}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                          tableDetailTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 overflow-auto p-3">
                    {tableDetailTab === 'columns' && columns && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-1.5 pr-3">#</th>
                            <th className="pb-1.5 pr-3">字段名</th>
                            <th className="pb-1.5 pr-3">类型</th>
                            <th className="pb-1.5 pr-3">可空</th>
                            <th className="pb-1.5 pr-3">默认值</th>
                            <th className="pb-1.5 pr-3">键</th>
                            <th className="pb-1.5 pr-3">额外</th>
                            <th className="pb-1.5">备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {columns.map((col, i) => (
                            <tr key={col.name} className="border-b border-border/30 hover:bg-secondary/30">
                              <td className="py-1.5 pr-3 text-muted-foreground">{i + 1}</td>
                              <td className="py-1.5 pr-3 font-mono font-medium">{col.name}</td>
                              <td className="py-1.5 pr-3 font-mono text-blue-600">{col.type}</td>
                              <td className="py-1.5 pr-3">{col.nullable ? <span className="text-yellow-600">YES</span> : <span className="text-green-600">NO</span>}</td>
                              <td className="py-1.5 pr-3 font-mono text-muted-foreground">{col.defaultValue ?? '-'}</td>
                              <td className="py-1.5 pr-3">
                                {col.key === 'PRI' && <Badge variant="success" className="text-[9px]">PK</Badge>}
                                {col.key === 'UNI' && <Badge variant="warning" className="text-[9px]">UNI</Badge>}
                                {col.key === 'MUL' && <Badge variant="default" className="text-[9px]">IDX</Badge>}
                              </td>
                              <td className="py-1.5 pr-3 text-muted-foreground">{col.extra || '-'}</td>
                              <td className="py-1.5 text-muted-foreground">{col.comment || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {tableDetailTab === 'indexes' && indexes && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="pb-1.5 pr-3">索引名</th>
                            <th className="pb-1.5 pr-3">字段</th>
                            <th className="pb-1.5 pr-3">唯一</th>
                            <th className="pb-1.5">类型</th>
                          </tr>
                        </thead>
                        <tbody>
                          {indexes.map(idx => (
                            <tr key={idx.name} className="border-b border-border/30">
                              <td className="py-1.5 pr-3 font-mono">{idx.name}</td>
                              <td className="py-1.5 pr-3 font-mono text-blue-600">{idx.columns.join(', ')}</td>
                              <td className="py-1.5 pr-3">{idx.unique ? <Check className="w-3 h-3 text-green-500" /> : <X className="w-3 h-3 text-muted-foreground" />}</td>
                              <td className="py-1.5">{idx.type}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {tableDetailTab === 'foreignKeys' && foreignKeys && (
                      foreignKeys.length > 0 ? (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
                              <th className="pb-1.5 pr-3">约束名</th>
                              <th className="pb-1.5 pr-3">字段</th>
                              <th className="pb-1.5 pr-3">引用表</th>
                              <th className="pb-1.5">引用字段</th>
                            </tr>
                          </thead>
                          <tbody>
                            {foreignKeys.map(fk => (
                              <tr key={fk.name} className="border-b border-border/30">
                                <td className="py-1.5 pr-3 font-mono">{fk.name}</td>
                                <td className="py-1.5 pr-3 font-mono text-blue-600">{fk.column}</td>
                                <td className="py-1.5 pr-3 font-mono">{fk.referencedTable}</td>
                                <td className="py-1.5 font-mono text-blue-600">{fk.referencedColumn}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center text-muted-foreground py-8 text-xs">此表没有外键约束</div>
                      )
                    )}

                    {tableDetailTab === 'ddl' && (
                      <div className="relative">
                        <Button size="sm" variant="outline" className="absolute top-2 right-2 text-xs h-6" onClick={() => {
                          navigator.clipboard.writeText(createSQL || '');
                          toast.success('DDL 已复制');
                        }}>
                          <Copy className="w-3 h-3 mr-1" />复制
                        </Button>
                        <pre className="bg-secondary/50 rounded p-3 text-xs font-mono overflow-auto whitespace-pre-wrap">{createSQL || '加载中...'}</pre>
                      </div>
                    )}

                    {tableDetailTab === 'api' && apiEndpoints && (
                      <div className="space-y-4">
                        {/* REST API 端点 */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <Link2 className="w-3 h-3" /> REST API 端点
                            </h4>
                            <a href={apiEndpoints.openapi} target="_blank" rel="noopener" className="text-[10px] text-primary hover:underline">
                              OpenAPI 文档 →
                            </a>
                          </div>
                          <div className="space-y-1">
                            {apiEndpoints.rest.map((ep: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-secondary/30 text-xs group">
                                <Badge variant={ep.method === 'GET' ? 'success' : ep.method === 'POST' ? 'info' : ep.method === 'PUT' ? 'warning' : 'danger'} className="text-[9px] font-mono w-14 text-center shrink-0">{ep.method}</Badge>
                                <code className="font-mono text-foreground flex-1 truncate">{ep.path}</code>
                                <span className="text-muted-foreground text-[10px] shrink-0">{ep.description}</span>
                                <button onClick={() => { navigator.clipboard.writeText(ep.path); }} className="opacity-0 group-hover:opacity-100 transition-opacity" title="复制">
                                  <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* tRPC 端点 */}
                        <div>
                          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                            <Zap className="w-3 h-3" /> tRPC 端点
                          </h4>
                          <div className="space-y-1">
                            {apiEndpoints.trpc.map((ep: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-secondary/20 text-xs group">
                                <Badge variant={ep.method === 'GET' ? 'success' : 'warning'} className="text-[9px] font-mono w-14 text-center shrink-0">{ep.method}</Badge>
                                <code className="font-mono text-foreground/70 flex-1 truncate text-[10px]">{ep.path}</code>
                                <button onClick={() => { navigator.clipboard.writeText(ep.path); }} className="opacity-0 group-hover:opacity-100 transition-opacity" title="复制">
                                  <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 代码示例 */}
                        <div>
                          <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                            <Code2 className="w-3 h-3" /> 调用示例
                          </h4>
                          {(['typescript', 'python', 'curl'] as const).map(lang => (
                            <details key={lang} className="mb-1">
                              <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground py-1">
                                {lang === 'typescript' ? 'TypeScript / JavaScript' : lang === 'python' ? 'Python' : 'cURL'}
                              </summary>
                              <pre className="bg-secondary/40 rounded p-2 text-[10px] font-mono overflow-auto whitespace-pre-wrap mt-1 max-h-48">
                                {apiEndpoints.codeExamples[lang]}
                              </pre>
                            </details>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
                  <div className="text-center">
                    <Table2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>从左侧选择一张表查看详情</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====== 数据浏览 ====== */}
        {activeTab === 'data' && (
          <div className="space-y-2">
            {/* 表选择器和操作栏 */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedTable || ''}
                onChange={e => handleSelectTable(e.target.value)}
                className="text-xs px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">选择表...</option>
                {tables?.map(t => <option key={t.name} value={t.name}>{t.name} ({t.rows}行)</option>)}
              </select>
              {selectedTable && (
                <>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => refetchData()} disabled={loadingData}>
                    <RefreshCw className={`w-3 h-3 mr-1 ${loadingData ? 'animate-spin' : ''}`} />刷新
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setInsertMode(true); setNewRowData({}); }}>
                    <Plus className="w-3 h-3 mr-1" />插入行
                  </Button>
                  <div className="flex-1" />
                  <span className="text-[10px] text-muted-foreground">
                    共 {rowData?.total ?? 0} 行 · 第 {dataPage} 页
                  </span>
                  <Button size="sm" variant="outline" className="text-xs h-6" disabled={dataPage <= 1} onClick={() => setDataPage(p => p - 1)}>上一页</Button>
                  <Button size="sm" variant="outline" className="text-xs h-6" disabled={!rowData || dataPage * dataPageSize >= rowData.total} onClick={() => setDataPage(p => p + 1)}>下一页</Button>
                </>
              )}
            </div>

            {/* 插入行表单 */}
            {insertMode && selectedTable && columns && (
              <PageCard title="插入新记录" icon={<Plus className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {columns.filter(c => !c.extra.includes('auto_increment')).map(col => (
                    <div key={col.name}>
                      <label className="text-[10px] text-muted-foreground">{col.name} <span className="font-mono text-blue-500">({col.type})</span></label>
                      <input
                        type="text"
                        placeholder={col.nullable ? 'NULL' : '必填'}
                        value={newRowData[col.name] || ''}
                        onChange={e => setNewRowData(prev => ({ ...prev, [col.name]: e.target.value }))}
                        className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="text-xs" onClick={() => {
                    const data: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(newRowData)) {
                      if (v !== '') data[k] = v;
                    }
                    insertRowMutation.mutate({ tableName: selectedTable, data });
                  }} disabled={insertRowMutation.isPending}>
                    <Check className="w-3 h-3 mr-1" />插入
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setInsertMode(false)}>
                    <X className="w-3 h-3 mr-1" />取消
                  </Button>
                </div>
              </PageCard>
            )}

            {/* 数据表格 */}
            {selectedTable && rowData && (
              <div className="border rounded-lg overflow-auto max-h-[calc(100vh-280px)]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-muted-foreground border-b w-8">#</th>
                      {rowData.columns.map(col => (
                        <th key={col} className="px-2 py-1.5 text-left border-b cursor-pointer hover:bg-secondary/80" onClick={() => handleSort(col)}>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <span className="font-mono">{col}</span>
                            {orderBy === col && <ArrowUpDown className="w-2.5 h-2.5" />}
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-left text-muted-foreground border-b w-20">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowData.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-secondary/20">
                        <td className="px-2 py-1 text-muted-foreground">{(dataPage - 1) * dataPageSize + i + 1}</td>
                        {rowData.columns.map(col => (
                          <td key={col} className="px-2 py-1 font-mono max-w-[200px] truncate" title={String(row[col] ?? '')}>
                            {row[col] === null ? <span className="text-muted-foreground italic">NULL</span> : String(row[col])}
                          </td>
                        ))}
                        <td className="px-2 py-1">
                          <div className="flex gap-1">
                            <button
                              className="text-blue-500 hover:text-blue-700"
                              title="编辑"
                              onClick={() => setEditingRow(row)}
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              className="text-red-500 hover:text-red-700"
                              title="删除"
                              onClick={() => {
                                if (confirm('确定删除此记录？')) {
                                  deleteRowMutation.mutate({
                                    tableName: selectedTable,
                                    primaryKey: { column: getPrimaryKeyColumn, value: row[getPrimaryKeyColumn] },
                                  });
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 编辑行弹窗 */}
            {editingRow && selectedTable && columns && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingRow(null)}>
                <div className="bg-background rounded-lg p-4 w-[600px] max-h-[80vh] overflow-auto shadow-xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold mb-3">编辑记录</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {columns.map(col => (
                      <div key={col.name}>
                        <label className="text-[10px] text-muted-foreground">{col.name}</label>
                        <input
                          type="text"
                          defaultValue={editingRow[col.name] != null ? String(editingRow[col.name]) : ''}
                          disabled={col.key === 'PRI'}
                          onChange={e => { editingRow[col.name] = e.target.value; }}
                          className="w-full mt-0.5 px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3 justify-end">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingRow(null)}>取消</Button>
                    <Button size="sm" className="text-xs" onClick={() => {
                      const data: Record<string, unknown> = {};
                      for (const col of columns) {
                        if (col.key !== 'PRI') data[col.name] = editingRow[col.name];
                      }
                      updateRowMutation.mutate({
                        tableName: selectedTable,
                        primaryKey: { column: getPrimaryKeyColumn, value: editingRow[getPrimaryKeyColumn] },
                        data,
                      });
                    }}>保存</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====== SQL 工作台 ====== */}
        {activeTab === 'sql' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">SQL 工作台</h3>
              <Badge variant="default" className="text-[9px]">支持 SELECT / INSERT / UPDATE / DELETE / CREATE / ALTER</Badge>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-secondary/30 p-1 flex items-center gap-1 border-b">
                <Button size="sm" className="text-xs h-7 bg-green-600 hover:bg-green-700" onClick={handleExecuteSQL} disabled={executeSqlMutation.isPending}>
                  <Play className="w-3 h-3 mr-1" />{executeSqlMutation.isPending ? '执行中...' : '执行 (Ctrl+Enter)'}
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setSqlQuery('')}>
                  <Trash2 className="w-3 h-3 mr-1" />清空
                </Button>
                <div className="flex-1" />
                {executeSqlMutation.data && (
                  <span className="text-[10px] text-muted-foreground">
                    {executeSqlMutation.data.type === 'select' && `${executeSqlMutation.data.rows?.length} 行`}
                    {executeSqlMutation.data.type === 'mutation' && `${executeSqlMutation.data.affectedRows} 行受影响`}
                    {' · '}{executeSqlMutation.data.executionTime}ms
                  </span>
                )}
              </div>

              <textarea
                value={sqlQuery}
                onChange={e => setSqlQuery(e.target.value)}
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') handleExecuteSQL(); }}
                placeholder="输入 SQL 语句..."
                className="w-full h-32 p-3 text-xs font-mono bg-background resize-none focus:outline-none border-b"
                spellCheck={false}
              />

              {/* 结果区域 */}
              {executeSqlMutation.data && (
                <div className="max-h-[400px] overflow-auto">
                  {executeSqlMutation.data.type === 'error' && (
                    <div className="p-3 text-xs text-red-600 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <pre className="whitespace-pre-wrap">{executeSqlMutation.data.error}</pre>
                    </div>
                  )}
                  {executeSqlMutation.data.type === 'mutation' && (
                    <div className="p-3 text-xs text-green-600 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      <span>执行成功，影响 {executeSqlMutation.data.affectedRows} 行</span>
                    </div>
                  )}
                  {executeSqlMutation.data.type === 'select' && executeSqlMutation.data.rows && (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-secondary">
                        <tr>
                          {executeSqlMutation.data.columns?.map(col => (
                            <th key={col} className="px-2 py-1.5 text-left font-mono text-muted-foreground border-b">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {executeSqlMutation.data.rows.map((row, i) => (
                          <tr key={i} className="border-b border-border/30 hover:bg-secondary/20">
                            {executeSqlMutation.data!.columns?.map(col => (
                              <td key={col} className="px-2 py-1 font-mono max-w-[200px] truncate">
                                {(row as any)[col] === null ? <span className="italic text-muted-foreground">NULL</span> : String((row as any)[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* SQL 历史 */}
            {sqlHistory.length > 0 && (
              <PageCard title="执行历史" icon={<Code2 className="w-3.5 h-3.5" />}>
                <div className="space-y-1">
                  {sqlHistory.map((q, i) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/30 cursor-pointer text-xs" onClick={() => setSqlQuery(q)}>
                      <Terminal className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <code className="font-mono text-foreground truncate flex-1">{q}</code>
                      <span className="text-[10px] text-muted-foreground">点击加载</span>
                    </div>
                  ))}
                </div>
              </PageCard>
            )}
          </div>
        )}

        {/* ====== 创建表 ====== */}
        {activeTab === 'create' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">可视化建表</h3>
              <Badge variant="default" className="text-[9px]">Schema Designer</Badge>
            </div>

            <PageCard title="表基本信息" icon={<Settings className="w-3.5 h-3.5" />}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">表名（英文，下划线分隔）</label>
                  <input
                    type="text"
                    value={newTableName}
                    onChange={e => setNewTableName(e.target.value)}
                    placeholder="例如: device_metrics"
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">表备注</label>
                  <input
                    type="text"
                    value={newTableComment}
                    onChange={e => setNewTableComment(e.target.value)}
                    placeholder="例如: 设备指标数据表"
                    className="w-full mt-0.5 px-2 py-1.5 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </PageCard>

            <PageCard title="字段定义" icon={<Layers className="w-3.5 h-3.5" />}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-1.5 pr-2 w-8">#</th>
                    <th className="pb-1.5 pr-2">字段名</th>
                    <th className="pb-1.5 pr-2">类型</th>
                    <th className="pb-1.5 pr-2 w-12">主键</th>
                    <th className="pb-1.5 pr-2 w-12">自增</th>
                    <th className="pb-1.5 pr-2 w-12">可空</th>
                    <th className="pb-1.5 pr-2 w-12">唯一</th>
                    <th className="pb-1.5 pr-2">默认值</th>
                    <th className="pb-1.5 pr-2">备注</th>
                    <th className="pb-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {newColumns.map((col, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-1 pr-2">
                        <input
                          type="text"
                          value={col.name}
                          onChange={e => {
                            const updated = [...newColumns];
                            updated[i] = { ...col, name: e.target.value };
                            setNewColumns(updated);
                          }}
                          className="w-full px-1.5 py-0.5 text-xs rounded border border-input bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <select
                          value={col.type}
                          onChange={e => {
                            const updated = [...newColumns];
                            updated[i] = { ...col, type: e.target.value };
                            setNewColumns(updated);
                          }}
                          className="w-full px-1 py-0.5 text-xs rounded border border-input bg-background font-mono focus:outline-none"
                        >
                          {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" checked={col.primaryKey} onChange={e => {
                          const updated = [...newColumns];
                          updated[i] = { ...col, primaryKey: e.target.checked };
                          setNewColumns(updated);
                        }} className="w-3 h-3" />
                      </td>
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" checked={col.autoIncrement} onChange={e => {
                          const updated = [...newColumns];
                          updated[i] = { ...col, autoIncrement: e.target.checked };
                          setNewColumns(updated);
                        }} className="w-3 h-3" />
                      </td>
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" checked={col.nullable} onChange={e => {
                          const updated = [...newColumns];
                          updated[i] = { ...col, nullable: e.target.checked };
                          setNewColumns(updated);
                        }} className="w-3 h-3" />
                      </td>
                      <td className="py-1 pr-2 text-center">
                        <input type="checkbox" checked={col.unique} onChange={e => {
                          const updated = [...newColumns];
                          updated[i] = { ...col, unique: e.target.checked };
                          setNewColumns(updated);
                        }} className="w-3 h-3" />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="text"
                          value={col.defaultValue}
                          onChange={e => {
                            const updated = [...newColumns];
                            updated[i] = { ...col, defaultValue: e.target.value };
                            setNewColumns(updated);
                          }}
                          placeholder="NULL"
                          className="w-full px-1.5 py-0.5 text-xs rounded border border-input bg-background font-mono focus:outline-none"
                        />
                      </td>
                      <td className="py-1 pr-2">
                        <input
                          type="text"
                          value={col.comment}
                          onChange={e => {
                            const updated = [...newColumns];
                            updated[i] = { ...col, comment: e.target.value };
                            setNewColumns(updated);
                          }}
                          className="w-full px-1.5 py-0.5 text-xs rounded border border-input bg-background focus:outline-none"
                        />
                      </td>
                      <td className="py-1">
                        <button onClick={() => setNewColumns(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                          <X className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                  setNewColumns(prev => [...prev, {
                    name: '', type: 'VARCHAR(255)', nullable: true, defaultValue: '',
                    autoIncrement: false, primaryKey: false, unique: false, comment: '',
                  }]);
                }}>
                  <Plus className="w-3 h-3 mr-1" />添加字段
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => {
                  setNewColumns(prev => [...prev,
                    { name: 'updated_at', type: 'TIMESTAMP', nullable: true, defaultValue: 'CURRENT_TIMESTAMP', autoIncrement: false, primaryKey: false, unique: false, comment: '更新时间' },
                  ]);
                }}>
                  <Zap className="w-3 h-3 mr-1" />添加 updated_at
                </Button>
              </div>
            </PageCard>

            {/* DDL 预览 */}
            <PageCard title="DDL 预览" icon={<Code2 className="w-3.5 h-3.5" />}>
              <pre className="bg-secondary/50 rounded p-3 text-xs font-mono overflow-auto whitespace-pre-wrap">
                {generateCreateSQL(newTableName, newColumns, newTableComment)}
              </pre>
            </PageCard>

            <div className="flex gap-2">
              <Button className="text-xs" onClick={handleCreateTable} disabled={createTableMutation.isPending || !newTableName.trim()}>
                <Database className="w-3 h-3 mr-1" />{createTableMutation.isPending ? '创建中...' : '创建表'}
              </Button>
              <Button variant="outline" className="text-xs" onClick={() => {
                setNewTableName('');
                setNewTableComment('');
                setNewColumns([
                  { name: 'id', type: 'INT', nullable: false, defaultValue: '', autoIncrement: true, primaryKey: true, unique: false, comment: '主键' },
                  { name: 'created_at', type: 'TIMESTAMP', nullable: false, defaultValue: 'CURRENT_TIMESTAMP', autoIncrement: false, primaryKey: false, unique: false, comment: '创建时间' },
                ]);
              }}>
                <RefreshCw className="w-3 h-3 mr-1" />重置
              </Button>
            </div>
          </div>
        )}

        {/* ====== Schema 设计（V4 Schema Registry） ====== */}
        {activeTab === 'schema' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">V4 Schema Registry</h3>
              <span className="text-xs text-muted-foreground">92 表 · 11 域 · 完整字段定义</span>
              <div className="ml-auto">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDdlDialogOpen(true)}>
                  <Download className="w-3 h-3 mr-1" />导出 DDL
                </Button>
                <Suspense fallback={null}>
                  <ExportDDLDialog open={ddlDialogOpen} onOpenChange={setDdlDialogOpen} />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载 Schema 管理器...</div>}>
              <div className="space-y-3">
                <SchemaTableManagement />
                <div className="border-t border-border pt-3">
                  <SchemaDataBrowser />
                </div>
                <div className="border-t border-border pt-3">
                  <SchemaSqlEditor />
                </div>
                <SchemaStatusBar />
              </div>
            </Suspense>
          </div>
        )}

        {/* ====== ER 关系图 ====== */}
        {activeTab === 'erd' && (
          <div className="h-[calc(100vh-180px)]">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载 ER 图...</div>}>
              <ERDiagram />
            </Suspense>
          </div>
        )}

        {/* ====== 可视化设计器 ====== */}
        {activeTab === 'designer' && (
          <div className="h-[calc(100vh-180px)]">
            <Suspense fallback={<div className="flex items-center justify-center h-64 text-xs text-muted-foreground">加载可视化设计器...</div>}>
              <VisualDesigner />
            </Suspense>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

// ============ 工具函数 ============

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateCreateSQL(tableName: string, columns: ColumnDef[], comment: string): string {
  if (!tableName) return '-- 请输入表名';
  const colDefs: string[] = [];
  const pks: string[] = [];

  for (const col of columns) {
    if (!col.name) continue;
    let def = `  \`${col.name}\` ${col.type}`;
    if (col.autoIncrement) def += ' AUTO_INCREMENT';
    if (!col.nullable) def += ' NOT NULL';
    if (col.defaultValue) {
      if (col.defaultValue.toUpperCase() === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
      else def += ` DEFAULT '${col.defaultValue}'`;
    }
    if (col.unique) def += ' UNIQUE';
    if (col.comment) def += ` COMMENT '${col.comment}'`;
    if (col.primaryKey) pks.push(`\`${col.name}\``);
    colDefs.push(def);
  }

  if (pks.length > 0) colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);

  const commentStr = comment ? ` COMMENT='${comment}'` : '';
  return `CREATE TABLE \`${tableName}\` (\n${colDefs.join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${commentStr};`;
}
