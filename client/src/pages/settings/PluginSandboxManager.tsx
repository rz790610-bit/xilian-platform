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
import React, { useState, useMemo } from 'react';

// ==================== 类型定义 ====================

type TabId = 'overview' | 'marketplace' | 'permissions' | 'resources' | 'events' | 'signers';

interface SandboxStatus {
  pluginId: string;
  state: string;
  manifest: {
    id: string;
    name: string;
    version: string;
    type: string;
    permissions: string[];
    description: string;
    author: { name: string; email?: string };
  };
  resources: {
    memoryUsedMB: number;
    cpuTimeMs: number;
    activeExecutions: number;
    totalExecutions: number;
    networkRequestsThisMin: number;
    eventsThisMin: number;
  } | null;
}

interface SecurityEvent {
  id: string;
  timestamp: string;
  pluginId: string;
  type: string;
  severity: string;
  description: string;
  resolved: boolean;
}

interface CircuitBreakerState {
  pluginId: string;
  state: string;
  failureCount: number;
  lastFailureTime: string | null;
  openedAt: string | null;
  cooldownMs: number;
}

interface AuditEntry {
  timestamp: string;
  pluginId: string;
  permission: string;
  action: string;
  allowed: boolean;
}

interface TrustSigner {
  id: string;
  name: string;
  fingerprint: string;
  addedAt: string;
  addedBy: string;
}

// ==================== Mock 数据 ====================

const mockSandboxes: SandboxStatus[] = [
  {
    pluginId: 'xilian.vibration-analyzer',
    state: 'running',
    manifest: {
      id: 'xilian.vibration-analyzer',
      name: '振动分析器',
      version: '2.1.0',
      type: 'analyzer',
      permissions: ['data:sensor:read', 'data:alert:write', 'model:inference', 'event:publish', 'storage:write'],
      description: '基于FFT的振动频谱分析，支持轴承故障特征提取',
      author: { name: '西联算法团队', email: 'algo@xilian.com' },
    },
    resources: {
      memoryUsedMB: 87.3,
      cpuTimeMs: 12450,
      activeExecutions: 2,
      totalExecutions: 1847,
      networkRequestsThisMin: 0,
      eventsThisMin: 12,
    },
  },
  {
    pluginId: 'xilian.modbus-collector',
    state: 'running',
    manifest: {
      id: 'xilian.modbus-collector',
      name: 'Modbus 采集器',
      version: '1.5.2',
      type: 'source',
      permissions: ['network:http', 'data:device:read', 'event:publish', 'storage:write', 'system:log'],
      description: 'Modbus TCP/RTU 协议数据采集，支持批量寄存器读取',
      author: { name: '西联IoT团队' },
    },
    resources: {
      memoryUsedMB: 45.1,
      cpuTimeMs: 8920,
      activeExecutions: 1,
      totalExecutions: 5623,
      networkRequestsThisMin: 24,
      eventsThisMin: 48,
    },
  },
  {
    pluginId: 'xilian.anomaly-detector',
    state: 'running',
    manifest: {
      id: 'xilian.anomaly-detector',
      name: '异常检测引擎',
      version: '3.0.1',
      type: 'analyzer',
      permissions: ['data:sensor:read', 'data:alert:write', 'model:inference', 'model:embed', 'data:kg:write', 'event:publish'],
      description: '多模态异常检测（统计+ML+DL），支持实时流式检测',
      author: { name: '西联AI Lab' },
    },
    resources: {
      memoryUsedMB: 256.8,
      cpuTimeMs: 45200,
      activeExecutions: 3,
      totalExecutions: 892,
      networkRequestsThisMin: 0,
      eventsThisMin: 35,
    },
  },
  {
    pluginId: 'xilian.report-generator',
    state: 'suspended',
    manifest: {
      id: 'xilian.report-generator',
      name: '报告生成器',
      version: '1.2.0',
      type: 'utility',
      permissions: ['data:device:read', 'data:alert:read', 'storage:write', 'ui:notification'],
      description: '自动生成设备健康报告和诊断摘要',
      author: { name: '西联产品团队' },
    },
    resources: {
      memoryUsedMB: 12.4,
      cpuTimeMs: 3200,
      activeExecutions: 0,
      totalExecutions: 156,
      networkRequestsThisMin: 0,
      eventsThisMin: 0,
    },
  },
  {
    pluginId: 'community.opcua-bridge',
    state: 'running',
    manifest: {
      id: 'community.opcua-bridge',
      name: 'OPC-UA 桥接器',
      version: '0.9.3',
      type: 'integration',
      permissions: ['network:http', 'network:ws', 'data:device:read', 'event:publish', 'system:config:read'],
      description: '第三方 OPC-UA 服务器连接桥接',
      author: { name: 'OpenIoT Community' },
    },
    resources: {
      memoryUsedMB: 68.2,
      cpuTimeMs: 15600,
      activeExecutions: 1,
      totalExecutions: 3421,
      networkRequestsThisMin: 18,
      eventsThisMin: 22,
    },
  },
];

