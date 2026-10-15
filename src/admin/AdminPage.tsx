import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Building2, Cpu, Download, FileUp, Plus, RefreshCw, RotateCcw, Save, Search, Settings2, Trash2, Upload, Wifi } from 'lucide-react';
import { CAMPUS_SPACES } from '../data/floorplanData';
import { useToast } from '../components/ui/Toast';
import { displayCode, displayName } from '../components/ui/format';
import { type CampusConfig, type RoomOverride, type SensorBinding, useCampusConfig, writeLocalConfig } from '../config/campusConfig';
import { type DeviceInfo, type LiveRoomReading, fetchDevices, fetchRoomReadings, formatAge } from '../services/sensorApi';
import type { AccessStatus } from '../types/campus';

type Section = 'sensors' | 'rooms' | 'site' | 'publish';

const SECTIONS: Array<{ id: Section; label: string; hint: string; icon: typeof Cpu }> = [
  { id: 'sensors', label: '传感器接入', hint: '房间与传感器的对应关系', icon: Cpu },
  { id: 'rooms', label: '房间资料', hint: '名称、介绍、开放状态', icon: Building2 },
  { id: 'site', label: '站点设置', hint: '数据显示方式', icon: Settings2 },
  { id: 'publish', label: '发布配置', hint: '让所有访问者生效', icon: Upload },
];

const ACCESS_OPTIONS: Array<{ value: AccessStatus; label: string }> = [
  { value: 'open', label: '开放' }, { value: 'restricted', label: '需预约' }, { value: 'closed', label: '暂不开放' }, { value: 'unknown', label: '待确认' },
];

const input = 'w-full rounded-[10px] border hairline bg-white px-3 py-2 text-[14px] text-ink outline-none transition-shadow placeholder:text-dust focus:ring-2 focus:ring-flare/40';
const label = 'text-[13px] font-medium text-ink';
const card = 'rounded-[var(--radius-sheet)] border border-white/80 bg-white/70 p-6 shadow-[0_18px_48px_-24px_rgb(24_32_46/0.25)]';

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label: text }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={text} onClick={() => onChange(!checked)} className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-flare' : 'bg-haze'}`}>
    <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
);

