/**
 * M108 Week12 source parity and CSV integrity check.
 * Run: node scripts/validate-tab-m108-pilot.mjs
 * Uses only Node built-ins; no runtime or package dependencies.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data/tab/pilots/M108');
const pilot = JSON.parse(readFileSync(join(dir, 'week12.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(join(root, 'data/tab/reconstructed/2026-fall-week12/week12-schedule.json'), 'utf8'));

const expectedDays = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const periods = [
  ['08:00','08:45'], ['08:50','09:35'], ['09:50','10:35'], ['10:40','11:25'],
  ['11:30','12:15'], ['13:15','14:00'], ['14:00','14:45'], ['15:00','15:45'],
  ['15:45','16:30'], ['16:40','17:25'],
];
const toMinutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const key = e => [e.date,e.start_time,e.end_time,e.course_name,e.course_code ?? '',e.block ?? 'EXTRA'].join('|');
const csvValue = v => {
  const value = v === null || v === undefined ? '' : (typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v));
  return /[,"\n\r]/.test(value) ? '"' + value.replaceAll('"','""') + '"' : value;
};
function assertCsv(fileName, header, rows) {
  const generated = [header.join(','), ...rows.map(row => header.map(field => csvValue(row[field])).join(','))].join('\n') + '\n';
  const stored = readFileSync(join(dir,fileName),'utf8');
  assert.equal(stored,generated,`${fileName} out of sync with JSON canonical data`);
}

assert.equal(pilot.schema_version,'mac.tab.room-pilot.week12.v1');
assert.equal(pilot.room.id,'M108');
assert.equal(pilot.week.timezone,'Asia/Shanghai');
assert.equal(pilot.week.instructional_week,12);
assert.equal(pilot.week.not_valid_for_other_weeks,true);
assert.equal(pilot.daily_slots.length,50);
assert.equal(pilot.events.length,19);
assert.equal(pilot.courses.length,5);
assert.equal(pilot.summary.no_record_slots,31);
assert.equal(pilot.summary.live_occupancy_verified,false);

const byId=new Map();
for (const e of pilot.events) {
  assert.equal(e.room_id,'M108');
  assert.ok(!byId.has(e.event_id),`Duplicate event ID: ${e.event_id}`);
  assert.ok(expectedDays.includes(e.date));
  assert.ok(e.period>=1&&e.period<=10);
  assert.deepEqual([e.start_time,e.end_time],periods[e.period-1]);
  assert.ok(/'!D\d+$/.test(e.source_cell),`Invalid direct-room evidence reference: ${e.source_cell}`);
  assert.equal(e.time_verification,'DIRECT_ROOM_EXPORT_WEEK12');
  assert.ok(toMinutes(e.start_time)<toMinutes(e.end_time));
  assert.equal(e.physical_occupancy,'not_measured');
  byId.set(e.event_id,e);
}

const seenSlots=new Set();
for (const slot of pilot.daily_slots) {
  const id=`${slot.date}/${slot.period}`;
  assert.ok(!seenSlots.has(id),`Duplicate slot ${id}`); seenSlots.add(id);
  assert.ok(expectedDays.includes(slot.date));
  assert.deepEqual([slot.start_time,slot.end_time],periods[slot.period-1]);
  assert.equal(slot.physical_occupancy,'not_measured');
  if(slot.event_id){
    const e=byId.get(slot.event_id);
    assert.ok(e,`Missing event for slot ${id}`);
    assert.equal(key(e),key(slot));
    assert.equal(slot.schedule_evidence,'observed_in_room_export');
  } else {
    assert.equal(slot.schedule_evidence,'no_record_in_room_export');
    assert.equal(slot.course_name,null);
  }
}
for (const d of expectedDays) for(let p=1;p<=10;p++) assert.ok(seenSlots.has(`${d}/${p}`));
for (const e of pilot.events) assert.equal(pilot.daily_slots.filter(s=>s.event_id===e.event_id).length,1);

for(const d of expectedDays){
  const rows=pilot.events.filter(e=>e.date===d).sort((a,b)=>a.start_time.localeCompare(b.start_time));
  assert.equal(rows.length,pilot.summary.recorded_by_date[d]);
  for(let i=1;i<rows.length;i++) assert.ok(rows[i].start_time>=rows[i-1].end_time,`Overlap on ${d}`);
}

const baselineRows=baseline.weekly_display_events.filter(e=>e.room_id==='M108');
assert.equal(baselineRows.length,19,`Expected 19 existing Week12 M108 records, got ${baselineRows.length}`);
assert.deepEqual(pilot.events.map(key).sort(),baselineRows.map(key).sort(),'Direct export does not match the existing Week12 source');

const eventCols=['event_id','date','weekday','room_id','period','start_time','end_time','course_name','course_name_zh','course_code','block','course_type','semester_type_in_catalog','audience_or_description_raw','s1_label_in_export','time_verification','source_cell'];
const slotCols=['date','weekday','room_id','period','start_time','end_time','schedule_evidence','physical_occupancy','event_id','course_name','course_code','block','source_cell'];
assertCsv('week12-events.csv',eventCols,pilot.events);
assertCsv('week12-slots.csv',slotCols,pilot.daily_slots);

console.log('M108 pilot VERIFIED: 19/19 events match Week12 reconstruction, 50/50 slots, 31 no-record slots, 0 overlaps, JSON/CSV in sync.');