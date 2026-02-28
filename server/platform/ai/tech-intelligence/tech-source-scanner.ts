/**
 * ============================================================================
 * 技术来源扫描器 (TechSourceScanner)
 * ============================================================================
 *
 * 扫描外部技术源（论文、标准、专利），提取和过滤与港机设备运维相关的技术。
 * 当前为模拟实现，实际部署时接入真实数据源 API（arXiv、IEEE Xplore、CNKI 等）。
 *
 * 设计原则：
 *   - LLM 优先，规则兜底：相关性评估优先使用 LLM，LLM 不可用时降级为关键词规则
 *   - 物理约束优先：提取的技术必须标注适用的物理域（振动、温度、电流等）
 *   - 降级不崩溃：外部 API 或 LLM 不可用时，返回空结果而非抛出异常
 */

import { createModuleLogger } from '../../../core/logger';
import { invokeLLM } from '../../../core/llm';
import { getAIConfig } from '../ai.config';
import type {
  TechSource,
  TechSourceType,
  ScannedDocument,
  RelevantDocument,
  ExtractedTechnique,
} from '../ai.types';

const log = createModuleLogger('tech-source-scanner');

/** 港机相关关键词（用于规则降级过滤） */
const PORT_MACHINERY_KEYWORDS = [
  '港机', '岸桥', '场桥', '堆场', '起重机', 'crane', 'gantry',
  '振动', 'vibration', '轴承', 'bearing', '齿轮', 'gear',
  '电机', 'motor', '变频器', 'inverter', 'VFD',
  '故障诊断', 'fault diagnosis', '预测性维护', 'predictive maintenance',
  '状态监测', 'condition monitoring', '频谱分析', 'spectrum analysis',
  '包络分析', 'envelope analysis', '深度学习', 'deep learning',
  '卷积神经网络', 'CNN', 'LSTM', 'transformer',
  '疲劳', 'fatigue', '裂纹', 'crack', '磨损', 'wear',
  'IoT', '物联网', '边缘计算', 'edge computing',
];

/**
 * 技术来源扫描器
 *
 * 负责扫描外部技术源，过滤相关文档，提取可用技术方法。
 * 作为技术情报系统 (TechIntelligence) 的数据采集层。
 */
export class TechSourceScanner {
  /**
   * 扫描配置的技术来源
   *
   * 遍历所有已启用的技术来源，调用各来源对应的扫描适配器获取文档。
   * 当前为模拟实现，返回预设的占位文档数据。
   *
   * @param sources - 技术来源配置列表
   * @returns 扫描到的文档列表
   */
  async scan(sources: TechSource[]): Promise<ScannedDocument[]> {
    const enabledSources = sources.filter(s => s.enabled);
    log.info({ sourceCount: enabledSources.length }, '开始扫描技术来源');

    const config = getAIConfig().intelligence;
    const allDocs: ScannedDocument[] = [];

    for (const source of enabledSources) {
      try {
        const docs = await this.scanSource(source);
        allDocs.push(...docs);
        log.info(
          { source: source.name, type: source.type, docCount: docs.length },
          '来源扫描完成'
        );
      } catch (err) {
        log.warn(
          { source: source.name, err: (err as Error).message },
          '来源扫描失败，跳过该来源'
        );
      }
    }

    // 按配置限制最大文档数
    const limited = allDocs.slice(0, config.maxDocumentsPerScan);
    log.info(
      { total: allDocs.length, limited: limited.length },
      '技术来源扫描完成'
    );
    return limited;
  }

