/**
 * Vault 服务单元测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VaultClient } from './vaultClient';
import { DatabaseCredentialManager, MultiDatabaseCredentialManager, DatabaseRoles } from './credentialRotation';
import { ApiKeyManager, ApiKeyScopes, ApiKeyTypeConfigs } from './apiKeyManager';
import { PKIManager, PKIRoleTemplates } from './pkiManager';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VaultClient', () => {
  let client: VaultClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new VaultClient({
      address: 'http://vault:8200',
      token: 'test-token',
    });
  });

  afterEach(() => {
    client.cleanup();
  });

  describe('healthCheck', () => {
    it('should check vault health', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          initialized: true,
          sealed: false,
          standby: false,
          version: '1.15.0',
        }),
      });

      const health = await client.healthCheck();

      expect(health.initialized).toBe(true);
      expect(health.sealed).toBe(false);
    });
  });

  describe('KV Secrets', () => {
    it('should read secret', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: {
            data: { username: 'admin', password: 'secret' },
            metadata: { version: 1 },
          },
        }),
      });

      const secret = await client.readSecret('app/config');

      expect(secret.data.username).toBe('admin');
    });

    it('should write secret', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      await expect(client.writeSecret('app/config', { key: 'value' })).resolves.not.toThrow();
    });

    it('should list secrets', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { keys: ['secret1', 'secret2'] },
        }),
      });

      const keys = await client.listSecrets('app');

      expect(keys).toContain('secret1');
      expect(keys).toContain('secret2');
    });
  });

  describe('Database Credentials', () => {
    it('should get database credential', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: {
            username: 'v-token-mysql-readonly-abc123',
            password: 'generated-password',
          },
          lease_id: 'database/creds/mysql-readonly/abc123',
          lease_duration: 3600,
          renewable: true,
        }),
      });

      const cred = await client.getDatabaseCredential('mysql-readonly');

      expect(cred.username).toContain('mysql-readonly');
      expect(cred.password).toBeDefined();
      expect(cred.lease_id).toBeDefined();
    });
  });

  describe('Transit Encryption', () => {
    it('should encrypt data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { ciphertext: 'vault:v1:encrypted-data' },
        }),
      });

      const ciphertext = await client.encrypt('my-key', 'sensitive data');

      expect(ciphertext).toContain('vault:v1:');
    });

    it('should decrypt data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { plaintext: Buffer.from('sensitive data').toString('base64') },
        }),
      });

      const plaintext = await client.decrypt('my-key', 'vault:v1:encrypted-data');

      expect(plaintext).toBe('sensitive data');
    });
  });
});

describe('DatabaseCredentialManager', () => {
  let vaultClient: VaultClient;
  let manager: DatabaseCredentialManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vaultClient = new VaultClient({
      address: 'http://vault:8200',
      token: 'test-token',
    });
    manager = new DatabaseCredentialManager(vaultClient, {
      role: 'mysql-readonly',
      renewBeforeExpiry: 60,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('getCredential', () => {
    it('should fetch new credential when none exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { username: 'test-user', password: 'test-pass' },
          lease_id: 'lease-123',
          lease_duration: 3600,
          renewable: true,
        }),
      });

      const cred = await manager.getCredential();

      expect(cred.username).toBe('test-user');
      expect(cred.password).toBe('test-pass');
    });

    it('should return cached credential if not expired', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { username: 'test-user', password: 'test-pass' },
          lease_id: 'lease-123',
          lease_duration: 3600,
          renewable: true,
        }),
      });

      await manager.getCredential();
      const cred2 = await manager.getCredential();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(cred2.username).toBe('test-user');
    });
  });

  describe('onCredentialChange', () => {
    it('should call callback when credential changes', async () => {
      const callback = vi.fn();
      manager.onCredentialChange(callback);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { username: 'test-user', password: 'test-pass' },
          lease_id: 'lease-123',
          lease_duration: 3600,
          renewable: true,
        }),
      });

      await manager.getCredential();

      expect(callback).toHaveBeenCalledWith({
        username: 'test-user',
        password: 'test-pass',
      });
    });
  });

  describe('getStatus', () => {
    it('should return status with credential info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { username: 'test-user', password: 'test-pass' },
          lease_id: 'lease-123',
          lease_duration: 3600,
          renewable: true,
        }),
      });

      await manager.getCredential();
      const status = manager.getStatus();

      expect(status.hasCredential).toBe(true);
      expect(status.username).toBe('test-user');
      expect(status.expiresAt).toBeDefined();
    });

    it('should return no credential status initially', () => {
      const status = manager.getStatus();

      expect(status.hasCredential).toBe(false);
    });
  });
});

describe('MultiDatabaseCredentialManager', () => {
  let vaultClient: VaultClient;
  let multiManager: MultiDatabaseCredentialManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vaultClient = new VaultClient({
      address: 'http://vault:8200',
      token: 'test-token',
    });
    multiManager = new MultiDatabaseCredentialManager(vaultClient);
  });

  afterEach(async () => {
    await multiManager.shutdown();
  });

  describe('registerDatabase', () => {
    it('should register new database', () => {
      const manager = multiManager.registerDatabase('mysql', { role: 'mysql-readonly' });

      expect(manager).toBeDefined();
    });

    it('should throw when registering duplicate database', () => {
      multiManager.registerDatabase('mysql', { role: 'mysql-readonly' });

      expect(() => multiManager.registerDatabase('mysql', { role: 'mysql-readonly' }))
        .toThrow('Database mysql already registered');
    });
  });

  describe('getAllStatus', () => {
    it('should return status for all databases', () => {
      multiManager.registerDatabase('mysql', { role: 'mysql-readonly' });
      multiManager.registerDatabase('postgres', { role: 'postgres-readonly' });

      const status = multiManager.getAllStatus();

      expect(status.mysql).toBeDefined();
      expect(status.postgres).toBeDefined();
    });
  });
});

describe('ApiKeyManager', () => {
  let vaultClient: VaultClient;
  let manager: ApiKeyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vaultClient = new VaultClient({
      address: 'http://vault:8200',
      token: 'test-token',
    });
    manager = new ApiKeyManager(vaultClient, 'api-keys');
  });

  describe('createKey', () => {
    it('should create new API key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const key = await manager.createKey('test-key', 'internal', {
        owner: 'admin',
        scopes: ['read:*'],
      });

      expect(key.id).toBeDefined();
      expect(key.key).toBeDefined();
      expect(key.metadata.name).toBe('test-key');
      expect(key.metadata.type).toBe('internal');
    });

    it('should set expiration when expiresIn is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const key = await manager.createKey('test-key', 'external', {
        owner: 'admin',
        expiresIn: 86400,
      });

      expect(key.metadata.expiresAt).toBeDefined();
      expect(key.metadata.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('validateKey', () => {
    it('should validate key with correct scopes', async () => {
      // Create key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const key = await manager.createKey('test-key', 'internal', {
        owner: 'admin',
        scopes: ['read:*', 'write:devices'],
      });

      // Mock listKeys
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: { keys: [key.id] },
        }),
      });

      // Mock getKey
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: {
            data: { key: key.key, metadata: key.metadata },
          },
        }),
      });

      const result = await manager.validateKey(key.key, {
        requiredScopes: ['read:devices'],
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('rotateKey', () => {
    it('should rotate key and increment rotation count', async () => {
      // Create key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const key = await manager.createKey('test-key', 'internal', {
        owner: 'admin',
      });

      // Mock getKey for rotation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({
          data: {
            data: { key: key.key, metadata: key.metadata },
          },
        }),
      });

      // Mock writeSecret for rotation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({}),
      });

      const rotated = await manager.rotateKey(key.id);

      expect(rotated.key).not.toBe(key.key);
      expect(rotated.metadata.rotationCount).toBe(1);
    });
  });
});

describe('PKIManager', () => {
  let vaultClient: VaultClient;
  let manager: PKIManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vaultClient = new VaultClient({
      address: 'http://vault:8200',
      token: 'test-token',
    });
    manager = new PKIManager(vaultClient, 'pki');
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('listCertificates', () => {
    it('should return empty array when no certificates exist', () => {
      const certs = manager.listCertificates();
      expect(certs).toBeInstanceOf(Array);
      expect(certs.length).toBe(0);
    });

    it('should filter by type', () => {
      const serverCerts = manager.listCertificates({ type: 'server' });
      expect(serverCerts).toBeInstanceOf(Array);
    });

    it('should filter by status', () => {
      const activeCerts = manager.listCertificates({ status: 'active' });
      expect(activeCerts).toBeInstanceOf(Array);
    });
  });

  describe('getStats', () => {
    it('should return initial statistics', () => {
      const stats = manager.getStats();

      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.revoked).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.byType).toBeDefined();
    });
  });

  describe('findExpiringCertificates', () => {
    it('should return empty array when no certificates exist', () => {
      const expiring = manager.findExpiringCertificates(7200);
      expect(expiring).toBeInstanceOf(Array);
      expect(expiring.length).toBe(0);
    });
  });
});

describe('Predefined Configurations', () => {
  it('should have valid database roles', () => {
    expect(DatabaseRoles.MYSQL_READONLY).toBe('mysql-readonly');
    expect(DatabaseRoles.POSTGRES_ADMIN).toBe('postgres-admin');
  });

  it('should have valid API key scopes', () => {
    expect(ApiKeyScopes.READ_ALL).toBe('read:*');
    expect(ApiKeyScopes.ADMIN_ALL).toBe('admin:*');
  });

  it('should have valid API key type configs', () => {
    expect(ApiKeyTypeConfigs.internal.defaultTTL).toBeGreaterThan(0);
    expect(ApiKeyTypeConfigs.external.rateLimit).toBeLessThan(ApiKeyTypeConfigs.internal.rateLimit);
  });

  it('should have valid PKI role templates', () => {
    expect(PKIRoleTemplates['server-cert'].max_ttl).toBe('8760h');
    expect(PKIRoleTemplates['client-cert'].ext_key_usage).toContain('ClientAuth');
  });
});
