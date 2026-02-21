/**
 * ============================================================================
 * Phase 2 — 经验池管理
 * ============================================================================
 * 三层记忆（情景/语义/程序）查看、搜索、统计
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

// ============================================================================
// 常量
// ============================================================================

const typeLabels: Record<string, string> = {
  episodic: '情景记忆',
  semantic: '语义记忆',
  procedural: '程序记忆',
};

const typeColors: Record<string, string> = {
  episodic: 'bg-blue-500/20 text-blue-400',
  semantic: 'bg-emerald-500/20 text-emerald-400',
  procedural: 'bg-amber-500/20 text-amber-400',
};

const domainLabels: Record<string, string> = {
  bearing_fault: '轴承故障',
  gear_damage: '齿轮损伤',
  motor_degradation: '电机退化',
  structural_fatigue: '结构疲劳',
  hydraulic_leak: '液压泄漏',
  wire_rope_break: '钢丝绳断股',
  pump_cavitation: '泵气蚀',
  insulation_aging: '绝缘老化',
};

// ============================================================================
// 主组件
// ============================================================================

export function ExperiencePoolView() {
  const [typeFilter, setTypeFilter] = useState<'all' | 'episodic' | 'semantic' | 'procedural'>('all');
  const [domainFilter, setDomainFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const poolQuery = trpc.evoCognition.reasoningEngine.getExperiencePool.useQuery(
    { type: typeFilter, domain: domainFilter || undefined, limit: 50 },
    { retry: 2, refetchInterval: 15000 }
  );

  const searchResultsQuery = trpc.evoCognition.reasoningEngine.searchExperience.useQuery(
    { query: searchQuery, topK: 10 },
    { enabled: isSearching && searchQuery.length > 0, retry: 2 }
  );

  const data = poolQuery.data;
  const searchResults = searchResultsQuery.data;

  if (poolQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-muted-foreground">加载经验池...</span>
      </div>
    );
  }

  if (!data) return <div className="text-center py-8 text-xs text-muted-foreground">无法加载经验池数据</div>;

  return (
    <div className="space-y-3">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <StatCard value={data.stats.total} label="总经验数" icon="📚" />
        <StatCard value={data.stats.episodic} label="情景记忆" icon="🎬" />
        <StatCard value={data.stats.semantic} label="语义记忆" icon="📖" />
        <StatCard value={data.stats.procedural} label="程序记忆" icon="📋" />
        <StatCard value={`${(data.stats.avgConfidence * 100).toFixed(0)}%`} label="平均置信度" icon="🎯" />
        <StatCard value={data.stats.totalHits} label="总命中次数" icon="🔥" />
      </div>

      {/* 三层记忆容量可视化 */}
      <PageCard title="三层记忆容量" icon="🧠">
        <div className="space-y-2">
          {(['episodic', 'semantic', 'procedural'] as const).map(type => {
            const count = data.stats[type];
            const capacity = type === 'episodic' ? 1000 : type === 'semantic' ? 500 : 200;
            const pct = Math.round((count / capacity) * 100);
            return (
              <div key={type} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{typeLabels[type]}</span>
                  <span className="text-[10px] text-muted-foreground">{count} / {capacity} ({pct}%)</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </PageCard>

      {/* 搜索栏 */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="搜索经验（关键词：轴承、振动、齿轮...）"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setIsSearching(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && searchQuery) setIsSearching(true); }}
          className="h-7 text-xs flex-1"
        />
        <Button size="sm" className="h-7 text-xs" onClick={() => { if (searchQuery) setIsSearching(true); }}>搜索</Button>
        {isSearching && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setIsSearching(false); setSearchQuery(''); }}>清除</Button>}
        <div className="w-px h-5 bg-border" />
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="episodic">情景记忆</SelectItem>
            <SelectItem value="semantic">语义记忆</SelectItem>
            <SelectItem value="procedural">程序记忆</SelectItem>
          </SelectContent>
        </Select>
        <Select value={domainFilter || 'all'} onValueChange={(v) => setDomainFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue placeholder="异常域" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部域</SelectItem>
            {Object.entries(domainLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 搜索结果 */}
      {isSearching && searchResults && searchResults.length > 0 && (
        <PageCard title={`搜索结果 (${searchResults.length})`} icon="🔍">
          <div className="space-y-1.5">
            {searchResults.map((r: any) => (
              <div key={r.id} className="flex items-start gap-2 py-1.5 border-b border-border last:border-0">
                <Badge className={`text-[10px] shrink-0 ${typeColors[r.type]}`}>{typeLabels[r.type]}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">{r.description}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span>设备: {r.deviceCode}</span>
                    <span>置信度: {(r.confidence * 100).toFixed(0)}%</span>
                    <span>匹配度: {(r.score * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PageCard>
      )}

      {/* 经验列表 */}
      <PageCard title={`经验记录 (${data.experiences.length})`} icon="📋" noPadding>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] py-1 w-[60px]">类型</TableHead>
              <TableHead className="text-[10px] py-1 w-[80px]">异常域</TableHead>
              <TableHead className="text-[10px] py-1">描述</TableHead>
              <TableHead className="text-[10px] py-1 w-[60px]">设备</TableHead>
              <TableHead className="text-[10px] py-1 w-[60px]">置信度</TableHead>
              <TableHead className="text-[10px] py-1 w-[50px]">命中</TableHead>
              <TableHead className="text-[10px] py-1 w-[80px]">最近访问</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.experiences.map((exp: any) => (
              <TableRow key={exp.id}>
                <TableCell className="py-1">
                  <Badge className={`text-[10px] ${typeColors[exp.type]}`}>{typeLabels[exp.type]}</Badge>
                </TableCell>
                <TableCell className="text-[10px] py-1">{domainLabels[exp.domain] || exp.domain}</TableCell>
                <TableCell className="text-[10px] py-1 max-w-[300px] truncate">{exp.description}</TableCell>
                <TableCell className="text-[10px] font-mono py-1">{exp.deviceCode}</TableCell>
                <TableCell className="py-1">
                  <div className="flex items-center gap-1">
                    <Progress value={exp.confidence * 100} className="h-1 w-10" />
                    <span className="text-[10px] font-mono">{(exp.confidence * 100).toFixed(0)}%</span>
                  </div>
                </TableCell>
                <TableCell className="text-[10px] font-mono py-1">{exp.hitCount}</TableCell>
                <TableCell className="text-[10px] text-muted-foreground py-1">{new Date(exp.lastAccessedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PageCard>
    </div>
  );
}
