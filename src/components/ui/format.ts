import type { CampusSpace } from '../../types/campus';

/** Room name without a leading copy of its own ID ("S404 绝对安静自习室" → "绝对安静自习室"). */
export function displayName(space: Pick<CampusSpace, 'id' | 'name'>): string {
  const stripped = space.name.replace(new RegExp(`^${space.id}\\s*`), '').trim();
  return stripped || space.name;
}

const ROOM_CODE = /^[MSA]\d{3}(?:-\d)?$/;

/** True for spaces that carry a printed FF-01 room code (M104, S404, A100-1…). */
export const hasRoomCode = (id: string) => ROOM_CODE.test(id);

/** Room code for display; empty for spaces known only by name (卫生间, 小剧场…). */
export function displayCode(id: string): string {
  return hasRoomCode(id) ? id : '';
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' });
