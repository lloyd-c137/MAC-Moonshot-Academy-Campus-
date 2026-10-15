import type { CampusConfig } from '../config/campusConfig';
import type { CampusSpace, EnvironmentalReading } from '../types/campus';
import { formatAge, type LiveRoomReading } from './sensorApi';

const series = (points: LiveRoomReading['series'], key: 'temperature' | 'humidity' | 'co2') =>
  points.filter((p) => p[key] !== null);

function liveEnvironment(base: EnvironmentalReading, live: LiveRoomReading, provider?: EnvironmentalReading['provider']): EnvironmentalReading {
  const { latest, status } = live;
  if (!latest || status === 'error' || status === 'empty' || status === 'loading') {
    return {
      ...base,
      source: 'sensor',
      provider,
      sensorHealth: 'offline',
      sensorId: live.deviceId,
      temperatureTrend: [], humidityTrend: [], co2Trend: [],
      sensorNote: status === 'loading' ? '正在读取传感器数据' : status === 'empty' ? `传感器 ${live.binding.locationId} 还没有上报数据` : `传感器连接失败：${live.error ?? '未知错误'}`,
    };
  }
  const withTemp = series(live.series, 'temperature');
  return {
    ...base,
    source: 'sensor',
    provider,
    sensorHealth: status === 'live' ? 'live' : 'stale',
    sensorId: live.deviceId,
    temperature: latest.temperature ?? base.temperature,
    humidity: latest.humidity ?? base.humidity,
    co2: latest.co2 ?? base.co2,
    temperatureTrend: withTemp.map((p) => p.temperature as number),
    humidityTrend: series(live.series, 'humidity').map((p) => p.humidity as number),
    co2Trend: series(live.series, 'co2').map((p) => p.co2 as number),
    trendTimes: withTemp.map((p) => p.t),
    capturedAt: latest.t,
    lastUpdated: formatAge(live.ageMinutes),
    sensorNote: status !== 'stale'
      ? undefined
      : live.error
        ? `${live.error}，显示的是 ${formatAge(live.ageMinutes)}的读数`
        : `传感器已 ${formatAge(live.ageMinutes)}未上报，显示的是最后一次读数`,
  };
}

/** Product spaces with admin overrides and live sensor readings applied. */
export function buildSpaces(base: CampusSpace[], config: CampusConfig, live: Record<string, LiveRoomReading>): CampusSpace[] {
  return base.map((space) => {
    const override = config.rooms[space.id];
    let next: CampusSpace = override
      ? {
          ...space,
          ...(override.name ? { name: override.name } : {}),
          ...(override.englishName !== undefined ? { englishName: override.englishName || undefined } : {}),
          ...(override.description ? { description: override.description } : {}),
          ...(override.access ? { access: override.access } : {}),
          ...(override.capacity !== undefined ? { capacity: override.capacity } : {}),
          ...(override.features ? { features: override.features } : {}),
        }
      : space;
    const reading = live[space.id];
    if (reading) {
      const { providerName, providerUrl } = config.sensorApi;
      let provider: EnvironmentalReading['provider'];
      try { provider = providerUrl ? { name: providerName || new URL(providerUrl).host, url: new URL(providerUrl).toString() } : undefined; } catch { provider = undefined; }
      next = { ...next, environment: liveEnvironment(next.environment, reading, provider) };
    } else if (next.environment.sensorHealth !== 'offline') {
      next = config.display.showDemoEnvironment
        ? { ...next, environment: { ...next.environment, source: 'demo', sensorHealth: 'mock' } }
        : { ...next, environment: { ...next.environment, source: 'demo', sensorHealth: 'offline' } };
    }
    return next;
  });
}
