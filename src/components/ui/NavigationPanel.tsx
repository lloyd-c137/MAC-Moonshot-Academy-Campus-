import React, { useEffect } from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import type { NavigationRoute } from '../../types/campus';
import { displayCode, displayName } from './format';

interface NavigationPanelProps {
  isOpen: boolean;
  selectedDestinationId: string | null;
  onClose: () => void;
  onRouteCalculated: (route: NavigationRoute | null) => void;
  onShowDestination: (spaceId: string) => void;
}

/** Routing is not available until doorways and corridors are verified; the panel says so plainly. */
export const NavigationPanel: React.FC<NavigationPanelProps> = ({ isOpen, selectedDestinationId, onClose, onRouteCalculated, onShowDestination }) => {
  useEffect(() => { if (isOpen) onRouteCalculated(null); }, [isOpen, selectedDestinationId]);
  if (!isOpen) return null;
  const destination = CAMPUS_SPACES.find((s) => s.id === selectedDestinationId);

  return (
    <section aria-label="路线" className="glass animate-rise absolute left-4 top-[4.75rem] z-30 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-sheet)] md:left-[6.75rem]">
      <header className="flex items-center justify-between px-5 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Navigation className="h-4 w-4 text-flare" />路线</h2>
        <button onClick={() => { onRouteCalculated(null); onClose(); }} aria-label="关闭路线" className="-mr-2 rounded-full p-1.5 text-dust hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
      </header>

      <ol className="relative mx-5 mt-4 space-y-3 before:absolute before:bottom-4 before:left-[7px] before:top-4 before:w-px before:bg-haze">
        <li className="relative flex items-center gap-3">
          <span className="z-10 h-[15px] w-[15px] rounded-full border-[3px] border-ink bg-white" />
          <span className="text-[14px] text-ink-soft">西入口门厅</span>
        </li>
        <li className="relative flex items-center gap-3">
          <MapPin className="z-10 h-[15px] w-[15px] text-flare" />
          <span className="text-[14px] font-medium text-ink">
            {destination ? <><span className="wordmark mr-2 text-[12px]">{displayCode(destination.id)}</span>{displayName(destination)}</> : '在地图上选一个房间'}
          </span>
        </li>
      </ol>

      <div className="mx-5 mt-4 rounded-[var(--radius-tile)] bg-regolith/70 p-4">
        <p className="text-[14px] font-semibold text-ink">路线还没有开放</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">门洞和走廊的通行情况还在逐段核对。核对完成前不给出路线和步行时间，以免带错路。</p>
      </div>

      <div className="p-5">
        <button
          disabled={!destination}
          onClick={() => destination && onShowDestination(destination.id)}
          className="h-11 w-full rounded-full bg-ink text-[14px] font-medium text-white transition-colors hover:bg-ink-soft disabled:opacity-40"
        >
          在地图上看目的地
        </button>
      </div>
    </section>
  );
};
