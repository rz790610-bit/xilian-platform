/**
 * ============================================================================
 * Pipeline 节点类型注册中心
 * ============================================================================
 * 
 * 职责：
 *   1. 管理 50+ Pipeline 节点类型的注册和查询
 *   2. 提供节点类型元数据、配置 Schema、连接规则的统一查询 API
 *   3. 支持运行时动态注册新节点类型（插件扩展）
 *   4. 自动同步到前端，前端无需硬编码节点列表
 * 
 * 数据源：从 shared/pipelineTypes.ts 中的静态定义自动导入
 * 扩展方式：调用 pipelineNodeRegistry.register() 注册自定义节点
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';
import type { NodeTypeInfo, NodeSubType, EditorNodeType, NodeDomain, ConfigFieldSchema } from '../../../shared/pipelineTypes';
import {
  SOURCE_NODES, DATA_ENGINEERING_NODES, ML_NODES, LLM_NODES,
  CONTROL_NODES, SINK_NODES, MULTIMODAL_SOURCE_NODES, MULTIMODAL_NODES,
  EXTRA_SINK_NODES, DOMAIN_COLORS,
} from '../../../shared/pipelineTypes';

// ============ Pipeline 节点注册项类型 ============

export interface PipelineNodeRegistryItem extends RegistryItemMeta {
  /** 节点子类型（唯一标识） */
  id: string;
  /** 节点大类 */
  nodeType: EditorNodeType;
  /** 领域分类 */
  domain: NodeDomain;
  /** 配置字段定义 */
  configFields: ConfigFieldSchema[];
  /** 输入端口数（默认 1） */
  inputs: number;
  /** 输出端口数（默认 1） */
  outputs: number;
  /** 领域颜色 */
  colors: { bg: string; border: string; text: string; badge: string };
  /** 连接规则 */
  connectionRules?: {
    /** 允许连接的上游节点类型 */
    allowedInputTypes?: NodeSubType[];
    /** 允许连接的下游节点类型 */
    allowedOutputTypes?: NodeSubType[];
    /** 是否允许自连接 */
    allowSelfLoop?: boolean;
  };
}

// ============ Pipeline 节点分类定义 ============

const PIPELINE_NODE_CATEGORIES: CategoryMeta[] = [
  { id: 'source', label: '数据源', icon: '📥', color: '#3B82F6', order: 1, description: '从外部系统采集数据' },
  { id: 'data_engineering', label: '数据工程', icon: '⚙️', color: '#10B981', order: 2, description: '数据清洗、转换、聚合' },
  { id: 'machine_learning', label: '机器学习', icon: '🤖', color: '#8B5CF6', order: 3, description: '特征工程、模型推理、评估' },
  { id: 'multimodal', label: '多模态', icon: '🎬', color: '#06B6D4', order: 4, description: '视频/音频/IoT 多模态融合' },
  { id: 'llm', label: '大模型应用', icon: '🧠', color: '#F59E0B', order: 5, description: 'LLM 调用、向量化、RAG' },
  { id: 'control', label: '流程控制', icon: '🔀', color: '#64748B', order: 6, description: '条件分支、循环、并行、通知' },
  { id: 'sink', label: '目标输出', icon: '📤', color: '#EF4444', order: 7, description: '写入数据库、消息队列、对象存储' },
];

// ============ 工具函数：NodeTypeInfo → PipelineNodeRegistryItem ============

function nodeTypeInfoToRegistryItem(info: NodeTypeInfo): PipelineNodeRegistryItem {
  const colors = DOMAIN_COLORS[info.domain] || DOMAIN_COLORS.data_engineering;
  return {
    id: info.type,
    label: info.name,
    icon: info.icon,
    description: info.description,
    category: info.domain,
    order: undefined,
    tags: [info.nodeType, info.domain, info.type],
    nodeType: info.nodeType,
    domain: info.domain,
    configFields: info.configFields,
    inputs: info.inputs ?? (info.nodeType === 'source' ? 0 : 1),
    outputs: info.outputs ?? (info.nodeType === 'sink' ? 0 : 1),
    colors,
  };
}

// ============ 创建并初始化注册中心实例 ============

