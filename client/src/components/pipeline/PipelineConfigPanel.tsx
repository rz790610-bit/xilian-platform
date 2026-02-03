/**
 * Pipeline 节点配置面板
 * 根据节点类型显示不同的配置表单
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
import { X, Save, Trash2 } from 'lucide-react';
import type { EditorNode, ConfigFieldSchema } from '@shared/pipelineTypes';
import { SOURCE_TYPES, PROCESSOR_TYPES, SINK_TYPES } from '@shared/pipelineTypes';

interface PipelineConfigPanelProps {
  className?: string;
}

// 获取节点的配置 Schema
function getConfigSchema(node: EditorNode): ConfigFieldSchema[] {
  if (node.type === 'source') {
    const info = SOURCE_TYPES.find(s => s.type === node.subType);
    return info?.configSchema.fields || [];
  } else if (node.type === 'processor') {
    const info = PROCESSOR_TYPES.find(p => p.type === node.subType);
    return info?.configSchema.fields || [];
  } else if (node.type === 'sink') {
    const info = SINK_TYPES.find(s => s.type === node.subType);
    return info?.configSchema.fields || [];
  }
  return [];
}

// 配置字段渲染组件
interface ConfigFieldProps {
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}

function ConfigField({ field, value, onChange }: ConfigFieldProps) {
  const renderField = () => {
    switch (field.type) {
      case 'string':
        return (
          <Input
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={(value as number) ?? field.default ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );

      case 'boolean':
        return (
          <Switch
            checked={(value as boolean) ?? (field.default as boolean) ?? false}
            onCheckedChange={onChange}
          />
        );

      case 'select':
        return (
          <Select
            value={(value as string) || (field.default as string) || ''}
            onValueChange={onChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'code':
        return (
          <Textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="font-mono text-sm min-h-[100px]"
          />
        );

      case 'object':
        return (
          <Textarea
            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : (value as string) || ''}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onChange(parsed);
              } catch {
                // 保持原始字符串，等待用户完成输入
                onChange(e.target.value);
              }
            }}
            placeholder={field.placeholder}
            className="font-mono text-sm min-h-[80px]"
          />
        );

      case 'array':
        return (
          <Textarea
            value={Array.isArray(value) ? value.join('\n') : (value as string) || ''}
            onChange={(e) => {
              const lines = e.target.value.split('\n').filter(l => l.trim());
              onChange(lines);
            }}
            placeholder={field.placeholder || '每行一个值'}
            className="font-mono text-sm min-h-[80px]"
          />
        );

      default:
        return (
          <Input
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
      </div>
      {renderField()}
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
}

export function PipelineConfigPanel({ className }: PipelineConfigPanelProps) {
  const {
    editor,
    showConfigPanel,
    setShowConfigPanel,
    updateNodeConfig,
    removeNode,
    getSelectedNode,
  } = usePipelineEditorStore();

  const selectedNode = getSelectedNode();
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);

  // 当选中节点变化时，重置本地配置
  useEffect(() => {
    if (selectedNode) {
      setLocalConfig(selectedNode.config || {});
      setIsDirty(false);
    }
  }, [selectedNode?.id]);

  if (!showConfigPanel || !selectedNode) {
    return null;
  }

  const configSchema = getConfigSchema(selectedNode);

  // 处理字段值变化
  const handleFieldChange = (fieldName: string, value: unknown) => {
    // 处理嵌套字段名（如 condition.field）
    const parts = fieldName.split('.');
    const newConfig = { ...localConfig };
    
    if (parts.length === 1) {
      newConfig[fieldName] = value;
    } else {
      // 嵌套对象
      let current: Record<string, unknown> = newConfig;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }

    setLocalConfig(newConfig);
    setIsDirty(true);
  };

  // 获取嵌套字段值
  const getFieldValue = (fieldName: string): unknown => {
    const parts = fieldName.split('.');
    let current: unknown = localConfig;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  };

  // 保存配置
  const handleSave = () => {
    updateNodeConfig(selectedNode.id, localConfig);
    setIsDirty(false);
  };

  // 删除节点
  const handleDelete = () => {
    if (confirm(`确定要删除节点 "${selectedNode.name}" 吗？`)) {
      removeNode(selectedNode.id);
    }
  };

  // 获取节点类型显示名称
  const getNodeTypeName = () => {
    switch (selectedNode.type) {
      case 'source': return '数据源';
      case 'processor': return '处理器';
      case 'sink': return '目标连接器';
      default: return '节点';
    }
  };

  return (
    <div className={cn('w-80 h-full bg-card border-l border-border flex flex-col', className)}>
      {/* 头部 */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{selectedNode.name}</h3>
          <p className="text-xs text-muted-foreground">{getNodeTypeName()}配置</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowConfigPanel(false)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 配置表单 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {configSchema.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            此节点类型无需配置
          </p>
        ) : (
          configSchema.map(field => (
            <ConfigField
              key={field.name}
              field={field}
              value={getFieldValue(field.name)}
              onChange={(value) => handleFieldChange(field.name, value)}
            />
          ))
        )}
      </div>

      {/* 底部操作 */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={!isDirty}
          >
            <Save className="w-4 h-4 mr-2" />
            保存配置
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
        {isDirty && (
          <p className="text-xs text-yellow-500 text-center">
            有未保存的更改
          </p>
        )}
      </div>
    </div>
  );
}
