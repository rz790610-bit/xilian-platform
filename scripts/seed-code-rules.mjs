/**
 * 编码规则种子数据
 * 按照《设备管控系统设备分类标准与编码》文档预置编码规则
 * 
 * 运行方式:
 *   生成SQL:  node scripts/seed-code-rules.mjs
 *   写入API:  node scripts/seed-code-rules.mjs --api http://localhost:3000
 * 
 * 这些规则会被 generateCode 引擎解析执行
 */

const CODE_RULES = [
  {
    ruleCode: 'DEVICE_CODE',
    name: '设备主体编码',
    description: '格式: {一级}{二级}-{三级}{流水号}，如 Mgj-XC001。一级=设备大类(M/A/F/W)，二级=中类(gj/lj/lc)，三级=小类(XC/MJ/ZC)，流水号3位',
    segments: [
      { type: 'custom_input', key: 'level1', label: '一级代码(设备大类)', dictCategory: 'DEVICE_L1' },
      { type: 'custom_input', key: 'level2', label: '二级代码(设备中类)', dictCategory: 'DEVICE_L2' },
      { type: 'separator', value: '-' },
      { type: 'custom_input', key: 'level3', label: '三级代码(设备小类)', dictCategory: 'DEVICE_L3' },
      { type: 'sequence', length: 3, start: 1, sequenceScope: ['level1', 'level2', 'level3'] },
    ],
  },
  {
    ruleCode: 'MECHANISM_CODE',
    name: '附属设备/机构编码',
    description: '格式: {设备编码}{五级}{六级}{七级}{流水号}，如 Mgj-XC001j010101。五级=分类(j/s/f/d)，六级=大类(2位)，七级=小类(2位)，流水号2位',
    segments: [
      { type: 'device_ref' },
      { type: 'custom_input', key: 'level5', label: '五级代码(分类)', dictCategory: 'DEVICE_L5' },
      { type: 'custom_input', key: 'level6', label: '六级代码(大类)', inputType: 'text', maxLength: 2, padStart: 2, padChar: '0' },
      { type: 'custom_input', key: 'level7', label: '七级代码(小类)', inputType: 'text', maxLength: 2, padStart: 2, padChar: '0' },
      { type: 'sequence', length: 2, start: 1, sequenceScope: ['deviceRef', 'level5', 'level6', 'level7'] },
    ],
  },
  {
    ruleCode: 'COMPONENT_CODE',
    name: '部件编码',
    description: '格式: {机构编码}-C{流水号}，如 Mgj-XC001j010101-C01。基于上级机构编码追加 -C + 2位流水号',
    segments: [
      { type: 'node_ref' },
      { type: 'separator', value: '-C' },
      { type: 'sequence', length: 2, start: 1, sequenceScope: ['nodeRef'] },
    ],
  },
  {
    ruleCode: 'PART_L4_CODE',
    name: '组件编码(L4)',
    description: '格式: {上级编码}-A{流水号}，如 Mgj-XC001j010101-C01-A01。基于上级部件编码追加 -A + 2位流水号',
    segments: [
      { type: 'node_ref' },
      { type: 'separator', value: '-A' },
      { type: 'sequence', length: 2, start: 1, sequenceScope: ['nodeRef'] },
    ],
  },
  {
    ruleCode: 'PART_L5_CODE',
    name: '零件编码(L5)',
    description: '格式: {上级编码}-P{流水号}，如 Mgj-XC001j010101-C01-A01-P01。基于上级组件编码追加 -P + 2位流水号',
    segments: [
      { type: 'node_ref' },
      { type: 'separator', value: '-P' },
      { type: 'sequence', length: 2, start: 1, sequenceScope: ['nodeRef'] },
    ],
  },
  {
    ruleCode: 'DEPT_CODE',
    name: '部门编码',
    description: '格式: {地区3位}{行业1位}{集团2位}{分公司2位}{设备队2位}，如 633G011104。共10位，各段从字典读取',
    segments: [
      { type: 'custom_input', key: 'region', label: '地区代码(3位)', dictCategory: 'DEPT_REGION', padStart: 3, padChar: '0' },
      { type: 'custom_input', key: 'industry', label: '行业代码(1位)', dictCategory: 'DEPT_INDUSTRY' },
      { type: 'custom_input', key: 'group', label: '企业集团(2位)', dictCategory: 'DEPT_GROUP', padStart: 2, padChar: '0' },
      { type: 'custom_input', key: 'branch', label: '分公司(2位)', dictCategory: 'DEPT_BRANCH', padStart: 2, padChar: '0' },
      { type: 'custom_input', key: 'team', label: '设备队(2位)', dictCategory: 'DEPT_TEAM', padStart: 2, padChar: '0' },
    ],
  },
];

