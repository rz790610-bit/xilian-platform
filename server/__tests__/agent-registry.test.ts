/**
 * AgentRegistry 完整测试套件
 * 
 * 整改方案 v2.1 · P1-2 · 测试真正的 AgentRegistry 实现类
 * 
 * 覆盖范围：
 * - 注册与发现（按 loopStage/adapter/tag/capability）
 * - 一次性调用（成功/失败/超时/并发控制）
 * - 流式调用（原生流/降级流/错误处理）
 * - 健康检查（全量/默认/失败）
 * - 运行时统计
 * - 事件系统
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry, type AgentManifest, type AgentContext, type AgentResult, type StreamChunk } from '../core/agent-registry';

// ============================================================================
// 测试用 Agent 工厂
// ============================================================================

function createTestContext(overrides?: Partial<AgentContext>): AgentContext {
  return {
    sessionId: 'test-session-001',
    machineId: 'machine-001',
    traceId: '00000000000000000000000000000001',
    userId: 'test-user',
    ...overrides,
  };
}

function createDiagnosticAgent(overrides?: Partial<AgentManifest>): AgentManifest {
  return {
    id: 'diagnostic-agent',
    name: '设备诊断 Agent',
    description: '测试用诊断 Agent',
    version: '1.0.0',
    loopStage: 'diagnosis',
    sdkAdapter: 'custom',
    tags: ['grok', 'diagnosis', 'device'],
    capabilities: ['multi-turn', 'tool-calling'],
    tools: ['query_sensor_realtime', 'query_clickhouse_analytics'],
    maxConcurrency: 3,
    timeoutMs: 5000,
    invoke: async (input: unknown, ctx: AgentContext): Promise<AgentResult> => {
      return {
        agentId: 'diagnostic-agent',
        success: true,
        output: { diagnosis: '轴承磨损', confidence: 0.92 },
        toolCalls: [
          { tool: 'query_sensor_realtime', input: { deviceCode: 'D001' }, output: { temperature: 85 }, durationMs: 120 },
        ],
        durationMs: 500,
        tokenUsage: { prompt: 200, completion: 150, total: 350 },
      };
    },
    ...overrides,
  };
}

function createPlatformAgent(overrides?: Partial<AgentManifest>): AgentManifest {
  return {
    id: 'platform-agent',
    name: '平台自诊断 Agent',
    description: '测试用平台 Agent',
    version: '3.1.0',
    loopStage: 'utility',
    sdkAdapter: 'custom',
    tags: ['platform', 'self-diagnosis'],
    capabilities: ['self-diagnosis', 'local-fallback'],
    invoke: async (input: unknown, ctx: AgentContext): Promise<AgentResult> => {
      return {
        agentId: 'platform-agent',
        success: true,
        output: { status: 'healthy', modules: 36 },
        durationMs: 200,
      };
    },
    ...overrides,
  };
}

function createStreamingAgent(): AgentManifest {
  return {
    id: 'streaming-agent',
    name: '流式输出 Agent',
    description: '测试流式输出',
    version: '1.0.0',
    loopStage: 'diagnosis',
    sdkAdapter: 'vercel-ai',
    tags: ['streaming'],
    invoke: async (input: unknown, ctx: AgentContext): Promise<AgentResult> => {
      return { agentId: 'streaming-agent', success: true, output: 'fallback', durationMs: 100 };
    },
    invokeStream: async function* (input: unknown, ctx: AgentContext): AsyncGenerator<StreamChunk, void, unknown> {
      yield { content: '正在分析', type: 'thinking' };
      yield { content: '调用传感器查询', type: 'tool_call', toolCall: { name: 'query_sensor', arguments: { id: 'S001' } } };
      yield { content: '温度 85°C', type: 'tool_result', toolResult: { temperature: 85 } };
      yield { content: '诊断结果：轴承磨损，置信度 92%', type: 'final' };
    },
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  // ── 注册与发现 ──

  describe('注册与发现', () => {
    it('should register and retrieve an agent', () => {
      const agent = createDiagnosticAgent();
      registry.register(agent);

      const retrieved = registry.get('diagnostic-agent');
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('设备诊断 Agent');
      expect(retrieved!.loopStage).toBe('diagnosis');
      expect(retrieved!.sdkAdapter).toBe('custom');
    });

    it('should list all registered agents', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createPlatformAgent());

      const all = registry.listAll();
      expect(all).toHaveLength(2);
    });

    it('should discover agents by loopStage', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createPlatformAgent());
      registry.register(createStreamingAgent());

      const diagnosisAgents = registry.discoverByStage('diagnosis');
      expect(diagnosisAgents).toHaveLength(2);
      expect(diagnosisAgents.map(a => a.id)).toContain('diagnostic-agent');
      expect(diagnosisAgents.map(a => a.id)).toContain('streaming-agent');

      const utilityAgents = registry.discoverByStage('utility');
      expect(utilityAgents).toHaveLength(1);
      expect(utilityAgents[0].id).toBe('platform-agent');
    });

    it('should discover agents by sdkAdapter', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createStreamingAgent());

      const customAgents = registry.discoverByAdapter('custom');
      expect(customAgents).toHaveLength(1);

      const vercelAgents = registry.discoverByAdapter('vercel-ai');
      expect(vercelAgents).toHaveLength(1);
    });

    it('should discover agents by tag', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createPlatformAgent());

      const grokAgents = registry.discoverByTag('grok');
      expect(grokAgents).toHaveLength(1);
      expect(grokAgents[0].id).toBe('diagnostic-agent');
    });

    it('should discover agents by capability', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createPlatformAgent());

      const toolCallingAgents = registry.discoverByCapability('tool-calling');
      expect(toolCallingAgents).toHaveLength(1);
      expect(toolCallingAgents[0].id).toBe('diagnostic-agent');
    });

    it('should replace agent on duplicate registration', () => {
      registry.register(createDiagnosticAgent({ version: '1.0.0' }));
      registry.register(createDiagnosticAgent({ version: '2.0.0' }));

      const agent = registry.get('diagnostic-agent');
      expect(agent!.version).toBe('2.0.0');
      expect(registry.listAll()).toHaveLength(1);
    });

    it('should unregister an agent', () => {
      registry.register(createDiagnosticAgent());
      expect(registry.listAll()).toHaveLength(1);

      const result = registry.unregister('diagnostic-agent');
      expect(result).toBe(true);
      expect(registry.listAll()).toHaveLength(0);
      expect(registry.get('diagnostic-agent')).toBeUndefined();
    });

    it('should return false when unregistering non-existent agent', () => {
      const result = registry.unregister('non-existent');
      expect(result).toBe(false);
    });

    it('should throw on invalid manifest', () => {
      expect(() => {
        registry.register({ id: '', name: '', invoke: null } as any);
      }).toThrow('Invalid manifest');
    });
  });

  // ── 调用 ──

  describe('调用', () => {
    it('should invoke agent and return result', async () => {
      registry.register(createDiagnosticAgent());
      const ctx = createTestContext();

      const result = await registry.invoke('diagnostic-agent', { deviceCode: 'D001', description: '异常振动' }, ctx);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('diagnostic-agent');
      expect(result.output).toHaveProperty('diagnosis', '轴承磨损');
      expect(result.output).toHaveProperty('confidence', 0.92);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should throw when invoking non-existent agent', async () => {
      const ctx = createTestContext();
      await expect(registry.invoke('non-existent', {}, ctx)).rejects.toThrow('Agent not found');
    });

    it('should handle agent invocation failure', async () => {
      registry.register(createDiagnosticAgent({
        invoke: async () => { throw new Error('API timeout'); },
      }));
      const ctx = createTestContext();

      const result = await registry.invoke('diagnostic-agent', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
    });

    it('should enforce concurrency limit', async () => {
      let resolveFirst!: () => void;
      const blockingPromise = new Promise<void>(r => { resolveFirst = r; });

      registry.register(createDiagnosticAgent({
        maxConcurrency: 1,
        invoke: async () => {
          await blockingPromise;
          return { agentId: 'diagnostic-agent', success: true, output: 'done', durationMs: 100 };
        },
      }));

      const ctx = createTestContext();

      // 第一个调用（阻塞中）
      const first = registry.invoke('diagnostic-agent', {}, ctx);

      // 等一个 tick 让第一个调用进入
      await new Promise(r => setTimeout(r, 10));

      // 第二个调用应该被拒绝（并发限制）
      const second = await registry.invoke('diagnostic-agent', {}, ctx);
      expect(second.success).toBe(false);
      expect(second.error).toContain('Concurrency limit');

      // 释放第一个调用
      resolveFirst();
      const firstResult = await first;
      expect(firstResult.success).toBe(true);
    });

    it('should timeout on slow agent', async () => {
      registry.register(createDiagnosticAgent({
        timeoutMs: 100,
        invoke: async () => {
          await new Promise(r => setTimeout(r, 500));
          return { agentId: 'diagnostic-agent', success: true, output: 'late', durationMs: 500 };
        },
      }));

      const ctx = createTestContext();
      const result = await registry.invoke('diagnostic-agent', {}, ctx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });
  });

  // ── 流式调用 ──

  describe('流式调用', () => {
    it('should stream output from agent with invokeStream', async () => {
      registry.register(createStreamingAgent());
      const ctx = createTestContext();

      const chunks: StreamChunk[] = [];
      for await (const chunk of registry.invokeStream('streaming-agent', { deviceCode: 'D001' }, ctx)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4);
      expect(chunks[0].type).toBe('thinking');
      expect(chunks[1].type).toBe('tool_call');
      expect(chunks[1].toolCall?.name).toBe('query_sensor');
      expect(chunks[2].type).toBe('tool_result');
      expect(chunks[3].type).toBe('final');
      expect(chunks[3].content).toContain('轴承磨损');
    });

    it('should fallback to invoke when invokeStream not implemented', async () => {
      registry.register(createDiagnosticAgent());
      const ctx = createTestContext();

      const chunks: StreamChunk[] = [];
      for await (const chunk of registry.invokeStream('diagnostic-agent', {}, ctx)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('final');
    });

    it('should throw when streaming non-existent agent', async () => {
      const ctx = createTestContext();
      await expect(async () => {
        for await (const _ of registry.invokeStream('non-existent', {}, ctx)) { /* consume */ }
      }).rejects.toThrow('Agent not found');
    });

    it('should handle stream error gracefully', async () => {
      registry.register({
        ...createStreamingAgent(),
        id: 'error-stream-agent',
        invokeStream: async function* () {
          yield { content: 'start', type: 'text' as const };
          throw new Error('stream broken');
        },
      });

      const ctx = createTestContext();
      const chunks: StreamChunk[] = [];
      for await (const chunk of registry.invokeStream('error-stream-agent', {}, ctx)) {
        chunks.push(chunk);
      }

      // 应该收到 start + error final
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.type).toBe('final');
      expect(lastChunk.content).toContain('Error');
    });
  });

  // ── 健康检查 ──

  describe('健康检查', () => {
    it('should run health check on all agents', async () => {
      registry.register(createDiagnosticAgent({ healthCheck: async () => 'healthy' }));
      registry.register(createPlatformAgent({ healthCheck: async () => 'degraded' }));

      const results = await registry.healthCheckAll();
      expect(results.get('diagnostic-agent')).toBe('healthy');
      expect(results.get('platform-agent')).toBe('degraded');
    });

    it('should default to healthy when no healthCheck', async () => {
      registry.register(createDiagnosticAgent({ healthCheck: undefined }));

      const results = await registry.healthCheckAll();
      expect(results.get('diagnostic-agent')).toBe('healthy');
    });

    it('should handle healthCheck failure', async () => {
      registry.register(createDiagnosticAgent({
        healthCheck: async () => { throw new Error('check failed'); },
      }));

      const results = await registry.healthCheckAll();
      expect(results.get('diagnostic-agent')).toBe('unavailable');
    });
  });

  // ── 运行时统计 ──

  describe('运行时统计', () => {
    it('should track invocation stats', async () => {
      registry.register(createDiagnosticAgent());
      const ctx = createTestContext();

      await registry.invoke('diagnostic-agent', {}, ctx);
      await registry.invoke('diagnostic-agent', {}, ctx);

      const stats = registry.getStats('diagnostic-agent');
      expect(stats).toBeDefined();
      expect(stats!.totalInvocations).toBe(2);
      expect(stats!.failureCount).toBe(0);
      expect(stats!.lastInvokedAt).toBeInstanceOf(Date);
    });

    it('should track failure count', async () => {
      registry.register(createDiagnosticAgent({
        invoke: async () => { throw new Error('fail'); },
      }));
      const ctx = createTestContext();

      await registry.invoke('diagnostic-agent', {}, ctx);
      await registry.invoke('diagnostic-agent', {}, ctx);

      const stats = registry.getStats('diagnostic-agent');
      expect(stats!.failureCount).toBe(2);
    });

    it('should return summary', () => {
      registry.register(createDiagnosticAgent());
      registry.register(createPlatformAgent());
      registry.register(createStreamingAgent());

      const summary = registry.getSummary();
      expect(summary.totalAgents).toBe(3);
      expect(summary.byStage.diagnosis).toBe(2);
      expect(summary.byStage.utility).toBe(1);
      expect(summary.byAdapter.custom).toBe(2);
      expect(summary.byAdapter['vercel-ai']).toBe(1);
    });
  });

  // ── 事件系统 ──

  describe('事件系统', () => {
    it('should emit registered event', () => {
      const events: any[] = [];
      registry.onEvent(e => events.push(e));

      registry.register(createDiagnosticAgent());

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('registered');
      expect(events[0].agentId).toBe('diagnostic-agent');
    });

    it('should emit invoked event', async () => {
      const events: any[] = [];
      registry.register(createDiagnosticAgent());
      registry.onEvent(e => events.push(e));

      await registry.invoke('diagnostic-agent', {}, createTestContext());

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('invoked');
      expect(events[0].success).toBe(true);
    });

    it('should support unsubscribe', () => {
      const events: any[] = [];
      const unsub = registry.onEvent(e => events.push(e));

      registry.register(createDiagnosticAgent());
      expect(events).toHaveLength(1);

      unsub();
      registry.register(createPlatformAgent());
      expect(events).toHaveLength(1);
    });
  });
});
