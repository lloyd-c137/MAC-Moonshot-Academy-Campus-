import React, { useMemo } from 'react';
import { Lightbulb, LightbulbOff, Power, X, Zap } from 'lucide-react';
import type { CampusSpace } from '../../types/campus';
import { CLASSROOM_IDS, FULL_LOAD_W, LAMPS_PER_M2, LIGHTING, LIT_ROOMS, roomFigures, useEnergyMeter, type Lighting, type LitRoom } from '../../services/energyModel';
import { displayCode, displayName } from './format';

const nf = (digits: number) => new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const n0 = nf(0), n2 = nf(2), n4 = nf(4);
const yuan = (v: number, digits = 2) => `¥${nf(digits).format(v)}`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** On / off switch for one classroom. */
export const LightSwitch: React.FC<{ on: boolean; label: string; onChange: (on: boolean) => void; size?: 'sm' | 'md' }> = ({ on, label, onChange, size = 'sm' }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={(e) => { e.stopPropagation(); onChange(!on); }}
    className={`relative shrink-0 rounded-full transition-colors duration-200 ${size === 'md' ? 'h-7 w-12' : 'h-6 w-10'} ${on ? 'bg-[#f5b623]' : 'bg-ink/15'}`}
  >
    <span className={`absolute top-0.5 rounded-full bg-white shadow transition-transform duration-200 ${size === 'md' ? 'left-0.5 h-6 w-6' : 'left-0.5 h-5 w-5'} ${on ? (size === 'md' ? 'translate-x-5' : 'translate-x-4') : ''}`} />
  </button>
);

const Tile: React.FC<{ label: string; value: string; unit?: string; note?: string; tone?: 'save' }> = ({ label, value, unit, note, tone }) => (
  <div className="rounded-[14px] bg-white/70 px-3.5 py-3">
    <div className="text-[11.5px] text-crater">{label}</div>
    <div className={`mt-1 whitespace-nowrap text-[20px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${tone === 'save' ? 'text-calm' : 'text-ink'}`}>
      {value}{unit && <span className="ml-0.5 text-[11px] font-medium tracking-normal text-crater">{unit}</span>}
    </div>
    {note && <div className="mt-1 text-[11px] text-dust">{note}</div>}
  </div>
);

interface EnergyPanelProps {
  isOpen: boolean;
  spaces: CampusSpace[];
  lighting: Lighting;
  selectedSpaceId: string | null;
  onSelectSpace: (id: string) => void;
  onClose: () => void;
}

/**
 * 能耗: classroom lighting power and cost, live. The figures come from rated power
 * (12 × 40 W per classroom) and the switchboard state; turning lights off here or in a
 * room sheet changes them at once.
 */
