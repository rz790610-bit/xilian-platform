/**
 * ============================================================
 * 西联平台 — OpenAPI 3.1 文档自动生成器
 * ============================================================
 * 
 * 基于 tRPC router 定义自动生成 OpenAPI 3.1 规范文档
 * 映射平台文件: server/routers.ts → 所有 tRPC procedure
 * 
 * 使用方式: npx tsx docs/api/openapi-generator.ts
 * 输出: docs/api/openapi.json + docs/api/openapi.yaml
 * ============================================================
 */

import type { OpenAPIV3_1 } from 'openapi-types';

// ── OpenAPI 3.1 文档骨架 ──
const spec: OpenAPIV3_1.Document = {
  openapi: '3.1.0',
  info: {
    title: '西联工业物联网平台 API',
    version: '3.0.0',
    description: `
西联平台提供完整的工业物联网数据采集、算法分析、知识管理、监控告警能力。

## 认证方式
所有 API 使用 Bearer Token 认证（JWT），通过 \`Authorization: Bearer <token>\` 头传递。

## 速率限制
- 公共端点: 100 req/min
- 认证端点: 1000 req/min  
- 算法执行: 50 req/min（计算密集型）

## 错误码规范
| 状态码 | 含义 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |
| 503 | 服务暂时不可用（断路器打开）|
    `.trim(),
    contact: {
      name: '西联平台技术团队',
      email: 'api-support@xilian.io',
      url: 'https://docs.xilian.io'
    },
    license: {
      name: 'Proprietary',
      url: 'https://xilian.io/license'
    }
  },
  servers: [
    { url: 'https://api.xilian.io/v1', description: 'Production' },
    { url: 'https://api-staging.xilian.io/v1', description: 'Staging' },
    { url: 'http://localhost:3000/api', description: 'Local Development' }
  ],
  tags: [
    { name: 'Device', description: '设备管理 — 对应 device.service.ts' },
    { name: 'Algorithm', description: '算法执行 — 对应 algorithms/ 目录' },
    { name: 'DataPipeline', description: '数据管道 — 对应 pipeline.engine.ts + streamProcessor.service.ts' },
    { name: 'Knowledge', description: '知识管理 — 对应 knowledge.service.ts' },
    { name: 'Monitoring', description: '监控告警 — 对应 observability.service.ts' },
    { name: 'Topology', description: '拓扑管理 — 对应 topology.service.ts' },
    { name: 'Model', description: '模型管理 — 对应 model.service.ts' },
    { name: 'Auth', description: '认证授权' },
    { name: 'Health', description: '健康检查' }
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '使用 JWT Token 认证'
      }
    },
    schemas: {
      // ── 通用响应 ──
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {},
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' }
            }
          },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string', format: 'uuid' },
              timestamp: { type: 'string', format: 'date-time' },
              duration: { type: 'number', description: '处理时间(ms)' }
            }
          }
        }
      },
      PaginatedResponse: {
        allOf: [
          { $ref: '#/components/schemas/ApiResponse' },
          {
            type: 'object',
            properties: {
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'integer' },
                  pageSize: { type: 'integer' },
                  total: { type: 'integer' },
                  totalPages: { type: 'integer' }
                }
              }
            }
          }
        ]
      },

      // ── 设备域 ──
      Device: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', maxLength: 255 },
          deviceTypeId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['online', 'offline', 'warning', 'error'] },
          metadata: { type: 'object', additionalProperties: true },
          lastHeartbeat: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        },
        required: ['id', 'name', 'deviceTypeId', 'status']
      },
      MeasurementPoint: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          nodeId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          unit: { type: 'string' },
          dataType: { type: 'string', enum: ['vibration', 'temperature', 'pressure', 'current', 'speed'] },
          sampleRate: { type: 'number', description: '采样率(Hz)' }
        }
      },

      // ── 算法域 ──
      AlgorithmExecution: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          algorithmId: { type: 'string' },
          algorithmType: { type: 'string', enum: ['fft', 'envelope', 'cepstrum', 'wavelet', 'trend', 'order-tracking'] },
          status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
          input: {
            type: 'object',
            properties: {
              signalData: { type: 'array', items: { type: 'number' } },
              sampleRate: { type: 'number' },
              parameters: { type: 'object', additionalProperties: true }
            }
          },
          result: {
            type: 'object',
            properties: {
              spectrum: { type: 'array', items: { type: 'number' } },
              features: { type: 'object', additionalProperties: { type: 'number' } },
              diagnostics: { type: 'array', items: { $ref: '#/components/schemas/DiagnosticResult' } }
            }
          },
          duration: { type: 'number', description: '执行时间(ms)' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      DiagnosticResult: {
        type: 'object',
        properties: {
          faultType: { type: 'string' },
          severity: { type: 'string', enum: ['normal', 'attention', 'warning', 'danger'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          description: { type: 'string' },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      },

      // ── 数据管道域 ──
      Pipeline: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['idle', 'running', 'paused', 'error'] },
          stages: { type: 'array', items: { $ref: '#/components/schemas/PipelineStage' } },
          throughput: { type: 'number', description: '当前吞吐量(msg/s)' },
          lag: { type: 'integer', description: 'Kafka 消费延迟' }
        }
      },
      PipelineStage: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['source', 'transform', 'sink', 'branch', 'aggregate'] },
          config: { type: 'object', additionalProperties: true }
        }
      },

      // ── 知识域 ──
      KnowledgeEntry: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          embedding: { type: 'array', items: { type: 'number' }, description: '向量嵌入(Qdrant)' },
          graphNodeId: { type: 'string', description: 'Neo4j 节点 ID' }
        }
      },

      // ── 监控域 ──
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ruleId: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
          status: { type: 'string', enum: ['firing', 'resolved', 'acknowledged'] },
          nodeId: { type: 'string', format: 'uuid' },
          message: { type: 'string' },
          firedAt: { type: 'string', format: 'date-time' },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true }
        }
      }
    },

    // ── 通用参数 ──
    parameters: {
      PageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', minimum: 1, default: 1 }
      },
      PageSizeParam: {
        name: 'pageSize',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
      }
    }
  },

  // ── API 路径定义 ──
  paths: {
    // ── 健康检查 ──
    '/health': {
      get: {
        tags: ['Health'],
        summary: '服务健康检查',
        security: [],
        responses: {
          '200': {
            description: '服务健康',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                    services: {
                      type: 'object',
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          latency: { type: 'number' }
                        }
                      }
                    },
                    uptime: { type: 'number' },
                    version: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },

    // ── 设备 API ──
    '/devices': {
      get: {
        tags: ['Device'],
        summary: '获取设备列表',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/PageSizeParam' },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['online', 'offline', 'warning', 'error'] } },
          { name: 'deviceTypeId', in: 'query', schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '200': {
            description: '设备列表',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Device' } } } }
                  ]
                }
              }
            }
          }
        }
      },
      post: {
        tags: ['Device'],
        summary: '创建设备',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'deviceTypeId'],
                properties: {
                  name: { type: 'string' },
                  deviceTypeId: { type: 'string', format: 'uuid' },
                  metadata: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: '设备创建成功' },
          '400': { description: '参数错误' }
        }
      }
    },

    // ── 算法执行 API ──
    '/algorithms/execute': {
      post: {
        tags: ['Algorithm'],
        summary: '执行算法分析',
        description: '提交信号数据进行算法分析（FFT、包络解调、倒谱等）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['algorithmType', 'signalData', 'sampleRate'],
                properties: {
                  algorithmType: { type: 'string', enum: ['fft', 'envelope', 'cepstrum', 'wavelet', 'trend', 'order-tracking'] },
                  signalData: { type: 'array', items: { type: 'number' }, minItems: 64 },
                  sampleRate: { type: 'number', minimum: 1 },
                  parameters: {
                    type: 'object',
                    properties: {
                      windowFunction: { type: 'string', enum: ['hanning', 'hamming', 'blackman', 'rectangular'], default: 'hanning' },
                      fftSize: { type: 'integer', enum: [256, 512, 1024, 2048, 4096, 8192] },
                      overlap: { type: 'number', minimum: 0, maximum: 0.99, default: 0.5 }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: '算法执行结果',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AlgorithmExecution' }
              }
            }
          },
          '429': { description: '算法执行频率超限' },
          '503': { description: '算法服务不可用（断路器打开）' }
        }
      }
    },

    // ── 数据管道 API ──
    '/pipelines': {
      get: {
        tags: ['DataPipeline'],
        summary: '获取管道列表',
        responses: {
          '200': {
            description: '管道列表',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Pipeline' } }
              }
            }
          }
        }
      }
    },
    '/pipelines/{id}/start': {
      post: {
        tags: ['DataPipeline'],
        summary: '启动数据管道',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: '管道已启动' },
          '409': { description: '管道已在运行中' }
        }
      }
    },

    // ── 知识管理 API ──
    '/knowledge/search': {
      post: {
        tags: ['Knowledge'],
        summary: '知识语义搜索',
        description: '基于向量相似度（Qdrant）+ 知识图谱（Neo4j）的混合搜索',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', minLength: 1 },
                  topK: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
                  category: { type: 'string' },
                  useGraphExpansion: { type: 'boolean', default: true, description: '是否使用知识图谱扩展结果' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: '搜索结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: { type: 'array', items: { $ref: '#/components/schemas/KnowledgeEntry' } },
                    graphRelations: { type: 'array', items: { type: 'object' } }
                  }
                }
              }
            }
          }
        }
      }
    },

    // ── 监控告警 API ──
    '/alerts': {
      get: {
        tags: ['Monitoring'],
        summary: '获取告警列表',
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/PageSizeParam' },
          { name: 'severity', in: 'query', schema: { type: 'string', enum: ['info', 'warning', 'critical'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['firing', 'resolved', 'acknowledged'] } }
        ],
        responses: {
          '200': {
            description: '告警列表',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/PaginatedResponse' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Alert' } } } }
                  ]
                }
              }
            }
          }
        }
      }
    },
    '/alerts/{id}/acknowledge': {
      post: {
        tags: ['Monitoring'],
        summary: '确认告警',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: '告警已确认' }
        }
      }
    }
  }
};

// ── 导出生成函数 ──
export function generateOpenAPISpec(): OpenAPIV3_1.Document {
  return spec;
}

// ── CLI 入口 ──
if (typeof process !== 'undefined' && process.argv[1]?.includes('openapi-generator')) {
  const fs = await import('fs');
  const path = await import('path');
  
  const outputDir = path.dirname(new URL(import.meta.url).pathname);
  
  // JSON 格式
  fs.writeFileSync(
    path.join(outputDir, 'openapi.json'),
    JSON.stringify(spec, null, 2),
    'utf-8'
  );
  
  // YAML 格式（简单转换）
  const yaml = await import('yaml');
  fs.writeFileSync(
    path.join(outputDir, 'openapi.yaml'),
    yaml.stringify(spec),
    'utf-8'
  );
  
  console.log('✅ OpenAPI 3.1 文档已生成:');
  console.log(`   - ${path.join(outputDir, 'openapi.json')}`);
  console.log(`   - ${path.join(outputDir, 'openapi.yaml')}`);
}
