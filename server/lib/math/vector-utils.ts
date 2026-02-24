/**
 * 向量与结构化比较工具库
 *
 * 提供余弦相似度、欧氏距离、结构化深度比较等算法，
 * 用于 Shadow Fleet 差异计算、仿真引擎输出比较等场景。
 */

// ============================================================
// 1. 向量运算
// ============================================================

/**
 * 余弦相似度 — 衡量两个向量方向的一致性
 * @returns [-1, 1]，1 表示完全一致，0 表示正交，-1 表示完全相反
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const minLen = Math.min(a.length, b.length);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom < 1e-12) return 0; // 零向量保护

  return Math.max(-1, Math.min(1, dotProduct / denom));
}

/**
 * 余弦距离 — 1 - cosineSimilarity
 * @returns [0, 2]，0 表示完全一致
 */
export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * 欧氏距离
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return Infinity;
  const minLen = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < minLen; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * 归一化欧氏距离 — 除以维度数开方，使结果与维度无关
 * @returns [0, +∞)
 */
export function normalizedEuclideanDistance(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return Infinity;
  return euclideanDistance(a, b) / Math.sqrt(minLen);
}

/**
 * L1 范数（曼哈顿距离）
 */
export function manhattanDistance(a: number[], b: number[]): number {
  if (!a || !b) return Infinity;
  const minLen = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < minLen; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum;
}

/**
 * 向量 L2 范数
 */
export function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

/**
 * 向量归一化（单位向量）
 */
export function normalize(v: number[]): number[] {
  const norm = l2Norm(v);
  if (norm < 1e-12) return v.map(() => 0);
  return v.map(x => x / norm);
}

// ============================================================
// 2. 结构化深度比较
// ============================================================

export interface FieldDiff {
  field: string;
  type: 'missing_in_a' | 'missing_in_b' | 'type_mismatch' | 'value_diff';
  valueA?: unknown;
  valueB?: unknown;
  numericDiff?: number; // 仅当两侧均为 number 时
}

/**
 * 结构化字段级深度比较 — 替代 JSON.stringify 比较
 *
 * 对两个 Record 逐字段比较：
 * - 数值字段：计算绝对差和相对差
 * - 字符串字段：严格相等
 * - 嵌套对象：递归比较
 * - 数组字段：逐元素比较
 */
export function deepFieldCompare(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  prefix = '',
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const aVal = a[key];
    const bVal = b[key];

    if (!(key in a)) {
      diffs.push({ field: fullKey, type: 'missing_in_a', valueB: bVal });
      continue;
    }
    if (!(key in b)) {
      diffs.push({ field: fullKey, type: 'missing_in_b', valueA: aVal });
      continue;
    }

    if (typeof aVal !== typeof bVal) {
      diffs.push({ field: fullKey, type: 'type_mismatch', valueA: aVal, valueB: bVal });
      continue;
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      if (Math.abs(aVal - bVal) > 1e-10) {
        diffs.push({
          field: fullKey,
          type: 'value_diff',
          valueA: aVal,
          valueB: bVal,
          numericDiff: Math.abs(aVal - bVal),
        });
      }
      continue;
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      if (aVal !== bVal) {
        diffs.push({ field: fullKey, type: 'value_diff', valueA: aVal, valueB: bVal });
      }
      continue;
    }

    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      if (aVal !== bVal) {
        diffs.push({ field: fullKey, type: 'value_diff', valueA: aVal, valueB: bVal });
      }
      continue;
    }

    if (Array.isArray(aVal) && Array.isArray(bVal)) {
      const maxLen = Math.max(aVal.length, bVal.length);
      for (let i = 0; i < maxLen; i++) {
        if (i >= aVal.length) {
          diffs.push({ field: `${fullKey}[${i}]`, type: 'missing_in_a', valueB: bVal[i] });
        } else if (i >= bVal.length) {
          diffs.push({ field: `${fullKey}[${i}]`, type: 'missing_in_b', valueA: aVal[i] });
        } else if (typeof aVal[i] === 'object' && typeof bVal[i] === 'object' && aVal[i] !== null && bVal[i] !== null) {
          diffs.push(...deepFieldCompare(aVal[i] as Record<string, unknown>, bVal[i] as Record<string, unknown>, `${fullKey}[${i}]`));
        } else if (typeof aVal[i] === 'number' && typeof bVal[i] === 'number') {
          if (Math.abs(aVal[i] - bVal[i]) > 1e-10) {
            diffs.push({ field: `${fullKey}[${i}]`, type: 'value_diff', valueA: aVal[i], valueB: bVal[i], numericDiff: Math.abs(aVal[i] - bVal[i]) });
          }
        } else if (aVal[i] !== bVal[i]) {
          diffs.push({ field: `${fullKey}[${i}]`, type: 'value_diff', valueA: aVal[i], valueB: bVal[i] });
        }
      }
      continue;
    }

    if (typeof aVal === 'object' && aVal !== null && typeof bVal === 'object' && bVal !== null) {
      diffs.push(...deepFieldCompare(aVal as Record<string, unknown>, bVal as Record<string, unknown>, fullKey));
      continue;
    }

    if (aVal !== bVal) {
      diffs.push({ field: fullKey, type: 'value_diff', valueA: aVal, valueB: bVal });
    }
  }

  return diffs;
}

