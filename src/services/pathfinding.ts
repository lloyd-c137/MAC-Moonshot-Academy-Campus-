/**
 * Indoor route finding on the FF-01 walking grid (scripts/build_nav_grid.py).
 *
 * A* over an 8-connected grid of 0.2 m cells. Each step costs its length times the
 * cell cost (1 in open corridor, rising towards walls), and crossing a room other than
 * the start or destination costs extra, so routes keep to corridors and stay centred.
 * The grid path is then straightened (string pulling) where a straight line stays as
 * far from walls as the grid path did.
 *
 * Routes are estimates from the drawing: doors are not verified as open or passable.
 */
export interface RawNavGrid {
  status: string;
  cellM: number;
  origin: [number, number];
  width: number;
  height: number;
  cost: string;
  roomIndex: string;
  roomOrder: string[];
  rooms: Record<string, [number, number]>;
  portals: { roomId: string; centre: [number, number]; crossingM: number }[];
}

export interface NavGrid {
  cellM: number;
  x0: number;
  z0: number;
  w: number;
  h: number;
  /** 0 = blocked, 1 = open corridor … higher = closer to walls / inferred door. */
  cost: Uint8Array;
  /** 1-based index into roomOrder; 0 = corridor or open space. */
  roomIndex: Uint8Array;
  roomOrder: string[];
  anchors: Map<string, number>;
  /** Cell indices of inferred door openings, keyed by room. */
  portals: { roomId: string; x: number; z: number }[];
}

export interface WalkRoute {
  fromId: string;
  toId: string;
  /** World x / z in metres, start to end. */
  points: [number, number][];
  lengthM: number;
  minutes: number;
  /** Rooms (other than start and end) the route passes through. */
  throughRooms: string[];
  /** Rooms whose door opening was inferred, if the route uses one. */
  inferredDoors: string[];
}

const WALK_SPEED_MPS = 1.2;
const ROOM_PENALTY = 4;
const COURT_PENALTY = 2.5;

function decodeRle(b64: string, size: number): Uint8Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    out.fill(bytes[i], o, o + bytes[i + 1]);
    o += bytes[i + 1];
  }
  if (o !== size) throw new Error(`Walking grid size mismatch: ${o} != ${size}`);
  return out;
}

/** Decodes the walking grid emitted by scripts/build_nav_grid.py. */
export function parseNavGrid(raw: RawNavGrid): NavGrid {
  const size = raw.width * raw.height;
  const anchors = new Map<string, number>();
  for (const [id, [x, z]] of Object.entries(raw.rooms)) anchors.set(id, z * raw.width + x);
  return {
    cellM: raw.cellM,
    x0: raw.origin[0],
    z0: raw.origin[1],
    w: raw.width,
    h: raw.height,
    cost: decodeRle(raw.cost, size),
    roomIndex: decodeRle(raw.roomIndex, size),
    roomOrder: raw.roomOrder,
    anchors,
    portals: raw.portals.map((p) => ({
      roomId: p.roomId,
      x: Math.floor((p.centre[0] - raw.origin[0]) / raw.cellM),
      z: Math.floor((p.centre[1] - raw.origin[1]) / raw.cellM),
    })),
  };
}

export const canRoute = (grid: NavGrid, id: string) => grid.anchors.has(id);

/** Binary min-heap of cell indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() { return this.items.length; }
  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p]; keys[i] = keys[p];
      i = p;
    }
    items[i] = item; keys[i] = key;
  }
  pop(): number {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        items[i] = items[c]; keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem; keys[i] = lastKey;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** Effective cost of standing in a cell, given which rooms the route may freely use. */
function cellWeight(grid: NavGrid, i: number, freeRooms: Set<number>, courtIndex: number): number {
  const c = grid.cost[i];
  const r = grid.roomIndex[i];
  if (r === 0 || freeRooms.has(r)) return c;
  return c * (r === courtIndex ? COURT_PENALTY : ROOM_PENALTY);
}

