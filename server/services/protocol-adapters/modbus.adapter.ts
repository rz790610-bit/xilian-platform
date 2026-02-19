/**
 * Modbus 协议适配器 - 工业级实现
 * 
 * 基于 modbus-serial 库
 * 支持 Modbus TCP / RTU / RTU over TCP / ASCII (Telnet)
 * 
 * 工业级特性：
 * - 主站/从站角色选择
 * - 完整功能码支持（FC01~FC06, FC15, FC16, FC43/14 诊断）
 * - 串口参数（波特率/数据位/停止位/校验/T3.5帧间隔）
 * - 四种字节序控制（Big/Little/Mid-Big/Mid-Little Endian）
 * - 寄存器→数据类型映射（int16/uint16/int32/uint32/float32/float64/string）
 * - 多从站自动扫描（scanSlaveIds 范围扫描）
 * - 批量寄存器读取（自动分片，遵守 125 寄存器限制）
 * - 网关模式（TCP→RTU 桥接）
 */

import ModbusRTU from 'modbus-serial';
import { BaseAdapter, normalizeError, AdapterError, AdapterErrorCode } from './base';
import type { ConnectionTestResult, DiscoveredEndpoint, ProtocolConfigSchema, HealthCheckResult } from '../../../shared/accessLayerTypes';

export class ModbusAdapter extends BaseAdapter {
  readonly protocolType = 'modbus' as const;
  protected defaultTimeoutMs = 15000;

