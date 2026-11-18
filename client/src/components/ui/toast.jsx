import * as React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const timeoutRefs = React.useRef(new Map());

  const removeToast = React.useCallback((id) => {
    const timeoutId = timeoutRefs.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutRefs.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback((input, type = 'default') => {
    const config = typeof input === 'string'
      ? { message: input, type }
      : { ...input };

    const id = config.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const duration = typeof config.duration === 'number' ? config.duration : 4000;

    setToasts((prev) => {
      if (config.key && prev.some((toast) => toast.key === config.key)) {
        return prev;
      }

      return [
        ...prev,
        {
          id,
          key: config.key || null,
          title: config.title || '',
          message: config.message || '',
          type: config.type || 'default',
          actionLabel: config.actionLabel || '',
          onAction: typeof config.onAction === 'function' ? config.onAction : null,
          onClick: typeof config.onClick === 'function' ? config.onClick : null,
        },
      ];
    });

    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        timeoutRefs.current.delete(id);
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, duration);
      timeoutRefs.current.set(id, timeoutId);
    }

    return id;
  }, []);

  React.useEffect(() => () => {
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRefs.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'min-w-[260px] max-w-sm rounded-lg border px-4 py-3 shadow-lg',
              toast.type === 'error' && 'border-destructive bg-destructive/10 text-destructive',
              toast.type === 'success' && 'border-green-500 bg-green-50 text-green-700',
              toast.type === 'info' && 'border-indigo-200 bg-indigo-50 text-indigo-900',
              toast.type === 'default' && 'border-border bg-background text-foreground'
            )}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => {
                  toast.onClick?.();
                  removeToast(toast.id);
                }}
                className={cn('min-w-0 flex-1 text-left', toast.onClick && 'cursor-pointer')}
                disabled={!toast.onClick}
              >
                {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
                <p className="text-sm">{toast.message}</p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction?.();
                      removeToast(toast.id);
                    }}
                    className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-white"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button onClick={() => removeToast(toast.id)} className="opacity-70 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
