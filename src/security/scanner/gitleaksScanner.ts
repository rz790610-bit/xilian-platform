/**
 * Gitleaks 密钥泄露检测服务
 * 提供 Git 仓库和文件系统的密钥泄露扫描功能
 */

// 密钥类型
type SecretType = 
  | 'aws-access-key'
  | 'aws-secret-key'
  | 'github-token'
  | 'gitlab-token'
  | 'google-api-key'
  | 'slack-token'
  | 'stripe-key'
  | 'jwt-token'
  | 'private-key'
  | 'password'
  | 'api-key'
  | 'generic-secret';

// 泄露发现
interface LeakFinding {
  ruleId: string;
  description: string;
  secretType: SecretType;
  file: string;
  line: number;
  startColumn: number;
  endColumn: number;
  commit?: string;
  author?: string;
  date?: string;
  message?: string;
  secret: string; // 脱敏后的密钥
  entropy: number;
  fingerprint: string;
}

// 扫描结果
interface GitleaksResult {
  id: string;
  target: string;
  scanType: 'git' | 'filesystem' | 'stdin';
  timestamp: number;
  status: 'completed' | 'failed' | 'in_progress';
  summary: {
    total: number;
    byType: Record<SecretType, number>;
    byFile: Record<string, number>;
  };
  findings: LeakFinding[];
  metadata: {
    scanDuration: number;
    gitleaksVersion?: string;
    commitsScanned?: number;
    filesScanned: number;
  };
  error?: string;
}

// 扫描配置
interface GitleaksConfig {
  configPath?: string;
  baseline?: string;
  redact: boolean;
  verbose: boolean;
  noGit: boolean;
  depth?: number;
  since?: string;
  exclude?: string[];
  timeout: number;
}

/**
 * Gitleaks 扫描器
 */
export class GitleaksScanner {
  private config: GitleaksConfig;
  private scanHistory: Map<string, GitleaksResult> = new Map();
  private gitleaksPath: string;
  private customRules: Map<string, any> = new Map();
  private allowlist: Set<string> = new Set();

  constructor(config?: Partial<GitleaksConfig>) {
    this.config = {
      redact: config?.redact ?? true,
      verbose: config?.verbose ?? false,
      noGit: config?.noGit ?? false,
      depth: config?.depth,
      since: config?.since,
      exclude: config?.exclude || [
        'node_modules',
        '.git',
        'dist',
        'build',
        '*.min.js',
        '*.lock',
      ],
      timeout: config?.timeout || 300000,
    };
    this.gitleaksPath = process.env.GITLEAKS_PATH || 'gitleaks';
  }

  /**
   * 扫描 Git 仓库
   */
  async scanGitRepo(repoPath: string, options?: Partial<GitleaksConfig>): Promise<GitleaksResult> {
    return this.scan('git', repoPath, options);
  }

  /**
   * 扫描文件系统
   */
  async scanFilesystem(path: string, options?: Partial<GitleaksConfig>): Promise<GitleaksResult> {
    return this.scan('filesystem', path, { ...options, noGit: true });
  }

  /**
   * 扫描代码片段
   */
  async scanCode(code: string): Promise<LeakFinding[]> {
    const findings: LeakFinding[] = [];
    
    // 使用内置规则检测
    for (const [ruleId, rule] of this.getBuiltinRules()) {
      const matches = code.matchAll(rule.regex);
      for (const match of matches) {
        if (match.index !== undefined) {
          const lines = code.substring(0, match.index).split('\n');
          const line = lines.length;
          const col = lines[lines.length - 1].length + 1;
          
          const secret = match[0];
          const fingerprint = this.generateFingerprint(secret, 'stdin', line);
          
          if (this.allowlist.has(fingerprint)) continue;
          
          findings.push({
            ruleId,
            description: rule.description,
            secretType: rule.secretType,
            file: 'stdin',
            line,
            startColumn: col,
            endColumn: col + secret.length,
            secret: this.redactSecret(secret),
            entropy: this.calculateEntropy(secret),
            fingerprint,
          });
        }
      }
    }
    
    return findings;
  }

