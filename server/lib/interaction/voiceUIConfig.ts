/**
 * Whisper Voice UI 配置服务
 * 
 * 提供语音交互配置管理，支持：
 * - Whisper 语音识别集成
 * - 语音命令解析
 * - 多语言支持
 * - 语音反馈合成（TTS）
 */

import { EventEmitter } from 'events';

// ============ 类型定义 ============

export interface VoiceUIConfig {
  whisper: WhisperConfig;
  tts: TTSConfig;
  commands: VoiceCommandConfig;
  languages: LanguageConfig;
  audio: AudioConfig;
  feedback: FeedbackConfig;
}

export interface WhisperConfig {
  enabled: boolean;
  model: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3';
  language: string;
  task: 'transcribe' | 'translate';
  temperature: number;
  vadEnabled: boolean;
  vadThreshold: number;
  maxDuration: number;
  sampleRate: number;
}

export interface TTSConfig {
  enabled: boolean;
  provider: 'openai' | 'azure' | 'google' | 'local';
  voice: string;
  speed: number;
  pitch: number;
  volume: number;
  format: 'mp3' | 'wav' | 'ogg';
}

export interface VoiceCommandConfig {
  enabled: boolean;
  wakeWord: string;
  wakeWordSensitivity: number;
  commandTimeout: number;
  confirmationRequired: boolean;
  fuzzyMatching: boolean;
  fuzzyThreshold: number;
}

export interface LanguageConfig {
  defaultLanguage: string;
  supportedLanguages: SupportedLanguage[];
  autoDetect: boolean;
  fallbackLanguage: string;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  whisperCode: string;
  ttsVoice: string;
}

