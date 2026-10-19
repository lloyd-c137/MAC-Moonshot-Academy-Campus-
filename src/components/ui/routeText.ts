import type { RouteStep, TurnKind } from '../../services/pathfinding';
import type { CampusSpace } from '../../types/campus';
import { displayCode, displayName } from './format';

/** Space between Chinese text and a name that starts or ends with a room code (到达 M123 教室). */
export const spaced = (name: string) => `${/^[A-Za-z0-9]/.test(name) ? ' ' : ''}${name}${/[A-Za-z0-9]$/.test(name) ? ' ' : ''}`;
const trimJoin = (s: string) => s.replace(/\s+/g, ' ').replace(/ ([，。、])/g, '$1').trim();

export const metres = (m: number) => {
  if (m < 1) return '1 米';
  if (m < 10) return `${Math.round(m)} 米`;
  return `${Math.round(m / 5) * 5} 米`;
};
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 1.2 / 60));

const TURN_VERB: Record<TurnKind, string> = {
  straight: '直行',
  'slight-left': '向左前方走',
  'slight-right': '向右前方走',
  left: '左转',
  right: '右转',
  'sharp-left': '向左后方转',
  'sharp-right': '向右后方转',
  uturn: '掉头',
};

export interface StepText {
  /** The maneuver itself: "在 S201 成长咨询中心 处左转". */
  primary: string;
  /** What follows: "沿环廊走 45 米". */
  secondary?: string;
}

export interface RouteNames {
  from: string;
  to: string;
  nameOf: (id: string) => string;
}

function followText(step: RouteStep): string | undefined {
  if (!step.legM) return undefined;
  const d = metres(step.legM);
  if (step.area === 'ring') return `沿环廊走 ${d}`;
  if (step.area === 'court') return `绕球场走 ${d}`;
  return `直行 ${d}`;
}

/** Text for one step of the list. */
export function stepText(step: RouteStep, names: RouteNames): StepText {
  if (step.kind === 'depart') {
    const follow = step.area === 'ring' ? '沿环廊' : '';
    return {
      primary: trimJoin(`从${spaced(names.from)}出发`),
      secondary: trimJoin(`${follow}向${step.heading ?? '前'}走 ${metres(step.legM)}`),
    };
  }
  if (step.kind === 'arrive') return { primary: trimJoin(`到达${spaced(names.to)}`) };
  const verb = TURN_VERB[step.turn ?? 'straight'];
  let primary: string;
  if (step.enteringDestination) primary = `${verb}进入${spaced(names.to)}`;
  else if (step.leavingStart) primary = `出门后${verb}`;
  else if (step.landmarkId) primary = `在${spaced(names.nameOf(step.landmarkId))}处${verb}`;
  else primary = verb;
  return { primary: trimJoin(primary), secondary: step.enteringDestination ? undefined : followText(step) };
}

/** Short form for the "then …" preview: "然后右转". */
export function thenText(step: RouteStep, names: RouteNames): string {
  if (step.kind === 'arrive') return `然后到达${spaced(names.to)}`.trim();
  if (step.enteringDestination) return `然后${TURN_VERB[step.turn ?? 'straight']}进入${spaced(names.to)}`.trim();
  return `然后${TURN_VERB[step.turn ?? 'straight']}`;
}

/** "M104 一小步空间" / "西入口门厅": code and name, as spoken in directions. */
export function routeNames(byId: Map<string, CampusSpace>, fromId: string | null, toId: string | null): RouteNames {
  const nameOf = (id: string) => {
    const space = byId.get(id);
    const code = displayCode(id);
    const name = space ? displayName(space) : id;
    return code && name !== code ? `${code} ${name}` : name;
  };
  return { from: fromId ? nameOf(fromId) : '', to: toId ? nameOf(toId) : '', nameOf };
}
