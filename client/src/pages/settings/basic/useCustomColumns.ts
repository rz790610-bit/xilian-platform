/**
 * useCustomColumns — 可自定义列管理 Hook
 * 支持在表格中动态添加/删除/排序自定义列
 * 自定义列数据存储在 localStorage 中
 */
import { useState, useCallback, useEffect } from 'react';

export interface CustomColumn {
  key: string;       // 唯一标识
  label: string;     // 显示名称
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[]; // select 类型的选项
  width?: string;
  required?: boolean;
}

interface UseCustomColumnsOptions {
  storageKey: string;  // localStorage key
  defaultColumns?: CustomColumn[];
}

export function useCustomColumns({ storageKey, defaultColumns = [] }: UseCustomColumnsOptions) {
  const [columns, setColumns] = useState<CustomColumn[]>(() => {
    try {
      const saved = localStorage.getItem(`custom_cols_${storageKey}`);
      return saved ? JSON.parse(saved) : defaultColumns;
    } catch {
      return defaultColumns;
    }
  });

  // 持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(`custom_cols_${storageKey}`, JSON.stringify(columns));
  }, [columns, storageKey]);

  const addColumn = useCallback((col: CustomColumn) => {
    setColumns(prev => {
      if (prev.some(c => c.key === col.key)) return prev;
      return [...prev, col];
    });
  }, []);

  const removeColumn = useCallback((key: string) => {
    setColumns(prev => prev.filter(c => c.key !== key));
  }, []);

  const updateColumn = useCallback((key: string, updates: Partial<CustomColumn>) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, ...updates } : c));
  }, []);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    setColumns(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return { columns, addColumn, removeColumn, updateColumn, reorderColumns, setColumns };
}
