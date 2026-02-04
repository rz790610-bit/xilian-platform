/**
 * Trivy 漏洞扫描服务
 * 提供容器镜像、文件系统、依赖项的漏洞扫描功能
 */

// 扫描类型
type ScanType = 'image' | 'filesystem' | 'repository' | 'config' | 'sbom';

// 严重程度
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

// 漏洞信息
interface Vulnerability {
  vulnerabilityID: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: Severity;
  title: string;
  description: string;
  references: string[];
  cvss?: {
    v2?: number;
    v3?: number;
  };
  publishedDate?: string;
  lastModifiedDate?: string;
}

// 扫描结果
interface ScanResult {
  id: string;
  type: ScanType;
  target: string;
  timestamp: number;
  status: 'completed' | 'failed' | 'in_progress';
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
    total: number;
  };
  vulnerabilities: Vulnerability[];
  metadata: {
    scanDuration: number;
    trivyVersion?: string;
    dbVersion?: string;
  };
  error?: string;
}

// 扫描配置
interface ScanConfig {
  severityThreshold: Severity[];
  ignoreUnfixed: boolean;
  timeout: number;
  skipFiles?: string[];
  skipDirs?: string[];
  cacheDir?: string;
  offlineScan?: boolean;
}

/**
 * Trivy 扫描器
 */
export class TrivyScanner {
  private config: ScanConfig;
  private scanHistory: Map<string, ScanResult> = new Map();
  private trivyPath: string;

  constructor(config?: Partial<ScanConfig>) {
    this.config = {
      severityThreshold: config?.severityThreshold || ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
      ignoreUnfixed: config?.ignoreUnfixed ?? false,
      timeout: config?.timeout || 300000, // 5 分钟
      skipFiles: config?.skipFiles || [],
      skipDirs: config?.skipDirs || [],
      cacheDir: config?.cacheDir || '/tmp/trivy-cache',
      offlineScan: config?.offlineScan ?? false,
    };
    this.trivyPath = process.env.TRIVY_PATH || 'trivy';
  }

  /**
   * 扫描容器镜像
   */
  async scanImage(image: string, options?: Partial<ScanConfig>): Promise<ScanResult> {
    return this.scan('image', image, options);
  }

  /**
   * 扫描文件系统
   */
  async scanFilesystem(path: string, options?: Partial<ScanConfig>): Promise<ScanResult> {
    return this.scan('filesystem', path, options);
  }

  /**
   * 扫描 Git 仓库
   */
  async scanRepository(repoUrl: string, options?: Partial<ScanConfig>): Promise<ScanResult> {
    return this.scan('repository', repoUrl, options);
  }

  /**
   * 扫描配置文件（IaC）
   */
  async scanConfig(path: string, options?: Partial<ScanConfig>): Promise<ScanResult> {
    return this.scan('config', path, options);
  }

  /**
   * 生成 SBOM
   */
  async generateSBOM(target: string, format: 'cyclonedx' | 'spdx' = 'cyclonedx'): Promise<string> {
    const args = this.buildSBOMArgs(target, format);
    const result = await this.executeTrivy(args);
    return result;
  }

  /**
   * 执行扫描
   */
  private async scan(
    type: ScanType,
    target: string,
    options?: Partial<ScanConfig>
  ): Promise<ScanResult> {
    const scanId = this.generateScanId();
    const startTime = Date.now();
    const mergedConfig = { ...this.config, ...options };

    // 创建初始结果
    const result: ScanResult = {
      id: scanId,
      type,
      target,
      timestamp: startTime,
      status: 'in_progress',
      summary: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 },
      vulnerabilities: [],
      metadata: { scanDuration: 0 },
    };

    this.scanHistory.set(scanId, result);

    try {
      const args = this.buildScanArgs(type, target, mergedConfig);
      const output = await this.executeTrivy(args);
      const parsed = this.parseOutput(output);

      result.status = 'completed';
      result.vulnerabilities = parsed.vulnerabilities;
      result.summary = this.calculateSummary(parsed.vulnerabilities);
      result.metadata = {
        scanDuration: Date.now() - startTime,
        trivyVersion: parsed.trivyVersion,
        dbVersion: parsed.dbVersion,
      };
    } catch (error: any) {
      result.status = 'failed';
      result.error = error.message;
      result.metadata.scanDuration = Date.now() - startTime;
    }

