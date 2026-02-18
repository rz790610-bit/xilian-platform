/**
 * ============================================================================
 * 统一注册中心索引
 * ============================================================================
 * 
 * 所有注册中心的统一入口。
 * 
 * 使用方式：
 *   import { registryManager } from '../core/registries';
 *   const protocols = registryManager.getRegistry('protocol').listItems();
 *   const pipelineNodes = registryManager.getRegistry('pipelineNode').listItems();
 * 
 * 新增注册中心步骤：
 *   1. 在 registries/ 目录下创建 xxx.registry.ts
 *   2. 继承 BaseRegistry<T>，定义分类和内置项
 *   3. 在本文件中导入并注册到 registryManager
 *   4. 后端 API 自动暴露，前端自动可用
 */

import { BaseRegistry, type RegistryItemMeta, type CategoryMeta } from '../registry';
import { pipelineNodeRegistry, type PipelineNodeRegistryItem } from './pipeline-node.registry';
import { pluginTypeRegistry, type PluginTypeRegistryItem } from './plugin-type.registry';
import { deviceTypeRegistry, type DeviceTypeRegistryItem } from './device-type.registry';
import { kgOperatorRegistry, type KGOperatorRegistryItem } from './kg-operator.registry';
import { metricTypeRegistry, type MetricTypeRegistryItem } from './metric-type.registry';
import { algorithmRegistry, type AlgorithmRegistryItem } from './algorithm.registry';
import { moduleRegistry, type ModuleManifest, type ModuleCapability, type ModuleDomain, type DomainCompletenessReport } from './module.registry';

// ============ 注册中心管理器 ============

export interface RegistryInfo {
  name: string;
  label: string;
  description: string;
  itemCount: number;
  categoryCount: number;
}

class RegistryManager {
  private registries = new Map<string, BaseRegistry<any>>();
  private registryMeta = new Map<string, { label: string; description: string }>();

  /** 注册一个注册中心 */
  register(key: string, registry: BaseRegistry<any>, meta: { label: string; description: string }): void {
    this.registries.set(key, registry);
    this.registryMeta.set(key, meta);
  }

  /** 获取注册中心 */
  getRegistry<T extends RegistryItemMeta>(key: string): BaseRegistry<T> | undefined {
    return this.registries.get(key);
  }

  /** 列出所有注册中心 */
  listRegistries(): RegistryInfo[] {
    const result: RegistryInfo[] = [];
    const entries = Array.from(this.registries.entries());
    for (const [key, registry] of entries) {
      const meta = this.registryMeta.get(key)!;
      result.push({
        name: key,
        label: meta.label,
        description: meta.description,
        itemCount: registry.listItems().length,
        categoryCount: registry.getCategories().length,
      });
    }
    return result;
  }

  /** 获取所有注册中心的统计信息 */
  getStats(): { totalRegistries: number; totalItems: number; totalCategories: number; details: RegistryInfo[] } {
    const details = this.listRegistries();
    return {
      totalRegistries: details.length,
      totalItems: details.reduce((sum, r) => sum + r.itemCount, 0),
      totalCategories: details.reduce((sum, r) => sum + r.categoryCount, 0),
      details,
    };
  }

  /**
   * 通用查询接口：根据注册中心名称和可选的分类/搜索条件返回数据
   * 供统一 API 使用
   */
  query(registryKey: string, options?: {
    category?: string;
    search?: string;
    tags?: string[];
  }): { items: RegistryItemMeta[]; categories: CategoryMeta[] } | null {
    const registry = this.registries.get(registryKey);
    if (!registry) return null;

    let items = registry.listItems();
    const categories = registry.getCategories();

    if (options?.category) {
      items = items.filter((item: RegistryItemMeta) => item.category === options.category);
    }

    if (options?.search) {
      const keyword = options.search.toLowerCase();
      items = items.filter((item: RegistryItemMeta) =>
        item.label.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword) ||
        (item.tags && item.tags.some(t => t.toLowerCase().includes(keyword)))
      );
    }

    if (options?.tags && options.tags.length > 0) {
      items = items.filter((item: RegistryItemMeta) =>
        item.tags && options.tags!.some(t => item.tags!.includes(t))
      );
    }

    return { items, categories };
  }
}

// ============ 创建全局管理器实例并注册所有注册中心 ============

export const registryManager = new RegistryManager();

registryManager.register('pipelineNode', pipelineNodeRegistry, {
  label: 'Pipeline 节点类型',
  description: '数据管道编排中可用的所有节点类型（数据源、处理器、目标输出、流程控制等）',
});

registryManager.register('pluginType', pluginTypeRegistry, {
  label: '插件类型',
  description: '平台支持的插件类型（连接器、处理器、可视化、集成、工具等）',
});

registryManager.register('deviceType', deviceTypeRegistry, {
  label: '设备类型',
  description: '平台支持的设备类型（传感器、控制器、网关、机器人、视觉设备等）',
});

registryManager.register('kgOperator', kgOperatorRegistry, {
  label: '知识图谱算子',
  description: '知识图谱构建和查询的算子类型（抽取、转换、增强、查询、推理、导出）',
});

registryManager.register('metricType', metricTypeRegistry, {
  label: '监控指标类型',
  description: '平台监控指标类型（系统、数据库、Pipeline、设备、业务指标）',
});

registryManager.register('algorithm', algorithmRegistry, {
  label: '算法库',
  description: '工业智能算法（信号处理、特征工程、机器学习、深度学习、异常检测、预测性维护、统计分析、优化）',
});

registryManager.register('module', moduleRegistry as any, {
  label: '模块注册中心',
  description: 'L1 契约基层 — 28 个平台模块的 Manifest、完整度、依赖关系',
});

// ============ 导出所有注册中心实例 ============

export { pipelineNodeRegistry } from './pipeline-node.registry';
export { pluginTypeRegistry } from './plugin-type.registry';
export { deviceTypeRegistry } from './device-type.registry';
export { kgOperatorRegistry } from './kg-operator.registry';
export { metricTypeRegistry } from './metric-type.registry';
export { algorithmRegistry } from './algorithm.registry';
export { moduleRegistry } from './module.registry';

// ============ 导出类型 ============

export type { PipelineNodeRegistryItem } from './pipeline-node.registry';
export type { PluginTypeRegistryItem, PluginCapability, PluginConfigField } from './plugin-type.registry';
export type { DeviceTypeRegistryItem, DeviceProperty, DeviceCommand, TelemetryField } from './device-type.registry';
export type { KGOperatorRegistryItem, KGOperatorParam } from './kg-operator.registry';
export type { MetricTypeRegistryItem, MetricCollector, AlertRuleTemplate, AggregationType } from './metric-type.registry';
export type { AlgorithmRegistryItem, AlgorithmConfigField, AlgorithmIOField } from './algorithm.registry';
export type { ModuleManifest, ModuleCapability, ModuleDomain, DomainCompletenessReport } from './module.registry';
