/**
 * Campus lighting energy model (simulation from rated power, not meter readings).
 *
 * The 30 surveyed classrooms use the dataset directly. Every other room people work in
 * (labs, studios, 书院, libraries, offices, halls, dining, nurse station) gets a lamp
 * count estimated from its floor area at the classrooms' lamp density, at 40 W per lamp;
 * the cafeteria uses its counted 24 fittings. Estimated rooms are labelled as such.
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

import { CAMPUS_SPACES } from '../data/floorplanData';
import type { CampusSpace } from '../types/campus';

/** Room categories that get lights in the model (people work there). Restrooms, stairs, plant rooms, entrance halls and the open courtyards do not. */
export const LIT_CATEGORIES = new Set<CampusSpace['category']>([
  'classroom', 'laboratory', 'creative_maker', 'library_reading', 'quiet_study', 'office', 'performance_hall', 'dining', 'health_service',
]);

export interface LitRoom {
  id: string;
  /** Lamps installed (all on = full load). */
  lamps: number;
  /** surveyed: the 30 counted classrooms; counted: lamp count from the dataset, power assumed; estimated: from floor area. */
  basis: 'surveyed' | 'counted' | 'estimated';
}

const CLASSROOMS = new Set<string>(CLASSROOM_IDS);

/**
 * Lamp density of the surveyed classrooms: 12 lamps over their median floor area
 * (about 68 m², one lamp per ~5.7 m²). Other rooms get round(area × density) lamps,
 * at least 1, at the same 40 W — an estimate, labelled as such.
 */
const MEDIAN_CLASSROOM_M2 = (() => {
  const areas = CAMPUS_SPACES.filter((s) => CLASSROOMS.has(s.id) && s.areaM2).map((s) => s.areaM2!).sort((x, y) => x - y);
  return areas.length ? areas[Math.floor(areas.length / 2)] : 68;
})();
export const LAMPS_PER_M2 = LIGHTING.lampsPerRoom / MEDIAN_CLASSROOM_M2;

/** Lamp counts known from the dataset outside the 30 classrooms (power still assumed 40 W). */
const COUNTED_LAMPS: Record<string, number> = { A114: 24 }; // 食堂: 24 linear fittings

export const LIT_ROOMS: LitRoom[] = CAMPUS_SPACES.flatMap((s): LitRoom[] => {
  if (CLASSROOMS.has(s.id)) return [{ id: s.id, lamps: LIGHTING.lampsPerRoom, basis: 'surveyed' }];
  if (COUNTED_LAMPS[s.id]) return [{ id: s.id, lamps: COUNTED_LAMPS[s.id], basis: 'counted' }];
  if (!LIT_CATEGORIES.has(s.category) || !s.areaM2) return [];
  return [{ id: s.id, lamps: Math.max(1, Math.round(s.areaM2 * LAMPS_PER_M2)), basis: 'estimated' }];
});
const LIT_BY_ID = new Map(LIT_ROOMS.map((r) => [r.id, r]));
export const litRoom = (id: string) => LIT_BY_ID.get(id);
export const isLitRoom = (id: string) => LIT_BY_ID.has(id);
/** @deprecated use isLitRoom */
export const isLitClassroom = isLitRoom;

const wattsOf = (rooms: LitRoom[]) => rooms.reduce((sum, r) => sum + r.lamps * LIGHTING.lampWatts, 0);
export const FULL_LOAD_W = wattsOf(LIT_ROOMS);
export const CLASSROOM_FULL_LOAD_W = CLASSROOM_IDS.length * LIGHTING.lampsPerRoom * LIGHTING.lampWatts; // 14,400 W

/** Lamps switched on, per room. */
export type LampState = Record<string, number>;

export interface EnergyFigures {
  watts: number;
  lampsOn: number;
  lampsTotal: number;
  roomsLit: number;
  rooms: number;
  /** The 30 surveyed classrooms alone. */
  classroomWatts: number;
  classroomsLit: number;
  /** Energy per second, in watt-hours. */
  whPerSecond: number;
  kwhPerHour: number;
  costPerHour: number;
  /** Compared with every lamp on. */
  savedKwhPerHour: number;
  savedCostPerHour: number;
}

export function roomFigures(lampsOn: number, lampsTotal: number = LIGHTING.lampsPerRoom) {
  const watts = lampsOn * LIGHTING.lampWatts;
  const kwhPerHour = watts / 1000;
  return { lampsOn, lampsTotal, watts, kwhPerHour, costPerHour: kwhPerHour * LIGHTING.pricePerKwh };
}

export const lampsOnIn = (state: LampState, room: LitRoom) => state[room.id] ?? room.lamps;

export function campusFigures(state: LampState): EnergyFigures {
  let lampsOn = 0, lampsTotal = 0, roomsLit = 0, classroomLamps = 0, classroomsLit = 0;
  for (const room of LIT_ROOMS) {
    const n = lampsOnIn(state, room);
    lampsOn += n;
    lampsTotal += room.lamps;
    if (n > 0) roomsLit++;
    if (room.basis === 'surveyed') { classroomLamps += n; if (n > 0) classroomsLit++; }
  }
  const watts = lampsOn * LIGHTING.lampWatts;
  const kwhPerHour = watts / 1000;
  const savedKwhPerHour = (FULL_LOAD_W - watts) / 1000;
  return {
    watts,
    lampsOn,
    lampsTotal,
    roomsLit,
    rooms: LIT_ROOMS.length,
    classroomWatts: classroomLamps * LIGHTING.lampWatts,
    classroomsLit,
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
    for (const room of LIT_ROOMS) {
      const n = Number(raw[room.id]);
      if (Number.isFinite(n)) out[room.id] = Math.max(0, Math.min(room.lamps, Math.round(n)));
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
  const lampsOf = useCallback((id: string) => state[id] ?? litRoom(id)?.lamps ?? 0, [state]);
  const setLamps = useCallback((id: string, n: number) => {
    const room = litRoom(id);
    if (!room) return;
    update({ ...readState(), [id]: Math.max(0, Math.min(room.lamps, Math.round(n))) });
  }, [update]);
  /** All lights off, or all on; optionally only some rooms. */
  const setAll = useCallback((on: boolean, ids?: string[]) => {
    const pick = ids ? new Set(ids) : null;
    const next = { ...readState() };
    for (const room of LIT_ROOMS) if (!pick || pick.has(room.id)) next[room.id] = on ? room.lamps : 0;
    update(next);
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
