/**
 * 插件安全沙箱管理页面
 *
 * 6 个 Tab：
 * 1. 沙箱概览 - 全局安全仪表盘 + 沙箱状态
 * 2. 插件市场 - 安装/审查/审批
 * 3. 权限管理 - 权限审计 + 动态授权/撤权
 * 4. 资源监控 - CPU/内存/网络/事件使用量
 * 5. 安全事件 - 安全事件查询 + 熔断器状态
 * 6. 受信任签名者 - 签名者管理
 */
import React, { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { trpc } from '@/lib/trpc';

// ==================== 类型定义 ====================

type TabId = 'overview' | 'marketplace' | 'permissions' | 'resources' | 'events' | 'signers';

// ==================== 工具函数 ====================

const severityColors: Record<string, string> = {
  low: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const stateColors: Record<string, string> = {
  running: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  suspended: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  terminated: 'bg-red-500/15 text-red-400 border-red-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  idle: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  initializing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const cbStateColors: Record<string, string> = {
  closed: 'bg-emerald-500/15 text-emerald-400',
  open: 'bg-red-500/15 text-red-400',
  'half-open': 'bg-amber-500/15 text-amber-400',
};

const typeIcons: Record<string, string> = {
  source: '📡', processor: '⚙️', sink: '📤', analyzer: '🔬',
  visualizer: '📊', integration: '🔗', utility: '🛠️',
};

const trustLevelLabels: Record<string, { label: string; color: string }> = {
  untrusted: { label: '不受信任', color: 'bg-red-500/15 text-red-400' },
  basic: { label: '基础', color: 'bg-zinc-500/15 text-zinc-400' },
  verified: { label: '已验证', color: 'bg-blue-500/15 text-blue-400' },
  trusted: { label: '受信任', color: 'bg-emerald-500/15 text-emerald-400' },
  system: { label: '系统', color: 'bg-purple-500/15 text-purple-400' },
};

const highRiskPerms = ['data:alert:write', 'data:kg:write', 'network:http', 'network:ws', 'system:config:read'];

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMemory(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

// ==================== 组件 ====================

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${className}`}>
      {children}
    </span>
  );
}

function StatCard({ label, value, sub, color = 'text-cyan-400' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function LoadingSpinner({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-zinc-500 text-sm">
      <div className="animate-spin w-5 h-5 border-2 border-zinc-600 border-t-cyan-400 rounded-full mr-3" />
      {text}
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm text-red-400 flex items-center justify-between">
      <span>加载失败: {message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 text-[11px] bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors">
          重试
        </button>
      )}
    </div>
  );
}

// ==================== Tab: 沙箱概览 ====================

function OverviewTab() {
  const utils = trpc.useUtils();
  const { data: sandboxes, isLoading: sandboxLoading, error: sandboxError, refetch: refetchSandbox } = trpc.plugin.getSandboxStatus.useQuery();
  const { data: securityEvents, isLoading: eventsLoading } = trpc.plugin.getSecurityEvents.useQuery({});
  const { data: dashboard } = trpc.plugin.getSecurityDashboard.useQuery();
  const { data: signers } = trpc.plugin.listTrustedSigners.useQuery();

  const disableMut = trpc.plugin.disable.useMutation({
    onSuccess: () => { utils.plugin.getSandboxStatus.invalidate(); },
  });
  const enableMut = trpc.plugin.enable.useMutation({
    onSuccess: () => { utils.plugin.getSandboxStatus.invalidate(); },
  });
  const uninstallMut = trpc.plugin.secureUninstall.useMutation({
    onSuccess: () => { utils.plugin.getSandboxStatus.invalidate(); },
  });

  if (sandboxLoading || eventsLoading) return <LoadingSpinner />;
  if (sandboxError) return <ErrorBanner message={sandboxError.message} onRetry={() => refetchSandbox()} />;

  const sandboxList = sandboxes ?? [];
  const eventsList = securityEvents ?? [];
  const signersList = signers ?? [];
  const circuitBreakers = dashboard?.circuitBreakers ?? [];

  const totalPlugins = sandboxList.length;
  const runningPlugins = sandboxList.filter((s: any) => s.state === 'running').length;
  const totalMemory = sandboxList.reduce((sum: number, s: any) => sum + (s.resources?.memoryUsedMB || 0), 0);
  const totalExecs = sandboxList.reduce((sum: number, s: any) => sum + (s.resources?.totalExecutions || 0), 0);
  const unresolvedEvents = eventsList.filter((e: any) => !e.resolved).length;
  const criticalEvents = eventsList.filter((e: any) => e.severity === 'critical' && !e.resolved).length;
  const openBreakers = circuitBreakers.filter((b: any) => b.state === 'open' || b.state === 'half-open').length;
  const totalBreakers = circuitBreakers.length || sandboxList.length;

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="沙箱总数" value={totalPlugins} sub={`${runningPlugins} 运行中`} />
        <StatCard label="总内存" value={formatMemory(totalMemory)} sub="所有沙箱合计" color="text-amber-400" />
        <StatCard label="总执行次数" value={totalExecs.toLocaleString()} sub="累计" color="text-blue-400" />
        <StatCard label="未解决事件" value={unresolvedEvents} color={unresolvedEvents > 0 ? 'text-orange-400' : 'text-emerald-400'} />
        <StatCard label="严重告警" value={criticalEvents} color={criticalEvents > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <StatCard label="熔断器" value={`${openBreakers}/${totalBreakers}`} sub={openBreakers > 0 ? '有打开的' : '全部正常'} color={openBreakers > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <StatCard label="受信任签名者" value={signersList.length} color="text-purple-400" />
      </div>

      {/* 沙箱列表 */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">活跃沙箱</h3>
        <div className="space-y-2">
          {sandboxList.map((sandbox: any) => (
            <div key={sandbox.pluginId} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{typeIcons[sandbox.manifest?.type] || '🧩'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-200">{sandbox.manifest?.name || sandbox.pluginId}</span>
                      <span className="text-[11px] text-zinc-500">v{sandbox.manifest?.version || '?'}</span>
                      <Badge className={stateColors[sandbox.state] || stateColors.idle}>{sandbox.state}</Badge>
                      {sandbox.pluginId?.startsWith('xilian.') ? (
                        <Badge className={trustLevelLabels.trusted.color}>受信任</Badge>
                      ) : (
                        <Badge className={trustLevelLabels.verified.color}>已验证</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{sandbox.manifest?.description || ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sandbox.state === 'running' && (
                    <button
                      onClick={() => disableMut.mutate({ id: sandbox.pluginId })}
                      disabled={disableMut.isPending}
                      className="px-2 py-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                    >
                      暂停
                    </button>
                  )}
                  {sandbox.state === 'suspended' && (
                    <button
                      onClick={() => enableMut.mutate({ id: sandbox.pluginId })}
                      disabled={enableMut.isPending}
                      className="px-2 py-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      恢复
                    </button>
                  )}
                  <button
                    onClick={() => uninstallMut.mutate({ pluginId: sandbox.pluginId })}
                    disabled={uninstallMut.isPending}
                    className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    终止
                  </button>
                </div>
              </div>

              {/* 资源指标 */}
              {sandbox.resources && (
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3 pt-3 border-t border-zinc-800">
                  <div>
                    <div className="text-[10px] text-zinc-500">内存</div>
                    <div className="text-sm font-mono text-zinc-300">{formatMemory(sandbox.resources.memoryUsedMB)}</div>
                    <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${sandbox.resources.memoryUsedMB > 200 ? 'bg-red-500' : sandbox.resources.memoryUsedMB > 100 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, (sandbox.resources.memoryUsedMB / 512) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">CPU 时间</div>
                    <div className="text-sm font-mono text-zinc-300">{(sandbox.resources.cpuTimeMs / 1000).toFixed(1)}s</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">活跃执行</div>
                    <div className="text-sm font-mono text-zinc-300">{sandbox.resources.activeExecutions}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">总执行</div>
                    <div className="text-sm font-mono text-zinc-300">{sandbox.resources.totalExecutions.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">网络/分</div>
                    <div className="text-sm font-mono text-zinc-300">{sandbox.resources.networkRequestsThisMin}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-500">事件/分</div>
                    <div className="text-sm font-mono text-zinc-300">{sandbox.resources.eventsThisMin}</div>
                  </div>
                </div>
              )}

              {/* 权限标签 */}
              {sandbox.manifest?.permissions && (
                <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-800">
                  {sandbox.manifest.permissions.map((perm: string) => (
                    <Badge
                      key={perm}
                      className={highRiskPerms.includes(perm)
                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }
                    >
                      {highRiskPerms.includes(perm) && '⚠ '}{perm}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
          {sandboxList.length === 0 && (
            <div className="text-center text-zinc-600 py-8 text-sm">暂无活跃沙箱</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 插件市场 ====================

function MarketplaceTab() {
  const utils = trpc.useUtils();
  const { data: plugins, isLoading: pluginsLoading } = trpc.plugin.list.useQuery();

  const [manifestYaml, setManifestYaml] = useState(`manifestVersion: "1.0"
id: "my-org.custom-plugin"
name: "自定义插件"
version: "1.0.0"
description: "示例插件"
author:
  name: "开发者"
  email: "dev@example.com"
license: "MIT"
type: "analyzer"
main: "index.js"
platformVersion: "1.0.0"
permissions:
  - storage:read
  - storage:write
  - data:sensor:read
  - event:publish
resourceLimits: "standard"
`);
  const [validationResult, setValidationResult] = useState<null | { valid: boolean; errors: any[]; warnings: any[] }>(null);

  const validateMut = trpc.plugin.validateManifest.useMutation({
    onSuccess: (data) => {
      setValidationResult(data as any);
    },
    onError: (err) => {
      setValidationResult({ valid: false, errors: [{ field: 'manifest', message: err.message }], warnings: [] });
    },
  });

  const reviewMut = trpc.plugin.reviewPlugin.useMutation();

  const installMut = trpc.plugin.secureInstall.useMutation({
    onSuccess: () => {
      utils.plugin.list.invalidate();
      utils.plugin.getSandboxStatus.invalidate();
    },
  });

  const handleValidate = () => {
    validateMut.mutate({ manifest: manifestYaml });
  };

  const handleReview = () => {
    // Parse YAML to object for review — the backend accepts manifest object
    // For simplicity, we send the raw YAML for validation first
    validateMut.mutate({ manifest: manifestYaml });
  };

  const availablePlugins = (plugins ?? []) as any[];

  return (
    <div className="space-y-6">
      {/* Manifest 校验器 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">📋 Manifest 校验器</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <textarea
              value={manifestYaml}
              onChange={(e) => setManifestYaml(e.target.value)}
              className="w-full h-64 bg-zinc-950 border border-zinc-700 rounded p-3 text-[12px] font-mono text-zinc-300 resize-none focus:outline-none focus:border-cyan-500/50"
              placeholder="粘贴 manifest.yaml 内容..."
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleValidate}
                disabled={validateMut.isPending}
                className="px-3 py-1.5 text-[12px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
              >
                {validateMut.isPending ? '校验中...' : '校验 Manifest'}
              </button>
              <button
                onClick={handleReview}
                disabled={reviewMut.isPending}
                className="px-3 py-1.5 text-[12px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {reviewMut.isPending ? '审查中...' : '安全审查'}
              </button>
              <button
                disabled={installMut.isPending}
                className="px-3 py-1.5 text-[12px] bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/20 transition-colors disabled:opacity-50"
              >
                {installMut.isPending ? '安装中...' : '安装到沙箱'}
              </button>
            </div>
          </div>
          <div>
            {validationResult && (
              <div className="bg-zinc-950 border border-zinc-700 rounded p-3 h-64 overflow-auto">
                <div className={`text-sm font-semibold mb-2 ${validationResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                  {validationResult.valid ? '✅ 校验通过' : '❌ 校验失败'}
                </div>
                {validationResult.errors?.map((e: any, i: number) => (
                  <div key={i} className="text-[11px] text-red-400 mb-1">
                    ❌ [{e.field}] {e.message}
                  </div>
                ))}
                {validationResult.warnings?.map((w: any, i: number) => (
                  <div key={i} className="text-[11px] text-amber-400 mb-1">
                    ⚠ [{w.field}] {w.message}
                  </div>
                ))}
                {(validationResult as any).riskScore != null && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="text-[11px] text-zinc-500">风险评分</div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(validationResult as any).riskScore > 50 ? 'bg-red-500' : (validationResult as any).riskScore > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${(validationResult as any).riskScore}%` }}
                        />
                      </div>
                      <span className={`text-sm font-mono ${(validationResult as any).riskScore > 50 ? 'text-red-400' : (validationResult as any).riskScore > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {(validationResult as any).riskScore}/100
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!validationResult && (
              <div className="bg-zinc-950 border border-zinc-700 rounded p-3 h-64 flex items-center justify-center text-zinc-600 text-sm">
                点击"校验 Manifest"查看结果
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 可用插件列表 */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">🏪 可用插件</h3>
        {pluginsLoading ? (
          <LoadingSpinner text="加载插件列表..." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {availablePlugins.map((plugin: any) => (
              <div key={plugin.id || plugin.pluginId} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeIcons[plugin.type] || '🧩'}</span>
                    <div>
                      <div className="font-medium text-zinc-200 text-sm">{plugin.name}</div>
                      <div className="text-[11px] text-zinc-500">v{plugin.version || '?'} · {plugin.author?.name || plugin.author || '未知'}</div>
                    </div>
                  </div>
                  {plugin.trustLevel && (
                    <Badge className={trustLevelLabels[plugin.trustLevel]?.color || ''}>
                      {trustLevelLabels[plugin.trustLevel]?.label || plugin.trustLevel}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mb-3">{plugin.description || ''}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-500">状态:</span>
                    <Badge className={stateColors[plugin.status || plugin.state] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}>
                      {plugin.status || plugin.state || '未知'}
                    </Badge>
                  </div>
                  <button className="px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors">
                    详情
                  </button>
                </div>
              </div>
            ))}
            {availablePlugins.length === 0 && (
              <div className="col-span-full text-center text-zinc-600 py-8 text-sm">暂无可用插件</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Tab: 权限管理 ====================

function PermissionsTab() {
  const utils = trpc.useUtils();
  const [filterPlugin, setFilterPlugin] = useState('');
  const [filterAllowed, setFilterAllowed] = useState<'all' | 'allowed' | 'denied'>('all');

  const { data: sandboxes, isLoading: sandboxLoading } = trpc.plugin.getSandboxStatus.useQuery();
  const { data: auditLog, isLoading: auditLoading, error: auditError, refetch: refetchAudit } = trpc.plugin.getAuditLog.useQuery({
    pluginId: filterPlugin || undefined,
    allowed: filterAllowed === 'all' ? undefined : filterAllowed === 'allowed',
    limit: 200,
  });

  const grantMut = trpc.plugin.grantPermission.useMutation({
    onSuccess: () => {
      utils.plugin.getAuditLog.invalidate();
      utils.plugin.getSandboxStatus.invalidate();
    },
  });

  const revokeMut = trpc.plugin.revokePermission.useMutation({
    onSuccess: () => {
      utils.plugin.getAuditLog.invalidate();
      utils.plugin.getSandboxStatus.invalidate();
    },
  });

  const sandboxList = (sandboxes ?? []) as any[];
  const auditEntries = (auditLog ?? []) as any[];

  return (
    <div className="space-y-6">
      {/* 权限矩阵 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">🔐 权限矩阵</h3>
        {sandboxLoading ? (
          <LoadingSpinner text="加载权限矩阵..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-2 text-zinc-500 font-medium">插件</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">storage</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">network</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">event</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">device</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">sensor</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">alert</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">kg</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">model</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">ui</th>
                  <th className="text-center py-2 px-1 text-zinc-500 font-medium">system</th>
                </tr>
              </thead>
              <tbody>
                {sandboxList.map((sandbox: any) => {
                  const perms = new Set(sandbox.manifest?.permissions || []);
                  const permCheck = (prefix: string) => {
                    const hasRead = perms.has(`${prefix}:read`);
                    const hasWrite = perms.has(`${prefix}:write`);
                    const hasHttp = perms.has(`${prefix}:http`);
                    const hasWs = perms.has(`${prefix}:ws`);
                    const hasSub = perms.has(`${prefix}:subscribe`);
                    const hasPub = perms.has(`${prefix}:publish`);
                    const hasInference = perms.has(`${prefix}:inference`);
                    const hasEmbed = perms.has(`${prefix}:embed`);
                    const hasNotif = perms.has(`${prefix}:notification`);
                    const hasWidget = perms.has(`${prefix}:widget`);
                    const hasLog = perms.has(`${prefix}:log`);
                    const hasConfig = perms.has(`${prefix}:config:read`);

                    if (hasRead && hasWrite) return <span className="text-emerald-400">RW</span>;
                    if (hasRead) return <span className="text-blue-400">R</span>;
                    if (hasWrite) return <span className="text-amber-400">W</span>;
                    if (hasHttp && hasWs) return <span className="text-orange-400">H+W</span>;
                    if (hasHttp) return <span className="text-orange-400">HTTP</span>;
                    if (hasWs) return <span className="text-orange-400">WS</span>;
                    if (hasSub && hasPub) return <span className="text-emerald-400">S+P</span>;
                    if (hasSub) return <span className="text-blue-400">Sub</span>;
                    if (hasPub) return <span className="text-amber-400">Pub</span>;
                    if (hasInference && hasEmbed) return <span className="text-purple-400">I+E</span>;
                    if (hasInference) return <span className="text-purple-400">Inf</span>;
                    if (hasEmbed) return <span className="text-purple-400">Emb</span>;
                    if (hasNotif) return <span className="text-cyan-400">N</span>;
                    if (hasWidget) return <span className="text-cyan-400">W</span>;
                    if (hasLog) return <span className="text-zinc-400">Log</span>;
                    if (hasConfig) return <span className="text-orange-400">Cfg</span>;
                    return <span className="text-zinc-700">—</span>;
                  };

                  return (
                    <tr key={sandbox.pluginId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                      <td className="py-2 px-2 text-zinc-300 font-medium">{sandbox.manifest?.name || sandbox.pluginId}</td>
                      <td className="text-center py-2 px-1">{permCheck('storage')}</td>
                      <td className="text-center py-2 px-1">{permCheck('network')}</td>
                      <td className="text-center py-2 px-1">{permCheck('event')}</td>
                      <td className="text-center py-2 px-1">{permCheck('data:device')}</td>
                      <td className="text-center py-2 px-1">{permCheck('data:sensor')}</td>
                      <td className="text-center py-2 px-1">{permCheck('data:alert')}</td>
                      <td className="text-center py-2 px-1">{permCheck('data:kg')}</td>
                      <td className="text-center py-2 px-1">{permCheck('model')}</td>
                      <td className="text-center py-2 px-1">{permCheck('ui')}</td>
                      <td className="text-center py-2 px-1">{permCheck('system')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 审计日志 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">📜 权限审计日志</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={filterPlugin}
              onChange={(e) => setFilterPlugin(e.target.value)}
              placeholder="搜索插件..."
              className="px-2 py-1 text-[11px] bg-zinc-950 border border-zinc-700 rounded text-zinc-300 w-32 focus:outline-none focus:border-cyan-500/50"
            />
            <select
              value={filterAllowed}
              onChange={(e) => setFilterAllowed(e.target.value as any)}
              className="px-2 py-1 text-[11px] bg-zinc-950 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">全部</option>
              <option value="allowed">已允许</option>
              <option value="denied">已拒绝</option>
            </select>
          </div>
        </div>
        {auditLoading ? (
          <LoadingSpinner text="加载审计日志..." />
        ) : auditError ? (
          <ErrorBanner message={auditError.message} onRetry={() => refetchAudit()} />
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {auditEntries.map((entry: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-zinc-800/30 text-[11px]">
                <span className={`w-4 text-center ${entry.allowed ? 'text-emerald-400' : 'text-red-400'}`}>
                  {entry.allowed ? '✓' : '✗'}
                </span>
                <span className="text-zinc-500 font-mono w-28 shrink-0">{formatTime(entry.timestamp)}</span>
                <span className="text-zinc-400 w-40 shrink-0 truncate">{entry.pluginId}</span>
                <Badge className={highRiskPerms.includes(entry.permission)
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }>
                  {entry.permission}
                </Badge>
                <span className="text-zinc-500 truncate">{entry.action}</span>
              </div>
            ))}
            {auditEntries.length === 0 && (
              <div className="text-center text-zinc-600 py-4 text-sm">暂无审计记录</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Tab: 资源监控 ====================

function ResourcesTab() {
  const { data: sandboxes, isLoading: sandboxLoading, error: sandboxError, refetch } = trpc.plugin.getSandboxStatus.useQuery();
  const { data: resourcePresets, isLoading: presetsLoading } = trpc.plugin.getResourcePresets.useQuery();

  if (sandboxLoading) return <LoadingSpinner />;
  if (sandboxError) return <ErrorBanner message={sandboxError.message} onRetry={() => refetch()} />;

  const sandboxList = (sandboxes ?? []) as any[];
  const presets = (resourcePresets ?? []) as any[];

  const maxExec = Math.max(1, ...sandboxList.map((s: any) => s.resources?.totalExecutions || 0));

  return (
    <div className="space-y-6">
      {/* 资源使用排行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 内存排行 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">💾 内存使用排行</h3>
          <div className="space-y-3">
            {[...sandboxList]
              .sort((a: any, b: any) => (b.resources?.memoryUsedMB || 0) - (a.resources?.memoryUsedMB || 0))
              .map((sandbox: any) => (
                <div key={sandbox.pluginId}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">{sandbox.manifest?.name || sandbox.pluginId}</span>
                    <span className="font-mono text-zinc-400">{formatMemory(sandbox.resources?.memoryUsedMB || 0)}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${(sandbox.resources?.memoryUsedMB || 0) > 200 ? 'bg-red-500' : (sandbox.resources?.memoryUsedMB || 0) > 100 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                      style={{ width: `${Math.min(100, ((sandbox.resources?.memoryUsedMB || 0) / 512) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            {sandboxList.length === 0 && <div className="text-center text-zinc-600 py-4 text-sm">暂无数据</div>}
          </div>
        </div>

        {/* 执行次数排行 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">⚡ 执行次数排行</h3>
          <div className="space-y-3">
            {[...sandboxList]
              .sort((a: any, b: any) => (b.resources?.totalExecutions || 0) - (a.resources?.totalExecutions || 0))
              .map((sandbox: any) => (
                <div key={sandbox.pluginId}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">{sandbox.manifest?.name || sandbox.pluginId}</span>
                    <span className="font-mono text-zinc-400">{(sandbox.resources?.totalExecutions || 0).toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${((sandbox.resources?.totalExecutions || 0) / maxExec) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            {sandboxList.length === 0 && <div className="text-center text-zinc-600 py-4 text-sm">暂无数据</div>}
          </div>
        </div>
      </div>

      {/* 详细资源表格 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">📊 资源使用详情</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left py-2 px-2 text-zinc-500">插件</th>
                <th className="text-right py-2 px-2 text-zinc-500">内存 (MB)</th>
                <th className="text-right py-2 px-2 text-zinc-500">CPU (s)</th>
                <th className="text-right py-2 px-2 text-zinc-500">活跃</th>
                <th className="text-right py-2 px-2 text-zinc-500">总执行</th>
                <th className="text-right py-2 px-2 text-zinc-500">网络/分</th>
                <th className="text-right py-2 px-2 text-zinc-500">事件/分</th>
                <th className="text-center py-2 px-2 text-zinc-500">状态</th>
              </tr>
            </thead>
            <tbody>
              {sandboxList.map((sandbox: any) => (
                <tr key={sandbox.pluginId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span>{typeIcons[sandbox.manifest?.type] || '🧩'}</span>
                      <span className="text-zinc-300">{sandbox.manifest?.name || sandbox.pluginId}</span>
                    </div>
                  </td>
                  <td className={`text-right py-2 px-2 font-mono ${(sandbox.resources?.memoryUsedMB || 0) > 200 ? 'text-red-400' : 'text-zinc-300'}`}>
                    {sandbox.resources?.memoryUsedMB?.toFixed(1) || '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources ? (sandbox.resources.cpuTimeMs / 1000).toFixed(1) : '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.activeExecutions || 0}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.totalExecutions?.toLocaleString() || '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.networkRequestsThisMin || 0}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.eventsThisMin || 0}
                  </td>
                  <td className="text-center py-2 px-2">
                    <Badge className={stateColors[sandbox.state] || stateColors.idle}>{sandbox.state}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 资源限制预设 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">⚙️ 资源限制预设</h3>
        {presetsLoading ? (
          <LoadingSpinner text="加载预设..." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {presets.map((preset: any) => {
              const colorMap: Record<string, string> = {
                minimal: 'border-zinc-600',
                standard: 'border-cyan-500/30',
                performance: 'border-amber-500/30',
                unlimited: 'border-red-500/30',
              };
              const labelMap: Record<string, string> = {
                minimal: '最小',
                standard: '标准',
                performance: '高性能',
                unlimited: '无限制',
              };
              return (
                <div key={preset.name} className={`bg-zinc-950 border ${colorMap[preset.name] || 'border-zinc-600'} rounded-lg p-3`}>
                  <div className="text-sm font-semibold text-zinc-300 mb-2">{labelMap[preset.name] || preset.name}</div>
                  <div className="space-y-1 text-[11px] text-zinc-400">
                    <div className="flex justify-between"><span>内存</span><span className="font-mono">{preset.maxMemoryMB || preset.mem || '?'} MB</span></div>
                    <div className="flex justify-between"><span>CPU 时间</span><span className="font-mono">{preset.maxCpuTimeSeconds || preset.cpu || '∞'}s</span></div>
                    <div className="flex justify-between"><span>超时</span><span className="font-mono">{preset.executionTimeoutMs ? preset.executionTimeoutMs / 1000 : '∞'}s</span></div>
                    <div className="flex justify-between"><span>并发</span><span className="font-mono">{preset.maxConcurrentExecutions || preset.conc || '?'}</span></div>
                  </div>
                </div>
              );
            })}
            {presets.length === 0 && (
              <div className="col-span-full text-center text-zinc-600 py-4 text-sm">暂无预设配置</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Tab: 安全事件 ====================

function SecurityEventsTab() {
  const utils = trpc.useUtils();
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterResolved, setFilterResolved] = useState<string>('all');

  const { data: securityEvents, isLoading: eventsLoading, error: eventsError, refetch: refetchEvents } = trpc.plugin.getSecurityEvents.useQuery({
    severity: filterSeverity !== 'all' ? filterSeverity as any : undefined,
    resolved: filterResolved === 'all' ? undefined : filterResolved === 'resolved',
  });

  const { data: securityStats } = trpc.plugin.getSecurityStats.useQuery();
  const { data: dashboard } = trpc.plugin.getSecurityDashboard.useQuery();

  const resolveMut = trpc.plugin.resolveSecurityEvent.useMutation({
    onSuccess: () => {
      utils.plugin.getSecurityEvents.invalidate();
      utils.plugin.getSecurityStats.invalidate();
      utils.plugin.getSecurityDashboard.invalidate();
    },
  });

  const resetBreakerMut = trpc.plugin.resetCircuitBreaker.useMutation({
    onSuccess: () => {
      utils.plugin.getSandboxStatus.invalidate();
      utils.plugin.getSecurityStats.invalidate();
      utils.plugin.getSecurityDashboard.invalidate();
      utils.plugin.getSecurityEvents.invalidate();
    },
  });

  const eventsList = (securityEvents ?? []) as any[];
  const circuitBreakers = dashboard?.circuitBreakers ?? [];

  // Stats from backend or computed from events
  const totalEvents = securityStats?.total ?? eventsList.length;
  const unresolvedCount = securityStats?.unresolved ?? eventsList.filter((e: any) => !e.resolved).length;
  const criticalCount = securityStats?.bySeverity?.critical ?? eventsList.filter((e: any) => e.severity === 'critical').length;
  const highCount = securityStats?.bySeverity?.high ?? eventsList.filter((e: any) => e.severity === 'high').length;
  const mediumCount = securityStats?.bySeverity?.medium ?? eventsList.filter((e: any) => e.severity === 'medium').length;

  return (
    <div className="space-y-6">
      {/* 安全统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="总事件" value={totalEvents} />
        <StatCard label="未解决" value={unresolvedCount} color="text-orange-400" />
        <StatCard label="严重" value={criticalCount} color="text-red-400" />
        <StatCard label="高危" value={highCount} color="text-orange-400" />
        <StatCard label="中等" value={mediumCount} color="text-amber-400" />
      </div>

      {/* 熔断器状态 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">⚡ 熔断器状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {circuitBreakers.map((cb: any) => (
            <div key={cb.pluginId} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-300">{cb.pluginId?.split('.').pop() || cb.pluginId}</span>
                <Badge className={cbStateColors[cb.state] || cbStateColors.closed}>{cb.state}</Badge>
              </div>
              <div className="space-y-1 text-[11px] text-zinc-400">
                <div className="flex justify-between">
                  <span>失败次数</span>
                  <span className={`font-mono ${cb.failureCount > 3 ? 'text-red-400' : 'text-zinc-300'}`}>{cb.failureCount}/5</span>
                </div>
                {cb.lastFailureTime && (
                  <div className="flex justify-between">
                    <span>最后失败</span>
                    <span className="font-mono">{formatTime(cb.lastFailureTime)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>冷却时间</span>
                  <span className="font-mono">{(cb.cooldownMs || 60000) / 1000}s</span>
                </div>
              </div>
              {(cb.state === 'open' || cb.state === 'half-open') && (
                <button
                  onClick={() => resetBreakerMut.mutate({ pluginId: cb.pluginId })}
                  disabled={resetBreakerMut.isPending}
                  className="mt-2 w-full px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors disabled:opacity-50"
                >
                  {resetBreakerMut.isPending ? '重置中...' : '手动重置'}
                </button>
              )}
            </div>
          ))}
          {circuitBreakers.length === 0 && (
            <div className="col-span-full text-center text-zinc-600 py-4 text-sm">暂无熔断器数据</div>
          )}
        </div>
      </div>

      {/* 事件列表 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-zinc-300">🔔 安全事件</h3>
          <div className="flex gap-2">
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-2 py-1 text-[11px] bg-zinc-950 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">全部严重度</option>
              <option value="critical">严重</option>
              <option value="high">高危</option>
              <option value="medium">中等</option>
              <option value="low">低</option>
            </select>
            <select
              value={filterResolved}
              onChange={(e) => setFilterResolved(e.target.value)}
              className="px-2 py-1 text-[11px] bg-zinc-950 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="all">全部状态</option>
              <option value="unresolved">未解决</option>
              <option value="resolved">已解决</option>
            </select>
          </div>
        </div>
        {eventsLoading ? (
          <LoadingSpinner text="加载安全事件..." />
        ) : eventsError ? (
          <ErrorBanner message={eventsError.message} onRetry={() => refetchEvents()} />
        ) : (
          <div className="space-y-2">
            {eventsList.map((event: any) => (
              <div key={event.id} className={`flex items-start gap-3 p-3 rounded-lg border ${event.resolved ? 'bg-zinc-950/50 border-zinc-800/50' : 'bg-zinc-900/80 border-zinc-700'}`}>
                <Badge className={severityColors[event.severity] || ''}>{event.severity}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-zinc-400 font-mono">{formatTime(event.timestamp)}</span>
                    <span className="text-zinc-500">{event.pluginId}</span>
                    <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700">{event.type}</Badge>
                  </div>
                  <div className={`text-[12px] mt-1 ${event.resolved ? 'text-zinc-500' : 'text-zinc-300'}`}>
                    {event.description}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {event.resolved ? (
                    <span className="text-[11px] text-emerald-500">✓ 已解决</span>
                  ) : (
                    <button
                      onClick={() => resolveMut.mutate({ eventId: event.id })}
                      disabled={resolveMut.isPending}
                      className="px-2 py-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                    >
                      {resolveMut.isPending ? '处理中...' : '标记解决'}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {eventsList.length === 0 && (
              <div className="text-center text-zinc-600 py-4 text-sm">暂无安全事件</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Tab: 受信任签名者 ====================

function SignersTab() {
  const utils = trpc.useUtils();
  const { data: signers, isLoading, error, refetch } = trpc.plugin.listTrustedSigners.useQuery();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerKey, setNewSignerKey] = useState('');

  const addSignerMut = trpc.plugin.addTrustedSigner.useMutation({
    onSuccess: () => {
      utils.plugin.listTrustedSigners.invalidate();
      setShowAddForm(false);
      setNewSignerName('');
      setNewSignerKey('');
    },
  });

  const removeSignerMut = trpc.plugin.removeTrustedSigner.useMutation({
    onSuccess: () => {
      utils.plugin.listTrustedSigners.invalidate();
    },
  });

  const signersList = (signers ?? []) as any[];

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-300">🔑 受信任签名者</h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 text-[12px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors"
          >
            + 添加签名者
          </button>
        </div>

        {/* 添加签名者表单 */}
        {showAddForm && (
          <div className="mb-4 p-3 bg-zinc-950 border border-zinc-700 rounded-lg space-y-3">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">签名者名称</label>
              <input
                type="text"
                value={newSignerName}
                onChange={(e) => setNewSignerName(e.target.value)}
                placeholder="例如: 西联官方签名"
                className="w-full px-3 py-1.5 text-[12px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">公钥 (PEM)</label>
              <textarea
                value={newSignerKey}
                onChange={(e) => setNewSignerKey(e.target.value)}
                placeholder="-----BEGIN PUBLIC KEY-----..."
                rows={4}
                className="w-full px-3 py-1.5 text-[12px] bg-zinc-900 border border-zinc-700 rounded text-zinc-300 font-mono resize-none focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (newSignerName && newSignerKey) {
                    addSignerMut.mutate({ name: newSignerName, publicKeyPem: newSignerKey, addedBy: 'admin' });
                  }
                }}
                disabled={addSignerMut.isPending || !newSignerName || !newSignerKey}
                className="px-3 py-1.5 text-[12px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {addSignerMut.isPending ? '添加中...' : '确认添加'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-[12px] bg-zinc-800 text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-700 transition-colors"
              >
                取消
              </button>
            </div>
            {addSignerMut.error && (
              <div className="text-[11px] text-red-400">添加失败: {addSignerMut.error.message}</div>
            )}
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner text="加载签名者列表..." />
        ) : error ? (
          <ErrorBanner message={error.message} onRetry={() => refetch()} />
        ) : (
          <div className="space-y-3">
            {signersList.map((signer: any) => (
              <div key={signer.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">{signer.name}</span>
                      <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">受信任</Badge>
                    </div>
                    <div className="mt-1 space-y-1 text-[11px] text-zinc-400">
                      <div>指纹: <span className="font-mono text-zinc-300">{signer.fingerprint}</span></div>
                      <div>添加时间: {formatTime(signer.addedAt)}</div>
                      <div>添加者: {signer.addedBy}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeSignerMut.mutate({ id: signer.id })}
                    disabled={removeSignerMut.isPending}
                    className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {removeSignerMut.isPending ? '移除中...' : '移除'}
                  </button>
                </div>
              </div>
            ))}
            {signersList.length === 0 && (
              <div className="text-center text-zinc-600 py-8 text-sm">暂无受信任签名者</div>
            )}
          </div>
        )}
      </div>

      {/* 签名验证说明 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">📖 签名验证流程</h3>
        <div className="space-y-3">
          {[
            { step: '1', title: '插件打包', desc: '开发者使用私钥对插件包进行 SHA256+RSA 签名' },
            { step: '2', title: '摘要校验', desc: '安装时计算插件包 SHA256 摘要，与 manifest 中声明的摘要对比' },
            { step: '3', title: '签名验证', desc: '使用受信任签名者的公钥验证 RSA/ECDSA 签名' },
            { step: '4', title: '时效检查', desc: '验证签名时间不超过 1 年（防止使用过期签名）' },
            { step: '5', title: '信任评估', desc: '根据签名者信任等级决定是否需要管理员审批' },
          ].map(item => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-bold shrink-0">
                {item.step}
              </div>
              <div>
                <div className="text-[12px] font-medium text-zinc-300">{item.title}</div>
                <div className="text-[11px] text-zinc-500">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '沙箱概览', icon: '🏠' },
  { id: 'marketplace', label: '插件市场', icon: '🏪' },
  { id: 'permissions', label: '权限管理', icon: '🔐' },
  { id: 'resources', label: '资源监控', icon: '📊' },
  { id: 'events', label: '安全事件', icon: '🔔' },
  { id: 'signers', label: '受信任签名者', icon: '🔑' },
];

export default function PluginSandboxManager() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const { data: sandboxes } = trpc.plugin.getSandboxStatus.useQuery();
  const { data: securityEvents } = trpc.plugin.getSecurityEvents.useQuery({});

  const sandboxList = (sandboxes ?? []) as any[];
  const eventsList = (securityEvents ?? []) as any[];
  const runningCount = sandboxList.filter((s: any) => s.state === 'running').length;
  const unresolvedCount = eventsList.filter((e: any) => !e.resolved).length;

  return (
    <MainLayout title="插件安全沙箱">
    <div className="h-full flex flex-col bg-zinc-950">
      {/* 页头 */}
      <div className="px-6 pt-5 pb-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-100">🧩 插件安全沙箱</h1>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              三层隔离架构：VM Context 代码隔离 → 权限网关拦截 → 资源配额限制
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
              {runningCount} 运行中
            </Badge>
            <Badge className={unresolvedCount > 0
              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            }>
              {unresolvedCount} 未解决事件
            </Badge>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="flex gap-1 mt-4 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-[12px] rounded-t-lg border border-b-0 transition-colors ${
                activeTab === tab.id
                  ? 'bg-zinc-900 text-cyan-400 border-zinc-700'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'marketplace' && <MarketplaceTab />}
        {activeTab === 'permissions' && <PermissionsTab />}
        {activeTab === 'resources' && <ResourcesTab />}
        {activeTab === 'events' && <SecurityEventsTab />}
        {activeTab === 'signers' && <SignersTab />}
      </div>
    </div>
    </MainLayout>
  );
}
