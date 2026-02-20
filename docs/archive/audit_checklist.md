# 接入层协议逐项审计对照表

按照官方工业协议配置清单，逐项检查每个适配器的 configSchema 覆盖情况。

## 1. Modbus (RTU/ASCII/TCP/Plus)

### 官方要求 vs 实际实现

| # | 配置类别 | 官方要求配置项 | configSchema key | 状态 |
|---|---------|--------------|-----------------|------|
| 1 | 物理层/连接 | 串口: COMx 或 /dev/ttySx | host (TCP模式用IP) | ✅ |
| 2 | 物理层/连接 | 波特率 | baudRate | ✅ |
| 3 | 物理层/连接 | 数据位 | dataBits | ✅ |
| 4 | 物理层/连接 | 停止位 | stopBits | ✅ |
| 5 | 物理层/连接 | 校验位 | parity | ✅ |
| 6 | 物理层/连接 | TCP: IP + Port (默认502) | host + port | ✅ |
| 7 | 协议角色 | 主站(Master)/从站(Slave) | role | ✅ |
| 8 | 从机地址 | Slave ID / Unit ID (1-247) | unitId | ✅ |
| 9 | 功能码支持 | 01~06, 15, 16, 43 | enabledFunctionCodes | ✅ |
| 10 | 数据映射 | 寄存器地址范围 (0x0000~0xFFFF) | scanRegisters/scanInputRegisters/scanCoils/scanDiscreteInputs | ✅ |
| 11 | 数据映射 | 数据类型 (int16/uint32/float等) | registerDataTypes | ✅ |
| 12 | 数据映射 | 地址→变量映射表 | registerAliases | ✅ |
| 13 | 超时/重试 | 响应超时 | timeout | ✅ |
| 14 | 超时/重试 | 帧间间隔 (T3.5字符时间) | interFrameDelay | ✅ |
| 15 | 超时/重试 | 重试次数 | retries | ✅ |
| 16 | 传输类型 | RTU/ASCII/TCP/Plus | transportType | ✅ |
| 17 | 高级 | 网关模式 (TCP↔RTU桥接) | gatewayMode + gatewayUpstreamType | ✅ |
| 18 | 高级 | 诊断功能码 | enableDiagnostics | ✅ |
| 19 | 高级 | 字节序/交换 | swapBytes + swapWords + dataEncoding | ✅ |
| 20 | 高级 | 写操作控制 | enableWriteOperations | ✅ |
| 21 | 高级 | 轮询间隔 | pollInterval | ✅ |
| 22 | 高级 | 站间延迟 | interPollDelay | ✅ |
| 23 | 高级 | 单次最大读取量 | maxReadRegisters + maxReadCoils | ✅ |
| 24 | 物理层 | 串口设备路径 (/dev/ttySx) | ❌ 缺失 | ❌ |
| 25 | 高级 | 重试延迟 | retryDelay | ✅ |

**缺失项**: 
- ❌ `serialPort`: 串口设备路径（RTU/ASCII 模式下必须，如 /dev/ttyS0, /dev/ttyUSB0, COM1）

---

## 待审计: OPC UA, MQTT, EtherNet/IP, PROFINET, EtherCAT, HTTP, gRPC, WebSocket, Kafka, 数据库类
