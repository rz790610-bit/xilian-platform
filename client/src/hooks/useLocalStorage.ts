/**
 * useLocalStorage — 通用 localStorage 持久化 Hook
 * 
 * 功能：
 * - 自动序列化/反序列化 JSON
 * - 支持函数式更新（与 useState 一致）
 * - 写入失败时静默降级（不影响应用运行）
 * - 支持 SSR（服务端渲染安全）
 * - 跨标签页同步（通过 storage 事件）
 * 
 * 用途：
 * - VisualDesigner: 持久化表定义（表名、列、引擎等）
 * - SqlEditor: 持久化 SQL 语句和编辑器状态
 * - PipelineEditor: 持久化节点和连接（通过 zustand persist）
 */
import { useState, useEffect, useCallback, useRef } from 'react';

import { createLogger } from '@/lib/logger';
const log = createLogger('useLocalStorage');

type SetValue<T> = T | ((prev: T) => T);

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: SetValue<T>) => void, () => void] {
  // 从 localStorage 读取初始值
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      log.warn(`[useLocalStorage] Error reading "${key}":`, error);
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);
  const keyRef = useRef(key);
  keyRef.current = key;

  // 写入 localStorage
  const setValue = useCallback(
    (value: SetValue<T>) => {
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        setStoredValue(newValue);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(keyRef.current, JSON.stringify(newValue));
        }
      } catch (error) {
        log.warn(`[useLocalStorage] Error writing "${keyRef.current}":`, error);
      }
    },
    [storedValue]
  );

  // 清除 localStorage 中的值
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(keyRef.current);
      }
    } catch (error) {
      log.warn(`[useLocalStorage] Error removing "${keyRef.current}":`, error);
    }
  }, [initialValue]);

  // 跨标签页同步
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === keyRef.current && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch {
          // 忽略解析错误
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return [storedValue, setValue, removeValue];
}

/**
 * useAutoSave — 自动保存 Hook
 * 
 * 在值变化后延迟保存到 localStorage，避免频繁写入
 */
export function useAutoSave<T>(
  key: string,
  value: T,
  delay: number = 1000
): { lastSaved: Date | null; isSaving: boolean } {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setIsSaving(true);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(value));
          setLastSaved(new Date());
        }
      } catch (error) {
        log.warn(`[useAutoSave] Error saving "${key}":`, error);
      }
      setIsSaving(false);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [key, value, delay]);

  return { lastSaved, isSaving };
}
