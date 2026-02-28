/**
 * ============================================================================
 * NL 自然语言交互层 — 公开导出
 * ============================================================================
 *
 * 统一导出 NLInterface 模块的所有公开接口。
 *
 * 使用方式：
 *   import { getNLInterface } from '../../platform/ai/nl-interface';
 *   const nl = getNLInterface();
 *   const response = await nl.query({ query: '3号岸桥状态', sessionId: 'xxx' });
 */

export { NLInterface, getNLInterface, resetNLInterface } from './nl-interface';
export { NLIntentRouter } from './nl-intent-router';
export { NL_INTERFACE_TOOLS } from './nl-tools';
export {
  DEVICE_TYPE_VOCAB,
  MECHANISM_VOCAB,
  COMPONENT_VOCAB,
  SENSOR_VOCAB,
  STATUS_VOCAB,
  DEVICE_NUMBER_PATTERN,
  resolveDeviceReference,
  normalizeDeviceId,
  getVocabularySummary,
} from './nl-vocabulary';
