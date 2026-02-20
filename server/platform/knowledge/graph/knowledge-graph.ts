/**
 * ============================================================================
 * 知识图谱引擎 (Knowledge Graph Engine)
 * ============================================================================
 *
 * 工业知识图谱核心能力：
 *   1. 三元组管理：CRUD + 批量导入/导出
 *   2. 路径查询：最短路径、因果链追溯
 *   3. 相似度搜索：基于嵌入的语义搜索
 *   4. 推理：规则推理 + 传递闭包
 *   5. 子图提取：按实体/关系类型提取子图
 *
 * 知识分类：
 *   - 设备知识：设备→部件→机构→零件 层级关系
 *   - 故障知识：故障模式→原因→症状→处置 因果链
 *   - 物理知识：物理量→公式→参数→约束
 *   - 运维知识：维护策略→周期→工序→工具
 *   - 场景知识：工况→特征→阈值→规则
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface KGTriple {
  id: string;
  subject: string;
  subjectType: string;
  predicate: string;
  object: string;
  objectType: string;
  confidence: number;
  source: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface KGEntity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  embedding?: number[];
}

export interface KGPath {
  entities: string[];
  relations: string[];
  totalConfidence: number;
  length: number;
}

export interface KGQueryResult {
  triples: KGTriple[];
  entities: KGEntity[];
  paths?: KGPath[];
  totalCount: number;
}

// ============================================================================
// 知识图谱引擎
// ============================================================================

export class KnowledgeGraphEngine {
  private triples: Map<string, KGTriple> = new Map();
  private entities: Map<string, KGEntity> = new Map();
  /** 邻接表：subject → [(predicate, object)] */
  private adjacency: Map<string, { predicate: string; target: string; tripleId: string }[]> = new Map();
  /** 反向邻接表：object → [(predicate, subject)] */
  private reverseAdjacency: Map<string, { predicate: string; source: string; tripleId: string }[]> = new Map();

  /**
   * 添加三元组
   */
  addTriple(triple: Omit<KGTriple, 'id' | 'createdAt' | 'updatedAt'>): KGTriple {
    const id = `triple_${this.triples.size + 1}_${Date.now()}`;
    const fullTriple: KGTriple = {
      ...triple,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.triples.set(id, fullTriple);

    // 更新邻接表
    if (!this.adjacency.has(triple.subject)) this.adjacency.set(triple.subject, []);
    this.adjacency.get(triple.subject)!.push({ predicate: triple.predicate, target: triple.object, tripleId: id });

    if (!this.reverseAdjacency.has(triple.object)) this.reverseAdjacency.set(triple.object, []);
    this.reverseAdjacency.get(triple.object)!.push({ predicate: triple.predicate, source: triple.subject, tripleId: id });

    // 确保实体存在
    this.ensureEntity(triple.subject, triple.subjectType);
    this.ensureEntity(triple.object, triple.objectType);

    return fullTriple;
  }

  /**
   * 批量添加三元组
   */
  addTriples(triples: Omit<KGTriple, 'id' | 'createdAt' | 'updatedAt'>[]): KGTriple[] {
    return triples.map(t => this.addTriple(t));
  }

  /**
   * 查询三元组
   */
  query(filter: {
    subject?: string;
    predicate?: string;
    object?: string;
    subjectType?: string;
    objectType?: string;
    minConfidence?: number;
  }): KGTriple[] {
    let results = Array.from(this.triples.values());

    if (filter.subject) results = results.filter(t => t.subject === filter.subject);
    if (filter.predicate) results = results.filter(t => t.predicate === filter.predicate);
    if (filter.object) results = results.filter(t => t.object === filter.object);
    if (filter.subjectType) results = results.filter(t => t.subjectType === filter.subjectType);
    if (filter.objectType) results = results.filter(t => t.objectType === filter.objectType);
    if (filter.minConfidence !== undefined) results = results.filter(t => t.confidence >= filter.minConfidence!);

    return results;
  }

  /**
   * 最短路径查询（BFS）
   */
  findShortestPath(from: string, to: string, maxDepth: number = 6): KGPath | null {
    if (from === to) return { entities: [from], relations: [], totalConfidence: 1, length: 0 };

    const visited = new Set<string>();
    const queue: { entity: string; path: string[]; relations: string[]; confidence: number }[] = [
      { entity: from, path: [from], relations: [], confidence: 1 },
    ];

    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth) continue;

      const neighbors = this.adjacency.get(current.entity) || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor.target)) continue;

        const triple = this.triples.get(neighbor.tripleId);
        const newConfidence = current.confidence * (triple?.confidence || 1);
        const newPath = [...current.path, neighbor.target];
        const newRelations = [...current.relations, neighbor.predicate];

        if (neighbor.target === to) {
          return {
            entities: newPath,
            relations: newRelations,
            totalConfidence: newConfidence,
            length: newPath.length - 1,
          };
        }

        visited.add(neighbor.target);
        queue.push({ entity: neighbor.target, path: newPath, relations: newRelations, confidence: newConfidence });
      }
    }

    return null;
  }

  /**
   * 因果链追溯（从效果反向查原因）
   */
  traceCausalChain(effect: string, maxDepth: number = 5): KGPath[] {
    const causalPredicates = new Set(['causes', 'leads_to', 'triggers', 'results_in', 'contributes_to']);
    const paths: KGPath[] = [];

    const dfs = (entity: string, path: string[], relations: string[], confidence: number, depth: number) => {
      if (depth >= maxDepth) return;

      const incoming = this.reverseAdjacency.get(entity) || [];
      for (const edge of incoming) {
        if (!causalPredicates.has(edge.predicate)) continue;
        if (path.includes(edge.source)) continue; // 避免环

        const triple = this.triples.get(edge.tripleId);
        const newConf = confidence * (triple?.confidence || 1);
        const newPath = [edge.source, ...path];
        const newRelations = [edge.predicate, ...relations];

        paths.push({
          entities: newPath,
          relations: newRelations,
          totalConfidence: newConf,
          length: newPath.length - 1,
        });

        dfs(edge.source, newPath, newRelations, newConf, depth + 1);
      }
    };

    dfs(effect, [effect], [], 1, 0);
    return paths.sort((a, b) => b.totalConfidence - a.totalConfidence);
  }

  /**
   * 子图提取
   */
  extractSubgraph(centerEntity: string, depth: number = 2): { triples: KGTriple[]; entities: KGEntity[] } {
    const visitedEntities = new Set<string>();
    const resultTriples: KGTriple[] = [];

    const bfs = (entities: string[], currentDepth: number) => {
      if (currentDepth >= depth) return;
      const nextEntities: string[] = [];

      for (const entity of entities) {
        if (visitedEntities.has(entity)) continue;
        visitedEntities.add(entity);

        // 正向
        const forward = this.adjacency.get(entity) || [];
        for (const edge of forward) {
          const triple = this.triples.get(edge.tripleId);
          if (triple) resultTriples.push(triple);
          if (!visitedEntities.has(edge.target)) nextEntities.push(edge.target);
        }

        // 反向
        const backward = this.reverseAdjacency.get(entity) || [];
        for (const edge of backward) {
          const triple = this.triples.get(edge.tripleId);
          if (triple) resultTriples.push(triple);
          if (!visitedEntities.has(edge.source)) nextEntities.push(edge.source);
        }
      }

      if (nextEntities.length > 0) bfs(nextEntities, currentDepth + 1);
    };

    bfs([centerEntity], 0);

    const entities = Array.from(visitedEntities)
      .map(id => this.entities.get(id))
      .filter((e): e is KGEntity => e !== undefined);

    return { triples: resultTriples, entities };
  }

  /**
   * 传递闭包推理
   */
  transitiveInference(entity: string, predicate: string): string[] {
    const results: string[] = [];
    const visited = new Set<string>();

    const traverse = (current: string) => {
      if (visited.has(current)) return;
      visited.add(current);

      const neighbors = this.adjacency.get(current) || [];
      for (const n of neighbors) {
        if (n.predicate === predicate) {
          results.push(n.target);
          traverse(n.target);
        }
      }
    };

    traverse(entity);
    return results;
  }

  /**
   * 加载工业知识模板
   */
  loadIndustrialTemplate(scenario: string): void {
    if (scenario === 'port_crane') {
      this.loadPortCraneKnowledge();
    }
    // 可扩展其他场景
  }

  /**
   * 获取统计信息
   */
  getStats(): { tripleCount: number; entityCount: number; predicateTypes: string[]; entityTypes: string[] } {
    const predicateTypes = new Set<string>();
    const entityTypes = new Set<string>();
    for (const t of this.triples.values()) {
      predicateTypes.add(t.predicate);
      entityTypes.add(t.subjectType);
      entityTypes.add(t.objectType);
    }
    return {
      tripleCount: this.triples.size,
      entityCount: this.entities.size,
      predicateTypes: Array.from(predicateTypes),
      entityTypes: Array.from(entityTypes),
    };
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  private ensureEntity(name: string, type: string): void {
    if (!this.entities.has(name)) {
      this.entities.set(name, { id: name, name, type, properties: {} });
    }
  }

  private loadPortCraneKnowledge(): void {
    const craneTriples: Omit<KGTriple, 'id' | 'createdAt' | 'updatedAt'>[] = [
      // 设备层级
      { subject: '岸桥', subjectType: 'equipment', predicate: 'has_component', object: '起升机构', objectType: 'mechanism', confidence: 0.99, source: 'template' },
      { subject: '岸桥', subjectType: 'equipment', predicate: 'has_component', object: '小车运行机构', objectType: 'mechanism', confidence: 0.99, source: 'template' },
      { subject: '岸桥', subjectType: 'equipment', predicate: 'has_component', object: '大车运行机构', objectType: 'mechanism', confidence: 0.99, source: 'template' },
      { subject: '岸桥', subjectType: 'equipment', predicate: 'has_component', object: '臂架俯仰机构', objectType: 'mechanism', confidence: 0.99, source: 'template' },
      { subject: '岸桥', subjectType: 'equipment', predicate: 'has_component', object: '吊具', objectType: 'mechanism', confidence: 0.99, source: 'template' },
      { subject: '起升机构', subjectType: 'mechanism', predicate: 'has_part', object: '起升电机', objectType: 'part', confidence: 0.99, source: 'template' },
      { subject: '起升机构', subjectType: 'mechanism', predicate: 'has_part', object: '起升减速箱', objectType: 'part', confidence: 0.99, source: 'template' },
      { subject: '起升机构', subjectType: 'mechanism', predicate: 'has_part', object: '起升钢丝绳', objectType: 'part', confidence: 0.99, source: 'template' },
      { subject: '起升机构', subjectType: 'mechanism', predicate: 'has_part', object: '起升制动器', objectType: 'part', confidence: 0.99, source: 'template' },

      // 故障因果链
      { subject: '风载荷', subjectType: 'factor', predicate: 'causes', object: '结构疲劳', objectType: 'failure_mode', confidence: 0.92, source: 'template' },
      { subject: '货物偏心', subjectType: 'factor', predicate: 'causes', object: '结构疲劳', objectType: 'failure_mode', confidence: 0.88, source: 'template' },
      { subject: '结构疲劳', subjectType: 'failure_mode', predicate: 'leads_to', object: '裂纹扩展', objectType: 'failure_mode', confidence: 0.85, source: 'template' },
      { subject: '裂纹扩展', subjectType: 'failure_mode', predicate: 'leads_to', object: '结构失效', objectType: 'failure_mode', confidence: 0.80, source: 'template' },
      { subject: '盐雾腐蚀', subjectType: 'factor', predicate: 'causes', object: '截面削弱', objectType: 'failure_mode', confidence: 0.90, source: 'template' },
      { subject: '截面削弱', subjectType: 'failure_mode', predicate: 'contributes_to', object: '结构疲劳', objectType: 'failure_mode', confidence: 0.85, source: 'template' },
      { subject: '轴承磨损', subjectType: 'failure_mode', predicate: 'causes', object: '振动增大', objectType: 'symptom', confidence: 0.90, source: 'template' },
      { subject: '轴承磨损', subjectType: 'failure_mode', predicate: 'causes', object: '温度升高', objectType: 'symptom', confidence: 0.88, source: 'template' },
      { subject: '润滑不足', subjectType: 'factor', predicate: 'causes', object: '轴承磨损', objectType: 'failure_mode', confidence: 0.92, source: 'template' },

      // 物理知识
      { subject: '风载力矩', subjectType: 'physics', predicate: 'formula', object: 'M=½ρv²Ah/2', objectType: 'formula', confidence: 1.0, source: 'template' },
      { subject: '疲劳增量', subjectType: 'physics', predicate: 'formula', object: 'Δσ=k·M/W', objectType: 'formula', confidence: 1.0, source: 'template' },
      { subject: 'S-N曲线', subjectType: 'physics', predicate: 'formula', object: 'N=C/(Δσ)^m', objectType: 'formula', confidence: 1.0, source: 'template' },
      { subject: '腐蚀速率', subjectType: 'physics', predicate: 'formula', object: 'r=k[Cl⁻][humidity]', objectType: 'formula', confidence: 1.0, source: 'template' },

      // 运维知识
      { subject: '结构疲劳', subjectType: 'failure_mode', predicate: 'treatment', object: '限速运行', objectType: 'action', confidence: 0.85, source: 'template' },
      { subject: '结构疲劳', subjectType: 'failure_mode', predicate: 'treatment', object: '加强检测频次', objectType: 'action', confidence: 0.90, source: 'template' },
      { subject: '轴承磨损', subjectType: 'failure_mode', predicate: 'treatment', object: '更换轴承', objectType: 'action', confidence: 0.95, source: 'template' },
      { subject: '轴承磨损', subjectType: 'failure_mode', predicate: 'treatment', object: '补充润滑', objectType: 'action', confidence: 0.88, source: 'template' },
    ];

    this.addTriples(craneTriples);
  }
}