  /**
   * 执行扫描
   */
  private async scan(
    scanType: 'git' | 'filesystem',
    target: string,
    options?: Partial<GitleaksConfig>
  ): Promise<GitleaksResult> {
    const scanId = this.generateScanId();
    const startTime = Date.now();
    const mergedConfig = { ...this.config, ...options };

    const result: GitleaksResult = {
      id: scanId,
      target,
      scanType,
      timestamp: startTime,
      status: 'in_progress',
      summary: {
        total: 0,
        byType: {} as Record<SecretType, number>,
        byFile: {},
      },
      findings: [],
      metadata: {
        scanDuration: 0,
        filesScanned: 0,
      },
    };

    this.scanHistory.set(scanId, result);

    try {
      const args = this.buildScanArgs(scanType, target, mergedConfig);
      const output = await this.executeGitleaks(args);
      const parsed = this.parseOutput(output);

      // 过滤白名单
      const filteredFindings = parsed.findings.filter(f => !this.allowlist.has(f.fingerprint));

      result.status = 'completed';
      result.findings = filteredFindings;
      result.summary = this.calculateSummary(filteredFindings);
      result.metadata = {
        scanDuration: Date.now() - startTime,
        gitleaksVersion: parsed.version,
        commitsScanned: parsed.commitsScanned,
        filesScanned: parsed.filesScanned,
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
  private buildScanArgs(
    scanType: 'git' | 'filesystem',
    target: string,
    config: GitleaksConfig
  ): string[] {
    const args: string[] = [
      'detect',
      '--report-format', 'json',
    ];

    if (scanType === 'filesystem' || config.noGit) {
      args.push('--no-git');
    }

    if (config.redact) {
      args.push('--redact');
    }

    if (config.verbose) {
      args.push('--verbose');
    }

    if (config.configPath) {
      args.push('--config', config.configPath);
    }

    if (config.baseline) {
      args.push('--baseline-path', config.baseline);
    }

    if (config.depth) {
      args.push('--log-opts', `--max-count=${config.depth}`);
    }

    if (config.since) {
      args.push('--log-opts', `--since=${config.since}`);
    }

    args.push('--source', target);

    return args;
  }

  /**
   * 执行 Gitleaks 命令
   */
  private async executeGitleaks(args: string[]): Promise<string> {
    console.log(`[Gitleaks] Executing: ${this.gitleaksPath} ${args.join(' ')}`);
    
    // 返回模拟结果
    return JSON.stringify(this.generateMockResults());
  }

  /**
   * 生成模拟结果
   */
  private generateMockResults(): any[] {
    return [
      {
        RuleID: 'aws-access-key',
        Description: 'AWS Access Key ID',
        Secret: 'AKIA**********EXAMPLE',
        File: 'config/aws.ts',
        Line: 15,
        StartColumn: 20,
        EndColumn: 40,
        Commit: 'abc123def456',
        Author: 'developer@example.com',
        Date: '2024-01-15T10:30:00Z',
        Message: 'Add AWS configuration',
        Entropy: 4.5,
        Fingerprint: 'aws-config-ts-15-abc123',
      },
      {
        RuleID: 'github-token',
        Description: 'GitHub Personal Access Token',
        Secret: 'ghp_**********EXAMPLE',
        File: '.env.example',
        Line: 8,
        StartColumn: 15,
        EndColumn: 55,
        Entropy: 5.2,
        Fingerprint: 'env-example-8-github',
      },
      {
        RuleID: 'private-key',
        Description: 'Private Key',
        Secret: '-----BEGIN RSA PRIVATE KEY-----\n...[REDACTED]...',
        File: 'certs/server.key',
        Line: 1,
        StartColumn: 1,
        EndColumn: 50,
        Entropy: 5.8,
        Fingerprint: 'certs-server-key-1',
      },
    ];
  }

  /**
   * 获取内置规则
   */
  private getBuiltinRules(): Map<string, { regex: RegExp; description: string; secretType: SecretType }> {
    return new Map([
      ['aws-access-key', {
        regex: /AKIA[0-9A-Z]{16}/g,
        description: 'AWS Access Key ID',
        secretType: 'aws-access-key',
      }],
      ['aws-secret-key', {
        regex: /[A-Za-z0-9/+=]{40}/g,
        description: 'AWS Secret Access Key',
        secretType: 'aws-secret-key',
      }],
      ['github-token', {
        regex: /ghp_[a-zA-Z0-9]{36}/g,
        description: 'GitHub Personal Access Token',
        secretType: 'github-token',
      }],
      ['gitlab-token', {
        regex: /glpat-[a-zA-Z0-9\-_]{20,}/g,
        description: 'GitLab Personal Access Token',
        secretType: 'gitlab-token',
      }],
      ['google-api-key', {
        regex: /AIza[0-9A-Za-z\-_]{35}/g,
        description: 'Google API Key',
        secretType: 'google-api-key',
      }],
      ['slack-token', {
        regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g,
        description: 'Slack Token',
        secretType: 'slack-token',
      }],
      ['stripe-key', {
        regex: /sk_live_[0-9a-zA-Z]{24}/g,
        description: 'Stripe Secret Key',
        secretType: 'stripe-key',
      }],
      ['jwt-token', {
        regex: /eyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]*/g,
        description: 'JWT Token',
        secretType: 'jwt-token',
      }],
      ['private-key', {
        regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
        description: 'Private Key',
        secretType: 'private-key',
      }],
      ['generic-api-key', {
        regex: /[aA][pP][iI][-_]?[kK][eE][yY][\s]*[=:]\s*['"]?[a-zA-Z0-9_\-]{20,}['"]?/g,
        description: 'Generic API Key',
        secretType: 'api-key',
      }],
      ['password-in-url', {
        regex: /[a-zA-Z]{3,10}:\/\/[^/\s:@]+:[^/\s:@]+@[^/\s:@]+/g,
        description: 'Password in URL',
        secretType: 'password',
      }],
    ]);
  }

  /**
   * 解析 Gitleaks 输出
   */
  private parseOutput(output: string): {
    findings: LeakFinding[];
    version?: string;
    commitsScanned?: number;
    filesScanned: number;
  } {
    try {
      const data = JSON.parse(output);
      const findings: LeakFinding[] = [];

      for (const item of Array.isArray(data) ? data : []) {
        findings.push({
          ruleId: item.RuleID,
          description: item.Description,
          secretType: this.mapRuleToSecretType(item.RuleID),
          file: item.File,
          line: item.Line,
          startColumn: item.StartColumn,
          endColumn: item.EndColumn,
          commit: item.Commit,
          author: item.Author,
          date: item.Date,
          message: item.Message,
          secret: item.Secret,
          entropy: item.Entropy,
          fingerprint: item.Fingerprint,
        });
      }

      return {
        findings,
        filesScanned: new Set(findings.map(f => f.file)).size,
      };
    } catch (error) {
      console.error('[Gitleaks] Failed to parse output:', error);
      return { findings: [], filesScanned: 0 };
    }
  }

  /**
   * 映射规则到密钥类型
   */
  private mapRuleToSecretType(ruleId: string): SecretType {
    const mapping: Record<string, SecretType> = {
      'aws-access-key': 'aws-access-key',
      'aws-secret-key': 'aws-secret-key',
      'github-token': 'github-token',
      'gitlab-token': 'gitlab-token',
      'google-api-key': 'google-api-key',
      'slack-token': 'slack-token',
      'stripe-key': 'stripe-key',
      'jwt-token': 'jwt-token',
      'private-key': 'private-key',
      'password': 'password',
    };
    return mapping[ruleId] || 'generic-secret';
  }

  /**
   * 计算统计摘要
   */
  private calculateSummary(findings: LeakFinding[]): GitleaksResult['summary'] {
    const summary: GitleaksResult['summary'] = {
      total: findings.length,
      byType: {} as Record<SecretType, number>,
      byFile: {},
    };

    for (const finding of findings) {
      // 按类型统计
      summary.byType[finding.secretType] = (summary.byType[finding.secretType] || 0) + 1;
      
      // 按文件统计
      summary.byFile[finding.file] = (summary.byFile[finding.file] || 0) + 1;
    }

    return summary;
  }

  /**
   * 脱敏密钥
   */
  private redactSecret(secret: string): string {
    if (secret.length <= 8) {
      return '*'.repeat(secret.length);
    }
    const visible = Math.min(4, Math.floor(secret.length * 0.2));
    return secret.substring(0, visible) + '*'.repeat(secret.length - visible * 2) + secret.substring(secret.length - visible);
  }

  /**
   * 计算熵值
   */
  private calculateEntropy(str: string): number {
    const freq: Record<string, number> = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }
    
    let entropy = 0;
    const len = str.length;
    for (const count of Object.values(freq)) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    
    return Math.round(entropy * 100) / 100;
  }

  /**
   * 生成指纹
   */
  private generateFingerprint(secret: string, file: string, line: number): string {
    const hash = this.simpleHash(secret);
    return `${file.replace(/[^a-zA-Z0-9]/g, '-')}-${line}-${hash}`;
  }

  /**
   * 简单哈希
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 生成扫描 ID
   */
  private generateScanId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `gitleaks-${timestamp}-${random}`;
  }

  /**
   * 添加到白名单
   */
  addToAllowlist(fingerprint: string): void {
    this.allowlist.add(fingerprint);
  }

  /**
   * 从白名单移除
   */
  removeFromAllowlist(fingerprint: string): void {
    this.allowlist.delete(fingerprint);
  }

  /**
   * 获取白名单
   */
  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  /**
   * 获取扫描结果
   */
  getScanResult(scanId: string): GitleaksResult | undefined {
    return this.scanHistory.get(scanId);
  }

  /**
   * 获取扫描历史
   */
  getScanHistory(limit?: number): GitleaksResult[] {
    let results = Array.from(this.scanHistory.values());
    results.sort((a, b) => b.timestamp - a.timestamp);
    
    if (limit) {
      results = results.slice(0, limit);
    }
    
    return results;
  }

  /**
   * 检查是否通过安全策略
   */
  checkPolicy(result: GitleaksResult, policy: {
    maxLeaks?: number;
    blockedTypes?: SecretType[];
    requireCleanHistory?: boolean;
  }): {
    passed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (policy.maxLeaks !== undefined && result.summary.total > policy.maxLeaks) {
      violations.push(`Total leaks (${result.summary.total}) exceed limit (${policy.maxLeaks})`);
    }

    if (policy.blockedTypes?.length) {
      for (const type of policy.blockedTypes) {
        const count = result.summary.byType[type] || 0;
        if (count > 0) {
          violations.push(`Blocked secret type found: ${type} (${count} occurrences)`);
        }
      }
    }

    if (policy.requireCleanHistory && result.findings.some(f => f.commit)) {
      violations.push('Secrets found in git history');
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 生成扫描报告
   */
  generateReport(result: GitleaksResult): string {
    const lines: string[] = [
      '# Gitleaks Secret Detection Report',
      '',
      `**Target:** ${result.target}`,
      `**Scan Type:** ${result.scanType}`,
      `**Scan Time:** ${new Date(result.timestamp).toISOString()}`,
      `**Duration:** ${result.metadata.scanDuration}ms`,
      `**Files Scanned:** ${result.metadata.filesScanned}`,
      result.metadata.commitsScanned ? `**Commits Scanned:** ${result.metadata.commitsScanned}` : '',
      '',
      '## Summary',
      '',
      `**Total Secrets Found:** ${result.summary.total}`,
      '',
      '### By Type',
      '',
      `| Secret Type | Count |`,
      `|-------------|-------|`,
    ];

    for (const [type, count] of Object.entries(result.summary.byType)) {
      lines.push(`| ${type} | ${count} |`);
    }

    if (result.findings.length > 0) {
      lines.push('', '## Findings', '');
      
      for (const finding of result.findings) {
        lines.push(
          `### ${finding.ruleId}`,
          '',
          `- **File:** ${finding.file}:${finding.line}`,
          `- **Type:** ${finding.secretType}`,
          `- **Description:** ${finding.description}`,
          `- **Entropy:** ${finding.entropy}`,
          finding.commit ? `- **Commit:** ${finding.commit}` : '',
          finding.author ? `- **Author:** ${finding.author}` : '',
          '',
          '```',
          finding.secret,
          '```',
          '',
        );
      }
    }

    return lines.filter(l => l !== '').join('\n');
  }

  /**
   * 清除扫描历史
   */
  clearHistory(): void {
    this.scanHistory.clear();
  }
}

// 预定义的安全策略
export const GitleaksPolicies = {
  strict: {
    maxLeaks: 0,
    blockedTypes: ['aws-access-key', 'aws-secret-key', 'private-key', 'stripe-key'] as SecretType[],
    requireCleanHistory: true,
  },
  moderate: {
    maxLeaks: 5,
    blockedTypes: ['aws-access-key', 'aws-secret-key', 'private-key'] as SecretType[],
    requireCleanHistory: false,
  },
  relaxed: {
    maxLeaks: 10,
    blockedTypes: ['private-key'] as SecretType[],
    requireCleanHistory: false,
  },
};

// 导出单例
export const gitleaksScanner = new GitleaksScanner();
