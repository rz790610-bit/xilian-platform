/**
 * ============================================================================
 * 诊断报告生成器 — 结构化 JSON + 自然语言摘要
 * ============================================================================
 *
 * 输入：DiagnosisReport
 * 输出：
 *   1. 结构化 JSON（供 API / 仪表盘 / 护栏引擎消费）
 *   2. 自然语言摘要（供 Grok 对话 / 通知 / 日志）
 *   3. Markdown 报告（供导出 / 归档）
 */

import type { DiagnosisReport, Recommendation } from './fusion-diagnosis.service';

// ============================================================================
// 类型定义
// ============================================================================

export interface ReportOutput {
  /** 结构化 JSON */
  json: DiagnosisReport;
  /** 自然语言摘要 */
  summary: string;
  /** Markdown 报告 */
  markdown: string;
  /** 关键指标卡片（用于仪表盘） */
  metricCards: MetricCard[];
  /** 时间线事件（用于历史追溯） */
  timelineEvent: TimelineEvent;
}

export interface MetricCard {
  title: string;
  value: string;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  trend: 'up' | 'down' | 'stable';
  sparkline?: number[];
}

export interface TimelineEvent {
  timestamp: number;
  machineId: string;
  eventType: string;
  severity: string;
  summary: string;
  details: Record<string, unknown>;
}

// ============================================================================
// 报告生成器
// ============================================================================

export class DiagnosisReportGenerator {
  /**
   * 生成完整报告输出
   */
  generate(report: DiagnosisReport): ReportOutput {
    return {
      json: report,
      summary: this.generateSummary(report),
      markdown: this.generateMarkdown(report),
      metricCards: this.generateMetricCards(report),
      timelineEvent: this.generateTimelineEvent(report),
    };
  }

  /**
   * 生成自然语言摘要
   */
  private generateSummary(report: DiagnosisReport): string {
    const parts: string[] = [];

    parts.push(`设备 ${report.machineId} 诊断报告（${new Date(report.timestamp).toLocaleString('zh-CN')}）`);
    parts.push(`综合评分 ${report.overallScore}/100，风险等级：${this.translateRiskLevel(report.overallRiskLevel)}`);

    // 安全
    if (report.safety.alertLevel !== 'none') {
      parts.push(`⚠️ 安全警戒：倾覆风险 ${(report.safety.overturningRisk * 100).toFixed(1)}%，` +
        `风载力矩 ${report.safety.windLoadMoment.toFixed(1)} kN·m`);
    }

    // 健康
    parts.push(`健康状态：疲劳累积 ${report.health.fatigueAccumPercent.toFixed(1)}%，` +
      `剩余寿命 ${report.health.remainingLifeDays} 天，` +
      `轴承状态 ${this.translateBearingStatus(report.health.bearingHealth.status)}`);

    // 效率
    if (report.efficiency.deviationPercent > 5) {
      parts.push(`效率偏差：周期时间偏长 ${report.efficiency.deviationPercent.toFixed(1)}%`);
    }

    // 预测
    if (report.prediction.anomalyAnticipation.anomalyDetected) {
      const anomaly = report.prediction.anomalyAnticipation;
      parts.push(`🔮 预测预警：${anomaly.estimatedStepToAnomaly} 步后可能出现 ${anomaly.anomalyType} 异常`);
    }

    // 建议
    const p0Recs = report.recommendations.filter(r => r.priority === 'P0');
    if (p0Recs.length > 0) {
      parts.push(`🚨 紧急建议：${p0Recs.map(r => r.action).join('；')}`);
    }

    return parts.join('\n');
  }