function astar(grid: NavGrid, start: number, goal: number, freeRooms: Set<number>, courtIndex: number): number[] | null {
  const { w, h, cost } = grid;
  const n = w * h;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = goal % w;
  const gz = (goal / w) | 0;
  // Octile distance in cells; the minimum cell weight is 1, so this never overestimates.
  const heuristic = (i: number) => {
    const dx = Math.abs((i % w) - gx);
    const dz = Math.abs(((i / w) | 0) - gz);
    return (dx + dz) + (SQRT2 - 2) * Math.min(dx, dz);
  };
  const heap = new Heap();
  g[start] = 0;
  heap.push(start, heuristic(start));
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    const x = i % w;
    const z = (i / w) | 0;
    const wi = cellWeight(grid, i, freeRooms, courtIndex);
    for (const [dx, dz, len] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (!cost[j] || closed[j]) continue;
      // No cutting diagonally past a wall corner.
      if (dx && dz && (!cost[z * w + nx] || !cost[nz * w + x])) continue;
      const step = len * (wi + cellWeight(grid, j, freeRooms, courtIndex)) / 2;
      const next = g[i] + step;
      if (next < g[j]) {
        g[j] = next;
        parent[j] = i;
        heap.push(j, next + heuristic(j));
      }
    }
  }
  if (parent[goal] === -1 && goal !== start) return null;
  const path = [goal];
  while (path[path.length - 1] !== start) path.push(parent[path[path.length - 1]]);
  return path.reverse();
}

/**
 * Samples the straight line between two cell centres (4 samples per cell); returns the
 * worst cell weight on it, or Infinity if it touches a blocked cell or squeezes
 * diagonally past a wall corner.
 */
function lineWeight(grid: NavGrid, a: number, b: number, freeRooms: Set<number>, courtIndex: number): number {
  const { w, cost } = grid;
  const ax = a % w, az = (a / w) | 0;
  const bx = b % w, bz = (b / w) | 0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(bz - az)) * 4));
  let worst = 0;
  let px = ax, pz = az;
  for (let k = 0; k <= n; k++) {
    const x = Math.round(ax + ((bx - ax) * k) / n);
    const z = Math.round(az + ((bz - az) * k) / n);
    if (k > 0 && x === px && z === pz) continue;
    const i = z * w + x;
    if (!cost[i]) return Infinity;
    if (x !== px && z !== pz && (!cost[pz * w + x] || !cost[z * w + px])) return Infinity;
    worst = Math.max(worst, cellWeight(grid, i, freeRooms, courtIndex));
    px = x; pz = z;
  }
  return worst;
}

/** Greedy string pulling: jump to the farthest cell reachable in a straight line that is no closer to walls than the grid path. */
function straighten(grid: NavGrid, path: number[], freeRooms: Set<number>, courtIndex: number): number[] {
  if (path.length < 3) return path;
  const weights = path.map((i) => cellWeight(grid, i, freeRooms, courtIndex));
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    let worstOnPath = weights[i];
    for (let j = i + 1; j < path.length; j++) {
      worstOnPath = Math.max(worstOnPath, weights[j]);
      const limit = Math.max(2, worstOnPath);
      if (j - i > 1 && lineWeight(grid, path[i], path[j], freeRooms, courtIndex) > limit) continue;
      best = j;
    }
    out.push(path[best]);
    i = best;
  }
  return out;
}

export function findRoute(grid: NavGrid, fromId: string, toId: string): WalkRoute | null {
  const start = grid.anchors.get(fromId);
  const goal = grid.anchors.get(toId);
  if (start === undefined || goal === undefined) return null;
  const indexOf = (id: string) => grid.roomOrder.indexOf(id) + 1;
  const freeRooms = new Set([indexOf(fromId), indexOf(toId)].filter((i) => i > 0));
  const courtIndex = indexOf('ARENA-COURT');
  const cells = start === goal ? [start] : astar(grid, start, goal, freeRooms, courtIndex);
  if (!cells) return null;

  const through: string[] = [];
  let lastRoom = -1;
  for (const i of cells) {
    const r = grid.roomIndex[i];
    if (r && r !== lastRoom && !freeRooms.has(r)) {
      const id = grid.roomOrder[r - 1];
      if (id !== 'ARENA-COURT' && !through.includes(id)) through.push(id);
    }
    lastRoom = r;
  }
  const inferredDoors = grid.portals
    .filter((p) => cells.some((i) => Math.abs((i % grid.w) - p.x) <= 2 && Math.abs(((i / grid.w) | 0) - p.z) <= 2))
    .map((p) => p.roomId);

  const toWorld = (i: number): [number, number] => [
    grid.x0 + ((i % grid.w) + 0.5) * grid.cellM,
    grid.z0 + (((i / grid.w) | 0) + 0.5) * grid.cellM,
  ];
  const points = straighten(grid, cells, freeRooms, courtIndex).map(toWorld);
  let lengthM = 0;
  for (let k = 1; k < points.length; k++) lengthM += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return {
    fromId,
    toId,
    points,
    lengthM,
    minutes: Math.max(1, Math.round(lengthM / WALK_SPEED_MPS / 60)),
    throughRooms: through,
    inferredDoors,
  };
}

