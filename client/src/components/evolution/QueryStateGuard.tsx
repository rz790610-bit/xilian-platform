/**
 * ============================================================================
 * QueryStateGuard — 统一的 tRPC 查询状态守卫组件
 * ============================================================================
 * 用于包裹依赖 tRPC useQuery 数据的内容区域，统一处理 Loading / Error / Empty 状态。
 * 
 * 用法：
 *   const query = trpc.evoEvolution.xxx.useQuery();
 *   <QueryStateGuard query={query} label="影子评估记录">
 *     {(data) => <YourContent data={data} />}
 *   </QueryStateGuard>
 */
import React from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface QueryResult {
  isLoading: boolean;
  isError: boolean;
  error?: { message?: string } | null;
  data?: unknown;
  refetch?: () => void;
}

interface QueryStateGuardProps<T> {
  query: QueryResult;
  label?: string;
  children: (data: T) => React.ReactNode;
  /** 自定义空数据判断（默认判断 data 为 null/undefined/空数组） */
  isEmpty?: (data: T) => boolean;
  /** 空状态提示文案 */
  emptyMessage?: string;
  /** 是否显示骨架屏而非 spinner */
  skeleton?: React.ReactNode;
}

export function QueryStateGuard<T>({
  query,
  label = '数据',
  children,
  isEmpty,
  emptyMessage,
  skeleton,
}: QueryStateGuardProps<T>) {
  // Loading 状态
  if (query.isLoading) {
    if (skeleton) return <>{skeleton}</>;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-sm">正在加载{label}...</span>
      </div>
    );
  }

  // Error 状态
  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <span className="text-sm text-red-400">
          加载{label}失败：{query.error?.message ?? '未知错误'}
        </span>
        {query.refetch && (
          <button
            onClick={() => query.refetch?.()}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 mt-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重试
          </button>
        )}
      </div>
    );
  }

  const data = query.data as T;

  // 空数据状态
  const dataIsEmpty = isEmpty
    ? isEmpty(data)
    : data === null || data === undefined || (Array.isArray(data) && data.length === 0);

  if (dataIsEmpty && emptyMessage) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-2">
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }

  return <>{children(data)}</>;
}

/**
 * MutationButton — 统一的 mutation 按钮，自动处理 isPending 状态
 */
interface MutationButtonProps {
  mutation: { isPending: boolean };
  onClick: () => void;
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'outline';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export function MutationButton({
  mutation,
  onClick,
  label,
  pendingLabel,
  className = '',
  disabled = false,
  variant = 'primary',
  size = 'sm',
  icon,
}: MutationButtonProps) {
  const baseClasses = size === 'sm' ? 'text-xs h-7 px-3' : 'text-sm h-9 px-4';
  const variantClasses = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    danger: 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30',
    outline: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800',
  };

  return (
    <button
      onClick={onClick}
      disabled={mutation.isPending || disabled}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {pendingLabel ?? '处理中...'}
        </>
      ) : (
        <>
          {icon}
          {label}
        </>
      )}
    </button>
  );
}
