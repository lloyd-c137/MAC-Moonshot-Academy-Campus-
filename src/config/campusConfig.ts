import { useCallback, useEffect, useState } from 'react';
import type { AccessStatus } from '../types/campus';

/**
 * Site configuration.
 *
 * Two layers:
 * 1. Published: public/campus-config.json, deployed with the site, the same for every visitor.
 * 2. Local: edits made in /admin, stored in this browser only, applied on top of the published file.
 *    They become site-wide once exported and committed as public/campus-config.json
 *    (or written there directly by the dev server).
 */

export interface SensorBinding {
  id: string;
  /** Campus room code, e.g. "M104". */
  roomId: string;
  /** Location ID used by the sensor API, e.g. "M1". */
  locationId: string;
  enabled: boolean;
  note?: string;
}

export interface RoomOverride {
  name?: string;
  englishName?: string;
  description?: string;
  access?: AccessStatus;
  capacity?: number;
  features?: string[];
}

export interface CampusConfig {
  version: 1;
  sensorApi: {
    baseUrl: string;
    /** How often the map refreshes sensor data. */
    refreshSeconds: number;
    /** A reading older than this is shown as "not updated", not as current. */
    staleMinutes: number;
    historyHours: number;
  };
  sensors: SensorBinding[];
  rooms: Record<string, RoomOverride>;
  display: {
    /** Show the sample environment values for rooms without a real sensor. */
    showDemoEnvironment: boolean;
  };
  updatedAt?: string;
}

export const DEFAULT_CONFIG: CampusConfig = {
  version: 1,
  sensorApi: { baseUrl: 'https://map.georgehan0514.top', refreshSeconds: 60, staleMinutes: 10, historyHours: 24 },
  sensors: [{ id: 'm104-m1', roomId: 'M104', locationId: 'M1', enabled: true, note: 'ESP32-S3 环境传感器' }],
  rooms: {},
  display: { showDemoEnvironment: true },
};

const LOCAL_KEY = 'mac_campus_config_local_v1';
const PUBLISHED_URL = '/campus-config.json';
const CHANGE_EVENT = 'mac-campus-config-change';

function normalise(raw: Partial<CampusConfig> | null | undefined): CampusConfig {
  const base = DEFAULT_CONFIG;
  return {
    version: 1,
    sensorApi: { ...base.sensorApi, ...(raw?.sensorApi ?? {}) },
    sensors: Array.isArray(raw?.sensors) ? raw!.sensors : base.sensors,
    rooms: raw?.rooms && typeof raw.rooms === 'object' ? raw.rooms : {},
    display: { ...base.display, ...(raw?.display ?? {}) },
    updatedAt: raw?.updatedAt,
  };
}

export function readLocalConfig(): CampusConfig | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalConfig(config: CampusConfig | null) {
  try {
    if (config) localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...config, updatedAt: new Date().toISOString() }));
    else localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Storage can be unavailable (private mode); the published config still applies.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function fetchPublishedConfig(): Promise<CampusConfig> {
  try {
    const response = await fetch(PUBLISHED_URL, { cache: 'no-store' });
    if (!response.ok) return DEFAULT_CONFIG;
    return normalise(await response.json());
  } catch {
    return DEFAULT_CONFIG;
  }
}

export interface ConfigState {
  config: CampusConfig;
  published: CampusConfig;
  hasLocalChanges: boolean;
  ready: boolean;
  reload: () => void;
}

/** Effective configuration (local edits over the published file), kept in sync across tabs. */
export function useCampusConfig(): ConfigState {
  const [published, setPublished] = useState<CampusConfig>(DEFAULT_CONFIG);
  const [local, setLocal] = useState<CampusConfig | null>(() => readLocalConfig());
  const [ready, setReady] = useState(false);

  const reload = useCallback(() => {
    fetchPublishedConfig().then((cfg) => { setPublished(cfg); setReady(true); });
    setLocal(readLocalConfig());
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => setLocal(readLocalConfig());
    const onStorage = (e: StorageEvent) => { if (e.key === LOCAL_KEY) onChange(); };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(CHANGE_EVENT, onChange); window.removeEventListener('storage', onStorage); };
  }, [reload]);

  return { config: local ?? published, published, hasLocalChanges: local !== null, ready, reload };
}
