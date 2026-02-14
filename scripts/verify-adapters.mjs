/**
 * 验证所有协议适配器的 configSchema 是否正确
 * 运行: npx tsx scripts/verify-adapters.mjs
 */
import { protocolAdapters, getRegisteredProtocols } from '../server/services/protocol-adapters/index.ts';

const protocols = getRegisteredProtocols();
console.log(`\n=== 已注册协议数量: ${protocols.length} ===\n`);

let errors = 0;
for (const p of protocols) {
  const adapter = protocolAdapters[p];
  if (!adapter) {
    console.log(`❌ ${p}: 适配器未找到`);
    errors++;
    continue;
  }
  const schema = adapter.configSchema;
  if (!schema) {
    console.log(`❌ ${p}: configSchema 为空`);
    errors++;
    continue;
  }
  const connFields = schema.connectionFields?.length || 0;
  const authFields = schema.authFields?.length || 0;
  const advFields = schema.advancedFields?.length || 0;
  console.log(`✅ ${p.padEnd(12)} | label: ${schema.label.padEnd(16)} | conn: ${connFields} | auth: ${authFields} | adv: ${advFields}`);
}

console.log(`\n=== 总计: ${protocols.length} 个协议, ${errors} 个错误 ===\n`);
