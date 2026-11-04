import scheduleData from '../../../data/tab/reconstructed/2026-fall-week12/week12-schedule.json';

interface PagesRequestContext {
  request: Request;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, no-store, max-age=0' },
  });
}

export async function onRequestGet({ request }: PagesRequestContext): Promise<Response> {
  const url = new URL(request.url);
  const roomId = url.searchParams.get('room')?.trim() ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!/^[AMS]\d{3}(?:-\d+)?$/.test(roomId) || !/^2026-11-0[2-6]$/.test(date)) {
    return json({ error: 'INVALID_ROOM_OR_DATE' }, 400);
  }

  const rows = scheduleData.weekly_display_events.filter((row) => row.room_id === roomId && row.date === date);
  return json({
    room_id: roomId,
    date,
    week: { start: '2026-11-02', end: '2026-11-06', number: 12 },
    data_state: 'valid',
    rows,
  });
}
