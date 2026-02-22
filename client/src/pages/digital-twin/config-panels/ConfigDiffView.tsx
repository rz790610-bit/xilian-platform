/**
 * ConfigDiffView 配置对比视图
 * 
 * 对比当前值 vs 默认值，或对比两个快照之间的差异
 */
import { useState } from 'react';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface ConfigItem {
  id: number; module: string; configKey: string; configValue: unknown;
  defaultValue: unknown; label: string | null; unit: string | null;
  configGroup: string | null; description: string | null;
}

interface Props {
  configs: ConfigItem[];
  onReset: (id: number) => void;
  onResetAll: () => void;
}

export default function ConfigDiffView({ configs, onReset, onResetAll }: Props) {
  const [showOnlyChanged, setShowOnlyChanged] = useState(true);

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v);
  };

  const isChanged = (item: ConfigItem): boolean => {
    return formatValue(item.configValue) !== formatValue(item.defaultValue);
  };

  const displayConfigs = showOnlyChanged ? configs.filter(isChanged) : configs;
  const changedCount = configs.filter(isChanged).length;

  return (
    <div className="space-y-3">
      <PageCard title={`配置对比 (${changedCount} 项已修改)`} icon={<span className="text-xs">🔍</span>} compact>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button variant={showOnlyChanged ? 'default' : 'outline'} size="sm"
              className="h-5 text-[9px] px-2"
              onClick={() => setShowOnlyChanged(true)}>
              仅显示变更 ({changedCount})
            </Button>
            <Button variant={!showOnlyChanged ? 'default' : 'outline'} size="sm"
              className="h-5 text-[9px] px-2"
              onClick={() => setShowOnlyChanged(false)}>
              全部 ({configs.length})
            </Button>
          </div>
          {changedCount > 0 && (
            <Button variant="destructive" size="sm" className="h-5 text-[9px] px-2"
              onClick={onResetAll}>
              全部恢复默认
            </Button>
          )}
        </div>

        {displayConfigs.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-muted-foreground">
            所有配置项均为默认值
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[9px] w-32">配置项</TableHead>
                <TableHead className="text-[9px] w-24">默认值</TableHead>
                <TableHead className="text-[9px] w-24">当前值</TableHead>
                <TableHead className="text-[9px] w-16">变化</TableHead>
                <TableHead className="text-[9px] w-12">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayConfigs.map(item => {
                const defaultStr = formatValue(item.defaultValue);
                const currentStr = formatValue(item.configValue);
                const changed = defaultStr !== currentStr;

                // 计算变化百分比（仅对数字）
                let changeIndicator = '';
                if (changed) {
                  const defaultNum = Number(defaultStr);
                  const currentNum = Number(currentStr);
                  if (!isNaN(defaultNum) && !isNaN(currentNum) && defaultNum !== 0) {
                    const pct = ((currentNum - defaultNum) / defaultNum * 100).toFixed(1);
                    changeIndicator = Number(pct) > 0 ? `+${pct}%` : `${pct}%`;
                  }
                }

                return (
                  <TableRow key={item.id} className={changed ? 'bg-amber-50 dark:bg-amber-950/10' : ''}>
                    <TableCell className="text-[9px]">
                      <div className="font-mono">{item.configKey}</div>
                      {item.label && (
                        <div className="text-[8px] text-muted-foreground">{item.label}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-[9px] font-mono text-muted-foreground">
                      {defaultStr} {item.unit && <span className="text-[7px]">{item.unit}</span>}
                    </TableCell>
                    <TableCell className="text-[9px] font-mono">
                      {changed ? (
                        <span className="text-amber-600 font-semibold">{currentStr}</span>
                      ) : (
                        <span>{currentStr}</span>
                      )}
                      {item.unit && <span className="text-[7px] ml-0.5">{item.unit}</span>}
                    </TableCell>
                    <TableCell className="text-[9px]">
                      {changed ? (
                        changeIndicator ? (
                          <Badge variant="outline" className={`text-[7px] ${
                            changeIndicator.startsWith('+') ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'
                          }`}>
                            {changeIndicator}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[7px] text-amber-600 border-amber-300">已改</Badge>
                        )
                      ) : (
                        <span className="text-[8px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {changed && (
                        <Button variant="ghost" size="sm" className="h-4 text-[8px] px-1"
                          onClick={() => onReset(item.id)}>
                          还原
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </PageCard>
    </div>
  );
}
