// Qdrant 向量数据库服务模块
// 用于存储和检索诊断知识库
//
// P1-QD1: 安全警告——前端直连 Qdrant 可绕过 nginx 认证层
// TODO: 所有向量库操作应通过 tRPC 代理（server/api/knowledge.router.ts）
// 本文件仅作为开发阶段的临时方案，生产环境必须禁用前端直连
// @deprecated 请使用 tRPC knowledge 路由替代

// Qdrant API 基础地址
// P1-QD1: 生产环境必须通过 nginx 代理，禁止直连 6333 端口
const QDRANT_BASE_URL = import.meta.env.VITE_QDRANT_URL || '/qdrant';

// 集合名称
export const COLLECTIONS = {
  DIAGNOSIS_CASES: 'diagnosis_cases',      // 诊断案例库
  EQUIPMENT_MANUALS: 'equipment_manuals',  // 设备手册
  FAULT_PATTERNS: 'fault_patterns',        // 故障模式库
  MAINTENANCE_GUIDES: 'maintenance_guides' // 维护指南
};

// 知识点接口
export interface KnowledgePoint {
  id: string;
  title: string;
  content: string;
  category: string;
  equipment_type?: string;
  fault_type?: string;
  tags: string[];
  source?: string;
  created_at: string;
  updated_at: string;
}

// 搜索结果接口
export interface SearchResult {
  id: string;
  score: number;
  payload: KnowledgePoint;
}

// 集合信息接口
export interface CollectionInfo {
  name: string;
  vectors_count: number;
  points_count: number;
  status: string;
}

/**
 * 检查 Qdrant 服务是否可用
 */
