/**
 * ONNX Runtime 端到端推理验证脚本
 * 验证 onnxruntime-node 能否加载占位 ONNX 模型并执行推理
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function verify() {
  console.log('=== ONNX Runtime 端到端推理验证 ===\n');

  // 1. 加载 onnxruntime-node
  let ort;
  try {
    ort = require('onnxruntime-node');
    console.log('✅ onnxruntime-node 加载成功');
    console.log('   导出 API:', Object.keys(ort).join(', '));
  } catch (e) {
    console.error('❌ onnxruntime-node 加载失败:', e.message);
    process.exit(1);
  }

  // 2. 加载 ONNX 模型
  const modelPath = resolve(__dirname, '../server/platform/evolution/models/world-model-lstm.onnx');
  console.log(`\n📦 模型路径: ${modelPath}`);

  let session;
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
    });
    console.log('✅ ONNX 模型加载成功');
    console.log('   输入节点:', session.inputNames);
    console.log('   输出节点:', session.outputNames);
  } catch (e) {
    console.error('❌ ONNX 模型加载失败:', e.message);
    process.exit(1);
  }

  // 3. 构造输入张量并执行推理
  try {
    // 根据模型输入形状构造数据
    // 占位模型: input shape [1, 60, 32] (batch=1, seq_len=60, feature_dim=32)
    const seqLen = 60;
    const featureDim = 32;
    const inputData = new Float32Array(1 * seqLen * featureDim);
    for (let i = 0; i < inputData.length; i++) {
      inputData[i] = Math.random() * 2 - 1; // [-1, 1] 随机值
    }

    const inputTensor = new ort.Tensor('float32', inputData, [1, seqLen, featureDim]);
    console.log(`\n🔢 输入张量: shape=[1, ${seqLen}, ${featureDim}], dtype=float32`);

    const feeds = {};
    feeds[session.inputNames[0]] = inputTensor;

    const startTime = Date.now();
    const results = await session.run(feeds);
    const latencyMs = Date.now() - startTime;

    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];
    console.log(`✅ 推理成功 (${latencyMs}ms)`);
    console.log(`   输出节点: ${outputName}`);
    console.log(`   输出形状: [${outputTensor.dims}]`);
    console.log(`   输出类型: ${outputTensor.type}`);
    console.log(`   输出样本 (前 8 值): [${Array.from(outputTensor.data).slice(0, 8).map(v => v.toFixed(6)).join(', ')}]`);

    // 4. 性能基准测试 (10 次推理)
    console.log('\n⏱️  性能基准 (10 次推理):');
    const latencies = [];
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      await session.run(feeds);
      latencies.push(Date.now() - t0);
    }
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    console.log(`   平均: ${avg.toFixed(1)}ms, 最小: ${min}ms, 最大: ${max}ms`);

    console.log('\n✅✅✅ ONNX Runtime 端到端验证全部通过 ✅✅✅');
  } catch (e) {
    console.error('❌ 推理执行失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

verify().catch(e => {
  console.error('验证脚本异常:', e);
  process.exit(1);
});
