import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, CornerUpLeft, CornerUpRight, Loader2, LocateFixed, MapPin, Maximize2, Navigation, Search, X } from 'lucide-react';
import type { CampusSpace } from '../../types/campus';
import type { RouteStep, WalkRoute } from '../../services/pathfinding';
import { displayCode, displayName } from './format';

export type RouteField = 'from' | 'to';
export type RouteStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

interface RoutePanelProps {
  isOpen: boolean;
  spaces: CampusSpace[];
  /** Spaces the walking grid can route to; null while the grid loads. */
  routableIds: Set<string> | null;
  fromId: string | null;
  toId: string | null;
  pickField: RouteField | null;
  status: RouteStatus;
  route: WalkRoute | null;
  steps: RouteStep[];
  onPickField: (field: RouteField | null) => void;
  onChange: (field: RouteField, spaceId: string | null) => void;
  onSwap: () => void;
  onFrameRoute: () => void;
  onClose: () => void;
}

const ENTRANCES: [string, string][] = [['ENTRANCE-WEST', '西门'], ['ENTRANCE-EAST', '东门'], ['ENTRANCE-SOUTH', '南门']];

const placeName = (space: CampusSpace | undefined, id: string) => (space ? displayName(space) : id);

function matches(space: CampusSpace, q: string): number {
  const code = displayCode(space.id).toLowerCase();
  const name = displayName(space).toLowerCase();
  const tags = (space.tags ?? []).join(' ').toLowerCase();
  if (code && code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (name.startsWith(q)) return 2;
  if (name.includes(q) || code.includes(q)) return 3;
  if (tags.includes(q) || (space.englishName ?? '').toLowerCase().includes(q)) return 4;
  return -1;
}

const PlaceLabel: React.FC<{ space?: CampusSpace; id: string }> = ({ space, id }) => {
  const code = displayCode(id);
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      {code && <span className="wordmark shrink-0 text-[12px] font-semibold text-ink-soft">{code}</span>}
      <span className="truncate">{placeName(space, id)}</span>
    </span>
  );
};

/** One end of the route: shows the chosen place, or a search box while it is being picked. */
const FieldRow: React.FC<{
  field: RouteField;
  space?: CampusSpace;
  id: string | null;
  active: boolean;
  options: CampusSpace[];
  onActivate: () => void;
  onChoose: (id: string) => void;
  onClear: () => void;
}> = ({ field, space, id, active, options, onActivate, onChoose, onClear }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const label = field === 'from' ? '起点' : '终点';
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .map((s) => [s, matches(s, q)] as const)
      .filter(([, score]) => score >= 0)
      .sort((a, b) => a[1] - b[1] || a[0].id.localeCompare(b[0].id))
      .slice(0, 7)
      .map(([s]) => s);
  }, [query, options]);
  useEffect(() => { if (active) { setQuery(''); requestAnimationFrame(() => inputRef.current?.focus()); } }, [active]);
  useEffect(() => setCursor(0), [query]);

  const marker = field === 'from'
    ? <span className="z-10 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-ink bg-white" />
    : <MapPin className="z-10 h-[16px] w-[16px] shrink-0 fill-flare text-flare [&>circle]:fill-white [&>circle]:stroke-white" />;

  if (!active) {
    return (
      <li className="relative flex items-center gap-3">
        {marker}
        <button
          type="button"
          onClick={onActivate}
          className={`flex h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-[14px] px-3.5 text-left text-[14px] transition-colors hover:bg-white ${id ? 'bg-white/60 font-medium text-ink' : 'bg-white/40 text-dust'}`}
          aria-label={id ? `${label}：${placeName(space, id)}，点击更换` : `选择${label}`}
        >
          {id ? <PlaceLabel space={space} id={id} /> : `选择${label}`}
        </button>
        {id && (
          <button type="button" onClick={onClear} aria-label={`清除${label}`} className="-ml-1 rounded-full p-1.5 text-dust hover:bg-white hover:text-ink"><X className="h-3.5 w-3.5" /></button>
        )}
      </li>
    );
  }

  return (
    <li className="relative">
      <div className="flex items-center gap-3">
        {marker}
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-white px-3.5 ring-2 ring-flare/40">
          <Search className="h-4 w-4 shrink-0 text-dust" aria-hidden />
          <span className="sr-only">搜索{label}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((i) => Math.min(results.length - 1, i + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((i) => Math.max(0, i - 1)); }
              else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); onChoose(results[cursor].id); }
            }}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`route-${field}-results`}
            placeholder={`搜索${label}，或在地图上点房间`}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-dust"
          />
        </label>
      </div>
      {results.length > 0 && (
        <ul id={`route-${field}-results`} role="listbox" className="ml-[27px] mt-1.5 overflow-hidden rounded-[14px] bg-white py-1 shadow-[0_12px_30px_-16px_rgb(24_32_46/0.35)]">
          {results.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => onChoose(s.id)}
                className={`flex w-full items-center px-3.5 py-2 text-left text-[14px] text-ink ${i === cursor ? 'bg-regolith/70' : ''}`}
              >
                <PlaceLabel space={s} id={s.id} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && results.length === 0 && (
        <p className="ml-[27px] mt-2 text-[12px] text-crater">没有找到“{query.trim()}”。试试房间号，比如 M104。</p>
      )}
    </li>
  );
};

/** Space between Chinese text and a name that starts or ends with a room code (到达 M123 教室). */
const spaced = (name: string) => `${/^[A-Za-z0-9]/.test(name) ? ' ' : ''}${name}${/[A-Za-z0-9]$/.test(name) ? ' ' : ''}`;

