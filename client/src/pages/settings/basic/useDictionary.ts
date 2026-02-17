/**
 * 通用字典数据 Hook
 * 从后端字典管理中读取数据，替代所有硬编码枚举
 */
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

/** 字典项类型 */
export interface DictItem {
  code: string;
  label: string;
  value: string | null;
  color: string | null;
  parentCode: string | null;
  isActive: number;
}

/** 字典分类及其下属项 */
export interface DictCategory {
  code: string;
  name: string;
  description: string | null;
  items: DictItem[];
}

/**
 * 读取指定分类的字典项
 * @param categoryCode 字典分类编码
 * @param enabled 是否启用查询（默认 true）
 */
export function useDictItems(categoryCode: string, enabled = true) {
  const { data, isLoading, refetch } = trpc.database.config.getDictCategory.useQuery(
    { categoryCode },
    { enabled: enabled && !!categoryCode }
  );

  const items = useMemo(() => {
    if (!data?.items) return [];
    return data.items.filter((i: any) => i.isActive !== 0);
  }, [data]);

  /** 转为 Record<code, label> 格式，方便下拉选择 */
  const map = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach((i: any) => { m[i.code] = i.label; });
    return m;
  }, [items]);

  /** 转为 Record<code, { label, color, value }> 格式 */
  const detailMap = useMemo(() => {
    const m: Record<string, { label: string; color: string; value: string }> = {};
    items.forEach((i: any) => {
      m[i.code] = { label: i.label, color: i.color || '#6b7280', value: i.value || '' };
    });
    return m;
  }, [items]);

  /** 按 parentCode 分组的子项 */
  const groupedByParent = useMemo(() => {
    const g: Record<string, DictItem[]> = {};
    items.forEach((i: any) => {
      const parent = i.parentCode || '__root__';
      if (!g[parent]) g[parent] = [];
      g[parent].push(i);
    });
    return g;
  }, [items]);

  return { items, map, detailMap, groupedByParent, isLoading, refetch, category: data };
}

/**
 * 读取多个字典分类
 * @param categoryCodes 字典分类编码数组
 */
export function useMultipleDicts(categoryCodes: string[]) {
  const results: Record<string, ReturnType<typeof useDictItems>> = {};
  // 注意：Hook 调用次数必须固定，所以用固定长度数组
  // 这里最多支持 10 个分类同时查询
  const c0 = useDictItems(categoryCodes[0] || '', !!categoryCodes[0]);
  const c1 = useDictItems(categoryCodes[1] || '', !!categoryCodes[1]);
  const c2 = useDictItems(categoryCodes[2] || '', !!categoryCodes[2]);
  const c3 = useDictItems(categoryCodes[3] || '', !!categoryCodes[3]);
  const c4 = useDictItems(categoryCodes[4] || '', !!categoryCodes[4]);
  const c5 = useDictItems(categoryCodes[5] || '', !!categoryCodes[5]);
  const c6 = useDictItems(categoryCodes[6] || '', !!categoryCodes[6]);
  const c7 = useDictItems(categoryCodes[7] || '', !!categoryCodes[7]);
  const c8 = useDictItems(categoryCodes[8] || '', !!categoryCodes[8]);
  const c9 = useDictItems(categoryCodes[9] || '', !!categoryCodes[9]);

  const all = [c0, c1, c2, c3, c4, c5, c6, c7, c8, c9];
  categoryCodes.forEach((code, i) => {
    if (code && i < 10) results[code] = all[i];
  });

  return results;
}
