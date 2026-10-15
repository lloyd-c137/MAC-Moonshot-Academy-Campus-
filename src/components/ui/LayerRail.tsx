import React from 'react';
import type { MapLayerMode } from '../../types/campus';
import { ROOM_KIND_STYLE } from '../canvas/campusModel3d';
import { ENVIRONMENT_METRICS, LAYER_GROUPS, LAYER_LEGENDS, NO_DATA_COLOR } from './mapLayers';

interface LayerRailProps {
  layerMode: MapLayerMode;
  onLayerChange: (mode: MapLayerMode) => void;
  hideLegend?: boolean;
  /** Rooms with real sensor readings, named in the environment legend. */
  liveRoomIds?: string[];
}

const toHex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Left rail for map layers, with the active layer's legend directly beneath it. */
export const LayerRail: React.FC<LayerRailProps> = ({ layerMode, onLayerChange, hideLegend = false, liveRoomIds = [] }) => {
  const activeGroup = LAYER_GROUPS.find((group) => (group.modes as readonly MapLayerMode[]).includes(layerMode)) ?? LAYER_GROUPS[0];
  const legend = LAYER_LEGENDS[layerMode];
  const isEnvironment = activeGroup.id === 'environment';

  return (
    <div className="pointer-events-none absolute left-4 top-[4.75rem] z-20 flex flex-col gap-3 lg:left-6 max-md:inset-x-4 max-md:top-[4.25rem]">
      <nav aria-label="地图图层" className="glass pointer-events-auto flex gap-1 rounded-[var(--radius-sheet)] p-1.5 md:w-[4.5rem] md:flex-col max-md:overflow-x-auto max-md:rounded-full">
        {LAYER_GROUPS.map((group) => {
          const Icon = group.icon;
          const selected = group.id === activeGroup.id;
          return (
            <button
              key={group.id}
              onClick={() => onLayerChange(group.modes[0])}
              aria-pressed={selected}
              title={group.hint}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition-colors md:flex-col md:gap-1 md:rounded-[16px] md:px-0 md:py-2.5 ${
                selected ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white hover:text-ink'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {group.label}
            </button>
          );
        })}
      </nav>

      {!hideLegend && (legend || layerMode === 'spaces') && (
        <section aria-label="图例" className="glass animate-rise pointer-events-auto w-56 rounded-[var(--radius-tile)] p-3.5 max-md:hidden">
          {isEnvironment && (
            <div className="mb-3 grid grid-cols-3 gap-0.5 rounded-full bg-regolith/70 p-0.5" role="group" aria-label="环境指标">
              {ENVIRONMENT_METRICS.map((metric) => (
                <button
                  key={metric.mode}
                  onClick={() => onLayerChange(metric.mode)}
                  aria-pressed={layerMode === metric.mode}
                  className={`rounded-full py-1 text-[12px] font-medium transition-colors ${layerMode === metric.mode ? 'bg-white text-ink shadow-sm' : 'text-crater hover:text-ink'}`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          )}

          <p className="text-[13px] font-semibold text-ink">{layerMode === 'spaces' ? '房间用途' : legend!.title}</p>
          <ul className="mt-2 space-y-1.5 text-[12px] text-ink-soft">
            {layerMode === 'spaces'
              ? Object.values(ROOM_KIND_STYLE).filter((k) => k.label !== '其他房间').map((kind) => (
                  <li key={kind.label} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-[4px]" style={{ background: toHex(kind.strong) }} />
                    {kind.label}
                  </li>
                ))
              : legend!.stops.map((stop) => (
                  <li key={stop.label} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-[4px]" style={{ background: stop.color }} />
                    {stop.label}
                  </li>
                ))}
            {layerMode !== 'spaces' && (
              <li className="flex items-center gap-2 text-crater">
                <span className="h-3 w-3 rounded-[4px] border hairline" style={{ background: NO_DATA_COLOR }} />
                暂无数据
              </li>
            )}
          </ul>
          {layerMode !== 'spaces' && layerMode !== 'events' && (
            <p className="mt-3 border-t hairline pt-2.5 text-[11px] leading-relaxed text-crater">
              {isEnvironment && liveRoomIds.length > 0 ? `${liveRoomIds.join('、')} 为传感器实测，其余为演示数据` : '演示数据'}
            </p>
          )}
        </section>
      )}
    </div>
  );
};