export const EnergyPanel: React.FC<EnergyPanelProps> = ({ isOpen, spaces, lighting, selectedSpaceId, onSelectSpace, onClose }) => {
  const byId = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const { figures: f, lampsOf, setLamps, setAll } = lighting;
  const meter = useEnergyMeter(f.watts, isOpen);
  if (!isOpen) return null;

  const loadShare = f.watts / FULL_LOAD_W;
  const surveyed = LIT_ROOMS.filter((r) => r.basis === 'surveyed');
  const others = LIT_ROOMS.filter((r) => r.basis !== 'surveyed');
  const ofCategory = (cats: string[]) => others.filter((r) => cats.includes(byId.get(r.id)?.category ?? '')).sort((a, b) => a.id.localeCompare(b.id));
  const groups: { title: string; rooms: LitRoom[]; estimated?: boolean }[] = [
    { title: '已调查教室 · M 区', rooms: surveyed.filter((r) => r.id.startsWith('M')).sort((a, b) => a.id.localeCompare(b.id)) },
    { title: '已调查教室 · A 区', rooms: surveyed.filter((r) => r.id.startsWith('A')).sort((a, b) => a.id.localeCompare(b.id)) },
    { title: '书院与其他教室', rooms: ofCategory(['classroom']), estimated: true },
    { title: '实验室', rooms: ofCategory(['laboratory']), estimated: true },
    { title: '艺术与创作', rooms: ofCategory(['creative_maker']), estimated: true },
    { title: '图书与自习', rooms: ofCategory(['library_reading', 'quiet_study']), estimated: true },
    { title: '办公与会议', rooms: ofCategory(['office']), estimated: true },
    { title: '活动厅、餐厅与护士站', rooms: ofCategory(['performance_hall', 'dining', 'health_service']), estimated: true },
  ].filter((g) => g.rooms.length > 0);

  return (
    <section
      data-energy-panel
      aria-label="能耗"
      className="glass animate-rise absolute z-30 flex max-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-[var(--radius-sheet)]
        left-4 top-[4.75rem] w-[380px] md:left-[6.75rem] max-md:inset-x-3 max-md:w-auto max-md:max-h-[58dvh] max-md:bg-[#fbfcfd]"
    >
      <header className="flex items-center justify-between px-5 pt-4">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Zap className="h-4 w-4 fill-[#f5b623] text-[#f5b623]" />能耗 · 校园照明</h2>
        <button onClick={onClose} aria-label="关闭能耗面板" className="-mr-2 rounded-full p-1.5 text-dust hover:bg-white hover:text-ink"><X className="h-4 w-4" /></button>
      </header>

      <div className="scroll-quiet min-h-0 overflow-y-auto px-5 pb-5">
        {/* Live power */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-crater">当前照明功率</span>
            <span className="flex items-center gap-1.5 text-[11.5px] text-crater"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[#f5b623]" />实时模拟</span>
          </div>
          <p className="mt-1 text-ink" aria-live="polite">
            <span className="text-[38px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{n0.format(f.watts)}</span>
            <span className="ml-1 text-[15px] font-medium text-crater">W</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10" aria-hidden>
            <div className="h-full rounded-full bg-[#f5b623] transition-[width] duration-500" style={{ width: `${loadShare * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] text-crater">
            {f.roomsLit} / {f.rooms} 个房间亮灯，{f.lampsOn} / {f.lampsTotal} 盏灯开着
          </p>
          <p className="text-[12px] text-crater">
            其中已调查的 {CLASSROOM_IDS.length} 间教室 {n0.format(f.classroomWatts)} W（{f.classroomsLit} 间亮灯），其余房间为估算
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Tile label="每秒耗电" value={n2.format(f.whPerSecond)} unit="Wh" note={`即 ${n0.format(f.watts)} 焦耳`} />
          <Tile label="每小时耗电" value={n2.format(f.kwhPerHour)} unit="kWh" />
          <Tile label="每小时电费" value={yuan(f.costPerHour)} note={`电价 ¥${LIGHTING.pricePerKwh}/kWh`} />
          <Tile label="比全开每小时省" value={yuan(f.savedCostPerHour)} note={`${n2.format(f.savedKwhPerHour)} kWh`} tone="save" />
        </div>

        {/* Running meter since the panel opened */}
        <div className="mt-2 rounded-[14px] bg-ink px-4 py-3 text-white">
          <div className="flex items-baseline justify-between text-[11.5px] text-white/60">
            <span>打开面板以来</span><span className="tabular-nums">{clock(meter.seconds)}</span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-2 tabular-nums">
            <div><div className="text-[17px] font-semibold leading-tight">{n2.format(meter.wh)}<span className="ml-0.5 text-[10.5px] font-medium text-white/60">Wh</span></div><div className="text-[11px] text-white/55">已耗电</div></div>
            <div><div className="text-[17px] font-semibold leading-tight">{yuan(meter.wh / 1000 * LIGHTING.pricePerKwh, 4)}</div><div className="text-[11px] text-white/55">电费</div></div>
            <div><div className="text-[17px] font-semibold leading-tight text-[#8fe0c9]">{yuan(meter.savedWh / 1000 * LIGHTING.pricePerKwh, 4)}</div><div className="text-[11px] text-white/55">已节省</div></div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setAll(false)} disabled={f.lampsOn === 0} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-semibold text-white hover:bg-ink-soft disabled:opacity-40">
            <Power className="h-4 w-4" />一键关灯
          </button>
          <button type="button" onClick={() => setAll(true)} disabled={f.lampsOn === f.lampsTotal} className="flex h-11 items-center justify-center gap-1.5 rounded-full border hairline bg-white text-[14px] font-medium text-ink hover:border-ink/25 disabled:opacity-40">
            <Lightbulb className="h-4 w-4" />全部开灯
          </button>
        </div>

        {/* Rooms, by group */}
        {groups.map(({ title, rooms, estimated }) => {
          const groupOn = rooms.reduce((sum, room) => sum + lampsOf(room.id), 0);
          const groupTotal = rooms.reduce((sum, room) => sum + room.lamps, 0);
          return (
          <div key={title} className="mt-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold text-crater">
                {title}<span className="ml-1.5 font-normal text-dust">{rooms.length} 间 · {n0.format(groupOn * LIGHTING.lampWatts)} W{estimated ? ' · 估算' : ''}</span>
              </h3>
              <button
                type="button"
                onClick={() => setAll(groupOn === 0, rooms.map((room) => room.id))}
                className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium text-crater hover:bg-white hover:text-ink"
              >
                {groupOn === 0 ? '本组开灯' : '本组关灯'}
              </button>
            </div>
            <ul className="divide-y divide-ink/[0.06]">
              {rooms.map((room) => {
                const id = room.id;
                const on = lampsOf(id);
                const r = roomFigures(on, room.lamps);
                const space = byId.get(id);
                const name = space ? displayName(space) : id;
                const selected = selectedSpaceId === id;
                return (
                  <li key={id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectSpace(id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onSelectSpace(id); }}
                      className={`-mx-2 flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2 ${selected ? 'bg-white' : 'hover:bg-white/60'}`}
                    >
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${on ? 'bg-[#fff1c7] text-[#c98a00]' : 'bg-ink/[0.06] text-dust'}`}>
                        {on ? <Lightbulb className="h-4 w-4" /> : <LightbulbOff className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="wordmark text-[13px] font-semibold text-ink">{displayCode(id)}</span>
                          <span className="truncate text-[12.5px] text-crater">{name}</span>
                          {room.basis !== 'surveyed' && (
                            <span className="shrink-0 rounded-full bg-ink/[0.06] px-1.5 text-[10.5px] text-crater" title={room.basis === 'counted' ? '灯数为此前统计，功率暂按 40 W' : '灯数按面积估算'}>
                              {room.basis === 'counted' ? '已统计' : '估算'}
                            </span>
                          )}
                        </span>
                        <span className="block text-[11.5px] tabular-nums text-dust">
                          {on}/{r.lampsTotal} 盏 · {n0.format(r.watts)} W · {n2.format(r.kwhPerHour)} kWh/时 · {yuan(r.costPerHour, 3)}/时
                        </span>
                      </span>
                      <LightSwitch on={on > 0} label={`${displayCode(id)} ${on > 0 ? '关灯' : '开灯'}`} onChange={(v) => setLamps(id, v ? room.lamps : 0)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}

        <p className="mt-5 text-[11.5px] leading-relaxed text-dust">
          按额定功率模拟，不是电表读数：已调查教室每间 {LIGHTING.lampsPerRoom} 盏 LED 平板灯 × {LIGHTING.lampWatts} W（老师确认），电价 ¥{LIGHTING.pricePerKwh}/kWh；
          {CLASSROOM_IDS.length} 间教室来自平面图统计，各间灯具配置未逐间核实。
          其余房间的灯数按面积估算（参照教室约每 {n2.format(1 / LAMPS_PER_M2)} m² 一盏），功率同为 {LIGHTING.lampWatts} W；食堂按此前统计的 24 盏。
          开关状态只保存在这个浏览器里，不会控制真实灯具。
        </p>
      </div>
    </section>
  );
};