export type TurnKind = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'sharp-left' | 'sharp-right' | 'uturn';
export type Compass = '北' | '东北' | '东' | '东南' | '南' | '西南' | '西' | '西北';
export type LegArea = 'ring' | 'court' | null;

export interface RouteStep {
  kind: 'depart' | 'turn' | 'arrive';
  /** Direction change at this point (turn steps). */
  turn?: TurnKind;
  /** Index into route.points where this step happens. */
  pointIndex: number;
  at: [number, number];
  /** Metres from this step to the next one (0 for arrive). */
  legM: number;
  /** Metres from here to the destination. */
  remainingM: number;
  /** Room near the turn, when one is close enough to recognise. */
  landmarkId?: string;
  /** Depart: compass heading of the first leg (x east, z south). */
  heading?: Compass;
  /** Named stretch the leg after this step mostly follows. */
  area?: LegArea;
  /** Turn right after leaving the start room / right before entering the destination. */
  leavingStart?: boolean;
  enteringDestination?: boolean;
}

const LANDMARK_M = 7;
const DOOR_M = 6;
const MERGE_M = 9;
/** Ring corridor around the arena (from the walking grid: fully walkable bands at these radii). */
const ARENA_CENTRE: [number, number] = [-8.4, -2.85];
const RING_BAND: [number, number] = [27, 35.5];
const COURT_BAND: [number, number] = [12, 17];

function classifyTurn(deg: number): TurnKind {
  const a = Math.abs(deg);
  const side = deg > 0 ? 'right' : 'left';
  if (a < 28) return 'straight';
  if (a < 60) return `slight-${side}` as TurnKind;
  if (a < 135) return side;
  if (a < 165) return `sharp-${side}` as TurnKind;
  return 'uturn';
}

function compass(dx: number, dz: number): Compass {
  // x east, z south; 0 = north, clockwise.
  const bearing = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const names: Compass[] = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return names[(Math.round(bearing / 45) + 8) % 8];
}

/** Which named stretch a leg (a polyline) mostly follows, sampled every metre. */
function legArea(a: [number, number], b: [number, number], poly: [number, number][] = [a, b]): LegArea {
  let ring = 0, court = 0, n = 0;
  for (let i = 1; i < poly.length; i++) {
    const [x0, z0] = poly[i - 1], [x1, z1] = poly[i];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const parts = Math.max(1, Math.round(len));
    for (let k = 0; k < parts; k++) {
      const x = x0 + ((x1 - x0) * k) / parts, z = z0 + ((z1 - z0) * k) / parts;
      const r = Math.hypot(x - ARENA_CENTRE[0], z - ARENA_CENTRE[1]);
      n++;
      if (r >= RING_BAND[0] && r <= RING_BAND[1]) ring++;
      if (r >= COURT_BAND[0] && r <= COURT_BAND[1]) court++;
    }
  }
  if (n < 8) return null;
  if (ring / n >= 0.75) return 'ring';
  if (court / n >= 0.75) return 'court';
  return null;
}

/**
 * Maneuvers along the straightened route: depart, every bend of at least 28°
 * (classified slight / turn / sharp / u-turn and named after the nearest room
 * within LANDMARK_M), and arrive. x is east and z is south, so with north up a
 * positive cross product is a right turn. A short jog (left then right within a
 * few metres) reads as going straight on.
 */
