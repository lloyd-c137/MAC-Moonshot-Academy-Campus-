import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Check, CircleAlert } from 'lucide-react';

type Tone = 'success' | 'error';
interface ToastItem { id: number; message: string; tone: Tone }
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** Short confirmations ("链接已复制", "回忆已保存") shown above the bottom strip. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-[5.5rem] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="animate-rise flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_14px_32px_-12px_rgb(24_32_46/0.6)]">
            {t.tone === 'success' ? <Check className="h-4 w-4 text-glow" /> : <CircleAlert className="h-4 w-4 text-glow" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
