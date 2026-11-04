import { selectCoursesAtTime, type ScheduleAdapter, type TabCourse } from '../schedule';

export type ScheduleSource = { type: 'fixed' | 'seiue'; mode: 'demo' | 'production' };
export type ScheduleDataState = 'valid' | 'stale' | 'unavailable';
export type LessonStatus = 'scheduled' | 'cancelled' | 'moved_out';

export interface DailyLesson {
  id: string;
  roomId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  status: LessonStatus;
  movedToRoomId?: string;
  movedFromRoomId?: string;
}

export interface DailySchedule {
  schemaVersion: 1;
  roomId: string;
  date: string;
  timezone: 'Asia/Shanghai';
  source: ScheduleSource;
  dataState: ScheduleDataState;
  scheduleRevision: string;
  fetchedAt?: string;
  validUntil?: string;
  lessons: DailyLesson[];
  scopeStatus?: 'in_scope' | 'out_of_scope' | 'unknown';
  unavailableReason?: string;
}

export type DisplayState = 'before' | 'in_class' | 'between' | 'finished' | 'no_classes' | 'out_of_scope' | 'unavailable' | 'stale';

export interface DisplayViewModel {
  schemaVersion: 1;
  roomId: string;
  date: string;
  timeLabel: string;
  sourceMode: 'demo' | 'production';
  sourceType: 'fixed' | 'seiue';
  dataState: ScheduleDataState;
  scheduleRevision: string;
  state: DisplayState;
  rows: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    emphasis: 'current' | 'next' | 'none';
    note?: 'cancelled' | 'moved_out' | 'moved_in';
    noteText?: string;
  }>;
  lastSuccessfulSync?: string;
  message?: string;
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Stable content revision. This is an identifier, not a security checksum. */
export function contentRevision(value: unknown): string {
  const input = canonical(value);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

const mapLesson = (course: TabCourse): DailyLesson => ({
  id: course.eventId,
  roomId: course.roomId,
  date: course.date,
  start: course.startTime,
  end: course.endTime,
  title: course.title,
  status: course.status,
  movedToRoomId: course.destinationRoomId,
  movedFromRoomId: course.originRoomId,
});

export function createDailySchedule(input: Omit<DailySchedule, 'schemaVersion' | 'scheduleRevision'> & { scheduleRevision?: string }): DailySchedule {
  const lessons = [...input.lessons].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const revisionContent = { roomId: input.roomId, date: input.date, timezone: input.timezone, source: input.source, dataState: input.dataState, lessons };
  return { ...input, schemaVersion: 1, lessons, scheduleRevision: input.scheduleRevision ?? contentRevision(revisionContent) };
}

/** Thin FixedScheduleAdapter bridge; it preserves fixture semantics and exception rows. */
export function dailyScheduleFromFixed(adapter: ScheduleAdapter, roomId: string, date: string, mode: 'normal' | 'stress' = 'normal'): DailySchedule {
  const room = adapter.getRoom(roomId);
  const inDateRange = adapter.isDateValid(date);
  const snapshot = adapter.getRoomDay(roomId, date, '00:00', mode);
  const lessons = snapshot.courses.map(mapLesson);
  const outOfScope = Boolean(room && !room.apScope);
  const dataState: ScheduleDataState = room && inDateRange && !outOfScope ? 'valid' : 'unavailable';
  return createDailySchedule({
    roomId,
    date,
    timezone: 'Asia/Shanghai',
    source: { type: 'fixed', mode: 'demo' },
    dataState,
    lessons,
    scopeStatus: outOfScope ? 'out_of_scope' : room && inDateRange ? 'in_scope' : 'unknown',
    unavailableReason: outOfScope ? `该空间不在 AP 模拟数据范围内。${room?.outOfScopeReason ? ` ${room.outOfScopeReason}` : ''}` : !inDateRange ? '该日期没有有效模拟数据。' : !room ? '找不到该空间。' : undefined,
  });
}

export function displayViewModel(schedule: DailySchedule, time: string): DisplayViewModel {
  const { activeCourses, current, next } = selectCoursesAtTime(schedule.lessons, time, (lesson) => lesson.start, (lesson) => lesson.end);
  const state: DisplayState = schedule.dataState === 'stale' ? 'stale'
    : schedule.dataState === 'unavailable' ? (schedule.scopeStatus === 'out_of_scope' ? 'out_of_scope' : 'unavailable')
      : activeCourses.length === 0 ? 'no_classes'
        : current ? 'in_class'
          : next ? (time < next.start ? 'before' : 'between') : 'finished';
  const rows = schedule.lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    start: lesson.start,
    end: lesson.end,
    emphasis: lesson.id === current?.id ? 'current' as const : lesson.id === next?.id ? 'next' as const : 'none' as const,
    note: lesson.status === 'cancelled' ? 'cancelled' as const
      : lesson.status === 'moved_out' ? 'moved_out' as const
        : lesson.movedFromRoomId ? 'moved_in' as const : undefined,
    noteText: lesson.status === 'cancelled' ? '已取消'
      : lesson.status === 'moved_out' ? `已调出 → ${lesson.movedToRoomId ?? '其他教室'}`
        : lesson.movedFromRoomId ? `从 ${lesson.movedFromRoomId} 调入` : undefined,
  }));
  return {
    schemaVersion: 1,
    roomId: schedule.roomId,
    date: schedule.date,
    timeLabel: time,
    sourceMode: schedule.source.mode,
    sourceType: schedule.source.type,
    dataState: schedule.dataState,
    scheduleRevision: schedule.scheduleRevision,
    state,
    rows,
    lastSuccessfulSync: schedule.fetchedAt,
    message: schedule.dataState === 'valid' ? undefined : schedule.unavailableReason,
  };
}

/** Synthetic API-shaped adapter used to lock the future SEIUE contract without credentials. */
export interface SyntheticSeiueResponse {
  room_id: string;
  date: string;
  timezone: 'Asia/Shanghai';
  lessons: Array<{ event_id: string; room_id: string; date: string; start_time: string; end_time: string; title: string; status: LessonStatus; moved_to_room_id?: string; moved_from_room_id?: string }>;
}

export function dailyScheduleFromSyntheticSeiue(response: SyntheticSeiueResponse): DailySchedule {
  return createDailySchedule({
    roomId: response.room_id,
    date: response.date,
    timezone: response.timezone,
    source: { type: 'seiue', mode: 'demo' },
    dataState: 'valid',
    lessons: response.lessons.map((lesson) => ({
      id: lesson.event_id, roomId: lesson.room_id, date: lesson.date, start: lesson.start_time, end: lesson.end_time,
      title: lesson.title, status: lesson.status, movedToRoomId: lesson.moved_to_room_id, movedFromRoomId: lesson.moved_from_room_id,
    })),
  });
}
