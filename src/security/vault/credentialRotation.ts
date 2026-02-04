/**
 * 数据库凭证轮换服务
 * 自动管理数据库凭证的获取、续期和轮换
 */

import { VaultClient } from './vaultClient';

// 凭证配置
interface CredentialConfig {
  role: string;
  database: string;
  renewBeforeExpiry: number; // 秒
  maxRetries: number;
  retryDelay: number; // 毫秒
}

// 凭证状态
interface CredentialState {
  username: string;
  password: string;
  leaseId: string;
  expiresAt: number;
  renewCount: number;
  lastRenewed: number;
}

// 凭证变更回调
type CredentialChangeCallback = (credential: { username: string; password: string }) => Promise<void>;

/**
 * 数据库凭证管理器
 */
export class DatabaseCredentialManager {
  private vaultClient: VaultClient;
  private config: CredentialConfig;
  private state: CredentialState | null = null;
  private renewTimer: NodeJS.Timeout | null = null;
  private changeCallbacks: CredentialChangeCallback[] = [];
  private isShuttingDown: boolean = false;

  constructor(vaultClient: VaultClient, config: Partial<CredentialConfig> = {}) {
    this.vaultClient = vaultClient;
    this.config = {
      role: config.role || 'app-readonly',
      database: config.database || 'mysql',
      renewBeforeExpiry: config.renewBeforeExpiry || 60,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
    };
  }

  /**
   * 注册凭证变更回调
   */
  onCredentialChange(callback: CredentialChangeCallback): void {
    this.changeCallbacks.push(callback);
  }

  /**
   * 获取当前凭证
   */
  async getCredential(): Promise<{ username: string; password: string }> {
    if (this.state && Date.now() < this.state.expiresAt - this.config.renewBeforeExpiry * 1000) {
      return {
        username: this.state.username,
        password: this.state.password,
      };
    }

    // 需要获取新凭证
    await this.fetchNewCredential();

    if (!this.state) {
      throw new Error('Failed to obtain database credential');
    }

    return {
      username: this.state.username,
      password: this.state.password,
    };
  }

  /**
   * 获取新凭证
   */
  private async fetchNewCredential(): Promise<void> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        const credential = await this.vaultClient.getDatabaseCredential(this.config.role);

        // 撤销旧租约
        if (this.state?.leaseId) {
          try {
            await this.vaultClient.revokeLease(this.state.leaseId);
          } catch (error) {
            console.warn('[CredentialManager] Failed to revoke old lease:', error);
          }
        }

        this.state = {
          username: credential.username,
          password: credential.password,
          leaseId: credential.lease_id,
          expiresAt: Date.now() + credential.lease_duration * 1000,
          renewCount: 0,
          lastRenewed: Date.now(),
        };

        // 通知凭证变更
        await this.notifyCredentialChange();

        // 调度续期
        this.scheduleRenewal();

        console.log(`[CredentialManager] New credential obtained, expires at ${new Date(this.state.expiresAt).toISOString()}`);
        return;
      } catch (error: any) {
        lastError = error;
        console.error(`[CredentialManager] Failed to fetch credential (attempt ${i + 1}):`, error);
        
        if (i < this.config.maxRetries - 1) {
          await this.sleep(this.config.retryDelay * (i + 1));
        }
      }
    }

    throw lastError || new Error('Failed to fetch credential after retries');
  }

  /**
   * 续期凭证
   */
  private async renewCredential(): Promise<void> {
    if (!this.state || this.isShuttingDown) return;

    try {
      const newDuration = await this.vaultClient.renewLease(this.state.leaseId);
      
      this.state.expiresAt = Date.now() + newDuration * 1000;
      this.state.renewCount++;
      this.state.lastRenewed = Date.now();

      console.log(`[CredentialManager] Credential renewed (count: ${this.state.renewCount}), expires at ${new Date(this.state.expiresAt).toISOString()}`);

      // 调度下次续期
      this.scheduleRenewal();
    } catch (error) {
      console.error('[CredentialManager] Credential renewal failed:', error);
      
      // 续期失败，尝试获取新凭证
      try {
        await this.fetchNewCredential();
      } catch (fetchError) {
        console.error('[CredentialManager] Failed to fetch new credential after renewal failure:', fetchError);
      }
    }
  }

  /**
   * 调度续期
   */
  private scheduleRenewal(): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
    }

    if (!this.state || this.isShuttingDown) return;

    const timeUntilExpiry = this.state.expiresAt - Date.now();
    const renewIn = Math.max(timeUntilExpiry - this.config.renewBeforeExpiry * 1000, 1000);

    this.renewTimer = setTimeout(() => this.renewCredential(), renewIn);
  }

  /**
   * 通知凭证变更
   */
  private async notifyCredentialChange(): Promise<void> {
    if (!this.state) return;

    const credential = {
      username: this.state.username,
      password: this.state.password,
    };

    for (const callback of this.changeCallbacks) {
      try {
        await callback(credential);
      } catch (error) {
        console.error('[CredentialManager] Credential change callback failed:', error);
      }
    }
  }

  /**
   * 强制轮换凭证
   */
  async forceRotation(): Promise<void> {
    console.log('[CredentialManager] Forcing credential rotation');
    await this.fetchNewCredential();
  }

  /**
   * 获取凭证状态
   */
  getStatus(): {
    hasCredential: boolean;
    username?: string;
    expiresAt?: number;
    renewCount?: number;
    lastRenewed?: number;
  } {
    if (!this.state) {
      return { hasCredential: false };
    }

    return {
      hasCredential: true,
      username: this.state.username,
      expiresAt: this.state.expiresAt,
      renewCount: this.state.renewCount,
      lastRenewed: this.state.lastRenewed,
    };
  }

  /**
   * 关闭管理器
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }

    // 撤销当前租约
    if (this.state?.leaseId) {
      try {
        await this.vaultClient.revokeLease(this.state.leaseId);
        console.log('[CredentialManager] Lease revoked on shutdown');
      } catch (error) {
        console.warn('[CredentialManager] Failed to revoke lease on shutdown:', error);
      }
    }

    this.state = null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 多数据库凭证管理器
 */
