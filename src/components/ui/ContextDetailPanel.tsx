import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, Clock, ExternalLink, Heart, PenLine, Share2, X } from 'lucide-react';
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
}

const CATEGORY_LABEL: Partial<Record<CampusSpace['category'], string>> = {
  arena: '球场', classroom: '教室', laboratory: '实验室', creative_maker: '创作空间', library_reading: '图书与阅读',
  quiet_study: '自习空间', office: '办公与会议', dining: '餐厅', performance_hall: '活动厅', courtyard: '庭院',
  entrance: '入口门厅', health_service: '健康服务', restroom: '卫生间', circulation: '设备与库房',
};
const SERIES_LABEL: Record<string, string> = { M: 'M 区', S: 'S 环', A: 'A 区', CENTRAL: '中心', PUBLIC: '公共区域', SERVICE: '服务区' };
const ACCESS: Partial<Record<CampusSpace['access'], { text: string; tone: string }>> = {
  open: { text: '开放', tone: 'text-calm' },
  closed: { text: '暂不开放', tone: 'text-crater' },
  restricted: { text: '需预约', tone: 'text-ember' },
};
const OCCUPANCY: Partial<Record<CampusSpace['occupancy'], { text: string; tone: string }>> = {
  available: { text: '空闲', tone: 'text-calm' },
  in_use: { text: '使用中', tone: 'text-ink' },
  crowded: { text: '人很多', tone: 'text-alert' },
};

