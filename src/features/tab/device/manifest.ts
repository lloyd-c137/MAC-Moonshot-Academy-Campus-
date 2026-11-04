import type { DailySchedule, DisplayViewModel } from '../display/model';
import type { DisplayProfile } from '../display/profiles';

export interface DeviceFrame {
  effective_from: string;
  effective_until: string;
  frame_revision: string;
  path: string;
  byte_length: number;
  sha256: string;
}

export interface DeviceManifest {
  schema_version: 1;
  room_id: string;
  date: string;
  timezone: 'Asia/Shanghai';
  source: DailySchedule['source'];
  data_state: DailySchedule['dataState'];
  schedule_revision: string;
  display_profile: { id: string; width: number; height: number; format: 'mono1'; bit_order: 'msb_first'; stride_bytes: number; one_bit: 'black'; orientation: string };
  frames: DeviceFrame[];
  next_sync_after_seconds: number;
}

const sha256Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isoAt = (date: string, time: string) => time === '24:00'
  ? `${new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)}T00:00:00+09:00` // replaced below for local day rollover
  : `${date}T${time}:00+08:00`;

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function effectiveTime(date: string, time: string): string { return time === '24:00' ? `${nextDate(date)}T00:00:00+08:00` : isoAt(date, time); }

export async function buildDeviceManifest(
  schedule: DailySchedule,
  profile: DisplayProfile,
  frameAssets: Array<{ time: string; frameRevision: string; path: string; byteLength: number; sha256: string }>,
  nextSyncAfterSeconds = 900,
): Promise<DeviceManifest> {
  if (!frameAssets.length || frameAssets[0].time !== '00:00') throw new Error('Frame timeline must begin at local midnight.');
  const frames: DeviceFrame[] = frameAssets.map((frame, index) => ({
    effective_from: effectiveTime(schedule.date, frame.time),
    effective_until: effectiveTime(schedule.date, frameAssets[index + 1]?.time ?? '24:00'),
    frame_revision: frame.frameRevision,
    path: frame.path,
    byte_length: frame.byteLength,
    sha256: frame.sha256,
  }));
  const manifest: DeviceManifest = {
    schema_version: 1,
    room_id: schedule.roomId,
    date: schedule.date,
    timezone: schedule.timezone,
    source: schedule.source,
    data_state: schedule.dataState,
    schedule_revision: schedule.scheduleRevision,
    display_profile: { id: profile.id, width: profile.width, height: profile.height, format: profile.format, bit_order: profile.bitOrder, stride_bytes: profile.strideBytes, one_bit: profile.oneBit, orientation: profile.orientation },
    frames,
    next_sync_after_seconds: nextSyncAfterSeconds,
  };
  validateDeviceManifest(manifest);
  return manifest;
}

export function validateDeviceManifest(manifest: DeviceManifest): void {
  const { width, height, stride_bytes: stride } = manifest.display_profile;
  if (manifest.schema_version !== 1 || manifest.timezone !== 'Asia/Shanghai') throw new Error('Unsupported device manifest schema or timezone.');
  if (stride !== Math.ceil(width / 8)) throw new Error('Display profile stride does not match mono1 dimensions.');
  if (!manifest.frames.length) throw new Error('Manifest must contain at least one frame.');
  for (let i = 0; i < manifest.frames.length; i += 1) {
    const frame = manifest.frames[i];
    if (frame.byte_length !== stride * height || !/^[a-f0-9]{64}$/.test(frame.sha256) || !/^sha256:[a-f0-9]{64}$/.test(frame.frame_revision)) throw new Error(`Invalid frame payload metadata: ${frame.frame_revision}`);
    if (!frame.path.startsWith('/api/tab/device/v1/frames/')) throw new Error(`Frame path is outside the protected device API namespace: ${frame.path}`);
    if (i > 0 && manifest.frames[i - 1].effective_until !== frame.effective_from) throw new Error('Frame timeline has a gap or overlap.');
    if (Date.parse(frame.effective_until) <= Date.parse(frame.effective_from)) throw new Error('Frame timeline contains an empty or reversed interval.');
  }
  if (!manifest.frames[0].effective_from.startsWith(`${manifest.date}T00:00:00`)) throw new Error('Frame timeline does not cover the start of the local date.');
  if (manifest.frames[manifest.frames.length - 1].effective_until !== `${nextDate(manifest.date)}T00:00:00+08:00`) throw new Error('Frame timeline does not cover the complete local date.');
}

export async function frameRevision(view: DisplayViewModel, profile: DisplayProfile, rendererVersion: string, effectiveFrom: string): Promise<string> {
  const payload = JSON.stringify({ scheduleRevision: view.scheduleRevision, profile, rendererVersion, state: view.state, emphasis: view.rows.map((row) => [row.id, row.emphasis]), dataState: view.dataState, effectiveFrom });
  return `sha256:${await sha256Hex(payload)}`;
}

export { sha256Hex };