export function describeRoute(grid: NavGrid, route: WalkRoute, isLandmark: (id: string) => boolean): RouteStep[] {
  const pts = route.points;
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = cum[cum.length - 1];
  const landmarks: [string, number, number][] = [];
  for (const [id, i] of grid.anchors) {
    if (id === route.fromId || id === route.toId || !isLandmark(id)) continue;
    landmarks.push([id, grid.x0 + ((i % grid.w) + 0.5) * grid.cellM, grid.z0 + (((i / grid.w) | 0) + 0.5) * grid.cellM]);
  }
  const nearestLandmark = (x: number, z: number) => {
    let best = LANDMARK_M;
    let id: string | undefined;
    for (const [lid, lx, lz] of landmarks) {
      const d = Math.hypot(lx - x, lz - z);
      if (d < best) { best = d; id = lid; }
    }
    return id;
  };

  // Bends at each vertex, then merge consecutive same-side bends a few metres apart:
  // a straightened 90° corner often comes out as two 45° bends.
  const bends: { k: number; deg: number }[] = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], [cx, cz] = pts[k + 1];
    const v1x = bx - ax, v1z = bz - az, v2x = cx - bx, v2z = cz - bz;
    const deg = (Math.atan2(v1x * v2z - v1z * v2x, v1x * v2x + v1z * v2z) * 180) / Math.PI;
    if (Math.abs(deg) >= 8) bends.push({ k, deg });
  }
  const groups: { k: number; deg: number; peak: number }[] = [];
  for (const bend of bends) {
    const g = groups[groups.length - 1];
    if (g && Math.sign(g.deg) === Math.sign(bend.deg) && cum[bend.k] - cum[g.k] < MERGE_M) {
      g.deg += bend.deg;
      if (Math.abs(bend.deg) > g.peak) { g.peak = Math.abs(bend.deg); g.k = bend.k; }
      continue;
    }
    groups.push({ k: bend.k, deg: bend.deg, peak: Math.abs(bend.deg) });
  }
  const turns: { k: number; turn: TurnKind }[] = [];
  let lastK = 0;
  for (const g of groups) {
    const turn = classifyTurn(g.deg);
    if (turn === 'straight') continue;
    const prev = turns[turns.length - 1];
    const sideOf = (t: TurnKind) => (t.includes('left') ? 'left' : t.includes('right') ? 'right' : 'u');
    if (prev && cum[g.k] - cum[prev.k] < 3 && sideOf(prev.turn) !== sideOf(turn) && sideOf(turn) !== 'u') {
      turns.pop(); // jog: cancels out
      continue;
    }
    if (cum[g.k] < 1.5 || total - cum[g.k] < 1.5 || g.k <= lastK) continue; // inside the start / end cell cluster
    turns.push({ k: g.k, turn });
    lastK = g.k;
  }

  // Slight bends at the corners of the octagonal ring corridor are the corridor, not turns.
  for (let changed = true; changed;) {
    changed = false;
    for (let n = 0; n < turns.length; n++) {
      if (!turns[n].turn.startsWith('slight')) continue;
      const before = n === 0 ? 0 : turns[n - 1].k;
      const after = n === turns.length - 1 ? pts.length - 1 : turns[n + 1].k;
      if (legArea(pts[before], pts[turns[n].k], pts.slice(before, turns[n].k + 1)) === 'ring'
        && legArea(pts[turns[n].k], pts[after], pts.slice(turns[n].k, after + 1)) === 'ring') {
        turns.splice(n, 1);
        changed = true;
        break;
      }
    }
  }

  const [dx, dz] = [pts[Math.min(1, pts.length - 1)][0] - pts[0][0], pts[Math.min(1, pts.length - 1)][1] - pts[0][1]];
  const points = [0, ...turns.map((t) => t.k), pts.length - 1];
  const steps: RouteStep[] = points.map((k, n) => {
    const next = points[n + 1];
    const step: RouteStep = {
      kind: n === 0 ? 'depart' : n === points.length - 1 ? 'arrive' : 'turn',
      pointIndex: k,
      at: pts[k],
      legM: next === undefined ? 0 : cum[next] - cum[k],
      remainingM: total - cum[k],
      area: next === undefined ? null : legArea(pts[k], pts[next], pts.slice(k, next + 1)),
    };
    if (step.kind === 'turn') {
      step.turn = turns[n - 1].turn;
      step.landmarkId = nearestLandmark(pts[k][0], pts[k][1]);
    }
    return step;
  });
  steps[0].heading = compass(dx, dz);
  const startIsRoom = !route.fromId.startsWith('ENTRANCE-');
  if (startIsRoom && steps.length > 2 && steps[1].kind === 'turn' && cum[steps[1].pointIndex] <= DOOR_M) steps[1].leavingStart = true;
  const last = steps[steps.length - 2];
  if (last && last.kind === 'turn' && last.legM <= DOOR_M) last.enteringDestination = true;
  return steps;
}
