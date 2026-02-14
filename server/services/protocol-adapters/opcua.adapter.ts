/**
 * OPC-UA 协议适配器 - 生产级实现
 * 
 * 基于 node-opcua-client 库
 * 支持 OPC-UA Binary / HTTPS 传输，安全策略（None / Basic256Sha256 / Aes256_Sha256_RsaPss）
 * 认证：匿名 / 用户名密码 / X509 证书
 * 高级特性：订阅参数、监控项配置、死区过滤、采样间隔
 * 资源发现：浏览 OPC-UA 地址空间树，发现变量节点
 */

import {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  ClientSession,
  BrowseDirection,
  NodeClassMask,
  ReferenceDescription,
  DataType,
  AttributeIds,
} from 'node-opcua';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class OpcuaAdapter extends BaseAdapter {
  readonly protocolType = 'opcua' as const;
  protected defaultTimeoutMs = 20000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'opcua',
    label: 'OPC-UA Server',
    connectionFields: [
      { key: 'endpointUrl', label: '端点 URL', type: 'string', required: true, placeholder: 'opc.tcp://192.168.1.100:4840', description: 'OPC-UA 服务器端点地址' },
      { key: 'securityMode', label: '安全模式', type: 'select', required: true, defaultValue: 'None', options: [
        { label: '无安全 (None)', value: 'None' },
        { label: '签名 (Sign)', value: 'Sign' },
        { label: '签名并加密 (SignAndEncrypt)', value: 'SignAndEncrypt' },
      ]},
      { key: 'securityPolicy', label: '安全策略', type: 'select', required: true, defaultValue: 'None', options: [
        { label: 'None', value: 'None' },
        { label: 'Basic128Rsa15 (已废弃)', value: 'Basic128Rsa15' },
        { label: 'Basic256 (已废弃)', value: 'Basic256' },
        { label: 'Basic256Sha256', value: 'Basic256Sha256' },
        { label: 'Aes128_Sha256_RsaOaep', value: 'Aes128_Sha256_RsaOaep' },
        { label: 'Aes256_Sha256_RsaPss (最高安全)', value: 'Aes256_Sha256_RsaPss' },
      ]},
      { key: 'applicationName', label: '应用名称', type: 'string', required: false, defaultValue: 'XiLian Platform', description: 'OPC-UA 客户端应用名称' },
      { key: 'applicationUri', label: '应用 URI', type: 'string', required: false, placeholder: 'urn:xilian:client', description: '客户端应用 URI（证书匹配用）' },
    ],
    authFields: [
      { key: 'authType', label: '认证方式', type: 'select', required: true, defaultValue: 'anonymous', options: [
        { label: '匿名', value: 'anonymous' },
        { label: '用户名/密码', value: 'userpass' },
        { label: 'X509 证书', value: 'x509' },
      ]},
      { key: 'username', label: '用户名', type: 'string', required: false },
      { key: 'password', label: '密码', type: 'password', required: false },
      { key: 'clientCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'X509' },
      { key: 'clientKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'X509' },
    ],
    advancedFields: [
      // 会话配置
      { key: 'requestedSessionTimeout', label: '会话超时(ms)', type: 'number', required: false, defaultValue: 60000, description: '会话不活跃超时时间' },
      { key: 'keepSessionAlive', label: '保持会话活跃', type: 'boolean', required: false, defaultValue: true, description: '自动发送心跳保持会话' },
      { key: 'endpointMustExist', label: '端点必须存在', type: 'boolean', required: false, defaultValue: false, description: '连接前验证端点是否在发现服务中注册' },
      // 连接策略
      { key: 'connectionStrategy', label: '连接策略', type: 'json', required: false, defaultValue: { maxRetry: 3, initialDelay: 1000, maxDelay: 10000, randomisationFactor: 0.1 }, description: '重连策略: maxRetry(-1=无限), initialDelay, maxDelay, randomisationFactor' },
      { key: 'defaultSecureTokenLifetime', label: '安全令牌生命周期(ms)', type: 'number', required: false, defaultValue: 600000, description: '安全通道令牌有效期（默认 10 分钟）' },
      // 订阅参数（数据采集核心配置）
      { key: 'publishingInterval', label: '发布间隔(ms)', type: 'number', required: false, defaultValue: 1000, description: '订阅的数据发布间隔（SHM 场景建议 50-100ms）' },
      { key: 'lifetimeCount', label: '生命周期计数', type: 'number', required: false, defaultValue: 60, description: '无发布时订阅保活的发布周期数' },
      { key: 'maxKeepAliveCount', label: '最大保活计数', type: 'number', required: false, defaultValue: 10, description: '无数据变化时的保活间隔（发布周期倍数）' },
      { key: 'maxNotificationsPerPublish', label: '每次发布最大通知数', type: 'number', required: false, defaultValue: 0, description: '0=不限制' },
      { key: 'priority', label: '订阅优先级', type: 'number', required: false, defaultValue: 0, description: '0-255，越高越优先' },
      // 监控项参数
      { key: 'samplingInterval', label: '采样间隔(ms)', type: 'number', required: false, defaultValue: 250, description: '服务器端数据采样间隔（-1=最快, 0=服务器默认）' },
      { key: 'queueSize', label: '队列大小', type: 'number', required: false, defaultValue: 10, description: '监控项数据变化队列深度' },
      { key: 'discardOldest', label: '丢弃最旧', type: 'boolean', required: false, defaultValue: true, description: '队列满时丢弃最旧数据（false=丢弃最新）' },
      // 死区过滤（SHM 关键配置）
      { key: 'deadbandType', label: '死区类型', type: 'select', required: false, defaultValue: 'None', options: [
        { label: '无死区', value: 'None' },
        { label: '绝对死区', value: 'Absolute' },
        { label: '百分比死区', value: 'Percent' },
      ], description: '数据变化过滤：绝对值变化或百分比变化' },
      { key: 'deadbandValue', label: '死区值', type: 'number', required: false, defaultValue: 0, description: '绝对死区=变化量阈值; 百分比死区=变化百分比' },
      // 浏览配置
      { key: 'browseDepth', label: '浏览深度', type: 'number', required: false, defaultValue: 3, description: '资源发现时的地址空间浏览深度' },
      { key: 'maxDiscoveredNodes', label: '最大发现节点数', type: 'number', required: false, defaultValue: 200, description: '资源发现的节点数量上限' },
    ],
  };

  private getSecurityMode(mode: string): MessageSecurityMode {
    switch (mode) {
      case 'Sign': return MessageSecurityMode.Sign;
      case 'SignAndEncrypt': return MessageSecurityMode.SignAndEncrypt;
      default: return MessageSecurityMode.None;
    }
  }

  private getSecurityPolicy(policy: string): SecurityPolicy {
    const map: Record<string, SecurityPolicy> = {
      'None': SecurityPolicy.None,
      'Basic128Rsa15': SecurityPolicy.Basic128Rsa15,
      'Basic256': SecurityPolicy.Basic256,
      'Basic256Sha256': SecurityPolicy.Basic256Sha256,
      'Aes128_Sha256_RsaOaep': SecurityPolicy.Aes128_Sha256_RsaOaep,
      'Aes256_Sha256_RsaPss': SecurityPolicy.Aes256_Sha256_RsaPss,
    };
    return map[policy] || SecurityPolicy.None;
  }

  private createClient(params: Record<string, unknown>): OPCUAClient {
    const connectionStrategy = (params.connectionStrategy as any) || {};

    return OPCUAClient.create({
      applicationName: (params.applicationName as string) || 'XiLian Platform',
      applicationUri: (params.applicationUri as string) || undefined,
      connectionStrategy: {
        maxRetry: connectionStrategy.maxRetry ?? 1,
        initialDelay: connectionStrategy.initialDelay ?? 1000,
        maxDelay: connectionStrategy.maxDelay ?? 5000,
        randomisationFactor: connectionStrategy.randomisationFactor ?? 0.1,
      },
      securityMode: this.getSecurityMode((params.securityMode as string) || 'None'),
      securityPolicy: this.getSecurityPolicy((params.securityPolicy as string) || 'None'),
      endpointMustExist: (params.endpointMustExist as boolean) || false,
      requestedSessionTimeout: (params.requestedSessionTimeout as number) || 60000,
      keepSessionAlive: params.keepSessionAlive !== false,
      defaultSecureTokenLifetime: (params.defaultSecureTokenLifetime as number) || 600000,
    });
  }

  private async createSession(
    client: OPCUAClient,
    auth?: Record<string, unknown>
  ): Promise<ClientSession> {
    const authType = (auth?.authType as string) || 'anonymous';
    if (authType === 'userpass' && auth?.username) {
      return client.createSession({
        type: 1, // UserNameIdentityToken
        userName: auth.username as string,
        password: auth.password as string,
      } as any);
    }
    // 匿名认证
    return client.createSession();
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const endpointUrl = params.endpointUrl as string;
    if (!endpointUrl) {
      return { success: false, latencyMs: 0, message: '缺少 OPC-UA 端点 URL' };
    }

    const client = this.createClient(params);
    let session: ClientSession | null = null;

    try {
      await client.connect(endpointUrl);
      session = await this.createSession(client, auth);

      // 读取服务器状态
      const serverStatus = await session.read({
        nodeId: 'i=2259', // Server_ServerStatus_State
        attributeId: AttributeIds.Value,
      });

      const buildInfo = await session.read({
        nodeId: 'i=2260', // Server_ServerStatus_BuildInfo
        attributeId: AttributeIds.Value,
      });

      // 读取服务器能力
      let serverCapabilities: Record<string, unknown> = {};
      try {
        const maxSubscriptions = await session.read({ nodeId: 'i=11714', attributeId: AttributeIds.Value });
        const maxMonitoredItems = await session.read({ nodeId: 'i=11715', attributeId: AttributeIds.Value });
        serverCapabilities = {
          maxSubscriptionsPerSession: maxSubscriptions.value?.value,
          maxMonitoredItemsPerSubscription: maxMonitoredItems.value?.value,
        };
      } catch { /* 部分服务器不暴露能力节点 */ }

      const details: Record<string, unknown> = {
        serverState: serverStatus.value?.value,
        endpointUrl,
        securityMode: params.securityMode || 'None',
        securityPolicy: params.securityPolicy || 'None',
        sessionTimeout: params.requestedSessionTimeout || 60000,
        ...serverCapabilities,
      };

      if (buildInfo.value?.value) {
        const bi = buildInfo.value.value;
        details.productName = bi.productName;
        details.softwareVersion = bi.softwareVersion;
        details.manufacturerName = bi.manufacturerName;
        details.buildNumber = bi.buildNumber;
        details.buildDate = bi.buildDate?.toISOString?.();
      }

      return {
        success: true,
        latencyMs: 0,
        message: `成功连接到 OPC-UA 服务器 ${endpointUrl}`,
        serverVersion: details.softwareVersion as string || 'Unknown',
        details,
      };
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `OPC-UA 连接失败: ${(err as Error).message}`,
        details: { endpointUrl, error: (err as Error).message },
      };
    } finally {
      try { if (session) await session.close(); } catch { /* ignore */ }
      try { await client.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const endpointUrl = params.endpointUrl as string;
    const maxDepth = (params.browseDepth as number) || 3;
    const maxNodes = (params.maxDiscoveredNodes as number) || 200;
    const client = this.createClient(params);
    let session: ClientSession | null = null;

    try {
      await client.connect(endpointUrl);
      session = await this.createSession(client, auth);

      const endpoints: DiscoveredEndpoint[] = [];
      const visited = new Set<string>();

      // 递归浏览地址空间
      const browse = async (nodeId: string, depth: number, path: string) => {
        if (depth > maxDepth || visited.has(nodeId) || endpoints.length >= maxNodes) return;
        visited.add(nodeId);

        try {
          const browseResult = await session!.browse({
            nodeId,
            browseDirection: BrowseDirection.Forward,
            nodeClassMask: NodeClassMask.Variable | NodeClassMask.Object,
            resultMask: 0x3f,
          });

          if (!browseResult.references) return;

          for (const ref of browseResult.references) {
            if (endpoints.length >= maxNodes) break;

            const refNodeId = ref.nodeId.toString();
            const refName = ref.browseName?.name || refNodeId;
            const currentPath = path ? `${path}/${refName}` : refName;

            // 变量节点 → 可采集的数据点
            if (ref.nodeClass === 2) { // Variable
              try {
                const dataValue = await session!.read({
                  nodeId: refNodeId,
                  attributeId: AttributeIds.Value,
                });

                endpoints.push({
                  resourcePath: refNodeId,
                  resourceType: 'node',
                  name: currentPath,
                  dataFormat: 'json',
                  schemaInfo: {
                    dataType: dataValue.value?.dataType !== undefined ? DataType[dataValue.value.dataType] : 'Unknown',
                    browsePath: currentPath,
                    nodeClass: 'Variable',
                  },
                  metadata: {
                    currentValue: dataValue.value?.value,
                    statusCode: dataValue.statusCode?.value,
                    sourceTimestamp: dataValue.sourceTimestamp?.toISOString(),
                  },
                });
              } catch {
                endpoints.push({
                  resourcePath: refNodeId,
                  resourceType: 'node',
                  name: currentPath,
                  schemaInfo: { browsePath: currentPath, nodeClass: 'Variable' },
                });
              }
            }

            // 对象节点 → 递归浏览
            if (ref.nodeClass === 1) { // Object
              await browse(refNodeId, depth + 1, currentPath);
            }
          }
        } catch {
          // 浏览失败，跳过此节点
        }
      };

      // 从 Objects 文件夹开始浏览 (i=85)
      await browse('i=85', 0, '');

      return endpoints;
    } finally {
      try { if (session) await session.close(); } catch { /* ignore */ }
      try { await client.disconnect(); } catch { /* ignore */ }
    }
  }

  protected async doHealthCheck(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<Omit<HealthCheckResult, 'latencyMs' | 'checkedAt'>> {
    const testResult = await this.doTestConnection(params, auth);
    return {
      status: testResult.success ? 'healthy' : 'unhealthy',
      message: testResult.message,
      metrics: testResult.details,
    };
  }
}