const StatusPill: React.FC<{ reading?: LiveRoomReading; testing?: boolean }> = ({ reading, testing }) => {
  if (testing) return <span className="rounded-full bg-regolith px-2.5 py-0.5 text-[12px] text-crater">测试中…</span>;
  if (!reading) return <span className="rounded-full bg-regolith px-2.5 py-0.5 text-[12px] text-crater">未测试</span>;
  const map = {
    live: ['bg-calm/10 text-calm', `在线，${formatAge(reading.ageMinutes)}`],
    stale: ['bg-flare-wash text-ember', `未更新，最后 ${formatAge(reading.ageMinutes)}`],
    empty: ['bg-regolith text-crater', '没有数据'],
    error: ['bg-alert/10 text-alert', reading.error ?? '连接失败'],
    loading: ['bg-regolith text-crater', '读取中'],
  } as const;
  const [tone, text] = map[reading.status];
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${tone}`}>{text}</span>;
};

export const AdminPage: React.FC = () => {
  const toast = useToast();
  const { config, published, hasLocalChanges, ready } = useCampusConfig();
  const [draft, setDraft] = useState<CampusConfig>(config);
  const [section, setSection] = useState<Section>('sensors');
  const [devWritable, setDevWritable] = useState(false);

  useEffect(() => { setDraft(config); }, [config]);
  useEffect(() => {
    document.title = '管理 · Moonshot Academy Campus';
    if (import.meta.env.DEV) fetch('/api/campus-config').then((r) => setDevWritable(r.ok)).catch(() => setDevWritable(false));
  }, []);

  const dirty = useMemo(() => JSON.stringify({ ...draft, updatedAt: undefined }) !== JSON.stringify({ ...config, updatedAt: undefined }), [draft, config]);
  const update = (patch: Partial<CampusConfig>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    writeLocalConfig(draft);
    toast('已保存到本机，打开的地图页会立即使用新配置');
  };

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-[radial-gradient(ellipse_80%_70%_at_60%_30%,#f3f5f8_0%,#e3e7eb_60%,#d4dae1_100%)] text-ink">
      <aside className="flex w-64 shrink-0 flex-col gap-6 border-r hairline bg-white/40 p-5 max-md:hidden">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/brand/mac-logo-256.png" alt="" className="h-9 w-9" />
          <span>
            <span className="wordmark block text-[12px] font-semibold leading-tight">Moonshot Academy Campus</span>
            <span className="text-[12px] text-crater">管理</span>
          </span>
        </a>
        <nav className="flex flex-col gap-1" aria-label="管理分区">
          {SECTIONS.map(({ id, label: text, hint, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              aria-current={section === id ? 'page' : undefined}
              className={`flex items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors ${section === id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white/80'}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="block text-[14px] font-medium">{text}</span>
                <span className={`block text-[12px] ${section === id ? 'text-white/70' : 'text-crater'}`}>{hint}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-3 text-[12px] leading-relaxed text-crater">
          <p className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${hasLocalChanges ? 'bg-flare' : 'bg-calm'}`} />
            {hasLocalChanges ? '本机有尚未发布的修改' : '与已发布配置一致'}
          </p>
          <a href="/" className="flex items-center gap-1.5 font-medium text-ink-soft hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />返回地图</a>
        </div>
      </aside>

      <main className="scroll-quiet relative flex-1 overflow-y-auto">
        {/* Phone: section tabs */}
        <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b hairline bg-lunar/90 p-2 backdrop-blur md:hidden">
          <a href="/" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft" aria-label="返回地图"><ArrowLeft className="h-4 w-4" /></a>
          {SECTIONS.map(({ id, label: text }) => (
            <button key={id} onClick={() => setSection(id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium ${section === id ? 'bg-ink text-white' : 'text-ink-soft'}`}>{text}</button>
          ))}
        </div>

        <div className="mx-auto max-w-[920px] px-5 pb-32 pt-8 md:px-10 md:pt-12">
          {!ready ? (
            <p className="text-crater">正在读取配置…</p>
          ) : section === 'sensors' ? (
            <SensorsSection draft={draft} update={update} />
          ) : section === 'rooms' ? (
            <RoomsSection draft={draft} update={update} />
          ) : section === 'site' ? (
            <SiteSection draft={draft} update={update} />
          ) : (
            <PublishSection draft={draft} published={published} hasLocalChanges={hasLocalChanges} devWritable={devWritable} dirty={dirty} onImport={(cfg) => { setDraft(cfg); toast('已导入，检查无误后点“保存”'); }} />
          )}
        </div>

        {/* Save bar: only while there are unsaved edits. */}
        {dirty && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4 md:pl-64">
            <div className="animate-rise pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-[14px] text-white shadow-[0_18px_40px_-14px_rgb(24_32_46/0.7)]">
              有未保存的修改
              <button onClick={() => setDraft(config)} className="flex h-9 items-center gap-1.5 rounded-full px-3 text-white/80 hover:text-white"><RotateCcw className="h-4 w-4" />撤销</button>
              <button onClick={save} className="flex h-9 items-center gap-1.5 rounded-full bg-flare px-4 font-semibold hover:bg-ember active:scale-95"><Save className="h-4 w-4" />保存</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

/* ---------------------------------------------------------------- sensors */

const SensorsSection: React.FC<{ draft: CampusConfig; update: (p: Partial<CampusConfig>) => void }> = ({ draft, update }) => {
  const [results, setResults] = useState<Record<string, LiveRoomReading>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const api = draft.sensorApi;

  const setBinding = (id: string, patch: Partial<SensorBinding>) =>
    update({ sensors: draft.sensors.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  const addBinding = (locationId = '') =>
    update({ sensors: [...draft.sensors, { id: `binding-${Date.now()}`, roomId: '', locationId, enabled: true }] });
  const removeBinding = (id: string) => update({ sensors: draft.sensors.filter((b) => b.id !== id) });

  const test = async (binding: SensorBinding) => {
    setTesting((t) => ({ ...t, [binding.id]: true }));
    const result = await fetchRoomReadings(draft, binding);
    setResults((r) => ({ ...r, [binding.id]: result }));
    setTesting((t) => ({ ...t, [binding.id]: false }));
  };
  const loadDevices = async () => {
    setDeviceError(null);
    try { setDevices(await fetchDevices(api.baseUrl)); } catch (e) { setDeviceError((e as Error).message || '无法读取设备列表'); setDevices([]); }
  };

  useEffect(() => { loadDevices(); draft.sensors.forEach((b) => b.locationId && test(b)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [api.baseUrl]);

  const boundLocations = new Set(draft.sensors.map((b) => b.locationId));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">传感器接入</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-crater">把房间和环境传感器的位置编号对应起来。绑定后，地图上这个房间的温度、湿度和 CO₂ 会改用真实读数。</p>
      </header>

      <section className={card}>
        <h2 className="text-[17px] font-semibold">数据接口</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className={label}>接口地址</span>
            <input className={`${input} mt-1.5`} value={api.baseUrl} onChange={(e) => update({ sensorApi: { ...api, baseUrl: e.target.value } })} placeholder="https://map.georgehan0514.top" />
            <span className="mt-1 block text-[12px] text-crater">读取 {api.baseUrl.replace(/\/+$/, '')}/api/readings?location=位置编号&hours={api.historyHours}</span>
          </label>
          {([
            ['refreshSeconds', '刷新间隔', '秒', 15],
            ['staleMinutes', '超过多久算“未更新”', '分钟', 1],
            ['historyHours', '趋势时长', '小时', 1],
          ] as const).map(([key, text, unit, min]) => (
            <label key={key}>
              <span className={label}>{text}</span>
              <div className="relative mt-1.5">
                <input type="number" min={min} className={`${input} pr-14`} value={api[key]} onChange={(e) => update({ sensorApi: { ...api, [key]: Math.max(min, Number(e.target.value) || min) } })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-dust">{unit}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[17px] font-semibold">房间绑定</h2>
          <button onClick={() => addBinding()} className="flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-white hover:bg-ink-soft active:scale-95"><Plus className="h-4 w-4" />添加绑定</button>
        </div>
        <datalist id="room-options">
          {CAMPUS_SPACES.map((s) => <option key={s.id} value={s.id}>{displayName(s)}</option>)}
        </datalist>
        <datalist id="location-options">
          {(devices ?? []).map((d) => <option key={d.device_id} value={d.location_id}>{d.device_id}</option>)}
        </datalist>

        {draft.sensors.length === 0 ? (
          <p className="mt-6 text-[14px] text-crater">还没有绑定任何传感器。从下方设备列表里选一个，或者点“添加绑定”手动填写。</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10">
            {draft.sensors.map((b) => {
              const room = CAMPUS_SPACES.find((s) => s.id === b.roomId);
              const result = results[b.id];
              return (
                <li key={b.id} className="py-5">
                  <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <label>
                      <span className={label}>房间</span>
                      <input list="room-options" className={`${input} mt-1.5`} value={b.roomId} onChange={(e) => setBinding(b.id, { roomId: e.target.value.trim().toUpperCase() })} placeholder="例如 M104" />
                      <span className={`mt-1 block text-[12px] ${b.roomId && !room ? 'text-alert' : 'text-crater'}`}>{b.roomId ? (room ? displayName(room) : '图纸上没有这个房间') : ' '}</span>
                    </label>
                    <label>
                      <span className={label}>传感器位置编号</span>
                      <input list="location-options" className={`${input} mt-1.5`} value={b.locationId} onChange={(e) => setBinding(b.id, { locationId: e.target.value.trim() })} placeholder="例如 M1" />
                      <span className="mt-1 block text-[12px] text-crater">{b.note || ' '}</span>
                    </label>
                    <div className="flex items-center gap-2 pb-6">
                      <Switch checked={b.enabled} onChange={(v) => setBinding(b.id, { enabled: v })} label="启用" />
                      <button onClick={() => test(b)} disabled={!b.locationId} className="flex h-9 items-center gap-1.5 rounded-full border hairline bg-white px-3 text-[13px] font-medium text-ink-soft hover:text-ink disabled:opacity-40"><Wifi className="h-4 w-4" />测试</button>
                      <button onClick={() => removeBinding(b.id)} aria-label="删除绑定" className="grid h-9 w-9 place-items-center rounded-full text-dust hover:bg-alert/10 hover:text-alert"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
                    <StatusPill reading={result} testing={testing[b.id]} />
                    {result?.latest && (
                      <>
                        <span>温度 <strong className="font-semibold text-ink">{result.latest.temperature ?? '—'}°C</strong></span>
                        <span>湿度 <strong className="font-semibold text-ink">{result.latest.humidity ?? '—'}%</strong></span>
                        <span>CO₂ <strong className="font-semibold text-ink">{result.latest.co2 ?? '—'} ppm</strong></span>
                        <span className="text-crater">{result.series.length} 条读数，设备 {result.deviceId}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold">接口上的设备</h2>
            <p className="mt-1 text-[13px] text-crater">来自 /api/devices。握手超过 5 分钟没有更新会显示为离线。</p>
          </div>
          <button onClick={loadDevices} className="flex h-9 items-center gap-1.5 rounded-full border hairline bg-white px-3 text-[13px] font-medium text-ink-soft hover:text-ink active:scale-95"><RefreshCw className="h-4 w-4" />刷新</button>
        </div>
        {deviceError && <p className="mt-4 text-[13px] text-alert">读不到设备列表：{deviceError}</p>}
        {devices === null ? (
          <p className="mt-4 text-[13px] text-crater">读取中…</p>
        ) : devices.length === 0 && !deviceError ? (
          <p className="mt-4 text-[13px] text-crater">接口上还没有设备。</p>
        ) : (
          <ul className="mt-4 divide-y divide-ink/10">
            {devices.map((d) => {
              const online = d.handshake_status !== 'expired';
              const lastUpload = d.last_upload_at ? (Date.now() - Date.parse(d.last_upload_at)) / 60000 : undefined;
              return (
                <li key={d.device_id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                  <span className="flex min-w-[180px] items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${online ? 'live-dot bg-calm' : 'bg-dust'}`} />
                    <span className="text-[14px] font-medium">{d.device_id}</span>
                  </span>
                  <span className="text-[13px] text-ink-soft">位置 <strong className="font-semibold text-ink">{d.location_id}</strong></span>
                  <span className="text-[13px] text-crater">{online ? '在线' : '离线'}，最后上传 {formatAge(lastUpload) || '未知'}</span>
                  <span className="text-[13px] text-crater">{d.record_count ?? 0} 条记录</span>
                  <span className="ml-auto">
                    {boundLocations.has(d.location_id) ? (
                      <span className="text-[13px] text-calm">已绑定</span>
                    ) : (
                      <button onClick={() => addBinding(d.location_id)} className="rounded-full bg-flare px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-ember active:scale-95">绑定到房间</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ rooms */

const RoomsSection: React.FC<{ draft: CampusConfig; update: (p: Partial<CampusConfig>) => void }> = ({ draft, update }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('M104');
  const rooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CAMPUS_SPACES.filter((s) => !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [query]);
  const base = CAMPUS_SPACES.find((s) => s.id === selected);
  const override = draft.rooms[selected] ?? {};

  const setOverride = (patch: Partial<RoomOverride>) => {
    const next: RoomOverride = { ...override, ...patch };
    (Object.keys(next) as Array<keyof RoomOverride>).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete next[k];
    });
    const rooms = { ...draft.rooms };
    if (Object.keys(next).length) rooms[selected] = next; else delete rooms[selected];
    update({ rooms });
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">房间资料</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-crater">修改地图和房间详情里显示的文字。留空的项目沿用默认内容。</p>
      </header>
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <section className={`${card} !p-3`}>
          <label className="flex h-10 items-center gap-2 rounded-[10px] border hairline bg-white px-3">
            <Search className="h-4 w-4 text-dust" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索房间" aria-label="搜索房间" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          </label>
          <ul className="scroll-quiet mt-2 max-h-[60vh] overflow-y-auto">
            {rooms.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSelected(s.id)} className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors ${selected === s.id ? 'bg-ink text-white' : 'hover:bg-white'}`}>
                  <span className={`wordmark w-14 shrink-0 text-[11px] ${selected === s.id ? 'text-white/70' : 'text-crater'}`}>{displayCode(s.id)}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{draft.rooms[s.id]?.name ?? displayName(s)}</span>
                  {draft.rooms[s.id] && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-flare" title="已修改" />}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {base && (
          <section className={card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="wordmark text-[32px] font-semibold leading-none">{displayCode(base.id)}</div>
                <p className="mt-2 text-[14px] text-crater">{displayName(base)}</p>
              </div>
              {draft.rooms[selected] && (
                <button onClick={() => { const rooms = { ...draft.rooms }; delete rooms[selected]; update({ rooms }); }} className="flex h-9 items-center gap-1.5 rounded-full border hairline bg-white px-3 text-[13px] text-ink-soft hover:text-ink"><RotateCcw className="h-4 w-4" />恢复默认</button>
              )}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label><span className={label}>名称</span><input className={`${input} mt-1.5`} value={override.name ?? ''} placeholder={base.name} onChange={(e) => setOverride({ name: e.target.value })} /></label>
              <label><span className={label}>英文名</span><input className={`${input} mt-1.5`} value={override.englishName ?? ''} placeholder={base.englishName ?? '可不填'} onChange={(e) => setOverride({ englishName: e.target.value })} /></label>
              <label className="md:col-span-2"><span className={label}>介绍</span><textarea rows={3} className={`${input} mt-1.5 resize-none leading-relaxed`} value={override.description ?? ''} placeholder={base.description} onChange={(e) => setOverride({ description: e.target.value })} /></label>
              <label>
                <span className={label}>准入</span>
                <select className={`${input} mt-1.5`} value={override.access ?? ''} onChange={(e) => setOverride({ access: (e.target.value || undefined) as AccessStatus | undefined })}>
                  <option value="">默认（{ACCESS_OPTIONS.find((o) => o.value === base.access)?.label}）</option>
                  {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label><span className={label}>可容纳人数</span><input type="number" min={0} className={`${input} mt-1.5`} value={override.capacity ?? ''} placeholder={base.capacity ? String(base.capacity) : '可不填'} onChange={(e) => setOverride({ capacity: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} /></label>
              <label className="md:col-span-2">
                <span className={label}>设施 <span className="font-normal text-dust">用逗号分隔</span></span>
                <input className={`${input} mt-1.5`} value={override.features?.join('，') ?? ''} placeholder={base.features.join('，') || '例如：投影仪，白板'} onChange={(e) => setOverride({ features: e.target.value.split(/[,，、]/).map((f) => f.trim()).filter(Boolean) })} />
              </label>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------- site */

const SiteSection: React.FC<{ draft: CampusConfig; update: (p: Partial<CampusConfig>) => void }> = ({ draft, update }) => (
  <div className="space-y-8">
    <header>
      <h1 className="text-[28px] font-semibold tracking-tight">站点设置</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-crater">决定没有接入真实传感器的房间怎样显示。</p>
    </header>
    <section className={card}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-[17px] font-semibold">显示演示环境数据</h2>
          <p className="mt-1 max-w-[56ch] text-[14px] leading-relaxed text-crater">开启时，没有传感器的房间显示内置的演示数值，并标注“演示数据”。关闭后，这些房间显示“未接入传感器”，环境图层里也不再着色，只有真实传感器的房间有颜色。</p>
        </div>
        <Switch checked={draft.display.showDemoEnvironment} onChange={(v) => update({ display: { ...draft.display, showDemoEnvironment: v } })} label="显示演示环境数据" />
      </div>
    </section>
  </div>
);

/* ---------------------------------------------------------------- publish */

const PublishSection: React.FC<{
  draft: CampusConfig; published: CampusConfig; hasLocalChanges: boolean; devWritable: boolean; dirty: boolean; onImport: (c: CampusConfig) => void;
}> = ({ draft, published, hasLocalChanges, devWritable, dirty, onImport }) => {
  const toast = useToast();
  const json = JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }, null, 2);

  const download = () => {
    const url = URL.createObjectURL(new Blob([json + '\n'], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'campus-config.json' });
    a.click();
    URL.revokeObjectURL(url);
    toast('已下载 campus-config.json');
  };
  const writeToProject = async () => {
    const response = await fetch('/api/campus-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json });
    const body = await response.json().catch(() => ({}));
    if (response.ok) toast('已写入 public/campus-config.json，提交并推送后对所有人生效');
    else toast(body.error ?? '写入失败', 'error');
  };
  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 1 || !Array.isArray(parsed.sensors)) throw new Error();
      onImport({ ...draft, ...parsed });
    } catch {
      toast('这个文件不是有效的配置文件', 'error');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-semibold tracking-tight">发布配置</h1>
        <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-crater">
          网站是静态部署的，没有服务器保存设置。在这里保存的修改只对这台设备的浏览器生效。要让所有访问者看到，需要把配置文件放进项目的 public/campus-config.json，提交并推送到 main，Cloudflare Pages 会自动重新部署。
        </p>
      </header>

      <section className={card}>
        <dl className="grid gap-4 text-[14px] md:grid-cols-3">
          <div><dt className="text-crater">已发布的传感器绑定</dt><dd className="mt-1 text-[22px] font-semibold">{published.sensors.length}</dd></div>
          <div><dt className="text-crater">本机配置</dt><dd className="mt-1 text-[15px] font-medium">{hasLocalChanges ? '有本机修改' : '与已发布一致'}</dd></div>
          <div><dt className="text-crater">房间资料修改</dt><dd className="mt-1 text-[22px] font-semibold">{Object.keys(draft.rooms).length}</dd></div>
        </dl>
        {dirty && <p className="mt-4 rounded-[10px] bg-flare-wash px-3 py-2 text-[13px] text-ember">还有没保存的修改。导出的文件会包含它们。</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={download} className="flex h-10 items-center gap-2 rounded-full bg-flare px-5 text-[14px] font-semibold text-white hover:bg-ember active:scale-95"><Download className="h-4 w-4" />下载配置文件</button>
          {devWritable && (
            <button onClick={writeToProject} className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-white hover:bg-ink-soft active:scale-95"><Save className="h-4 w-4" />写入项目文件</button>
          )}
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border hairline bg-white px-5 text-[14px] font-medium text-ink-soft hover:text-ink">
            <FileUp className="h-4 w-4" />导入配置文件
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
          {hasLocalChanges && (
            <button onClick={() => { writeLocalConfig(null); toast('已清除本机修改，恢复为已发布配置'); }} className="flex h-10 items-center gap-2 rounded-full px-4 text-[14px] text-crater hover:text-alert"><RotateCcw className="h-4 w-4" />清除本机修改</button>
          )}
        </div>
        {!devWritable && <p className="mt-3 text-[12px] text-dust">“写入项目文件”只在本机运行 npm run dev 时出现。</p>}
      </section>

      <section className={card}>
        <h2 className="text-[17px] font-semibold">配置预览</h2>
        <pre className="scroll-quiet mt-4 max-h-[420px] overflow-auto rounded-[12px] bg-ink p-4 text-[12px] leading-relaxed text-white/85">{json}</pre>
      </section>
    </div>
  );
};
