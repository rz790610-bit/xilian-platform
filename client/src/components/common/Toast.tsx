import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

// Toast 类型
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast Provider
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration = 3000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, type, message, duration }]);
    
    // 自动移除
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast Container
function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// Toast Item
function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // 触发进入动画
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, []);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />
  };

  const bgColors = {
    success: 'bg-green-500/10 border-green-500/30',
    error: 'bg-red-500/10 border-red-500/30',
    warning: 'bg-yellow-500/10 border-yellow-500/30',
    info: 'bg-blue-500/10 border-blue-500/30'
  };

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg min-w-[280px] max-w-[400px]',
        'transition-all duration-300 ease-out',
        bgColors[toast.type],
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        borderColor: toast.type === 'success' ? 'rgba(34, 197, 94, 0.3)' :
                     toast.type === 'error' ? 'rgba(239, 68, 68, 0.3)' :
                     toast.type === 'warning' ? 'rgba(234, 179, 8, 0.3)' :
                     'rgba(59, 130, 246, 0.3)'
      }}
    >
      {icons[toast.type]}
      <span className="flex-1 text-sm text-white">{toast.message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

// Hook
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  
  return {
    success: (message: string) => context.addToast('success', message),
    error: (message: string) => context.addToast('error', message),
    warning: (message: string) => context.addToast('warning', message),
    info: (message: string) => context.addToast('info', message)
  };
}

// 全局 toast 函数（兼容 sonner API）
let globalAddToast: ((type: ToastType, message: string) => void) | null = null;

export function setGlobalToast(addToast: (type: ToastType, message: string) => void) {
  globalAddToast = addToast;
}

export const toast = {
  success: (message: string) => globalAddToast?.('success', message),
  error: (message: string) => globalAddToast?.('error', message),
  warning: (message: string) => globalAddToast?.('warning', message),
  info: (message: string) => globalAddToast?.('info', message)
};
