import React, { useMemo, useState } from 'react';
import { CalendarDays, Clock3, Search } from 'lucide-react';
import { FixedScheduleAdapter, type RoomScheduleSnapshot, type ScheduleAdapter, type TabRoom, type TabScheduleData } from './schedule';
import { dailyScheduleFromFixed, displayViewModel } from './display/model';

const statusText: Record<RoomScheduleSnapshot['state'], string> = {
  scheduled_class: '正在上课', next_class_later: '稍后有课', classes_finished: '今日课程结束',
  no_ap_class_scheduled: '今日无 AP 模拟排课', out_of_ap_scope: '不在 AP 模拟范围', unknown: '该日期没有有效模拟数据',
};
const statusTone: Record<RoomScheduleSnapshot['state'], string> = {
  scheduled_class: 'text-ember', next_class_later: 'text-ink', classes_finished: 'text-crater',
  no_ap_class_scheduled: 'text-crater', out_of_ap_scope: 'text-crater', unknown: 'text-crater',
};

export const TabScheduleWorkspace: React.FC<{ data: TabScheduleData; initialRoomId?: string | null }> = ({ data, initialRoomId }) => {
  const adapter: ScheduleAdapter = useMemo(() => new FixedScheduleAdapter(data), [data]);
  const params = new URLSearchParams(window.location.search);
  const [date, setDate] = useState(params.get('date') ?? data.metadata.defaultDate);
  const [time, setTime] = useState(params.get('time') ?? data.metadata.defaultTime);
  const [roomId, setRoomId] = useState(initialRoomId ?? params.get('room') ?? data.rooms.find((room) => room.apScope)?.id ?? '');
  const [series, setSeries] = useState<'A' | 'M' | 'S' | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [includeOutOfScope, setIncludeOutOfScope] = useState(false);
  const [stressMode, setStressMode] = useState(false);
  const inRange = adapter.isDateValid(date);
  const selected = adapter.getRoom(roomId);
  const snapshot = adapter.getRoomDay(roomId, date, time, stressMode ? 'stress' : 'normal');
  const displayModel = displayViewModel(dailyScheduleFromFixed(adapter, roomId, date, stressMode ? 'stress' : 'normal'), time);
  const visibleRooms = useMemo(() => data.rooms
    .filter((room) => includeOutOfScope || room.apScope)
    .filter((room) => series === 'ALL' || room.series === series)
    .filter((room) => !query || `${room.id} ${room.name}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })),
  [data.rooms, includeOutOfScope, query, series]);

  const setQueryState = (next: Partial<{ room: string; date: string; time: string }>) => {
    const url = new URL(window.location.href);
    const nextRoom = next.room ?? roomId;
    const nextDate = next.date ?? date;
    const nextTime = next.time ?? time;
    if (nextRoom) url.searchParams.set('room', nextRoom); else url.searchParams.delete('room');
    url.searchParams.set('date', nextDate);
    url.searchParams.set('time', nextTime);
    window.history.replaceState(window.history.state, '', url);
  };
  const changeRoom = (id: string) => { setRoomId(id); setQueryState({ room: id }); };
  const changeDate = (value: string) => { setDate(value); setQueryState({ date: value }); };
  const changeTime = (value: string) => { setTime(value); setQueryState({ time: value }); };
  const resetDemoTime = () => {
    const { defaultDate, defaultTime } = data.metadata;
    setDate(defaultDate); setTime(defaultTime); setStressMode(false);
    const url = new URL(window.location.href);
    url.searchParams.set('date', defaultDate); url.searchParams.set('time', defaultTime);
    window.history.replaceState(window.history.state, '', url);
  };
  const quickTimes = ['08:00', '10:50', '13:30', '16:00'];
  const count = data.rooms.filter((room) => room.apScope).length;
  const outCount = data.rooms.length - count;

  return (
    <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(390px,.86fr)]">
      <section className="min-w-0 rounded-[22px] border border-ink/[0.08] bg-white/80 p-4 sm:p-6" aria-label="校园模拟课表总览">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-[18px] font-semibold">教室排课总览</h2><p className="mt-1 text-[12px] text-crater">{count} 间参与 AP 模拟 · {outCount} 个编号空间在模拟范围外</p></div>
          <label className="relative min-w-[190px] flex-1 sm:max-w-[260px]">
            <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dust" />
            <input aria-label="搜索教室" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索房间编号或名称" className="w-full rounded-full border border-ink/10 bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-ember/50" />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-1 rounded-full bg-ink/[0.04] p-1" role="tablist" aria-label="选择区域">
          {(['ALL', 'A', 'M', 'S'] as const).map((key) => <button key={key} role="tab" aria-selected={series === key} onClick={() => setSeries(key)} className={`rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors ${series === key ? 'bg-white text-ink shadow-sm' : 'text-crater hover:text-ink'}`}>{key === 'ALL' ? '全部' : `${key} 区`}</button>)}
        </div>
        <div className="mt-4 max-h-[min(64vh,680px)] overflow-y-auto pr-1">
          {visibleRooms.length === 0 ? <p className="py-10 text-center text-[13px] text-crater">没有匹配的教室。</p> : <ul className="divide-y divide-ink/[0.07]">
            {visibleRooms.map((room) => <RoomRow key={room.id} room={room} date={date} time={time} adapter={adapter} stressMode={stressMode} selected={room.id === roomId} onSelect={() => changeRoom(room.id)} />)}
          </ul>}
        </div>
        <button type="button" onClick={() => setIncludeOutOfScope((value) => !value)} className="mt-4 rounded-full border border-ink/10 px-3.5 py-2 text-[12px] text-crater hover:bg-ink/[0.03] hover:text-ink">
          {includeOutOfScope ? `隐藏模拟范围外空间（${outCount}）` : `查看另外 ${outCount} 个编号空间及范围说明`}
        </button>
      </section>

      <section className="min-w-0 space-y-5">
        <section className="rounded-[22px] border border-ink/[0.08] bg-white/80 p-4 sm:p-6" aria-label="模拟时间">
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[180px] flex-1 items-center gap-2 text-[12px] text-crater"><CalendarDays aria-hidden className="h-4 w-4" />日期<input aria-label="模拟日期" type="date" value={date} onChange={(e) => changeDate(e.target.value)} className="ml-auto min-w-0 rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-[13px] text-ink" /></label>
            <label className="flex min-w-[160px] flex-1 items-center gap-2 text-[12px] text-crater"><Clock3 aria-hidden className="h-4 w-4" />时间<input aria-label="模拟时间" type="time" value={time} onChange={(e) => changeTime(e.target.value)} className="ml-auto rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-[13px] text-ink" /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {quickTimes.map((value) => <button key={value} type="button" onClick={() => changeTime(value)} className={`rounded-full px-3 py-1.5 text-[12px] tabular-nums ${time === value ? 'bg-ink text-white' : 'bg-ink/[0.05] text-crater hover:text-ink'}`}>{value}</button>)}
            <button type="button" onClick={resetDemoTime} className="ml-auto text-[12px] text-crater underline decoration-ink/20 underline-offset-2 hover:text-ink">恢复演示默认时间</button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink/[0.07] pt-3">
            <p className="text-[11px] text-crater">正常周课表</p>
            <button type="button" aria-pressed={stressMode} onClick={() => {
              const next = !stressMode; setStressMode(next);
              if (next) { setSeries('M'); changeRoom('M115'); changeDate('2026-11-12'); changeTime('10:00'); }
              else resetDemoTime();
            }} className={`rounded-full px-3 py-1.5 text-[11px] font-medium ${stressMode ? 'bg-ember text-white' : 'border border-ink/10 text-crater hover:text-ink'}`}>{stressMode ? '退出压力测试' : '打开 M115 · 11 节压力测试'}</button>
          </div>
        </section>

        <section className="rounded-[22px] border border-ink/[0.08] bg-white/80 p-4 sm:p-6" aria-label="Tab 电子纸预览">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[11px] font-semibold tracking-[0.1em] text-crater">{stressMode ? 'STRESS TEST · ISOLATED' : 'TAB DISPLAY · DEMO'}</p><h2 className="mt-1 text-[20px] font-semibold">电子纸课表预览</h2></div>
            {selected && <div className="text-right"><p className="font-display text-[26px] font-semibold leading-none">{selected.id}</p><p className="mt-1 text-[12px] text-crater">{selected.name}</p></div>}
          </div>
          {!inRange ? <div className="mt-5 rounded-xl bg-ink/[0.04] p-4 text-[13px] text-crater">该日期没有有效模拟数据。选择 2026-11-09 至 2026-11-13 之间的日期。</div> : !selected ? <div className="mt-5 rounded-xl bg-ink/[0.04] p-4 text-[13px] text-crater">请先从左侧选择一间教室。</div> : snapshot.state === 'out_of_ap_scope' ? <div className="mt-5 rounded-xl bg-ink/[0.04] p-4"><p className="text-[13px] font-medium">{statusText[snapshot.state]}</p><p className="mt-1 text-[12px] text-crater">{selected.outOfScopeReason ?? '该空间未被此 AP 模拟课表覆盖。'}</p></div> : (
            <div className="mt-5 border border-black bg-white p-4 text-black shadow-[0_8px_24px_rgba(24,32,46,.08)] sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-black/20 pb-3">
                <div><p className="text-[10px] font-semibold tracking-[0.08em]">{displayModel.sourceMode === 'demo' ? 'DEMO · 固定模拟数据' : '生产课表'}</p><p className="mt-1 text-[13px] font-medium">{displayModel.date}　{displayModel.timeLabel} · Asia/Shanghai</p></div>
                <p className={`text-[12px] font-semibold ${statusTone[snapshot.state]}`}>{displayModel.state === 'in_class' ? '正在上课' : displayModel.state === 'before' ? '稍后有课' : displayModel.state === 'between' ? '课间' : displayModel.state === 'finished' ? '今日课程结束' : displayModel.state === 'no_classes' ? '今日无 AP 模拟排课' : displayModel.state}</p>
              </div>
              {displayModel.rows.length === 0 ? <p className="py-8 text-center text-[14px]">今日无 AP 模拟排课</p> : <ol className={`mt-2 grid gap-x-5 ${displayModel.rows.length > 7 ? 'sm:grid-cols-2' : ''}`}>
                {displayModel.rows.map((row) => <li key={row.id} className={`grid grid-cols-[88px_1fr] gap-3 border-b border-black/10 py-2.5 ${row.emphasis === 'current' ? 'bg-amber-100 px-2 ring-1 ring-inset ring-amber-500' : row.emphasis === 'next' ? 'rounded-sm bg-ink/[0.03] px-2 ring-1 ring-inset ring-ink/20' : ''} ${row.note === 'cancelled' || row.note === 'moved_out' ? 'text-black/50' : ''}`}>
                  <span className="text-[12px] tabular-nums">{row.start}–{row.end}</span>
                  <span className="min-w-0 break-words text-[13px] font-medium">{row.title}{row.noteText && <span className="ml-2 text-[10px] font-normal">{row.noteText}</span>}</span>
                </li>)}
              </ol>}
              <p className="mt-3 flex justify-between border-t border-black/20 pt-2 text-[10px] text-black/60"><span>计划排课利用率　{Math.round(snapshot.utilization * 100)}%</span><span>不代表实际有人或可用状态</span></p>
          </div>
          )}
        </section>
        <p className="px-1 text-[11px] leading-relaxed text-dust">课程模拟状态与环境传感器、实际教室占用相互独立。压力测试数据不进入本周排课。</p>
      </section>
    </div>
  );
};

const RoomRow: React.FC<{ room: TabRoom; date: string; time: string; adapter: ScheduleAdapter; stressMode: boolean; selected: boolean; onSelect: () => void }> = ({ room, date, time, adapter, stressMode, selected, onSelect }) => {
  const snapshot = adapter.getRoomDay(room.id, date, time, stressMode ? 'stress' : 'normal');
  const label = statusText[snapshot.state];
  return <li><button type="button" onClick={onSelect} aria-pressed={selected} className={`w-full py-3 text-left transition-colors ${selected ? 'bg-flare-wash px-3' : 'px-1 hover:bg-ink/[0.025]'}`}>
    <span className="flex items-center justify-between gap-3"><span className="min-w-0"><span className="font-display text-[18px] font-semibold">{room.id}</span><span className="ml-2 truncate text-[12px] text-crater">{room.name}</span></span><span className={`shrink-0 text-[11px] font-medium ${statusTone[snapshot.state]}`}>{label}</span></span>
    <span className="mt-1 flex items-center justify-between gap-3 text-[11px] text-dust"><span>{room.apScope ? `${snapshot.activeCourses.length} 节课程` : room.outOfScopeReason ?? '范围外'}</span>{room.apScope && <span className="tabular-nums">计划利用率 {Math.round(snapshot.utilization * 100)}%</span>}</span>
    {room.apScope && <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-ink/[0.06]"><span className="block h-full rounded-full bg-flare" style={{ width: `${Math.min(100, snapshot.utilization * 100)}%` }} /></span>}
  </button></li>;
};