class PipelineNodeRegistry extends BaseRegistry<PipelineNodeRegistryItem> {
  constructor() {
    super('PipelineNodeRegistry');

    // 注册分类
    this.registerCategories(PIPELINE_NODE_CATEGORIES);

    // 从 pipelineTypes.ts 静态定义批量导入
    const allNodes: NodeTypeInfo[] = [
      ...SOURCE_NODES,
      ...MULTIMODAL_SOURCE_NODES,
      ...DATA_ENGINEERING_NODES,
      ...ML_NODES,
      ...MULTIMODAL_NODES,
      ...LLM_NODES,
      ...CONTROL_NODES,
      ...SINK_NODES,
      ...EXTRA_SINK_NODES,
    ];

    this.registerAll(allNodes.map(nodeTypeInfoToRegistryItem));
  }

  /** 按节点大类查询（source/processor/sink/control） */
  getByNodeType(nodeType: EditorNodeType): PipelineNodeRegistryItem[] {
    return this.listItems().filter(item => item.nodeType === nodeType);
  }

  /** 按领域查询 */
  getByDomain(domain: NodeDomain): PipelineNodeRegistryItem[] {
    return this.listItems().filter(item => item.domain === domain);
  }

  /** 获取节点的配置 Schema（供前端配置面板渲染） */
  getConfigSchema(nodeSubType: string): ConfigFieldSchema[] | null {
    const item = this.get(nodeSubType);
    return item ? item.configFields : null;
  }

  /** 验证连接规则 */
  validateConnection(fromSubType: string, toSubType: string): { valid: boolean; reason?: string } {
    const fromNode = this.get(fromSubType);
    const toNode = this.get(toSubType);

    if (!fromNode || !toNode) {
      return { valid: false, reason: `未知的节点类型: ${!fromNode ? fromSubType : toSubType}` };
    }

    // 基本规则：source 不能作为目标，sink 不能作为源
    if (fromNode.outputs === 0) {
      return { valid: false, reason: `${fromNode.label} 没有输出端口` };
    }
    if (toNode.inputs === 0) {
      return { valid: false, reason: `${toNode.label} 没有输入端口` };
    }

    // 自定义连接规则
    if (fromNode.connectionRules?.allowedOutputTypes) {
      if (!fromNode.connectionRules.allowedOutputTypes.includes(toSubType as NodeSubType)) {
        return { valid: false, reason: `${fromNode.label} 不允许连接到 ${toNode.label}` };
      }
    }

    return { valid: true };
  }

  /** 获取领域颜色映射 */
  getDomainColors(): Record<string, { bg: string; border: string; text: string; badge: string }> {
    const colors: Record<string, { bg: string; border: string; text: string; badge: string }> = {};
    const allItems = Array.from(this.items.values());
    for (const item of allItems) {
      if (!colors[item.domain]) {
        colors[item.domain] = item.colors;
      }
    }
    return colors;
  }

  /**
   * 向后兼容：返回与旧版 ALL_NODE_TYPES 格式一致的数据
   * 供 pipelineEditorStore.ts 和 PipelineEditor.tsx 使用
   */
  toNodeTypeInfoArray(): NodeTypeInfo[] {
    return this.listItems().map(item => ({
      type: item.id as NodeSubType,
      nodeType: item.nodeType,
      domain: item.domain,
      name: item.label,
      description: item.description,
      icon: item.icon,
      configFields: item.configFields,
      inputs: item.inputs,
      outputs: item.outputs,
    }));
  }
}

// ============ 导出单例 ============

export const pipelineNodeRegistry = new PipelineNodeRegistry();

// ============ 向后兼容函数（替代 pipelineTypes.ts 中的静态函数） ============

export function getNodeTypeInfoFromRegistry(subType: string): NodeTypeInfo | undefined {
  const item = pipelineNodeRegistry.get(subType);
  if (!item) return undefined;
  return {
    type: item.id as NodeSubType,
    nodeType: item.nodeType,
    domain: item.domain,
    name: item.label,
    description: item.description,
    icon: item.icon,
    configFields: item.configFields,
    inputs: item.inputs,
    outputs: item.outputs,
  };
}
