import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, Clock, Heart, Navigation, PenLine, Users, X } from 'lucide-react';
import type { CampusEvent, CampusMoment, CampusSpace } from '../../types/campus';
import { displayCode, displayName, formatTime as time } from './format';

interface ContextDetailPanelProps {
  space: CampusSpace | null;
  events: CampusEvent[];
  moments: CampusMoment[];
  onClose: () => void;
  onNavigateTo: (spaceId: string) => void;
  onOpenAddMoment: (spaceId: string) => void;
  onLikeMoment: (momentId: string) => void;
}

const CATEGORY_LABEL: Partial<Record<CampusSpace['category'], string>> = {
  arena: '球场', classroom: '教室', laboratory: '实验室', creative_maker: '创作空间', library_reading: '图书与阅读',
  quiet_study: '自习空间', office: '办公与会议', dining: '餐厅', performance_hall: '活动厅', courtyard: '庭院',
  entrance: '入口门厅', health_service: '健康服务', restroom: '卫生间', circulation: '设备与库房',
};
const SERIES_LABEL: Record<string, string> = { M: 'M 区', S: 'S 环', A: 'A 区', CENTRAL: '中心', PUBLIC: '公共区域', SERVICE: '服务区' };
const ACCESS: Record<CampusSpace['access'], { text: string; tone: string }> = {
  open: { text: '开放', tone: 'text-calm' },
  closed: { text: '暂不开放', tone: 'text-crater' },
  restricted: { text: '需预约', tone: 'text-ember' },
  unknown: { text: '待确认', tone: 'text-crater' },
};
const OCCUPANCY: Record<CampusSpace['occupancy'], { text: string; tone: string }> = {
  available: { text: '空闲', tone: 'text-calm' },
  in_use: { text: '使用中', tone: 'text-ink' },
  crowded: { text: '人很多', tone: 'text-alert' },
  unknown: { text: '未知', tone: 'text-crater' },
};


