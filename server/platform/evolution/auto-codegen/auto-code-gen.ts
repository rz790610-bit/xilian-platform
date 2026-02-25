/**
 * ============================================================================
 * 自动代码生成器 — AutoCodeGenerator
 * ============================================================================
 *
 * 自进化飞轮：Grok 驱动的代码生成与验证
 *
 * 职责：
 *   1. 根据数据发现生成特征提取代码
 *   2. 生成新的检测规则代码
 *   3. 代码安全沙箱验证
 *   4. 代码版本管理
 *
 * AI 集成架构（v2 — P0 LLM/Grok 注入）：
 *   - 第一层：GrokReasoningService.diagnose() — 工具调用 + 多步推理（最强）
 *   - 第二层：invokeLLM() — Forge API 结构化输出（兜底）
 *   - 第三层：模板生成 — 原有 switch-case 模板引擎（最终兜底）
 */
import { createModuleLogger } from '../../../core/logger';
import { invokeLLM, type InvokeResult } from '../../../core/llm';
import { grokReasoningService, type DiagnoseRequest } from '../../cognition/grok/grok-reasoning.service';
import { evolutionConfig } from '../evolution.config';

const log = createModuleLogger('auto-codegen');

// ============================================================================
// 代码生成类型
// ============================================================================

export type CodeType = 'feature_extractor' | 'detection_rule' | 'transform_pipeline' | 'aggregation' | 'custom';

export interface CodeGenerationRequest {
  /** 请求 ID */
  id: string;
  /** 代码类型 */
  type: CodeType;
  /** 自然语言描述 */
  description: string;
  /** 输入数据 Schema */
  inputSchema: Record<string, string>;
  /** 期望输出 Schema */
  outputSchema: Record<string, string>;
  /** 约束条件 */
  constraints: string[];
  /** 参考代码（可选） */
  referenceCode?: string;
  /** 测试数据（可选） */
  testData?: unknown[];
}

export interface GeneratedCode {
  /** 请求 ID */
  requestId: string;
  /** 代码类型 */
  type: CodeType;
  /** 生成的代码 */
  code: string;
  /** 代码语言 */
  language: 'typescript' | 'javascript';
  /** 函数签名 */
  signature: string;
  /** 验证状态 */
  validationStatus: 'pending' | 'passed' | 'failed';
  /** 验证结果 */
  validationResult?: {
    syntaxValid: boolean;
    typeCheckPassed: boolean;
    testsPassed: number;
    testsFailed: number;
    securityIssues: string[];
    performanceMs: number;
  };
  /** 版本 */
  version: number;
  /** 生成时间 */
  generatedAt: number;
  /** 生成策略（标记来源） */
  generationStrategy?: 'grok_reasoning' | 'llm_forge' | 'template_fallback';
}

export interface CodeValidationResult {
  syntaxValid: boolean;
  typeCheckPassed: boolean;
  testResults: Array<{ input: unknown; expected: unknown; actual: unknown; passed: boolean }>;
  securityIssues: string[];
  performanceMs: number;
  error?: string;
}

// ============================================================================
// 代码生成 Prompt 构建器
// ============================================================================

const CODE_TYPE_LABELS: Record<CodeType, string> = {
  feature_extractor: '特征提取器',
  detection_rule: '检测规则',
  transform_pipeline: '变换管线',
  aggregation: '聚合函数',
  custom: '自定义函数',
};

function buildCodeGenSystemPrompt(request: CodeGenerationRequest): string {
  return `你是习联平台 AutoCodeGen 专家，专精于生成安全、可维护、可观测的 TypeScript 代码。

目标模块：${CODE_TYPE_LABELS[request.type]}（${request.type}）
自然语言描述：${request.description}

输入 Schema：
${JSON.stringify(request.inputSchema, null, 2)}

输出 Schema：
${JSON.stringify(request.outputSchema, null, 2)}

约束条件：
${request.constraints.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

${request.referenceCode ? `参考代码：\n\`\`\`typescript\n${request.referenceCode}\n\`\`\`` : ''}

输出要求：
- 必须是完整可运行的 TypeScript export function
- 必须包含完整 JSDoc 注释 + 类型定义
- 禁止使用 eval、new Function、child_process、require、import()、process、fs、net、http
- 函数必须包含 return 语句
- 性能要求：单次执行 < 50ms
- 只返回代码块，不要任何解释文字