  /**
   * 按相关性过滤文档
   *
   * 使用 LLM 对每篇文档进行相关性评分（0~1），
   * 过滤掉低于阈值的文档，并为相关文档生成摘要。
   * LLM 不可用时降级为关键词规则过滤。
   *
   * @param docs - 待过滤的扫描文档
   * @returns 经过相关性筛选的文档列表
   */
  async filterByRelevance(docs: ScannedDocument[]): Promise<RelevantDocument[]> {
    if (docs.length === 0) return [];

    const config = getAIConfig().intelligence;
    log.info({ docCount: docs.length, threshold: config.relevanceThreshold }, '开始相关性过滤');

    try {
      const results: RelevantDocument[] = [];

      for (const doc of docs) {
        const prompt = `你是港机设备智能运维领域的技术情报分析师。
请评估以下学术文档与港机设备故障诊断、预测性维护、状态监测的相关性。

文档标题: ${doc.title}
文档摘要: ${doc.abstract ?? '无摘要'}
来源类型: ${doc.sourceType}
发布日期: ${doc.publishDate ?? '未知'}

请以 JSON 格式返回：
{
  "relevanceScore": 0.0~1.0,
  "summary": "与港机运维的关联性摘要（中文，50字以内）",
  "applicableEquipment": ["适用的设备类型列表"],
  "reasoning": "评分理由（简要）"
}

评分标准：
- 1.0: 直接针对港机/起重机设备的诊断方法
- 0.7~0.9: 通用工业设备诊断方法，可迁移到港机
- 0.4~0.6: 相关但需要大量适配的方法
- 0.0~0.3: 与港机运维无直接关联`;

        const result = await invokeLLM({
          messages: [
            { role: 'system', content: '你是港机设备技术情报分析师，专注评估技术文档的相关性。请严格以 JSON 格式返回结果。' },
            { role: 'user', content: prompt },
          ],
          model: config.analysisModel,
          maxTokens: 500,
        });

        const content = typeof result.choices[0]?.message?.content === 'string'
          ? result.choices[0].message.content
          : '';

        try {
          const parsed = JSON.parse(this.extractJson(content));
          if (parsed.relevanceScore >= config.relevanceThreshold) {
            results.push({
              ...doc,
              relevanceScore: Math.min(1, Math.max(0, parsed.relevanceScore)),
              summary: parsed.summary ?? '（摘要生成失败）',
              applicableEquipment: parsed.applicableEquipment ?? [],
            });
          }
        } catch (parseErr) {
          log.warn({ title: doc.title }, 'LLM 返回内容解析失败，跳过该文档');
        }
      }

      log.info(
        { input: docs.length, output: results.length },
        '相关性过滤完成（LLM 模式）'
      );
      return results;
    } catch (err) {
      log.warn(
        { err: (err as Error).message },
        'LLM 相关性过滤失败，降级为规则过滤'
      );
      return this.filterByRules(docs);
    }
  }

