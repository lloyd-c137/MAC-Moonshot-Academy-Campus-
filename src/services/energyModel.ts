/**
 * Classroom lighting energy model (simulation from rated power, not meter readings).
 *
 * Sources (Lighting Audit Dataset):
 * - 12 recessed 600 × 600 LED panels per classroom (site count in a representative room);
 * - 40 W per panel (rated power, confirmed by a teacher);
 * - ¥0.5003 per kWh (tariff used in earlier calculations; bill evidence still to be kept);
 * - 30 classrooms counted on the floor plan (M 16, A 11, primary 2, middle school 1);
 *   their lamp configuration has not been checked room by room.
 *
 * The lamp state is a what-if switchboard: it starts with every lamp on (the theoretical
 * full load) and changes when someone turns lights off in the energy panel or a room sheet.
 * It is kept per browser and shared between open tabs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const LIGHTING = {
  lampsPerRoom: 12,
  lampWatts: 40,
  pricePerKwh: 0.5003,
} as const;

/** The 30 classrooms of the floor-plan count (names on FF-01: 教室 / 综合教室 / 小学教室 / 初中教室). */
export const CLASSROOM_IDS = [
  'M105', 'M106', 'M107', 'M108', 'M109', 'M110', 'M111', 'M112', 'M113', 'M115', 'M118', 'M120', 'M121', 'M122', 'M123', 'M125',
  'A101', 'A102', 'A202', 'A204', 'A210', 'A211', 'A212', 'A213', 'A214', 'A215', 'A216', 'A223', 'A224', 'A225',
] as const;

const CLASSROOMS = new Set<string>(CLASSROOM_IDS);
export const isLitClassroom = (id: string) => CLASSROOMS.has(id);

export const FULL_LOAD_W = CLASSROOM_IDS.length * LIGHTING.lampsPerRoom * LIGHTING.lampWatts; // 14,400 W

/** Lamps switched on, per classroom. */
export type LampState = Record<string, number>;

export interface EnergyFigures {
  watts: number;
  lampsOn: number;
  lampsTotal: number;
  roomsLit: number;
  /** Energy per second, in watt-hours. */
  whPerSecond: number;
  kwhPerHour: number;
  costPerHour: number;
  /** Compared with every lamp on. */
  savedKwhPerHour: number;
  savedCostPerHour: number;
}

export function roomFigures(lampsOn: number) {
  const watts = lampsOn * LIGHTING.lampWatts;
  const kwhPerHour = watts / 1000;
  return { lampsOn, lampsTotal: LIGHTING.lampsPerRoom, watts, kwhPerHour, costPerHour: kwhPerHour * LIGHTING.pricePerKwh };
}

export function campusFigures(state: LampState): EnergyFigures {
  let lampsOn = 0;
  let roomsLit = 0;
  for (const id of CLASSROOM_IDS) {
    const n = state[id] ?? LIGHTING.lampsPerRoom;
    lampsOn += n;
    if (n > 0) roomsLit++;
  }
  const watts = lampsOn * LIGHTING.lampWatts;
  const kwhPerHour = watts / 1000;
  const savedKwhPerHour = (FULL_LOAD_W - watts) / 1000;
  return {
    watts,
    lampsOn,
    lampsTotal: CLASSROOM_IDS.length * LIGHTING.lampsPerRoom,
    roomsLit,
    whPerSecond: watts / 3600,
    kwhPerHour,
    costPerHour: kwhPerHour * LIGHTING.pricePerKwh,
    savedKwhPerHour,
    savedCostPerHour: savedKwhPerHour * LIGHTING.pricePerKwh,
  };
}

const STORAGE_KEY = 'mac_lighting_v1';
const EVENT = 'mac-lighting-change';

function readState(): LampState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const out: LampState = {};
    for (const id of CLASSROOM_IDS) {
      const n = Number(raw[id]);
      if (Number.isFinite(n)) out[id] = Math.max(0, Math.min(LIGHTING.lampsPerRoom, Math.round(n)));
    }
    return out;
  } catch {
    return {};
  }
}

function writeState(state: LampState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage blocked: this tab only */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The lighting switchboard: lamps on per classroom, with setters. */
export function useLighting() {
  const [state, setState] = useState<LampState>(readState);
  useEffect(() => {
    const sync = () => setState(readState());
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', onStorage); };
  }, []);
  const update = useCallback((next: LampState) => { setState(next); writeState(next); }, []);
  const lampsOf = useCallback((id: string) => state[id] ?? LIGHTING.lampsPerRoom, [state]);
  const setLamps = useCallback((id: string, n: number) => {
    update({ ...readState(), [id]: Math.max(0, Math.min(LIGHTING.lampsPerRoom, Math.round(n))) });
  }, [update]);
  const setAll = useCallback((n: number) => {
    update(Object.fromEntries(CLASSROOM_IDS.map((id) => [id, n])));
  }, [update]);
  const figures = useMemo(() => campusFigures(state), [state]);
  return useMemo(() => ({ state, lampsOf, setLamps, setAll, figures }), [state, lampsOf, setLamps, setAll, figures]);
}

export type Lighting = ReturnType<typeof useLighting>;

/**
 * Energy and cost accumulated while a view is open, integrating the current power as it
 * changes. Updates five times per second so the counters visibly run.
 */
export function useEnergyMeter(watts: number, active: boolean) {
  const [meter, setMeter] = useState({ seconds: 0, wh: 0, savedWh: 0 });
  const power = useRef(watts);
  power.current = watts;
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    let wh = 0, savedWh = 0, seconds = 0;
    setMeter({ seconds, wh, savedWh });
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      seconds += dt;
      wh += (power.current * dt) / 3600;
      savedWh += ((FULL_LOAD_W - power.current) * dt) / 3600;
      setMeter({ seconds, wh, savedWh });
    }, 200);
    return () => window.clearInterval(timer);
  }, [active]);
  return meter;
}
