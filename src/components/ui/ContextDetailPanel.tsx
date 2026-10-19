import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, Heart, LocateFixed, Navigation, PenLine, RefreshCw, Share2, X } from 'lucide-react';
import type { CampusEvent, CampusMoment, CampusSpace, EnvironmentalReading } from '../../types/campus';
import { displayCode, displayName, formatTime as time } from './format';

export type DetailTab = 'overview' | 'events' | 'memories';

interface ContextDetailPanelProps {
  space: CampusSpace | null;
  events: CampusEvent[];
  moments: CampusMoment[];
  onClose: () => void;
  onOpenAddMoment: (spaceId: string) => void;
  onLikeMoment: (momentId: string) => void;
  likedIds?: Set<string>;
  tabRequest?: { tab: DetailTab; nonce: number } | null;
  onShare?: (spaceId: string) => void;
  /** Present when the room has a bound sensor: fetch its latest reading now. */
  onRefreshEnvironment?: (spaceId: string) => void;
  refreshingEnvironment?: boolean;
  /** Open the route panel with this room as the destination / the start. */
  onRouteTo?: (spaceId: string) => void;
  onRouteFrom?: (spaceId: string) => void;
}

const CATEGORY_LABEL: Partial<Record<CampusSpace['category'], string>> = {
  arena: '球场', classroom: '教室', laboratory: '实验室', creative_maker: '创作空间', library_reading: '图书与阅读',
  quiet_study: '自习空间', office: '办公与会议', dining: '餐厅', performance_hall: '活动厅', courtyard: '庭院',
  entrance: '入口门厅', health_service: '健康服务', restroom: '卫生间', circulation: '设备与库房',
};
const SERIES_LABEL: Record<string, string> = { M: 'M 区', S: 'S 环', A: 'A 区', CENTRAL: '中心', PUBLIC: '公共区域', SERVICE: '服务区' };
const ACCESS: Partial<Record<CampusSpace['access'], { text: string; dot: string }>> = {
  open: { text: '开放', dot: 'bg-calm' },
  closed: { text: '暂不开放', dot: 'bg-haze' },
  restricted: { text: '需预约', dot: 'bg-flare' },
};
const OCCUPANCY: Partial<Record<CampusSpace['occupancy'], string>> = {
  available: '此刻空闲',
  in_use: '此刻有人在用',
  crowded: '此刻人很多',
};

type Tone = 'good' | 'fair' | 'warn' | 'bad';
const TONE_TEXT: Record<Tone, string> = {
  good: 'text-calm',
  fair: 'text-ink-soft',
  warn: 'text-ember',
  bad: 'text-alert',
};
const TONE_RANK: Record<Tone, number> = { good: 0, fair: 1, warn: 2, bad: 3 };

/** The one sentence the environment block leads with: the most pressing reading, said plainly. */
function environmentHeadline(t: number, h: number, co2: number): { text: string; tone: Tone } {
  const parts = [
    { metric: 'co2' as const, v: verdict('co2', co2) },
    { metric: 'temperature' as const, v: verdict('temperature', t) },
    { metric: 'humidity' as const, v: verdict('humidity', h) },
  ].sort((a, b) => TONE_RANK[b.v.tone] - TONE_RANK[a.v.tone]);
  const worst = parts[0];
  if (TONE_RANK[worst.v.tone] < 2) return { text: '温度、湿度和空气都很舒服。', tone: 'good' };
  const sentence: Record<string, string> = {
    '偏高': '空气有点闷，建议开窗通风。',
    '很闷': '空气很闷，请马上开窗。',
    '偏冷': '有点冷，记得带件外套。',
    '偏暖': '有点热，可以开空调或开窗。',
    '偏热': '很热，注意降温。',
    '干燥': '空气偏干，多喝点水。',
    '潮湿': '有点潮湿。',
  };
  return { text: sentence[worst.v.text] ?? `${worst.v.text}。`, tone: worst.v.tone };
}