const mockSecurityEvents: SecurityEvent[] = [
  { id: 'sec-a1b2c3', timestamp: '2026-02-17T08:45:12Z', pluginId: 'community.opcua-bridge', type: 'permission_denied', severity: 'medium', description: '权限被拒绝: system:config:read (writeConfig)', resolved: false },
  { id: 'sec-d4e5f6', timestamp: '2026-02-17T08:32:05Z', pluginId: 'xilian.anomaly-detector', type: 'resource_exceeded', severity: 'high', description: '资源超限: memoryUsedMB (312/256)', resolved: true },
  { id: 'sec-g7h8i9', timestamp: '2026-02-17T07:15:33Z', pluginId: 'community.opcua-bridge', type: 'network_violation', severity: 'high', description: 'Network policy violation: 192.168.1.100 不在白名单中', resolved: false },
  { id: 'sec-j1k2l3', timestamp: '2026-02-17T06:50:18Z', pluginId: 'xilian.modbus-collector', type: 'execution_timeout', severity: 'medium', description: '执行超时: exec-4f2a (30000ms)', resolved: true },
  { id: 'sec-m4n5o6', timestamp: '2026-02-17T05:22:41Z', pluginId: 'xilian.vibration-analyzer', type: 'permission_denied', severity: 'low', description: '权限被拒绝: data:kg:write (addNode)', resolved: true },
  { id: 'sec-p7q8r9', timestamp: '2026-02-16T23:10:05Z', pluginId: 'community.opcua-bridge', type: 'circuit_breaker_open', severity: 'critical', description: '熔断器已打开: failure threshold reached (5)', resolved: true },
  { id: 'sec-s1t2u3', timestamp: '2026-02-16T22:45:30Z', pluginId: 'xilian.report-generator', type: 'sandbox_error', severity: 'medium', description: '执行错误: Template rendering failed', resolved: true },
];

const mockCircuitBreakers: CircuitBreakerState[] = [
  { pluginId: 'xilian.vibration-analyzer', state: 'closed', failureCount: 0, lastFailureTime: null, openedAt: null, cooldownMs: 60000 },
  { pluginId: 'xilian.modbus-collector', state: 'closed', failureCount: 1, lastFailureTime: '2026-02-17T06:50:18Z', openedAt: null, cooldownMs: 60000 },
  { pluginId: 'xilian.anomaly-detector', state: 'closed', failureCount: 0, lastFailureTime: null, openedAt: null, cooldownMs: 60000 },
  { pluginId: 'community.opcua-bridge', state: 'half-open', failureCount: 4, lastFailureTime: '2026-02-17T07:15:33Z', openedAt: '2026-02-16T23:10:05Z', cooldownMs: 120000 },
  { pluginId: 'xilian.report-generator', state: 'closed', failureCount: 1, lastFailureTime: '2026-02-16T22:45:30Z', openedAt: null, cooldownMs: 60000 },
];

