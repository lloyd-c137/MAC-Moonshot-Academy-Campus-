import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/tab/week12';

const response = await onRequestGet({
  request: new Request('https://mac.moonshotacademy.space/api/tab/week12?room=M102&date=2026-11-02'),
});
assert.equal(response.status, 200, 'public room schedule should not require an Access JWT');
assert.match(response.headers.get('cache-control') ?? '', /public/);
const schedule = await response.json() as { room_id: string; rows: unknown[] };
assert.equal(schedule.room_id, 'M102');
assert.ok(schedule.rows.length > 0, 'known room/day should return its schedule rows');

const invalid = await onRequestGet({
  request: new Request('https://mac.moonshotacademy.space/api/tab/week12?room=INVALID&date=2026-11-02'),
});
assert.equal(invalid.status, 400, 'invalid room IDs must remain rejected');
console.log('Public Week 12 query and input validation passed.');
