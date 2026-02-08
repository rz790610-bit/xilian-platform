/**
 * ArgoCD 真实客户端
 * 连接 ArgoCD API 进行 GitOps 应用管理
 */

import http from 'http';
import https from 'https';

// 配置
const ARGOCD_CONFIG = {
  host: process.env.ARGOCD_HOST || 'localhost',
  port: parseInt(process.env.ARGOCD_PORT || '443'),
  protocol: process.env.ARGOCD_PROTOCOL || 'https',
  token: process.env.ARGOCD_TOKEN,
  timeout: 30000,
};

// ============================================================
// 类型定义
// ============================================================

export interface ArgoCDApplication {
  metadata: {
    name: string;
    namespace: string;
    uid: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    source: {
      repoURL: string;
      path: string;
      targetRevision: string;
      helm?: {
        valueFiles?: string[];
        parameters?: Array<{ name: string; value: string }>;
      };
      kustomize?: {
        images?: string[];
      };
    };
    destination: {
      server: string;
      namespace: string;
    };
    project: string;
    syncPolicy?: {
      automated?: {
        prune: boolean;
        selfHeal: boolean;
      };
      syncOptions?: string[];
    };
  };
  status: {
    sync: {
      status: 'Synced' | 'OutOfSync' | 'Unknown';
      revision: string;
      comparedTo?: {
        source: {
          repoURL: string;
          path: string;
          targetRevision: string;
        };
        destination: {
          server: string;
          namespace: string;
        };
      };
    };
    health: {
      status: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown';
      message?: string;
    };
    operationState?: {
      operation: {
        sync: {
          revision: string;
        };
      };
      phase: 'Running' | 'Succeeded' | 'Failed' | 'Error' | 'Terminating';
      message: string;
      startedAt: string;
      finishedAt?: string;
    };
    resources?: Array<{
      group: string;
      version: string;
      kind: string;
      namespace: string;
      name: string;
      status: 'Synced' | 'OutOfSync' | 'Unknown';
      health?: {
        status: string;
        message?: string;
      };
    }>;
    summary: {
      images?: string[];
    };
    reconciledAt?: string;
  };
}

export interface ArgoCDProject {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    description: string;
    sourceRepos: string[];
    destinations: Array<{
      server: string;
      namespace: string;
    }>;
    clusterResourceWhitelist?: Array<{
      group: string;
      kind: string;
    }>;
    namespaceResourceBlacklist?: Array<{
      group: string;
      kind: string;
    }>;
    roles?: Array<{
      name: string;
      description: string;
      policies: string[];
      groups: string[];
    }>;
  };
}

export interface ArgoCDRepository {
  repo: string;
  username?: string;
  password?: string;
  sshPrivateKey?: string;
  connectionState: {
    status: 'Successful' | 'Failed';
    message: string;
    attemptedAt: string;
  };
  type: 'git' | 'helm';
  name?: string;
  project?: string;
}

export interface ArgoCDCluster {
  server: string;
  name: string;
  config: {
    tlsClientConfig?: {
      insecure: boolean;
    };
  };
  connectionState: {
    status: 'Successful' | 'Failed';
    message: string;
    attemptedAt: string;
  };
  serverVersion?: string;
  info?: {
    applicationsCount: number;
    serverVersion: string;
    cacheInfo: {
      resourcesCount: number;
      apisCount: number;
    };
  };
}

// ============================================================
// HTTP 请求工具
// ============================================================

