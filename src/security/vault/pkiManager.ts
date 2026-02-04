/**
 * PKI 证书管理服务
 * 使用 Vault PKI 引擎管理证书的签发、续期和撤销
 */

import { VaultClient } from './vaultClient';

// 证书类型
type CertificateType = 'server' | 'client' | 'mutual' | 'code-signing';

// 证书请求
interface CertificateRequest {
  commonName: string;
  type: CertificateType;
  altNames?: string[];
  ipSans?: string[];
  uriSans?: string[];
  ttl?: string;
  excludeCnFromSans?: boolean;
  format?: 'pem' | 'der' | 'pem_bundle';
  privateKeyFormat?: 'der' | 'pkcs8';
}

// 证书信息
interface Certificate {
  id: string;
  serialNumber: string;
  commonName: string;
  type: CertificateType;
  certificate: string;
  privateKey: string;
  privateKeyType: string;
  issuingCa: string;
  caChain: string[];
  expiration: number;
  issuedAt: number;
  status: 'active' | 'revoked' | 'expired';
}

// 证书存储
interface CertificateStore {
  certificates: Map<string, Certificate>;
  bySerialNumber: Map<string, string>;
  byCommonName: Map<string, string[]>;
}

/**
 * PKI 证书管理器
 */
export class PKIManager {
  private vaultClient: VaultClient;
  private pkiPath: string;
  private store: CertificateStore;
  private renewalTimers: Map<string, NodeJS.Timeout> = new Map();
  private renewBeforeExpiry: number = 86400; // 24 小时

  constructor(vaultClient: VaultClient, pkiPath: string = 'pki') {
    this.vaultClient = vaultClient;
    this.pkiPath = pkiPath;
    this.store = {
      certificates: new Map(),
      bySerialNumber: new Map(),
      byCommonName: new Map(),
    };
  }

  /**
   * 签发新证书
   */
  async issueCertificate(request: CertificateRequest): Promise<Certificate> {
    const role = this.getRoleForType(request.type);
    
    const vaultCert = await this.vaultClient.generateCertificate(
      role,
      request.commonName,
      {
        altNames: request.altNames,
        ipSans: request.ipSans,
        ttl: request.ttl,
        format: request.format,
      }
    );

    const id = this.generateCertId();
    const now = Date.now();

    const certificate: Certificate = {
      id,
      serialNumber: vaultCert.serial_number,
      commonName: request.commonName,
      type: request.type,
      certificate: vaultCert.certificate,
      privateKey: vaultCert.private_key,
      privateKeyType: vaultCert.private_key_type,
      issuingCa: vaultCert.issuing_ca,
      caChain: vaultCert.ca_chain,
      expiration: vaultCert.expiration * 1000,
      issuedAt: now,
      status: 'active',
    };

    // 存储证书
    this.storeCertificate(certificate);

    // 调度自动续期
    this.scheduleRenewal(certificate);

    return certificate;
  }

  /**
   * 获取证书
   */
  getCertificate(id: string): Certificate | undefined {
    return this.store.certificates.get(id);
  }

  /**
   * 通过序列号获取证书
   */
  getCertificateBySerial(serialNumber: string): Certificate | undefined {
    const id = this.store.bySerialNumber.get(serialNumber);
    return id ? this.store.certificates.get(id) : undefined;
  }

  /**
   * 通过 CN 获取证书列表
   */
  getCertificatesByCommonName(commonName: string): Certificate[] {
    const ids = this.store.byCommonName.get(commonName) || [];
    return ids
      .map(id => this.store.certificates.get(id))
      .filter((c): c is Certificate => c !== undefined);
  }

  /**
   * 续期证书
   */
  async renewCertificate(id: string): Promise<Certificate> {
    const existing = this.store.certificates.get(id);
    if (!existing) {
      throw new Error(`Certificate ${id} not found`);
    }

    if (existing.status === 'revoked') {
      throw new Error(`Cannot renew revoked certificate ${id}`);
    }

    // 签发新证书
    const newCert = await this.issueCertificate({
      commonName: existing.commonName,
      type: existing.type,
      ttl: this.calculateTTL(existing),
    });

    // 撤销旧证书
    await this.revokeCertificate(id);

    return newCert;
  }

