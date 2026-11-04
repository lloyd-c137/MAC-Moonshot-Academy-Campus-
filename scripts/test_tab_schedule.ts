import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FixedScheduleAdapter, validateScheduleData, validateSourceRoomMappings, type TabScheduleData } from '../src/features/tab/schedule';
import { normalizeFixedFixture } from '../src/features/tab/data/fixedSchedule';
import { createDailySchedule, dailyScheduleFromFixed, dailyScheduleFromSyntheticSeiue, displayViewModel } from '../src/features/tab/display/model';
import { MONO1_800X480_TEST, displayProfile } from '../src/features/tab/display/profiles';
import { packRgbaMono1, assertMonoBitmap } from '../src/features/tab/display/mono1';
import { renderDisplaySvg } from '../src/features/tab/display/render';
import { buildDeviceManifest, validateDeviceManifest } from '../src/features/tab/device/manifest';
import { frameRevision } from '../src/features/tab/device/manifest';

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

// The fixed and synthetic SEIUE-shaped sources project through one view model and selector.
const fixedDaily = dailyScheduleFromFixed(fixed, 'M123', '2026-11-10');
const sourceCourses = fixedDaily.lessons.map((lesson) => ({
  event_id: lesson.id, room_id: lesson.roomId, date: lesson.date, start_time: lesson.start, end_time: lesson.end,
  title: lesson.title, status: lesson.status, moved_to_room_id: lesson.movedToRoomId, moved_from_room_id: lesson.movedFromRoomId,
}));
const seiueDaily = dailyScheduleFromSyntheticSeiue({ room_id: 'M123', date: '2026-11-10', timezone: 'Asia/Shanghai', lessons: sourceCourses });
for (const time of ['08:30', '10:50', '12:20', '16:00', '17:30']) {
  const fixedView = displayViewModel(fixedDaily, time);
  const seiueView = displayViewModel(seiueDaily, time);
  assert.equal(fixedView.state, seiueView.state, `source-neutral state at ${time}`);
  assert.deepEqual(fixedView.rows, seiueView.rows, `source-neutral rows at ${time}`);
  assert.equal(renderDisplaySvg(fixedView, MONO1_800X480_TEST), renderDisplaySvg(seiueView, MONO1_800X480_TEST), `source-neutral image content at ${time}`);
}
assert.equal(displayViewModel(fixedDaily, '10:50').state, 'in_class');
assert.equal(displayViewModel(dailyScheduleFromFixed(fixed, 'M107', '2026-11-11'), '10:00').state, 'no_classes');
const movedOutView = displayViewModel(dailyScheduleFromFixed(fixed, 'M105', '2026-11-12'), '08:30');
const movedInView = displayViewModel(dailyScheduleFromFixed(fixed, 'M106', '2026-11-12'), '08:30');
assert.equal(movedOutView.rows[0].note, 'moved_out');
assert.equal(movedInView.rows[0].note, 'moved_in');
const stressDaily = dailyScheduleFromFixed(fixed, 'M115', '2026-11-12', 'stress');
assert.equal(stressDaily.lessons.length, 11, 'M115 stress fixture keeps every lesson');
assert.equal(new Set([fixedDaily.scheduleRevision, dailyScheduleFromFixed(fixed, 'M123', '2026-11-10').scheduleRevision]).size, 1, 'schedule revision is stable across reads');
assert.equal(displayViewModel(fixedDaily, '10:39').rows.find((row) => row.emphasis !== 'none')?.emphasis, 'next');
assert.equal(displayViewModel(fixedDaily, '10:40').rows.find((row) => row.emphasis !== 'none')?.emphasis, 'current', 'frame display selection changes at lesson boundary');
assert.notEqual(await frameRevision(displayViewModel(fixedDaily, '10:39'), MONO1_800X480_TEST, 'test-v1', '2026-11-10T10:40:00+08:00'),
  await frameRevision(displayViewModel(fixedDaily, '10:40'), MONO1_800X480_TEST, 'test-v1', '2026-11-10T10:40:00+08:00'), 'frame revision tracks a highlight transition');
const longTitle = 'A very long bilingual studio title for an intentionally dense electronic paper room schedule';
const longSchedule = { ...fixedDaily, lessons: [{ ...fixedDaily.lessons[0], id: 'long-title', title: longTitle }] };
const longSvgText = renderDisplaySvg(displayViewModel(longSchedule, '10:00'), MONO1_800X480_TEST);
assert.ok(longTitle.split(' ').every((word) => longSvgText.includes(word)), 'long title words are not dropped from SVG output');

const testProfile = displayProfile(8, 1, 'unit-test');
const mono = packRgbaMono1(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]), testProfile);
assert.deepEqual([...mono.data], [0b10101010], 'mono1 rows are MSB-first and bit 1 means black');
assertMonoBitmap(mono, testProfile);
const stressSvg = renderDisplaySvg(displayViewModel(stressDaily, '10:00'), MONO1_800X480_TEST);
assert.match(stressSvg, /M115/);
for (const lesson of stressDaily.lessons) assert.ok(stressSvg.includes(lesson.title), `stress title is rendered: ${lesson.title}`);
const m123Svg = renderDisplaySvg(displayViewModel(fixedDaily, '10:50'), MONO1_800X480_TEST);
assert.match(m123Svg, /DEMO/);
assert.ok(m123Svg.includes(displayViewModel(fixedDaily, '10:50').rows.find((row) => row.emphasis === 'current')?.title ?? 'not-found'));

const zeroData = dailyScheduleFromFixed(fixed, 'M107', '2026-11-11');
assert.equal(displayViewModel(createDailySchedule({ roomId: 'M123', date: '2026-11-10', timezone: 'Asia/Shanghai', source: { type: 'fixed', mode: 'demo' }, dataState: 'stale', lessons: fixedDaily.lessons }), '10:50').state, 'stale');
assert.equal(displayViewModel(createDailySchedule({ roomId: 'M123', date: '2026-11-14', timezone: 'Asia/Shanghai', source: { type: 'fixed', mode: 'demo' }, dataState: 'unavailable', lessons: [], unavailableReason: 'unknown day' }), '10:50').state, 'unavailable');
const manifest = await buildDeviceManifest(zeroData, testProfile, [{ time: '00:00', frameRevision: `sha256:${'b'.repeat(64)}`, path: '/tab/demo/device/v1/frames/test.bin', byteLength: 1, sha256: 'a'.repeat(64) }]);
assert.equal(manifest.frames[0].effective_from, '2026-11-11T00:00:00+08:00');
assert.equal(manifest.frames[0].effective_until, '2026-11-12T00:00:00+08:00');
validateDeviceManifest(manifest);
assert.throws(() => validateDeviceManifest({ ...manifest, frames: [{ ...manifest.frames[0], byte_length: 2 }] }), /Invalid frame payload metadata/);
console.log('Tab schedule core checks passed.');
