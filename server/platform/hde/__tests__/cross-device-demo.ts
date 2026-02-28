/**
 * CrossDeviceComparator 完整验证演示
 *
 * 运行命令: npx tsx server/platform/hde/__tests__/cross-device-demo.ts
 */

import { CrossDeviceComparator } from '../comparator';

// ============================================================================
// 生成带明显奇点的模拟数据
// ============================================================================

function generateDemoData() {
  const deviceCodes = ['CRANE-001', 'CRANE-002', 'CRANE-003', 'CRANE-004', 'CRANE-005'];
  const pointCount = 100;
  const baseTimestamp = new Date('2024-01-15T00:00:00Z').getTime();
  const intervalMs = 60 * 1000; // 1分钟间隔

  // 先生成共享的时间戳数组
  const sharedTimestamps: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    sharedTimestamps.push(baseTimestamp + i * intervalMs);
  }

  // 生成基准噪声（所有正常设备共享相似的变化趋势）
  const baseNoise = sharedTimestamps.map(() => (Math.random() - 0.5) * 0.4);

  return deviceCodes.map(deviceCode => {
    const values: number[] = [];

    for (let i = 0; i < pointCount; i++) {
      let value: number;

      if (deviceCode === 'CRANE-003') {
        // CRANE-003: 注入明显异常 — 在特定时间点严重偏离群体
        const normalBase = 2.5 + baseNoise[i]; // 正常时与群体保持一致

        // 在特定时间点注入尖峰奇点（这些点其他设备都是正常的）
        if (i === 20 || i === 40 || i === 60 || i === 80) {
          value = 15.0 + Math.random() * 3.0; // 尖峰：15-18 mm/s，严重偏离群体
        } else if (i >= 45 && i <= 55) {
          // 持续高位区间：比群体高出很多
          value = 10.0 + Math.random() * 2.0; // 10-12 mm/s
        } else {
          value = normalBase + Math.random() * 0.3;
        }
      } else if (deviceCode === 'CRANE-002') {
        // CRANE-002: 轻微偏高（基础值高一点但不是奇点）
        value = 3.0 + baseNoise[i] + Math.random() * 0.4; // 2.8-3.6 mm/s
      } else {
        // 其他设备：正常范围，跟随基准噪声
        value = 2.5 + baseNoise[i] + Math.random() * 0.3; // ~2.0-3.0 mm/s
      }

      values.push(Number(value.toFixed(4)));
    }

    return {
      deviceCode,
      metricName: 'vibration_rms',
      timestamps: [...sharedTimestamps], // 所有设备使用相同的时间戳
      values,
    };
  });
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('═'.repeat(80));
  console.log('  CrossDeviceComparator 完整验证演示');
  console.log('  5台岸桥设备振动对比 — CRANE-003 注入明显奇点');
  console.log('═'.repeat(80));
  console.log();

  // 创建比较器
  const comparator = new CrossDeviceComparator();

  // 生成演示数据
  const demoData = generateDemoData();

  // 打印数据概览
  console.log('【数据概览】');
  console.log('─'.repeat(60));
  for (const device of demoData) {
    const values = device.values;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    console.log(`  ${device.deviceCode}: 均值=${mean.toFixed(2)} mm/s, 范围=[${min.toFixed(2)}, ${max.toFixed(2)}]`);
  }
  console.log();

  // 执行跨设备对比（使用自定义数据）
  const request = {
    deviceCodes: demoData.map(d => d.deviceCode),
    metricName: 'vibration_rms',
    timeRange: {
      start: new Date('2024-01-15T00:00:00Z'),
      end: new Date('2024-01-15T02:00:00Z'),
    },
    dataSource: 'mock' as const,
  };

  // 直接注入数据并执行分析
  const result = await comparator.compareWithData(demoData, request);

  // ============================================================================
  // 打印完整结果
  // ============================================================================

  console.log('【设备排名 Rankings】');
  console.log('─'.repeat(80));
  console.log('排名 | 设备编号    | 健康分数 | 类别      | 异常率   | 均值     | 标准差   | 最大值');
  console.log('─'.repeat(80));
  for (const ranking of result.rankings) {
    console.log(
      `  ${ranking.rank}  | ${ranking.deviceCode.padEnd(11)} | ` +
      `${ranking.healthScore.toFixed(1).padStart(6)}   | ` +
      `${ranking.category.padEnd(9)} | ` +
      `${(ranking.anomalyRate * 100).toFixed(1).padStart(5)}%   | ` +
      `${ranking.stats.mean.toFixed(2).padStart(6)}   | ` +
      `${ranking.stats.std.toFixed(2).padStart(6)}   | ` +
      `${ranking.stats.max.toFixed(2).padStart(6)}`
    );
  }
  console.log();

  console.log('【群体统计 FleetStats】');
  console.log('─'.repeat(60));
  console.log(`  设备数量:      ${result.fleetStats.deviceCount}`);
  console.log(`  群体均值:      ${result.fleetStats.metricStats.overallMean.toFixed(4)} mm/s`);
  console.log(`  群体标准差:    ${result.fleetStats.metricStats.overallStd.toFixed(4)} mm/s`);
  console.log(`  群体最小值:    ${result.fleetStats.metricStats.overallMin.toFixed(4)} mm/s`);
  console.log(`  群体最大值:    ${result.fleetStats.metricStats.overallMax.toFixed(4)} mm/s`);
  console.log(`  平均异常率:    ${(result.fleetStats.meanAnomalyRate * 100).toFixed(2)}%`);
  console.log(`  健康设备:      ${result.fleetStats.healthyDeviceCount} 台`);
  console.log(`  需关注设备:    ${result.fleetStats.attentionDeviceCount} 台`);
  console.log(`  严重问题设备:  ${result.fleetStats.criticalDeviceCount} 台`);
  console.log();

  console.log('【跨设备奇点 Singularities】');
  console.log('─'.repeat(80));
  if (result.singularities.length === 0) {
    console.log('  (未检测到显著奇点)');
  } else {
    console.log('设备编号    | 时间戳                   | 实际值   | 群体均值 | Z-Score  | 严重等级');
    console.log('─'.repeat(80));
    for (const s of result.singularities) {
      const time = new Date(s.timestamp).toISOString().replace('T', ' ').slice(0, 19);
      console.log(
        `${s.deviceCode.padEnd(11)} | ${time} | ` +
        `${s.value.toFixed(2).padStart(6)}   | ` +
        `${s.fleetMean.toFixed(2).padStart(6)}   | ` +
        `${s.zScoreVsFleet.toFixed(2).padStart(6)}   | ` +
        `${s.severity}`
      );
    }
  }
  console.log();

  console.log('【对标分析 PeerComparison】');
  console.log('─'.repeat(60));
  console.log(`  最佳实践设备:  ${result.peerComparison.bestPracticeDevices.join(', ')}`);
  console.log(`  需关注设备:    ${result.peerComparison.attentionDevices.join(', ') || '(无)'}`);
  console.log(`  基准线均值:    ${result.peerComparison.baseline.mean.toFixed(4)} mm/s`);
  console.log(`  基准线上界:    ${result.peerComparison.baseline.upperBound.toFixed(4)} mm/s`);
  console.log(`  基准线下界:    ${result.peerComparison.baseline.lowerBound.toFixed(4)} mm/s`);
  console.log();

  console.log('【执行元数据】');
  console.log('─'.repeat(60));
  console.log(`  执行耗时:      ${result.metadata.executionTimeMs} ms`);
  console.log(`  数据源:        ${result.metadata.dataSource}`);
  console.log(`  分析时间:      ${new Date(result.metadata.analyzedAt).toISOString()}`);
  console.log();

  console.log('═'.repeat(80));
  console.log('  验证完成 ✓');
  console.log('═'.repeat(80));
}

main().catch(console.error);
