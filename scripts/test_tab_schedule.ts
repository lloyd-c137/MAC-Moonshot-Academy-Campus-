import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FixedScheduleAdapter, validateScheduleData, validateSourceRoomMappings, type TabScheduleData } from '../src/features/tab/schedule';
import { normalizeFixedFixture } from '../src/features/tab/data/fixedSchedule';

const data: TabScheduleData = {
  metadata: { timezone: 'Asia/Shanghai', validFrom: '2026-11-09', validThrough: '2026-11-13', defaultDate: '2026-11-10', defaultTime: '10:50', sourceLabel: 'DEMO' },
  rooms: [
    { id: 'M123', name: 'M123', series: 'M', apScope: true },
    { id: 'A101', name: 'A101', series: 'A', apScope: false, outOfScopeReason: '小学教室' },
  ],
  stressCourses: [],
  courses: [
    { eventId: 'one', roomId: 'M123', date: '2026-11-10', startTime: '08:00', endTime: '08:45', title: '取消课程', status: 'cancelled' },
    { eventId: 'two', roomId: 'M123', date: '2026-11-10', startTime: '10:00', endTime: '10:50', title: '第一节', status: 'scheduled' },
    { eventId: 'three', roomId: 'M123', date: '2026-11-10', startTime: '10:50', endTime: '11:35', title: '第二节', status: 'scheduled' },
    { eventId: 'four', roomId: 'M123', date: '2026-11-10', startTime: '13:30', endTime: '14:15', title: '调出', status: 'moved_out' },
  ],
};
const adapter = new FixedScheduleAdapter(data);
assert.deepEqual(validateScheduleData(data), []);
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '10:50').current?.eventId, 'three', 'end is exclusive and next start is inclusive');
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '09:00').state, 'next_class_later');
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '12:00').next?.eventId, undefined);
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '12:00').state, 'classes_finished');
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '10:00').courses.length, 4, 'display list retains cancellation and move-out evidence');
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '10:00').activeCourses.length, 2);
assert.equal(adapter.getRoomDay('M123', '2026-11-10', '10:00').utilization, 95 / 565);
assert.equal(adapter.getRoomDay('A101', '2026-11-10', '10:00').state, 'out_of_ap_scope');
assert.equal(adapter.getRoomDay('M123', '2026-11-14', '10:00').state, 'unknown');

const raw = JSON.parse(await readFile(new URL('../docs/tab/demo/Tab_FF01_AP_Demo_2026W46.json', import.meta.url), 'utf8'));
const fixed = new FixedScheduleAdapter(normalizeFixedFixture(raw));
assert.equal(raw.rooms.length, 102);
assert.equal(raw.rooms.filter((room: { ap_demo_in_scope: boolean }) => room.ap_demo_in_scope).length, 53);
assert.equal(raw.rooms.length - raw.rooms.filter((room: { ap_demo_in_scope: boolean }) => room.ap_demo_in_scope).length, 49);
assert.equal(raw.ap_courses.length, 43);
assert.equal(raw.week_events.length, 763);
assert.equal(raw.stress_only.length, 11);
assert.deepEqual(validateScheduleData(fixed.data), []);
assert.deepEqual(validateSourceRoomMappings(fixed.data.rooms), []);
for (const testCase of raw.test_cases) {
  if (testCase.isolated_stress_case) {
    assert.equal(fixed.getRoomDay(testCase.room_id, testCase.date, '10:00').courses.length, raw.week_events.filter((event: { room_id: string; date: string }) => event.room_id === testCase.room_id && event.date === testCase.date).length, 'only normal week events enter the schedule');
    assert.equal(fixed.getRoomDay(testCase.room_id, testCase.date, '10:00', 'stress').courses.length, testCase.expected, 'stress-only rows are available only in explicit stress mode');
    assert.equal(raw.stress_only.filter((event: { room_id: string; date: string }) => event.room_id === testCase.room_id && event.date === testCase.date).length, testCase.expected);
    continue;
  }
  const expected = testCase.expected === 'no_verified_data' ? 'unknown' : testCase.expected;
  assert.equal(fixed.getRoomDay(testCase.room_id, testCase.date, '10:50').state, expected, `dataset case ${testCase.id}`);
}
for (const sample of raw.status_samples) {
  const date = sample.at.slice(0, 10);
  const time = sample.at.slice(11, 16);
  const snapshot = fixed.getRoomDay(sample.room_id, date, time);
  assert.equal(snapshot.state, sample.scheduled_occupancy_state, `status sample ${sample.room_id} ${sample.at}`);
  assert.equal(snapshot.current?.eventId ?? null, sample.current_event_id ?? null, `current event ${sample.room_id} ${sample.at}`);
  assert.equal(snapshot.next?.eventId ?? null, sample.next_event_id ?? null, `next event ${sample.room_id} ${sample.at}`);
}
for (const usage of raw.room_day_usage.filter((day: { in_ap_demo_scope: boolean }) => day.in_ap_demo_scope)) {
  const snapshot = fixed.getRoomDay(usage.room_id, usage.date, '10:50');
  assert.equal(snapshot.activeCourses.length, usage.scheduled_class_count, `class count ${usage.room_id} ${usage.date}`);
  assert.equal(Number((snapshot.utilization * 100).toFixed(1)), usage.scheduled_utilization_pct, `utilization ${usage.room_id} ${usage.date}`);
}
const cancelledM123 = fixed.getRoomDay('M123', '2026-11-10', '08:30');
assert.equal(cancelledM123.current, null);
assert.equal(cancelledM123.next?.startTime, '09:50');
assert.equal(cancelledM123.courses[0].status, 'cancelled');
const movedFrom = fixed.getRoomDay('M105', '2026-11-12', '08:30');
const movedTo = fixed.getRoomDay('M106', '2026-11-12', '08:30');
assert.equal(movedFrom.current, null);
assert.equal(movedFrom.courses[0].status, 'moved_out');
assert.equal(movedTo.current?.originRoomId, 'M105');
assert.equal(fixed.getRoomDay('M107', '2026-11-11', '10:00').state, 'no_ap_class_scheduled');
assert.equal(fixed.getRoomDay('A101', '2026-11-11', '10:00').state, 'out_of_ap_scope');
assert.equal(fixed.getRoomDay('M123', '2026-11-14', '10:00').state, 'unknown');
console.log('Tab schedule core checks passed.');
