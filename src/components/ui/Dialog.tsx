import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}

/** Shared modal shell: ink overlay, frosted sheet, Escape / backdrop to close, focus moved inside. */
export const Dialog: React.FC<DialogProps> = ({ open, title, description, onClose, children, width = 'max-w-[680px]' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); previous?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-3 backdrop-blur-[3px] sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`glass animate-rise flex max-h-[88vh] w-full ${width} flex-col overflow-hidden rounded-[var(--radius-sheet)] !bg-lunar/95`}
      >
        <header className="flex items-start justify-between gap-4 px-7 pb-4 pt-6">
          <div>
            <h2 id={titleId} className="text-[22px] font-semibold leading-tight text-ink">{title}</h2>
            {description && <p className="mt-1.5 text-[14px] text-crater">{description}</p>}
          </div>
          <button data-close onClick={onClose} aria-label="关闭" className="-mr-2 rounded-full p-2 text-dust transition-colors hover:bg-white hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
};