    this.scanHistory.set(scanId, result);
    return result;
  }

  /**
   * 构建扫描参数
   */
  private buildScanArgs(type: ScanType, target: string, config: ScanConfig): string[] {
    const args: string[] = [
      type === 'image' ? 'image' : type === 'config' ? 'config' : 'fs',
      '--format', 'json',
      '--severity', config.severityThreshold.join(','),
    ];

    if (config.ignoreUnfixed) {
      args.push('--ignore-unfixed');
    }

    if (config.cacheDir) {
      args.push('--cache-dir', config.cacheDir);
    }

    if (config.offlineScan) {
      args.push('--offline-scan');
    }

    if (config.skipFiles?.length) {
      args.push('--skip-files', config.skipFiles.join(','));
    }

    if (config.skipDirs?.length) {
      args.push('--skip-dirs', config.skipDirs.join(','));
    }

    args.push(target);

    return args;
  }

  /**
   * 构建 SBOM 参数
   */
  private buildSBOMArgs(target: string, format: string): string[] {
    return [
      'sbom',
      '--format', format,
      target,
    ];
  }

  /**
   * 执行 Trivy 命令
   */
  private async executeTrivy(args: string[]): Promise<string> {
    // 模拟执行 Trivy 命令
    // 实际实现需要使用 child_process
    console.log(`[Trivy] Executing: ${this.trivyPath} ${args.join(' ')}`);
    
    // 返回模拟结果
    return JSON.stringify({
      SchemaVersion: 2,
      ArtifactName: args[args.length - 1],
      ArtifactType: 'container_image',
      Metadata: {
        OS: { Family: 'alpine', Name: '3.19' },
        ImageConfig: { architecture: 'amd64' },
      },
      Results: [
        {
          Target: 'alpine:3.19',
          Class: 'os-pkgs',
          Type: 'alpine',
          Vulnerabilities: this.generateMockVulnerabilities(),
        },
      ],
    });
  }

  /**
   * 生成模拟漏洞数据
   */
  private generateMockVulnerabilities(): any[] {
    return [
      {
        VulnerabilityID: 'CVE-2024-0001',
        PkgName: 'openssl',
        InstalledVersion: '3.0.12',
        FixedVersion: '3.0.13',
        Severity: 'HIGH',
        Title: 'OpenSSL: Buffer overflow in X.509 certificate verification',
        Description: 'A buffer overflow vulnerability exists in OpenSSL...',
        References: ['https://nvd.nist.gov/vuln/detail/CVE-2024-0001'],
        CVSS: { nvd: { V3Score: 7.5 } },
        PublishedDate: '2024-01-15T00:00:00Z',
        LastModifiedDate: '2024-01-20T00:00:00Z',
      },
      {
        VulnerabilityID: 'CVE-2024-0002',
        PkgName: 'curl',
        InstalledVersion: '8.4.0',
        FixedVersion: '8.5.0',
        Severity: 'MEDIUM',
        Title: 'curl: HTTP/2 stream cancellation attack',
        Description: 'A denial of service vulnerability in curl...',
        References: ['https://nvd.nist.gov/vuln/detail/CVE-2024-0002'],
        CVSS: { nvd: { V3Score: 5.3 } },
        PublishedDate: '2024-01-10T00:00:00Z',
      },
    ];
  }

  /**
   * 解析 Trivy 输出
   */
  private parseOutput(output: string): {
    vulnerabilities: Vulnerability[];
    trivyVersion?: string;
    dbVersion?: string;
  } {
    try {
      const data = JSON.parse(output);
      const vulnerabilities: Vulnerability[] = [];

      for (const result of data.Results || []) {
        for (const vuln of result.Vulnerabilities || []) {
          vulnerabilities.push({
            vulnerabilityID: vuln.VulnerabilityID,
            pkgName: vuln.PkgName,
            installedVersion: vuln.InstalledVersion,
            fixedVersion: vuln.FixedVersion,
            severity: vuln.Severity as Severity,
            title: vuln.Title || '',
            description: vuln.Description || '',
            references: vuln.References || [],
            cvss: {
              v2: vuln.CVSS?.nvd?.V2Score,
              v3: vuln.CVSS?.nvd?.V3Score,
            },
            publishedDate: vuln.PublishedDate,
            lastModifiedDate: vuln.LastModifiedDate,
          });
        }
      }

      return {
        vulnerabilities,
        trivyVersion: data.TrivyVersion,
        dbVersion: data.VulnerabilityDB?.Version,
      };
    } catch (error) {
      console.error('[Trivy] Failed to parse output:', error);
      return { vulnerabilities: [] };
    }
  }

  /**
   * 计算漏洞统计
   */
  private calculateSummary(vulnerabilities: Vulnerability[]): ScanResult['summary'] {
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      unknown: 0,
      total: vulnerabilities.length,
    };

    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
        case 'CRITICAL':
          summary.critical++;
          break;
        case 'HIGH':
          summary.high++;
          break;
        case 'MEDIUM':
          summary.medium++;
          break;
        case 'LOW':
          summary.low++;
          break;
        default:
          summary.unknown++;
      }
    }

    return summary;
  }

  /**
   * 生成扫描 ID
   */
  private generateScanId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `scan-${timestamp}-${random}`;
  }

  /**
   * 获取扫描结果
   */
  getScanResult(scanId: string): ScanResult | undefined {
    return this.scanHistory.get(scanId);
  }

  /**
   * 获取扫描历史
   */
  getScanHistory(options?: {
    type?: ScanType;
    status?: 'completed' | 'failed';
    limit?: number;
  }): ScanResult[] {
    let results = Array.from(this.scanHistory.values());

    if (options?.type) {
      results = results.filter(r => r.type === options.type);
    }

    if (options?.status) {
      results = results.filter(r => r.status === options.status);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 检查是否通过安全策略
   */
  checkPolicy(result: ScanResult, policy: {
    maxCritical?: number;
    maxHigh?: number;
    maxMedium?: number;
    maxTotal?: number;
    blockedCVEs?: string[];
  }): {
    passed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (policy.maxCritical !== undefined && result.summary.critical > policy.maxCritical) {
      violations.push(`Critical vulnerabilities (${result.summary.critical}) exceed limit (${policy.maxCritical})`);
    }

    if (policy.maxHigh !== undefined && result.summary.high > policy.maxHigh) {
      violations.push(`High vulnerabilities (${result.summary.high}) exceed limit (${policy.maxHigh})`);
    }

    if (policy.maxMedium !== undefined && result.summary.medium > policy.maxMedium) {
      violations.push(`Medium vulnerabilities (${result.summary.medium}) exceed limit (${policy.maxMedium})`);
    }

    if (policy.maxTotal !== undefined && result.summary.total > policy.maxTotal) {
      violations.push(`Total vulnerabilities (${result.summary.total}) exceed limit (${policy.maxTotal})`);
    }

    if (policy.blockedCVEs?.length) {
      const foundBlocked = result.vulnerabilities
        .filter(v => policy.blockedCVEs!.includes(v.vulnerabilityID))
        .map(v => v.vulnerabilityID);
      
      if (foundBlocked.length > 0) {
        violations.push(`Blocked CVEs found: ${foundBlocked.join(', ')}`);
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 生成扫描报告
   */
  generateReport(result: ScanResult): string {
    const lines: string[] = [
      '# Trivy Vulnerability Scan Report',
      '',
      `**Target:** ${result.target}`,
      `**Scan Type:** ${result.type}`,
      `**Scan Time:** ${new Date(result.timestamp).toISOString()}`,
      `**Duration:** ${result.metadata.scanDuration}ms`,
      '',
      '## Summary',
      '',
      `| Severity | Count |`,
      `|----------|-------|`,
      `| Critical | ${result.summary.critical} |`,
      `| High | ${result.summary.high} |`,
      `| Medium | ${result.summary.medium} |`,
      `| Low | ${result.summary.low} |`,
      `| Unknown | ${result.summary.unknown} |`,
      `| **Total** | **${result.summary.total}** |`,
      '',
    ];

    if (result.vulnerabilities.length > 0) {
      lines.push('## Vulnerabilities', '');
      
      for (const vuln of result.vulnerabilities) {
        lines.push(
          `### ${vuln.vulnerabilityID}`,
          '',
          `- **Package:** ${vuln.pkgName}`,
          `- **Severity:** ${vuln.severity}`,
          `- **Installed Version:** ${vuln.installedVersion}`,
          vuln.fixedVersion ? `- **Fixed Version:** ${vuln.fixedVersion}` : '- **Fixed Version:** Not available',
          `- **Title:** ${vuln.title}`,
          '',
          vuln.description,
          '',
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * 清除扫描历史
   */
  clearHistory(): void {
    this.scanHistory.clear();
  }
}

// 预定义的安全策略
export const SecurityPolicies = {
  strict: {
    maxCritical: 0,
    maxHigh: 0,
    maxMedium: 5,
    maxTotal: 10,
  },
  moderate: {
    maxCritical: 0,
    maxHigh: 5,
    maxMedium: 20,
    maxTotal: 50,
  },
  relaxed: {
    maxCritical: 2,
    maxHigh: 10,
    maxMedium: 50,
    maxTotal: 100,
  },
};

// 导出单例
export const trivyScanner = new TrivyScanner();