function stepText(step: RouteStep, nameOf: (id: string) => string, toName: string, fromName: string): string {
  const m = Math.max(1, Math.round(step.afterM));
  if (step.kind === 'start') return `从${spaced(fromName)}出发`;
  if (step.kind === 'arrive') return `再走 ${m} 米到达${spaced(toName)}`.trimEnd();
  const turn = step.kind === 'left' ? '左转' : '右转';
  return `走 ${m} 米，${step.landmarkId ? `在${spaced(nameOf(step.landmarkId))}附近` : ''}${turn}`;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  isOpen, spaces, routableIds, fromId, toId, pickField, status, route, steps,
  onPickField, onChange, onSwap, onFrameRoute, onClose,
}) => {
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const options = useMemo(() => (routableIds ? spaces.filter((s) => routableIds.has(s.id)) : []), [spaces, routableIds]);
  if (!isOpen) return null;

  const nameOf = (id: string) => {
    const code = displayCode(id);
    const name = placeName(byId.get(id), id);
    return code && name !== code ? `${code} ${name}` : name;
  };
  const choose = (field: RouteField, id: string) => onChange(field, id);

  return (
    <section
      data-route-panel
      aria-label="路线"
      className="glass animate-rise absolute z-30 flex max-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-[var(--radius-sheet)]
        left-4 top-[4.75rem] w-[360px] md:left-[6.75rem] max-md:inset-x-3 max-md:w-auto max-md:max-h-[46dvh] max-md:bg-[#fbfcfd]"
    >
      <header className="flex items-center justify-between px-5 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Navigation className="h-4 w-4 text-flare" />路线</h2>
        <button onClick={onClose} aria-label="关闭路线" className="-mr-2 rounded-full p-1.5 text-dust hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
      </header>

      <div className="scroll-quiet min-h-0 overflow-y-auto px-5 pb-5">
        <div className="relative mt-3 flex items-start gap-1">
          <ol className="relative min-w-0 flex-1 space-y-2 before:absolute before:bottom-6 before:left-[7px] before:top-6 before:w-px before:border-l before:border-dashed before:border-dust/60">
            {(['from', 'to'] as const).map((field) => {
              const id = field === 'from' ? fromId : toId;
              return (
                <FieldRow
                  key={field}
                  field={field}
                  id={id}
                  space={id ? byId.get(id) : undefined}
                  active={pickField === field}
                  options={options}
                  onActivate={() => onPickField(field)}
                  onChoose={(sid) => choose(field, sid)}
                  onClear={() => onChange(field, null)}
                />
              );
            })}
          </ol>
          <button
            type="button"
            onClick={onSwap}
            disabled={!fromId && !toId}
            aria-label="交换起点和终点"
            title="交换起点和终点"
            className="mt-[26px] grid h-9 w-9 shrink-0 place-items-center rounded-full text-crater hover:bg-white hover:text-ink disabled:opacity-30"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        {pickField === 'from' && (
          <div className="ml-[27px] mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[12px] text-crater">从入口出发</span>
            {ENTRANCES.map(([id, label]) => (
              <button key={id} type="button" onClick={() => choose('from', id)} className="flex h-8 items-center gap-1 rounded-full border hairline bg-white px-3 text-[12px] font-medium text-ink-soft hover:border-flare/50 hover:text-ink">
                <LocateFixed className="h-3 w-3" />{label}
              </button>
            ))}
          </div>
        )}
        {pickField && <p className="ml-[27px] mt-2 text-[12px] text-dust">也可以直接在地图上点一个房间。</p>}

        {status === 'loading' && (
          <p className="mt-5 flex items-center gap-2 text-[13px] text-crater"><Loader2 className="h-4 w-4 animate-spin" />正在计算路线</p>
        )}
        {status === 'error' && <p className="mt-5 text-[13px] text-alert">路线数据没有加载出来，请检查网络后重试。</p>}
        {status === 'none' && <p className="mt-5 text-[13px] text-crater">按图纸找不到连通这两个地方的路线。</p>}

        {status === 'ready' && route && fromId && toId && (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <p className="text-ink">
                <span className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{Math.round(route.lengthM)}</span>
                <span className="ml-1 text-[13px] text-crater">米</span>
                <span className="ml-3 text-[14px] text-ink-soft">步行约 {route.minutes} 分钟</span>
              </p>
              <button type="button" onClick={onFrameRoute} className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-crater hover:bg-white hover:text-ink">
                <Maximize2 className="h-3.5 w-3.5" />看全程
              </button>
            </div>

            <ol className="mt-4 space-y-2.5 border-t hairline pt-4">
              {steps.map((step, i) => {
                const Icon = step.kind === 'left' ? CornerUpLeft : step.kind === 'right' ? CornerUpRight : MapPin;
                return (
                  <li key={i} className="flex items-start gap-3 text-[13.5px] leading-snug text-ink-soft">
                    {step.kind === 'start'
                      ? <span className="mt-[3px] h-[13px] w-[13px] shrink-0 rounded-full border-[3px] border-ink bg-white" />
                      : <Icon className={`mt-px h-4 w-4 shrink-0 ${step.kind === 'arrive' ? 'text-flare' : 'text-ink'}`} />}
                    <span>{stepText(step, nameOf, nameOf(toId), nameOf(fromId))}</span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 space-y-1 text-[11.5px] leading-relaxed text-dust">
              {route.throughRooms.length > 0 && <p>途中要穿过{spaced(route.throughRooms.map(nameOf).join('、'))}。</p>}
              {route.inferredDoors.length > 0 && <p>{route.inferredDoors.map(nameOf).join('、')}的门洞位置是按图纸门扇推断的。</p>}
              <p>路线按一层平面图（FF-01）推算，门禁和开放时间未核实，以现场为准。</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
