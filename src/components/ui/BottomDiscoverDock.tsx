import React, { useMemo, useState } from 'react';
import { ChevronUp, Clock, Sparkles } from 'lucide-react';
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

/** "此刻在校园": a capsule that opens into what is happening, how busy places are, and where to go. */
export const BottomDiscoverDock: React.FC<BottomDiscoverDockProps> = ({ events, spaces, compact, onSelectSpace, onOpenFindSpot }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('happening');
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);

  const live = events.filter((e) => e.status === 'happening_now');
  const upcoming = events.filter((e) => e.status === 'upcoming').slice(0, 4);
  const busy = spaces.filter((s) => s.pulse === 'busy' || s.pulse === 'very_busy').slice(0, 4);
  const quiet = spaces.filter((s) => s.pulse === 'quiet' && s.environment.sensorHealth !== 'offline').slice(0, 4);
  const picks = PICKS.map((p) => ({ ...p, space: byId.get(p.id) })).filter((p) => p.space);

  const go = (spaceId: string) => { onSelectSpace(spaceId); setOpen(false); };
  const isOpen = open && !compact;

  return (
    <div
      className={`pointer-events-none absolute bottom-6 z-20 flex justify-center transition-[left,right] duration-500 ease-[var(--ease-orbit)]
        left-4 right-4 md:left-[6.5rem] md:right-[5.5rem] ${compact ? 'lg:right-[27rem] max-lg:hidden' : ''}`}
    >
      <section
        aria-label="此刻在校园"
        className={`glass pointer-events-auto overflow-hidden transition-[width,border-radius] duration-500 ease-[var(--ease-orbit)] ${isOpen ? 'w-full max-w-[720px] rounded-[var(--radius-sheet)]' : 'max-w-full rounded-full'}`}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={isOpen}
          className="flex h-12 w-full items-center gap-3 pl-4 pr-3 text-left"
        >
          <span className="flex shrink-0 items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="live-dot h-2 w-2 rounded-full bg-flare" />
            此刻在校园
          </span>
          {!isOpen && (
            <span className="min-w-0 truncate text-[13px] text-ink-soft max-sm:hidden">
              {live.length} 场活动正在进行{live[0] ? `，${live[0].title}` : ''}
            </span>
          )}
          <ChevronUp className={`ml-auto h-4 w-4 shrink-0 text-dust transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="animate-fade border-t hairline">
            <div className="flex gap-5 px-5 pt-3" role="tablist">
              {([['happening', '正在发生'], ['pulse', '热闹与安静'], ['spots', '值得一去']] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`relative pb-2 text-[13px] font-medium ${view === id ? 'text-ink' : 'text-crater hover:text-ink'}`}
                >
                  {label}
                  {view === id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-flare" />}
                </button>
              ))}
            </div>

            <div className="scroll-quiet max-h-[min(46vh,360px)] overflow-y-auto p-3">
              {view === 'happening' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[...live, ...upcoming].map((e) => {
                    const isLive = e.status === 'happening_now';
                    return (
                      <button key={e.id} onClick={() => go(e.spaceId)} className="group rounded-[var(--radius-tile)] p-3.5 text-left transition-colors hover:bg-white">
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${isLive ? 'text-ember' : 'text-crater'}`}>
                          {isLive ? <span className="h-1.5 w-1.5 rounded-full bg-flare" /> : <Clock className="h-3 w-3" />}
                          {isLive ? '进行中' : `${formatTime(e.startTime)} 开始`}
                        </span>
                        <span className="mt-1.5 block text-[14px] font-semibold leading-snug text-ink">{e.title}</span>
                        <span className="mt-1 block truncate text-[12px] text-crater">{byId.get(e.spaceId) ? displayName(byId.get(e.spaceId)!) : e.spaceName}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {view === 'pulse' && (
                <div className="grid gap-x-6 gap-y-4 p-2 sm:grid-cols-2">
                  {[{ title: '正热闹', rows: busy, tone: 'bg-[#ef9b86]', note: (s: CampusSpace) => `约 ${s.headcountEstimate ?? 0} 人` },
                    { title: '很安静', rows: quiet, tone: 'bg-[#8ccfb9]', note: (s: CampusSpace) => `CO₂ ${s.environment.co2} ppm` }].map((col) => (
                    <div key={col.title}>
                      <p className="flex items-center gap-2 text-[12px] font-semibold text-ink"><span className={`h-2 w-2 rounded-full ${col.tone}`} />{col.title}</p>
                      <ul className="mt-1.5 divide-y divide-ink/10">
                        {col.rows.map((s) => (
                          <li key={s.id}>
                            <button onClick={() => go(s.id)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-[13px] hover:text-ember">
                              <span className="truncate"><span className="wordmark mr-2 text-[11px] text-crater">{displayCode(s.id)}</span>{displayName(s)}</span>
                              <span className="shrink-0 text-[12px] text-crater">{col.note(s)}</span>
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
                <div className="p-1">
                  <ul className="divide-y divide-ink/10">
                    {picks.map(({ id, why, space }) => (
                      <li key={id}>
                        <button onClick={() => go(id)} className="flex w-full items-baseline gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-white">
                          <span className="wordmark w-14 shrink-0 text-[11px] text-crater">{displayCode(id)}</span>
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium text-ink">{displayName(space!)}</span>
                            <span className="block text-[12px] text-crater">{why}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => { setOpen(false); onOpenFindSpot(); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-2.5 text-[13px] font-medium text-white hover:bg-ink-soft">
                    <Sparkles className="h-4 w-4" />按我的需求找空间
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
