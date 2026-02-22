/**
 * StateSyncEngine 专属配置面板
 * 
 * 提供 CDC/Polling 双模式可视化切换、降级阈值滑块、批量大小调节等
 */
import { useState, useEffect } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ConfigItem {
  id: number;
  module: string;
  configKey: string;
  configValue: unknown;
  defaultValue: unknown;
  label: string | null;
  unit: string | null;
  configGroup: string | null;
  constraints: unknown;
  description: string | null;
  enabled: number;
}

interface Props {
  configs: ConfigItem[];
  onUpdate: (id: number, value: string, reason?: string) => void;
  onReset: (id: number) => void;
}

export default function StateSyncPanel({ configs, onUpdate, onReset }: Props) {
  const getConfig = (key: string) => configs.find(c => c.configKey === key);
  const getVal = (key: string): string => {
    const c = getConfig(key);
    if (!c) return '';
    const v = c.configValue;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const syncMode = getVal('syncMode') || 'cdc_primary';
  const pollingInterval = getVal('pollingIntervalMs') || '5000';
  const cdcFallbackThreshold = getVal('cdcFallbackThresholdMs') || '3000';
  const batchSize = getVal('batchSize') || '100';
  const maxRetries = getVal('maxRetries') || '3';
  const enableAutoFallback = getVal('enableAutoFallback') === 'true';

  return (
    <div className="space-y-3">
      {/* 同步模式选择 */}
      <PageCard title="同步模式" icon={<span className="text-xs">🔄</span>} compact>
        <div className="space-y-3">
          {/* 模式可视化 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const c = getConfig('syncMode');
                if (c) onUpdate(c.id, 'cdc_primary');
              }}
              className={`p-3 rounded border-2 transition-all text-left ${
                syncMode === 'cdc_primary'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-border hover:border-blue-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${syncMode === 'cdc_primary' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-[11px] font-semibold">CDC 主模式</span>
              </div>
              <p className="text-[9px] text-muted-foreground">
                Change Data Capture 实时流同步，延迟 &lt; 100ms，推荐用于生产环境
              </p>
              <div className="mt-2 flex gap-1">
                <Badge variant="outline" className="text-[8px]">实时</Badge>
                <Badge variant="outline" className="text-[8px]">低延迟</Badge>
                <Badge variant="outline" className="text-[8px]">高可靠</Badge>
              </div>
            </button>

            <button
              onClick={() => {
                const c = getConfig('syncMode');
                if (c) onUpdate(c.id, 'polling_only');
              }}
              className={`p-3 rounded border-2 transition-all text-left ${
                syncMode === 'polling_only'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-border hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${syncMode === 'polling_only' ? 'bg-amber-500 animate-pulse' : 'bg-gray-300'}`} />
                <span className="text-[11px] font-semibold">Polling 轮询模式</span>
              </div>
              <p className="text-[9px] text-muted-foreground">
                定时轮询同步，延迟取决于间隔设置，适用于 CDC 不可用的场景
              </p>
              <div className="mt-2 flex gap-1">
                <Badge variant="outline" className="text-[8px]">稳定</Badge>
                <Badge variant="outline" className="text-[8px]">简单</Badge>
                <Badge variant="outline" className="text-[8px]">兼容性好</Badge>
              </div>
            </button>
          </div>

          {/* 自动降级开关 */}
          <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
            <div>
              <div className="text-[10px] font-medium">自动降级</div>
              <div className="text-[9px] text-muted-foreground">
                CDC 超时自动切换到 Polling 模式
              </div>
            </div>
            <Switch
              checked={enableAutoFallback}
              onCheckedChange={(checked) => {
                const c = getConfig('enableAutoFallback');
                if (c) onUpdate(c.id, String(checked));
              }}
              className="scale-[0.7]"
            />
          </div>
        </div>
      </PageCard>

      {/* 性能参数 */}
      <PageCard title="性能参数" icon={<span className="text-xs">⚡</span>} compact>
        <div className="grid grid-cols-2 gap-3">
          {/* 轮询间隔 */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium">轮询间隔</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={pollingInterval}
                onChange={(e) => {
                  const c = getConfig('pollingIntervalMs');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">ms</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1">
              <div
                className="bg-blue-500 h-1 rounded-full transition-all"
                style={{ width: `${Math.min(100, (Number(pollingInterval) / 30000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground">
              <span>1s</span>
              <span>30s</span>
            </div>
          </div>

          {/* CDC 降级阈值 */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium">CDC 降级阈值</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={cdcFallbackThreshold}
                onChange={(e) => {
                  const c = getConfig('cdcFallbackThresholdMs');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">ms</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1">
              <div
                className="bg-amber-500 h-1 rounded-full transition-all"
                style={{ width: `${Math.min(100, (Number(cdcFallbackThreshold) / 10000) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[8px] text-muted-foreground">
              <span>500ms</span>
              <span>10s</span>
            </div>
          </div>

          {/* 批量大小 */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium">批量大小</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={batchSize}
                onChange={(e) => {
                  const c = getConfig('batchSize');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">条</span>
            </div>
          </div>

          {/* 最大重试次数 */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium">最大重试次数</label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={maxRetries}
                onChange={(e) => {
                  const c = getConfig('maxRetries');
                  if (c) onUpdate(c.id, e.target.value);
                }}
                className="h-6 text-[10px] font-mono w-20"
              />
              <span className="text-[9px] text-muted-foreground">次</span>
            </div>
          </div>
        </div>
      </PageCard>

      {/* 数据流示意 */}
      <PageCard title="数据流路径" icon={<span className="text-xs">📊</span>} compact>
        <div className="flex items-center justify-center gap-1 py-2">
          <div className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[9px] font-medium">
            传感器
          </div>
          <span className="text-[10px] text-muted-foreground">→</span>
          <div className={`px-2 py-1 rounded text-[9px] font-medium ${
            syncMode === 'cdc_primary'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {syncMode === 'cdc_primary' ? 'CDC Stream' : 'Polling'}
          </div>
          <span className="text-[10px] text-muted-foreground">→</span>
          <div className="px-2 py-1 bg-violet-100 text-violet-700 rounded text-[9px] font-medium">
            StateSyncEngine
          </div>
          <span className="text-[10px] text-muted-foreground">→</span>
          <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-[9px] font-medium">
            WorldModel
          </div>
        </div>
        {enableAutoFallback && (
          <div className="flex items-center justify-center gap-1 text-[8px] text-muted-foreground">
            <span>CDC 超时 {cdcFallbackThreshold}ms</span>
            <span>→</span>
            <span className="text-amber-600">自动降级到 Polling</span>
          </div>
        )}
      </PageCard>
    </div>
  );
}
