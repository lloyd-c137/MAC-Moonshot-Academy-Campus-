import { SOURCE_ROOMS } from '../../data/sourceRooms';

export type TabSeries = 'A' | 'M' | 'S';
export type ScheduleStatus = 'scheduled' | 'cancelled' | 'moved_out';
export type RoomScheduleState = 'scheduled_class' | 'next_class_later' | 'classes_finished' | 'no_ap_class_scheduled' | 'out_of_ap_scope' | 'unknown';

export interface TabRoom {
  id: string;
  name: string;
  series: TabSeries;
  apScope: boolean;
  outOfScopeReason?: string;
}

export interface TabCourse {
  eventId: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  status: ScheduleStatus;
  originRoomId?: string;
  destinationRoomId?: string;
}

export interface TabScheduleData {
  metadata: {
    timezone: 'Asia/Shanghai';
    validFrom: string;
    validThrough: string;
    defaultDate: string;
    defaultTime: string;
    sourceLabel: string;
  };
  rooms: TabRoom[];
  courses: TabCourse[];
  stressCourses: TabCourse[];
}

export interface RoomScheduleSnapshot {
  state: RoomScheduleState;
  /** Full display list, including cancelled/moved-out notices. */
  courses: TabCourse[];
  activeCourses: TabCourse[];
  current: TabCourse | null;
  next: TabCourse | null;
  utilization: number;
}

export interface ScheduleAdapter {
  readonly data: TabScheduleData;
  getRoom(roomId: string): TabRoom | undefined;
  getRooms(): TabRoom[];
  isDateValid(date: string): boolean;
  getRoomDay(roomId: string, date: string, time: string, mode?: 'normal' | 'stress'): RoomScheduleSnapshot;
}

const ACTIVE: ReadonlySet<ScheduleStatus> = new Set(['scheduled']);
const DAY_START = 8 * 60;
const DAY_END = 17 * 60 + 25;
const DAY_MINUTES = DAY_END - DAY_START;
const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Shared course selection primitive used by fixed and future source adapters. */
export function selectCoursesAtTime<T extends { status: string }>(
  courses: readonly T[], time: string, startOf: (course: T) => string, endOf: (course: T) => string,
) {
  const activeCourses = courses.filter((course) => course.status === 'scheduled');
  const now = minutes(time);
  const current = activeCourses.find((course) => minutes(startOf(course)) <= now && now < minutes(endOf(course))) ?? null;
  const next = activeCourses.find((course) => minutes(startOf(course)) > now) ?? null;
  return { activeCourses, current, next };
}

/** Fixed demo adapter. Date/time strings are compared as Asia/Shanghai wall time, never browser-local time. */
export class FixedScheduleAdapter implements ScheduleAdapter {
  constructor(readonly data: TabScheduleData) {}

  getRoom(roomId: string) { return this.data.rooms.find((room) => room.id === roomId); }
  getRooms() { return this.data.rooms; }
  isDateValid(date: string) { return date >= this.data.metadata.validFrom && date <= this.data.metadata.validThrough; }

  getRoomDay(roomId: string, date: string, time: string, mode: 'normal' | 'stress' = 'normal'): RoomScheduleSnapshot {
    const room = this.getRoom(roomId);
    if (!this.isDateValid(date) || !room) return empty('unknown');
    if (!room.apScope) return empty('out_of_ap_scope');

    const source = mode === 'stress' ? this.data.stressCourses : this.data.courses;
    const courses = source
      .filter((course) => course.roomId === roomId && course.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.eventId.localeCompare(b.eventId));
    const { activeCourses, current, next } = selectCoursesAtTime(courses, time, (course) => course.startTime, (course) => course.endTime);
    const booked = unionMinutes(activeCourses.map((course) => [Math.max(DAY_START, minutes(course.startTime)), Math.min(DAY_END, minutes(course.endTime))] as const));
    const state: RoomScheduleState = activeCourses.length === 0
      ? 'no_ap_class_scheduled'
      : current ? 'scheduled_class'
        : next ? 'next_class_later' : 'classes_finished';

    return { state, courses, activeCourses, current, next, utilization: booked / DAY_MINUTES };
  }
}

const empty = (state: RoomScheduleState): RoomScheduleSnapshot => ({ state, courses: [], activeCourses: [], current: null, next: null, utilization: 0 });

// Count overlapping blocks once so utilization cannot exceed the day window.
function unionMinutes(intervals: ReadonlyArray<readonly [number, number]>): number {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  let total = 0, start = -1, end = -1;
  for (const [nextStart, nextEnd] of sorted) {
    if (start < 0) { start = nextStart; end = nextEnd; }
    else if (nextStart <= end) end = Math.max(end, nextEnd);
    else { total += end - start; start = nextStart; end = nextEnd; }
  }
  return total + (start < 0 ? 0 : end - start);
}

export function validateScheduleData(data: TabScheduleData): string[] {
  const errors: string[] = [];
  if (data.metadata.timezone !== 'Asia/Shanghai' || data.metadata.validFrom > data.metadata.validThrough) errors.push('Invalid timezone or schedule date range');
  const roomIds = new Set<string>();
  for (const room of data.rooms) {
    if (roomIds.has(room.id)) errors.push(`Duplicate room ID: ${room.id}`);
    if (!['A', 'M', 'S'].includes(room.series)) errors.push(`${room.id}: invalid room series`);
    roomIds.add(room.id);
  }
  const eventIds = new Set<string>();
  const byRoomDay = new Map<string, TabCourse[]>();
  for (const course of data.courses) {
    if (!roomIds.has(course.roomId)) errors.push(`${course.eventId}: unknown room ${course.roomId}`);
    if (eventIds.has(course.eventId)) errors.push(`Duplicate event ID: ${course.eventId}`);
    eventIds.add(course.eventId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(course.date) || !/^\d{2}:\d{2}$/.test(course.startTime) || !/^\d{2}:\d{2}$/.test(course.endTime) || !['scheduled', 'cancelled', 'moved_out'].includes(course.status) || minutes(course.startTime) >= minutes(course.endTime) || minutes(course.endTime) > 24 * 60 || Number.isNaN(Date.parse(`${course.date}T00:00:00Z`))) {
      errors.push(`${course.eventId}: invalid date or time`);
    }
    const key = `${course.roomId}/${course.date}`;
    byRoomDay.set(key, [...(byRoomDay.get(key) ?? []), course]);
  }
  for (const [key, events] of byRoomDay) {
    const active = events.filter((event) => ACTIVE.has(event.status)).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < active.length; i += 1) if (active[i].startTime < active[i - 1].endTime) errors.push(`${key}: overlapping ${active[i - 1].eventId} / ${active[i].eventId}`);
  }
  return errors;
}
/** Verifies that a fixture only uses the existing coded FF-01 room inventory. */
export function validateSourceRoomMappings(rooms: TabRoom[]): string[] {
  const sourceCodes = new Set(SOURCE_ROOMS.flatMap((room) => room.code ? [room.code] : []));
  return rooms.flatMap((room) => sourceCodes.has(room.id) ? [] : [`${room.id}: not present in the FF-01 source room catalog`]);
}