export interface AudioConfig {
  inputDevice: string;
  outputDevice: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  noiseReduction: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface FeedbackConfig {
  audioFeedback: boolean;
  visualFeedback: boolean;
  hapticFeedback: boolean;
  confirmationSound: string;
  errorSound: string;
  listeningIndicator: boolean;
}

export interface VoiceCommand {
  id: string;
  patterns: string[];
  intent: string;
  slots: VoiceSlot[];
  action: string;
  response: string;
  requiresConfirmation: boolean;
  category: string;
}

export interface VoiceSlot {
  name: string;
  type: 'device' | 'number' | 'date' | 'time' | 'location' | 'status' | 'custom';
  required: boolean;
  patterns?: string[];
  values?: string[];
}

export interface TranscriptionResult {
  id: string;
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments: TranscriptionSegment[];
  timestamp: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface CommandParseResult {
  success: boolean;
  intent?: string;
  slots?: Record<string, unknown>;
  confidence: number;
  rawText: string;
  matchedPattern?: string;
}

export interface TTSResult {
  id: string;
  text: string;
  audioUrl: string;
  duration: number;
  format: string;
}

// ============ 默认配置 ============

export const DEFAULT_WHISPER_CONFIG: WhisperConfig = {
  enabled: true,
  model: 'large-v3',
  language: 'zh',
  task: 'transcribe',
  temperature: 0,
  vadEnabled: true,
  vadThreshold: 0.5,
  maxDuration: 30,
  sampleRate: 16000,
};

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  enabled: true,
  provider: 'openai',
  voice: 'alloy',
  speed: 1.0,
  pitch: 1.0,
  volume: 1.0,
  format: 'mp3',
};

export const DEFAULT_COMMAND_CONFIG: VoiceCommandConfig = {
  enabled: true,
  wakeWord: '小西',
  wakeWordSensitivity: 0.5,
  commandTimeout: 10000,
  confirmationRequired: false,
  fuzzyMatching: true,
  fuzzyThreshold: 0.7,
};

export const DEFAULT_LANGUAGES: SupportedLanguage[] = [
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', whisperCode: 'zh', ttsVoice: 'zh-CN-XiaoxiaoNeural' },
  { code: 'en-US', name: 'English (US)', nativeName: 'English', whisperCode: 'en', ttsVoice: 'en-US-JennyNeural' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', whisperCode: 'ja', ttsVoice: 'ja-JP-NanamiNeural' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어', whisperCode: 'ko', ttsVoice: 'ko-KR-SunHiNeural' },
];

// ============ PortAI Nexus语音命令 ============

export const XILIAN_VOICE_COMMANDS: VoiceCommand[] = [
  // 设备查询命令
  {
    id: 'device-status',
    patterns: [
      '查询{device}的状态',
      '{device}现在什么状态',
      '告诉我{device}的运行情况',
      '检查{device}',
    ],
    intent: 'query_device_status',
    slots: [
      { name: 'device', type: 'device', required: true },
    ],
    action: 'devices.getStatus',
    response: '{device}当前状态为{status}，运行时间{runtime}小时',
    requiresConfirmation: false,
    category: 'device',
  },
  {
    id: 'device-list',
    patterns: [
      '列出所有设备',
      '显示设备列表',
      '有哪些设备',
      '查看全部设备',
    ],
    intent: 'list_devices',
    slots: [],
    action: 'devices.list',
    response: '当前共有{count}台设备，其中{online}台在线，{offline}台离线',
    requiresConfirmation: false,
    category: 'device',
  },
  {
    id: 'device-alerts',
    patterns: [
      '查看{device}的告警',
      '{device}有什么告警',
      '显示{device}的异常',
    ],
    intent: 'query_device_alerts',
    slots: [
      { name: 'device', type: 'device', required: true },
    ],
    action: 'devices.getAlerts',
    response: '{device}当前有{count}条告警，最高级别为{severity}',
    requiresConfirmation: false,
    category: 'device',
  },
  // 告警处理命令
  {
    id: 'alert-acknowledge',
    patterns: [
      '确认{device}的告警',
      '处理{device}的异常',
      '标记{device}告警已处理',
    ],
    intent: 'acknowledge_alert',
    slots: [
      { name: 'device', type: 'device', required: true },
    ],
    action: 'alerts.acknowledge',
    response: '已确认{device}的告警',
    requiresConfirmation: true,
    category: 'alert',
  },
  {
    id: 'alert-summary',
    patterns: [
      '今天有多少告警',
      '告警汇总',
      '显示告警统计',
    ],
    intent: 'alert_summary',
    slots: [],
    action: 'alerts.summary',
    response: '今日共{total}条告警，其中紧急{critical}条，警告{warning}条',
    requiresConfirmation: false,
    category: 'alert',
  },
  // 知识查询命令
  {
    id: 'knowledge-search',
    patterns: [
      '搜索{query}',
      '查找关于{query}的知识',
      '我想了解{query}',
    ],
    intent: 'search_knowledge',
    slots: [
      { name: 'query', type: 'custom', required: true },
    ],
    action: 'knowledge.search',
    response: '找到{count}条相关知识',
    requiresConfirmation: false,
    category: 'knowledge',
  },
  {
    id: 'fault-solution',
    patterns: [
      '{fault}怎么解决',
      '如何处理{fault}',
      '{fault}的解决方案',
    ],
    intent: 'query_fault_solution',
    slots: [
      { name: 'fault', type: 'custom', required: true },
    ],
    action: 'knowledge.getFaultSolution',
    response: '针对{fault}，建议采取以下措施：{solution}',
    requiresConfirmation: false,
    category: 'knowledge',
  },
  // 数据分析命令
  {
    id: 'analytics-trend',
    patterns: [
      '分析{device}的{metric}趋势',
      '查看{device}的{metric}变化',
      '{device}的{metric}走势如何',
    ],
    intent: 'analyze_trend',
    slots: [
      { name: 'device', type: 'device', required: true },
      { name: 'metric', type: 'custom', required: true },
    ],
    action: 'analytics.getTrend',
    response: '{device}的{metric}在过去{period}内{trend}',
    requiresConfirmation: false,
    category: 'analytics',
  },
  {
    id: 'anomaly-detection',
    patterns: [
      '检测{device}的异常',
      '{device}有没有异常',
      '分析{device}的异常情况',
    ],
    intent: 'detect_anomaly',
    slots: [
      { name: 'device', type: 'device', required: true },
    ],
    action: 'analytics.detectAnomaly',
    response: '{device}检测到{count}个异常点，最近一次在{time}',
    requiresConfirmation: false,
    category: 'analytics',
  },
  // 系统控制命令
  {
    id: 'system-status',
    patterns: [
      '系统状态',
      '平台运行情况',
      '检查系统健康',
    ],
    intent: 'system_status',
    slots: [],
    action: 'system.getStatus',
    response: '系统运行正常，CPU使用率{cpu}%，内存使用率{memory}%',
    requiresConfirmation: false,
    category: 'system',
  },
  {
    id: 'help',
    patterns: [
      '帮助',
      '你能做什么',
      '有哪些命令',
      '使用说明',
    ],
    intent: 'help',
    slots: [],
    action: 'system.help',
    response: '我可以帮您查询设备状态、处理告警、搜索知识、分析数据等。您可以说"查询设备状态"、"显示告警"等命令。',
    requiresConfirmation: false,
    category: 'system',
  },
];

// ============ Voice UI 配置服务 ============

export class VoiceUIConfigService extends EventEmitter {
  private config: VoiceUIConfig;
  private commands: Map<string, VoiceCommand> = new Map();
  private transcriptionHistory: TranscriptionResult[] = [];
  private isListening: boolean = false;
  private stats = {
    totalTranscriptions: 0,
    totalCommands: 0,
    successfulCommands: 0,
    failedCommands: 0,
    avgConfidence: 0,
  };