type Tone = 'good' | 'fair' | 'warn' | 'bad';
const TONE_CLASS: Record<Tone, string> = {
  good: 'bg-calm/10 text-calm',
  fair: 'bg-regolith text-ink-soft',
  warn: 'bg-flare-wash text-ember',
  bad: 'bg-alert/10 text-alert',
};

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
  if (v < 800) return { text: '空气清新', tone: 'good' };
  if (v < 1000) return { text: '一般', tone: 'fair' };
  if (v < 1500) return { text: '偏高，建议通风', tone: 'warn' };
  return { text: '很闷，请开窗', tone: 'bad' };
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
  const w = 112, h = 32;
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}近 24 小时在 ${fmt(min)} 到 ${fmt(max)} 之间`} className="shrink-0 overflow-visible">
      <title>{`近 24 小时${timed ? '每小时平均' : ''}：最低 ${fmt(min)}，最高 ${fmt(max)}${timed ? `。${points.length} 个小时有数据，虚线处没有数据` : ''}`}</title>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!timed && <polygon points={`0,${h} ${xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} ${w},${h}`} fill={`url(#${id})`} />}
      {dashed.length > 0 && <path d={dashed.join('')} fill="none" stroke={color} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 3" />}
      {solid.length > 0 && <path d={solid.join('')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
      {timed && xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.4" fill={color} />)}
      <circle cx={lx} cy={ly} r="2.6" fill="#fff" stroke={color} strokeWidth="1.6" />
    </svg>
  );
};

export const ContextDetailPanel: React.FC<ContextDetailPanelProps> = ({
  space, events, moments, onClose, onOpenAddMoment, onLikeMoment, likedIds, tabRequest, onShare,
}) => {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(false); setTab('overview'); }, [space?.id]);
  useEffect(() => { if (tabRequest) { setCollapsed(false); setTab(tabRequest.tab); } }, [tabRequest]);
  if (!space) return null;

  const spaceEvents = events.filter((e) => e.spaceId === space.id && e.status !== 'past');
  const spaceMoments = moments.filter((m) => m.spaceId === space.id);
  const live = spaceEvents.find((e) => e.status === 'happening_now');
  const env = space.environment;
  const hasValues = env.sensorHealth !== 'offline';
  const status = environmentStatus(env);
  const capturedAt = env.capturedAt
    ? new Date(env.capturedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' })
    : null;

  // Only facts we actually know; unknowns are left out rather than shown as "未知".
  const facts = [
    ACCESS[space.access] && { label: '准入', value: ACCESS[space.access]!.text, tone: ACCESS[space.access]!.tone },
    OCCUPANCY[space.occupancy] && {
      label: '此刻', value: OCCUPANCY[space.occupancy]!.text, tone: OCCUPANCY[space.occupancy]!.tone,
      sub: !env.isPrivateRoom && space.headcountEstimate !== undefined ? `约 ${space.headcountEstimate} 人` : undefined,
    },
    space.capacity
      ? { label: '容纳', value: `${space.capacity} 人`, tone: 'text-ink' }
      : space.areaM2 ? { label: '面积', value: `${space.areaM2} m²`, tone: 'text-ink' } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; tone: string; sub?: string }>;

  const tabs: Array<{ id: DetailTab; label: string; count?: number }> = [
    { id: 'overview', label: '概况' },
    { id: 'events', label: '活动', count: spaceEvents.length },
    { id: 'memories', label: '回忆', count: spaceMoments.length },
  ];
  const metrics = [
    { key: 'temperature' as const, label: '温度', value: env.temperature, unit: '°C', data: env.temperatureTrend, color: '#e08a3c' },
    { key: 'humidity' as const, label: '湿度', value: env.humidity, unit: '%', data: env.humidityTrend, color: '#4f8fc0' },
    { key: 'co2' as const, label: 'CO₂', value: env.co2, unit: 'ppm', data: env.co2Trend, color: '#2f9e8f' },
  ];

  return (
    <aside
      key={space.id}
      aria-label={`${space.id} ${space.name}`}
      className={`glass animate-sheet !bg-[rgb(247_248_250/0.95)] absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-sheet)]
        right-4 top-[4.75rem] w-[400px] lg:right-6 ${collapsed ? '' : 'bottom-6'}
        max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-3 max-lg:w-auto ${collapsed ? '' : 'max-lg:max-h-[62vh]'}`}
    >
      <header className="px-6 pb-5 pt-5">
        <div className="flex items-center justify-between text-[12px] text-crater">
          <span>{[CATEGORY_LABEL[space.category], SERIES_LABEL[space.series]].filter(Boolean).join('，')}</span>
          <div className="-mr-2 flex items-center">
            <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? '展开详情' : '收起详情'} className="rounded-full p-1.5 text-dust hover:bg-white hover:text-ink lg:hidden">
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
            </button>
            <button onClick={onClose} aria-label="关闭详情" className="rounded-full p-1.5 text-dust hover:bg-white hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-3">
          {displayCode(space.id)
            ? <span className="wordmark text-[44px] font-semibold leading-[0.9] text-ink">{displayCode(space.id)}</span>
            : <span className="text-[30px] font-semibold leading-tight text-ink">{displayName(space)}</span>}
          {live && (
            <button onClick={() => setTab('events')} className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-flare-wash px-2.5 py-1 text-[11px] font-semibold text-ember hover:bg-[#ffe9d6]">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-flare" />活动进行中
            </button>
          )}
        </div>
        {displayCode(space.id) ? <h2 className="mt-3 text-xl font-semibold leading-snug text-ink">{displayName(space)}</h2> : <h2 className="sr-only">{displayName(space)}</h2>}

        {!collapsed && facts.length > 0 && (
          <dl className={`mt-5 grid divide-x divide-ink/10 border-y hairline ${facts.length === 3 ? 'grid-cols-3' : facts.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {facts.map((fact) => (
              <div key={fact.label} className="px-3 py-2.5 first:pl-0">
                <dt className="text-[11px] text-crater">{fact.label}</dt>
                <dd className={`mt-0.5 text-[15px] font-semibold ${fact.tone}`}>
                  {fact.value}
                  {fact.sub && <span className="block text-[12px] font-normal text-crater">{fact.sub}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {!collapsed && (
        <>
          <div className="px-6" role="tablist" aria-label="房间内容">
            <div className="flex gap-6 border-b hairline">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative -mb-px pb-2.5 text-[14px] font-medium ${tab === t.id ? 'text-ink' : 'text-crater hover:text-ink'}`}
                >
                  {t.label}
                  {!!t.count && <span className="ml-1 text-[12px] text-dust">{t.count}</span>}
                  {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-flare" />}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll-quiet flex-1 overflow-y-auto px-6 py-5" role="tabpanel">
            {tab === 'overview' && (
              <div className="space-y-6">
                {live && (
                  <button onClick={() => setTab('events')} className="w-full rounded-[var(--radius-tile)] bg-flare-wash p-4 text-left hover:bg-[#ffe9d6]">
                    <span className="text-[12px] font-semibold text-ember">正在这里：{time(live.startTime)} 至 {time(live.endTime)}</span>
                    <span className="mt-1 block text-[15px] font-semibold text-ink">{live.title}</span>
                  </button>
                )}

                {space.description && <p className="text-[14px] leading-[1.75] text-ink-soft">{space.description}</p>}

                <section aria-label="环境">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-ink">环境</h3>
                    {status && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-crater">
                        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.text}
                      </span>
                    )}
                  </div>

                  {hasValues ? (
                    <ul className="mt-1 divide-y divide-ink/10">
                      {metrics.map((m) => {
                        const v = verdict(m.key, m.value);
                        return (
                          <li key={m.key} className="flex items-center gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] text-crater">{m.label}</div>
                              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="text-[20px] font-semibold leading-none text-ink">
                                  {m.value}<span className="ml-0.5 text-[12px] font-medium text-crater">{m.unit}</span>
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS[v.tone]}`}>{v.text}</span>
                              </div>
                            </div>
                            <Trend data={m.data} times={env.trendTimes} color={m.color} label={m.label} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-crater">{env.source === 'sensor' ? '传感器暂时连不上，稍后会自动重试。' : '这个房间没有环境传感器。'}</p>
                  )}

                  {env.source === 'sensor' && (
                    <p className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-dust">
                      <span title={env.sensorId ? `设备 ${env.sensorId}${capturedAt ? `，读数时间 ${capturedAt}` : ''}` : undefined}>
                        {hasValues ? '右侧为近 24 小时每小时平均' : ''}
                      </span>
                      {env.provider && (
                        <a href={env.provider.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-crater underline decoration-ink/20 underline-offset-2 hover:text-ember hover:decoration-ember">
                          数据来源 {env.provider.name}<ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  )}
                </section>

                {space.features.length > 0 && (
                  <section aria-label="设施">
                    <h3 className="text-[13px] font-semibold text-ink">设施</h3>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {space.features.map((feature) => (
                        <li key={feature} className="rounded-full border hairline bg-white/60 px-3 py-1 text-[12px] text-ink-soft">{feature}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {tab === 'events' && (
              spaceEvents.length === 0 ? (
                <p className="py-10 text-center text-[14px] text-ink-soft">近期没有活动安排。</p>
              ) : (
                <ul className="space-y-4">
                  {spaceEvents.map((e) => (
                    <li key={e.id} className="relative pl-4">
                      <span className={`absolute left-0 top-1.5 h-[calc(100%-0.5rem)] w-0.5 rounded-full ${e.status === 'happening_now' ? 'bg-flare' : 'bg-glow'}`} />
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className={e.status === 'happening_now' ? 'font-semibold text-ember' : 'text-crater'}>{e.status === 'happening_now' ? '进行中' : '即将开始'}</span>
                        <span className="flex items-center gap-1 text-crater"><Clock className="h-3 w-3" />{time(e.startTime)} 至 {time(e.endTime)}</span>
                      </div>
                      <p className="mt-1 text-[15px] font-semibold text-ink">{e.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{e.description}</p>
                      <p className="mt-1.5 text-[12px] text-crater">{e.organizer}</p>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === 'memories' && (
              spaceMoments.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-ink-soft">还没有人在这里留下回忆。</p>
                  <button onClick={() => onOpenAddMoment(space.id)} className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft">写第一条</button>
                </div>
              ) : (
                <ul className="space-y-5">
                  {spaceMoments.map((m) => {
                    const liked = likedIds?.has(m.id) ?? false;
                    return (
                      <li key={m.id} className={`border-b hairline pb-5 last:border-0 ${m.timeAgo === '刚刚' ? 'animate-rise' : ''}`}>
                        <div className="flex items-baseline justify-between text-[12px]">
                          <span className="font-semibold text-ink">{m.author}</span>
                          <span className="text-dust">{m.timeAgo}</span>
                        </div>
                        {m.imageUrl && <img src={m.imageUrl} alt="" className="mt-3 aspect-[4/3] w-full rounded-[12px] object-cover" />}
                        <p className="mt-2 text-[14px] leading-[1.75] text-ink-soft">{m.content}</p>
                        <button
                          onClick={() => onLikeMoment(m.id)}
                          aria-pressed={liked}
                          aria-label={`${liked ? '取消喜欢' : '喜欢'}，当前 ${m.likes}`}
                          className={`mt-2 inline-flex items-center gap-1.5 text-[12px] ${liked ? 'text-ember' : 'text-crater hover:text-ember'}`}
                        >
                          <Heart className={`h-3.5 w-3.5 transition-transform duration-200 ${liked ? 'scale-110 fill-flare text-flare' : ''}`} />{m.likes}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>

          <footer className="flex gap-2 border-t hairline p-4">
            <button onClick={() => onOpenAddMoment(space.id)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-flare text-[14px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(211_84_0/0.9)] hover:bg-ember">
              <PenLine className="h-4 w-4" />留下回忆
            </button>
            {onShare && (
              <button onClick={() => onShare(space.id)} className="flex h-11 items-center gap-2 rounded-full border hairline bg-white/70 px-4 text-[14px] font-medium text-ink-soft hover:bg-white hover:text-ink">
                <Share2 className="h-4 w-4" />分享
              </button>
            )}
          </footer>
        </>
      )}
    </aside>
  );
};
