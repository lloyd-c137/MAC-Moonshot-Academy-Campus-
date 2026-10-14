import React, { useEffect, useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Navigation,
  Sparkles,
  Thermometer,
  Droplets,
  Cloud,
  Clock,
  Shield,
  Users,
  CheckCircle2,
  Calendar,
  MessageSquare,
  PlusCircle,
  Heart,
} from 'lucide-react';
import { CampusSpace, CampusEvent, CampusMoment } from '../../types/campus';

interface ContextDetailPanelProps {
  space: CampusSpace | null;
  events: CampusEvent[];
  moments: CampusMoment[];
  onClose: () => void;
  onNavigateTo: (spaceId: string) => void;
  onOpenAddMoment: (spaceId: string) => void;
  onLikeMoment: (momentId: string) => void;
}

// Mini SVG Sparkline renderer for 24-hour environmental trends
const Sparkline: React.FC<{ data: number[]; color: string; unit: string }> = ({ data, color, unit }) => {
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 140;
  const height = 28;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} className="overflow-visible">
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
      <div className="text-[11px] font-mono text-neutral-400 tabular-nums">
        {min} ~ {max}
        {unit}
      </div>
    </div>
  );
};

export const ContextDetailPanel: React.FC<ContextDetailPanelProps> = ({
  space,
  events,
  moments,
  onClose,
  onNavigateTo,
  onOpenAddMoment,
  onLikeMoment,
}) => {
  const [timeTab, setTimeTab] = useState<'now' | 'past' | 'next'>('now');
  const [isCollapsed, setIsCollapsed] = useState(false);
  useEffect(() => setIsCollapsed(false), [space?.id]);

  if (!space) return null;

  const spaceEvents = events.filter((e) => e.spaceId === space.id);
  const spaceMoments = moments.filter((m) => m.spaceId === space.id);

  // Status mapping
  const accessLabels: Record<string, { text: string; col: string }> = {
    open: { text: '对外开放', col: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    closed: { text: '暂未开放', col: 'text-neutral-600 bg-neutral-100 border-neutral-200' },
    restricted: { text: '预约/权限准入', col: 'text-amber-700 bg-amber-50 border-amber-200' },
    unknown: { text: '状态待核实', col: 'text-neutral-500 bg-neutral-100 border-neutral-200' },
  };

  const occupancyLabels: Record<string, { text: string; col: string }> = {
    available: { text: '空闲可用', col: 'text-emerald-700' },
    in_use: { text: '使用中', col: 'text-blue-700' },
    crowded: { text: '人员密集', col: 'text-rose-700' },
    unknown: { text: '占用未知', col: 'text-neutral-500' },
  };

  const currentAccess = accessLabels[space.access] || accessLabels.unknown;
  const currentOccupancy = occupancyLabels[space.occupancy] || occupancyLabels.unknown;

  return (
    <aside className={`absolute top-16 right-6 ${isCollapsed ? 'bottom-auto' : 'bottom-6'} z-20 w-96 max-w-[calc(100vw-3rem)] bg-white/95 backdrop-blur-md border border-neutral-200/90 rounded-2xl shadow-xl flex flex-col overflow-hidden transition-all`}>
      {/* Header */}
      <div className="p-5 border-b border-neutral-200/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              <span className="font-mono font-medium text-neutral-700">{space.id}</span>
              <span aria-hidden="true">·</span>
              <span>{space.series} 系列空间</span>
              <span aria-hidden="true">·</span>
              <span>定位锚点来自 FF-01</span>
            </div>
            <h2 className="text-lg font-bold text-neutral-900 tracking-tight leading-snug">
              {space.name}
            </h2>
            {space.englishName && (
              <p className="text-xs text-neutral-400 mt-0.5">{space.englishName}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsCollapsed(!isCollapsed)} aria-expanded={!isCollapsed} aria-label={isCollapsed ? '展开房间详情' : '收起房间详情'} className="p-1 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg transition-colors">
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            <button onClick={onClose} aria-label="关闭房间详情" className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Strip (Unboxed Clean Metadata) */}
        {!isCollapsed && <>
        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">准入:</span>
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${currentAccess.col}`}>
              {currentAccess.text}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">状态:</span>
            <span className={`font-medium ${currentOccupancy.col}`}>
              {currentOccupancy.text}
            </span>
          </div>
          {space.areaM2 && (
            <div className="font-mono text-neutral-500 tabular-nums">
              {space.areaM2} m²
            </div>
          )}
        </div>
        </>}
      </div>

      {!isCollapsed && <>
      {/* Time Machine Tabs: Past / Now / Next */}
      <div className="flex items-center p-1 mx-5 mt-3 bg-neutral-100 rounded-lg">
        <button
          onClick={() => setTimeTab('now')}
          className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
            timeTab === 'now' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          当下 (Now)
        </button>
        <button
          onClick={() => setTimeTab('past')}
          className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
            timeTab === 'past' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          记忆 (Past) {spaceMoments.length > 0 && `(${spaceMoments.length})`}
        </button>
        <button
          onClick={() => setTimeTab('next')}
          className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors ${
            timeTab === 'next' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          未来 (Next) {spaceEvents.length > 0 && `(${spaceEvents.length})`}
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {timeTab === 'now' && (
          <>
            {/* Description */}
            <p className="text-xs text-neutral-600 leading-relaxed">
              {space.description}
            </p>

            {/* Environmental Readings Card */}
            <div className="p-4 bg-neutral-50/80 rounded-xl border border-neutral-200/80 space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-800">环境微气候</span>
                <span className="text-[11px] text-neutral-400">
                  演示环境数据（模拟样例） · {space.environment.lastUpdated}
                </span>
              </div>

              {/* Temperature */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="text-[11px] text-neutral-500">温度</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-neutral-800">
                      {space.environment.temperature}°C
                    </div>
                  </div>
                </div>
                <Sparkline data={space.environment.temperatureTrend} color="#f59e0b" unit="°C" />
              </div>

              {/* Humidity */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/50">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-sky-500" />
                  <div>
                    <div className="text-[11px] text-neutral-500">相对湿度</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-neutral-800">
                      {space.environment.humidity}%
                    </div>
                  </div>
                </div>
                <Sparkline data={space.environment.humidityTrend} color="#0ea5e9" unit="%" />
              </div>

              {/* CO2 */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/50">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-500" />
                  <div>
                    <div className="text-[11px] text-neutral-500">CO₂ 浓度</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-neutral-800">
                      {space.environment.co2} ppm
                    </div>
                  </div>
                </div>
                <Sparkline data={space.environment.co2Trend} color="#10b981" unit=" ppm" />
              </div>
            </div>

            {/* Capacity & Headcount (With Privacy Policy) */}
            <div className="flex items-center justify-between p-3 bg-neutral-50/80 rounded-xl border border-neutral-200/80 text-xs">
              <div className="flex items-center gap-2 text-neutral-700">
                <Users className="w-4 h-4 text-neutral-400" />
                <span>容纳规模</span>
              </div>
              <div className="font-mono text-neutral-600">
                {space.environment.isPrivateRoom ? (
                  <span className="text-[11px] text-neutral-400">隐私保护（不公示实时人数）</span>
                ) : (
                  <span>
                    当前约 <strong className="text-neutral-900">{space.headcountEstimate ?? 0}</strong> 人
                    {space.capacity ? ` / 最大 ${space.capacity} 人` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Space Features */}
            <div>
              <h3 className="text-xs font-semibold text-neutral-800 mb-2">空间设施与配置</h3>
              <div className="flex flex-wrap gap-1.5">
                {space.features.map((feature, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 text-xs bg-neutral-100 text-neutral-700 rounded-md"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-center gap-2 text-xs text-neutral-400 pt-1">
              <span>标签:</span>
              <span>{space.tags.join(' · ')}</span>
            </div>
          </>
        )}

        {timeTab === 'past' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800">校园空间记忆</span>
              <button
                onClick={() => onOpenAddMoment(space.id)}
                className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                留下记忆
              </button>
            </div>

            {spaceMoments.length === 0 ? (
              <div className="p-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                <p className="text-xs text-neutral-500">这里还没有公开记录的记忆。</p>
                <button
                  onClick={() => onOpenAddMoment(space.id)}
                  className="mt-2 text-xs text-amber-700 font-semibold hover:underline"
                >
                  成为第一个留下故事的人 →
                </button>
              </div>
            ) : (
              spaceMoments.map((moment) => (
                <div
                  key={moment.id}
                  className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span className="font-medium text-neutral-800">{moment.author}</span>
                    <span>{moment.timeAgo}</span>
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed">{moment.content}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-neutral-400">{moment.date}</span>
                    <button
                      onClick={() => onLikeMoment(moment.id)}
                      className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 transition-colors"
                    >
                      <Heart className="w-3 h-3 fill-rose-600" />
                      <span className="font-mono text-[11px]">{moment.likes}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {timeTab === 'next' && (
          <div className="space-y-3">
            <span className="text-xs font-semibold text-neutral-800">未来预告与空间安排</span>
            {spaceEvents.length === 0 ? (
              <div className="p-8 text-center bg-neutral-50 rounded-xl border border-dashed border-neutral-200">
                <p className="text-xs text-neutral-500">暂无近期的排期活动。</p>
                <p className="text-[11px] text-neutral-400 mt-1">此空间可随时用于自习与自由讨论。</p>
              </div>
            ) : (
              spaceEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-900">{evt.title}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {evt.status === 'happening_now' ? '进行中' : '即将举行'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">{evt.description}</p>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 pt-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{evt.organizer}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Footer */}
      <div className="p-4 bg-neutral-50/90 border-t border-neutral-200/70 flex items-center gap-2">
        <button
          onClick={() => onNavigateTo(space.id)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-sm transition-colors"
        >
          <Navigation className="w-3.5 h-3.5" />
          规划室内路线
        </button>
        <button
          onClick={() => onOpenAddMoment(space.id)}
          title="为此空间记录故事"
          className="p-2.5 text-neutral-700 hover:text-neutral-900 hover:bg-neutral-200/70 rounded-xl border border-neutral-200 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
      </div>
      </>}
    </aside>
  );
};
