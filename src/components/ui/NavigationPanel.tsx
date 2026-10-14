import React, { useState, useEffect } from 'react';
import { X, Navigation, MapPin } from 'lucide-react';
import { CAMPUS_SPACES } from '../../data/floorplanData';
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

  // Sync destination if passed externally
  useEffect(() => {
    if (selectedDestinationId) {
      setDestId(selectedDestinationId);
    }
  }, [selectedDestinationId]);

  // Recalculate route whenever start or dest changes
  useEffect(() => {
    if (!isOpen) return;
    onRouteCalculated(null);
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
          <h2 className="text-sm font-bold text-neutral-900">室内导航（等待空间核验）</h2>
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
            disabled
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
            disabled
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
      <div className="p-6 flex-1 text-center">
        <MapPin className="w-5 h-5 text-amber-600 mx-auto mb-2" />
        <p className="text-sm font-semibold text-neutral-800">导航暂不可用</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          FF-01 的门洞、走廊和可通行区域尚未逐段核验。完成空间拓扑校准前，不显示路线、距离或时间估算。
        </p>
      </div>

      {/* Footer */}
      <div className="p-3 bg-neutral-50 border-t border-neutral-200/80 flex items-center justify-between text-xs text-neutral-500">
        <span>等待 G4 空间拓扑校验</span>
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