/**
 * 基于字段差异计算结构化散度分数
 * @returns [0, 1]，0 表示完全一致
 */
export function structuredDivergenceScore(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const diffs = deepFieldCompare(a, b);
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (allKeys.size === 0) return 0;

  let weightedDiff = 0;
  for (const diff of diffs) {
    if (diff.type === 'missing_in_a' || diff.type === 'missing_in_b') {
      weightedDiff += 1.0;
    } else if (diff.type === 'type_mismatch') {
      weightedDiff += 1.0;
    } else if (diff.numericDiff !== undefined) {
      const maxAbs = Math.max(
        Math.abs(diff.valueA as number),
        Math.abs(diff.valueB as number),
        1,
      );
      weightedDiff += Math.min(1.0, diff.numericDiff / maxAbs);
    } else {
      weightedDiff += 1.0;
    }
  }

  return Math.min(1.0, weightedDiff / allKeys.size);
}

/**
 * 数值容差比较 — 用于仿真引擎输出比较
 * @returns true 表示在容差范围内一致
 */
export function numericallyEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  tolerance: number = 0.01,
): boolean {
  const diffs = deepFieldCompare(a, b);
  for (const diff of diffs) {
    if (diff.type === 'missing_in_a' || diff.type === 'missing_in_b' || diff.type === 'type_mismatch') {
      return false;
    }
    if (diff.numericDiff !== undefined) {
      const maxAbs = Math.max(Math.abs(diff.valueA as number), Math.abs(diff.valueB as number), 1);
      if (diff.numericDiff / maxAbs > tolerance) return false;
    } else if (diff.type === 'value_diff') {
      return false; // 非数值字段严格不等
    }
  }
  return true;
}

// ============================================================
// 对象展平与深度结构比较
// ============================================================

/**
 * 将嵌套对象中的所有数值字段递归提取为一维向量。
 * 非数值字段被忽略，遍历顺序按键名排序以保证一致性。
 */
export function flattenToVector(obj: Record<string, any>, maxDepth: number = 10): number[] {
  const result: number[] = [];

  function recurse(current: any, depth: number): void {
    if (depth > maxDepth) return;
    if (current === null || current === undefined) return;

    if (typeof current === 'number' && isFinite(current)) {
      result.push(current);
      return;
    }

    if (typeof current === 'object' && !Array.isArray(current)) {
      const keys = Object.keys(current).sort();
      for (const key of keys) {
        recurse(current[key], depth + 1);
      }
      return;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        recurse(item, depth + 1);
      }
    }
  }

  recurse(obj, 0);
  return result;
}

/**
 * 深度结构比较两个值是否相等。
 * 支持嵌套对象、数组、基本类型，键顺序无关。
 * 数值比较支持浮点容差。
 *
 * @param a 第一个值
 * @param b 第二个值
 * @param tolerance 数值比较容差（默认 0，即严格相等）
 * @param maxDepth 最大递归深度（防止循环引用）
 */
export function deepStructuralEqual(
  a: any,
  b: any,
  tolerance: number = 0,
  maxDepth: number = 20,
): boolean {
  function compare(x: any, y: any, depth: number): boolean {
    if (depth > maxDepth) return false;

    // 严格相等（含 null、undefined、string、boolean）
    if (x === y) return true;

    // 类型不同
    if (typeof x !== typeof y) return false;

    // null 检查
    if (x === null || y === null) return false;
    if (x === undefined || y === undefined) return false;

    // 数值比较（含浮点容差）
    if (typeof x === 'number' && typeof y === 'number') {
      if (isNaN(x) && isNaN(y)) return true;
      if (!isFinite(x) || !isFinite(y)) return x === y;
      return Math.abs(x - y) <= tolerance;
    }

    // 数组比较
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) {
        if (!compare(x[i], y[i], depth + 1)) return false;
      }
      return true;
    }

    // 一个是数组另一个不是
    if (Array.isArray(x) !== Array.isArray(y)) return false;

    // 对象比较（键顺序无关）
    if (typeof x === 'object') {
      const keysX = Object.keys(x).sort();
      const keysY = Object.keys(y).sort();
      if (keysX.length !== keysY.length) return false;
      for (let i = 0; i < keysX.length; i++) {
        if (keysX[i] !== keysY[i]) return false;
        if (!compare(x[keysX[i]], y[keysY[i]], depth + 1)) return false;
      }
      return true;
    }

    return false;
  }

  return compare(a, b, 0);
}
