import { CampusMoment } from '../types/campus';

export const INITIAL_CAMPUS_MOMENTS: CampusMoment[] = [
  {
    id: 'MOMENT-01',
    spaceId: 'M104',
    spaceName: 'M104 一小步空间',
    author: 'Leo (2025届)',
    timeAgo: '2天前',
    date: '2026-10-11',
    content: '在白板上画了一下午的火星探测车悬挂结构草图。即使第一版原型散架了三次，也是迈向未知的一小步！',
    category: 'student_project',
    likes: 24,
  },
  {
    id: 'MOMENT-02',
    spaceId: 'ARENA-01',
    spaceName: '莲花球场 (中央比赛场地)',
    author: 'Elena (2026届)',
    timeAgo: '4天前',
    date: '2026-10-09',
    content: '晚上在莲花球场看台最高处看大家打球，球鞋在地板上摩擦的声音和回音，是高中最踏实的安全感。',
    category: 'memory',
    likes: 42,
  },
  {
    id: 'MOMENT-03',
    spaceId: 'S404',
    spaceName: 'S404 绝对安静自习室',
    author: 'Kimi (2025届)',
    timeAgo: '1周前',
    date: '2026-10-06',
    content: '自习室的安静有一种魔力，窗外偶尔有微风吹过，不知不觉一口气刷完了两套 AP 统计试题。',
    category: 'daily_snap',
    likes: 19,
  },
  {
    id: 'MOMENT-04',
    spaceId: 'M103',
    spaceName: 'M103 创客空间',
    author: 'Sam (2027届)',
    timeAgo: '2周前',
    date: '2026-09-28',
    content: '用激光切割机把废旧椴木板做成了探月校园地标的迷你拼装模型，陈列在工坊进门处，欢迎来摸！',
    category: 'event_highlight',
    likes: 35,
  },
  {
    id: 'MOMENT-05',
    spaceId: 'COURTYARD-02',
    spaceName: '花园（中庭）- 南苑',
    author: 'Yuki (2026届)',
    timeAgo: '3周前',
    date: '2026-09-21',
    content: '下午三点四十分的阳光正好斜斜照进南苑中庭长椅，坐在那里读了一章《看不见的城市》，治愈了一整天的焦虑。',
    category: 'memory',
    likes: 31,
  },
];

const LOCAL_STORAGE_KEY = 'mac_campus_moments_v1';

export function getStoredMoments(): CampusMoment[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return INITIAL_CAMPUS_MOMENTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_CAMPUS_MOMENTS;
  } catch (e) {
    return INITIAL_CAMPUS_MOMENTS;
  }
}

export function saveMoment(moment: Omit<CampusMoment, 'id' | 'likes' | 'timeAgo'>): CampusMoment {
  const current = getStoredMoments();
  const newMoment: CampusMoment = {
    ...moment,
    id: `MOMENT-USER-${Date.now()}`,
    likes: 1,
    timeAgo: '刚刚',
  };
  const updated = [newMoment, ...current];
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save moment to local storage:', e);
  }
  return newMoment;
}

const LIKED_KEY = 'mac_campus_liked_v1';

/** Moment IDs this browser has liked. */
export function getLikedMomentIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Like or unlike a moment; returns the new count and whether it is now liked. */
export function toggleLikeMoment(momentId: string): { likes: number; liked: boolean } {
  const liked = getLikedMomentIds();
  const nowLiked = !liked.has(momentId);
  if (nowLiked) liked.add(momentId);
  else liked.delete(momentId);
  const current = getStoredMoments();
  let likes = 0;
  const updated = current.map((m) => {
    if (m.id !== momentId) return m;
    likes = Math.max(0, m.likes + (nowLiked ? 1 : -1));
    return { ...m, likes };
  });
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    localStorage.setItem(LIKED_KEY, JSON.stringify([...liked]));
  } catch (e) {
    console.error(e);
  }
  return { likes, liked: nowLiked };
}
