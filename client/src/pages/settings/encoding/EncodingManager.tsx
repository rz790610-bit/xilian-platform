/**
 * 编码管理 — /settings/encoding
 *
 * 四个 Tab：设备编码 / 部件编码 / 部门编码 / 故障编码
 *
 * 功能：
 *   - 查看各级编码值及其含义
 *   - 新增编码值（自动校验格式）
 *   - 停用编码值（标记 inactive，不删除）
 *   - 格式规则只读展示
 */
import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageCard } from '@/components/common/PageCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/common/Toast';
import {
  Plus,
  Search,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
  CheckCircle,
  XCircle,
  Hash,
} from 'lucide-react';

// ────────────────────────────────────────────────────
// 编码规则定义（只读，不可界面修改）
// ────────────────────────────────────────────────────

interface EncodingRule {
  type: string;
  label: string;
  format: string;
  example: string;
  regex: string;
  levels: Array<{
    level: number;
    name: string;
    description: string;
  }>;
}

const ENCODING_RULES: EncodingRule[] = [
  {
    type: 'device',
    label: '设备主体编码',
    format: '[一级][二级]-[三级][四级流水号]',
    example: 'Mgj-XC001',
    regex: '^[MAFW][a-z]{2}-[A-Z]{2}\\d{3}$',
    levels: [
      { level: 1, name: '一级（资产类别）', description: 'M 主要生产设备 / A 辅助设备 / F 设施 / W 无形资产' },
      { level: 2, name: '二级（设备大类）', description: '2 位小写字母，如 gj=固机, lj=流机, lc=流程' },
      { level: 3, name: '三级（设备类型）', description: '2 位大写字母，如 AQ=岸桥, CQ=场桥, MJ=门机' },
      { level: 4, name: '四级（流水号）', description: '001-999，同类型设备顺序编号' },
    ],
  },
  {
    type: 'component',
    label: '部件编码',
    format: '[主体编码][五级][六级][七级][流水号]',
    example: 'Mgj-XC001j010101',
    regex: '^[MAFW][a-z]{2}-[A-Z]{2}\\d{3}[jsfgz]\\d{2}\\d{2}\\d{2}$',
    levels: [
      { level: 5, name: '五级（部件分类）', description: 'j 主要机构 / s 附属设备 / f 附件 / g 专用工具 / z 随机资料' },
      { level: 6, name: '六级（机构名称）', description: '01 起升机构, 02 俯仰机构, 03 大车行走 等' },
      { level: 7, name: '七级（具体部件）', description: '01 电机, 02 减速箱, 03 卷筒, 04 制动器 等' },
    ],
  },
  {
    type: 'department',
    label: '部门编码',
    format: '[地区3位][行业1位][集团2位][分公司2位][设备队2位]',
    example: '633G010204',
    regex: '^\\d{3}[A-Z]\\d{2}\\d{2}\\d{2}$',
    levels: [
      { level: 1, name: '地区', description: '3 位数字区号，如 021=上海, 633=日照, 532=青岛' },
      { level: 2, name: '行业', description: '1 位大写字母，如 G=港口, S=水运, J=交运, Y=冶金' },
    ],
  },
  {
    type: 'fault',
    label: '故障编码',
    format: '(规划中)',
    example: '—',
    regex: '',
    levels: [],
  },
];

// ────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────

