import type { CampusSpace } from '../../types/campus';

/** Room name without a leading copy of its own ID ("S404 绝对安静自习室" → "绝对安静自习室"). */
export function displayName(space: Pick<CampusSpace, 'id' | 'name'>): string {
  const stripped = space.name.replace(new RegExp(`^${space.id}\\s*`), '').trim();
  return stripped || space.name;
}

/** Short room code for display ("ARENA-01" → "ARENA"). */
export function displayCode(id: string): string {
  return id.replace(/-01$/, '');
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' });
