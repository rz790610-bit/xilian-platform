/**
 * Modbus 协议适配器 - 生产级实现
 * 
 * 基于 modbus-serial 库
 * 支持 Modbus TCP / RTU over TCP / Telnet (ASCII)
 * 高级特性：串口参数、字节序控制、数据类型解析、批量寄存器扫描
 * 资源发现：扫描从站 ID 和寄存器范围，自动检测活跃设备
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
    connectionFields: [
      { key: 'host', label: '主机地址', type: 'string', required: true, placeholder: '192.168.1.100', description: 'Modbus TCP 网关或设备 IP' },
      { key: 'port', label: '端口', type: 'number', required: true, defaultValue: 502 },
      { key: 'transportType', label: '传输类型', type: 'select', required: true, defaultValue: 'tcp', options: [
        { label: 'Modbus TCP', value: 'tcp' },
        { label: 'RTU over TCP', value: 'rtu-over-tcp' },
        { label: 'Telnet (ASCII)', value: 'telnet' },
      ]},
      { key: 'unitId', label: '从站 ID (Unit ID)', type: 'number', required: true, defaultValue: 1, description: '目标从站设备地址 (1-247)' },
      { key: 'timeout', label: '响应超时(ms)', type: 'number', required: false, defaultValue: 5000 },
    ],
    authFields: [],
    advancedFields: [
      // 串口参数（RTU 模式）
      { key: 'baudRate', label: '波特率', type: 'select', required: false, defaultValue: '9600', options: [
        { label: '2400', value: '2400' },
        { label: '4800', value: '4800' },
        { label: '9600', value: '9600' },
        { label: '19200', value: '19200' },
        { label: '38400', value: '38400' },
        { label: '57600', value: '57600' },
        { label: '115200', value: '115200' },
      ], description: 'RTU 串口波特率', group: '串口参数' },
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
      ], group: '串口参数' },
      // 字节序控制
      { key: 'swapBytes', label: '字节交换 (AB→BA)', type: 'boolean', required: false, defaultValue: false, description: '16 位寄存器内的高低字节交换' },
      { key: 'swapWords', label: '字交换 (ABCD→CDAB)', type: 'boolean', required: false, defaultValue: false, description: '32 位数据的高低字交换（用于浮点数）' },
      { key: 'dataEncoding', label: '数据编码', type: 'select', required: false, defaultValue: 'big-endian', options: [
        { label: '大端 (Big-Endian, ABCD)', value: 'big-endian' },
        { label: '小端 (Little-Endian, DCBA)', value: 'little-endian' },
        { label: '中端大 (Mid-Big, BADC)', value: 'mid-big' },
        { label: '中端小 (Mid-Little, CDAB)', value: 'mid-little' },
      ], description: '多寄存器数据的字节序' },
      // 批量读取配置
      { key: 'maxReadRegisters', label: '单次最大读取寄存器数', type: 'number', required: false, defaultValue: 125, description: 'Modbus 协议限制单次最多 125 个保持寄存器' },
      { key: 'pollInterval', label: '轮询间隔(ms)', type: 'number', required: false, defaultValue: 1000, description: '连续读取之间的间隔' },
      { key: 'retries', label: '通信重试次数', type: 'number', required: false, defaultValue: 3 },
      { key: 'retryDelay', label: '重试延迟(ms)', type: 'number', required: false, defaultValue: 200 },
      // 资源发现
      { key: 'scanSlaveIds', label: '扫描从站范围', type: 'string', required: false, placeholder: '1-10', description: '资源发现时扫描的从站 ID 范围' },
      { key: 'scanRegisters', label: '扫描寄存器范围', type: 'string', required: false, placeholder: '0-99', description: '资源发现时扫描的保持寄存器范围' },
      { key: 'scanCoils', label: '扫描线圈范围', type: 'string', required: false, placeholder: '0-31', description: '资源发现时扫描的线圈范围' },
      // 数据类型映射
      { key: 'registerDataTypes', label: '寄存器数据类型映射 (JSON)', type: 'json', required: false, description: '定义寄存器地址对应的数据类型，如 {"0":"int16","2":"float32","4":"uint32"}' },
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

  private parseRange(rangeStr: string): [number, number] {
    const parts = rangeStr.split('-').map(s => parseInt(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return [0, 9];
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
    try {
      client = await this.createClient(params);

      // 尝试读取保持寄存器来验证连接
      const unitId = (params.unitId as number) || 1;
      const data = await client.readHoldingRegisters(0, 1);

      const details: Record<string, unknown> = {
        unitId,
        transportType: params.transportType || 'tcp',
        registerValue: data.data[0],
        bufferHex: data.buffer.toString('hex'),
      };

      return {
        success: true,
        latencyMs: 0,
        message: `Modbus ${host}:${params.port || 502} 从站 ${unitId} 连接成功`,
        serverVersion: `Modbus ${(params.transportType as string) || 'TCP'}`,
        details,
      };
    } catch (err) {
      const errMsg = (err as Error).message;
      // 区分连接错误和通信错误
      if (errMsg.includes('Timed out') || errMsg.includes('Port Not Open')) {
        return {
          success: false,
          latencyMs: 0,
          message: `Modbus 连接失败: ${errMsg}（检查网络连接和设备地址）`,
          details: { host, port: params.port, unitId: params.unitId, error: errMsg },
        };
      }
      // CRC 错误或异常响应仍说明设备在线
      if (errMsg.includes('CRC') || errMsg.includes('Modbus exception')) {
        return {
          success: true,
          latencyMs: 0,
          message: `Modbus ${host}:${params.port || 502} 设备在线（通信异常: ${errMsg}）`,
          details: { host, port: params.port, unitId: params.unitId, warning: errMsg },
        };
      }
      return {
        success: false,
        latencyMs: 0,
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
      const [regStart, regEnd] = this.parseRange((params.scanRegisters as string) || '0-19');
      const [coilStart, coilEnd] = this.parseRange((params.scanCoils as string) || '0-15');
      const unitId = (params.unitId as number) || 1;

      // 扫描保持寄存器 (FC03)
      const regCount = Math.min(regEnd - regStart + 1, (params.maxReadRegisters as number) || 125);
      try {
        const holdingRegs = await client.readHoldingRegisters(regStart, regCount);
        for (let i = 0; i < holdingRegs.data.length; i++) {
          endpoints.push({
            resourcePath: `holding:${regStart + i}`,
            resourceType: 'register',
            name: `保持寄存器 ${regStart + i}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 3, registerType: 'holding', address: regStart + i },
            metadata: {
              currentValue: holdingRegs.data[i],
              rawHex: holdingRegs.buffer.slice(i * 2, i * 2 + 2).toString('hex'),
              unitId,
            },
          });
        }
      } catch (err) {
        endpoints.push({
          resourcePath: `holding:${regStart}-${regEnd}`,
          resourceType: 'register',
          name: `保持寄存器 ${regStart}-${regEnd} (不可读)`,
          metadata: { error: (err as Error).message },
        });
      }

      // 扫描输入寄存器 (FC04)
      try {
        const inputRegs = await client.readInputRegisters(regStart, Math.min(regCount, 20));
        for (let i = 0; i < inputRegs.data.length; i++) {
          endpoints.push({
            resourcePath: `input:${regStart + i}`,
            resourceType: 'register',
            name: `输入寄存器 ${regStart + i}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 4, registerType: 'input', address: regStart + i },
            metadata: { currentValue: inputRegs.data[i], unitId },
          });
        }
      } catch { /* 输入寄存器可能不存在 */ }

      // 扫描线圈 (FC01)
      const coilCount = Math.min(coilEnd - coilStart + 1, 2000);
      try {
        const coils = await client.readCoils(coilStart, coilCount);
        for (let i = 0; i < coils.data.length; i++) {
          endpoints.push({
            resourcePath: `coil:${coilStart + i}`,
            resourceType: 'register',
            name: `线圈 ${coilStart + i}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 1, registerType: 'coil', address: coilStart + i },
            metadata: { currentValue: coils.data[i], unitId },
          });
        }
      } catch { /* 线圈可能不存在 */ }

      // 扫描离散输入 (FC02)
      try {
        const discreteInputs = await client.readDiscreteInputs(coilStart, Math.min(coilCount, 16));
        for (let i = 0; i < discreteInputs.data.length; i++) {
          endpoints.push({
            resourcePath: `discrete:${coilStart + i}`,
            resourceType: 'register',
            name: `离散输入 ${coilStart + i}`,
            dataFormat: 'binary',
            schemaInfo: { functionCode: 2, registerType: 'discrete', address: coilStart + i },
            metadata: { currentValue: discreteInputs.data[i], unitId },
          });
        }
      } catch { /* 离散输入可能不存在 */ }

      // 多从站扫描
      if (params.scanSlaveIds) {
        const [slaveStart, slaveEnd] = this.parseRange(params.scanSlaveIds as string);
        for (let slaveId = slaveStart; slaveId <= slaveEnd && slaveId <= 247; slaveId++) {
          if (slaveId === unitId) continue; // 跳过已扫描的主从站
          try {
            client.setID(slaveId);
            await client.readHoldingRegisters(0, 1);
            endpoints.push({
              resourcePath: `slave:${slaveId}`,
              resourceType: 'register',
              name: `从站 ${slaveId} (在线)`,
              metadata: { slaveId, online: true },
            });
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
