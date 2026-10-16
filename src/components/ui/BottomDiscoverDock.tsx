import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, Sparkles } from 'lucide-react';
import type { CampusEvent, CampusSpace } from '../../types/campus';
import { displayCode, displayName, formatTime } from './format';

interface BottomDiscoverDockProps {
  events: CampusEvent[];
  spaces: CampusSpace[];
  compact: boolean;
  onSelectSpace: (spaceId: string) => void;
  onOpenFindSpot: () => void;
}

type View = 'happening' | 'pulse' | 'spots';

const PICKS: Array<{ id: string; why: string }> = [
  { id: 'M104', why: '开放研学工坊，适合一个人开始一件新事' },
  { id: 'M103', why: '激光切割和 3D 打印都在这里' },
  { id: 'S404', why: '全校最安静的自习室' },
  { id: 'S202', why: '可以大声讨论的小组空间' },
  { id: 'COURTYARD-02', why: '课间晒太阳的南苑中庭' },
];

const HEADER_H = 48;
const MAX_W = 680;

/**
 * "此刻在校园": a white live capsule, like a live activity. Closed it is a capsule with the
 * live count; open it grows into a card. Width and height are measured and animated as real numbers
 * (an `auto` size cannot be animated, which made the old version jump); the content fades in once
 * the shape is mostly there, and fades out before the shape shrinks.
 */
