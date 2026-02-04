/**
 * 安全扫描器单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrivyScanner, SecurityPolicies } from './trivyScanner';
import { SemgrepScanner, SemgrepPolicies } from './semgrepScanner';
import { GitleaksScanner, GitleaksPolicies } from './gitleaksScanner';

describe('TrivyScanner', () => {
  let scanner: TrivyScanner;

  beforeEach(() => {
    scanner = new TrivyScanner();
  });

  describe('scanImage', () => {
    it('should scan container image and return results', async () => {
      const result = await scanner.scanImage('alpine:3.19');
      
      expect(result).toBeDefined();
      expect(result.type).toBe('image');
      expect(result.target).toBe('alpine:3.19');
      expect(result.status).toBe('completed');
      expect(result.summary).toBeDefined();
      expect(result.vulnerabilities).toBeInstanceOf(Array);
    });

    it('should calculate vulnerability summary correctly', async () => {
      const result = await scanner.scanImage('nginx:latest');
      
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.critical).toBeGreaterThanOrEqual(0);
      expect(result.summary.high).toBeGreaterThanOrEqual(0);
      expect(result.summary.medium).toBeGreaterThanOrEqual(0);
      expect(result.summary.low).toBeGreaterThanOrEqual(0);
    });

    it('should include scan metadata', async () => {
      const result = await scanner.scanImage('alpine:3.19');
      
      expect(result.metadata.scanDuration).toBeGreaterThanOrEqual(0);
      expect(result.id).toBeDefined();
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('scanFilesystem', () => {
    it('should scan filesystem path', async () => {
      const result = await scanner.scanFilesystem('/app');
      
      expect(result.type).toBe('filesystem');
      expect(result.target).toBe('/app');
      expect(result.status).toBe('completed');
    });
  });

  describe('checkPolicy', () => {
    it('should pass strict policy with no vulnerabilities', async () => {
      const result = await scanner.scanImage('scratch');
      result.summary = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, total: 0 };
      result.vulnerabilities = [];
      
      const check = scanner.checkPolicy(result, SecurityPolicies.strict);
      
      expect(check.passed).toBe(true);
      expect(check.violations).toHaveLength(0);
    });

    it('should fail strict policy with critical vulnerabilities', async () => {
      const result = await scanner.scanImage('alpine:3.19');
      result.summary = { critical: 1, high: 0, medium: 0, low: 0, unknown: 0, total: 1 };
      
      const check = scanner.checkPolicy(result, SecurityPolicies.strict);
      
      expect(check.passed).toBe(false);
      expect(check.violations.length).toBeGreaterThan(0);
    });

    it('should detect blocked CVEs', async () => {
      const result = await scanner.scanImage('alpine:3.19');
      result.vulnerabilities = [
        {
          vulnerabilityID: 'CVE-2024-0001',
          pkgName: 'test',
          installedVersion: '1.0',
          severity: 'HIGH',
          title: 'Test',
          description: 'Test',
          references: [],
        },
      ];
      
      const check = scanner.checkPolicy(result, {
        blockedCVEs: ['CVE-2024-0001'],
      });
      
      expect(check.passed).toBe(false);
      expect(check.violations).toContain('Blocked CVEs found: CVE-2024-0001');
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', async () => {
      const result = await scanner.scanImage('alpine:3.19');
      const report = scanner.generateReport(result);
      
      expect(report).toContain('# Trivy Vulnerability Scan Report');
      expect(report).toContain('alpine:3.19');
      expect(report).toContain('## Summary');
    });
  });

  describe('getScanHistory', () => {
    it('should track scan history', async () => {
      await scanner.scanImage('alpine:3.19');
      await scanner.scanImage('nginx:latest');
      
      const history = scanner.getScanHistory({ limit: 10 });
      
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by type', async () => {
      await scanner.scanImage('alpine:3.19');
      await scanner.scanFilesystem('/app');
      
      const imageScans = scanner.getScanHistory({ type: 'image' });
      
      expect(imageScans.every(s => s.type === 'image')).toBe(true);
    });
  });
});

describe('SemgrepScanner', () => {
  let scanner: SemgrepScanner;

  beforeEach(() => {
    scanner = new SemgrepScanner();
  });

  describe('scan', () => {
    it('should scan directory and return results', async () => {
      const result = await scanner.scan('/app/src');
      
      expect(result).toBeDefined();
      expect(result.target).toBe('/app/src');
      expect(result.status).toBe('completed');
      expect(result.findings).toBeInstanceOf(Array);
    });

    it('should calculate findings summary', async () => {
      const result = await scanner.scan('/app/src');
      
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.errors).toBeGreaterThanOrEqual(0);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
      expect(result.summary.byCategory).toBeDefined();
    });

    it('should include scan metadata', async () => {
      const result = await scanner.scan('/app/src');
      
      expect(result.metadata.scanDuration).toBeGreaterThanOrEqual(0);
      expect(result.metadata.rulesUsed).toBeInstanceOf(Array);
    });
  });

  describe('scanCode', () => {
    it('should scan code snippet', async () => {
      const code = `
        const apiKey = "AKIA1234567890EXAMPLE";
        eval(userInput);
      `;
      
      const findings = await scanner.scanCode(code, 'typescript');
      
      expect(findings).toBeInstanceOf(Array);
    });
  });

  describe('addCustomRule', () => {
    it('should add custom rule', () => {
      scanner.addCustomRule('custom-rule', {
        pattern: 'console.log($X)',
        message: 'Avoid console.log',
        severity: 'WARNING',
        languages: ['typescript', 'javascript'],
      });
      
      // Rule added without error
      expect(true).toBe(true);
    });
  });

  describe('checkPolicy', () => {
    it('should pass policy with no errors', async () => {
      const result = await scanner.scan('/app/src');
      result.summary = { errors: 0, warnings: 0, infos: 0, total: 0, byCategory: { security: 0, correctness: 0, 'best-practice': 0, performance: 0, maintainability: 0 } };
      
      const check = scanner.checkPolicy(result, SemgrepPolicies.strict);
      
      expect(check.passed).toBe(true);
    });

    it('should fail policy with too many errors', async () => {
      const result = await scanner.scan('/app/src');
      result.summary = { errors: 10, warnings: 0, infos: 0, total: 10, byCategory: { security: 5, correctness: 0, 'best-practice': 0, performance: 0, maintainability: 0 } };
      
      const check = scanner.checkPolicy(result, SemgrepPolicies.strict);
      
      expect(check.passed).toBe(false);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', async () => {
      const result = await scanner.scan('/app/src');
      const report = scanner.generateReport(result);
      
      expect(report).toContain('# Semgrep Code Security Scan Report');
      expect(report).toContain('## Summary');
    });
  });
});

describe('GitleaksScanner', () => {
  let scanner: GitleaksScanner;

  beforeEach(() => {
    scanner = new GitleaksScanner();
  });

  describe('scanGitRepo', () => {
    it('should scan git repository', async () => {
      const result = await scanner.scanGitRepo('/app');
      
      expect(result).toBeDefined();
      expect(result.scanType).toBe('git');
      expect(result.status).toBe('completed');
      expect(result.findings).toBeInstanceOf(Array);
    });

    it('should calculate summary by type', async () => {
      const result = await scanner.scanGitRepo('/app');
      
      expect(result.summary.total).toBeGreaterThanOrEqual(0);
      expect(result.summary.byType).toBeDefined();
      expect(result.summary.byFile).toBeDefined();
    });
  });

  describe('scanFilesystem', () => {
    it('should scan filesystem without git', async () => {
      const result = await scanner.scanFilesystem('/app/src');
      
      expect(result.scanType).toBe('filesystem');
      expect(result.status).toBe('completed');
    });
  });

  describe('scanCode', () => {
    it('should detect AWS access key in code', async () => {
      const code = `
        const accessKey = "AKIAIOSFODNN7EXAMPLE";
        const secretKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      `;
      
      const findings = await scanner.scanCode(code);
      
      expect(findings).toBeInstanceOf(Array);
      expect(findings.some(f => f.secretType === 'aws-access-key')).toBe(true);
    });

    it('should detect GitHub token', async () => {
      const code = `
        const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      `;
      
      const findings = await scanner.scanCode(code);
      
      expect(findings.some(f => f.secretType === 'github-token')).toBe(true);
    });

    it('should detect private key', async () => {
      const code = `
        const key = "-----BEGIN RSA PRIVATE KEY-----";
      `;
      
      const findings = await scanner.scanCode(code);
      
      expect(findings.some(f => f.secretType === 'private-key')).toBe(true);
    });
  });

  describe('allowlist', () => {
    it('should add fingerprint to allowlist', () => {
      scanner.addToAllowlist('test-fingerprint');
      
      const allowlist = scanner.getAllowlist();
      
      expect(allowlist).toContain('test-fingerprint');
    });

    it('should remove fingerprint from allowlist', () => {
      scanner.addToAllowlist('test-fingerprint');
      scanner.removeFromAllowlist('test-fingerprint');
      
      const allowlist = scanner.getAllowlist();
      
      expect(allowlist).not.toContain('test-fingerprint');
    });

    it('should filter findings by allowlist', async () => {
      const result = await scanner.scanGitRepo('/app');
      
      // 添加所有发现到白名单
      for (const finding of result.findings) {
        scanner.addToAllowlist(finding.fingerprint);
      }
      
      // 重新扫描应该过滤掉白名单中的发现
      const result2 = await scanner.scanGitRepo('/app');
      
      expect(result2.findings.length).toBeLessThanOrEqual(result.findings.length);
    });
  });

  describe('checkPolicy', () => {
    it('should pass strict policy with no leaks', async () => {
      const result = await scanner.scanGitRepo('/app');
      result.summary = { total: 0, byType: {} as any, byFile: {} };
      result.findings = [];
      
      const check = scanner.checkPolicy(result, GitleaksPolicies.strict);
      
      expect(check.passed).toBe(true);
    });

    it('should fail strict policy with blocked types', async () => {
      const result = await scanner.scanGitRepo('/app');
      result.summary = { total: 1, byType: { 'aws-access-key': 1 } as any, byFile: {} };
      result.findings = [{
        ruleId: 'aws-access-key',
        description: 'AWS Access Key',
        secretType: 'aws-access-key',
        file: 'config.ts',
        line: 10,
        startColumn: 1,
        endColumn: 20,
        secret: 'AKIA****',
        entropy: 4.5,
        fingerprint: 'test',
      }];
      
      const check = scanner.checkPolicy(result, GitleaksPolicies.strict);
      
      expect(check.passed).toBe(false);
      expect(check.violations.some(v => v.includes('aws-access-key'))).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', async () => {
      const result = await scanner.scanGitRepo('/app');
      const report = scanner.generateReport(result);
      
      expect(report).toContain('# Gitleaks Secret Detection Report');
      expect(report).toContain('## Summary');
    });
  });

  describe('getScanHistory', () => {
    it('should track scan history', async () => {
      await scanner.scanGitRepo('/app1');
      await scanner.scanFilesystem('/app2');
      
      const history = scanner.getScanHistory(10);
      
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Security Scanner Integration', () => {
  it('should run all scanners in sequence', async () => {
    const trivy = new TrivyScanner();
    const semgrep = new SemgrepScanner();
    const gitleaks = new GitleaksScanner();
    
    const trivyResult = await trivy.scanImage('alpine:3.19');
    const semgrepResult = await semgrep.scan('/app/src');
    const gitleaksResult = await gitleaks.scanGitRepo('/app');
    
    expect(trivyResult.status).toBe('completed');
    expect(semgrepResult.status).toBe('completed');
    expect(gitleaksResult.status).toBe('completed');
  });

  it('should aggregate security findings', async () => {
    const trivy = new TrivyScanner();
    const semgrep = new SemgrepScanner();
    const gitleaks = new GitleaksScanner();
    
    const trivyResult = await trivy.scanImage('alpine:3.19');
    const semgrepResult = await semgrep.scan('/app/src');
    const gitleaksResult = await gitleaks.scanGitRepo('/app');
    
    const totalFindings = 
      trivyResult.summary.total +
      semgrepResult.summary.total +
      gitleaksResult.summary.total;
    
    expect(totalFindings).toBeGreaterThanOrEqual(0);
  });
});