async function argoRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (ARGOCD_CONFIG.token) {
      headers['Authorization'] = `Bearer ${ARGOCD_CONFIG.token}`;
    }

    const options = {
      hostname: ARGOCD_CONFIG.host,
      port: ARGOCD_CONFIG.port,
      path: `/api/v1${path}`,
      method,
      timeout: ARGOCD_CONFIG.timeout,
      headers,
      rejectUnauthorized: false, // ArgoCD 通常使用自签名证书
    };

    const protocol = ARGOCD_CONFIG.protocol === 'https' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`ArgoCD error: ${parsed.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Failed to parse ArgoCD response: ${error}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`ArgoCD request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('ArgoCD request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// ============================================================
// ArgoCD 客户端类
// ============================================================

export class ArgoCDClient {
  private static instance: ArgoCDClient;

  private constructor() {
    console.log('[ArgoCD] Client initialized');
  }

  static getInstance(): ArgoCDClient {
    if (!ArgoCDClient.instance) {
      ArgoCDClient.instance = new ArgoCDClient();
    }
    return ArgoCDClient.instance;
  }

  /**
   * 检查连接状态
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.getVersion();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 ArgoCD 版本
   */
  async getVersion(): Promise<{ Version: string; BuildDate: string; GitCommit: string } | null> {
    try {
      return await argoRequest<{ Version: string; BuildDate: string; GitCommit: string }>(
        'GET',
        '/version'
      );
    } catch {
      return null;
    }
  }

  // ============================================================
  // 应用管理
  // ============================================================

  /**
   * 列出所有应用
   */
  async listApplications(project?: string): Promise<ArgoCDApplication[]> {
    try {
      const query = project ? `?project=${project}` : '';
      const result = await argoRequest<{ items: ArgoCDApplication[] }>(
        'GET',
        `/applications${query}`
      );
      return result.items || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取应用详情
   */
  async getApplication(name: string): Promise<ArgoCDApplication | null> {
    try {
      return await argoRequest<ArgoCDApplication>('GET', `/applications/${name}`);
    } catch {
      return null;
    }
  }

  /**
   * 创建应用
   */
  async createApplication(app: {
    name: string;
    project: string;
    repoURL: string;
    path: string;
    targetRevision: string;
    destServer: string;
    destNamespace: string;
    autoSync?: boolean;
    autoPrune?: boolean;
    selfHeal?: boolean;
  }): Promise<ArgoCDApplication | null> {
    try {
      const application = {
        metadata: {
          name: app.name,
        },
        spec: {
          project: app.project,
          source: {
            repoURL: app.repoURL,
            path: app.path,
            targetRevision: app.targetRevision,
          },
          destination: {
            server: app.destServer,
            namespace: app.destNamespace,
          },
          syncPolicy: app.autoSync ? {
            automated: {
              prune: app.autoPrune || false,
              selfHeal: app.selfHeal || false,
            },
          } : undefined,
        },
      };
      
      return await argoRequest<ArgoCDApplication>('POST', '/applications', application);
    } catch {
      return null;
    }
  }

  /**
   * 删除应用
   */
  async deleteApplication(name: string, cascade?: boolean): Promise<boolean> {
    try {
      const query = cascade !== undefined ? `?cascade=${cascade}` : '';
      await argoRequest('DELETE', `/applications/${name}${query}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 同步应用
   */
  async syncApplication(
    name: string,
    options?: {
      revision?: string;
      prune?: boolean;
      dryRun?: boolean;
      resources?: Array<{ group: string; kind: string; name: string }>;
    }
  ): Promise<ArgoCDApplication | null> {
    try {
      return await argoRequest<ArgoCDApplication>(
        'POST',
        `/applications/${name}/sync`,
        options || {}
      );
    } catch {
      return null;
    }
  }

  /**
   * 回滚应用
   */
  async rollbackApplication(name: string, id: number): Promise<ArgoCDApplication | null> {
    try {
      return await argoRequest<ArgoCDApplication>(
        'POST',
        `/applications/${name}/rollback`,
        { id }
      );
    } catch {
      return null;
    }
  }

  /**
   * 刷新应用
   */
  async refreshApplication(name: string, hard?: boolean): Promise<ArgoCDApplication | null> {
    try {
      const query = hard ? '?refresh=hard' : '?refresh=normal';
      return await argoRequest<ArgoCDApplication>('GET', `/applications/${name}${query}`);
    } catch {
      return null;
    }
  }

  /**
   * 获取应用资源树
   */
  async getApplicationResourceTree(name: string): Promise<{
    nodes: Array<{
      resourceRef: {
        group: string;
        version: string;
        kind: string;
        namespace: string;
        name: string;
      };
      parentRefs?: Array<{
        group: string;
        kind: string;
        namespace: string;
        name: string;
      }>;
      health?: {
        status: string;
        message?: string;
      };
      info?: Array<{ name: string; value: string }>;
    }>;
  } | null> {
    try {
      return await argoRequest('GET', `/applications/${name}/resource-tree`);
    } catch {
      return null;
    }
  }

  // ============================================================
  // 项目管理
  // ============================================================

  /**
   * 列出所有项目
   */
  async listProjects(): Promise<ArgoCDProject[]> {
    try {
      const result = await argoRequest<{ items: ArgoCDProject[] }>('GET', '/projects');
      return result.items || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取项目详情
   */
  async getProject(name: string): Promise<ArgoCDProject | null> {
    try {
      return await argoRequest<ArgoCDProject>('GET', `/projects/${name}`);
    } catch {
      return null;
    }
  }

  // ============================================================
  // 仓库管理
  // ============================================================

  /**
   * 列出所有仓库
   */
  async listRepositories(): Promise<ArgoCDRepository[]> {
    try {
      const result = await argoRequest<{ items: ArgoCDRepository[] }>('GET', '/repositories');
      return result.items || [];
    } catch {
      return [];
    }
  }

  /**
   * 添加仓库
   */
  async createRepository(repo: {
    repo: string;
    username?: string;
    password?: string;
    sshPrivateKey?: string;
    type?: 'git' | 'helm';
    name?: string;
    project?: string;
  }): Promise<ArgoCDRepository | null> {
    try {
      return await argoRequest<ArgoCDRepository>('POST', '/repositories', repo);
    } catch {
      return null;
    }
  }

  /**
   * 删除仓库
   */
  async deleteRepository(repo: string): Promise<boolean> {
    try {
      await argoRequest('DELETE', `/repositories/${encodeURIComponent(repo)}`);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // 集群管理
  // ============================================================

  /**
   * 列出所有集群
   */
  async listClusters(): Promise<ArgoCDCluster[]> {
    try {
      const result = await argoRequest<{ items: ArgoCDCluster[] }>('GET', '/clusters');
      return result.items || [];
    } catch {
      return [];
    }
  }

  /**
   * 获取集群详情
   */
  async getCluster(server: string): Promise<ArgoCDCluster | null> {
    try {
      return await argoRequest<ArgoCDCluster>(
        'GET',
        `/clusters/${encodeURIComponent(server)}`
      );
    } catch {
      return null;
    }
  }

  // ============================================================
  // 概览
  // ============================================================

  /**
   * 获取 ArgoCD 概览
   */
  async getOverview(): Promise<{
    version: string | null;
    applications: {
      total: number;
      synced: number;
      outOfSync: number;
      healthy: number;
      degraded: number;
    };
    projects: number;
    repositories: number;
    clusters: number;
  }> {
    const [version, apps, projects, repos, clusters] = await Promise.all([
      this.getVersion(),
      this.listApplications(),
      this.listProjects(),
      this.listRepositories(),
      this.listClusters(),
    ]);

    return {
      version: version?.Version || null,
      applications: {
        total: apps.length,
        synced: apps.filter((a) => a.status.sync.status === 'Synced').length,
        outOfSync: apps.filter((a) => a.status.sync.status === 'OutOfSync').length,
        healthy: apps.filter((a) => a.status.health.status === 'Healthy').length,
        degraded: apps.filter((a) => a.status.health.status === 'Degraded').length,
      },
      projects: projects.length,
      repositories: repos.length,
      clusters: clusters.length,
    };
  }
}

// 导出单例
export const argoCDClient = ArgoCDClient.getInstance();