export default function EncodingManager() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('device');

  // 查询编码类别和编码项
  const { data: categories } = trpc.encoding.getCategories.useQuery();

  return (
    <MainLayout title="编码管理">
      <div className="p-4 space-y-4">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-blue-500" />
            <h1 className="text-lg font-semibold">编码管理</h1>
            <Badge variant="secondary" className="text-xs">
              {categories?.length ?? 0} 类编码
            </Badge>
          </div>
        </div>

        {/* Tab 切换 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="device">设备编码</TabsTrigger>
            <TabsTrigger value="component">部件编码</TabsTrigger>
            <TabsTrigger value="department">部门编码</TabsTrigger>
            <TabsTrigger value="fault">故障编码</TabsTrigger>
          </TabsList>

          <TabsContent value="device">
            <EncodingTabContent type="device" />
          </TabsContent>
          <TabsContent value="component">
            <EncodingTabContent type="component" />
          </TabsContent>
          <TabsContent value="department">
            <EncodingTabContent type="department" />
          </TabsContent>
          <TabsContent value="fault">
            <FaultEncodingPlaceholder />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

// ────────────────────────────────────────────────────
// 故障编码占位（规划中）
// ────────────────────────────────────────────────────

function FaultEncodingPlaceholder() {
  return (
    <div className="space-y-4 mt-4">
      <RuleCard rule={ENCODING_RULES.find(r => r.type === 'fault')!} />
      <PageCard title="故障编码">
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Info className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">故障编码规则规划中</p>
          <p className="text-sm mt-1">故障编码体系将在后续迭代中定义，届时可在此管理故障编码值</p>
        </div>
      </PageCard>
    </div>
  );
}

// ────────────────────────────────────────────────────
// 单个 Tab 内容（设备/部件/部门）
// ────────────────────────────────────────────────────

function EncodingTabContent({ type }: { type: string }) {
  const toast = useToast();
  const rule = ENCODING_RULES.find(r => r.type === type)!;

  // 当前选中的级别
  const [selectedLevel, setSelectedLevel] = useState<number>(rule.levels[0]?.level ?? 1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);

  // tRPC — 获取某级编码值
  const { data: levelData, refetch } = trpc.encoding.getLevelValues.useQuery(
    { type: type as 'device' | 'component' | 'department', level: selectedLevel },
  );

  // tRPC — 校验编码
  const validateQuery = trpc.encoding.validate.useQuery;

  // 过滤搜索
  const filteredValues = useMemo(() => {
    const values = levelData?.values ?? [];
    if (!searchTerm) return values;
    return values.filter((v: string) =>
      v.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [levelData, searchTerm]);

  return (
    <div className="space-y-4 mt-4">
      {/* 规则卡片（只读） */}
      <RuleCard rule={rule} />

      {/* 编码值管理 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 左侧：级别选择 */}
        <div className="col-span-3">
          <PageCard title="编码级别">
            <div className="space-y-1">
              {rule.levels.map(lv => (
                <button
                  key={lv.level}
                  onClick={() => setSelectedLevel(lv.level)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    selectedLevel === lv.level
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 font-medium'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>L{lv.level} {lv.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {levelData?.level === lv.level ? filteredValues.length : '—'}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </PageCard>
        </div>

        {/* 右侧：编码值列表 */}
        <div className="col-span-9">
          <PageCard
            title={`L${selectedLevel} 编码值`}
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索编码..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 h-8 w-40"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowAddDialog(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新增
                </Button>
              </div>
            }
          >
            {/* 级别说明 */}
            <div className="text-xs text-muted-foreground mb-3 px-1">
              {rule.levels.find(l => l.level === selectedLevel)?.description}
            </div>

            {/* 编码值表格 */}
            {filteredValues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无编码值
              </div>
            ) : (
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">编码</th>
                      <th className="text-left px-3 py-2 font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredValues.map((code: string) => (
                      <tr
                        key={code}
                        className="border-t hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-3 py-2">
                          <span className="font-mono">{code}</span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="default" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                            启用
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageCard>
        </div>
      </div>

      {/* 新增编码对话框 */}
      <AddEncodingDialog
        type={type}
        level={selectedLevel}
        rule={rule}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={() => {
          refetch();
          toast.success('编码值已添加');
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────
// 编码规则卡片（只读）
// ────────────────────────────────────────────────────

function RuleCard({ rule }: { rule: EncodingRule }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <PageCard title="编码规则（只读）">
      <div className="space-y-2 text-sm">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <span className="text-muted-foreground">格式: </span>
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{rule.format}</code>
          </div>
          <div>
            <span className="text-muted-foreground">示例: </span>
            <code className="bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded text-xs text-blue-700 dark:text-blue-300 font-mono">
              {rule.example}
            </code>
          </div>
          {rule.regex && (
            <div>
              <span className="text-muted-foreground">正则: </span>
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{rule.regex}</code>
            </div>
          )}
        </div>

        {expanded && rule.levels.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-1 w-32">级别</th>
                  <th className="text-left py-1">说明</th>
                </tr>
              </thead>
              <tbody>
                {rule.levels.map(lv => (
                  <tr key={lv.level} className="border-t border-dashed">
                    <td className="py-1 font-medium">L{lv.level} {lv.name}</td>
                    <td className="py-1 text-muted-foreground">{lv.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rule.levels.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:underline"
          >
            {expanded ? '收起' : '展开级别详情'}
          </button>
        )}
      </div>
    </PageCard>
  );
}

// ────────────────────────────────────────────────────
// 新增编码对话框
// ────────────────────────────────────────────────────

function AddEncodingDialog({
  type,
  level,
  rule,
  open,
  onOpenChange,
  onSuccess,
}: {
  type: string;
  level: number;
  rule: EncodingRule;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);

  // tRPC mutation — 新增编码项
  const createMutation = trpc.encoding.createItem.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        onSuccess();
        onOpenChange(false);
        setCode('');
        setLabel('');
        setValidationResult(null);
      } else {
        toast.error(result.error ?? '新增失败');
      }
    },
    onError: (err) => {
      toast.error(`请求失败: ${err.message}`);
    },
  });

  // 实时校验
  const handleCodeChange = (value: string) => {
    setCode(value);
    setValidationResult(null);
  };

  // 手动校验
  const handleValidate = () => {
    if (!code.trim()) {
      setValidationResult({ valid: false, errors: ['编码不能为空'] });
      return;
    }

    // 正则校验
    if (rule.regex) {
      const regex = new RegExp(rule.regex);
      if (!regex.test(code)) {
        setValidationResult({
          valid: false,
          errors: [`格式不匹配，正确格式: ${rule.format}，示例: ${rule.example}`],
        });
        return;
      }
    }

    setValidationResult({ valid: true, errors: [] });
  };

  // 提交 — 调用后端 createItem mutation
  const handleSubmit = () => {
    if (!validationResult?.valid) {
      toast.error('请先通过格式校验');
      return;
    }
    if (!label.trim()) {
      toast.error('请输入编码含义');
      return;
    }

    createMutation.mutate({
      type: type as 'device' | 'component' | 'department',
      level,
      code: code.trim(),
      label: label.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增编码值 — L{level}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 规则提示 */}
          <div className="bg-muted/50 rounded p-3 text-xs space-y-1">
            <div>
              <span className="font-medium">格式: </span>
              <code>{rule.format}</code>
            </div>
            <div>
              <span className="font-medium">示例: </span>
              <code className="text-blue-600 dark:text-blue-400">{rule.example}</code>
            </div>
          </div>

          {/* 编码输入 */}
          <div>
            <label className="text-sm font-medium mb-1 block">编码值</label>
            <div className="flex gap-2">
              <Input
                placeholder={`输入${rule.label}，如 ${rule.example}`}
                value={code}
                onChange={e => handleCodeChange(e.target.value)}
                className="font-mono"
              />
              <Button variant="outline" onClick={handleValidate}>
                校验
              </Button>
            </div>
          </div>

          {/* 编码含义 */}
          <div>
            <label className="text-sm font-medium mb-1 block">编码含义</label>
            <Input
              placeholder="输入该编码的含义说明"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>

          {/* 校验结果 */}
          {validationResult && (
            <div
              className={`flex items-start gap-2 p-3 rounded text-sm ${
                validationResult.valid
                  ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
              }`}
            >
              {validationResult.valid ? (
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <div>
                {validationResult.valid ? (
                  <span>格式校验通过</span>
                ) : (
                  <ul className="space-y-1">
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!validationResult?.valid || createMutation.isPending}
          >
            {createMutation.isPending ? '提交中...' : '确认新增'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