export async function checkQdrantStatus(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${QDRANT_BASE_URL}/collections`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn('Qdrant 连接检查失败:', error);
    return false;
  }
}

/**
 * 获取所有集合
 */
export async function getCollections(): Promise<CollectionInfo[]> {
  try {
    const response = await fetch(`${QDRANT_BASE_URL}/collections`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Qdrant 响应错误:', response.status, text);
      throw new Error(`获取集合列表失败: ${response.status}`);
    }
    
    const data = await response.json();
    const collections: CollectionInfo[] = [];
    
    for (const col of data.result?.collections || []) {
      try {
        const infoRes = await fetch(`${QDRANT_BASE_URL}/collections/${col.name}`, {
          headers: { 'Accept': 'application/json' }
        });
        const info = await infoRes.json();
        collections.push({
          name: col.name,
          vectors_count: info.result?.vectors_count || 0,
          points_count: info.result?.points_count || 0,
          status: info.result?.status || 'unknown'
        });
      } catch {
        collections.push({
          name: col.name,
          vectors_count: 0,
          points_count: 0,
          status: 'unknown'
        });
      }
    }
    
    return collections;
  } catch (error) {
    console.error('获取集合列表失败:', error);
    throw error;
  }
}

/**
 * 创建集合
 */
export async function createCollection(
  name: string, 
  vectorSize: number = 768  // nomic-embed-text 默认维度
): Promise<void> {
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: 'Cosine'
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.status?.error || '创建集合失败');
  }
}

/**
 * 删除集合
 */
export async function deleteCollection(name: string): Promise<void> {
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${name}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error('删除集合失败');
  }
}

/**
 * 使用 Ollama 生成文本嵌入向量
 */
export async function generateEmbedding(
  text: string,
  model: string = 'nomic-embed-text'
): Promise<number[]> {
  const ollamaUrl = import.meta.env.VITE_OLLAMA_URL || 
    (import.meta.env.DEV ? 'http://localhost:11434' : '');
  
  const response = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: text
    })
  });
  
  if (!response.ok) {
    throw new Error('生成嵌入向量失败');
  }
  
  const data = await response.json();
  return data.embedding;
}

/**
 * 简单的文本向量化（备用方案，当没有嵌入模型时使用）
 * 使用 TF-IDF 风格的简单向量化
 */
export function simpleTextToVector(text: string, size: number = 768): number[] {
  const vector = new Array(size).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % size;
    vector[index] += 1 / (1 + i * 0.1); // 位置权重衰减
  }
  
  // 归一化
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] /= norm;
    }
  }
  
  return vector;
}

/**
 * 添加知识点到集合
 */
export async function addKnowledgePoint(
  collection: string,
  point: KnowledgePoint,
  useEmbedding: boolean = true  // 默认使用 nomic-embed-text
): Promise<void> {
  // 生成向量
  let vector: number[];
  if (useEmbedding) {
    try {
      vector = await generateEmbedding(`${point.title} ${point.content}`);
    } catch {
      // 如果嵌入失败，使用简单向量化
      vector = simpleTextToVector(`${point.title} ${point.content}`);
    }
  } else {
    vector = simpleTextToVector(`${point.title} ${point.content}`);
  }
  
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
        id: point.id,
        vector,
        payload: point
      }]
    })
  });
  
  if (!response.ok) {
    throw new Error('添加知识点失败');
  }
}

/**
 * 批量添加知识点
 */
export async function addKnowledgePoints(
  collection: string,
  points: KnowledgePoint[],
  useEmbedding: boolean = true  // 默认使用 nomic-embed-text
): Promise<void> {
  const pointsWithVectors = await Promise.all(
    points.map(async (point) => {
      let vector: number[];
      if (useEmbedding) {
        try {
          vector = await generateEmbedding(`${point.title} ${point.content}`);
        } catch {
          vector = simpleTextToVector(`${point.title} ${point.content}`);
        }
      } else {
        vector = simpleTextToVector(`${point.title} ${point.content}`);
      }
      return {
        id: point.id,
        vector,
        payload: point
      };
    })
  );
  
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: pointsWithVectors })
  });
  
  if (!response.ok) {
    throw new Error('批量添加知识点失败');
  }
}

/**
 * 搜索相似知识点
 */
export async function searchKnowledge(
  collection: string,
  query: string,
  limit: number = 5,
  useEmbedding: boolean = true,  // 默认使用 nomic-embed-text
  filter?: Record<string, any>
): Promise<SearchResult[]> {
  // 生成查询向量
  let vector: number[];
  if (useEmbedding) {
    try {
      vector = await generateEmbedding(query);
    } catch {
      vector = simpleTextToVector(query);
    }
  } else {
    vector = simpleTextToVector(query);
  }
  
  const body: any = {
    vector,
    limit,
    with_payload: true
  };
  
  if (filter) {
    body.filter = filter;
  }
  
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    throw new Error('搜索失败');
  }
  
  const data = await response.json();
  return (data.result || []).map((item: any) => ({
    id: item.id,
    score: item.score,
    payload: item.payload
  }));
}

/**
 * 获取集合中的所有知识点
 */
export async function getAllKnowledgePoints(
  collection: string,
  limit: number = 100,
  offset: number = 0
): Promise<KnowledgePoint[]> {
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit,
      offset,
      with_payload: true,
      with_vector: false
    })
  });
  
  if (!response.ok) {
    throw new Error('获取知识点失败');
  }
  
  const data = await response.json();
  return (data.result?.points || []).map((item: any) => item.payload);
}

/**
 * 获取集合中的所有向量点（包含向量数据）
 */
export interface VectorPointWithData {
  id: string;
  vector: number[];
  payload: KnowledgePoint;
}

export async function getAllVectorPoints(
  collection: string,
  limit: number = 100,
  offset: number = 0
): Promise<VectorPointWithData[]> {
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit,
      offset,
      with_payload: true,
      with_vector: true  // 获取向量数据
    })
  });
  
  if (!response.ok) {
    throw new Error('获取向量点失败');
  }
  
  const data = await response.json();
  return (data.result?.points || []).map((item: any) => ({
    id: item.id,
    vector: item.vector || [],
    payload: item.payload
  }));
}

/**
 * 删除知识点
 */
export async function deleteKnowledgePoint(
  collection: string,
  pointId: string
): Promise<void> {
  const response = await fetch(`${QDRANT_BASE_URL}/collections/${collection}/points/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [pointId]
    })
  });
  
  if (!response.ok) {
    throw new Error('删除知识点失败');
  }
}

