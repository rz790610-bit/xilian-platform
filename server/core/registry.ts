import { createModuleLogger } from './logger';
const log = createModuleLogger('registry');

/**
 * ============================================================================
 * 平台级统一注册中心 (Platform Registry)
 * ============================================================================
 * 
 * 设计原则：
 *   1. Single Source of Truth — 每个模块的注册表是该模块所有元数据的唯一数据源
 *   2. Self-Describing — 注册项自带 icon/label/description/category 等元数据
 *   3. Auto-Sync — 上层 API/前端从注册表动态获取，底层变更自动传播
 *   4. Zero-Config Extension — 新增注册项只需注册一次，前端自动展示
 *   5. Type-Safe — 泛型约束确保注册项类型安全
 *   6. Observable — 注册/注销事件可被监听，支持热更新
 * 
 * 架构：
 *   BaseRegistry<TItem, TCategory>
 *     ├── ProtocolAdapterRegistry    (接入层 15 协议)
 *     ├── PipelineNodeRegistry       (Pipeline 50+ 节点类型)
 *     ├── PluginTypeRegistry         (插件引擎 7 类型)
 *     ├── DeviceTypeRegistry         (设备类型 15+ 类型)
 *     ├── KGNodeRegistry             (知识图谱 30+ 算子)
 *     └── MonitoringMetricRegistry   (监控指标)
 * 
 * 使用方式：
 *   // 后端注册
 *   pipelineNodeRegistry.register('mysql', { ... });
 * 
 *   // 后端 API（自动生成）
 *   router.listItems()      → 返回所有注册项的元数据
 *   router.listCategories() → 返回按分类聚合的注册项
 *   router.getItem(id)      → 返回单个注册项的完整信息
 * 
 *   // 前端（动态获取）
 *   const { data } = trpc.pipeline.listNodeTypes.useQuery();
 *   // 自动渲染节点面板，无需硬编码
 */

// ============ 注册项基础接口 ============

/** 所有注册项必须实现的基础元数据 */
export interface RegistryItemMeta {
  /** 唯一标识符 */

  id: string;
  /** 显示标签 */
  label: string;
  /** 图标（emoji 或 icon class） */
  icon: string;
  /** 简短描述 */
  description: string;
  /** 所属分类 */
  category: string;
  /** 排序权重（越小越靠前） */
  order?: number;
  /** 标签（用于搜索过滤） */
  tags?: string[];
  /** 是否已废弃 */
  deprecated?: boolean;
  /** 版本号 */
  version?: string;
}

/** 分类元数据 */
export interface CategoryMeta {
  id: string;
  label: string;
  icon: string;
  description?: string;
  order?: number;
  color?: string;
}

/** 注册事件类型 */
export type RegistryEvent = 'register' | 'unregister' | 'update' | 'clear';

/** 注册事件监听器 */
export type RegistryListener<T extends RegistryItemMeta> = (
  event: RegistryEvent,
  item: T | null,
  registry: BaseRegistry<T>
) => void;

// ============ 注册中心基类 ============

/**
 * BaseRegistry — 平台级统一注册中心基类
 * 
 * 泛型参数：
 *   TItem — 注册项类型，必须包含 RegistryItemMeta 的所有字段
 * 
 * 子类只需：
 *   1. 定义具体的 TItem 类型（扩展 RegistryItemMeta）
 *   2. 在构造函数中注册分类和注册项
 *   3. 可选：覆写 validate() 方法添加自定义校验
 */
export class BaseRegistry<TItem extends RegistryItemMeta> {
  /** 注册表名称（用于日志和错误消息） */
  protected readonly name: string;

  /** 注册项存储 */
  protected readonly items: Map<string, TItem> = new Map();

  /** 分类存储 */
  protected readonly categories: Map<string, CategoryMeta> = new Map();

  /** 事件监听器 */
  private readonly listeners: Set<RegistryListener<TItem>> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  // ============ 分类管理 ============

  /** 注册分类 */
  registerCategory(meta: CategoryMeta): this {
    this.categories.set(meta.id, meta);
    return this;
  }

  /** 批量注册分类 */
  registerCategories(metas: CategoryMeta[]): this {
    for (const meta of metas) {
      this.registerCategory(meta);
    }
    return this;
  }