/** Turns a reading into the conclusion people actually want: is it OK? */
function verdict(metric: 'temperature' | 'humidity' | 'co2', v: number): { text: string; tone: Tone } {
  if (metric === 'temperature') {
    if (v < 18) return { text: '偏冷', tone: 'warn' };
    if (v < 20) return { text: '微凉', tone: 'fair' };
    if (v <= 26) return { text: '舒适', tone: 'good' };
    if (v <= 28) return { text: '偏暖', tone: 'warn' };
    return { text: '偏热', tone: 'bad' };
  }
  if (metric === 'humidity') {
    if (v < 30) return { text: '干燥', tone: 'warn' };
    if (v <= 60) return { text: '舒适', tone: 'good' };
    return { text: '潮湿', tone: 'warn' };
  }
  if (v < 800) return { text: '清新', tone: 'good' };
  if (v < 1000) return { text: '一般', tone: 'fair' };
  if (v < 1500) return { text: '偏高', tone: 'warn' };
  return { text: '很闷', tone: 'bad' };
}

/** One short status for the environment block. */
function environmentStatus(env: EnvironmentalReading): { text: string; dot: string } | null {
  if (env.source !== 'sensor') return env.sensorHealth === 'offline' ? null : { text: '演示数据', dot: 'bg-haze' };
  if (env.sensorHealth === 'live') return { text: `实时，${env.lastUpdated}更新`, dot: 'live-dot bg-calm' };
  if (env.sensorHealth === 'stale') {
    const unreachable = env.sensorNote?.includes('无法访问');
    return { text: `${unreachable ? '连不上，显示' : ''}${env.lastUpdated}的读数`, dot: 'bg-flare' };
  }
  return { text: '暂无数据', dot: 'bg-haze' };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Small trend line. Demo series are evenly spaced. Sensor series are averaged into
 * 24 hourly bins ending now: hours with data are joined by a solid line, and missing
 * hours are bridged with a faint dashed line so reporting gaps stay visible.
 */
const Trend: React.FC<{ data: number[]; times?: number[]; color: string; label: string }> = ({ data, times, color, label }) => {
  const id = useId();
  if (data.length < 2) return null;
  const w = 100, h = 28;
  const timed = !!times && times.length === data.length;
  let points: Array<[number, number, number]>;
  if (timed) {
    const end = Math.max(Date.now(), times![times!.length - 1]);
    const start = end - 24 * HOUR_MS;
    const sums = new Array(24).fill(0), counts = new Array(24).fill(0);
    data.forEach((v, i) => {
      const bin = Math.floor((times![i] - start) / HOUR_MS);
      if (bin >= 0 && bin < 24) { sums[bin] += v; counts[bin] += 1; }
    });
    points = [];
    for (let b = 0; b < 24; b += 1) if (counts[b]) points.push([(b + 0.5) / 24, sums[b] / counts[b], b]);
    if (points.length === 0) return null;
  } else {
    points = data.map((v, i) => [i / (data.length - 1), v, i]);
  }
  const values = points.map((p) => p[1]);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const xy = points.map(([x, v, b]) => [x * w, h - 3 - ((v - min) / range) * (h - 8), b] as const);
  const solid: string[] = [];
  const dashed: string[] = [];
  for (let i = 1; i < xy.length; i += 1) {
    const seg = `M${xy[i - 1][0].toFixed(1)},${xy[i - 1][1].toFixed(1)}L${xy[i][0].toFixed(1)},${xy[i][1].toFixed(1)}`;
    (timed && xy[i][2] - xy[i - 1][2] > 1 ? dashed : solid).push(seg);
  }
  const [lx, ly] = xy[xy.length - 1];
  const fmt = (n: number) => Number(n.toFixed(1));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${label}近 24 小时在 ${fmt(min)} 到 ${fmt(max)} 之间`} className="h-7 w-full overflow-visible">
      <title>{`近 24 小时${timed ? '每小时平均' : ''}：最低 ${fmt(min)}，最高 ${fmt(max)}${timed ? `。${points.length} 个小时有数据，虚线处没有数据` : ''}`}</title>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!timed && <polygon points={`0,${h} ${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} ${w},${h}`} fill={`url(#${id})`} />}
      {dashed.length > 0 && <path d={dashed.join('')} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
      {solid.length > 0 && <path d={solid.join('')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      <circle cx={lx} cy={ly} r="2.2" fill={color} />
    </svg>
  );
};

export const ContextDetailPanel: React.FC<ContextDetailPanelProps> = ({
  space, events, moments, onClose, onOpenAddMoment, onLikeMoment, likedIds, tabRequest, onShare, onRefreshEnvironment, refreshingEnvironment = false, onRouteTo, onRouteFrom,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<HTMLElement>(null);
  const memoriesRef = useRef<HTMLElement>(null);
  useEffect(() => { setCollapsed(false); scrollRef.current?.scrollTo({ top: 0 }); }, [space?.id]);
  // Requests that used to switch tabs now scroll to that section of the page.
  useEffect(() => {
    if (!tabRequest) return;
    setCollapsed(false);
    const target = tabRequest.tab === 'events' ? eventsRef.current : tabRequest.tab === 'memories' ? memoriesRef.current : null;
    requestAnimationFrame(() => {
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [tabRequest]);
  if (!space) return null;

  const spaceEvents = events.filter((e) => e.spaceId === space.id && e.status !== 'past');
  const spaceMoments = moments.filter((m) => m.spaceId === space.id);
  const live = spaceEvents.find((e) => e.status === 'happening_now');
  const env = space.environment;
  const hasValues = env.sensorHealth !== 'offline';
  const status = environmentStatus(env);
  const code = displayCode(space.id);
  const access = ACCESS[space.access];
  const occupancy = OCCUPANCY[space.occupancy];
  const headcount = !env.isPrivateRoom && space.headcountEstimate !== undefined ? space.headcountEstimate : undefined;
  const fill = space.capacity && headcount !== undefined ? Math.min(1, headcount / space.capacity) : null;
  const headline = hasValues ? environmentHeadline(env.temperature, env.humidity, env.co2) : null;
  const metrics = [
    { key: 'temperature' as const, label: '温度', value: env.temperature, unit: '°C', data: env.temperatureTrend, color: '#e08a3c' },
    { key: 'humidity' as const, label: '湿度', value: env.humidity, unit: '%', data: env.humidityTrend, color: '#4f8fc0' },
    { key: 'co2' as const, label: 'CO₂', value: env.co2, unit: 'ppm', data: env.co2Trend, color: '#2f9e8f' },
  ];
  const kicker = [CATEGORY_LABEL[space.category], SERIES_LABEL[space.series]].filter(Boolean).join('，');
  const iconButton = 'grid h-8 w-8 place-items-center rounded-full text-crater hover:bg-ink/[0.06] hover:text-ink';

  return (
    <aside
      key={space.id}
      aria-label={`${space.id} ${space.name}`}
      className={`room-sheet animate-sheet absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-sheet)]
        right-4 top-[4.75rem] w-[392px] lg:right-6 ${collapsed ? '' : 'bottom-6'}
        max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-3 max-lg:w-auto ${collapsed ? '' : 'max-lg:max-h-[64vh]'}`}
    >
      <header className="relative px-7 pb-6 pt-6">
        <div className="absolute right-4 top-4 flex items-center gap-0.5">
          {onShare && <button onClick={() => onShare(space.id)} aria-label="分享这个房间" title="分享" className={iconButton}><Share2 className="h-4 w-4" /></button>}
          <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? '展开详情' : '收起详情'} className={`${iconButton} lg:hidden`}>
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
          </button>
          <button onClick={onClose} aria-label="关闭详情" className={iconButton}><X className="h-4 w-4" /></button>
        </div>

        {kicker && <p className="text-[12px] text-crater">{kicker}</p>}
        {code ? (
          <>
            <p className="wordmark mt-3 text-[46px] font-semibold leading-[0.92] tracking-[-0.02em] text-ink">{code}</p>
            <h2 className="mt-2.5 text-[21px] font-semibold leading-snug text-ink">{displayName(space)}</h2>
          </>
        ) : (
          <h2 className="mt-3 pr-16 text-[30px] font-semibold leading-tight tracking-[-0.01em] text-ink">{displayName(space)}</h2>
        )}

        {(access || occupancy || space.capacity) && (
          <div className="mt-5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-ink-soft">
              {access && <span className="inline-flex items-center gap-1.5 font-semibold text-ink"><span className={`h-1.5 w-1.5 rounded-full ${access.dot}`} />{access.text}</span>}
              {occupancy && <span>{occupancy}{headcount !== undefined ? `，约 ${headcount} 人` : ''}</span>}
              {space.capacity ? <span className="ml-auto text-crater">可容纳 {space.capacity} 人</span> : null}
            </p>
            {fill !== null && (
              <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-ink/[0.07]" role="img" aria-label={`约 ${headcount} 人，容量 ${space.capacity} 人`}>
                <div className={`h-full rounded-full ${fill > 0.85 ? 'bg-alert' : fill > 0.6 ? 'bg-flare' : 'bg-calm'}`} style={{ width: `${Math.max(3, fill * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </header>

      {!collapsed && (
        <>
          <div ref={scrollRef} className="scroll-quiet flex-1 overflow-y-auto px-7 pb-8">
            {live && (
              <button
                onClick={() => eventsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="group mb-7 block w-full border-l-2 border-flare pl-4 text-left"
              >
                <span className="text-[12px] font-semibold text-ember">正在进行，{time(live.startTime)} 到 {time(live.endTime)}</span>
                <span className="mt-1 block text-[16px] font-semibold leading-snug text-ink group-hover:text-ember">{live.title}</span>
              </button>
            )}

            {space.description && <p className="text-[14.5px] leading-[1.8] text-ink-soft">{space.description}</p>}

            <section aria-labelledby="sheet-env" className="mt-9">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="sheet-env" className="text-[13px] font-semibold text-ink">环境</h3>
                <div className="flex items-center gap-1">
                  {status && <span className="inline-flex items-center gap-1.5 text-[12px] text-crater"><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{refreshingEnvironment ? '正在获取最新数据' : status.text}</span>}
                  {env.source === 'sensor' && onRefreshEnvironment && (
                    <button
                      type="button"
                      onClick={() => onRefreshEnvironment(space.id)}
                      disabled={refreshingEnvironment}
                      aria-label="刷新环境数据"
                      title="获取最新数据"
                      className="-my-1.5 -mr-1.5 grid h-7 w-7 place-items-center rounded-full text-crater transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-flare disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${refreshingEnvironment ? 'animate-refresh' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
              {hasValues && headline ? (
                <>
                  <p className={`mt-3 text-[17px] font-semibold leading-snug ${headline.tone === 'good' ? 'text-ink' : TONE_TEXT[headline.tone]}`}>{headline.text}</p>
                  <div className="mt-5 grid grid-cols-3 gap-5">
                    {metrics.map((m) => {
                      const v = verdict(m.key, m.value);
                      return (
                        <div key={m.key} className="min-w-0">
                          <div className="text-[12px] text-crater">{m.label}</div>
                          <div className="mt-1.5 whitespace-nowrap text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink">
                            {m.value}<span className="ml-0.5 text-[11px] font-medium tracking-normal text-crater">{m.unit}</span>
                          </div>
                          <div className={`mt-1.5 text-[12px] font-medium ${TONE_TEXT[v.tone]}`}>{v.text}</div>
                          <div className="mt-3"><Trend data={m.data} times={env.trendTimes} color={m.color} label={m.label} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-[14px] text-crater">{env.source === 'sensor' ? '传感器暂时连不上，稍后会自动重试，也可以点右上角手动刷新。' : '这个房间没有环境传感器。'}</p>
              )}
              {(hasValues || env.provider) && (
                <p className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-dust">
                  <span title={env.sensorId ? `设备 ${env.sensorId}` : undefined}>{hasValues ? (env.source === 'sensor' ? '曲线为近 24 小时每小时平均' : '演示数据，曲线为近 24 小时') : ''}</span>
                  {env.source === 'sensor' && env.provider && (
                    <a href={env.provider.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-crater underline decoration-ink/20 underline-offset-2 hover:text-ember hover:decoration-ember">
                      数据来源 {env.provider.name}<ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              )}
            </section>

            <section ref={eventsRef} aria-labelledby="sheet-events" className="mt-10 scroll-mt-4">
              <h3 id="sheet-events" className="text-[13px] font-semibold text-ink">活动{spaceEvents.length > 0 && <span className="ml-1.5 font-normal text-dust">{spaceEvents.length}</span>}</h3>
              {spaceEvents.length === 0 ? (
                <p className="mt-3 text-[14px] text-crater">近期没有活动安排。</p>
              ) : (
                <ol className="mt-4 space-y-5">
                  {spaceEvents.map((e) => {
                    const isLive = e.status === 'happening_now';
                    return (
                      <li key={e.id} className="grid grid-cols-[3.25rem_1fr] gap-x-4">
                        <div className="pt-0.5 text-right tabular-nums">
                          <div className={`text-[14px] font-semibold ${isLive ? 'text-ember' : 'text-ink'}`}>{time(e.startTime)}</div>
                          <div className="text-[12px] text-dust">{time(e.endTime)}</div>
                        </div>
                        <div className="min-w-0 border-l border-ink/10 pl-4">
                          <p className="text-[15px] font-semibold leading-snug text-ink">{e.title}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{e.description}</p>
                          <p className="mt-1.5 text-[12px] text-crater">{isLive ? '正在进行，' : ''}{e.organizer}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            <section ref={memoriesRef} aria-labelledby="sheet-memories" className="mt-10 scroll-mt-4">
              <div className="flex items-baseline justify-between">
                <h3 id="sheet-memories" className="text-[13px] font-semibold text-ink">回忆{spaceMoments.length > 0 && <span className="ml-1.5 font-normal text-dust">{spaceMoments.length}</span>}</h3>
              </div>
              {spaceMoments.length === 0 ? (
                <p className="mt-3 text-[14px] text-crater">还没有人在这里留下回忆。</p>
              ) : (
                <ul className="mt-4 space-y-7">
                  {spaceMoments.map((m) => {
                    const liked = likedIds?.has(m.id) ?? false;
                    return (
                      <li key={m.id} className={m.timeAgo === '刚刚' ? 'animate-rise' : ''}>
                        {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-3 aspect-[4/3] w-full rounded-[14px] object-cover" />}
                        <blockquote className="text-[15px] leading-[1.75] text-ink">{m.content}</blockquote>
                        <div className="mt-2 flex items-center justify-between text-[12px] text-crater">
                          <span>{m.author}，{m.timeAgo}</span>
                          <button
                            onClick={() => onLikeMoment(m.id)}
                            aria-pressed={liked}
                            aria-label={`${liked ? '取消喜欢' : '喜欢'}，当前 ${m.likes}`}
                            className={`-mr-1 inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 ${liked ? 'text-ember' : 'hover:text-ember'}`}
                          >
                            <Heart className={`h-3.5 w-3.5 transition-transform duration-200 ${liked ? 'scale-110 fill-flare text-flare' : ''}`} />{m.likes}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <footer className="relative px-5 pb-5 pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-[#fbfcfd] before:to-transparent">
            {(onRouteTo || onRouteFrom) && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {onRouteTo && (
                  <button onClick={() => onRouteTo(space.id)} className="flex h-10 items-center justify-center gap-1.5 rounded-full border hairline bg-white text-[13px] font-medium text-ink hover:border-ink/25">
                    <Navigation className="h-3.5 w-3.5 text-flare" />到这里去
                  </button>
                )}
                {onRouteFrom && (
                  <button onClick={() => onRouteFrom(space.id)} className="flex h-10 items-center justify-center gap-1.5 rounded-full border hairline bg-white text-[13px] font-medium text-ink-soft hover:border-ink/25 hover:text-ink">
                    <LocateFixed className="h-3.5 w-3.5" />从这里出发
                  </button>
                )}
              </div>
            )}
            <button onClick={() => onOpenAddMoment(space.id)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-flare text-[14px] font-semibold text-white hover:bg-ember">
              <PenLine className="h-4 w-4" />在这里留下回忆
            </button>
          </footer>
        </>
      )}
    </aside>
  );
};