  constructor(config?: Partial<VoiceUIConfig>) {
    super();
    this.config = {
      whisper: { ...DEFAULT_WHISPER_CONFIG, ...config?.whisper },
      tts: { ...DEFAULT_TTS_CONFIG, ...config?.tts },
      commands: { ...DEFAULT_COMMAND_CONFIG, ...config?.commands },
      languages: {
        defaultLanguage: 'zh-CN',
        supportedLanguages: [...DEFAULT_LANGUAGES],
        autoDetect: true,
        fallbackLanguage: 'en-US',
        ...config?.languages,
      },
      audio: {
        inputDevice: 'default',
        outputDevice: 'default',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        noiseReduction: true,
        echoCancellation: true,
        autoGainControl: true,
        ...config?.audio,
      },
      feedback: {
        audioFeedback: true,
        visualFeedback: true,
        hapticFeedback: false,
        confirmationSound: 'confirmation.mp3',
        errorSound: 'error.mp3',
        listeningIndicator: true,
        ...config?.feedback,
      },
    };

    // 加载默认命令
    for (const command of XILIAN_VOICE_COMMANDS) {
      this.commands.set(command.id, command);
    }
  }

  // ============ 配置管理 ============

  getConfig(): VoiceUIConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<VoiceUIConfig>): void {
    Object.assign(this.config, updates);
  }

  // ============ Whisper 语音识别 ============

  getWhisperConfig(): WhisperConfig {
    return { ...this.config.whisper };
  }

  setWhisperModel(model: WhisperConfig['model']): void {
    this.config.whisper.model = model;
  }

  setWhisperLanguage(language: string): void {
    this.config.whisper.language = language;
  }

  /**
   * 模拟语音转文字（实际实现需要调用 Whisper API）
   */
  async transcribe(audioData: ArrayBuffer): Promise<TranscriptionResult> {
    const startTime = Date.now();

    // 模拟转录结果
    const result: TranscriptionResult = {
      id: this.generateId(),
      text: '查询设备状态', // 模拟结果
      language: this.config.whisper.language,
      confidence: 0.95,
      duration: audioData.byteLength / (this.config.whisper.sampleRate * 2),
      segments: [
        {
          id: 0,
          start: 0,
          end: 1.5,
          text: '查询设备状态',
          confidence: 0.95,
        },
      ],
      timestamp: Date.now(),
    };

    this.transcriptionHistory.push(result);
    this.stats.totalTranscriptions++;
    this.updateAvgConfidence(result.confidence);

    console.log(`[VoiceUI] Transcribed in ${Date.now() - startTime}ms: "${result.text}"`);
    this.emit('transcription', result);

    return result;
  }

  // ============ 语音命令解析 ============

  getCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  getCommandsByCategory(category: string): VoiceCommand[] {
    return Array.from(this.commands.values()).filter(c => c.category === category);
  }

  addCommand(command: VoiceCommand): void {
    this.commands.set(command.id, command);
  }

  removeCommand(id: string): void {
    this.commands.delete(id);
  }

  /**
   * 解析语音命令
   */
  parseCommand(text: string): CommandParseResult {
    this.stats.totalCommands++;
    const normalizedText = text.trim().toLowerCase();

    const commandArray = Array.from(this.commands.values());
    for (const command of commandArray) {
      for (const pattern of command.patterns) {
        const result = this.matchPattern(normalizedText, pattern, command.slots);
        if (result.matched) {
          this.stats.successfulCommands++;
          return {
            success: true,
            intent: command.intent,
            slots: result.slots,
            confidence: result.confidence,
            rawText: text,
            matchedPattern: pattern,
          };
        }
      }
    }

    // 模糊匹配
    if (this.config.commands.fuzzyMatching) {
      const fuzzyResult = this.fuzzyMatch(normalizedText);
      if (fuzzyResult) {
        this.stats.successfulCommands++;
        return fuzzyResult;
      }
    }

    this.stats.failedCommands++;
    return {
      success: false,
      confidence: 0,
      rawText: text,
    };
  }

