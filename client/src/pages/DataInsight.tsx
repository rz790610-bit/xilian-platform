/**
 * 数据洞察页面
 * 数据质量分析、分布统计、趋势可视化
 *
 * 数据源: 待接入后端 API（数据集管理服务）
 * 当前状态: 优雅降级 — 显示空状态 + 连接提示
 */

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { RefreshCw, Download, CheckCircle, AlertTriangle, XCircle, Info, Database, PlugZap, Upload } from 'lucide-react';
import { useToast } from '@/components/common/Toast';

export default function DataInsight() {
  const toast = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [qualityResult, setQualityResult] = useState<any>(null);

  // ─── 数据状态（从后端获取，当前为空） ───
  const [files] = useState<any[]>([]);
  const [stats] = useState({ total: 0, size: '0 B', labeled: 0, rate: 0 });
  const [typeDistribution] = useState<any[]>([]);
  const [labelDistribution] = useState<any[]>([]);
  const [conditionStats] = useState<any[]>([]);

  const hasData = files.length > 0;

  // 运行质量检查
  const runQualityCheck = () => {
    if (!hasData) {
      toast.info('请先上传数据集后再运行质量检查');
      return;
    }
    setIsChecking(true);
    // 实际应调用后端 API
    toast.info('数据质量检查服务尚未连接');
    setIsChecking(false);
  };

  // 导出报告
  const exportReport = () => {
    if (!hasData) {
      toast.info('暂无数据可导出');
      return;
    }
    const report = {
      generatedAt: new Date().toISOString(),
      stats,
      typeDistribution,
      labelDistribution,
      conditionStats,
      qualityResult
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data_insight_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('报告已导出');
  };

  const handleConnectDataSource = () => {
    toast.info('请在「系统设置 > 数据源」中配置数据集管理服务连接');
  };

  return (
    <MainLayout title="数据洞察">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">数据洞察</h2>
            <p className="text-muted-foreground">数据质量分析、分布统计、趋势可视化</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleConnectDataSource}>
              <PlugZap className="w-4 h-4 mr-2" />
              连接数据源
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新数据
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <StatCard value={stats.total || '—'} label="数据总量" icon="📊" />
          <StatCard value={stats.size || '—'} label="存储占用" icon="💾" />
          <StatCard value={stats.labeled || '—'} label="已标注" icon="✅" />
          <StatCard value={stats.rate ? `${stats.rate}%` : '—'} label="标注率" icon="📈" />
        </div>

        {hasData ? (
          <>
            {/* Distribution charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              <PageCard title="文件类型分布" icon="📊">
                <div className="space-y-4">
                  {typeDistribution.map((item) => (
                    <div key={item.type} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{item.type}</span>
                        <span className="text-muted-foreground">{item.count} 个 ({item.percent}%)</span>
                      </div>
                      <div className="h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", item.color)}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>

              <PageCard title="标注状态分布" icon="🏷️">
                <div className="space-y-4">
                  {labelDistribution.map((item) => (
                    <div key={item.status} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{item.status}</span>
                        <span className="text-muted-foreground">{item.count} 个 ({item.percent}%)</span>
                      </div>
                      <div className="h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", item.color)}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              <PageCard title="工况类型统计" icon="📋">
                <div className="space-y-4">
                  {conditionStats.map((item) => (
                    <div key={item.condition} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className={cn("w-3 h-3 rounded-full", item.color)} />
                          {item.condition}
                        </span>
                        <span className="text-muted-foreground">{item.count} 个 ({item.percent}%)</span>
                      </div>
                      <div className="h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all", item.color)}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PageCard>

              <PageCard
                title="数据质量检查"
                icon="🔍"
                action={
                  <Button size="sm" onClick={runQualityCheck} disabled={isChecking}>
                    {isChecking ? '检查中...' : '开始检查'}
                  </Button>
                }
              >
                {qualityResult ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-secondary rounded-xl">
                      <div className="text-4xl font-bold text-primary">{qualityResult.overall}</div>
                      <div>
                        <div className="font-medium">总体评分</div>
                        <div className="text-sm text-muted-foreground">数据质量良好</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {(qualityResult.items || []).map((item: any) => (
                        <div key={item.name} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {item.status === 'good' ? (
                              <CheckCircle className="w-5 h-5 text-success" />
                            ) : item.status === 'warning' ? (
                              <AlertTriangle className="w-5 h-5 text-warning" />
                            ) : (
                              <XCircle className="w-5 h-5 text-danger" />
                            )}
                            <div>
                              <div className="font-medium text-sm">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{item.message}</div>
                            </div>
                          </div>
                          <div className="text-lg font-semibold">{item.score}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>点击"开始检查"分析数据质量</p>
                  </div>
                )}
              </PageCard>
            </div>

            {/* File list */}
            <PageCard
              title="文件详情列表"
              icon="📁"
              action={
                <Button variant="secondary" size="sm" onClick={exportReport}>
                  <Download className="w-4 h-4 mr-2" />
                  导出报告
                </Button>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">文件名</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">类型</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">大小</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">状态</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">标注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file: any, index: number) => (
                      <tr key={index} className="border-b border-border/50 hover:bg-secondary/50">
                        <td className="py-3 px-4 font-medium">{file.name}</td>
                        <td className="py-3 px-4">{file.type}</td>
                        <td className="py-3 px-4">{file.size}</td>
                        <td className="py-3 px-4">
                          <Badge variant={
                            file.status === 'labeled' ? 'success' :
                            file.status === 'in_progress' ? 'warning' :
                            'default'
                          }>
                            {file.status === 'labeled' ? '已标注' :
                             file.status === 'in_progress' ? '进行中' :
                             '待标注'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {file.label !== '-' ? (
                            <Badge variant={
                              file.label === '正常' ? 'success' :
                              file.label === '预警' ? 'warning' :
                              'danger'
                            }>
                              {file.label}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PageCard>
          </>
        ) : (
          /* ─── 空状态 ─── */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
            <PageCard title="数据概览" icon="📊">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Database className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">暂无数据集</h3>
                <p className="text-xs text-muted-foreground max-w-sm mb-4">
                  连接数据源或上传数据集后，文件类型分布、标注状态、工况统计等洞察将自动生成。
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleConnectDataSource}>
                    <PlugZap className="h-4 w-4 mr-1" />
                    连接数据源
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toast.info('上传功能即将开放')}>
                    <Upload className="h-4 w-4 mr-1" />
                    上传数据
                  </Button>
                </div>
              </div>
            </PageCard>

            <PageCard
              title="数据质量检查"
              icon="🔍"
              action={
                <Button size="sm" onClick={runQualityCheck} disabled={isChecking || !hasData}>
                  {isChecking ? '检查中...' : '开始检查'}
                </Button>
              }
            >
              <div className="text-center py-16 text-muted-foreground">
                <Info className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-sm font-medium mb-1">等待数据</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  上传数据集后，可运行质量检查分析数据完整性、格式一致性、标注质量等指标。
                </p>
              </div>
            </PageCard>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