export const BottomDiscoverDock: React.FC<BottomDiscoverDockProps> = ({ events, spaces, compact, onSelectSpace, onOpenFindSpot }) => {
  const [open, setOpen] = useState(false);
  const [bodyMounted, setBodyMounted] = useState(false);
  const [bodyShown, setBodyShown] = useState(false);
  const [view, setView] = useState<View>('happening');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const live = events.filter((e) => e.status === 'happening_now');
  const upcoming = events.filter((e) => e.status === 'upcoming').slice(0, 4);
  const busy = spaces.filter((s) => s.pulse === 'busy' || s.pulse === 'very_busy').slice(0, 4);
  const quiet = spaces.filter((s) => s.pulse === 'quiet' && s.environment.sensorHealth !== 'offline').slice(0, 4);
  const picks = PICKS.map((p) => ({ ...p, space: byId.get(p.id) })).filter((p) => p.space);
  const isOpen = open && !compact;

  const measure = useCallback(() => {
    const lane = laneRef.current?.clientWidth ?? MAX_W;
    const closedW = Math.min(lane, Math.ceil(measureRef.current?.offsetWidth ?? 320));
    if (!isOpen) { setSize({ w: closedW, h: HEADER_H }); return; }
    const bodyH = bodyRef.current?.scrollHeight ?? 0;
    setSize({ w: Math.min(lane, MAX_W), h: HEADER_H + bodyH });
  }, [isOpen]);

  useLayoutEffect(() => {
    if (isOpen) setBodyMounted(true);
    measure();
  }, [isOpen, view, bodyMounted, live.length, measure]);

  // The body mounts hidden and is revealed a frame later, so its fade-in actually runs.
  useEffect(() => {
    if (!isOpen) { setBodyShown(false); return; }
    if (!bodyMounted) return;
    const id = requestAnimationFrame(() => setBodyShown(true));
    return () => cancelAnimationFrame(id);
  }, [isOpen, bodyMounted]);

  // Keep the shape in step with the lane and with content (tab switches animate height too).
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (laneRef.current) ro.observe(laneRef.current);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [measure, bodyMounted]);

  // Close on Escape or a press outside.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (!sectionRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown, true); };
  }, [isOpen]);

  const onShapeEnd = (e: React.TransitionEvent) => {
    if (e.target === sectionRef.current && e.propertyName === 'height' && !isOpen) setBodyMounted(false);
  };

  const go = (spaceId: string) => { onSelectSpace(spaceId); setOpen(false); };
  const headline = live.length > 0 ? live[0].title : upcoming[0] ? `${formatTime(upcoming[0].startTime)} ${upcoming[0].title}` : '今天没有活动安排';

  const row = 'group flex w-full items-start gap-4 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.04]';

  return (
    <div
      ref={laneRef}
      className={`pointer-events-none absolute bottom-6 z-20 flex justify-center transition-[left,right] duration-500 ease-[var(--ease-orbit)]
        left-4 right-4 md:left-[6.5rem] md:right-[5.5rem] ${compact ? 'lg:right-[27rem] max-lg:hidden' : ''}`}
    >
      {/* Natural width of the closed capsule, measured off-screen. */}
      <span ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 flex h-12 w-max items-center gap-3 whitespace-nowrap pl-2 pr-4 text-[13px]">
        <span className="wordmark grid h-8 min-w-8 place-items-center px-1 text-[13px]">{live.length}</span>
        <span className="font-semibold">场活动正在进行</span>
        <span className="max-w-[260px] truncate max-sm:hidden">{headline}</span>
        <span className="h-4 w-4" />
      </span>

      <section
        ref={sectionRef}
        aria-label="此刻在校园"
        onTransitionEnd={onShapeEnd}
        className="live-dock pointer-events-auto relative overflow-hidden text-ink"
        style={size ? { width: size.w, height: size.h, borderRadius: isOpen ? 22 : 24 } : { height: HEADER_H, borderRadius: 24 }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={isOpen}
          className="flex h-12 w-full items-center gap-3 whitespace-nowrap pl-2 pr-4 text-left text-[13px]"
        >
          <span className={`wordmark grid h-8 min-w-8 place-items-center rounded-full px-1 text-[13px] ${live.length ? 'bg-flare text-white' : 'bg-ink/[0.06] text-crater'}`}>{live.length}</span>
          <span className="font-semibold">场活动正在进行</span>
          <span className={`min-w-0 max-w-[260px] truncate text-crater transition-opacity duration-200 max-sm:hidden ${isOpen ? 'opacity-0' : 'opacity-100'}`}>{headline}</span>
          <ChevronUp className={`ml-auto h-4 w-4 shrink-0 text-dust transition-transform duration-500 ease-[var(--ease-orbit)] ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {bodyMounted && (
          <div ref={bodyRef} className={`live-dock__body absolute inset-x-0 top-12 ${bodyShown ? 'is-open' : ''}`}>
            <div className="flex gap-5 border-t border-ink/[0.07] px-5 pt-3" role="tablist">
              {([['happening', '正在发生'], ['pulse', '热闹与安静'], ['spots', '值得一去']] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`relative pb-2.5 text-[13px] font-medium transition-colors ${view === id ? 'text-ink' : 'text-crater hover:text-ink'}`}
                >
                  {label}
                  <span className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-flare transition-opacity ${view === id ? 'opacity-100' : 'opacity-0'}`} />
                </button>
              ))}
            </div>

            <div className="scroll-quiet max-h-[min(44vh,360px)] overflow-y-auto px-2 py-2.5" role="tabpanel">
              {view === 'happening' && (
                <ul>
                  {[...live, ...upcoming].map((e) => {
                    const isLive = e.status === 'happening_now';
                    const place = byId.get(e.spaceId) ? displayName(byId.get(e.spaceId)!) : e.spaceName;
                    return (
                      <li key={e.id}>
                        <button onClick={() => go(e.spaceId)} className={row}>
                          <span className={`w-12 shrink-0 pt-px text-right text-[12px] tabular-nums ${isLive ? 'font-semibold text-ember' : 'text-crater'}`}>
                            {isLive ? '进行中' : formatTime(e.startTime)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium leading-snug">{e.title}</span>
                            <span className="mt-0.5 block truncate text-[12px] text-crater">{place}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {view === 'pulse' && (
                <div className="grid gap-x-6 gap-y-5 px-3 py-1 sm:grid-cols-2">
                  {[{ title: '正热闹', rows: busy, note: (s: CampusSpace) => `约 ${s.headcountEstimate ?? 0} 人` },
                    { title: '很安静', rows: quiet, note: (s: CampusSpace) => `CO₂ ${s.environment.co2}` }].map((col) => (
                    <div key={col.title}>
                      <p className="text-[12px] text-crater">{col.title}</p>
                      <ul className="mt-1">
                        {col.rows.map((s) => (
                          <li key={s.id}>
                            <button onClick={() => go(s.id)} className="flex w-full items-baseline justify-between gap-3 border-b border-ink/[0.07] py-2.5 text-left text-[13px] hover:text-ember">
                              <span className="truncate"><span className="wordmark mr-2 text-[11px] text-dust">{displayCode(s.id)}</span>{displayName(s)}</span>
                              <span className="shrink-0 text-[12px] tabular-nums text-crater">{col.note(s)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  <p className="text-[11px] text-dust sm:col-span-2">人流与环境为演示数据。</p>
                </div>
              )}

              {view === 'spots' && (
                <div>
                  <ul>
                    {picks.map(({ id, why, space }) => (
                      <li key={id}>
                        <button onClick={() => go(id)} className={row}>
                          <span className="wordmark w-12 shrink-0 pt-0.5 text-right text-[11px] text-dust">{displayCode(id)}</span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">{displayName(space!)}</span>
                            <span className="mt-0.5 block text-[12px] text-crater">{why}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="px-3 pb-1 pt-2">
                    <button onClick={() => { setOpen(false); onOpenFindSpot(); }} className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-flare text-[13px] font-semibold text-white hover:bg-ember">
                      <Sparkles className="h-4 w-4" />按我的需求找空间
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
