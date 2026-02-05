#!/usr/bin/env node
/**
 * 自动修复前端组件中的空值安全问题
 * 
 * 修复模式：
 * 1. data.map() -> (data || []).map()
 * 2. data.filter() -> (data || []).filter()
 * 3. data.forEach() -> (data || []).forEach()
 * 4. data.find() -> (data || []).find()
 * 5. data.some() -> (data || []).some()
 * 6. data.every() -> (data || []).every()
 * 7. data.reduce() -> (data || []).reduce()
 */

const fs = require('fs');
const path = require('path');

// 需要修复的文件列表
const filesToFix = [
  'client/src/pages/AIChat.tsx',
  'client/src/pages/VectorAdmin.tsx',
  'client/src/pages/KnowledgeManager.tsx',
  'client/src/pages/Settings.tsx',
  'client/src/pages/Agents.tsx',
  'client/src/pages/SystemTopology.tsx',
  'client/src/pages/DataStandard.tsx',
  'client/src/pages/DataLabel.tsx',
  'client/src/pages/DataAccess.tsx',
  'client/src/pages/Pipeline.tsx',
  'client/src/pages/ComponentShowcase.tsx',
  'client/src/pages/BaseLibrary.tsx',
  'client/src/pages/ModelRepo.tsx',
  'client/src/pages/ModelCenter.tsx',
  'client/src/pages/KnowledgeBase.tsx',
  'client/src/pages/DataInsight.tsx',
  'client/src/pages/BaseRules.tsx',
  'client/src/pages/security/SecurityScanner.tsx',
  'client/src/pages/device/DeviceList.tsx',
  'client/src/pages/ModelInference.tsx',
  'client/src/pages/KnowledgeGraph.tsx',
  'client/src/pages/DataStream.tsx',
  'client/src/pages/settings/SmartMonitoring.tsx',
  'client/src/pages/security/FalcoMonitor.tsx',
  'client/src/pages/Observability.tsx',
  'client/src/pages/KafkaMonitor.tsx',
  'client/src/pages/Infrastructure.tsx',
  'client/src/pages/DataManage.tsx',
  'client/src/pages/services/ServiceMonitor.tsx',
  'client/src/pages/edge/EdgeNodes.tsx',
  'client/src/pages/Documents.tsx',
  'client/src/pages/Dashboard.tsx',
  'client/src/pages/OpsDashboard.tsx',
];

// 数组方法列表
const arrayMethods = ['map', 'filter', 'forEach', 'find', 'some', 'every', 'reduce', 'slice', 'sort', 'reverse', 'concat', 'flat', 'flatMap'];

// 已经安全的模式（不需要修复）
const safePatterns = [
  /\|\|\s*\[\]/,           // || []
  /\?\?\s*\[\]/,           // ?? []
  /\?\./,                   // ?.
  /Array\.isArray/,         // Array.isArray
  /Object\.entries/,        // Object.entries (返回数组)
  /Object\.keys/,           // Object.keys (返回数组)
  /Object\.values/,         // Object.values (返回数组)
  /\.split\(/,              // .split() (返回数组)
  /\[\s*\]/,                // [] 字面量
  /new Array/,              // new Array
];

// 检查一行是否已经安全
function isSafe(line) {
  return safePatterns.some(pattern => pattern.test(line));
}

// 修复单个文件
function fixFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`[跳过] 文件不存在: ${filePath}`);
    return { fixed: 0, skipped: 0 };
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  let lines = content.split('\n');
  let fixCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 检查每个数组方法
    for (const method of arrayMethods) {
      const regex = new RegExp(`(\\w+(?:\\.\\w+)*)\\.(${method})\\(`, 'g');
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        const varName = match[1];
        const methodName = match[2];
        const fullMatch = match[0];
        
        // 跳过已经安全的模式
        if (isSafe(line)) {
          skipCount++;
          continue;
        }
        
        // 跳过链式调用中间的方法（如 arr.filter().map()）
        if (varName.includes(')')) {
          continue;
        }
        
        // 跳过 Object 方法
        if (varName === 'Object' || varName === 'Array' || varName === 'String' || varName === 'JSON') {
          continue;
        }
        
        // 跳过 prev.map 这种 setState 回调
        if (varName === 'prev' || varName === 'acc') {
          continue;
        }
        
        // 跳过已经有括号保护的
        if (line.includes(`(${varName} || [])`)) {
          continue;
        }
        
        // 执行修复
        const newLine = lines[i].replace(
          new RegExp(`([^(])\\b${varName}\\.${methodName}\\(`),
          `$1(${varName} || []).${methodName}(`
        );
        
        if (newLine !== lines[i]) {
          lines[i] = newLine;
          fixCount++;
          console.log(`  [修复] 第 ${i + 1} 行: ${varName}.${methodName}() -> (${varName} || []).${methodName}()`);
        }
      }
    }
  }
  
  if (fixCount > 0) {
    fs.writeFileSync(fullPath, lines.join('\n'));
    console.log(`[完成] ${filePath}: 修复 ${fixCount} 处`);
  } else {
    console.log(`[跳过] ${filePath}: 无需修复`);
  }
  
  return { fixed: fixCount, skipped: skipCount };
}

// 主函数
function main() {
  console.log('=== 开始修复前端组件空值安全问题 ===\n');
  
  let totalFixed = 0;
  let totalSkipped = 0;
  
  for (const file of filesToFix) {
    console.log(`\n处理: ${file}`);
    const result = fixFile(file);
    totalFixed += result.fixed;
    totalSkipped += result.skipped;
  }
  
  console.log('\n=== 修复完成 ===');
  console.log(`总计修复: ${totalFixed} 处`);
  console.log(`已安全跳过: ${totalSkipped} 处`);
}

main();