export class MultiDatabaseCredentialManager {
  private managers: Map<string, DatabaseCredentialManager> = new Map();
  private vaultClient: VaultClient;

  constructor(vaultClient: VaultClient) {
    this.vaultClient = vaultClient;
  }

  /**
   * 注册数据库
   */
  registerDatabase(
    name: string,
    config: Partial<CredentialConfig>
  ): DatabaseCredentialManager {
    if (this.managers.has(name)) {
      throw new Error(`Database ${name} already registered`);
    }

    const manager = new DatabaseCredentialManager(this.vaultClient, config);
    this.managers.set(name, manager);
    return manager;
  }

  /**
   * 获取数据库凭证
   */
  async getCredential(name: string): Promise<{ username: string; password: string }> {
    const manager = this.managers.get(name);
    if (!manager) {
      throw new Error(`Database ${name} not registered`);
    }
    return manager.getCredential();
  }

  /**
   * 获取管理器
   */
  getManager(name: string): DatabaseCredentialManager | undefined {
    return this.managers.get(name);
  }

  /**
   * 获取所有数据库状态
   */
  getAllStatus(): Record<string, ReturnType<DatabaseCredentialManager['getStatus']>> {
    const status: Record<string, ReturnType<DatabaseCredentialManager['getStatus']>> = {};
    
    for (const [name, manager] of this.managers) {
      status[name] = manager.getStatus();
    }
    
    return status;
  }

  /**
   * 强制轮换所有凭证
   */
  async forceRotationAll(): Promise<void> {
    const promises = Array.from(this.managers.values()).map(m => m.forceRotation());
    await Promise.all(promises);
  }

  /**
   * 关闭所有管理器
   */
  async shutdown(): Promise<void> {
    const promises = Array.from(this.managers.values()).map(m => m.shutdown());
    await Promise.all(promises);
    this.managers.clear();
  }
}

// 预定义的数据库角色
export const DatabaseRoles = {
  // MySQL 角色
  MYSQL_READONLY: 'mysql-readonly',
  MYSQL_READWRITE: 'mysql-readwrite',
  MYSQL_ADMIN: 'mysql-admin',
  
  // PostgreSQL 角色
  POSTGRES_READONLY: 'postgres-readonly',
  POSTGRES_READWRITE: 'postgres-readwrite',
  POSTGRES_ADMIN: 'postgres-admin',
  
  // ClickHouse 角色
  CLICKHOUSE_READONLY: 'clickhouse-readonly',
  CLICKHOUSE_READWRITE: 'clickhouse-readwrite',
};

// Vault 数据库配置模板
export const DatabaseConfigTemplates = {
  mysql: {
    plugin_name: 'mysql-database-plugin',
    allowed_roles: ['mysql-readonly', 'mysql-readwrite', 'mysql-admin'],
    connection_url: '{{username}}:{{password}}@tcp(mysql:3306)/',
    max_open_connections: 5,
    max_idle_connections: 0,
    max_connection_lifetime: '5s',
  },
  postgres: {
    plugin_name: 'postgresql-database-plugin',
    allowed_roles: ['postgres-readonly', 'postgres-readwrite', 'postgres-admin'],
    connection_url: 'postgresql://{{username}}:{{password}}@postgres:5432/xilian?sslmode=disable',
    max_open_connections: 5,
    max_idle_connections: 0,
    max_connection_lifetime: '5s',
  },
  clickhouse: {
    plugin_name: 'clickhouse-database-plugin',
    allowed_roles: ['clickhouse-readonly', 'clickhouse-readwrite'],
    connection_url: 'tcp://{{username}}:{{password}}@clickhouse:9000/default',
    max_open_connections: 5,
  },
};

// 数据库角色配置模板
export const DatabaseRoleTemplates = {
  'mysql-readonly': {
    db_name: 'mysql',
    creation_statements: [
      "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
      "GRANT SELECT ON *.* TO '{{name}}'@'%';",
    ],
    default_ttl: '1h',
    max_ttl: '24h',
  },
  'mysql-readwrite': {
    db_name: 'mysql',
    creation_statements: [
      "CREATE USER '{{name}}'@'%' IDENTIFIED BY '{{password}}';",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON *.* TO '{{name}}'@'%';",
    ],
    default_ttl: '1h',
    max_ttl: '24h',
  },
  'postgres-readonly': {
    db_name: 'postgres',
    creation_statements: [
      "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
      "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";",
    ],
    default_ttl: '1h',
    max_ttl: '24h',
  },
};
