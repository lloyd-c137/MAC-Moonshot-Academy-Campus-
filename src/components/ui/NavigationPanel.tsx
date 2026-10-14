import React, { useState, useEffect } from 'react';
import { X, Navigation, MapPin, Footprints, Clock, ArrowRight } from 'lucide-react';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { findCampusRoute } from '../../services/navigation';
import { NavigationRoute } from '../../types/campus';

interface NavigationPanelProps {
  isOpen: boolean;
  selectedDestinationId: string | null;
  onClose: () => void;
  onRouteCalculated: (route: NavigationRoute | null) => void;
}

export const NavigationPanel: React.FC<NavigationPanelProps> = ({
  isOpen,
  selectedDestinationId,
  onClose,
  onRouteCalculated,
}) => {
  const [startId, setStartId] = useState<string>('NODE-ENT-WEST');
  const [destId, setDestId] = useState<string>(selectedDestinationId || 'ARENA-01');
  const [currentRoute, setCurrentRoute] = useState<NavigationRoute | null>(null);

  // Sync destination if passed externally
  useEffect(() => {
    if (selectedDestinationId) {
      setDestId(selectedDestinationId);
    }
  }, [selectedDestinationId]);

  // Recalculate route whenever start or dest changes
  useEffect(() => {
    if (!isOpen) return;
    const route = findCampusRoute(startId, destId);
    setCurrentRoute(route);
    onRouteCalculated(route);
  }, [startId, destId, isOpen]);

  if (!isOpen) return null;

  const handleClear = () => {
    onRouteCalculated(null);
    onClose();
  };

  return (
    <div className="absolute top-16 left-6 z-20 w-96 max-w-[calc(100vw-3rem)] bg-white/95 backdrop-blur-md border border-neutral-200/90 rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-left duration-200">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-neutral-800" />
          <h2 className="text-sm font-bold text-neutral-900">室内走廊导航 (Corridor Routing)</h2>
        </div>
        <button
          onClick={handleClear}
          className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Start and Destination Selection */}
      <div className="p-4 space-y-3 bg-neutral-50/60 border-b border-neutral-200/60">
        <div>
          <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
            起点 (Start Point)
          </label>
          <select
            value={startId}
            onChange={(e) => setStartId(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          >
            <option value="NODE-ENT-WEST">🚪 西入口门厅 (West Entrance)</option>
            <option value="NODE-ENT-EAST">🚪 东入口门厅 (East Entrance)</option>
            <option value="NODE-ENT-SOUTH">🚪 南入口门厅 (South Entrance)</option>
            <optgroup label="从指定房间出发">
              {CAMPUS_SPACES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} {s.name}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1 block">
            目的地 (Destination)
          </label>
          <select
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-neutral-400"
          >
            {CAMPUS_SPACES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Route Summary */}
      {currentRoute ? (
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 bg-neutral-100/70 rounded-xl text-xs">
            <div className="flex items-center gap-2">
              <Footprints className="w-4 h-4 text-neutral-600" />
              <div>
                <div className="text-[11px] text-neutral-500">步行距离</div>
                <div className="font-mono font-bold text-neutral-900">{currentRoute.totalDistanceMeters} 米</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-600" />
              <div>
                <div className="text-[11px] text-neutral-500">预估时间</div>
                <div className="font-mono font-bold text-neutral-900">约 {currentRoute.estimatedMinutes} 分钟</div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-neutral-800 mb-2">沿走廊通行指引 (无穿墙路径)</h4>
            <div className="space-y-2 text-xs">
              {currentRoute.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-700 flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="text-neutral-700 leading-relaxed pt-0.5">{step}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-neutral-500">
          正在计算无阻挡室内连通走廊...
        </div>
      )}

      {/* Footer */}
      <div className="p-3 bg-neutral-50 border-t border-neutral-200/80 flex items-center justify-between text-xs text-neutral-500">
        <span>路径已在 2.5D 地图中高亮描画</span>
        <button
          onClick={handleClear}
          className="text-neutral-600 hover:text-neutral-900 font-medium"
        >
          退出导航
        </button>
      </div>
    </div>
  );
};
