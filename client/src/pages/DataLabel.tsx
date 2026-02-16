import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { StatCard } from '@/components/common/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { 
  RefreshCw, Upload, Download, Tag, FileText, Check, Clock, 
  Trash2, Play, ChevronRight, Wand2, BarChart3
} from 'lucide-react';
import { useToast } from '@/components/common/Toast';

// 标注文件类型
interface LabelFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadTime: string;
  status: 'pending' | 'done' | 'in_progress';
  labels?: LabelData[];
}

// 标注数据类型
interface LabelData {
  id: string;
  type: string;
  value: string;
  confidence?: number;
  createdAt: string;
}

// 标签类型
interface LabelType {
  id: string;
  name: string;
  color: string;
  description: string;
}

export default function DataLabel() {
  const toast = useToast();
  const [files, setFiles] = useState<LabelFile[]>([
    { id: '1', name: 'bearing_vibration_001.csv', type: 'csv', size: '2.3 MB', uploadTime: '2024-01-20 10:30', status: 'done', labels: [
      { id: 'l1', type: 'condition', value: '正常', confidence: 0.95, createdAt: '2024-01-20 11:00' }
    ]},
    { id: '2', name: 'motor_temp_data.csv', type: 'csv', size: '1.8 MB', uploadTime: '2024-01-20 11:15', status: 'pending' },
    { id: '3', name: 'pump_sensor_log.csv', type: 'csv', size: '5.2 MB', uploadTime: '2024-01-19 14:20', status: 'in_progress', labels: [
      { id: 'l2', type: 'condition', value: '异常', confidence: 0.88, createdAt: '2024-01-19 15:00' }
    ]},
    { id: '4', name: 'gearbox_analysis.xlsx', type: 'xlsx', size: '3.1 MB', uploadTime: '2024-01-18 09:45', status: 'pending' },
    { id: '5', name: 'equipment_report.pdf', type: 'pdf', size: '1.2 MB', uploadTime: '2024-01-17 16:30', status: 'done', labels: [
      { id: 'l3', type: 'document', value: '维护报告', createdAt: '2024-01-17 17:00' }
    ]},
  ]);
  
  const [selectedFile, setSelectedFile] = useState<LabelFile | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showStatsDialog, setShowStatsDialog] = useState(false);
  
  // 标签类型
  const [labelTypes] = useState<LabelType[]>([
    { id: 'normal', name: '正常', color: 'bg-success', description: '设备运行正常' },
    { id: 'warning', name: '预警', color: 'bg-warning', description: '需要关注' },
    { id: 'fault', name: '故障', color: 'bg-danger', description: '设备故障' },
    { id: 'unknown', name: '未知', color: 'bg-muted', description: '无法判断' },
  ]);
  
  // 当前标注表单
  const [labelForm, setLabelForm] = useState({
    condition: '',
    faultType: '',
    severity: 'low',
    notes: ''
  });

  // 统计数据
  const stats = {
    total: files.length,
    done: (files || []).filter(f => f.status === 'done').length,
    pending: (files || []).filter(f => f.status === 'pending').length,
    inProgress: (files || []).filter(f => f.status === 'in_progress').length,
    progress: Math.round((files.filter(f => f.status === 'done').length / files.length) * 100)
  };

  // 过滤文件列表
  const filteredFiles = filterStatus === 'all' 
    ? files 
    : (files || []).filter(f => f.status === filterStatus);

  // 选择文件进行标注
  const selectFile = (file: LabelFile) => {
    setSelectedFile(file);
    // 如果有已有标注，加载到表单
    if (file.labels && file.labels.length > 0) {
      const lastLabel = file.labels[file.labels.length - 1];
      setLabelForm({
        condition: lastLabel.value,
        faultType: '',
        severity: 'low',
        notes: ''
      });
    } else {
      setLabelForm({
        condition: '',
        faultType: '',
        severity: 'low',
        notes: ''
      });
    }
  };

  // 保存标注
  const saveLabel = () => {
    if (!selectedFile) return;
    if (!labelForm.condition) {
      toast.error('请选择工况类型');
      return;
    }
    
    const newLabel: LabelData = {
      id: `label_${Date.now()}`,
      type: 'condition',
      value: labelForm.condition,
      confidence: 1.0,
      createdAt: new Date().toISOString()
    };
    
    setFiles(prev => prev.map(f => {
      if (f.id === selectedFile.id) {
        return {
          ...f,
          status: 'done' as const,
          labels: [...(f.labels || []), newLabel]
        };
      }
      return f;
    }));
    
    toast.success('标注已保存');
    
    // 自动选择下一个待标注文件
    const nextPending = (files || []).find(f => f.id !== selectedFile.id && f.status === 'pending');
    if (nextPending) {
      selectFile(nextPending);
    } else {
      setSelectedFile(null);
    }
  };

  // 跳过当前文件
  const skipFile = () => {
    if (!selectedFile) return;
    const nextPending = (files || []).find(f => f.id !== selectedFile.id && f.status === 'pending');
    if (nextPending) {
      selectFile(nextPending);
    } else {
      setSelectedFile(null);
      toast.info('没有更多待标注文件');
    }
  };

  // AI 自动标注
  const autoLabel = async () => {
    toast.info('AI 自动标注中...');
    
    // 模拟 AI 标注过程
    setTimeout(() => {
      const pendingFiles = (files || []).filter(f => f.status === 'pending');
      const conditions = ['正常', '预警', '故障'];
      
      setFiles(prev => prev.map(f => {
        if (f.status === 'pending') {
          const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];
          const confidence = 0.7 + Math.random() * 0.25;
          return {
            ...f,
            status: 'done' as const,
            labels: [{
              id: `auto_${Date.now()}_${f.id}`,
              type: 'condition',
              value: randomCondition,
              confidence: parseFloat(confidence.toFixed(2)),
              createdAt: new Date().toISOString()
            }]
          };
        }
        return f;
      }));
      
      toast.success(`AI 已自动标注 ${pendingFiles.length} 个文件`);
    }, 2000);
  };

  // 导出标注数据
  const exportLabels = () => {
    const labeledData = (files || []).filter(f => f.labels && f.labels.length > 0).map(f => ({
      filename: f.name,
      type: f.type,
      labels: f.labels,
      status: f.status
    }));
    
    const blob = new Blob([JSON.stringify(labeledData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `labels_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('标注数据已导出');
  };

  // 导入标注
  const importLabels = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target?.result as string);
          toast.success(`已导入 ${data.length} 条标注数据`);
        } catch {
          toast.error('导入失败：文件格式错误');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // 删除标注
  const deleteLabel = (fileId: string) => {
    if (!confirm('确定要删除此文件的标注吗？')) return;
    
    setFiles(prev => prev.map(f => {
      if (f.id === fileId) {
        return { ...f, status: 'pending' as const, labels: [] };
      }
      return f;
    }));
    
    if (selectedFile?.id === fileId) {
      setSelectedFile(null);
    }
    
    toast.success('标注已删除');
  };

  return (
    <MainLayout title="数据标注">
      <div className="animate-fade-up">
        {/* Page header */}
        <div className="flex justify-between items-start mb-7">
          <div>
            <h2 className="text-2xl font-bold mb-2">🏷️ 数据标注</h2>
            <p className="text-muted-foreground">为训练数据添加标签，支持手动和AI自动标注</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" size="sm" onClick={() => setShowStatsDialog(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              标注统计
            </Button>
            <Button variant="secondary" size="sm" onClick={importLabels}>
              <Upload className="w-4 h-4 mr-2" />
              导入标注
            </Button>
            <Button size="sm" onClick={exportLabels}>
              <Download className="w-4 h-4 mr-2" />
              导出标注
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-5">
          <StatCard value={stats.total} label="总文件" icon="📁" />
          <StatCard value={stats.done} label="已标注" icon="✅" />
          <StatCard value={stats.pending} label="待标注" icon="⏳" />
          <StatCard value={stats.inProgress} label="进行中" icon="🔄" />
          <StatCard value={`${stats.progress}%`} label="完成进度" icon="📈" />
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* File list */}
          <PageCard
            title="待标注文件"
            icon="📁"
            action={
              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="pending">待标注</SelectItem>
                    <SelectItem value="in_progress">进行中</SelectItem>
                    <SelectItem value="done">已完成</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => toast.info('已刷新文件列表')}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            }
          >
            <div className="max-h-[500px] overflow-y-auto space-y-2">
              {filteredFiles.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无数据，请先在数据管理中上传文件</p>
                </div>
              ) : (
                (filteredFiles || []).map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all",
                      "hover:bg-secondary",
                      selectedFile?.id === file.id && "bg-secondary ring-1 ring-primary"
                    )}
                    onClick={() => selectFile(file)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
                        {file.type === 'csv' && '📊'}
                        {file.type === 'xlsx' && '📗'}
                        {file.type === 'pdf' && '📄'}
                        {!['csv', 'xlsx', 'pdf'].includes(file.type) && '📁'}
                      </div>
                      <div>
                        <div className="font-medium text-sm">{file.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {file.size} | {file.uploadTime}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant={
                          file.status === 'done' ? 'success' : 
                          file.status === 'in_progress' ? 'warning' : 
                          'default'
                        }
                      >
                        {file.status === 'done' ? '已完成' : 
                         file.status === 'in_progress' ? '进行中' : 
                         '待标注'}
                      </Badge>
                      {file.status === 'done' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-danger hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLabel(file.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </PageCard>

          {/* Label panel */}
          <PageCard title="标注面板" icon="🏷️">
            {selectedFile ? (
              <div className="space-y-5">
                {/* File info */}
                <div className="p-4 bg-secondary rounded-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-background rounded-lg flex items-center justify-center text-2xl">
                      {selectedFile.type === 'csv' && '📊'}
                      {selectedFile.type === 'xlsx' && '📗'}
                      {selectedFile.type === 'pdf' && '📄'}
                    </div>
                    <div>
                      <div className="font-semibold">{selectedFile.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {selectedFile.size} | {selectedFile.type.toUpperCase()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Existing labels */}
                  {selectedFile.labels && selectedFile.labels.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <div className="text-sm text-muted-foreground mb-2">已有标注：</div>
                      {(selectedFile.labels || []).map((label) => (
                        <div key={label.id} className="flex items-center gap-2">
                          <Badge variant={
                            label.value === '正常' ? 'success' :
                            label.value === '预警' ? 'warning' :
                            label.value === '故障' ? 'danger' :
                            'default'
                          }>
                            {label.value}
                          </Badge>
                          {label.confidence && (
                            <span className="text-xs text-muted-foreground">
                              置信度: {(label.confidence * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Label form */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">工况类型 *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {(labelTypes || []).map((type) => (
                        <Button
                          key={type.id}
                          variant={labelForm.condition === type.name ? 'default' : 'secondary'}
                          size="sm"
                          className={cn(
                            "w-full",
                            labelForm.condition === type.name && type.color
                          )}
                          onClick={() => setLabelForm(prev => ({ ...prev, condition: type.name }))}
                        >
                          {type.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">故障类型（可选）</label>
                    <Select 
                      value={labelForm.faultType} 
                      onValueChange={(v) => setLabelForm(prev => ({ ...prev, faultType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择故障类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bearing">轴承故障</SelectItem>
                        <SelectItem value="gear">齿轮故障</SelectItem>
                        <SelectItem value="imbalance">不平衡</SelectItem>
                        <SelectItem value="misalignment">不对中</SelectItem>
                        <SelectItem value="looseness">松动</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">严重程度</label>
                    <Select 
                      value={labelForm.severity} 
                      onValueChange={(v) => setLabelForm(prev => ({ ...prev, severity: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">轻微</SelectItem>
                        <SelectItem value="medium">中等</SelectItem>
                        <SelectItem value="high">严重</SelectItem>
                        <SelectItem value="critical">紧急</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">备注</label>
                    <Textarea
                      value={labelForm.notes}
                      onChange={(e) => setLabelForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="添加备注信息..."
                      rows={3}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={saveLabel}>
                    <Check className="w-4 h-4 mr-2" />
                    保存标注
                  </Button>
                  <Button variant="secondary" onClick={skipFile}>
                    跳过
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Tag className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">请从左侧选择要标注的文件</p>
                <p className="text-sm">或使用 AI 自动标注功能</p>
              </div>
            )}
          </PageCard>
        </div>

        {/* Quick actions */}
        <PageCard title="快捷操作" icon="⚡" className="mt-5">
          <div className="flex gap-3 flex-wrap">
            <Button onClick={autoLabel}>
              <Wand2 className="w-4 h-4 mr-2" />
              AI 自动标注
            </Button>
            <Button variant="secondary" onClick={exportLabels}>
              <Download className="w-4 h-4 mr-2" />
              导出标注数据
            </Button>
            <Button variant="secondary" onClick={importLabels}>
              <Upload className="w-4 h-4 mr-2" />
              导入标注
            </Button>
            <Button variant="secondary" onClick={() => setShowStatsDialog(true)}>
              <BarChart3 className="w-4 h-4 mr-2" />
              标注统计
            </Button>
          </div>
        </PageCard>
      </div>

      {/* Stats dialog */}
      <Dialog open={showStatsDialog} onOpenChange={setShowStatsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>📊 标注统计</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Overview */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                <div className="text-sm text-muted-foreground">总文件</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-success">{stats.done}</div>
                <div className="text-sm text-muted-foreground">已完成</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold text-warning">{stats.pending}</div>
                <div className="text-sm text-muted-foreground">待标注</div>
              </div>
              <div className="p-4 bg-secondary rounded-xl text-center">
                <div className="text-2xl font-bold">{stats.progress}%</div>
                <div className="text-sm text-muted-foreground">完成率</div>
              </div>
            </div>

            {/* Label distribution */}
            <div>
              <h4 className="font-medium mb-3">标注分布</h4>
              <div className="space-y-2">
                {['正常', '预警', '故障', '未知'].map((label) => {
                  const count = (files || []).filter(f => 
                    f.labels?.some(l => l.value === label)
                  ).length;
                  const percent = stats.done > 0 ? (count / stats.done * 100) : 0;
                  
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <span className="w-16 text-sm">{label}</span>
                      <div className="flex-1 h-6 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all",
                            label === '正常' && "bg-success",
                            label === '预警' && "bg-warning",
                            label === '故障' && "bg-danger",
                            label === '未知' && "bg-muted"
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="w-12 text-sm text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <h4 className="font-medium mb-3">整体进度</h4>
              <div className="h-4 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all"
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
              <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                <span>已完成 {stats.done} 个</span>
                <span>剩余 {stats.pending + stats.inProgress} 个</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
