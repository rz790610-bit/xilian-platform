import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { RefreshCw, Download, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import { useToast } from '@/components/common/Toast';

export default function DataInsight() {
  const toast = useToast();
  const [isChecking, setIsChecking] = useState(false);
  const [qualityResult, setQualityResult] = useState<any>(null);

  // 统计数据
  const stats = {
    total: 156,
    size: '2.4 GB',
    labeled: 89,
    rate: 57
  };

  // 文件类型分布
  const typeDistribution = [
    { type: 'CSV', count: 68, percent: 44, color: 'bg-chart-1' },
    { type: 'Excel', count: 35, percent: 22, color: 'bg-chart-2' },
    { type: 'PDF', count: 28, percent: 18, color: 'bg-chart-3' },
    { type: '图片', count: 15, percent: 10, color: 'bg-chart-4' },
    { type: '其他', count: 10, percent: 6, color: 'bg-chart-5' },
  ];

  // 标注状态分布
  const labelDistribution = [
    { status: '已标注', count: 89, percent: 57, color: 'bg-success' },
    { status: '待标注', count: 45, percent: 29, color: 'bg-warning' },
    { status: '进行中', count: 22, percent: 14, color: 'bg-primary' },
  ];

  // 工况类型统计
  const conditionStats = [
    { condition: '正常', count: 52, percent: 58, color: 'bg-success' },
    { condition: '预警', count: 23, percent: 26, color: 'bg-warning' },
    { condition: '故障', count: 14, percent: 16, color: 'bg-danger' },
  ];

  // 文件列表
  const files = [
    { name: 'bearing_data_001.csv', type: 'CSV', size: '2.3 MB', status: 'labeled', label: '正常' },
    { name: 'motor_vibration.xlsx', type: 'Excel', size: '1.8 MB', status: 'labeled', label: '预警' },
    { name: 'pump_analysis.csv', type: 'CSV', size: '5.2 MB', status: 'pending', label: '-' },
    { name: 'gearbox_report.pdf', type: 'PDF', size: '3.1 MB', status: 'labeled', label: '故障' },
    { name: 'sensor_log_202401.csv', type: 'CSV', size: '8.5 MB', status: 'in_progress', label: '-' },
  ];

  // 运行质量检查
  const runQualityCheck = () => {
    setIsChecking(true);
    setTimeout(() => {
      setQualityResult({
        overall: 85,
        items: [
          { name: '数据完整性', score: 92, status: 'good', message: '数据完整，无缺失值' },
          { name: '格式一致性', score: 88, status: 'good', message: '格式基本一致' },
          { name: '标注质量', score: 75, status: 'warning', message: '部分标注需要复核' },
          { name: '数据平衡性', score: 68, status: 'warning', message: '故障样本较少，建议补充' },
          { name: '时间连续性', score: 95, status: 'good', message: '时间序列连续' },
        ]
      });
      setIsChecking(false);
      toast.success('质量检查完成');
    }, 2000);
  };

  // 导出报告
  const exportReport = () => {
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

  return (
    <MainLayout title="数据洞察">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">📈 数据洞察</h2>
            <p className="text-muted-foreground">数据质量分析、分布统计、趋势可视化</p>
          </div>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新数据
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <StatCard value={stats.total} label="数据总量" icon="📊" />
          <StatCard value={stats.size} label="存储占用" icon="💾" />
          <StatCard value={stats.labeled} label="已标注" icon="✅" />
          <StatCard value={`${stats.rate}%`} label="标注率" icon="📈" />
        </div>

        {/* Distribution charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
          {/* File type distribution */}
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

          {/* Label status distribution */}
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
          {/* Condition stats */}
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

          {/* Quality check */}
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
                {/* Overall score */}
                <div className="flex items-center gap-4 p-4 bg-secondary rounded-xl">
                  <div className="text-4xl font-bold text-primary">{qualityResult.overall}</div>
                  <div>
                    <div className="font-medium">总体评分</div>
                    <div className="text-sm text-muted-foreground">数据质量良好</div>
                  </div>
                </div>
                
                {/* Detail items */}
                <div className="space-y-3">
                  {qualityResult.items.map((item: any) => (
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
                {files.map((file, index) => (
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
      </div>
    </MainLayout>
  );
}
