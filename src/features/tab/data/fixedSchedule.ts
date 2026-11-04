import fixtureUrl from '../../../../docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json?url';
import { SOURCE_ROOMS } from '../../../data/sourceRooms';
import { FixedScheduleAdapter, validateScheduleData, validateSourceRoomMappings, type ScheduleStatus, type TabRoom, type TabScheduleData } from '../schedule';

type RawFixture = {
  metadata: Record<string, unknown>;
  rooms: Array<Record<string, unknown>>;
  ap_courses: Array<Record<string, unknown>>;
  time_slots: Array<Record<string, unknown>>;
  weekly_rules: Array<Record<string, unknown>>;
  week_events: Array<Record<string, unknown>>;
  exceptions: Array<Record<string, unknown>>;
  room_day_usage: Array<Record<string, unknown>>;
  status_samples: Array<Record<string, unknown>>;
  stress_only: unknown[];
  [key: string]: unknown;
};

const string = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value) throw new Error(`Tab demo fixture: invalid ${field}`);
  return value;
};

export function normalizeFixedFixture(raw: RawFixture): TabScheduleData {
  const metadata = raw.metadata;
  if (metadata.is_demo !== true || metadata.timezone !== 'Asia/Shanghai' || metadata.physical_presence_inferred !== false) {
    throw new Error('Tab demo fixture must be marked DEMO, Asia/Shanghai, and physical occupancy unknown.');
  }
  const sourceByCode = new Map(SOURCE_ROOMS.flatMap((room) => room.code ? [[room.code, room] as const] : []));
  const rooms: TabRoom[] = raw.rooms.map((record) => {
    const id = string(record.room_id, 'room_id');
    const source = sourceByCode.get(id);
    if (!source) throw new Error(`Tab demo fixture references unknown FF-01 room ${id}`);
    if (record.zone !== source.series) throw new Error(`${id}: fixture zone does not match FF-01 room series`);
    if (typeof record.ap_demo_in_scope !== 'boolean') throw new Error(`${id}: missing AP demo scope status`);
    return {
      id,
      name: source.name,
      series: source.series as TabRoom['series'],
      apScope: record.ap_demo_in_scope,
      outOfScopeReason: typeof record.scope_reason === 'string' ? record.scope_reason : undefined,
    };
  });
  if (rooms.length !== 102 || new Set(rooms.map((room) => room.id)).size !== rooms.length || rooms.filter((room) => room.apScope).length !== 53 || rooms.length - rooms.filter((room) => room.apScope).length !== 49) {
    throw new Error('Tab demo fixture room inventory does not match 102 coded rooms (53 AP-scope / 49 out of scope).');
  }
  if (rooms.length !== sourceByCode.size) throw new Error(`Tab demo fixture lists ${rooms.length} rooms; FF-01 source catalog has ${sourceByCode.size} coded rooms.`);
  const courseIds = new Set(raw.ap_courses.map((course) => course.course_id));
  if (courseIds.size !== raw.ap_courses.length) throw new Error('Tab demo fixture contains duplicate AP course IDs.');
  const timeSlotIds = new Set(raw.time_slots.map((slot) => slot.period_id));
  if (timeSlotIds.size !== raw.time_slots.length) throw new Error('Tab demo fixture contains duplicate period IDs.');
  const roomIds = new Set(rooms.map((room) => room.id));
  const ruleIds = new Set<string>();
  for (const rule of raw.weekly_rules) {
    const id = string(rule.rule_id, 'weekly rule_id');
    if (ruleIds.has(id)) throw new Error(`Duplicate weekly rule ${id}.`);
    ruleIds.add(id);
    if (!roomIds.has(String(rule.room_id)) || !courseIds.has(rule.course_id) || !timeSlotIds.has(rule.period_id)) throw new Error(`${id} has an unknown room, AP course, or period.`);
  }
  const courses = raw.week_events.map((record) => ({
    eventId: string(record.event_id, 'event_id'),
    roomId: string(record.room_id, 'room_id'),
    date: string(record.date, 'date'),
    startTime: string(record.start_time, 'start_time'),
    endTime: string(record.end_time, 'end_time'),
    title: string(record.title, 'title'),
    status: string(record.status, 'status') as ScheduleStatus,
    originRoomId: typeof record.origin_room_id === 'string' ? record.origin_room_id : undefined,
    destinationRoomId: typeof record.destination_room_id === 'string' ? record.destination_room_id : undefined,
  }));
  const stressCourses = raw.stress_only.map((record) => {
    if (!record || typeof record !== 'object') throw new Error('Tab demo fixture has invalid stress-only event data.');
    const event = record as Record<string, unknown>;
    return {
      eventId: string(event.event_id, 'stress event_id'),
      roomId: string(event.room_id, 'stress room_id'),
      date: string(event.date, 'stress date'),
      startTime: string(event.start_time, 'stress start_time'),
      endTime: string(event.end_time, 'stress end_time'),
      title: string(event.title, 'stress title'),
      status: string(event.status, 'stress status') as ScheduleStatus,
    };
  });
  const data: TabScheduleData = {
    metadata: {
      timezone: 'Asia/Shanghai',
      validFrom: string(metadata.week_start, 'metadata.week_start'),
      validThrough: string(metadata.week_end, 'metadata.week_end'),
      defaultDate: '2026-11-10',
      defaultTime: '10:50',
      sourceLabel: '固定模拟数据 · FF-01 AP Demo',
    },
    rooms,
    courses,
    stressCourses,
  };
  const eventIds = new Set(courses.map((course) => course.eventId));
  const eventById = new Map(courses.map((course) => [course.eventId, course]));
  for (const event of raw.week_events) {
    if (!courseIds.has(event.course_id)) throw new Error(`${String(event.event_id)} references an unknown AP course.`);
  }
  for (const exception of raw.exceptions) {
    const targetId = string(exception.target_event_id, 'exception target_event_id');
    const target = eventById.get(targetId);
    if (!eventIds.has(targetId) || !target) throw new Error(`${String(exception.exception_id)} references a missing event.`);
    if (exception.type === 'cancel' && target.status !== 'cancelled') throw new Error(`${String(exception.exception_id)} is not reflected as a cancelled event.`);
    if (exception.type === 'move' && target.status !== 'moved_out') throw new Error(`${String(exception.exception_id)} is not reflected as a moved-out event.`);
    if (exception.type === 'move') {
      const destination = string(exception.destination_room_id, 'exception destination_room_id');
      const movedIn = raw.week_events.some((event) => event.room_id === destination && event.date === target.date && event.start_time === target.startTime && event.end_time === target.endTime && event.status === 'scheduled' && event.origin_room_id === target.roomId);
      if (!movedIn) throw new Error(`${String(exception.exception_id)} has no matching moved-in event.`);
    }
  }
  if (raw.room_day_usage.length !== rooms.length * 5) throw new Error('Tab demo fixture room-day usage does not cover all rooms for five days.');
  const usageIds = new Set<string>();
  for (const usage of raw.room_day_usage) {
    const key = `${String(usage.room_id)}/${String(usage.date)}`;
    const room = rooms.find((item) => item.id === usage.room_id);
    if (!roomIds.has(String(usage.room_id)) || !room || usageIds.has(key) || typeof usage.in_ap_demo_scope !== 'boolean' || usage.in_ap_demo_scope !== room.apScope || typeof usage.date !== 'string' || usage.date < data.metadata.validFrom || usage.date > data.metadata.validThrough) throw new Error(`Invalid room-day usage record ${key}.`);
    usageIds.add(key);
  }
  const errors = [...validateScheduleData(data), ...validateSourceRoomMappings(rooms)];
  if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
  const stressErrors = validateScheduleData({ ...data, courses: stressCourses, stressCourses: [] });
  if (stressErrors.length) throw new Error(stressErrors.slice(0, 5).join('\n'));
  if (stressCourses.some((event) => !roomIds.has(event.roomId) || !rooms.find((room) => room.id === event.roomId)?.apScope)) throw new Error('Stress tests reference a non-AP room.');
  if (!stressCourses.length) throw new Error('Tab demo fixture is missing isolated stress-only data.');
  return data;
}

export async function loadFixedScheduleAdapter(): Promise<FixedScheduleAdapter> {
  const response = await fetch(fixtureUrl);
  if (!response.ok) throw new Error(`Tab demo fixture could not be loaded (${response.status}).`);
  const raw = await response.json() as RawFixture;
  return new FixedScheduleAdapter(normalizeFixedFixture(raw));
}