  /** 获取所有分类 */
  getCategories(): CategoryMeta[] {
    return Array.from(this.categories.values())
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  // ============ 注册项管理 ============

  /** 注册单个项 */
  register(item: TItem): this {
    // 校验分类是否存在
    if (item.category && !this.categories.has(item.category)) {
      log.warn(`[${this.name}] 注册项 "${item.id}" 的分类 "${item.category}" 未注册，自动创建`);
      this.registerCategory({
        id: item.category,
        label: item.category,
        icon: '📦',
      });
    }

    // 自定义校验
    this.validate(item);

    // 判断是新增还是更新
    const event: RegistryEvent = this.items.has(item.id) ? 'update' : 'register';
    this.items.set(item.id, item);
    this.emit(event, item);
    return this;
  }

  /** 批量注册 */
  registerAll(items: TItem[]): this {
    for (const item of items) {
      this.register(item);
    }
    return this;
  }

  /** 注销 */
  unregister(id: string): boolean {
    const item = this.items.get(id);
    if (item) {
      this.items.delete(id);
      this.emit('unregister', item);
      return true;
    }
    return false;
  }

  /** 获取单个注册项 */
  get(id: string): TItem | undefined {
    return this.items.get(id);
  }

  /** 检查是否已注册 */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /** 获取注册项数量 */
  get size(): number {
    return this.items.size;
  }

  // ============ 查询 API（供 tRPC 路由直接调用） ============

  /** 列出所有注册项的元数据（前端协议选择列表用） */
  listItems(): TItem[] {
    return Array.from(this.items.values())
      .filter(item => !item.deprecated)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }

  /** 按分类聚合（前端分类面板用） */
  listByCategory(): Array<CategoryMeta & { items: TItem[] }> {
    const categoryMap = new Map<string, TItem[]>();

    const allItems = Array.from(this.items.values());
    for (const item of allItems) {
      if (item.deprecated) continue;
      const cat = item.category;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(item);
    }

    return this.getCategories()
      .filter(cat => categoryMap.has(cat.id))
      .map(cat => ({
        ...cat,
        items: (categoryMap.get(cat.id) || [])
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
      }));
  }

  /** 按标签搜索 */
  searchByTags(tags: string[]): TItem[] {
    const tagSet = new Set(tags.map(t => t.toLowerCase()));
    return this.listItems().filter(item =>
      item.tags?.some(t => tagSet.has(t.toLowerCase()))
    );
  }

  /** 按分类过滤 */
  filterByCategory(category: string): TItem[] {
    return this.listItems().filter(item => item.category === category);
  }

  /** 获取统计信息 */
  getStats(): {
    totalItems: number;
    totalCategories: number;
    itemsByCategory: Record<string, number>;
  } {
    const itemsByCategory: Record<string, number> = {};
    const allItems = Array.from(this.items.values());
    for (const item of allItems) {
      itemsByCategory[item.category] = (itemsByCategory[item.category] || 0) + 1;
    }
    return {
      totalItems: this.items.size,
      totalCategories: this.categories.size,
      itemsByCategory,
    };
  }

  // ============ 事件系统 ============

  /** 监听注册事件 */
  on(listener: RegistryListener<TItem>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 触发事件 */
  private emit(event: RegistryEvent, item: TItem | null): void {
    const allListeners = Array.from(this.listeners);
    for (const listener of allListeners) {
      try {
        listener(event, item, this);
      } catch (err) {
        log.warn({ err, registry: this.name }, `Registry event listener error in ${this.name}`);
      }
    }
  }

  // ============ 可覆写的钩子 ============

  /** 自定义校验（子类可覆写） */
  protected validate(_item: TItem): void {
    // 默认不校验，子类可覆写
  }

  /** 清空注册表 */
  clear(): void {
    this.items.clear();
    this.emit('clear', null);
  }

  /** 序列化为 JSON（调试用） */
  toJSON(): { name: string; categories: CategoryMeta[]; items: TItem[] } {
    return {
      name: this.name,
      categories: this.getCategories(),
      items: this.listItems(),
    };
  }
}

// ============ 辅助工具：tRPC 路由生成器 ============

/**
 * 为任意 Registry 生成标准的 tRPC 路由过程
 * 
 * 用法：
 *   const pipelineRegistryRoutes = createRegistryRoutes(pipelineNodeRegistry);
 *   // 自动生成 listItems / listByCategory / getItem / getStats 四个路由
 */
export function createRegistryProcedures<TItem extends RegistryItemMeta>(
  registry: BaseRegistry<TItem>
) {
  return {
    /** 列出所有注册项 */
    listItems: () => registry.listItems(),

    /** 按分类聚合 */
    listByCategory: () => registry.listByCategory(),

    /** 获取单个注册项 */
    getItem: (id: string) => registry.get(id) ?? null,

    /** 按分类过滤 */
    filterByCategory: (category: string) => registry.filterByCategory(category),

    /** 搜索 */
    searchByTags: (tags: string[]) => registry.searchByTags(tags),

    /** 统计 */
    getStats: () => registry.getStats(),
  };
}
