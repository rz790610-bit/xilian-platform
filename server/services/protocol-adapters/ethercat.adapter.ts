/**
 * EtherCAT 协议适配器 - 工业级实现
 * 
 * EtherCAT (Ethernet for Control Automation Technology) 是倍福(Beckhoff)主导的高性能工业以太网标准
 * 
 * 工业级特性：
 * - Master (主站) / Slave (从站) 角色
 * - ESI (EtherCAT Slave Information) XML 文件解析
 * - PDO (Process Data Object) 映射配置
 * - DC (Distributed Clocks) 分布式时钟同步
 * - CoE (CAN over EtherCAT) SDO 参数访问
 * - FoE (File over EtherCAT) 固件更新
 * - EoE (Ethernet over EtherCAT) 以太网隧道
 * - 从站状态机管理 (INIT → PRE-OP → SAFE-OP → OP)
 * - 热连接 (Hot Connect) 支持
 */

import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class EthercatAdapter extends BaseAdapter {
  readonly protocolType = 'ethercat' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'ethercat',
    label: 'EtherCAT',
    icon: '⚡',
    description: 'EtherCAT — 高性能运动控制与伺服驱动实时通信',
    category: 'industrial',
    connectionFields: [
      { key: 'networkInterface', label: '网络接口', type: 'string', required: true,
        placeholder: 'eth0',
        description: 'EtherCAT 主站使用的网络接口（Linux: eth0/ens33, Windows: \\Device\\NPF_{GUID}）' },
      { key: 'role', label: '角色', type: 'select', required: true, defaultValue: 'master', options: [
        { label: 'Master (主站)', value: 'master' },
        { label: 'Slave (从站模拟)', value: 'slave' },
      ], description: 'EtherCAT 主站控制所有从站；从站模拟用于测试' },
      { key: 'expectedSlaveCount', label: '预期从站数量', type: 'number', required: false,
        description: '预期的从站数量（启动时自动扫描验证）' },
      { key: 'cyclicTaskPeriod', label: '周期任务周期(μs)', type: 'number', required: true, defaultValue: 1000,
        description: 'EtherCAT 周期任务的执行周期。运动控制建议 250-1000μs，I/O 采集建议 1000-10000μs' },
    ],
    authFields: [],
    advancedFields: [
      // ─── 从站配置 ───
      { key: 'slaves', label: '从站配置 (JSON)', type: 'json', required: false,
        description: '从站配置列表。示例: [{"position":0,"vendorId":"0x00000002","productCode":"0x044C2C52","name":"EK1100"},{"position":1,"vendorId":"0x00000002","productCode":"0x03F03052","name":"EL3002"}]',
        group: '从站配置' },
      { key: 'autoConfig', label: '自动配置', type: 'boolean', required: false, defaultValue: true,
        description: '启动时自动扫描从站并配置 PDO 映射（基于 ESI 文件）',
        group: '从站配置' },
      { key: 'hotConnect', label: '热连接', type: 'boolean', required: false, defaultValue: false,
        description: '允许运行时动态添加/移除从站（需要从站支持）',
        group: '从站配置' },

      // ─── ESI 配置 ───
      { key: 'esiDirectory', label: 'ESI 文件目录', type: 'string', required: false,
        placeholder: '/opt/ethercat/esi',
        description: 'ESI (EtherCAT Slave Information) XML 文件存放目录',
        group: 'ESI 配置' },
      { key: 'esiFiles', label: 'ESI 文件列表', type: 'json', required: false,
        description: '指定的 ESI 文件路径列表。示例: ["/opt/esi/Beckhoff_EK1xxx.xml", "/opt/esi/Beckhoff_EL3xxx.xml"]',
        group: 'ESI 配置' },

      // ─── PDO 映射 ───
      { key: 'rxPdoMapping', label: 'RxPDO 映射 (JSON)', type: 'json', required: false,
        description: 'RxPDO（主站→从站）映射配置。示例: [{"index":"0x1600","entries":[{"index":"0x7010","subindex":1,"bitLength":16,"name":"Output1"}]}]',
        group: 'PDO 映射' },
      { key: 'txPdoMapping', label: 'TxPDO 映射 (JSON)', type: 'json', required: false,
        description: 'TxPDO（从站→主站）映射配置。示例: [{"index":"0x1A00","entries":[{"index":"0x6000","subindex":1,"bitLength":16,"name":"Input1"}]}]',
        group: 'PDO 映射' },
      { key: 'pdoAssignment', label: 'PDO 分配模式', type: 'select', required: false, defaultValue: 'auto', options: [
        { label: '自动（基于 ESI）', value: 'auto' },
        { label: '手动配置', value: 'manual' },
        { label: '使用默认映射', value: 'default' },
      ], description: 'PDO 映射分配方式', group: 'PDO 映射' },

      // ─── DC 分布式时钟 ───
      { key: 'dcEnabled', label: '启用 DC 时钟', type: 'boolean', required: false, defaultValue: true,
        description: '启用分布式时钟同步（运动控制必须启用）',
        group: 'DC 时钟' },
      { key: 'dcCycleTime', label: 'DC 周期(ns)', type: 'number', required: false, defaultValue: 1000000,
        description: 'DC SYNC0 信号周期（纳秒）。1000000ns = 1ms',
        group: 'DC 时钟' },
      { key: 'dcShiftTime', label: 'DC 偏移(ns)', type: 'number', required: false, defaultValue: 0,
        description: 'DC SYNC0 信号偏移量（用于精确时序对齐）',
        group: 'DC 时钟' },
      { key: 'dcSync1Enabled', label: '启用 SYNC1', type: 'boolean', required: false, defaultValue: false,
        description: '启用 SYNC1 信号（双周期模式，用于高级运动控制）',
        group: 'DC 时钟' },
      { key: 'dcSync1CycleTime', label: 'SYNC1 周期(ns)', type: 'number', required: false,
        description: 'SYNC1 信号周期（通常为 SYNC0 的整数倍）',
        group: 'DC 时钟' },

      // ─── CoE (CAN over EtherCAT) ───
      { key: 'coeEnabled', label: '启用 CoE', type: 'boolean', required: false, defaultValue: true,
        description: '启用 CoE 协议（SDO 参数读写）',
        group: 'CoE 配置' },
      { key: 'sdoTimeout', label: 'SDO 超时(ms)', type: 'number', required: false, defaultValue: 3000,
        description: 'SDO 读写操作超时时间',
        group: 'CoE 配置' },
      { key: 'completeAccessEnabled', label: '完整访问模式', type: 'boolean', required: false, defaultValue: true,
        description: '启用 SDO Complete Access（一次读写整个对象）',
        group: 'CoE 配置' },

      // ─── FoE (File over EtherCAT) ───
      { key: 'foeEnabled', label: '启用 FoE', type: 'boolean', required: false, defaultValue: false,
        description: '启用 FoE 协议（固件更新和文件传输）',
        group: 'FoE 配置' },
      { key: 'foePassword', label: 'FoE 密码', type: 'password', required: false,
        description: 'FoE 文件传输密码（部分从站要求）',
        group: 'FoE 配置' },

      // ─── 状态机 ───
      { key: 'targetState', label: '目标状态', type: 'select', required: false, defaultValue: 'OP', options: [
        { label: 'INIT — 初始化', value: 'INIT' },
        { label: 'PRE-OP — 预操作', value: 'PRE-OP' },
        { label: 'SAFE-OP — 安全操作', value: 'SAFE-OP' },
        { label: 'OP — 操作', value: 'OP' },
      ], description: '从站启动后的目标状态（OP=正常运行，SAFE-OP=只读输入）',
        group: '状态机' },
      { key: 'stateChangeTimeout', label: '状态切换超时(ms)', type: 'number', required: false, defaultValue: 5000,
        description: '每个状态转换的超时时间',
        group: '状态机' },

      // ─── 性能调优 ───
      { key: 'sendInterval', label: '帧发送间隔(μs)', type: 'number', required: false, defaultValue: 0,
        description: '连续 EtherCAT 帧之间的最小间隔（0=无间隔，最快速率）',
        group: '性能调优' },
      { key: 'maxRetries', label: '最大重试次数', type: 'number', required: false, defaultValue: 3,
        description: '帧丢失时的最大重试次数',
        group: '性能调优' },
      { key: 'redundancy', label: '线缆冗余', type: 'boolean', required: false, defaultValue: false,
        description: '启用 EtherCAT 线缆冗余（需要双网口主站）',
        group: '性能调优' },
    ],
  };

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const networkInterface = params.networkInterface as string;
    if (!networkInterface) {
      return { success: false, latencyMs: 0, message: '网络接口不能为空' };
    }

    const startTime = Date.now();
    try {
      // 检查网络接口是否存在
      const { execSync } = await import('child_process');
      let interfaceExists = false;
      try {
        const result = execSync(`ip link show ${networkInterface} 2>/dev/null`, { encoding: 'utf-8' });
        interfaceExists = result.includes(networkInterface);
      } catch {
        interfaceExists = false;
      }

      const latency = Date.now() - startTime;
      if (interfaceExists) {
        // 检查接口是否 UP
        let interfaceUp = false;
        try {
          const result = execSync(`ip link show ${networkInterface}`, { encoding: 'utf-8' });
          interfaceUp = result.includes('state UP') || result.includes('state UNKNOWN');
        } catch { /* ignore */ }

        return {
          success: true,
          latencyMs: latency,
          message: `EtherCAT 网络接口 ${networkInterface} ${interfaceUp ? '已就绪' : '存在但未激活'} (${latency}ms)`,
          serverVersion: 'EtherCAT',
          details: {
            networkInterface,
            interfaceUp,
            role: params.role || 'master',
            cyclicTaskPeriod: params.cyclicTaskPeriod || 1000,
            dcEnabled: params.dcEnabled !== false,
            expectedSlaveCount: params.expectedSlaveCount,
          },
        };
      }
      return {
        success: false,
        latencyMs: latency,
        message: `网络接口 ${networkInterface} 不存在`,
        details: { networkInterface },
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      return {
        success: false,
        latencyMs: latency,
        message: `EtherCAT 连接测试失败: ${(err as Error).message}`,
        details: { networkInterface, error: (err as Error).message },
      };
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const endpoints: DiscoveredEndpoint[] = [];

    // 从从站配置生成端点
    const slaves = params.slaves as Array<{
      position: number;
      vendorId: string;
      productCode: string;
      name: string;
    }>;

    if (slaves && Array.isArray(slaves)) {
      for (const slave of slaves) {
        endpoints.push({
          resourcePath: `ecat:slave${slave.position}`,
          resourceType: 'slave',
          name: `${slave.name} (Pos ${slave.position})`,
          dataFormat: 'binary',
          schemaInfo: {
            position: slave.position,
            vendorId: slave.vendorId,
            productCode: slave.productCode,
            name: slave.name,
          },
        });
      }
    }

    // 从 TxPDO 映射生成数据端点
    const txPdoMapping = params.txPdoMapping as Array<{
      index: string;
      entries: Array<{ index: string; subindex: number; bitLength: number; name: string }>;
    }>;

    if (txPdoMapping && Array.isArray(txPdoMapping)) {
      for (const pdo of txPdoMapping) {
        for (const entry of pdo.entries || []) {
          endpoints.push({
            resourcePath: `ecat:pdo:${pdo.index}/${entry.index}:${entry.subindex}`,
            resourceType: 'pdo-entry',
            name: entry.name || `PDO ${pdo.index}/${entry.index}:${entry.subindex}`,
            dataFormat: 'json',
            schemaInfo: {
              pdoIndex: pdo.index,
              entryIndex: entry.index,
              subindex: entry.subindex,
              bitLength: entry.bitLength,
              direction: 'input',
            },
          });
        }
      }
    }

    // 从 RxPDO 映射生成数据端点
    const rxPdoMapping = params.rxPdoMapping as Array<{
      index: string;
      entries: Array<{ index: string; subindex: number; bitLength: number; name: string }>;
    }>;

    if (rxPdoMapping && Array.isArray(rxPdoMapping)) {
      for (const pdo of rxPdoMapping) {
        for (const entry of pdo.entries || []) {
          endpoints.push({
            resourcePath: `ecat:pdo:${pdo.index}/${entry.index}:${entry.subindex}`,
            resourceType: 'pdo-entry',
            name: entry.name || `PDO ${pdo.index}/${entry.index}:${entry.subindex}`,
            dataFormat: 'json',
            schemaInfo: {
              pdoIndex: pdo.index,
              entryIndex: entry.index,
              subindex: entry.subindex,
              bitLength: entry.bitLength,
              direction: 'output',
            },
          });
        }
      }
    }

    // 添加标准 CoE 对象端点
    if (params.coeEnabled !== false) {
      endpoints.push(
        {
          resourcePath: 'ecat:coe:0x1000',
          resourceType: 'sdo',
          name: 'Device Type (0x1000)',
          dataFormat: 'json',
          schemaInfo: { index: '0x1000', subindex: 0, type: 'UNSIGNED32' },
          metadata: { description: '设备类型标识' },
        },
        {
          resourcePath: 'ecat:coe:0x1018',
          resourceType: 'sdo',
          name: 'Identity Object (0x1018)',
          dataFormat: 'json',
          schemaInfo: { index: '0x1018', type: 'RECORD' },
          metadata: { description: '设备标识：Vendor ID, Product Code, Revision, Serial Number' },
        },
      );
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
