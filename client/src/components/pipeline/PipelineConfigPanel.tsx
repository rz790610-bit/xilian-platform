/**
 * Pipeline 节点配置面板
 * 根据节点类型动态显示配置表单，适配新的 40+ 节点体系
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePipelineEditorStore } from '@/stores/pipelineEditorStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { X, Save, Trash2, Settings2, Info } from 'lucide-react';
import { getNodeTypeInfo, DOMAIN_COLORS, type NodeDomain, type ConfigFieldSchema } from '@shared/pipelineTypes';

interface PipelineConfigPanelProps {
  className?: string;
}

export function PipelineConfigPanel({ className }: PipelineConfigPanelProps) {
  const {
    editor,
    updateNodeConfig,
    removeNode,
    selectNode,
  } = usePipelineEditorStore();

  const selectedNode = editor.nodes.find(n => n.id === editor.selectedNodeId);
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({});
  const [localLabel, setLocalLabel] = useState('');

  // 获取节点类型信息和配置字段
  const nodeTypeInfo = selectedNode ? getNodeTypeInfo(selectedNode.subType) : undefined;
  const configFields: ConfigFieldSchema[] = nodeTypeInfo?.configFields || [];
  const domain = nodeTypeInfo?.domain as NodeDomain | undefined;
  const domainColor = domain ? DOMAIN_COLORS[domain] : undefined;

  useEffect(() => {
    if (selectedNode) {
      setLocalConfig({ ...selectedNode.config });
      setLocalLabel(selectedNode.name);
    }
  }, [selectedNode?.id]);

  if (!selectedNode || !nodeTypeInfo) {
    return (
      <div className={cn('flex flex-col items-center justify-center text-muted-foreground/60 p-4', className)}>
        <Settings2 className="w-8 h-8 mb-2" />
        <p className="text-xs">选择节点查看配置</p>
      </div>
    );
  }

  const handleFieldChange = (key: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateNodeConfig(selectedNode.id, localConfig);
  };

  const handleDelete = () => {
    removeNode(selectedNode.id);
    selectNode(null);
  };

  const renderField = (field: ConfigFieldSchema) => {
    const value = localConfig[field.name] ?? field.default ?? '';

    switch (field.type) {
      case 'select':
        return (
          <Select value={String(value)} onValueChange={(v) => handleFieldChange(field.name, v)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder={`选择${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(v) => handleFieldChange(field.name, v)}
            />
            <span className="text-xs text-muted-foreground">{value ? '启用' : '禁用'}</span>
          </div>
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.name, Number(e.target.value))}
            className="h-7 text-xs font-mono"
            placeholder={field.placeholder}
          />
        );

      case 'textarea':
      case 'code':
        return (
          <Textarea
            value={String(value)}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="text-xs font-mono min-h-[60px] resize-y"
            placeholder={field.placeholder}
            rows={3}
          />
        );

      case 'object':
      case 'array':
        return (
          <Textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="text-xs font-mono min-h-[80px] resize-y"
            placeholder={field.placeholder || '{"key": "value"}'}
            rows={4}
          />
        );

      case 'password':
        return (
          <Input
            type="password"
            value={String(value)}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder={field.placeholder}
          />
        );

      default: // string
        return (
          <Input
            type="text"
            value={String(value)}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder={field.placeholder}
          />
        );
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {domainColor && (
            <div className={cn('w-2 h-2 rounded-full shrink-0', domainColor.bg)} />
          )}
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{nodeTypeInfo.name}</div>
            <div className="text-[10px] text-muted-foreground truncate">{nodeTypeInfo.description}</div>
          </div>
        </div>
        <button onClick={() => selectNode(null)} className="p-1 hover:bg-secondary rounded shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 配置内容 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 节点名称 */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">节点名称</Label>
          <Input
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            className="h-7 text-xs"
            placeholder="自定义节点名称"
          />
        </div>

        {/* 节点 ID */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">节点 ID</Label>
          <div className="text-xs font-mono text-muted-foreground bg-secondary/50 rounded px-2 py-1 truncate">
            {selectedNode.id}
          </div>
        </div>

        {/* 分隔线 */}
        {configFields.length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="flex items-center gap-1.5 mb-2">
              <Settings2 className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-semibold">参数配置</span>
            </div>
          </div>
        )}

        {/* 动态配置字段 */}
        {configFields.map(field => (
          <div key={field.name} className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs text-muted-foreground">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>
              {field.description && (
                <span title={field.description} className="cursor-help">
                  <Info className="w-2.5 h-2.5 text-muted-foreground/50" />
                </span>
              )}
            </div>
            {renderField(field)}
          </div>
        ))}

        {/* 无配置字段提示 */}
        {configFields.length === 0 && (
          <div className="text-center text-muted-foreground/50 py-4">
            <Info className="w-5 h-5 mx-auto mb-1" />
            <p className="text-xs">该节点无需额外配置</p>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        <Button size="sm" variant="outline" onClick={handleDelete} className="text-xs h-7 text-red-500 hover:text-red-600 hover:bg-red-50">
          <Trash2 className="w-3 h-3 mr-1" />删除
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleSave} className="text-xs h-7">
          <Save className="w-3 h-3 mr-1" />保存配置
        </Button>
      </div>
    </div>
  );
}