// ============ 输出 SQL INSERT 语句 ============
console.log('-- ============================================');
console.log('-- 设备编码规则种子数据 (base_code_rules)');
console.log('-- 按照《设备管控系统设备分类标准与编码》文档生成');
console.log('-- 运行: mysql -u portai -p portai_nexus < seed-code-rules.sql');
console.log('-- ============================================');
console.log('');

const sqlLines = [];
for (const rule of CODE_RULES) {
  const segmentsJson = JSON.stringify(rule.segments).replace(/'/g, "\\'");
  const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
  const sql = `INSERT INTO base_code_rules (rule_code, name, segments, current_sequences, description, is_active, version, created_by, created_at, updated_by, updated_at, is_deleted)
VALUES ('${rule.ruleCode}', '${rule.name}', '${segmentsJson}', '{}', '${rule.description}', 1, 1, 'system', '${now}', 'system', '${now}', 0)
ON DUPLICATE KEY UPDATE segments = VALUES(segments), name = VALUES(name), description = VALUES(description), updated_at = VALUES(updated_at);`;
  console.log(sql);
  console.log('');
  sqlLines.push(sql);
}

console.log(`-- 完成！共 ${CODE_RULES.length} 条编码规则`);

// 导出 JSON 和 SQL 文件
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(__dirname, 'code-rules-seed.json'), JSON.stringify(CODE_RULES, null, 2));
writeFileSync(join(__dirname, 'seed-code-rules.sql'), sqlLines.join('\n\n') + '\n');
console.log('\n✅ JSON 已保存到 scripts/code-rules-seed.json');
console.log('✅ SQL  已保存到 scripts/seed-code-rules.sql');

// ============ API 模式：通过 tRPC 批量创建 ============
const apiArg = process.argv.find(a => a === '--api');
const apiUrl = process.argv[process.argv.indexOf('--api') + 1] || 'http://localhost:3000';

if (apiArg) {
  console.log(`\n🔗 通过 API 写入编码规则到 ${apiUrl}...`);
  for (const rule of CODE_RULES) {
    try {
      const resp = await fetch(`${apiUrl}/api/trpc/database.config.createCodeRule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { ruleCode: rule.ruleCode, name: rule.name, segments: rule.segments, description: rule.description } }),
      });
      const data = await resp.json();
      if (resp.ok) {
        console.log(`  ✅ ${rule.ruleCode}: ${rule.name}`);
      } else {
        // 可能已存在，尝试更新
        const resp2 = await fetch(`${apiUrl}/api/trpc/database.config.updateCodeRule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ json: { ruleCode: rule.ruleCode, name: rule.name, segments: rule.segments, description: rule.description } }),
        });
        if (resp2.ok) {
          console.log(`  🔄 ${rule.ruleCode}: 已更新`);
        } else {
          console.log(`  ⚠️ ${rule.ruleCode}: ${JSON.stringify(data)}`);
        }
      }
    } catch (err) {
      console.log(`  ❌ ${rule.ruleCode}: ${err.message}`);
    }
  }
  console.log('\n✅ API 写入完成');
}
