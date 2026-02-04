/**
 * API 网关层索引
 */

// Kong 网关
export {
  KongGateway,
  kongGateway,
  XILIAN_ROUTES,
  XILIAN_SERVICES,
  XILIAN_UPSTREAMS,
  XILIAN_ROLES,
  type KongConfig,
  type Route,
  type Service,
  type Upstream,
  type UpstreamTarget,
  type HealthCheck,
  type Consumer,
  type JWTCredential,
  type OAuth2Credential,
  type KeyAuthCredential,
  type RBACRole,
  type Permission,
  type RateLimitResult,
  type GatewayStats,
} from './kong/kongGateway';

// Istio 服务网格
export {
  IstioMesh,
  istioMesh,
  XILIAN_VIRTUAL_SERVICES,
  XILIAN_DESTINATION_RULES,
  XILIAN_PEER_AUTH,
  type IstioConfig,
  type VirtualService,
  type HTTPRoute,
  type HTTPMatchRequest,
  type HTTPRouteDestination,
  type Destination,
  type RetryPolicy,
  type FaultInjection,
  type DestinationRule,
  type TrafficPolicy,
  type ConnectionPool,
  type LoadBalancer,
  type OutlierDetection,
  type TLSSettings,
  type Subset,
  type PeerAuthentication,
  type AuthorizationPolicy,
  type CanaryDeployment,
  type CanaryStage,
  type CanaryMetrics,
  type TraceSpan,
  type ChaosExperiment,
  type MeshStats,
} from './istio/istioMesh';

// 网关管理器
export {
  GatewayManager,
  gatewayManager,
  type GatewayManagerConfig,
  type UnifiedGatewayStats,
  type RequestContext,
  type RequestResult,
} from './gatewayManager';
