/**
 * 用户交互层索引文件
 * 
 * 导出所有交互层组件和服务
 */

// GraphQL Gateway
export {
  GraphQLGateway,
  type GraphQLGatewayConfig,
  type GraphQLQuery,
  type GraphQLError,
  type SubgraphConfig,
  type GatewayStats,
} from './graphql/graphqlGateway';

// Web Portal
export {
  WebPortalConfigService,
  webPortalConfig,
  type WebPortalConfig,
  type ThemeConfig,
  type LayoutConfig,
  type I18nConfig,
  type PerformanceConfig,
  type SecurityConfig,
  type RouteConfig,
  type ComponentConfig,
  DEFAULT_THEME,
  DEFAULT_LAYOUT,
  DEFAULT_I18N,
  DEFAULT_PERFORMANCE,
  DEFAULT_SECURITY,
  XILIAN_ROUTES,
  XILIAN_COMPONENTS,
} from './web/webPortalConfig';

// Mobile App
export {
  MobileAppConfigService,
  mobileAppConfig,
  type MobileAppConfig,
  type AppInfo,
  type OfflineConfig,
  type PushNotificationConfig,
  type SyncConfig,
  type NativeFeatureConfig,
  type MobileSecurityConfig,
  type MobileScreen,
  type MobileComponent,
  DEFAULT_APP_INFO,
  DEFAULT_OFFLINE_CONFIG,
  DEFAULT_PUSH_CONFIG,
  DEFAULT_SYNC_CONFIG,
  DEFAULT_NATIVE_CONFIG,
  XILIAN_MOBILE_SCREENS,
  XILIAN_MOBILE_COMPONENTS,
} from './mobile/mobileAppConfig';

// Voice UI
export {
  VoiceUIConfigService,
  voiceUIConfig,
  type VoiceUIConfig,
  type WhisperConfig,
  type TTSConfig,
  type VoiceCommandConfig,
  type VoiceCommand,
  type VoiceSlot,
  type TranscriptionResult,
  type CommandParseResult,
  type TTSResult,
  DEFAULT_WHISPER_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_COMMAND_CONFIG,
  DEFAULT_LANGUAGES,
  XILIAN_VOICE_COMMANDS,
} from './voice/voiceUIConfig';

// Neo4j Bloom 3D Viz
export {
  Neo4jBloomConfigService,
  neo4jBloomConfig,
  type BloomConfig,
  type VisualizationConfig,
  type NodeStyleConfig,
  type RelationshipStyleConfig,
  type LayoutConfig as BloomLayoutConfig,
  type InteractionConfig,
  type SearchConfig,
  type ExportConfig,
  type GraphNode,
  type GraphRelationship,
  type GraphData,
  type Perspective,
  DEFAULT_VISUALIZATION,
  DEFAULT_LAYOUT as DEFAULT_BLOOM_LAYOUT,
  DEFAULT_INTERACTION,
  XILIAN_NODE_STYLES,
  XILIAN_RELATIONSHIP_STYLES,
  XILIAN_PERSPECTIVES,
} from './visualization/neo4jBloomConfig';

// Interaction Manager
export {
  InteractionManager,
  interactionManager,
  type InteractionManagerConfig,
  type InteractionStats,
  type HealthStatus,
  type UserSession,
} from './interactionManager';