/** 24-hour trend with a soft area fill; the current value is the last point. */
const Trend: React.FC<{ data: number[]; color: string; label: string }> = ({ data, color, label }) => {
  const id = useId();
  if (data.length < 2) return null;
  const w = 132, h = 34;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / range) * (h - 8)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}过去 24 小时在 ${min} 到 ${max} 之间`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.6" fill="#fff" stroke={color} strokeWidth="1.6" />
    </svg>
  );
};

export const ContextDetailPanel: React.FC<ContextDetailPanelProps> = ({
  space, events, moments, onClose, onNavigateTo, onOpenAddMoment, onLikeMoment,
}) => {
  const [tab, setTab] = useState<'now' | 'past' | 'next'>('now');
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(false); setTab('now'); }, [space?.id]);
  if (!space) return null;

  const spaceEvents = events.filter((e) => e.spaceId === space.id && e.status !== 'past');
  const spaceMoments = moments.filter((m) => m.spaceId === space.id);
  const env = space.environment;
  const hasSensors = env.sensorHealth !== 'offline';
  const live = spaceEvents.find((e) => e.status === 'happening_now');
  const facts = [
    { label: '准入', value: ACCESS[space.access].text, tone: ACCESS[space.access].tone },
    { label: '此刻', value: OCCUPANCY[space.occupancy].text, tone: OCCUPANCY[space.occupancy].tone },
    { label: '面积', value: space.areaM2 ? `${space.areaM2} m²` : '—', tone: 'text-ink' },
  ];
  const tabs = [
    { id: 'now' as const, label: '此刻' },
    { id: 'past' as const, label: '回忆', count: spaceMoments.length },
    { id: 'next' as const, label: '接下来', count: spaceEvents.length },
  ];

  return (
    <aside
      key={space.id}
      aria-label={`${space.id} ${space.name}`}
      className={`glass animate-sheet !bg-[rgb(247_248_250/0.95)] absolute z-30 flex flex-col overflow-hidden rounded-[var(--radius-sheet)]
        right-4 top-[4.75rem] w-[400px] lg:right-6 ${collapsed ? '' : 'bottom-6'}
        max-lg:inset-x-3 max-lg:top-auto max-lg:bottom-3 max-lg:w-auto ${collapsed ? '' : 'max-lg:max-h-[62vh]'}`}
    >
      {/* Identity */}
      <header className="relative px-6 pb-5 pt-5">
        <div className="flex items-center justify-between text-[12px] text-crater">
          <span>{[CATEGORY_LABEL[space.category], SERIES_LABEL[space.series]].filter(Boolean).join('，')}</span>
          <div className="-mr-2 flex items-center">
            <button onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? '展开详情' : '收起详情'} className="rounded-full p-1.5 text-dust transition-colors hover:bg-white hover:text-ink">
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
            </button>
            <button onClick={onClose} aria-label="关闭详情" className="rounded-full p-1.5 text-dust transition-colors hover:bg-white hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-end gap-4">
          <span className="wordmark text-[44px] font-semibold leading-[0.9] text-ink">{displayCode(space.id)}</span>
          {live && (
            <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-flare-wash px-2.5 py-1 text-[11px] font-semibold text-ember">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-flare" />进行中
            </span>
          )}
        </div>
        <h2 className="mt-3 text-xl font-semibold leading-snug text-ink">{displayName(space)}</h2>
        {space.englishName && <p className="mt-0.5 text-[13px] text-crater">{space.englishName}</p>}

        {!collapsed && (
          <dl className="mt-5 grid grid-cols-3 divide-x divide-ink/10 border-y hairline">
            {facts.map((fact) => (
              <div key={fact.label} className="px-3 py-2.5 first:pl-0">
                <dt className="text-[11px] text-crater">{fact.label}</dt>
                <dd className={`mt-0.5 text-[15px] font-semibold ${fact.tone}`}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </header>

      {!collapsed && (
        <>
          <div className="px-6" role="tablist" aria-label="空间内容">
            <div className="flex gap-5 border-b hairline">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative -mb-px pb-2.5 text-[14px] font-medium transition-colors ${tab === t.id ? 'text-ink' : 'text-crater hover:text-ink'}`}
                >
                  {t.label}
                  {!!t.count && <span className="ml-1 text-[12px] text-dust">{t.count}</span>}
                  {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-flare" />}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll-quiet flex-1 overflow-y-auto px-6 py-5" role="tabpanel">
            {tab === 'now' && (
              <div className="space-y-6">
                <p className="text-[14px] leading-[1.75] text-ink-soft">{space.description}</p>

                {live && (
                  <button onClick={() => setTab('next')} className="w-full rounded-[var(--radius-tile)] bg-flare-wash p-4 text-left transition-colors hover:bg-[#ffe9d6]">
                    <span className="text-[12px] font-semibold text-ember">正在这里发生</span>
                    <span className="mt-1 block text-[15px] font-semibold text-ink">{live.title}</span>
                    <span className="mt-1 block text-[12px] text-crater">{time(live.startTime)} 至 {time(live.endTime)}，{live.organizer}</span>
                  </button>
                )}

                <section>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[13px] font-semibold text-ink">环境</h3>
                    {hasSensors && <span className="text-[11px] text-dust">演示数据，{env.lastUpdated}更新</span>}
                  </div>
                  {hasSensors ? (
                    <ul className="mt-2 divide-y divide-ink/10">
                      {[
                        { label: '温度', value: env.temperature, unit: '°C', data: env.temperatureTrend, color: '#e08a3c' },
                        { label: '湿度', value: env.humidity, unit: '%', data: env.humidityTrend, color: '#4f8fc0' },
                        { label: 'CO₂', value: env.co2, unit: 'ppm', data: env.co2Trend, color: '#2f9e8f' },
                      ].map((m) => (
                        <li key={m.label} className="flex items-center justify-between py-3">
                          <div>
                            <div className="text-[12px] text-crater">{m.label}</div>
                            <div className="mt-0.5 text-[20px] font-semibold leading-none text-ink">
                              {m.value}<span className="ml-0.5 text-[12px] font-medium text-crater">{m.unit}</span>
                            </div>
                          </div>
                          <Trend data={m.data} color={m.color} label={m.label} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-crater">这个房间还没有接入传感器。</p>
                  )}
                </section>

                {space.occupancy !== 'unknown' && (
                  <section className="flex items-center justify-between border-t hairline pt-4 text-[13px]">
                    <span className="flex items-center gap-2 text-crater"><Users className="h-4 w-4" />人数</span>
                    {env.isPrivateRoom ? (
                      <span className="text-crater">出于隐私不显示实时人数</span>
                    ) : (
                      <span className="text-ink">
                        约 <strong className="font-semibold">{space.headcountEstimate ?? 0}</strong> 人{space.capacity ? `，可容纳 ${space.capacity} 人` : ''}
                      </span>
                    )}
                  </section>
                )}

                {space.features.length > 0 && (
                  <section>
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

            {tab === 'past' && (
              spaceMoments.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-[14px] text-ink-soft">这里还没有人留下回忆。</p>
                  <button onClick={() => onOpenAddMoment(space.id)} className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft">写下第一条</button>
                </div>
              ) : (
                <ul className="space-y-5">
                  {spaceMoments.map((m) => (
                    <li key={m.id} className="border-b hairline pb-5 last:border-0">
                      <div className="flex items-baseline justify-between text-[12px]">
                        <span className="font-semibold text-ink">{m.author}</span>
                        <span className="text-dust">{m.timeAgo}</span>
                      </div>
                      {m.imageUrl && <img src={m.imageUrl} alt="" className="mt-3 aspect-[4/3] w-full rounded-[12px] object-cover" />}
                      <p className="mt-2 text-[14px] leading-[1.75] text-ink-soft">{m.content}</p>
                      <button onClick={() => onLikeMoment(m.id)} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-crater transition-colors hover:text-ember" aria-label={`喜欢，当前 ${m.likes}`}>
                        <Heart className="h-3.5 w-3.5" />{m.likes}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === 'next' && (
              spaceEvents.length === 0 ? (
                <p className="py-10 text-center text-[14px] text-ink-soft">近期没有安排。空闲时可以来这里自习或讨论。</p>
              ) : (
                <ul className="space-y-3">
                  {spaceEvents.map((e) => (
                    <li key={e.id} className="relative pl-4">
                      <span className={`absolute left-0 top-1.5 h-[calc(100%-0.5rem)] w-0.5 rounded-full ${e.status === 'happening_now' ? 'bg-flare' : 'bg-glow'}`} />
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className={e.status === 'happening_now' ? 'font-semibold text-ember' : 'text-crater'}>{e.status === 'happening_now' ? '进行中' : '即将开始'}</span>
                        <span className="flex items-center gap-1 text-dust"><Clock className="h-3 w-3" />{time(e.startTime)}</span>
                      </div>
                      <p className="mt-1 text-[15px] font-semibold text-ink">{e.title}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{e.description}</p>
                      <p className="mt-1.5 text-[12px] text-crater">{e.organizer}</p>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <footer className="flex gap-2 border-t hairline p-4">
            <button onClick={() => onOpenAddMoment(space.id)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-flare text-[14px] font-semibold text-white shadow-[0_10px_24px_-12px_rgb(211_84_0/0.9)] transition-colors hover:bg-ember">
              <PenLine className="h-4 w-4" />留下回忆
            </button>
            <button onClick={() => onNavigateTo(space.id)} className="flex h-11 items-center gap-2 rounded-full border hairline bg-white/70 px-4 text-[14px] font-medium text-ink-soft transition-colors hover:bg-white hover:text-ink">
              <Navigation className="h-4 w-4" />路线
            </button>
          </footer>
        </>
      )}
    </aside>
  );
};
