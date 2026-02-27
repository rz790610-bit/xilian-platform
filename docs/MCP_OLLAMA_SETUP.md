# Ollama MCP 配置指南

> 将本地 Ollama llama3.1:70b 模型接入 Claude Code

## 一、架构说明

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code                                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    MCP Client                                │   │
│  │  调用 MCP 工具时，数据发送到本地 MCP Server                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
└──────────────────────────────│──────────────────────────────────────┘
                               │ stdio (本地进程通信)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Ollama MCP Server                                 │
│                  (mcp-servers/ollama-server.ts)                      │
│                                                                     │
│  提供 5 个本地分析工具：                                             │
│  • analyze_sensor_data  - 传感器数据分析                            │
│  • diagnose_equipment   - 设备故障诊断                              │
│  • explain_physics      - 物理机理解释                              │
│  • generate_report      - 诊断报告生成                              │
│  • local_chat           - 本地对话                                  │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP (localhost:11434)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Ollama 服务                                     │
│                                                                     │
│  模型: llama3.1:70b (42GB)                                          │
│  端口: 11434                                                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  设备数据完全在本地处理，不发送到任何外部 API                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## 二、配置文件说明

### 2.1 MCP 配置文件 (.mcp.json)

**位置**: 项目根目录 `.mcp.json`

```json
{
  "mcpServers": {
    "ollama-local": {
      "command": "npx",
      "args": ["tsx", "mcp-servers/ollama-server.ts"],
      "env": {
        "OLLAMA_BASE_URL": "http://localhost:11434",
        "OLLAMA_MODEL": "llama3.1:70b",
        "OLLAMA_TIMEOUT": "300000"
      }
    }
  }
}
```

**配置项说明**:

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `OLLAMA_BASE_URL` | Ollama 服务地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | 使用的模型 | `llama3.1:70b` |
| `OLLAMA_TIMEOUT` | 请求超时（毫秒） | `300000` (5分钟) |

### 2.2 MCP Server 实现

**位置**: `mcp-servers/ollama-server.ts`

**依赖**: `@modelcontextprotocol/sdk` (已安装)

## 三、启动步骤

### Step 1: 启动 Ollama 服务

```bash
# 确保 Ollama 正在运行
ollama serve

# 验证服务状态
curl http://localhost:11434/api/tags
```

### Step 2: 验证模型可用

```bash
# 确认 llama3.1:70b 已下载
ollama list

# 测试模型响应
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.1:70b", "prompt": "Hello", "stream": false}'
```

### Step 3: 启动 Claude Code

```bash
# 在项目目录启动
cd /Users/mac-cj/manus/xilian-platform-app
claude

# Claude Code 会自动加载 .mcp.json 配置
```

### Step 4: 验证 MCP 连接

在 Claude Code 中输入:
```
/mcp
```

应该看到 `ollama-local` 服务器及其 5 个工具。

## 四、可用工具

### 4.1 analyze_sensor_data (传感器数据分析)

**功能**: 分析传感器时序数据，检测异常、识别趋势

**参数**:
- `data` (必填): 传感器数据（JSON 或文本）
- `analysis_type`: 分析类型
  - `anomaly_detection` - 异常检测
  - `trend_analysis` - 趋势分析
  - `pattern_recognition` - 模式识别
  - `root_cause` - 根因分析
  - `general` - 综合分析
- `device_type`: 设备类型
- `context`: 额外上下文

**示例调用**:
```
请使用本地 Ollama 分析以下岸桥振动数据：
{
  "device": "STS-001",
  "metric": "vibration_rms",
  "values": [2.1, 2.3, 2.2, 5.8, 6.2, 2.4, 2.1]
}
```

### 4.2 diagnose_equipment (设备诊断)

**功能**: 基于症状和传感器数据进行故障诊断

**参数**:
- `device_id` (必填): 设备编号
- `symptoms` (必填): 故障症状描述
- `sensor_readings`: 传感器读数
- `maintenance_history`: 维护历史

**示例调用**:
```
请诊断设备 STS-003，症状：主小车运行时有异响，振动明显增大。
传感器显示主轴承温度从45°C升至62°C。
```

### 4.3 explain_physics (物理机理解释)

**功能**: 解答港机设备相关的物理原理问题

**参数**:
- `question` (必填): 物理问题
- `equipment_context`: 设备背景

**示例调用**:
```
请解释轴承磨损如何导致振动频谱变化？
```

### 4.4 generate_report (生成报告)

**功能**: 将诊断结果转化为不同受众的报告

