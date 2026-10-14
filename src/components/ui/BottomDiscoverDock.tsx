import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Clock, MapPin, Activity, Flame, Volume2 } from 'lucide-react';
import { CampusEvent, CampusSpace } from '../../types/campus';

interface BottomDiscoverDockProps {
  events: CampusEvent[];
  spaces: CampusSpace[];
  onSelectSpace: (spaceId: string) => void;
  onOpenFindSpot: () => void;
}

export const BottomDiscoverDock: React.FC<BottomDiscoverDockProps> = ({
  events,
  spaces,
  onSelectSpace,
  onOpenFindSpot,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<'happening' | 'pulse' | 'spots'>('happening');

  const happeningNowEvents = events.filter((e) => e.status === 'happening_now');
  const upcomingEvents = events.filter((e) => e.status === 'upcoming').slice(0, 3);

  // Identify busiest and quietest spots for pulse
  const busySpots = spaces.filter((s) => s.pulse === 'busy' || s.pulse === 'very_busy').slice(0, 3);
  const quietSpots = spaces.filter((s) => s.category === 'quiet_study' || s.pulse === 'quiet').slice(0, 3);

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[94vw] max-w-[840px] pointer-events-auto transition-transform duration-300 ease-out">
      {/* Dock Container */}
      <div className="bg-white/90 backdrop-blur-md border border-neutral-200/90 rounded-2xl shadow-xl overflow-hidden">
        {/* Dock Top Handle Strip */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200/60 bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-800">校园动态与发现</span>
            <span aria-hidden="true" className="text-neutral-300">·</span>
            {/* Tab switchers */}
            <div className="flex items-center gap-1 text-xs">
              <button
                onClick={() => {
                  setActiveTab('happening');
                  setIsCollapsed(false);
                }}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  activeTab === 'happening'
                    ? 'bg-neutral-200/80 text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                正在发生 ({happeningNowEvents.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('pulse');
                  setIsCollapsed(false);
                }}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  activeTab === 'pulse'
                    ? 'bg-neutral-200/80 text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                人流脉动
              </button>
              <button
                onClick={() => {
                  setActiveTab('spots');
                  setIsCollapsed(false);
                }}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${
                  activeTab === 'spots'
                    ? 'bg-neutral-200/80 text-neutral-900'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                好去处
              </button>
            </div>
          </div>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800 px-2 py-0.5 rounded hover:bg-neutral-100 transition-colors"
          >
            {isCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>展开</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>收起</span>
              </>
            )}
          </button>
        </div>

        {/* Expandable Content Area */}
        {!isCollapsed && (
          <div className="p-3.5">
            {activeTab === 'happening' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {happeningNowEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={() => onSelectSpace(evt.spaceId)}
                    className="p-3 bg-neutral-50 hover:bg-neutral-100/90 rounded-xl border border-neutral-200/80 cursor-pointer transition-all hover:shadow-sm group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1">
                        <span className="font-semibold text-neutral-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          进行中
                        </span>
                        <span>{evt.organizer.split(' ')[0]}</span>
                      </div>
                      <h4 className="text-xs font-bold text-neutral-900 group-hover:text-amber-800 line-clamp-1">
                        {evt.title}
                      </h4>
                      <p className="text-[11px] text-neutral-500 line-clamp-2 mt-1 leading-snug">
                        {evt.description}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-neutral-200/50 flex items-center justify-between text-[11px] text-neutral-600">
                      <span className="font-medium truncate">{evt.spaceName.split(' ')[0]}</span>
                      <span className="text-amber-700 font-semibold group-hover:translate-x-0.5 transition-transform">
                        查看空间 →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'pulse' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Busiest Hubs */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-700 text-xs">
                    <Flame className="w-3.5 h-3.5" />
                    <span>活力与活跃热点 (Busy Hubs)</span>
                  </div>
                  <div className="space-y-1.5">
                    {busySpots.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => onSelectSpace(s.id)}
                        className="flex items-center justify-between p-1.5 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      >
                        <span className="font-medium text-neutral-800">{s.name}</span>
                        <span className="font-mono text-[11px] text-neutral-500">
                          约 {s.headcountEstimate} 人在场
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quiet Spots */}
                <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700 text-xs">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>静谧研学角落 (Tranquil Corners)</span>
                  </div>
                  <div className="space-y-1.5">
                    {quietSpots.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => onSelectSpace(s.id)}
                        className="flex items-center justify-between p-1.5 hover:bg-white rounded-lg cursor-pointer transition-colors"
                      >
                        <span className="font-medium text-neutral-800">{s.name}</span>
                        <span className="font-mono text-[11px] text-emerald-600">
                          {s.environment.co2} ppm · 舒适
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'spots' && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onSelectSpace('M104')}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-800 font-medium transition-colors"
                  >
                    🚀 M104 一小步空间
                  </button>
                  <button
                    onClick={() => onSelectSpace('M103')}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-800 font-medium transition-colors"
                  >
                    🛠️ M103 创客空间
                  </button>
                  <button
                    onClick={() => onSelectSpace('S404')}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-800 font-medium transition-colors"
                  >
                    🤫 S404 静音自习
                  </button>
                  <button
                    onClick={() => onSelectSpace('S202')}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-800 font-medium transition-colors"
                  >
                    💬 S202 对话空间
                  </button>
                  <button
                    onClick={() => onSelectSpace('COURTYARD-02')}
                    className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-800 font-medium transition-colors"
                  >
                    🌿 南苑阳光中庭
                  </button>
                </div>
                <button
                  onClick={onOpenFindSpot}
                  className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg font-semibold hover:bg-neutral-800 transition-colors whitespace-nowrap"
                >
                  更多智能推荐 →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