const mockAuditLog: AuditEntry[] = [
  { timestamp: '2026-02-17T08:45:12Z', pluginId: 'community.opcua-bridge', permission: 'system:config:read', action: 'writeConfig', allowed: false },
  { timestamp: '2026-02-17T08:44:58Z', pluginId: 'xilian.vibration-analyzer', permission: 'data:sensor:read', action: 'getLatest', allowed: true },
  { timestamp: '2026-02-17T08:44:45Z', pluginId: 'xilian.anomaly-detector', permission: 'model:inference', action: 'detect', allowed: true },
  { timestamp: '2026-02-17T08:44:30Z', pluginId: 'xilian.modbus-collector', permission: 'network:http', action: 'http://10.0.1.50:502', allowed: true },
  { timestamp: '2026-02-17T08:44:15Z', pluginId: 'xilian.vibration-analyzer', permission: 'event:publish', action: 'vibration.alarm', allowed: true },
  { timestamp: '2026-02-17T08:44:00Z', pluginId: 'community.opcua-bridge', permission: 'network:ws', action: 'ws://opcua-server:4840', allowed: true },
  { timestamp: '2026-02-17T08:43:45Z', pluginId: 'xilian.anomaly-detector', permission: 'data:alert:write', action: 'createAlert', allowed: true },
  { timestamp: '2026-02-17T08:43:30Z', pluginId: 'xilian.vibration-analyzer', permission: 'data:kg:write', action: 'addNode', allowed: false },
];

const mockSigners: TrustSigner[] = [
  { id: 'signer-a1b2c3d4', name: '西联官方签名', fingerprint: 'a1b2c3d4e5f6g7h8', addedAt: '2025-06-15T10:00:00Z', addedBy: 'admin' },
  { id: 'signer-i9j0k1l2', name: 'OpenIoT 社区', fingerprint: 'i9j0k1l2m3n4o5p6', addedAt: '2025-09-20T14:30:00Z', addedBy: 'admin' },
];

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

// ==================== Tab: 沙箱概览 ====================