**参数**:
- `diagnosis_result` (必填): 诊断结果
- `report_type`: 报告类型
  - `summary` - 简明摘要
  - `detailed` - 详细报告
  - `maintenance_order` - 维护工单
- `audience`: 目标受众
  - `operator` - 操作员
  - `engineer` - 工程师
  - `manager` - 管理者

### 4.5 local_chat (本地对话)

**功能**: 通用本地 LLM 对话

**参数**:
- `message` (必填): 对话消息
- `system_prompt`: 系统提示词
- `temperature`: 温度参数 (0-1)

## 五、使用场景

### 场景 1: 敏感设备数据分析

当需要分析包含敏感信息的设备数据时，使用本地模型确保数据不外泄。

```
请使用本地 Ollama 分析这批设备运行数据，
数据包含我们的生产工艺参数，不能发送到外部服务器。

[粘贴数据]
```

### 场景 2: 离线环境诊断

VPN 断开或无外网时，仍可使用本地模型进行诊断。

```
当前处于离线模式，请使用本地模型诊断：
设备 RTG-007 起升机构出现过载保护频繁触发。
```

### 场景 3: 批量数据处理

大批量数据处理时使用本地模型，节省 API 成本。

```
请使用本地 Ollama 批量分析这 50 台设备的振动数据，
识别需要关注的设备。
```

## 六、性能调优

### 6.1 模型选择

根据任务复杂度选择模型:

| 任务类型 | 推荐模型 | 响应速度 |
|---------|---------|---------|
| 复杂诊断 | llama3.1:70b | 慢 (30-60s) |
| 简单分析 | qwen2.5:7b | 中 (5-15s) |
| 快速问答 | qwen2.5:3b | 快 (1-5s) |

修改 `.mcp.json` 中的 `OLLAMA_MODEL` 环境变量。

### 6.2 超时设置

大模型响应较慢，默认 5 分钟超时。可根据需要调整:

```json
"env": {
  "OLLAMA_TIMEOUT": "600000"  // 10 分钟
}
```

### 6.3 GPU 加速

确保 Ollama 使用 GPU:

```bash
# 检查 GPU 状态
ollama ps

# 如果显示 CPU，检查 CUDA/Metal 配置
```

## 七、故障排查

### 问题 1: MCP Server 未启动

```bash
# 手动测试 MCP Server
npx tsx mcp-servers/ollama-server.ts

# 应该看到:
# Ollama MCP Server started
# Model: llama3.1:70b
# Ollama URL: http://localhost:11434
```

### 问题 2: Ollama 连接失败

```bash
# 检查 Ollama 服务
curl http://localhost:11434/api/tags

# 如果失败，重启 Ollama
ollama serve
```

### 问题 3: 模型响应超时

```bash
# 1. 使用较小模型测试
OLLAMA_MODEL=qwen2.5:7b npx tsx mcp-servers/ollama-server.ts

# 2. 增加超时时间
OLLAMA_TIMEOUT=600000 npx tsx mcp-servers/ollama-server.ts

# 3. 检查系统资源
top -l 1 | head -10
```

### 问题 4: Claude Code 未识别 MCP

```bash
# 检查 .mcp.json 语法
cat .mcp.json | jq .

# 重启 Claude Code
claude

# 查看 MCP 状态
# 在 Claude Code 中输入: /mcp
```

## 八、安全说明

### 数据隔离

- 所有通过 MCP 工具处理的数据仅在本地流转
- 数据路径: Claude Code → MCP Server → Ollama → 本地 GPU/CPU
- 不经过任何外部网络

### 日志位置

```bash
# Ollama 日志
~/.ollama/logs/

# MCP Server 日志 (stderr)
# 在 Claude Code 终端可见
```

## 九、扩展开发

### 添加新工具

在 `mcp-servers/ollama-server.ts` 的 `TOOLS` 数组中添加:

```typescript
{
  name: 'my_new_tool',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      // 参数定义
    },
    required: ['必填参数'],
  },
}
```

然后在 `handleTool` 函数中添加处理逻辑。

### 切换到其他模型

修改 `.mcp.json`:

```json
"env": {
  "OLLAMA_MODEL": "qwen2.5:7b"
}
```

---

## 快速验证

启动后，在 Claude Code 中输入以下命令测试:

```
请使用本地 Ollama 模型，分析这组振动数据是否正常：
[2.1, 2.3, 2.2, 2.4, 2.3, 8.5, 9.2, 2.1, 2.0]
```

如果 Ollama 正确响应，说明配置成功。