  /**
   * 从文档提取技术方法
   *
   * 使用 LLM 从单篇文档中提取结构化的技术方法描述，
   * 包括方法名称、类别、适用域、新颖性评分等。
   * LLM 不可用时返回基于标题的简化提取结果。
   *
   * @param doc - 待提取的文档
   * @returns 提取出的技术方法列表
   */
  async extractTechniques(doc: ScannedDocument): Promise<ExtractedTechnique[]> {
    log.debug({ title: doc.title }, '提取文档技术方法');

    const config = getAIConfig().intelligence;

    try {
      const prompt = `你是港机设备技术情报分析师。请从以下文档中提取可用于港机设备诊断和维护的技术方法。

文档标题: ${doc.title}
文档摘要: ${doc.abstract ?? '无摘要'}
来源类型: ${doc.sourceType}

请以 JSON 数组格式返回提取的技术方法：
[
  {
    "name": "技术方法名称",
    "category": "类别（vibration/bearing/electrical/gear/thermal/structural/anomaly/general）",
    "description": "方法描述（中文，100字以内）",
    "reportedAccuracy": 报告精度（0~1，如未报告则为 null）,
    "applicableDomain": "适用领域描述",
    "noveltyScore": 新颖性评分（0~1, 1=全新方法, 0=已有成熟方法）
  }
]

提取要求：
- 只提取有实质创新的技术方法，不提取综述性总结
- category 必须是上述枚举值之一
- noveltyScore 参考：传统信号处理=0.1~0.3, 机器学习改进=0.4~0.6, 全新架构=0.7~1.0
- 如果文档未提供明确精度数据，reportedAccuracy 设为 null`;

      const result = await invokeLLM({
        messages: [
          { role: 'system', content: '你是港机设备技术情报分析师。请严格以 JSON 数组格式返回结果。' },
          { role: 'user', content: prompt },
        ],
        model: config.analysisModel,
        maxTokens: config.sketchMaxTokens,
      });

      const content = typeof result.choices[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : '';

      const parsed = JSON.parse(this.extractJson(content));
      const techniques: ExtractedTechnique[] = (Array.isArray(parsed) ? parsed : []).map(
        (t: Record<string, unknown>) => ({
          name: String(t.name ?? '未命名技术'),
          category: String(t.category ?? 'general'),
          description: String(t.description ?? ''),
          reportedAccuracy: typeof t.reportedAccuracy === 'number' ? t.reportedAccuracy : undefined,
          applicableDomain: String(t.applicableDomain ?? ''),
          sourceDocument: doc.title,
          noveltyScore: typeof t.noveltyScore === 'number'
            ? Math.min(1, Math.max(0, t.noveltyScore))
            : 0.5,
        })
      );

      log.debug({ title: doc.title, techniqueCount: techniques.length }, '技术方法提取完成');
      return techniques;
    } catch (err) {
      log.warn(
        { title: doc.title, err: (err as Error).message },
        'LLM 技术提取失败，返回基于标题的简化结果'
      );
      // 降级：基于标题生成一条简化技术
      return [{
        name: doc.title,
        category: 'general',
        description: doc.abstract ?? doc.title,
        applicableDomain: '港机设备诊断（待评估）',
        sourceDocument: doc.title,
        noveltyScore: 0.5,
      }];
    }
  }

  /**
   * 扫描单个来源（模拟实现）
   *
   * 在生产环境中，每种来源类型对应独立的 API 适配器：
   *   - arxiv: arXiv API (https://export.arxiv.org/api/query)
   *   - ieee: IEEE Xplore API
   *   - standard: ISO/IEC 标准数据库
   *   - patent: WIPO/CNIPA 专利检索
   *   - industry_report: 行业报告数据库
   *
   * @param source - 技术来源配置
   * @returns 扫描到的文档列表
   */
  private async scanSource(source: TechSource): Promise<ScannedDocument[]> {
    log.debug({ source: source.name, type: source.type }, '扫描单个来源');

    // 模拟数据 — 按来源类型返回不同的预设文档
    const simulatedDocs = this.getSimulatedDocs(source.type);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 50));

