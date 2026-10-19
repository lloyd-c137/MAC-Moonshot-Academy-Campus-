import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CampusConfig, SensorBinding } from '../config/campusConfig';

/** Raw reading as returned by GET /api/readings. */
interface RawReading {
  record_id: string;
  device_id: string;
  location_id: string;
  captured_at: string;
  received_at?: string;
  co2_ppm: number | null;
  scd_temp_c: number | null;
  scd_humidity_pct: number | null;
  sht_temp_c: number | null;
  sht_humidity_pct: number | null;
}

export interface SensorPoint {
  t: number; // epoch ms
  temperature: number | null;
  humidity: number | null;
  co2: number | null;
}

export type LiveStatus = 'loading' | 'live' | 'stale' | 'empty' | 'error';

export interface LiveRoomReading {
  binding: SensorBinding;
  status: LiveStatus;
  deviceId?: string;
  latest?: SensorPoint;
  series: SensorPoint[];
  /** Minutes since the latest reading was captured. */
  ageMinutes?: number;
  error?: string;
  fetchedAt?: number;
}

export interface DeviceInfo {
  device_id: string;
  location_id: string;
  last_handshake_at?: string;
  last_upload_at?: string;
  firmware_version?: string;
  record_count?: number;
  handshake_status?: string;
  scd_ready?: boolean;
  sht_ready?: boolean;
}

const round = (v: number | null, digits: number) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v.toFixed(digits)));

function toPoint(r: RawReading): SensorPoint {
  // Prefer the SHT sensor for temperature / humidity when present; fall back to the SCD4x.
  return {
    t: Date.parse(r.captured_at),
    temperature: round(r.sht_temp_c ?? r.scd_temp_c, 1),
    humidity: round(r.sht_humidity_pct ?? r.scd_humidity_pct, 0),
    co2: round(r.co2_ppm, 0),
  };
}

const trimBase = (url: string) => url.replace(/\/+$/, '');