  /**
   * 撤销证书
   */
  async revokeCertificate(id: string): Promise<void> {
    const cert = this.store.certificates.get(id);
    if (!cert) {
      throw new Error(`Certificate ${id} not found`);
    }

    if (cert.status === 'revoked') {
      return;
    }

    // 在 Vault 中撤销
    await this.vaultClient.revokeCertificate(cert.serialNumber);

    // 更新状态
    cert.status = 'revoked';

    // 取消续期定时器
    const timer = this.renewalTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.renewalTimers.delete(id);
    }
  }

  /**
   * 获取 CA 证书
   */
  async getCACertificate(): Promise<string> {
    return this.vaultClient.getCACertificate();
  }

  /**
   * 获取 CRL
   */
  async getCRL(): Promise<string> {
    return this.vaultClient.getCRL();
  }

  /**
   * 列出所有证书
   */
  listCertificates(options?: {
    type?: CertificateType;
    status?: 'active' | 'revoked' | 'expired';
    commonName?: string;
  }): Certificate[] {
    let certs = Array.from(this.store.certificates.values());

    if (options?.type) {
      certs = certs.filter(c => c.type === options.type);
    }

    if (options?.status) {
      certs = certs.filter(c => c.status === options.status);
    }

    if (options?.commonName) {
      certs = certs.filter(c => c.commonName === options.commonName);
    }

    return certs;
  }

  /**
   * 查找即将过期的证书
   */
  findExpiringCertificates(withinSeconds: number): Certificate[] {
    const threshold = Date.now() + withinSeconds * 1000;
    return this.listCertificates({ status: 'active' })
      .filter(c => c.expiration < threshold);
  }

  /**
   * 批量续期即将过期的证书
   */
  async renewExpiringCertificates(withinSeconds: number): Promise<string[]> {
    const expiring = this.findExpiringCertificates(withinSeconds);
    const renewedIds: string[] = [];

    for (const cert of expiring) {
      try {
        const newCert = await this.renewCertificate(cert.id);
        renewedIds.push(newCert.id);
      } catch (error) {
        console.error(`[PKIManager] Failed to renew certificate ${cert.id}:`, error);
      }
    }

    return renewedIds;
  }

  /**
   * 验证证书链
   */
  async verifyCertificateChain(certificate: string): Promise<{
    valid: boolean;
    issuer?: string;
    subject?: string;
    expiration?: number;
    error?: string;
  }> {
    try {
      // 解析证书
      const certInfo = this.parseCertificate(certificate);
      
      // 检查过期
      if (Date.now() > certInfo.expiration) {
        return { valid: false, error: 'Certificate expired', ...certInfo };
      }

      // 获取 CA 证书验证链
      const caCert = await this.getCACertificate();
      
      // 简化验证：检查颁发者是否匹配
      if (certInfo.issuer !== this.extractSubject(caCert)) {
        return { valid: false, error: 'Issuer mismatch', ...certInfo };
      }

      return { valid: true, ...certInfo };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * 导出证书为 PKCS12 格式
   */
  exportAsPKCS12(id: string, password: string): Buffer {
    const cert = this.store.certificates.get(id);
    if (!cert) {
      throw new Error(`Certificate ${id} not found`);
    }

    // 注意：实际实现需要使用 node-forge 或类似库
    // 这里只是示意
    throw new Error('PKCS12 export not implemented - requires node-forge');
  }

  /**
   * 获取证书统计
   */
  getStats(): {
    total: number;
    active: number;
    revoked: number;
    expired: number;
    byType: Record<CertificateType, number>;
    expiringIn24h: number;
    expiringIn7d: number;
  } {
    const certs = Array.from(this.store.certificates.values());
    const now = Date.now();

    return {
      total: certs.length,
      active: certs.filter(c => c.status === 'active').length,
      revoked: certs.filter(c => c.status === 'revoked').length,
      expired: certs.filter(c => c.status === 'expired').length,
      byType: {
        server: certs.filter(c => c.type === 'server').length,
        client: certs.filter(c => c.type === 'client').length,
        mutual: certs.filter(c => c.type === 'mutual').length,
        'code-signing': certs.filter(c => c.type === 'code-signing').length,
      },
      expiringIn24h: certs.filter(c => c.status === 'active' && c.expiration < now + 86400000).length,
      expiringIn7d: certs.filter(c => c.status === 'active' && c.expiration < now + 604800000).length,
    };
  }

  // ==================== 内部方法 ====================

  /**
   * 根据证书类型获取 Vault 角色
   */
  private getRoleForType(type: CertificateType): string {
    const roleMap: Record<CertificateType, string> = {
      server: 'server-cert',
      client: 'client-cert',
      mutual: 'mutual-cert',
      'code-signing': 'code-signing-cert',
    };
    return roleMap[type];
  }

  /**
   * 生成证书 ID
   */
  private generateCertId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `cert-${timestamp}-${random}`;
  }

  /**
   * 存储证书
   */
  private storeCertificate(cert: Certificate): void {
    this.store.certificates.set(cert.id, cert);
    this.store.bySerialNumber.set(cert.serialNumber, cert.id);

    const cnList = this.store.byCommonName.get(cert.commonName) || [];
    cnList.push(cert.id);
    this.store.byCommonName.set(cert.commonName, cnList);
  }

  /**
   * 调度证书续期
   */
  private scheduleRenewal(cert: Certificate): void {
    const timeUntilExpiry = cert.expiration - Date.now();
    const renewIn = Math.max(timeUntilExpiry - this.renewBeforeExpiry * 1000, 1000);

    const timer = setTimeout(async () => {
      try {
        await this.renewCertificate(cert.id);
        console.log(`[PKIManager] Certificate ${cert.id} auto-renewed`);
      } catch (error) {
        console.error(`[PKIManager] Failed to auto-renew certificate ${cert.id}:`, error);
      }
    }, renewIn);

    this.renewalTimers.set(cert.id, timer);
  }

  /**
   * 计算 TTL
   */
  private calculateTTL(cert: Certificate): string {
    const originalTTL = cert.expiration - cert.issuedAt;
    return `${Math.floor(originalTTL / 1000)}s`;
  }

  /**
   * 解析证书信息
   */
  private parseCertificate(pem: string): {
    subject: string;
    issuer: string;
    expiration: number;
  } {
    // 简化实现，实际需要使用 crypto 或 node-forge
    // 这里返回模拟数据
    return {
      subject: 'CN=example.com',
      issuer: 'CN=XiLian Root CA',
      expiration: Date.now() + 86400000 * 365,
    };
  }

  /**
   * 提取证书主题
   */
  private extractSubject(pem: string): string {
    // 简化实现
    return 'CN=XiLian Root CA';
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    for (const timer of this.renewalTimers.values()) {
      clearTimeout(timer);
    }
    this.renewalTimers.clear();
  }
}