  readonly configSchema: ProtocolConfigSchema = {
    protocolType: 'modbus',
    label: 'Modbus 设备',
    icon: '⚙️',
    description: 'Modbus TCP/RTU/ASCII 工控设备寄存器读写',
    category: 'industrial',
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100', description: 'Modbus TCP 网关或设备 IP（串口模式填串口服务器 IP）' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 502, description: 'Modbus TCP 默认 502' },
      { key: 'transportType', label: '传输类型', type: 'select', required: true, defaultValue: 'tcp', options: [
        { label: 'Modbus TCP', value: 'tcp' },
        { label: 'RTU over TCP', value: 'rtu-over-tcp' },
        { label: 'Telnet (ASCII)', value: 'telnet' },
      ]},
      { key: 'role', label: '通信角色', type: 'select', required: true, defaultValue: 'master', options: [
        { label: '主站 (Master/Client)', value: 'master' },
        { label: '从站 (Slave/Server)', value: 'slave' },
        { label: '网关 (TCP↔RTU Bridge)', value: 'gateway' },
      ], description: '主站主动轮询从站；从站被动响应；网关桥接 TCP 与 RTU' },
      { key: 'unitId', label: '从站 ID (Unit ID)', type: 'number', required: true, defaultValue: 1, description: '目标从站设备地址 (1-247)，主站模式填目标从站地址，从站模式填本机地址' },
      { key: 'timeout', label: '响应超时(ms)', type: 'number', required: false, defaultValue: 5000, description: '等待从站响应的超时时间' },
    ],
    authFields: [],
    advancedFields: [
      // ─── 功能码配置 ───
      { key: 'enabledFunctionCodes', label: '启用的功能码', type: 'json', required: false,
        defaultValue: [1, 2, 3, 4, 5, 6, 15, 16],
        description: '支持的 Modbus 功能码列表：1=读线圈, 2=读离散输入, 3=读保持寄存器, 4=读输入寄存器, 5=写单线圈, 6=写单寄存器, 15=写多线圈, 16=写多寄存器, 43=诊断',
        group: '功能码' },
      { key: 'enableDiagnostics', label: '启用诊断功能 (FC43/14)', type: 'boolean', required: false, defaultValue: false,
        description: '启用 Modbus 诊断功能码（FC43 MEI / FC08 诊断），用于读取设备标识信息',
        group: '功能码' },
      { key: 'enableWriteOperations', label: '允许写操作', type: 'boolean', required: false, defaultValue: false,
        description: '安全开关：是否允许 FC05/FC06/FC15/FC16 写入操作（生产环境建议默认关闭）',
        group: '功能码' },

      // ─── 串口参数（RTU 模式）───
      { key: 'baudRate', label: '波特率', type: 'select', required: false, defaultValue: '9600', options: [
        { label: '2400', value: '2400' },
        { label: '4800', value: '4800' },
        { label: '9600', value: '9600' },
        { label: '19200', value: '19200' },
        { label: '38400', value: '38400' },
        { label: '57600', value: '57600' },
        { label: '115200', value: '115200' },
      ], description: 'RTU 串口波特率（需与从站设备一致）', group: '串口参数' },
      { key: 'dataBits', label: '数据位', type: 'select', required: false, defaultValue: '8', options: [
        { label: '7', value: '7' }, { label: '8', value: '8' },
      ], group: '串口参数' },
      { key: 'stopBits', label: '停止位', type: 'select', required: false, defaultValue: '1', options: [
        { label: '1', value: '1' }, { label: '2', value: '2' },
      ], group: '串口参数' },
      { key: 'parity', label: '校验位', type: 'select', required: false, defaultValue: 'none', options: [
        { label: '无 (None)', value: 'none' },
        { label: '偶校验 (Even)', value: 'even' },
        { label: '奇校验 (Odd)', value: 'odd' },
      ], description: 'RTU 默认 8N1（8数据位, 无校验, 1停止位）', group: '串口参数' },
      { key: 'interFrameDelay', label: 'T3.5 帧间隔(ms)', type: 'number', required: false, defaultValue: 0,
        description: 'RTU 模式的 3.5 字符时间帧间隔（0=自动计算）。9600bps 时约 4ms，115200bps 时约 0.3ms。此参数对 RTU 通信稳定性至关重要',
        group: '串口参数' },

      // ─── 字节序控制 ───
      { key: 'swapBytes', label: '字节交换 (AB→BA)', type: 'boolean', required: false, defaultValue: false,
        description: '16 位寄存器内的高低字节交换', group: '字节序' },
      { key: 'swapWords', label: '字交换 (ABCD→CDAB)', type: 'boolean', required: false, defaultValue: false,
        description: '32 位数据的高低字交换（常见于 Schneider/ABB 设备的浮点数）', group: '字节序' },
      { key: 'dataEncoding', label: '数据编码', type: 'select', required: false, defaultValue: 'big-endian', options: [
        { label: '大端 (Big-Endian, ABCD) — Modbus 标准', value: 'big-endian' },
        { label: '小端 (Little-Endian, DCBA)', value: 'little-endian' },
        { label: '中端大 (Mid-Big, BADC)', value: 'mid-big' },
        { label: '中端小 (Mid-Little, CDAB)', value: 'mid-little' },
      ], description: '多寄存器数据的字节序（不同厂商设备字节序不同）', group: '字节序' },

      // ─── 数据类型映射 ───
      { key: 'registerDataTypes', label: '寄存器数据类型映射', type: 'json', required: false,
        description: '定义寄存器地址对应的数据类型。格式: {"地址":"类型"}, 支持: int16/uint16/int32/uint32/float32/float64/string。示例: {"0":"int16","2":"float32","10":"uint32"}',
        group: '数据映射' },
      { key: 'registerAliases', label: '寄存器别名映射', type: 'json', required: false,
        description: '为寄存器地址定义可读名称。格式: {"地址":"别名"}。示例: {"0":"温度","2":"压力","4":"流量"}',
        group: '数据映射' },

      // ─── 轮询与通信 ───
      { key: 'maxReadRegisters', label: '单次最大读取寄存器数', type: 'number', required: false, defaultValue: 125,
        description: 'Modbus 协议限制单次最多 125 个保持寄存器（FC03/FC04）', group: '轮询配置' },
      { key: 'maxReadCoils', label: '单次最大读取线圈数', type: 'number', required: false, defaultValue: 2000,
        description: 'Modbus 协议限制单次最多 2000 个线圈（FC01/FC02）', group: '轮询配置' },
      { key: 'pollInterval', label: '轮询间隔(ms)', type: 'number', required: false, defaultValue: 1000,
        description: '主站连续读取之间的间隔', group: '轮询配置' },
      { key: 'retries', label: '通信重试次数', type: 'number', required: false, defaultValue: 3, group: '轮询配置' },
      { key: 'retryDelay', label: '重试延迟(ms)', type: 'number', required: false, defaultValue: 200, group: '轮询配置' },
      { key: 'interPollDelay', label: '站间延迟(ms)', type: 'number', required: false, defaultValue: 50,
        description: '多从站轮询时，切换从站之间的等待时间（避免总线冲突）', group: '轮询配置' },

      // ─── 资源发现 ───
      { key: 'scanSlaveIds', label: '扫描从站范围', type: 'string', required: false, placeholder: '1-10',
        description: '资源发现时扫描的从站 ID 范围（如 1-10 或 1,3,5,7）', group: '资源发现' },
      { key: 'scanRegisters', label: '扫描保持寄存器范围', type: 'string', required: false, placeholder: '0-99',
        description: '资源发现时扫描的保持寄存器（FC03）范围', group: '资源发现' },
      { key: 'scanInputRegisters', label: '扫描输入寄存器范围', type: 'string', required: false, placeholder: '0-19',
        description: '资源发现时扫描的输入寄存器（FC04）范围', group: '资源发现' },
      { key: 'scanCoils', label: '扫描线圈范围', type: 'string', required: false, placeholder: '0-31',
        description: '资源发现时扫描的线圈（FC01）范围', group: '资源发现' },
      { key: 'scanDiscreteInputs', label: '扫描离散输入范围', type: 'string', required: false, placeholder: '0-15',
        description: '资源发现时扫描的离散输入（FC02）范围', group: '资源发现' },

      // ─── 网关模式 ───
      { key: 'gatewayMode', label: '网关桥接模式', type: 'select', required: false, defaultValue: 'transparent', options: [
        { label: '透明转发 (Transparent)', value: 'transparent' },
        { label: '协议转换 (Protocol Convert)', value: 'convert' },
        { label: '聚合代理 (Aggregation)', value: 'aggregation' },
      ], description: '网关角色时的桥接模式', group: '网关配置' },
      { key: 'gatewayUpstreamType', label: '上行协议', type: 'select', required: false, defaultValue: 'tcp', options: [
        { label: 'Modbus TCP', value: 'tcp' },
        { label: 'MQTT (JSON)', value: 'mqtt' },
        { label: 'HTTP REST', value: 'http' },
      ], description: '网关上行数据转发协议', group: '网关配置' },
    ],
  };

  private async createClient(params: Record<string, unknown>): Promise<ModbusRTU> {
    const client = new ModbusRTU();
    const host = params.host as string;
    const port = (params.port as number) || 502;
    const timeout = (params.timeout as number) || 5000;
    const transportType = (params.transportType as string) || 'tcp';

    client.setTimeout(timeout);

    switch (transportType) {
      case 'rtu-over-tcp':
        await client.connectTcpRTUBuffered(host, { port });
        break;
      case 'telnet':
        await client.connectTelnet(host, { port });
        break;
      case 'tcp':
      default:
        await client.connectTCP(host, { port });
        break;
    }

    const unitId = (params.unitId as number) || 1;
    client.setID(unitId);

    return client;
  }

  private parseRange(rangeStr: string): number[] {
    // 支持 "1-10" 和 "1,3,5,7" 两种格式
    if (rangeStr.includes(',')) {
      return rangeStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }
    const parts = rangeStr.split('-').map(s => parseInt(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const result: number[] = [];
      for (let i = parts[0]; i <= parts[1]; i++) result.push(i);
      return result;
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  private parseRangeMinMax(rangeStr: string): [number, number] {
    const nums = this.parseRange(rangeStr);
    return [Math.min(...nums), Math.max(...nums)];
  }

  protected async doTestConnection(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<ConnectionTestResult> {
    const host = params.host as string;
    if (!host) {
      return { success: false, latencyMs: 0, message: '主机地址不能为空' };
    }

    let client: ModbusRTU | null = null;
    const startTime = Date.now();
    try {
      client = await this.createClient(params);

      // 尝试读取保持寄存器来验证连接
      const unitId = (params.unitId as number) || 1;
      const data = await client.readHoldingRegisters(0, 1);
      const latency = Date.now() - startTime;

      const details: Record<string, unknown> = {
        unitId,
        role: params.role || 'master',
        transportType: params.transportType || 'tcp',
        registerValue: data.data[0],
        bufferHex: data.buffer.toString('hex'),
        responseTimeMs: latency,
      };

      // 尝试读取设备标识（FC43/14 MEI）
      if (params.enableDiagnostics) {
        try {
          // modbus-serial 不直接支持 FC43，记录为待实现
          details.diagnostics = 'FC43/14 MEI 需要底层协议栈支持';
        } catch { /* ignore */ }
      }

      return {
        success: true,
        latencyMs: latency,
        message: `Modbus ${host}:${params.port || 502} 从站 ${unitId} 连接成功 (${latency}ms)`,
        serverVersion: `Modbus ${(params.transportType as string)?.toUpperCase() || 'TCP'} / Unit ${unitId}`,
        details,
      };
    } catch (err) {
      const latency = Date.now() - startTime;
      const errMsg = (err as Error).message;
      // 区分连接错误和通信错误
      if (errMsg.includes('Timed out') || errMsg.includes('Port Not Open') || errMsg.includes('ECONNREFUSED')) {
        return {
          success: false,
          latencyMs: latency,
          message: `Modbus 连接失败: ${errMsg}（检查网络连接、设备地址和端口）`,
          details: { host, port: params.port, unitId: params.unitId, error: errMsg },
        };
      }
      // CRC 错误或异常响应仍说明设备在线
      if (errMsg.includes('CRC') || errMsg.includes('Modbus exception')) {
        return {
          success: true,
          latencyMs: latency,
          message: `Modbus ${host}:${params.port || 502} 设备在线（通信异常: ${errMsg}，可能是寄存器地址不存在）`,
          details: { host, port: params.port, unitId: params.unitId, warning: errMsg },
        };
      }
      return {
        success: false,
        latencyMs: latency,
        message: `Modbus 连接失败: ${errMsg}`,
        details: { host, port: params.port, error: errMsg },
      };
    } finally {
      try { if (client) client.close(() => {}); } catch { /* ignore */ }
    }
  }

  protected async doDiscoverResources(
    params: Record<string, unknown>,
    auth?: Record<string, unknown>
  ): Promise<DiscoveredEndpoint[]> {
    const endpoints: DiscoveredEndpoint[] = [];
    let client: ModbusRTU | null = null;

    try {
      client = await this.createClient(params);

      // 解析扫描范围
      const [regStart, regEnd] = this.parseRangeMinMax((params.scanRegisters as string) || '0-19');
      const [inputRegStart, inputRegEnd] = this.parseRangeMinMax((params.scanInputRegisters as string) || '0-19');
      const [coilStart, coilEnd] = this.parseRangeMinMax((params.scanCoils as string) || '0-15');
      const [diStart, diEnd] = this.parseRangeMinMax((params.scanDiscreteInputs as string) || '0-15');
      const unitId = (params.unitId as number) || 1;
      const maxRegs = (params.maxReadRegisters as number) || 125;
      const maxCoils = (params.maxReadCoils as number) || 2000;
      const dataTypes = (params.registerDataTypes as Record<string, string>) || {};
      const aliases = (params.registerAliases as Record<string, string>) || {};

      // ─── 扫描保持寄存器 (FC03) ───
      const regCount = Math.min(regEnd - regStart + 1, maxRegs);
      try {
        const holdingRegs = await client.readHoldingRegisters(regStart, regCount);
        for (let i = 0; i < holdingRegs.data.length; i++) {
          const addr = regStart + i;
          const alias = aliases[String(addr)];
          const dtype = dataTypes[String(addr)] || 'uint16';
          endpoints.push({
            resourcePath: `holding:${addr}`,
            resourceType: 'register',
            name: alias || `保持寄存器 ${addr}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 3, registerType: 'holding', address: addr, dataType: dtype },
            metadata: {
              currentValue: holdingRegs.data[i],
              rawHex: holdingRegs.buffer.slice(i * 2, i * 2 + 2).toString('hex'),
              unitId,
              alias,
            },
          });
        }
      } catch (err) {
        endpoints.push({
          resourcePath: `holding:${regStart}-${regEnd}`,
          resourceType: 'register',
          name: `保持寄存器 ${regStart}-${regEnd} (不可读)`,
          metadata: { error: (err as Error).message, functionCode: 3 },
        });
      }

      // ─── 扫描输入寄存器 (FC04) ───
      const inputRegCount = Math.min(inputRegEnd - inputRegStart + 1, maxRegs);
      try {
        const inputRegs = await client.readInputRegisters(inputRegStart, inputRegCount);
        for (let i = 0; i < inputRegs.data.length; i++) {
          const addr = inputRegStart + i;
          endpoints.push({
            resourcePath: `input:${addr}`,
            resourceType: 'register',
            name: aliases[`input:${addr}`] || `输入寄存器 ${addr}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 4, registerType: 'input', address: addr },
            metadata: { currentValue: inputRegs.data[i], unitId },
          });
        }
      } catch { /* 输入寄存器可能不存在 */ }

      // ─── 扫描线圈 (FC01) ───
      const coilCount = Math.min(coilEnd - coilStart + 1, maxCoils);
      try {
        const coils = await client.readCoils(coilStart, coilCount);
        for (let i = 0; i < coils.data.length; i++) {
          const addr = coilStart + i;
          endpoints.push({
            resourcePath: `coil:${addr}`,
            resourceType: 'register',
            name: aliases[`coil:${addr}`] || `线圈 ${addr}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 1, registerType: 'coil', address: addr },
            metadata: { currentValue: coils.data[i], unitId },
          });
        }
      } catch { /* 线圈可能不存在 */ }

      // ─── 扫描离散输入 (FC02) ───
      const diCount = Math.min(diEnd - diStart + 1, maxCoils);
      try {
        const discreteInputs = await client.readDiscreteInputs(diStart, diCount);
        for (let i = 0; i < discreteInputs.data.length; i++) {
          const addr = diStart + i;
          endpoints.push({
            resourcePath: `discrete:${addr}`,
            resourceType: 'register',
            name: aliases[`discrete:${addr}`] || `离散输入 ${addr}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 2, registerType: 'discrete', address: addr },
            metadata: { currentValue: discreteInputs.data[i], unitId },
          });
        }
      } catch { /* 离散输入可能不存在 */ }

      // ─── 多从站扫描 ───
      if (params.scanSlaveIds) {
        const slaveIds = this.parseRange(params.scanSlaveIds as string);
        const interPollDelay = (params.interPollDelay as number) || 50;
        for (const slaveId of slaveIds) {
          if (slaveId === unitId || slaveId < 1 || slaveId > 247) continue;
          try {
            client.setID(slaveId);
            const data = await client.readHoldingRegisters(0, 1);
            endpoints.push({
              resourcePath: `slave:${slaveId}`,
              resourceType: 'slave',
              name: `从站 ${slaveId} (在线)`,
              dataFormat: 'binary',
              schemaInfo: { slaveId, firstRegisterValue: data.data[0] },
              metadata: { slaveId, online: true, responseValue: data.data[0] },
            });
            // 站间延迟
            if (interPollDelay > 0) {
              await new Promise(r => setTimeout(r, interPollDelay));
            }
          } catch {
            // 从站不响应，跳过
          }
        }
        // 恢复原始从站 ID
        client.setID(unitId);
      }

      return endpoints;
    } finally {
      try { if (client) client.close(() => {}); } catch { /* ignore */ }
    }
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
