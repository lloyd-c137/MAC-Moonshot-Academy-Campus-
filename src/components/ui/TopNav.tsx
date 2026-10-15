import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Search, Sparkles, X } from 'lucide-react';
import type { CampusEvent, CampusSpace } from '../../types/campus';
import { displayCode, displayName } from './format';

interface TopNavProps {
  spaces: CampusSpace[];
  events: CampusEvent[];
  onSelectSpace: (spaceId: string) => void;
  onOpenFindSpot: () => void;
}

type Result =
  | { kind: 'space'; key: string; spaceId: string; title: string; code: string; detail: string }
  | { kind: 'event'; key: string; spaceId: string; title: string; detail: string; live: boolean };

const CATEGORY_LABEL: Partial<Record<CampusSpace['category'], string>> = {
  arena: '球场', classroom: '教室', laboratory: '实验室', creative_maker: '创作空间', library_reading: '阅读',
  quiet_study: '自习', office: '办公', dining: '餐饮', performance_hall: '活动厅', courtyard: '庭院',
  entrance: '入口', health_service: '健康服务', restroom: '卫生间', circulation: '设备与库房',
};

const FAVOURITES = ['A114', 'S407', 'S404', 'M104', 'M103'];

/** Shown when the box is focused but empty: what is on now, then places people often look for. */
function suggestions(spaces: CampusSpace[], events: CampusEvent[]): Result[] {
  const live = events.filter((e) => e.status === 'happening_now').slice(0, 3)
    .map<Result>((e) => ({ kind: 'event', key: `e-${e.id}`, spaceId: e.spaceId, title: e.title, detail: e.spaceName, live: true }));
  const places = FAVOURITES.map((id) => spaces.find((s) => s.id === id)).filter((s): s is CampusSpace => !!s)
    .map<Result>((s) => ({ kind: 'space', key: `s-${s.id}`, spaceId: s.id, code: displayCode(s.id), title: displayName(s),
      detail: s.environment.source === 'sensor' && s.environment.sensorHealth !== 'offline' ? '有传感器数据' : CATEGORY_LABEL[s.category] ?? '' }));
  return [...live, ...places];
}

function search(query: string, spaces: CampusSpace[], events: CampusEvent[]): Result[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggestions(spaces, events);
  const spaceHits = spaces
    .filter((s) =>
      s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) ||
      s.englishName?.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.id.toLowerCase().startsWith(q)) - Number(!b.id.toLowerCase().startsWith(q)))
    .slice(0, 7)
    .map<Result>((s) => ({
      kind: 'space', key: `s-${s.id}`, spaceId: s.id, code: displayCode(s.id), title: displayName(s),
      detail: [CATEGORY_LABEL[s.category], s.areaM2 ? `${s.areaM2} m²` : null].filter(Boolean).join('，'),
    }));
  const eventHits = events
    .filter((e) => e.status !== 'past' && (e.title.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))))
    .slice(0, 3)
    .map<Result>((e) => ({ kind: 'event', key: `e-${e.id}`, spaceId: e.spaceId, title: e.title, detail: e.spaceName, live: e.status === 'happening_now' }));
  return [...spaceHits, ...eventHits];
}

export const TopNav: React.FC<TopNavProps> = ({
  spaces, events, onSelectSpace, onOpenFindSpot,
}) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => search(query, spaces, events), [query, spaces, events]);
  const open = focused;
  const isSuggesting = query.trim().length === 0;

  useEffect(() => setActive(0), [query]);

  // "/" focuses search from anywhere outside a text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    onSelectSpace(result.spaceId);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[active]); }
    else if (event.key === 'Escape') { event.stopPropagation(); setQuery(''); inputRef.current?.blur(); }
  };

  const capsuleButton = 'flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors';

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-3 p-4 lg:px-6">
      {/* Brand */}
      <a href="/" className="glass pointer-events-auto flex h-11 shrink-0 items-center gap-2.5 rounded-full pl-1.5 pr-4" aria-label="Moonshot Academy Campus 首页">
        <img src="/brand/mac-logo-256.png" alt="" className="h-8 w-8" />
        <span className="wordmark hidden text-[13px] font-semibold text-ink sm:inline">Moonshot Academy Campus</span>
      </a>

      {/* Search */}
      <div className="pointer-events-auto relative mx-auto w-full max-w-[460px] min-w-0">
        <label className={`glass flex h-11 items-center gap-2.5 rounded-full px-4 transition-shadow ${focused ? 'ring-2 ring-flare/40' : ''}`}>
          <Search className="h-4 w-4 shrink-0 text-dust" aria-hidden="true" />
          <span className="sr-only">搜索房间、书院或活动</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls="campus-search-results"
            aria-activedescendant={open && results[active] ? `search-${results[active].key}` : undefined}
            placeholder="搜索房间、书院或活动"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dust [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="清空搜索" className="rounded-full p-0.5 text-dust hover:text-ink"><X className="h-4 w-4" /></button>
          ) : (
            <kbd className="hidden rounded-md border hairline px-1.5 text-[11px] font-medium text-dust sm:block">/</kbd>
          )}
        </label>

        {open && (
          <div id="campus-search-results" role="listbox" className="glass animate-rise absolute inset-x-0 top-[3.25rem] overflow-hidden rounded-[var(--radius-tile)] py-1.5">
            {isSuggesting && <p className="px-4 pb-1 pt-1.5 text-[12px] text-crater">正在进行和常去的地方</p>}
            {results.length === 0 ? (
              <p className="px-4 py-5 text-sm text-crater">没有找到“{query.trim()}”。试试房间号，比如 M104，或者“自习”“实验室”。</p>
            ) : (
              results.map((result, index) => (
                <button
                  key={result.key}
                  id={`search-${result.key}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(result)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${index === active ? 'bg-white' : ''}`}
                >
                  {result.kind === 'space' ? (
                    <span className="wordmark w-16 shrink-0 text-[12px] font-semibold text-ink-soft">{result.code}</span>
                  ) : (
                    <span className="flex w-16 shrink-0 items-center gap-1.5 text-[12px] font-medium text-ember">
                      <CalendarDays className="h-3.5 w-3.5" />{result.live ? '进行中' : '活动'}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{result.title}</span>
                    {result.detail && <span className="block truncate text-xs text-crater">{result.detail}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        <button
          onClick={onOpenFindSpot}
          className={`${capsuleButton} bg-flare text-white shadow-[0_10px_24px_-10px_rgb(211_84_0/0.8)] hover:bg-ember max-sm:w-11 max-sm:justify-center max-sm:px-0`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="max-sm:sr-only">找空间</span>
        </button>
      </div>
    </header>
  );
};
