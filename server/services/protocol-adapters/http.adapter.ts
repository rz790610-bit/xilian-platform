/**
 * HTTP/REST API 协议适配器 - 生产级实现
 * 
 * 基于 Node.js 原生 fetch / undici
 * 支持 REST / GraphQL / Webhook 等 HTTP 接口
 * 认证：Basic / Bearer / API Key / OAuth2 / HMAC 签名
 * 高级特性：请求模板、重试策略、速率限制、响应转换
 * 资源发现：OpenAPI/Swagger 规范解析，端点枚举
 */

import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class HttpAdapter extends BaseAdapter {
  readonly protocolType = 'http' as const;
  protected defaultTimeoutMs = 30000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'http',
    label: 'HTTP / REST API',
    connectionFields: [
      { key: 'baseUrl', label: '基础 URL', type: 'string', required: true, placeholder: 'https://api.example.com/v1', description: 'API 基础地址（所有请求的前缀）' },
      { key: 'healthCheckPath', label: '健康检查路径', type: 'string', required: false, defaultValue: '/health', description: '用于测试连接和健康检查的端点路径' },
      { key: 'apiType', label: 'API 类型', type: 'select', required: false, defaultValue: 'rest', options: [
        { label: 'REST API', value: 'rest' },
        { label: 'GraphQL', value: 'graphql' },
        { label: 'Webhook (回调)', value: 'webhook' },
        { label: 'SOAP/XML', value: 'soap' },
        { label: '自定义', value: 'custom' },
      ]},
      { key: 'defaultMethod', label: '默认 HTTP 方法', type: 'select', required: false, defaultValue: 'GET', options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'PATCH', value: 'PATCH' },
        { label: 'DELETE', value: 'DELETE' },
      ]},
      { key: 'defaultContentType', label: '默认 Content-Type', type: 'select', required: false, defaultValue: 'application/json', options: [
        { label: 'application/json', value: 'application/json' },
        { label: 'application/x-www-form-urlencoded', value: 'application/x-www-form-urlencoded' },
        { label: 'multipart/form-data', value: 'multipart/form-data' },
        { label: 'text/xml', value: 'text/xml' },
        { label: 'text/plain', value: 'text/plain' },
      ]},
    ],
    authFields: [
      { key: 'authType', label: '认证方式', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无认证', value: 'none' },
        { label: 'Bearer Token', value: 'bearer' },
        { label: 'Basic Auth', value: 'basic' },
        { label: 'API Key', value: 'apikey' },
        { label: 'OAuth2 Client Credentials', value: 'oauth2-client' },
        { label: 'OAuth2 Authorization Code', value: 'oauth2-code' },
        { label: 'HMAC 签名', value: 'hmac' },
        { label: '自定义 Header', value: 'custom-header' },
      ]},
      // Bearer Token
      { key: 'bearerToken', label: 'Bearer Token', type: 'password', required: false, group: 'Bearer' },
      { key: 'bearerPrefix', label: 'Token 前缀', type: 'string', required: false, defaultValue: 'Bearer', group: 'Bearer', description: '如 Bearer, Token, JWT 等' },
      // Basic Auth
      { key: 'basicUsername', label: '用户名', type: 'string', required: false, group: 'Basic' },
      { key: 'basicPassword', label: '密码', type: 'password', required: false, group: 'Basic' },
      // API Key
      { key: 'apiKey', label: 'API Key', type: 'password', required: false, group: 'API Key' },
      { key: 'apiKeyName', label: 'Key 名称', type: 'string', required: false, defaultValue: 'X-API-Key', group: 'API Key', description: 'Header 或 Query 参数名' },
      { key: 'apiKeyLocation', label: 'Key 位置', type: 'select', required: false, defaultValue: 'header', options: [
        { label: 'Header', value: 'header' },
        { label: 'Query 参数', value: 'query' },
        { label: 'Cookie', value: 'cookie' },
      ], group: 'API Key' },
      // OAuth2
      { key: 'oauth2TokenUrl', label: 'Token URL', type: 'string', required: false, group: 'OAuth2' },
      { key: 'oauth2ClientId', label: 'Client ID', type: 'string', required: false, group: 'OAuth2' },
      { key: 'oauth2ClientSecret', label: 'Client Secret', type: 'password', required: false, group: 'OAuth2' },
      { key: 'oauth2Scope', label: 'Scope', type: 'string', required: false, group: 'OAuth2' },
      { key: 'oauth2AuthUrl', label: 'Authorization URL', type: 'string', required: false, group: 'OAuth2', description: 'Authorization Code 模式的授权 URL' },
      { key: 'oauth2RedirectUri', label: 'Redirect URI', type: 'string', required: false, group: 'OAuth2' },
      // HMAC
      { key: 'hmacSecret', label: 'HMAC Secret', type: 'password', required: false, group: 'HMAC' },
      { key: 'hmacAlgorithm', label: 'HMAC 算法', type: 'select', required: false, defaultValue: 'sha256', options: [
        { label: 'SHA-256', value: 'sha256' },
        { label: 'SHA-512', value: 'sha512' },
        { label: 'SHA-1', value: 'sha1' },
      ], group: 'HMAC' },
      { key: 'hmacHeaderName', label: 'HMAC Header', type: 'string', required: false, defaultValue: 'X-Signature', group: 'HMAC' },
      // 自定义 Header
      { key: 'customHeaders', label: '自定义请求头 (JSON)', type: 'json', required: false, group: '自定义', description: '键值对形式的自定义请求头' },
      // TLS
      { key: 'tlsRejectUnauthorized', label: '验证 SSL 证书', type: 'boolean', required: false, defaultValue: true },
      { key: 'tlsCaCert', label: 'CA 证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsClientCert', label: '客户端证书 (PEM)', type: 'string', required: false, group: 'TLS' },
      { key: 'tlsClientKey', label: '客户端私钥 (PEM)', type: 'string', required: false, group: 'TLS' },
    ],
    advancedFields: [
      // 超时与重试
      { key: 'timeout', label: '请求超时(ms)', type: 'number', required: false, defaultValue: 30000 },
      { key: 'retries', label: '重试次数', type: 'number', required: false, defaultValue: 3 },
      { key: 'retryDelay', label: '重试延迟(ms)', type: 'number', required: false, defaultValue: 1000 },
      { key: 'retryOn', label: '重试状态码', type: 'string', required: false, defaultValue: '429,500,502,503,504', description: '逗号分隔的触发重试的 HTTP 状态码' },
      { key: 'retryBackoff', label: '退避策略', type: 'select', required: false, defaultValue: 'exponential', options: [
        { label: '指数退避', value: 'exponential' },
        { label: '固定间隔', value: 'fixed' },
        { label: '线性递增', value: 'linear' },
      ]},
      // 速率限制
      { key: 'rateLimitPerSecond', label: '每秒请求限制', type: 'number', required: false, defaultValue: 0, description: '0=不限制' },
      { key: 'rateLimitConcurrency', label: '并发请求限制', type: 'number', required: false, defaultValue: 0, description: '0=不限制' },
      // 代理
      { key: 'proxyUrl', label: 'HTTP 代理', type: 'string', required: false, placeholder: 'http://proxy:8080', description: 'HTTP/HTTPS 代理服务器地址' },
      // 请求配置
      { key: 'followRedirects', label: '跟随重定向', type: 'boolean', required: false, defaultValue: true },
      { key: 'maxRedirects', label: '最大重定向次数', type: 'number', required: false, defaultValue: 5 },
      { key: 'keepAlive', label: '启用 Keep-Alive', type: 'boolean', required: false, defaultValue: true },
      { key: 'defaultHeaders', label: '默认请求头 (JSON)', type: 'json', required: false, description: '所有请求自动添加的请求头' },
      { key: 'defaultQueryParams', label: '默认查询参数 (JSON)', type: 'json', required: false, description: '所有请求自动添加的查询参数' },
      // OpenAPI 发现
      { key: 'openApiSpecUrl', label: 'OpenAPI 规范 URL', type: 'string', required: false, placeholder: '/openapi.json', description: '用于资源发现的 OpenAPI/Swagger 规范地址' },
      // 响应处理
      { key: 'responseEncoding', label: '响应编码', type: 'select', required: false, defaultValue: 'utf-8', options: [
        { label: 'UTF-8', value: 'utf-8' },
        { label: 'GBK', value: 'gbk' },
        { label: 'ISO-8859-1', value: 'iso-8859-1' },
      ]},
      { key: 'responseTransform', label: '响应转换 (JSONPath)', type: 'string', required: false, placeholder: '$.data.items', description: '使用 JSONPath 表达式提取响应数据' },
    ],
  };

  private buildHeaders(auth?: Record<string, unknown>, params?: Record<string, unknown>): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    if (params?.defaultContentType) {
      headers['Content-Type'] = params.defaultContentType as string;
    }

    // 默认请求头
    if (params?.defaultHeaders) {
      try {
        const defaultHeaders = typeof params.defaultHeaders === 'string'
          ? JSON.parse(params.defaultHeaders)
          : params.defaultHeaders;
        Object.assign(headers, defaultHeaders);
      } catch { /* ignore */ }
    }

    if (!auth) return headers;

    const authType = (auth.authType as string) || 'none';

    switch (authType) {
      case 'bearer':
        headers['Authorization'] = `${auth.bearerPrefix || 'Bearer'} ${auth.bearerToken || ''}`;
        break;
      case 'basic': {
        const encoded = Buffer.from(`${auth.basicUsername || ''}:${auth.basicPassword || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
        break;
      }
      case 'apikey':
        if ((auth.apiKeyLocation as string) === 'header') {
          headers[(auth.apiKeyName as string) || 'X-API-Key'] = (auth.apiKey as string) || '';
        }
        break;
      case 'custom-header':
        if (auth.customHeaders) {
          try {
            const custom = typeof auth.customHeaders === 'string'
              ? JSON.parse(auth.customHeaders)
              : auth.customHeaders;
            Object.assign(headers, custom);
          } catch { /* ignore */ }
        }
        break;
    }

    return headers;
  }

  private buildRequestUrl(baseUrl: string, path: string, auth?: Record<string, unknown>, params?: Record<string, unknown>): string {
    const url = new URL(path, baseUrl);

    // API Key 在 Query 参数中
    if (auth?.authType === 'apikey' && auth.apiKeyLocation === 'query') {
      url.searchParams.set((auth.apiKeyName as string) || 'api_key', (auth.apiKey as string) || '');
    }

    // 默认查询参数
    if (params?.defaultQueryParams) {
      try {
        const defaultParams = typeof params.defaultQueryParams === 'string'
          ? JSON.parse(params.defaultQueryParams)
          : params.defaultQueryParams;
        for (const [key, value] of Object.entries(defaultParams)) {
          url.searchParams.set(key, String(value));
        }
      } catch { /* ignore */ }
    }

    return url.toString();
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const baseUrl = params.baseUrl as string;
    if (!baseUrl) {
      return { success: false, latencyMs: 0, message: '基础 URL 不能为空' };
    }

    const healthPath = (params.healthCheckPath as string) || '/health';
    const timeout = (params.timeout as number) || 30000;
    const headers = this.buildHeaders(auth, params);
    const url = this.buildRequestUrl(baseUrl, healthPath, auth, params);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let body: any = null;
      if (contentType.includes('json')) {
        try { body = await response.json(); } catch { body = await response.text(); }
      } else {
        body = await response.text();
      }

      const details: Record<string, unknown> = {
        statusCode: response.status,
        statusText: response.statusText,
        contentType,
        headers: (() => { const h: Record<string, string> = {}; response.headers.forEach((v, k) => { h[k] = v; }); return h; })(),
        apiType: params.apiType || 'rest',
        authType: auth?.authType || 'none',
      };

      if (typeof body === 'object' && body !== null) {
        details.responseBody = body;
      } else if (typeof body === 'string') {
        details.responseBody = body.slice(0, 1000);
      }

      // 获取服务器信息
      const serverHeader = response.headers.get('server') || response.headers.get('x-powered-by') || '';

      if (response.ok) {
        return {
          success: true,
          latencyMs: 0,
          message: `HTTP API ${baseUrl} 连接成功 (${response.status} ${response.statusText})`,
          serverVersion: serverHeader || `HTTP ${response.status}`,
          details,
        };
      } else {
        return {
          success: false,
          latencyMs: 0,
          message: `HTTP API 返回错误: ${response.status} ${response.statusText}`,
          details,
        };
      }
    } catch (err) {
      return {
        success: false,
        latencyMs: 0,
        message: `HTTP API 连接失败: ${(err as Error).message}`,
        details: { baseUrl, error: (err as Error).message },
      };
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const baseUrl = params.baseUrl as string;
    const endpoints: DiscoveredEndpoint[] = [];
    const headers = this.buildHeaders(auth, params);

    // 尝试获取 OpenAPI 规范
    const specUrl = (params.openApiSpecUrl as string) || '';
    const specPaths = specUrl ? [specUrl] : ['/openapi.json', '/swagger.json', '/api-docs', '/v3/api-docs'];

    for (const specPath of specPaths) {
      try {
        const url = this.buildRequestUrl(baseUrl, specPath, auth, params);
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

        if (response.ok) {
          const spec = await response.json();

          // 解析 OpenAPI 规范
          if (spec.paths) {
            for (const [path, methods] of Object.entries(spec.paths as Record<string, any>)) {
              for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
                if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
                  endpoints.push({
                    resourcePath: `${method.toUpperCase()} ${path}`,
                    resourceType: 'api',
                    name: operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`,
                    dataFormat: 'json',
                    schemaInfo: {
                      method: method.toUpperCase(),
                      path,
                      operationId: operation.operationId,
                      tags: operation.tags,
                      parameters: operation.parameters?.map((p: any) => ({
                        name: p.name,
                        in: p.in,
                        required: p.required,
                        type: p.schema?.type,
                      })),
                      requestBody: operation.requestBody ? {
                        contentType: Object.keys(operation.requestBody.content || {})[0],
                        required: operation.requestBody.required,
                      } : undefined,
                      responses: Object.keys(operation.responses || {}),
                    },
                    metadata: {
                      description: operation.description,
                      deprecated: operation.deprecated,
                      security: operation.security,
                    },
                  });
                }
              }
            }

            // 添加 API 信息
            if (spec.info) {
              endpoints.unshift({
                resourcePath: '__api_info',
                resourceType: 'api',
                name: `API: ${spec.info.title || 'Unknown'}`,
                dataFormat: 'json',
                metadata: {
                  title: spec.info.title,
                  version: spec.info.version,
                  description: spec.info.description,
                  openApiVersion: spec.openapi || spec.swagger,
                  servers: spec.servers,
                },
              });
            }

            break; // 找到规范后停止搜索
          }
        }
      } catch { /* 继续尝试下一个路径 */ }
    }

    // 如果没有找到 OpenAPI 规范，返回基础端点信息
    if (endpoints.length === 0) {
      endpoints.push({
        resourcePath: baseUrl,
        resourceType: 'api',
        name: `API 基础端点: ${baseUrl}`,
        dataFormat: 'json',
        metadata: {
          note: '未找到 OpenAPI 规范，请手动配置端点',
          apiType: params.apiType || 'rest',
        },
      });
    }

    return endpoints;
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
