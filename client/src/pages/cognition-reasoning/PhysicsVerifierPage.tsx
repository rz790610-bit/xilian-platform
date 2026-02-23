/**
 * ============================================================================
 * 物理验证器 — 独立页面
 * ============================================================================
 * 展示物理约束验证配置、违规统计、per-device-type 配置
 * 后端路由: evoCognition.listFormulas / .compute / .computeBatch
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

// ============================================================================
// 类型
// ============================================================================
interface PhysicsFormula {
  id: string;
  name: string;
  expression: string;
  domain: string;
  variables: string[];
  constraints: { min?: number; max?: number; unit: string }[];
  description: string;
  enabled: boolean;
}

export function PhysicsVerifierContent() {
  const [activeTab, setActiveTab] = useState('formulas');
  const [domainFilter, setDomainFilter] = useState('all');

  // 物理公式列表
  const formulasQuery = trpc.evoCognition.physics.listFormulas.useQuery(undefined, {
    refetchInterval: 30000, retry: 2
  });

  const formulas = (formulasQuery.data as unknown as PhysicsFormula[]) ?? [];

  const filteredFormulas = useMemo(() => {
    if (domainFilter === 'all') return formulas;
    return formulas.filter(f => f.domain === domainFilter);
  }, [formulas, domainFilter]);

  const domains = useMemo(() => {
    const set = new Set(formulas.map(f => f.domain));
    return ['all', ...Array.from(set)];
  }, [formulas]);

  // 统计
  const totalEnabled = formulas.filter(f => f.enabled).length;
  const domainCount = new Set(formulas.map(f => f.domain)).size;

  return (
    <div className="space-y-3">
      {/* 顶部统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard value={formulas.length} label="物理公式总数" icon="📐" />
        <StatCard value={totalEnabled} label="已启用" icon="✅" />
        <StatCard value={domainCount} label="覆盖域" icon="🔬" />
        <StatCard value={formulas.reduce((sum, f) => sum + f.variables.length, 0)} label="总变量数" icon="📊" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="formulas" className="text-xs">物理公式</TabsTrigger>
          <TabsTrigger value="constraints" className="text-xs">约束配置</TabsTrigger>
          <TabsTrigger value="violations" className="text-xs">违规记录</TabsTrigger>
        </TabsList>

        {/* 物理公式 Tab */}
        <TabsContent value="formulas">
          <PageCard title="物理公式库" icon="📐">
            <div className="flex items-center gap-2 mb-2">
              <select
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                className="h-7 text-xs bg-background border border-border rounded px-2"
              >
                {domains.map(d => (
                  <option key={d} value={d}>{d === 'all' ? '全部域' : d}</option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground ml-auto">
                共 {filteredFormulas.length} 个公式
              </span>
            </div>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">名称</TableHead>
                    <TableHead className="text-[10px]">表达式</TableHead>
                    <TableHead className="text-[10px]">域</TableHead>
                    <TableHead className="text-[10px]">变量</TableHead>
                    <TableHead className="text-[10px]">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFormulas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[10px] text-muted-foreground py-4">
                        暂无物理公式
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFormulas.map((formula) => (
                      <TableRow key={formula.id}>
                        <TableCell className="text-[10px] font-medium">{formula.name}</TableCell>
                        <TableCell className="text-[10px] font-mono max-w-[200px] truncate">{formula.expression}</TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant="outline" className="text-[10px]">{formula.domain}</Badge>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex flex-wrap gap-0.5">
                            {formula.variables.slice(0, 3).map(v => (
                              <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>
                            ))}
                            {formula.variables.length > 3 && (
                              <Badge variant="secondary" className="text-[10px]">+{formula.variables.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[10px]">
                          <Badge variant={formula.enabled ? 'default' : 'secondary'} className="text-[10px]">
                            {formula.enabled ? '启用' : '禁用'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </PageCard>
        </TabsContent>

        {/* 约束配置 Tab */}
        <TabsContent value="constraints">
          <PageCard title="物理约束范围" icon="⚖️">
            <div className="space-y-2">
              {formulas.filter(f => f.constraints && f.constraints.length > 0).slice(0, 10).map(formula => (
                <div key={formula.id} className="p-2 rounded bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium">{formula.name}</span>
                    <Badge variant="outline" className="text-[10px]">{formula.domain}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                    {formula.constraints.map((c, idx) => (
                      <div key={idx} className="text-[10px] p-1 rounded bg-background/50">
                        <span className="text-muted-foreground">{formula.variables[idx] ?? `var${idx}`}: </span>
                        <span className="font-mono">
                          [{c.min ?? '-∞'}, {c.max ?? '+∞'}] {c.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {formulas.filter(f => f.constraints?.length > 0).length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-[10px]">暂无约束配置</div>
              )}
            </div>
          </PageCard>
        </TabsContent>

        {/* 违规记录 Tab */}
        <TabsContent value="violations">
          <PageCard title="物理约束违规记录" icon="⚠️">
            <div className="text-center py-8 text-muted-foreground text-[10px]">
              <p>物理验证器运行时自动检测约束违规</p>
              <p className="mt-1">违规记录通过认知会话的推理链路追溯查看</p>
              <Button variant="outline" size="sm" className="mt-2 text-xs h-7" onClick={() => toast.info('请前往「认知中枢 → 认知引擎 → 推理追踪」查看详细违规记录')}>
                查看推理追踪
              </Button>
            </div>
          </PageCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PhysicsVerifierPage() {
  return (
    <MainLayout title="物理验证器" subtitle="物理约束验证与违规检测">
      <PhysicsVerifierContent />
    </MainLayout>
  );
}