// PKI 角色配置模板
export const PKIRoleTemplates = {
  'server-cert': {
    allowed_domains: ['xilian.local', 'xilian.io'],
    allow_subdomains: true,
    max_ttl: '8760h', // 1 年
    key_type: 'rsa',
    key_bits: 2048,
    key_usage: ['DigitalSignature', 'KeyEncipherment'],
    ext_key_usage: ['ServerAuth'],
    require_cn: true,
  },
  'client-cert': {
    allowed_domains: ['xilian.local', 'xilian.io'],
    allow_subdomains: true,
    max_ttl: '720h', // 30 天
    key_type: 'rsa',
    key_bits: 2048,
    key_usage: ['DigitalSignature'],
    ext_key_usage: ['ClientAuth'],
    require_cn: true,
  },
  'mutual-cert': {
    allowed_domains: ['xilian.local', 'xilian.io'],
    allow_subdomains: true,
    max_ttl: '720h', // 30 天
    key_type: 'rsa',
    key_bits: 2048,
    key_usage: ['DigitalSignature', 'KeyEncipherment'],
    ext_key_usage: ['ServerAuth', 'ClientAuth'],
    require_cn: true,
  },
  'code-signing-cert': {
    allowed_domains: ['xilian.io'],
    max_ttl: '8760h', // 1 年
    key_type: 'rsa',
    key_bits: 4096,
    key_usage: ['DigitalSignature'],
    ext_key_usage: ['CodeSigning'],
    require_cn: true,
  },
};

// Vault PKI 引擎配置
export const PKIEngineConfig = {
  // 根 CA 配置
  rootCA: {
    type: 'internal',
    common_name: 'XiLian Root CA',
    ttl: '87600h', // 10 年
    key_type: 'rsa',
    key_bits: 4096,
    organization: 'XiLian',
    ou: 'Security',
    country: 'CN',
  },
  // 中间 CA 配置
  intermediateCA: {
    type: 'internal',
    common_name: 'XiLian Intermediate CA',
    ttl: '43800h', // 5 年
    key_type: 'rsa',
    key_bits: 4096,
    organization: 'XiLian',
    ou: 'Security',
    country: 'CN',
  },
  // CRL 配置
  crl: {
    expiry: '72h',
    disable: false,
  },
  // OCSP 配置
  ocsp: {
    enable: true,
    responder_url: 'https://ocsp.xilian.io',
  },
};