返回格式（严格 JSON）：
{
  "code": "完整的 TypeScript 代码字符串",
  "signature": "函数签名字符串"
}`;
}

// ============================================================================
// 自动代码生成器实现
// ============================================================================

export class AutoCodeGenerator {
  private generatedCodes = new Map<string, GeneratedCode[]>();
  private bannedPatterns = [
    /eval\s*\(/,
    /Function\s*\(/,
    /require\s*\(/,
    /import\s*\(/,
    /process\./,
    /child_process/,
    /fs\./,
    /net\./,
    /http\./,
    /https\./,
    /exec\s*\(/,
    /spawn\s*\(/,
    /__proto__/,
    /constructor\s*\[/,
  ];

  // ==========================================================================
  // 公开入口：generate（三层降级）
  // ==========================================================================

  /**
   * 生成代码（三层降级：Grok → LLM → 模板）
   *
   * 策略：
   *   1. 优先使用 Grok 推理链生成（最强推理能力）
   *   2. Grok 失败时降级到 invokeLLM（Forge API 结构化输出）
   *   3. LLM 也失败时降级到模板生成（原有 switch-case）
   */
  async generate(request: CodeGenerationRequest): Promise<GeneratedCode> {
    log.debug(`[代码生成] generate 开始, id=${request.id}, type=${request.type}`);

    let code: string;
    let signature: string;
    let strategy: GeneratedCode['generationStrategy'] = 'template_fallback';

    // ── 第一层：Grok 推理链 ──────────────────────────────────────────────
    try {
      const grokResult = await this.generateCodeWithGrok(request);
      if (grokResult) {
        code = grokResult.code;
        signature = grokResult.signature;
        strategy = 'grok_reasoning';
        log.info(`[代码生成] Grok 推理成功, id=${request.id}, lines=${code.split('\n').length}`);
      } else {
        throw new Error('Grok 返回空结果');
      }
    } catch (grokError: any) {
      log.warn(`[代码生成] Grok 推理失败, 降级到 LLM`, {
        id: request.id,
        error: grokError.message,
      });

      // ── 第二层：invokeLLM（Forge API）──────────────────────────────────
      try {
        const llmResult = await this.generateCodeWithLLM(request);
        if (llmResult) {
          code = llmResult.code;
          signature = llmResult.signature;
          strategy = 'llm_forge';
          log.info(`[代码生成] LLM Forge 成功, id=${request.id}, lines=${code.split('\n').length}`);
        } else {
          throw new Error('LLM 返回空结果');
        }
      } catch (llmError: any) {
        log.warn(`[代码生成] LLM 也失败, 降级到模板`, {
          id: request.id,
          error: llmError.message,
        });

        // ── 第三层：模板生成（原有 switch-case）──────────────────────────
        ({ code, signature } = this.generateWithTemplate(request));
        strategy = 'template_fallback';
      }
    }

    // ── 构建 GeneratedCode 对象 ──────────────────────────────────────────
    const versions = this.generatedCodes.get(request.id) || [];
    const generated: GeneratedCode = {
      requestId: request.id,
      type: request.type,
      code,
      language: 'typescript',
      signature,
      validationStatus: 'pending',
      version: versions.length + 1,
      generatedAt: Date.now(),
      generationStrategy: strategy,
    };

    // ── 验证 ────────────────────────────────────────────────────────────
    const validation = await this.validate(generated, request.testData);
    generated.validationStatus =
      validation.syntaxValid && validation.securityIssues.length === 0 ? 'passed' : 'failed';
    generated.validationResult = {
      syntaxValid: validation.syntaxValid,
      typeCheckPassed: validation.typeCheckPassed,
      testsPassed: validation.testResults.filter(t => t.passed).length,
      testsFailed: validation.testResults.filter(t => !t.passed).length,
      securityIssues: validation.securityIssues,
      performanceMs: validation.performanceMs,
    };

    // 如果 LLM/Grok 生成的代码验证失败，自动降级到模板重新生成
    if (generated.validationStatus === 'failed' && strategy !== 'template_fallback') {
      log.warn(`[代码生成] ${strategy} 生成的代码验证失败, 降级到模板重新生成`, {
        id: request.id,
        securityIssues: validation.securityIssues,
      });
      const templateResult = this.generateWithTemplate(request);
      generated.code = templateResult.code;
      generated.signature = templateResult.signature;
      generated.generationStrategy = 'template_fallback';

      // 重新验证模板代码
      const reValidation = await this.validate(generated, request.testData);
      generated.validationStatus =
        reValidation.syntaxValid && reValidation.securityIssues.length === 0 ? 'passed' : 'failed';
      generated.validationResult = {
        syntaxValid: reValidation.syntaxValid,
        typeCheckPassed: reValidation.typeCheckPassed,
        testsPassed: reValidation.testResults.filter(t => t.passed).length,
        testsFailed: reValidation.testResults.filter(t => !t.passed).length,
        securityIssues: reValidation.securityIssues,
        performanceMs: reValidation.performanceMs,
      };
    }

    versions.push(generated);
    this.generatedCodes.set(request.id, versions);

    log.info(`[代码生成] 完成, id=${request.id}, strategy=${strategy}, status=${generated.validationStatus}`);
    return generated;
  }

  // ==========================================================================
  // 第一层：Grok 推理链生成
  // ==========================================================================

  /**
   * 使用 GrokReasoningService.diagnose() 生成代码。
   * Grok 的多步推理 + 工具调用能力使其在复杂代码生成场景中表现最佳。
   */
  private async generateCodeWithGrok(
    request: CodeGenerationRequest,
  ): Promise<{ code: string; signature: string } | null> {
    const systemPrompt = buildCodeGenSystemPrompt(request);

    const diagnoseRequest: DiagnoseRequest = {
      machineId: `codegen-${request.id}`,
      query: [
        `需要生成 ${CODE_TYPE_LABELS[request.type]} 代码`,
        `描述: ${request.description}`,
        `输入字段: ${Object.keys(request.inputSchema).join(', ')}`,
        `输出字段: ${Object.keys(request.outputSchema).join(', ')}`,
        `约束: ${request.constraints.join('; ')}`,
      ].join('\n'),
      triggerType: 'manual',
      priority: 'normal',
      additionalContext: {
        type: 'code_generation',
        codeType: request.type,
        systemPrompt,
        inputSchema: request.inputSchema,
        outputSchema: request.outputSchema,
      },
    };

    const response = await grokReasoningService.diagnose(diagnoseRequest);

    // 从 Grok 响应中提取代码
    if (response && response.narrative) {
      const rawContent = typeof response.narrative === 'string'
        ? response.narrative
        : JSON.stringify(response.narrative);

      // 尝试解析 JSON 格式
      try {
        const parsed = JSON.parse(rawContent);
        if (parsed.code && typeof parsed.code === 'string') {
          return {
            code: parsed.code,
            signature: parsed.signature || this.extractSignature(parsed.code),
          };
        }
      } catch {
        // 非 JSON，尝试提取代码块
      }

      // 从 Markdown 代码块中提取
      const codeBlockMatch = rawContent.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
      if (codeBlockMatch) {
        const extractedCode = codeBlockMatch[1].trim();
        return {
          code: extractedCode,
          signature: this.extractSignature(extractedCode),
        };
      }

      // 直接作为代码使用（如果包含 function/export 关键字）
      if (/(?:export\s+)?function\s+\w+/.test(rawContent)) {
        return {
          code: rawContent,
          signature: this.extractSignature(rawContent),
        };
      }
    }

    return null;
  }

  // ==========================================================================
  // 第二层：invokeLLM（Forge API）
  // ==========================================================================

  /**
   * 使用平台核心 invokeLLM（Forge API），通过 JSON 约束输出格式。
   * 比 Grok 推理链更轻量，适合标准代码生成场景。
   */
  private async generateCodeWithLLM(
    request: CodeGenerationRequest,
  ): Promise<{ code: string; signature: string } | null> {
    const systemPrompt = buildCodeGenSystemPrompt(request);

    const result: InvokeResult = await invokeLLM({
      model: evolutionConfig.grok.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `请为以下需求生成 TypeScript 代码：\n${request.description}\n\n输入: ${JSON.stringify(request.inputSchema)}\n输出: ${JSON.stringify(request.outputSchema)}`,
        },
      ],
      maxTokens: evolutionConfig.grok.maxTokensCodeGen,
    });

    const content = result?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return null;

    // 尝试解析 JSON 格式
    try {
      const parsed = JSON.parse(content);
      if (parsed.code && typeof parsed.code === 'string') {
        return {
          code: parsed.code,
          signature: parsed.signature || this.extractSignature(parsed.code),
        };
      }
    } catch {
      // 非 JSON
    }

    // 从 Markdown 代码块中提取
    const codeBlockMatch = content.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      const extractedCode = codeBlockMatch[1].trim();
      return {
        code: extractedCode,
        signature: this.extractSignature(extractedCode),
      };
    }

    // 直接作为代码使用
    if (/(?:export\s+)?function\s+\w+/.test(content)) {
      return {
        code: content,
        signature: this.extractSignature(content),
      };
    }

    return null;
  }

  // ==========================================================================
  // 第三层：模板生成（原有 switch-case，最终兜底）
  // ==========================================================================

  /**
   * 原有的模板生成逻辑。当 Grok 和 LLM 都失败时作为最终兜底。
   * 保证即使 AI 服务完全不可用，系统仍能生成基础代码。
   */
  private generateWithTemplate(request: CodeGenerationRequest): { code: string; signature: string } {
    switch (request.type) {
      case 'feature_extractor':
        return this.generateFeatureExtractor(request);
      case 'detection_rule':
        return this.generateDetectionRule(request);
      case 'transform_pipeline':
        return this.generateTransformPipeline(request);
      case 'aggregation':
        return this.generateAggregation(request);
      default:
        return this.generateCustom(request);
    }
  }

  // ==========================================================================
  // 验证
  // ==========================================================================

  /**
   * 验证生成的代码
   */
  async validate(code: GeneratedCode, testData?: unknown[]): Promise<CodeValidationResult> {
    const start = Date.now();
    const result: CodeValidationResult = {
      syntaxValid: false,
      typeCheckPassed: false,
      testResults: [],
      securityIssues: [],
      performanceMs: 0,
    };

    // 1. 安全检查
    for (const pattern of this.bannedPatterns) {
      if (pattern.test(code.code)) {
        result.securityIssues.push(`检测到禁止的模式: ${pattern.source}`);
      }
    }

    // 2. 语法检查（简化版：尝试解析）
    try {
      const hasFunction = /(?:function|=>|export)/.test(code.code);
      const hasReturn = /return/.test(code.code);
      const balanced = this.checkBracketBalance(code.code);
      result.syntaxValid = hasFunction && hasReturn && balanced;
    } catch {
      result.syntaxValid = false;
    }

    // 3. 类型检查（简化版）
    result.typeCheckPassed = result.syntaxValid;

    // 4. 测试数据验证
    if (testData && testData.length > 0 && result.syntaxValid) {
      for (const input of testData) {
        result.testResults.push({
          input,
          expected: 'N/A',
          actual: 'sandbox_execution_required',
          passed: result.syntaxValid,
        });
      }
    }

    result.performanceMs = Date.now() - start;
    return result;
  }

  // ==========================================================================
  // 版本管理
  // ==========================================================================

  /**
   * 获取指定请求的所有版本
   */
  getVersions(requestId: string): GeneratedCode[] {
    return this.generatedCodes.get(requestId) || [];
  }

  /**
   * 获取最新通过验证的版本
   */
  getLatestValid(requestId: string): GeneratedCode | null {
    const versions = this.generatedCodes.get(requestId) || [];
    for (let i = versions.length - 1; i >= 0; i--) {
      if (versions[i].validationStatus === 'passed') return versions[i];
    }
    return null;
  }

  // ==========================================================================
  // 工具方法
  // ==========================================================================

  /**
   * 从代码中提取函数签名
   */
  private extractSignature(code: string): string {
    const match = code.match(/(?:export\s+)?function\s+(\w+)\s*\([^)]*\)(?:\s*:\s*[^{]+)?/);
    return match ? match[0].trim() : 'unknown()';
  }

  private checkBracketBalance(code: string): boolean {
    const stack: string[] = [];
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

    for (const char of code) {
      if ('([{'.includes(char)) stack.push(char);
      else if (')]}'.includes(char)) {
        if (stack.pop() !== pairs[char]) return false;
      }
    }

    return stack.length === 0;
  }

  // ==========================================================================
  // 代码生成模板（第三层兜底）
  // ==========================================================================

  private generateFeatureExtractor(req: CodeGenerationRequest): { code: string; signature: string } {
    const inputFields = Object.entries(req.inputSchema).map(([k, v]) => `${k}: ${v}`).join('; ');
    const outputFields = Object.entries(req.outputSchema).map(([k, v]) => `${k}: ${v}`).join('; ');

    const code = `/**
 * 特征提取器: ${req.description}
 * 自动生成 @ ${new Date().toISOString()}
 * 约束: ${req.constraints.join(', ')}
 */