    return simulatedDocs.map(doc => ({
      ...doc,
      sourceType: source.type,
      scannedAt: Date.now(),
    }));
  }

  /**
   * LLM 降级：基于关键词的规则过滤
   *
   * 当 LLM 不可用时，使用硬编码的港机相关关键词进行匹配。
   * 匹配得分 = 命中关键词数 / 总关键词数（归一化到 0~1）。
   *
   * @param docs - 待过滤的文档
   * @returns 基于规则筛选的相关文档
   */
  private filterByRules(docs: ScannedDocument[]): RelevantDocument[] {
    const config = getAIConfig().intelligence;
    const results: RelevantDocument[] = [];

    for (const doc of docs) {
      const text = `${doc.title} ${doc.abstract ?? ''}`.toLowerCase();
      let matchCount = 0;

      for (const keyword of PORT_MACHINERY_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) {
          matchCount++;
        }
      }

      const relevanceScore = Math.min(1, matchCount / 5); // 5 个关键词命中即为满分

      if (relevanceScore >= config.relevanceThreshold) {
        results.push({
          ...doc,
          relevanceScore,
          summary: `基于关键词匹配（命中 ${matchCount} 个港机相关关键词）`,
          applicableEquipment: ['通用港机设备'],
        });
      }
    }

    log.info(
      { input: docs.length, output: results.length },
      '规则过滤完成（降级模式）'
    );
    return results;
  }

  /**
   * 从 LLM 返回内容中提取 JSON 字符串
   *
   * LLM 可能在 JSON 前后附加说明文字或 markdown 代码块标记，
   * 本方法尝试提取有效的 JSON 部分。
   *
   * @param content - LLM 原始返回内容
   * @returns 提取出的 JSON 字符串
   */
  private extractJson(content: string): string {
    // 尝试提取 ```json ... ``` 代码块
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    // 尝试提取 [ ... ] 或 { ... }
    const jsonMatch = content.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return content.trim();
  }

  /**
   * 获取模拟文档数据
   *
   * 按来源类型返回预设的模拟文档。
   * 生产环境中此方法将被真实 API 调用替代。
   *
   * @param sourceType - 技术来源类型
   * @returns 模拟的文档列表
   */
  private getSimulatedDocs(sourceType: TechSourceType): Omit<ScannedDocument, 'sourceType' | 'scannedAt'>[] {
    switch (sourceType) {
      case 'arxiv':
        return [
          {
            title: 'Deep Transfer Learning for Bearing Fault Diagnosis in Port Crane Hoisting Mechanisms',
            authors: ['Zhang, W.', 'Li, H.', 'Chen, X.'],
            url: 'https://arxiv.org/abs/2024.xxxxx',
            publishDate: '2024-11',
            abstract: 'This paper proposes a domain adaptation approach for transferring bearing fault diagnosis models trained on laboratory data to real-world port crane hoisting mechanisms. The method achieves 94.2% accuracy on field data with minimal labeled samples.',
          },
          {
            title: 'Vibration-based Condition Monitoring of Gearbox in Container Cranes Using Attention-LSTM',
            authors: ['Wang, Y.', 'Liu, J.'],
            url: 'https://arxiv.org/abs/2024.yyyyy',
            publishDate: '2024-09',
            abstract: 'An attention-enhanced LSTM network is proposed for real-time gearbox condition monitoring in container cranes. The model captures temporal dependencies in vibration signals and achieves 91.5% fault detection rate.',
          },
          {
            title: 'Multi-sensor Fusion for Predictive Maintenance of Quay Cranes: A Transformer-based Approach',
            authors: ['Liu, M.', 'Zhou, K.', 'Tan, S.'],
            url: 'https://arxiv.org/abs/2025.zzzzz',
            publishDate: '2025-01',
            abstract: 'We present a multi-modal transformer architecture that fuses vibration, temperature, and current signals for remaining useful life prediction of quay crane components. The model outperforms traditional methods by 18% in RUL estimation accuracy.',
          },
        ];

      case 'ieee':
        return [
          {
            title: 'Intelligent Fault Diagnosis of Port Machinery Using Edge Computing and Federated Learning',
            authors: ['Park, S.', 'Kim, J.'],
            url: 'https://ieeexplore.ieee.org/document/xxxxxxx',
            publishDate: '2024-10',
            abstract: 'This paper presents a federated learning framework for distributed fault diagnosis across multiple port cranes. Edge devices perform local model training while preserving data privacy, achieving comparable accuracy to centralized approaches.',
          },
          {
            title: 'Motor Current Signature Analysis for Crane Hoist Motor Fault Detection',
            authors: ['Garcia, R.', 'Santos, M.'],
            url: 'https://ieeexplore.ieee.org/document/yyyyyyy',
            publishDate: '2024-12',
            abstract: 'An enhanced MCSA method is proposed for detecting incipient faults in crane hoist motors. The method combines wavelet decomposition with random forest classification, achieving 89.3% accuracy on real-world crane motor data.',
          },
        ];

      case 'standard':
        return [
          {
            title: 'ISO 10816-7:2024 — Vibration Measurement and Evaluation of Machines — Part 7: Rotary Shaft Cranes',
            authors: ['ISO TC 108/SC 2'],
            url: 'https://www.iso.org/standard/xxxxx.html',
            publishDate: '2024-06',
            abstract: 'Updated vibration severity criteria for rotary shaft cranes, including revised threshold values for zone boundaries and new guidelines for condition monitoring of crane-specific components.',
          },
        ];

      case 'patent':
        return [
          {
            title: '一种基于数字孪生的港口起重机预测性维护系统及方法',
            authors: ['振华重工技术中心'],
            url: 'https://patents.example.com/CN2024xxxxx',
            publishDate: '2024-08',
            abstract: '本发明公开了一种基于数字孪生技术的港口起重机预测性维护系统，通过建立设备的物理-数据混合模型，实时监测设备状态并预测关键部件剩余寿命。',
          },
        ];

      case 'industry_report':
        return [
          {
            title: '2024 全球港口智能化运维技术发展报告',
            authors: ['中国港口协会'],
            publishDate: '2024-12',
            abstract: '报告综述了全球主要港口在智能运维领域的技术应用现状和发展趋势，涵盖状态监测、故障诊断、预测性维护等核心技术领域。',
          },
        ];

      default:
        return [];
    }
  }
}