  /**
   * 生成 Markdown 报告
   */
  private generateMarkdown(report: DiagnosisReport): string {
    const lines: string[] = [];

    lines.push(`# 设备诊断报告`);
    lines.push('');
    lines.push(`| 项目 | 值 |`);
    lines.push(`|------|-----|`);
    lines.push(`| 设备 ID | ${report.machineId} |`);
    lines.push(`| 时间 | ${new Date(report.timestamp).toLocaleString('zh-CN')} |`);
    lines.push(`| 工况阶段 | ${report.cyclePhase} |`);
    lines.push(`| 综合评分 | **${report.overallScore}/100** |`);
    lines.push(`| 风险等级 | **${this.translateRiskLevel(report.overallRiskLevel)}** |`);
    lines.push(`| 诊断耗时 | ${report.durationMs} ms |`);
    lines.push('');

    // 安全维度
    lines.push(`## 1. 安全诊断`);
    lines.push('');
    lines.push(`| 指标 | 值 | 状态 |`);
    lines.push(`|------|-----|------|`);
    lines.push(`| 安全分数 | ${(report.safety.score * 100).toFixed(1)}% | ${this.statusEmoji(report.safety.score)} |`);
    lines.push(`| 倾覆风险 | ${(report.safety.overturningRisk * 100).toFixed(1)}% | ${report.safety.overturningRisk > 0.2 ? '🔴' : report.safety.overturningRisk > 0.15 ? '🟡' : '🟢'} |`);
    lines.push(`| 风载力矩 | ${report.safety.windLoadMoment.toFixed(1)} kN·m | - |`);
    lines.push(`| 偏心力矩 | ${report.safety.eccentricityMoment.toFixed(1)} kN·m | - |`);
    lines.push(`| 安全系数 K | ${report.safety.safetyFactor.toFixed(2)} | ${report.safety.safetyFactor > 1.5 ? '🟢' : '🔴'} |`);
    lines.push(`| 警戒等级 | ${report.safety.alertLevel} | - |`);
    lines.push('');

    if (report.safety.counterfactualAnalysis.length > 0) {
      lines.push(`### 反事实分析`);
      lines.push('');
      lines.push(`| 场景 | 基线风险 | 最坏风险 | 风险增量 |`);
      lines.push(`|------|---------|---------|---------|`);
      for (const cf of report.safety.counterfactualAnalysis) {
        lines.push(`| ${cf.scenario} | ${(cf.baselineRisk * 100).toFixed(1)}% | ${(cf.worstCaseRisk * 100).toFixed(1)}% | +${(cf.riskIncrease * 100).toFixed(1)}% |`);
      }
      lines.push('');
    }

    // 健康维度
    lines.push(`## 2. 健康诊断`);
    lines.push('');
    lines.push(`| 指标 | 值 | 状态 |`);
    lines.push(`|------|-----|------|`);
    lines.push(`| 健康分数 | ${(report.health.score * 100).toFixed(1)}% | ${this.statusEmoji(report.health.score)} |`);
    lines.push(`| 疲劳累积 | ${report.health.fatigueAccumPercent.toFixed(1)}% | ${report.health.fatigueAccumPercent > 80 ? '🔴' : report.health.fatigueAccumPercent > 60 ? '🟡' : '🟢'} |`);
    lines.push(`| 剩余寿命 | ${report.health.remainingLifeDays} 天 | ${report.health.remainingLifeDays < 30 ? '🔴' : '🟢'} |`);
    lines.push(`| 腐蚀指数 | ${report.health.corrosionIndex.toFixed(3)} | ${report.health.corrosionIndex > 0.7 ? '🔴' : '🟢'} |`);
    lines.push(`| 腐蚀速率 | ${report.health.corrosionRateMmPerYear.toFixed(4)} mm/年 | - |`);
    lines.push(`| 轴承温度 | ${report.health.bearingHealth.temperature}°C | ${this.translateBearingStatus(report.health.bearingHealth.status)} |`);
    lines.push(`| 轴承振动 | ${report.health.bearingHealth.vibrationRms} mm/s | - |`);
    if (report.health.suggestedMaintenanceDate) {
      lines.push(`| 建议维修日期 | **${report.health.suggestedMaintenanceDate}** | ⏰ |`);
    }
    lines.push('');

    // 效率维度
    lines.push(`## 3. 效率诊断`);
    lines.push('');
    lines.push(`| 指标 | 值 |`);
    lines.push(`|------|-----|`);
    lines.push(`| 效率分数 | ${(report.efficiency.score * 100).toFixed(1)}% |`);
    lines.push(`| 当前周期时间 | ${report.efficiency.currentCycleTime} 秒 |`);
    lines.push(`| 基准周期时间 | ${report.efficiency.baselineCycleTime} 秒 |`);
    lines.push(`| 偏差 | ${report.efficiency.deviationPercent.toFixed(1)}% |`);
    lines.push(`| 功率因数 | ${report.efficiency.powerFactor.toFixed(2)} |`);
    lines.push('');

    if (report.efficiency.bottlenecks.length > 0) {
      lines.push(`### 瓶颈分析`);
      lines.push('');
      for (const bn of report.efficiency.bottlenecks) {
        lines.push(`- **${bn.phase}**：实际 ${bn.actualDuration.toFixed(0)}s / 预期 ${bn.expectedDuration}s (+${bn.deviationPercent.toFixed(0)}%)`);
        lines.push(`  - 根因：${bn.rootCause}`);
        lines.push(`  - 建议：${bn.suggestion}`);
      }
      lines.push('');
    }

    // 预测维度
    lines.push(`## 4. 预测诊断`);
    lines.push('');
    lines.push(`| 指标 | 值 |`);
    lines.push(`|------|-----|`);
    lines.push(`| 预测置信度 | ${(report.prediction.confidence * 100).toFixed(1)}% |`);
    lines.push(`| 异常预判 | ${report.prediction.anomalyAnticipation.anomalyDetected ? '是' : '否'} |`);
    if (report.prediction.anomalyAnticipation.anomalyDetected) {
      const a = report.prediction.anomalyAnticipation;
      lines.push(`| 预计异常步数 | ${a.estimatedStepToAnomaly} |`);
      lines.push(`| 异常类型 | ${a.anomalyType} |`);
      lines.push(`| 严重程度 | ${a.severity} |`);
      lines.push(`| 物理解释 | ${a.physicsExplanation} |`);
    }
    lines.push('');

    // 建议
    if (report.recommendations.length > 0) {
      lines.push(`## 5. 综合建议`);
      lines.push('');
      lines.push(`| 优先级 | 维度 | 动作 | 原因 | 截止时间 | 预期影响 |`);
      lines.push(`|--------|------|------|------|---------|---------|`);
      for (const rec of report.recommendations) {
        lines.push(`| ${rec.priority} | ${rec.dimension} | ${rec.action} | ${rec.reason} | ${rec.deadline} | ${rec.estimatedImpact} |`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成指标卡片
   */
  private generateMetricCards(report: DiagnosisReport): MetricCard[] {
    return [
      {
        title: '综合评分',
        value: report.overallScore.toString(),
        unit: '/100',
        status: report.overallScore >= 70 ? 'good' : report.overallScore >= 50 ? 'warning' : 'critical',
        trend: 'stable',
      },
      {
        title: '安全分数',
        value: (report.safety.score * 100).toFixed(0),
        unit: '%',
        status: report.safety.score >= 0.8 ? 'good' : report.safety.score >= 0.6 ? 'warning' : 'critical',
        trend: 'stable',
      },
      {
        title: '剩余寿命',
        value: report.health.remainingLifeDays.toString(),
        unit: '天',
        status: report.health.remainingLifeDays > 90 ? 'good' : report.health.remainingLifeDays > 30 ? 'warning' : 'critical',
        trend: 'down',
      },
      {
        title: '疲劳累积',
        value: report.health.fatigueAccumPercent.toFixed(1),
        unit: '%',
        status: report.health.fatigueAccumPercent < 60 ? 'good' : report.health.fatigueAccumPercent < 80 ? 'warning' : 'critical',
        trend: 'up',
      },
      {
        title: '周期效率',
        value: (report.efficiency.score * 100).toFixed(0),
        unit: '%',
        status: report.efficiency.score >= 0.8 ? 'good' : report.efficiency.score >= 0.6 ? 'warning' : 'critical',
        trend: 'stable',
      },
      {
        title: '倾覆风险',
        value: (report.safety.overturningRisk * 100).toFixed(1),
        unit: '%',
        status: report.safety.overturningRisk < 0.1 ? 'good' : report.safety.overturningRisk < 0.15 ? 'warning' : 'critical',
        trend: 'stable',
      },
    ];
  }

  /**
   * 生成时间线事件
   */
  private generateTimelineEvent(report: DiagnosisReport): TimelineEvent {
    return {
      timestamp: report.timestamp,
      machineId: report.machineId,
      eventType: 'diagnosis_report',
      severity: report.overallRiskLevel,
      summary: `综合评分 ${report.overallScore}/100，${this.translateRiskLevel(report.overallRiskLevel)}`,
      details: {
        safetyScore: report.safety.score,
        healthScore: report.health.score,
        efficiencyScore: report.efficiency.score,
        predictionConfidence: report.prediction.confidence,
        alertLevel: report.safety.alertLevel,
        recommendationCount: report.recommendations.length,
      },
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private translateRiskLevel(level: string): string {
    const map: Record<string, string> = {
      safe: '安全', caution: '注意', warning: '警告', danger: '危险', critical: '严重',
    };
    return map[level] || level;
  }

  private translateBearingStatus(status: string): string {
    const map: Record<string, string> = {
      good: '良好', fair: '一般', poor: '较差', critical: '严重',
    };
    return map[status] || status;
  }

  private statusEmoji(score: number): string {
    if (score >= 0.8) return '🟢';
    if (score >= 0.6) return '🟡';
    return '🔴';
  }
}