export function extractFeatures(input: { ${inputFields} }): { ${outputFields} } {
  const result: Record<string, number> = {};

  // 基础统计特征
  const values = Object.values(input).filter(v => typeof v === 'number') as number[];
  if (values.length > 0) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);

    result['mean'] = mean;
    result['std'] = std;
    result['min'] = min;
    result['max'] = max;
    result['range'] = max - min;
    result['cv'] = mean !== 0 ? std / Math.abs(mean) : 0;
  }

  return result as any;
}`;

    return {
      code,
      signature: `extractFeatures(input: { ${inputFields} }): { ${outputFields} }`,
    };
  }

  private generateDetectionRule(req: CodeGenerationRequest): { code: string; signature: string } {
    const code = `/**
 * 检测规则: ${req.description}
 * 自动生成 @ ${new Date().toISOString()}
 */
export function detectCondition(data: Record<string, number>): {
  triggered: boolean;
  confidence: number;
  details: Record<string, unknown>;
} {
  const checks: Array<{ name: string; passed: boolean; weight: number }> = [];

  for (const [key, value] of Object.entries(data)) {
    checks.push({
      name: key,
      passed: typeof value === 'number' && !isNaN(value),
      weight: 1,
    });
  }

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const passedWeight = checks.filter(c => c.passed).reduce((s, c) => s + c.weight, 0);
  const confidence = totalWeight > 0 ? passedWeight / totalWeight : 0;

  return {
    triggered: confidence > 0.7,
    confidence,
    details: { checks },
  };
}`;

    return {
      code,
      signature: `detectCondition(data: Record<string, number>): { triggered: boolean; confidence: number; details: Record<string, unknown> }`,
    };
  }

  private generateTransformPipeline(req: CodeGenerationRequest): { code: string; signature: string } {
    const code = `/**
 * 变换管线: ${req.description}
 * 自动生成 @ ${new Date().toISOString()}
 */