export async function fetchRoomReadings(config: CampusConfig, binding: SensorBinding, signal?: AbortSignal): Promise<LiveRoomReading> {
  const { baseUrl, historyHours, staleMinutes } = config.sensorApi;
  const url = `${trimBase(baseUrl)}/api/readings?location=${encodeURIComponent(binding.locationId)}&hours=${historyHours}`;
  try {
    const response = await fetch(url, { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(response.status >= 500 ? `传感器接口暂时无法访问（${response.status}）` : `接口返回 ${response.status}`);
    const data = (await response.json()) as { ok?: boolean; latest: RawReading | null; readings: RawReading[] };
    if (data.ok === false) throw new Error('接口返回 ok: false');
    const series = (data.readings ?? []).map(toPoint).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
    const latest = data.latest ? toPoint(data.latest) : series[series.length - 1];
    if (!latest) return { binding, status: 'empty', series: [], fetchedAt: Date.now() };
    const ageMinutes = Math.max(0, (Date.now() - latest.t) / 60000);
    return {
      binding,
      status: ageMinutes <= staleMinutes ? 'live' : 'stale',
      deviceId: data.latest?.device_id ?? data.readings?.[0]?.device_id,
      latest,
      series,
      ageMinutes,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    const message = (error as Error).message;
    // Browsers report network / CORS failures (including a 5xx page without CORS headers) as a TypeError.
    const friendly = error instanceof TypeError || !message ? '传感器接口暂时无法访问' : message;
    return { binding, status: 'error', series: [], error: friendly, fetchedAt: Date.now() };
  }
}

export async function fetchDevices(baseUrl: string, signal?: AbortSignal): Promise<DeviceInfo[]> {
  const response = await fetch(`${trimBase(baseUrl)}/api/devices`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`接口返回 ${response.status}`);
  const data = (await response.json()) as { devices?: DeviceInfo[] };
  return data.devices ?? [];
}

const CACHE_KEY = 'mac_sensor_cache_v1';
type CacheEntry = { locationId: string; deviceId?: string; latest: SensorPoint; series: SensorPoint[] };

function readCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function writeCache(roomId: string, reading: LiveRoomReading) {
  if (!reading.latest) return;
  try {
    const cache = readCache();
    cache[roomId] = { locationId: reading.binding.locationId, deviceId: reading.deviceId, latest: reading.latest, series: reading.series };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage unavailable: no offline fallback */ }
}

/**
 * When the API fails, keep showing the last good reading (from this session or the
 * local cache) as "not updated" instead of dropping the room back to nothing.
 */
function withFallback(result: LiveRoomReading, previous: LiveRoomReading | undefined): LiveRoomReading {
  if (result.status !== 'error') return result;
  const cached = readCache()[result.binding.roomId];
  const source = previous?.latest && previous.binding.locationId === result.binding.locationId
    ? { latest: previous.latest, series: previous.series, deviceId: previous.deviceId }
    : cached && cached.locationId === result.binding.locationId ? cached : null;
  if (!source) return result;
  return {
    ...result,
    status: 'stale',
    latest: source.latest,
    series: source.series,
    deviceId: source.deviceId,
    ageMinutes: Math.max(0, (Date.now() - source.latest.t) / 60000),
  };
}

export interface LiveSensors {
  readings: Record<string, LiveRoomReading>;
  /** Room IDs with a manual refresh in flight. */
  refreshing: ReadonlySet<string>;
  /** Fetch one room now (or every bound room when omitted); resolves with the merged result. */
  refresh: (roomId?: string) => Promise<LiveRoomReading | undefined>;
}

/** Polls every enabled sensor binding; returns readings keyed by room ID, plus a manual refresh. */
export function useLiveSensors(config: CampusConfig, ready: boolean): LiveSensors {
  const [readings, setReadings] = useState<Record<string, LiveRoomReading>>({});
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(() => new Set());
  const configRef = useRef(config);
  configRef.current = config;
  const readingsRef = useRef(readings);
  readingsRef.current = readings;
  const pollRef = useRef<(roomIds?: string[], force?: boolean) => Promise<void>>(async () => {});
  const restartTimerRef = useRef<() => void>(() => {});
  const key = JSON.stringify([config.sensorApi, config.sensors]);

  useEffect(() => {
    if (!ready) return;
    const enabled = config.sensors.filter((s) => s.enabled && s.roomId && s.locationId);
    setReadings((prev) => Object.fromEntries(enabled.map((b) => [b.roomId, prev[b.roomId]?.binding.locationId === b.locationId ? prev[b.roomId] : { binding: b, status: 'loading' as const, series: [] }])));
    if (enabled.length === 0) { pollRef.current = async () => {}; return; }
    let abort = new AbortController();
    let disposed = false;
    const poll = async (roomIds?: string[], force = false) => {
      if (!force && document.visibilityState === 'hidden') return; // no polling in background tabs
      abort.abort();
      abort = new AbortController();
      const targets = roomIds ? enabled.filter((b) => roomIds.includes(b.roomId)) : enabled;
      const results = await Promise.allSettled(targets.map((b) => fetchRoomReadings(configRef.current, b, abort.signal)));
      if (disposed) return;
      results.forEach((r) => { if (r.status === 'fulfilled' && r.value.status !== 'error') writeCache(r.value.binding.roomId, r.value); });
      const next = { ...readingsRef.current };
      results.forEach((r) => { if (r.status === 'fulfilled') next[r.value.binding.roomId] = withFallback(r.value, next[r.value.binding.roomId]); });
      readingsRef.current = next;
      setReadings(next);
    };
    pollRef.current = poll;
    poll();
    const interval = Math.max(15, config.sensorApi.refreshSeconds) * 1000;
    let timer = window.setInterval(poll, interval);
    restartTimerRef.current = () => { window.clearInterval(timer); timer = window.setInterval(poll, interval); };
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const refresh = useCallback(async (roomId?: string) => {
    const ids = roomId ? [roomId] : Object.keys(readingsRef.current);
    if (ids.length === 0) return undefined;
    setRefreshing((prev) => new Set([...prev, ...ids]));
    // Keep the spinner up long enough to register, even when the API answers instantly.
    const minimum = new Promise((resolve) => window.setTimeout(resolve, 600));
    try {
      // A manual refresh also covers the next scheduled poll, so restart the interval from now.
      restartTimerRef.current();
      await Promise.all([pollRef.current(roomId ? [roomId] : undefined, true).catch(() => {}), minimum]);
    } finally {
      setRefreshing((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    }
    return roomId ? readingsRef.current[roomId] : undefined;
  }, []);

  return useMemo(() => ({ readings, refreshing, refresh }), [readings, refreshing, refresh]);
}

/** "3 分钟前" / "6 小时前" / "2 天前". */
export function formatAge(minutes: number | undefined): string {
  if (minutes === undefined) return '';
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${Math.round(minutes)} 分钟前`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
}
