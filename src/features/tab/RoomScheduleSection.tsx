import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';

type Week12Entry = {
  date: string;
  day: string;
  room_id: string;
  start_time: string;
  end_time: string;
  period: number;
  block: string;
  course_name: string;
  course_code: string;
  record_status: string;
  time_verification: string;
  subslot_verification: string;
};

type RoomScheduleResponse = {
  room_id: string;
  date: string;
  week: { start: string; end: string; number: number };
  data_state: 'valid' | 'stale' | 'unavailable';
  rows: Week12Entry[];
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; schedule: RoomScheduleResponse };

const WEEK_DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'];
const WEEKDAY = ['周一', '周二', '周三', '周四', '周五'];

function shanghaiDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isInferred(row: Week12Entry): boolean {
  return row.time_verification.startsWith('INFERRED') || row.subslot_verification.startsWith('INFERRED');
}

function entryType(row: Week12Entry): string {
  if (row.record_status === 'OBSERVED_EXTRA_NOT_IN_CATALOG') return '课堂 / 活动观察';
  if (row.record_status === 'YEAR_LONG_CATALOG') return '课程目录重建';
  return '课程安排';
}

export const RoomScheduleSection: React.FC<{ roomId: string }> = ({ roomId }) => {
  const today = shanghaiDate();
  const [date, setDate] = useState(() => WEEK_DATES.includes(today) ? today : WEEK_DATES[0]);
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    fetch(`/api/tab/week12?room=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}`, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('unavailable');
      const schedule = await response.json() as RoomScheduleResponse;
      setState({ kind: 'ready', schedule });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setState({ kind: 'unavailable' });
    });
    return () => controller.abort();
  }, [date, roomId]);

  const rows = useMemo(() => state.kind === 'ready'
    ? [...state.schedule.rows].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.period - b.period)
    : [], [state]);
  const currentTime = useMemo(() => new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now), [now]);
  const currentRows = date === today ? rows.filter((row) => row.start_time <= currentTime && currentTime < row.end_time) : [];
  const nextRow = date === today ? rows.find((row) => row.start_time > currentTime) : undefined;
  const dayIndex = WEEK_DATES.indexOf(date);
  const selectedDay = dayIndex >= 0 ? WEEKDAY[dayIndex] : '所选日期';

  if (!/^[AMS]\d{3}(?:-\d+)?$/.test(roomId)) return null;

  return (
    <section aria-labelledby="room-week12-title" className="mt-7 rounded-2xl border border-ink/[0.08] bg-ink/[0.018] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="room-week12-title" className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><CalendarDays aria-hidden className="h-4 w-4 text-crater" />第 12 周课程安排</h3>
          <p className="mt-1 text-[11px] text-crater">2026-11-02 至 11-06 · Asia/Shanghai</p>
        </div>
        <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[10px] text-crater">重建课表</span>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1" aria-label="选择第 12 周日期">
        {WEEK_DATES.map((value, index) => (
          <button key={value} type="button" onClick={() => setDate(value)} aria-pressed={date === value}
            className={`rounded-lg px-1 py-1.5 text-[11px] ${date === value ? 'bg-ink text-white' : 'bg-white text-crater hover:text-ink'}`}>
            {WEEKDAY[index]} <span className="tabular-nums">{Number(value.slice(-2))}</span>
          </button>
        ))}
      </div>

      {state.kind === 'loading' && <p className="mt-4 text-[12px] text-crater">正在获取本周课程安排…</p>}
      {state.kind === 'unavailable' && <p className="mt-4 text-[12px] text-crater">课表服务暂不可用，空间占用状态未知。</p>}
      {state.kind === 'ready' && state.schedule.data_state === 'stale' && <p className="mt-4 text-[12px] text-crater">该日不在第 12 周数据范围内；当前占用状态未知。</p>}
      {state.kind === 'ready' && state.schedule.data_state === 'valid' && (
        <>
          <div className="mt-4 flex items-start gap-2 border-l-2 border-calm pl-3">
            <Clock3 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-calm" />
            <div>
              <p className="text-[12px] font-semibold text-ink">
                {date === today
                  ? currentRows.length ? '课表时段进行中' : nextRow ? '稍后有课表安排' : '当前没有后续课表记录'
                  : `${selectedDay}共 ${rows.length} 条课表记录`}
              </p>
              {date === today && currentRows[0] && <p className="mt-1 text-[12px] text-ink-soft">{currentRows[0].start_time}–{currentRows[0].end_time} · {currentRows[0].course_name}</p>}
              {!currentRows.length && nextRow && <p className="mt-1 text-[12px] text-ink-soft">下一条：{nextRow.start_time} · {nextRow.course_name}</p>}
              {date === today && !currentRows.length && !nextRow && <p className="mt-1 text-[11px] text-crater">这只表示课表中没有当前记录，不代表现场空闲。</p>}
            </div>
          </div>

          {rows.length === 0 ? <p className="mt-4 text-[12px] text-crater">该日没有匹配到这间教室的课表记录；实际占用状态未知。</p> : (
            <ol className="mt-4 divide-y divide-ink/[0.07]">
              {rows.map((row, index) => {
                const active = date === today && row.start_time <= currentTime && currentTime < row.end_time;
                return <li key={`${row.date}-${row.start_time}-${row.course_code}-${index}`} className={`flex items-start gap-3 py-2.5 ${active ? 'rounded-lg bg-white px-2' : ''}`}>
                  <span className="w-[5.1rem] shrink-0 pt-0.5 text-[11px] tabular-nums text-crater">{row.start_time}–{row.end_time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[12px] font-medium text-ink">{row.course_name}</span>
                    <span className="mt-1 block text-[10px] text-crater">{row.block} Block · {entryType(row)}{row.course_code ? ` · ${row.course_code}` : ''}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] ${isInferred(row) ? 'bg-flare/10 text-ember' : 'bg-calm/10 text-calm'}`}>{isInferred(row) ? '推断时段' : '来源记录'}</span>
                </li>;
              })}
            </ol>
          )}
          <p className="mt-3 border-t border-ink/[0.07] pt-2.5 text-[10px] leading-relaxed text-dust">课表排期不代表实际有人或可用状态；实时占用需现场传感器或人工确认。推断时段已单独标记。</p>
        </>
      )}
    </section>
  );
};
