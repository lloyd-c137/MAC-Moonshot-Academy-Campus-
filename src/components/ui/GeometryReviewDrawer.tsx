import React from 'react';
import { Check, Circle, X } from 'lucide-react';

interface GeometryReviewDrawerProps {
  isOpen: boolean;
  showNavGraph: boolean;
  showGrid: boolean;
  showSourceOverlay: boolean;
  onClose: () => void;
  onToggleNavGraph: () => void;
  onToggleGrid: () => void;
  onToggleSourceOverlay: () => void;
}

const Switch: React.FC<{ checked: boolean; onChange: () => void; label: string; hint: string }> = ({ checked, onChange, label, hint }) => (
  <button role="switch" aria-checked={checked} onClick={onChange} className="flex w-full items-center justify-between gap-4 py-3 text-left">
    <span>
      <span className="block text-[14px] font-medium text-ink">{label}</span>
      <span className="mt-0.5 block text-[12px] text-crater">{hint}</span>
    </span>
    <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-flare' : 'bg-haze'}`}>
      <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

const STATUS: Array<{ done: boolean; text: string }> = [
  { done: true, text: '比例 1:300 与总尺寸 134.1 m × 115.8 m 吻合' },
  { done: true, text: '墙体、门洞、玻璃、座位由图纸矢量生成' },
  { done: true, text: '101 个房间编号全部定位，93 个有房间边界' },
  { done: false, text: '房间边界逐间人工核验' },
  { done: false, text: 'M104 与西侧走廊有 14.2 m² 重叠待确认' },
  { done: false, text: '门洞通行与室内路线' },
  { done: false, text: '墙高与看台高度（无剖面图，现为示意）' },
];

/** 图纸对照: compare the generated model with the FF-01 sheet and see what is still unverified. */
export const GeometryReviewDrawer: React.FC<GeometryReviewDrawerProps> = ({ isOpen, showGrid, showSourceOverlay, onClose, onToggleGrid, onToggleSourceOverlay }) => {
  if (!isOpen) return null;
  return (
    <aside aria-label="图纸对照" className="glass animate-rise absolute left-4 top-[4.75rem] z-30 flex max-h-[calc(100%-6.5rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[var(--radius-sheet)] md:left-[6.75rem]">
      <header className="flex items-start justify-between px-5 pt-5">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">图纸对照</h2>
          <p className="mt-1 text-[13px] text-crater">FF-01 一层总平面布置图，广州亚泰建筑设计院</p>
        </div>
        <button onClick={onClose} aria-label="关闭图纸对照" className="-mr-2 rounded-full p-1.5 text-dust hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
      </header>

      <div className="scroll-quiet flex-1 overflow-y-auto px-5 pb-5">
        <div className="mt-3 divide-y divide-ink/10 border-y hairline">
          <Switch checked={showSourceOverlay} onChange={onToggleSourceOverlay} label="叠加原图" hint="把 FF-01 半透明盖在模型上，逐处比对" />
          <Switch checked={showGrid} onChange={onToggleGrid} label="10 米网格" hint="用来估算距离和房间尺度" />
        </div>

        <h3 className="mt-5 text-[13px] font-semibold text-ink">核验进度</h3>
        <ul className="mt-2 space-y-2">
          {STATUS.map((item) => (
            <li key={item.text} className="flex items-start gap-2.5 text-[13px] leading-snug">
              {item.done
                ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-haze" />}
              <span className={item.done ? 'text-ink-soft' : 'text-crater'}>{item.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-dust">只提供了一层图纸，其他楼层不做推测。护士站、心理咨询等房间不显示实时人数。</p>
      </div>
    </aside>
  );
};