/**
 * 初始化默认知识库（预置诊断案例）
 */
export async function initializeDefaultKnowledge(): Promise<void> {
  // 检查集合是否存在
  const collections = await getCollections();
  const existingNames = collections.map(c => c.name);
  
  // 创建诊断案例集合
  if (!existingNames.includes(COLLECTIONS.DIAGNOSIS_CASES)) {
    await createCollection(COLLECTIONS.DIAGNOSIS_CASES);
    
    // 添加预置诊断案例
    const defaultCases: KnowledgePoint[] = [
      {
        id: 'case-001',
        title: '轴承外圈故障诊断案例',
        content: `设备：离心泵驱动端轴承
现象：振动值从 2.5mm/s 升至 8.2mm/s，频谱中出现明显的 BPFO 特征频率及其倍频
诊断：轴承外圈存在剥落损伤
原因分析：润滑不良导致外圈滚道疲劳剥落
处理措施：更换轴承，改善润滑条件，缩短换油周期
预防建议：定期监测振动趋势，当振动值超过 4mm/s 时加强关注`,
        category: '轴承故障',
        equipment_type: '离心泵',
        fault_type: '外圈故障',
        tags: ['轴承', 'BPFO', '外圈', '剥落'],
        source: '现场案例',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'case-002',
        title: '齿轮箱齿面点蚀诊断案例',
        content: `设备：减速机一级齿轮
现象：齿轮啮合频率 GMF 边带增多，出现调制现象
诊断：齿面存在点蚀损伤
原因分析：齿面接触应力过大，润滑油品质下降
处理措施：更换齿轮，使用更高等级润滑油
预防建议：定期油液分析，监测铁谱颗粒变化`,
        category: '齿轮故障',
        equipment_type: '减速机',
        fault_type: '齿面点蚀',
        tags: ['齿轮', 'GMF', '点蚀', '边带'],
        source: '现场案例',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'case-003',
        title: '电机转子不平衡诊断案例',
        content: `设备：风机电机 75kW
现象：1X 转频振动显著，相位稳定，水平方向振动大于垂直方向
诊断：转子存在不平衡
原因分析：风机叶轮积灰不均匀
处理措施：清理叶轮积灰，必要时进行动平衡校正
预防建议：定期清理叶轮，监测振动趋势`,
        category: '电机故障',
        equipment_type: '风机电机',
        fault_type: '转子不平衡',
        tags: ['电机', '不平衡', '1X', '转频'],
        source: '现场案例',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'case-004',
        title: '离心泵气蚀诊断案例',
        content: `设备：循环水泵
现象：泵出口压力波动，振动中出现宽带高频噪声，伴有异常声响
诊断：泵发生气蚀
原因分析：入口管路堵塞导致 NPSH 不足
处理措施：清理入口滤网，检查入口阀门开度
预防建议：定期检查入口管路，监测入口压力`,
        category: '泵故障',
        equipment_type: '离心泵',
        fault_type: '气蚀',
        tags: ['泵', '气蚀', 'NPSH', '高频噪声'],
        source: '现场案例',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'case-005',
        title: '轴承内圈故障诊断案例',
        content: `设备：压缩机主轴轴承
现象：包络谱中出现 BPFI 特征频率，且随负载变化
诊断：轴承内圈存在裂纹或剥落
原因分析：轴承安装过盈量过大，运行中产生疲劳裂纹
处理措施：更换轴承，检查轴颈尺寸，调整配合公差
预防建议：严格控制安装工艺，使用感应加热安装`,
        category: '轴承故障',
        equipment_type: '压缩机',
        fault_type: '内圈故障',
        tags: ['轴承', 'BPFI', '内圈', '裂纹'],
        source: '现场案例',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    await addKnowledgePoints(COLLECTIONS.DIAGNOSIS_CASES, defaultCases);
  }
  
  // 创建故障模式集合
  if (!existingNames.includes(COLLECTIONS.FAULT_PATTERNS)) {
    await createCollection(COLLECTIONS.FAULT_PATTERNS);
    
    const faultPatterns: KnowledgePoint[] = [
      {
        id: 'pattern-001',
        title: '轴承故障特征频率计算',
        content: `轴承故障特征频率计算公式：
- BPFO（外圈通过频率）= n/2 × fr × (1 - d/D × cosα)
- BPFI（内圈通过频率）= n/2 × fr × (1 + d/D × cosα)  
- BSF（滚动体自转频率）= D/(2d) × fr × (1 - (d/D × cosα)²)
- FTF（保持架转频）= fr/2 × (1 - d/D × cosα)

其中：n=滚动体数量，fr=转频，d=滚动体直径，D=节圆直径，α=接触角

常见轴承故障频谱特征：
- 外圈故障：BPFO 及其倍频，通常伴有转频调制边带
- 内圈故障：BPFI 及其倍频，调制边带更明显
- 滚动体故障：2×BSF 及其倍频
- 保持架故障：FTF 及其倍频，通常较弱`,
        category: '故障模式',
        equipment_type: '轴承',
        fault_type: '特征频率',
        tags: ['轴承', 'BPFO', 'BPFI', 'BSF', 'FTF', '计算公式'],
        source: '技术手册',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'pattern-002',
        title: '齿轮故障频谱特征',
        content: `齿轮啮合频率 GMF = 齿数 × 转频

齿轮故障频谱特征：
1. 正常齿轮：GMF 及其倍频清晰，边带很少
2. 齿面磨损：GMF 幅值增加，出现少量边带
3. 齿面点蚀：GMF 边带增多，间距为转频
4. 断齿：GMF 大幅增加，出现密集边带，可能出现自然频率激励
5. 齿轮偏心：1X 转频增大，GMF 出现转频调制

诊断要点：
- 边带间距反映故障齿轮的转频
- 边带数量反映故障严重程度
- 自然频率激励表明冲击性故障`,
        category: '故障模式',
        equipment_type: '齿轮',
        fault_type: 'GMF分析',
        tags: ['齿轮', 'GMF', '边带', '啮合频率'],
        source: '技术手册',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'pattern-003',
        title: '电机常见故障模式',
        content: `电机振动诊断要点：

1. 转子不平衡
   - 特征：1X 转频为主，相位稳定
   - 原因：质量分布不均、叶轮积灰

2. 不对中
   - 特征：2X 转频明显，轴向振动大
   - 原因：联轴器对中不良

3. 松动
   - 特征：多倍频丰富，1/2X 次谐波
   - 原因：地脚松动、轴承座松动

4. 转子断条（异步电机）
   - 特征：电流频谱中 (1±2s)f 边带
   - s 为转差率，f 为电源频率

5. 定子故障
   - 特征：2f 电磁振动增大
   - 原因：绕组短路、气隙不均`,
        category: '故障模式',
        equipment_type: '电机',
        fault_type: '综合诊断',
        tags: ['电机', '不平衡', '不对中', '松动', '断条'],
        source: '技术手册',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    await addKnowledgePoints(COLLECTIONS.FAULT_PATTERNS, faultPatterns);
  }
}

/**
 * RAG 检索增强：根据用户问题检索相关知识
 */
export async function ragSearch(
  query: string,
  collections: string[] = [COLLECTIONS.DIAGNOSIS_CASES, COLLECTIONS.FAULT_PATTERNS],
  limit: number = 3
): Promise<string> {
  const allResults: SearchResult[] = [];
  
  for (const collection of collections) {
    try {
      const results = await searchKnowledge(collection, query, limit);
      allResults.push(...results);
    } catch (error) {
      console.warn(`搜索集合 ${collection} 失败:`, error);
    }
  }
  
  // 按相似度排序并取前 N 个
  allResults.sort((a, b) => b.score - a.score);
  const topResults = allResults.slice(0, limit);
  
  if (topResults.length === 0) {
    return '';
  }
  
  // 格式化为上下文
  const context = topResults.map((result, index) => {
    const p = result.payload;
    return `【参考资料 ${index + 1}】${p.title}
${p.content}
---`;
  }).join('\n\n');
  
  return context;
}