  /**
   * 模式匹配
   */
  private matchPattern(
    text: string,
    pattern: string,
    slots: VoiceSlot[]
  ): { matched: boolean; slots: Record<string, unknown>; confidence: number } {
    // 将模式转换为正则表达式
    let regexPattern = pattern.toLowerCase();
    const slotValues: Record<string, unknown> = {};

    for (const slot of slots) {
      const slotPattern = `{${slot.name}}`;
      if (regexPattern.includes(slotPattern)) {
        // 替换槽位为捕获组
        regexPattern = regexPattern.replace(slotPattern, '(.+?)');
      }
    }

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    const match = text.match(regex);

    if (match) {
      // 提取槽位值
      let slotIndex = 1;
      for (const slot of slots) {
        if (match[slotIndex]) {
          slotValues[slot.name] = match[slotIndex];
          slotIndex++;
        }
      }

      return { matched: true, slots: slotValues, confidence: 0.9 };
    }

    return { matched: false, slots: {}, confidence: 0 };
  }

  /**
   * 模糊匹配
   */
  private fuzzyMatch(text: string): CommandParseResult | null {
    let bestMatch: { command: VoiceCommand; pattern: string; similarity: number } | null = null;

    const commandValues = Array.from(this.commands.values());
    for (const command of commandValues) {
      for (const pattern of command.patterns) {
        // 移除槽位占位符进行比较
        const cleanPattern = pattern.replace(/\{[^}]+\}/g, '').toLowerCase().trim();
        const similarity = this.calculateSimilarity(text, cleanPattern);

        if (similarity >= this.config.commands.fuzzyThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { command, pattern, similarity };
          }
        }
      }
    }

    if (bestMatch) {
      return {
        success: true,
        intent: bestMatch.command.intent,
        slots: {},
        confidence: bestMatch.similarity,
        rawText: text,
        matchedPattern: bestMatch.pattern,
      };
    }

    return null;
  }

  /**
   * 计算字符串相似度（Levenshtein 距离）
   */
  private calculateSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein 距离
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) {
        costs[s2.length] = lastValue;
      }
    }
    return costs[s2.length];
  }

  // ============ TTS 语音合成 ============

  getTTSConfig(): TTSConfig {
    return { ...this.config.tts };
  }

  setTTSVoice(voice: string): void {
    this.config.tts.voice = voice;
  }

  setTTSSpeed(speed: number): void {
    this.config.tts.speed = Math.max(0.5, Math.min(2.0, speed));
  }

  /**
   * 模拟文字转语音（实际实现需要调用 TTS API）
   */
  async synthesize(text: string): Promise<TTSResult> {
    const result: TTSResult = {
      id: this.generateId(),
      text,
      audioUrl: `/audio/tts/${this.generateId()}.${this.config.tts.format}`,
      duration: text.length * 0.1, // 模拟时长
      format: this.config.tts.format,
    };

    console.log(`[VoiceUI] Synthesized: "${text}"`);
    this.emit('synthesis', result);

    return result;
  }

  // ============ 多语言支持 ============

  getLanguages(): SupportedLanguage[] {
    return [...this.config.languages.supportedLanguages];
  }

  setDefaultLanguage(code: string): void {
    const language = this.config.languages.supportedLanguages.find(l => l.code === code);
    if (language) {
      this.config.languages.defaultLanguage = code;
      this.config.whisper.language = language.whisperCode;
    }
  }

  addLanguage(language: SupportedLanguage): void {
    this.config.languages.supportedLanguages.push(language);
  }

  // ============ 会话管理 ============

  startListening(): void {
    this.isListening = true;
    this.emit('listening-start');
    console.log('[VoiceUI] Started listening');
  }

  stopListening(): void {
    this.isListening = false;
    this.emit('listening-stop');
    console.log('[VoiceUI] Stopped listening');
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  getTranscriptionHistory(): TranscriptionResult[] {
    return [...this.transcriptionHistory];
  }

  clearHistory(): void {
    this.transcriptionHistory = [];
  }

  // ============ 统计和监控 ============

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  private updateAvgConfidence(confidence: number): void {
    const total = this.stats.totalTranscriptions;
    this.stats.avgConfidence = 
      (this.stats.avgConfidence * (total - 1) + confidence) / total;
  }

  // ============ 辅助方法 ============

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * 生成响应文本
   */
  generateResponse(command: VoiceCommand, slots: Record<string, unknown>): string {
    let response = command.response;
    for (const [key, value] of Object.entries(slots)) {
      response = response.replace(`{${key}}`, String(value));
    }
    return response;
  }
}

// 导出单例
export const voiceUIConfig = new VoiceUIConfigService();