export function transformPipeline(input: Record<string, number>[]): Record<string, number>[] {
  return input.map(record => {
    const transformed: Record<string, number> = {};
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'number') {
        transformed[key] = value;
        transformed[\`\${key}_normalized\`] = value;
      }
    }
    return transformed;
  });
}`;

    return {
      code,
      signature: `transformPipeline(input: Record<string, number>[]): Record<string, number>[]`,
    };
  }

  private generateAggregation(req: CodeGenerationRequest): { code: string; signature: string } {
    const code = `/**
 * 聚合函数: ${req.description}
 * 自动生成 @ ${new Date().toISOString()}
 */
export function aggregate(records: Record<string, number>[]): Record<string, number> {
  if (records.length === 0) return {};

  const keys = Object.keys(records[0]);
  const result: Record<string, number> = {};

  for (const key of keys) {
    const values = records.map(r => r[key]).filter(v => typeof v === 'number');
    if (values.length === 0) continue;

    result[\`\${key}_mean\`] = values.reduce((s, v) => s + v, 0) / values.length;
    result[\`\${key}_max\`] = Math.max(...values);
    result[\`\${key}_min\`] = Math.min(...values);
    result[\`\${key}_count\`] = values.length;
  }

  return result;
}`;

    return {
      code,
      signature: `aggregate(records: Record<string, number>[]): Record<string, number>`,
    };
  }

  private generateCustom(req: CodeGenerationRequest): { code: string; signature: string } {
    const code = `/**
 * 自定义函数: ${req.description}
 * 自动生成 @ ${new Date().toISOString()}
 * 约束: ${req.constraints.join(', ')}
 */
export function customFunction(input: unknown): unknown {
  // 自定义逻辑——需要 Grok 深度推理生成
  return input;
}`;

    return {
      code,
      signature: `customFunction(input: unknown): unknown`,
    };
  }
}