function OverviewTab() {
  const totalPlugins = mockSandboxes.length;
  const runningPlugins = mockSandboxes.filter(s => s.state === 'running').length;
  const totalMemory = mockSandboxes.reduce((sum, s) => sum + (s.resources?.memoryUsedMB || 0), 0);
  const totalExecs = mockSandboxes.reduce((sum, s) => sum + (s.resources?.totalExecutions || 0), 0);
  const unresolvedEvents = mockSecurityEvents.filter(e => !e.resolved).length;
  const criticalEvents = mockSecurityEvents.filter(e => e.severity === 'critical' && !e.resolved).length;
  const openBreakers = mockCircuitBreakers.filter(b => b.state === 'open' || b.state === 'half-open').length;

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="沙箱总数" value={totalPlugins} sub={`${runningPlugins} 运行中`} />
        <StatCard label="总内存" value={formatMemory(totalMemory)} sub="所有沙箱合计" color="text-amber-400" />
        <StatCard label="总执行次数" value={totalExecs.toLocaleString()} sub="累计" color="text-blue-400" />
        <StatCard label="未解决事件" value={unresolvedEvents} color={unresolvedEvents > 0 ? 'text-orange-400' : 'text-emerald-400'} />
        <StatCard label="严重告警" value={criticalEvents} color={criticalEvents > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <StatCard label="熔断器" value={`${openBreakers}/${mockCircuitBreakers.length}`} sub={openBreakers > 0 ? '有打开的' : '全部正常'} color={openBreakers > 0 ? 'text-red-400' : 'text-emerald-400'} />
        <StatCard label="受信任签名者" value={mockSigners.length} color="text-purple-400" />
      </div>

      {/* 沙箱列表 */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">活跃沙箱</h3>
        <div className="space-y-2">
          {mockSandboxes.map(sandbox => (
            <div key={sandbox.pluginId} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{typeIcons[sandbox.manifest.type] || '🧩'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-200">{sandbox.manifest.name}</span>
                      <span className="text-[11px] text-zinc-500">v{sandbox.manifest.version}</span>
                      <Badge className={stateColors[sandbox.state]}>{sandbox.state}</Badge>
                      {sandbox.pluginId.startsWith('xilian.') ? (
                        <Badge className={trustLevelLabels.trusted.color}>受信任</Badge>
                      ) : (
                        <Badge className={trustLevelLabels.verified.color}>已验证</Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{sandbox.manifest.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sandbox.state === 'running' && (
                    <button className="px-2 py-1 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors">
                      暂停
                    </button>
                  )}
                  {sandbox.state === 'suspended' && (
                    <button className="px-2 py-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors">
                      恢复
                    </button>
                  )}
                  <button className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors">
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
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-zinc-800">
                {sandbox.manifest.permissions.map(perm => (
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 插件市场 ====================

function MarketplaceTab() {
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

  const handleValidate = () => {
    // 模拟校验
    setValidationResult({
      valid: true,
      errors: [],
      warnings: [
        { field: 'permissions', message: '包含高风险权限（需管理员审批）: 无', severity: 'warning' },
      ],
    });
  };

  const availablePlugins = [
    { id: 'xilian.thermal-analyzer', name: '热力学分析器', version: '1.3.0', type: 'analyzer', author: '西联AI Lab', trust: 'trusted', desc: '基于红外热成像的设备温度异常检测', riskScore: 15 },
    { id: 'xilian.mqtt-bridge', name: 'MQTT 桥接器', version: '2.0.1', type: 'source', author: '西联IoT团队', trust: 'trusted', desc: 'MQTT v5 协议桥接，支持 TLS 双向认证', riskScore: 25 },
    { id: 'community.grafana-sync', name: 'Grafana 同步器', version: '0.8.0', type: 'integration', author: 'OpenIoT', trust: 'verified', desc: '自动同步仪表盘和告警规则到 Grafana', riskScore: 42 },
    { id: 'community.pdf-report', name: 'PDF 报告导出', version: '1.1.0', type: 'utility', author: 'Community', trust: 'basic', desc: '将诊断报告导出为专业 PDF 格式', riskScore: 8 },
    { id: 'third-party.s7-connector', name: 'S7 连接器', version: '0.5.0', type: 'source', author: 'Industrial Plugins', trust: 'untrusted', desc: 'Siemens S7 PLC 直连采集', riskScore: 68 },
  ];

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
                className="px-3 py-1.5 text-[12px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors"
              >
                校验 Manifest
              </button>
              <button className="px-3 py-1.5 text-[12px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors">
                安全审查
              </button>
              <button className="px-3 py-1.5 text-[12px] bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/20 transition-colors">
                安装到沙箱
              </button>
            </div>
          </div>
          <div>
            {validationResult && (
              <div className="bg-zinc-950 border border-zinc-700 rounded p-3 h-64 overflow-auto">
                <div className={`text-sm font-semibold mb-2 ${validationResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                  {validationResult.valid ? '✅ 校验通过' : '❌ 校验失败'}
                </div>
                {validationResult.errors.map((e: any, i: number) => (
                  <div key={i} className="text-[11px] text-red-400 mb-1">
                    ❌ [{e.field}] {e.message}
                  </div>
                ))}
                {validationResult.warnings.map((w: any, i: number) => (
                  <div key={i} className="text-[11px] text-amber-400 mb-1">
                    ⚠ [{w.field}] {w.message}
                  </div>
                ))}
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <div className="text-[11px] text-zinc-500">风险评分</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '12%' }} />
                    </div>
                    <span className="text-sm font-mono text-emerald-400">12/100</span>
                  </div>
                </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {availablePlugins.map(plugin => (
            <div key={plugin.id} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{typeIcons[plugin.type]}</span>
                  <div>
                    <div className="font-medium text-zinc-200 text-sm">{plugin.name}</div>
                    <div className="text-[11px] text-zinc-500">v{plugin.version} · {plugin.author}</div>
                  </div>
                </div>
                <Badge className={trustLevelLabels[plugin.trust]?.color || ''}>
                  {trustLevelLabels[plugin.trust]?.label || plugin.trust}
                </Badge>
              </div>
              <p className="text-[11px] text-zinc-400 mb-3">{plugin.desc}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-500">风险:</span>
                  <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${plugin.riskScore > 50 ? 'bg-red-500' : plugin.riskScore > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${plugin.riskScore}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono ${plugin.riskScore > 50 ? 'text-red-400' : plugin.riskScore > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {plugin.riskScore}
                  </span>
                </div>
                <button className="px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors">
                  安装
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 权限管理 ====================

function PermissionsTab() {
  const [filterPlugin, setFilterPlugin] = useState('');
  const [filterAllowed, setFilterAllowed] = useState<'all' | 'allowed' | 'denied'>('all');

  const filteredLog = useMemo(() => {
    let log = mockAuditLog;
    if (filterPlugin) log = log.filter(e => e.pluginId.includes(filterPlugin));
    if (filterAllowed === 'allowed') log = log.filter(e => e.allowed);
    if (filterAllowed === 'denied') log = log.filter(e => !e.allowed);
    return log;
  }, [filterPlugin, filterAllowed]);

  return (
    <div className="space-y-6">
      {/* 权限矩阵 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">🔐 权限矩阵</h3>
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
              {mockSandboxes.map(sandbox => {
                const perms = new Set(sandbox.manifest.permissions);
                const permCheck = (prefix: string) => {
                  const hasRead = perms.has(`${prefix}:read` as any);
                  const hasWrite = perms.has(`${prefix}:write` as any);
                  const hasHttp = perms.has(`${prefix}:http` as any);
                  const hasWs = perms.has(`${prefix}:ws` as any);
                  const hasSub = perms.has(`${prefix}:subscribe` as any);
                  const hasPub = perms.has(`${prefix}:publish` as any);
                  const hasInference = perms.has(`${prefix}:inference` as any);
                  const hasEmbed = perms.has(`${prefix}:embed` as any);
                  const hasNotif = perms.has(`${prefix}:notification` as any);
                  const hasWidget = perms.has(`${prefix}:widget` as any);
                  const hasLog = perms.has(`${prefix}:log` as any);
                  const hasConfig = perms.has(`${prefix}:config:read` as any);

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
                    <td className="py-2 px-2 text-zinc-300 font-medium">{sandbox.manifest.name}</td>
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
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {filteredLog.map((entry, i) => (
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
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 资源监控 ====================

function ResourcesTab() {
  return (
    <div className="space-y-6">
      {/* 资源使用排行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 内存排行 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">💾 内存使用排行</h3>
          <div className="space-y-3">
            {[...mockSandboxes]
              .sort((a, b) => (b.resources?.memoryUsedMB || 0) - (a.resources?.memoryUsedMB || 0))
              .map(sandbox => (
                <div key={sandbox.pluginId}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-zinc-300">{sandbox.manifest.name}</span>
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
          </div>
        </div>

        {/* 执行次数排行 */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">⚡ 执行次数排行</h3>
          <div className="space-y-3">
            {[...mockSandboxes]
              .sort((a, b) => (b.resources?.totalExecutions || 0) - (a.resources?.totalExecutions || 0))
              .map(sandbox => {
                const maxExec = Math.max(...mockSandboxes.map(s => s.resources?.totalExecutions || 0));
                return (
                  <div key={sandbox.pluginId}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-zinc-300">{sandbox.manifest.name}</span>
                      <span className="font-mono text-zinc-400">{(sandbox.resources?.totalExecutions || 0).toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${((sandbox.resources?.totalExecutions || 0) / maxExec) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
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
              {mockSandboxes.map(sandbox => (
                <tr key={sandbox.pluginId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span>{typeIcons[sandbox.manifest.type]}</span>
                      <span className="text-zinc-300">{sandbox.manifest.name}</span>
                    </div>
                  </td>
                  <td className={`text-right py-2 px-2 font-mono ${(sandbox.resources?.memoryUsedMB || 0) > 200 ? 'text-red-400' : 'text-zinc-300'}`}>
                    {sandbox.resources?.memoryUsedMB.toFixed(1) || '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources ? (sandbox.resources.cpuTimeMs / 1000).toFixed(1) : '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.activeExecutions || 0}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.totalExecutions.toLocaleString() || '—'}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.networkRequestsThisMin || 0}
                  </td>
                  <td className="text-right py-2 px-2 font-mono text-zinc-300">
                    {sandbox.resources?.eventsThisMin || 0}
                  </td>
                  <td className="text-center py-2 px-2">
                    <Badge className={stateColors[sandbox.state]}>{sandbox.state}</Badge>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { name: 'minimal', label: '最小', mem: 32, cpu: 1, timeout: 5, conc: 1, color: 'border-zinc-600' },
            { name: 'standard', label: '标准', mem: 128, cpu: 5, timeout: 30, conc: 3, color: 'border-cyan-500/30' },
            { name: 'performance', label: '高性能', mem: 512, cpu: 30, timeout: 120, conc: 10, color: 'border-amber-500/30' },
            { name: 'unlimited', label: '无限制', mem: 2048, cpu: 0, timeout: 0, conc: 50, color: 'border-red-500/30' },
          ].map(preset => (
            <div key={preset.name} className={`bg-zinc-950 border ${preset.color} rounded-lg p-3`}>
              <div className="text-sm font-semibold text-zinc-300 mb-2">{preset.label}</div>
              <div className="space-y-1 text-[11px] text-zinc-400">
                <div className="flex justify-between"><span>内存</span><span className="font-mono">{preset.mem} MB</span></div>
                <div className="flex justify-between"><span>CPU 时间</span><span className="font-mono">{preset.cpu || '∞'}s</span></div>
                <div className="flex justify-between"><span>超时</span><span className="font-mono">{preset.timeout || '∞'}s</span></div>
                <div className="flex justify-between"><span>并发</span><span className="font-mono">{preset.conc}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 安全事件 ====================

function SecurityEventsTab() {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterResolved, setFilterResolved] = useState<string>('all');

  const filteredEvents = useMemo(() => {
    let events = mockSecurityEvents;
    if (filterSeverity !== 'all') events = events.filter(e => e.severity === filterSeverity);
    if (filterResolved === 'unresolved') events = events.filter(e => !e.resolved);
    if (filterResolved === 'resolved') events = events.filter(e => e.resolved);
    return events;
  }, [filterSeverity, filterResolved]);

  return (
    <div className="space-y-6">
      {/* 安全统计 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="总事件" value={mockSecurityEvents.length} />
        <StatCard label="未解决" value={mockSecurityEvents.filter(e => !e.resolved).length} color="text-orange-400" />
        <StatCard label="严重" value={mockSecurityEvents.filter(e => e.severity === 'critical').length} color="text-red-400" />
        <StatCard label="高危" value={mockSecurityEvents.filter(e => e.severity === 'high').length} color="text-orange-400" />
        <StatCard label="中等" value={mockSecurityEvents.filter(e => e.severity === 'medium').length} color="text-amber-400" />
      </div>

      {/* 熔断器状态 */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">⚡ 熔断器状态</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mockCircuitBreakers.map(cb => (
            <div key={cb.pluginId} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-300">{cb.pluginId.split('.').pop()}</span>
                <Badge className={cbStateColors[cb.state]}>{cb.state}</Badge>
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
                  <span className="font-mono">{cb.cooldownMs / 1000}s</span>
                </div>
              </div>
              {(cb.state === 'open' || cb.state === 'half-open') && (
                <button className="mt-2 w-full px-2 py-1 text-[11px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors">
                  手动重置
                </button>
              )}
            </div>
          ))}
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
        <div className="space-y-2">
          {filteredEvents.map(event => (
            <div key={event.id} className={`flex items-start gap-3 p-3 rounded-lg border ${event.resolved ? 'bg-zinc-950/50 border-zinc-800/50' : 'bg-zinc-900/80 border-zinc-700'}`}>
              <Badge className={severityColors[event.severity]}>{event.severity}</Badge>
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
                  <button className="px-2 py-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/20 transition-colors">
                    标记解决
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== Tab: 受信任签名者 ====================

function SignersTab() {
  return (
    <div className="space-y-6">
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-zinc-300">🔑 受信任签名者</h3>
          <button className="px-3 py-1.5 text-[12px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors">
            + 添加签名者
          </button>
        </div>
        <div className="space-y-3">
          {mockSigners.map(signer => (
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
                <button className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 border border-red-500/30 rounded hover:bg-red-500/20 transition-colors">
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
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

  return (
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
              {mockSandboxes.filter(s => s.state === 'running').length} 运行中
            </Badge>
            <Badge className={mockSecurityEvents.filter(e => !e.resolved).length > 0
              ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            }>
              {mockSecurityEvents.filter(e => !e.resolved).length} 未解决事件
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
  );
}
