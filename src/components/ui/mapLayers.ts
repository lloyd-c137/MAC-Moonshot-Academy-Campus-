import { Activity, CalendarDays, Compass, LayoutGrid, Thermometer } from 'lucide-react';
import type { CampusEvent, CampusSpace, MapLayerMode } from '../../types/campus';

export interface LegendStop { color: string; label: string }

/** Map layers as shown in the layer rail. 环境 groups three metrics. */
export const LAYER_GROUPS = [
  { id: 'explore', label: '总览', hint: '建筑与房间', icon: Compass, modes: ['explore'] },
  { id: 'spaces', label: '用途', hint: '按房间用途着色', icon: LayoutGrid, modes: ['spaces'] },
  { id: 'environment', label: '环境', hint: '温度、湿度、CO₂', icon: Thermometer, modes: ['temperature', 'humidity', 'co2'] },
  { id: 'pulse', label: '人流', hint: '当前未接入实时人流数据', icon: Activity, modes: ['pulse'] },
  { id: 'events', label: '活动', hint: '正在和即将发生', icon: CalendarDays, modes: ['events'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; hint: string; icon: unknown; modes: readonly MapLayerMode[] }>;

export const ENVIRONMENT_METRICS: Array<{ mode: MapLayerMode; label: string; unit: string }> = [
  { mode: 'temperature', label: '温度', unit: '°C' },
  { mode: 'humidity', label: '湿度', unit: '%' },
  { mode: 'co2', label: 'CO₂', unit: 'ppm' },
];

export const NO_DATA_COLOR = '#e6e9ed';

const scale = (value: number, limits: number[], stops: LegendStop[]) => {
  const index = limits.findIndex((limit) => value < limit);
  return stops[index === -1 ? stops.length - 1 : index].color;
};

export const LAYER_LEGENDS: Partial<Record<MapLayerMode, { title: string; stops: LegendStop[]; limits?: number[] }>> = {
  temperature: {
    title: '温度',
    limits: [22, 22.8, 23.5],
    stops: [
      { color: '#8fc1e3', label: '低于 22°C' },
      { color: '#8ccfb9', label: '22–22.8°C' },
      { color: '#f2cf7d', label: '22.8–23.5°C' },
      { color: '#ec8f8a', label: '高于 23.5°C' },
    ],
  },
  humidity: {
    title: '相对湿度',
    limits: [44, 48, 52],
    stops: [
      { color: '#e9d8a6', label: '低于 44%' },
      { color: '#a9d4c6', label: '44–48%' },
      { color: '#7fbfd8', label: '48–52%' },
      { color: '#5b8fc9', label: '高于 52%' },
    ],
  },
  co2: {
    title: 'CO₂ 浓度',
    limits: [550, 680, 750],
    stops: [
      { color: '#8fd0a8', label: '低于 550 ppm' },
      { color: '#c9dc8c', label: '550–680' },
      { color: '#f2cf7d', label: '680–750' },
      { color: '#ec8f8a', label: '高于 750，建议通风' },
    ],
  },
  pulse: {
    title: '人流',
    stops: [
      { color: '#cfe3dc', label: '安静' },
      { color: '#f3e3b5', label: '适中' },
      { color: '#f6c79b', label: '热闹' },
      { color: '#ef9b86', label: '拥挤' },
    ],
  },
  events: {
    title: '活动',
    stops: [
      { color: '#ff7a00', label: '进行中' },
      { color: '#fdcb9c', label: '即将开始' },
    ],
  },
};

const hex = (color: string) => parseInt(color.slice(1), 16);

/** Colour of a room for a data layer, or null when the layer has nothing to say about it. */
export function layerColor(mode: MapLayerMode, space: CampusSpace | undefined, events: CampusEvent[], roomId: string): number | null {
  const env = space?.environment;
  const hasEnv = !!env && env.sensorHealth !== 'offline';
  const legend = LAYER_LEGENDS[mode];
  switch (mode) {
    case 'temperature':
      return hasEnv ? hex(scale(env!.temperature, legend!.limits!, legend!.stops)) : null;
    case 'humidity':
      return hasEnv ? hex(scale(env!.humidity, legend!.limits!, legend!.stops)) : null;
    case 'co2':
      return hasEnv ? hex(scale(env!.co2, legend!.limits!, legend!.stops)) : null;
    case 'pulse': {
      const index = ['quiet', 'moderate', 'busy', 'very_busy'].indexOf(space?.pulse ?? '');
      return index >= 0 ? hex(legend!.stops[index].color) : null;
    }
    case 'events': {
      const roomEvents = events.filter((event) => event.spaceId === roomId);
      if (roomEvents.some((event) => event.status === 'happening_now')) return hex(legend!.stops[0].color);
      if (roomEvents.some((event) => event.status === 'upcoming')) return hex(legend!.stops[1].color);
      return null;
    }
    default:
      return null;
  }
}
