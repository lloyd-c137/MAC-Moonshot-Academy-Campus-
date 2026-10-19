/**
 * The walking route on the 3D map.
 *
 * - Overview: the whole route as an orange ribbon with direction chevrons.
 * - Guidance (a current step): the walked part turns grey, the current leg is bright
 *   with chevrons, the rest stays orange, and a turn arrow sits at the next maneuver.
 *
 * Occlusion: every ribbon is drawn twice. The normal pass is depth-tested, so walls in
 * front of the route hide it (no more route "through" walls in 2.5D). An x-ray pass
 * draws only the hidden parts, faintly, so the route stays traceable behind walls,
 * as 3D navigation maps do.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Pt = [number, number];

const FLARE = 0xff7a00;
const INK = 0x18202e;
const WALKED = 0xa3abb8;
const AHEAD = 0xffb26b; // flare mixed with white: solid, so overlapping joints do not darken
const Y = 0.18;

const cumulative = (pts: Pt[]) => {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
};

/** Point and unit direction at distance d along the polyline. */
function at(pts: Pt[], cum: number[], d: number): { p: Pt; dir: Pt } {
  const total = cum[cum.length - 1];
  const t = Math.max(0, Math.min(total, d));
  let i = 1;
  while (i < pts.length - 1 && cum[i] < t) i++;
  const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
  const len = cum[i] - cum[i - 1] || 1;
  const f = (t - cum[i - 1]) / len;
  return { p: [ax + (bx - ax) * f, az + (bz - az) * f], dir: [(bx - ax) / len, (bz - az) / len] };
}

/** Sub-polyline between two distances. */
function slice(pts: Pt[], cum: number[], d0: number, d1: number): Pt[] {
  if (d1 <= d0) return [];
  const out: Pt[] = [at(pts, cum, d0).p];
  for (let i = 0; i < pts.length; i++) if (cum[i] > d0 && cum[i] < d1) out.push(pts[i]);
  out.push(at(pts, cum, d1).p);
  return out;
}

/** Flat ribbon along a polyline with round joins and caps. */
function ribbon(points: Pt[], width: number, y: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const half = width / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const nx = (-(bz - az) / len) * half;
    const nz = ((bx - ax) / len) * half;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz,
      ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz,
    ], 3));
    parts.push(g);
  }
  for (const [x, z] of points) {
    const disc = new THREE.CircleGeometry(half, 16).rotateX(-Math.PI / 2).translate(x, y, z);
    disc.deleteAttribute('normal');
    disc.deleteAttribute('uv');
    parts.push(disc.toNonIndexed());
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Open chevrons (›) every `spacing` metres, pointing along the route. */
function chevrons(pts: Pt[], cum: number[], d0: number, d1: number, spacing: number, size: number, y: number): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (let d = d0 + spacing * 0.6; d < d1 - spacing * 0.4; d += spacing) {
    const { p: [x, z], dir: [dx, dz] } = at(pts, cum, d);
    const nx = -dz, nz = dx;
    // Two thin quads forming a ">" shape pointing along (dx, dz).
    const tip: Pt = [x + dx * size * 0.45, z + dz * size * 0.45];
    const arms: Pt[] = [
      [x - dx * size * 0.35 + nx * size * 0.5, z - dz * size * 0.35 + nz * size * 0.5],
      [x - dx * size * 0.35 - nx * size * 0.5, z - dz * size * 0.35 - nz * size * 0.5],
    ];
    for (const arm of arms) {
      const g = ribbon([arm, tip], size * 0.22, y);
      if (g) parts.push(g);
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Turn arrow at a maneuver: the route from `back` metres before to `ahead` after, with an arrowhead. */
function turnArrow(pts: Pt[], cum: number[], d: number, back: number, ahead: number, y: number) {
  const path = slice(pts, cum, Math.max(0, d - back), Math.min(cum[cum.length - 1], d + ahead));
  if (path.length < 2) return null;
  const end = path[path.length - 1];
  const prev = path[path.length - 2];
  const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
  const dx = (end[0] - prev[0]) / len, dz = (end[1] - prev[1]) / len;
  const nx = -dz, nz = dx;
  const head = (w: number, l: number, yy: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      end[0] + nx * w, yy, end[1] + nz * w,
      end[0] + dx * l, yy, end[1] + dz * l,
      end[0] - nx * w, yy, end[1] - nz * w,
    ], 3));
    return g;
  };
  const merge = (a: THREE.BufferGeometry | null, b: THREE.BufferGeometry) => {
    const m = a ? mergeGeometries([a, b], false) : b;
    a?.dispose();
    if (a) b.dispose();
    return m;
  };
  return {
    outline: merge(ribbon(path, 1.15, y), head(1.35, 1.9, y)),
    fill: merge(ribbon(path, 0.6, y + 0.01), head(0.95, 1.35, y + 0.01)),
  };
}


/** A mesh drawn normally where visible, plus a faint x-ray copy where walls hide it. */
function twoPass(geometry: THREE.BufferGeometry, color: number, order: number, opacity = 1, xray = 0.32): THREE.Group {
  const group = new THREE.Group();
  const visible = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    // Opaque ribbons write depth so floor-detail lines (drawn later) cannot paint over them.
    color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  visible.renderOrder = order;
  group.add(visible);
  if (xray > 0) {
    const hidden = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: xray * opacity, depthWrite: false, depthFunc: THREE.GreaterDepth, side: THREE.DoubleSide,
    }));
    hidden.renderOrder = order - 20;
    group.add(hidden);
  }
  return group;
}

function marker(x: number, z: number, outer: number, inner: number, outerColor: number, innerColor: number, order: number): THREE.Group {
  const group = new THREE.Group();
  const disc = (r: number, color: number, o: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true }));
    m.renderOrder = o;
    return m;
  };
  group.add(disc(outer + 0.22, 0xffffff, order), disc(outer, outerColor, order + 1), disc(inner, innerColor, order + 2));
  group.position.set(x, Y + 0.05, z);
  return group;
}

export interface RouteLayerStep { pointIndex: number }

export class RouteLayer {
  readonly group = new THREE.Group();
  private readonly cum: number[];
  private dynamic = new THREE.Group();

  constructor(private readonly points: Pt[], private readonly steps: RouteLayerStep[]) {
    this.cum = cumulative(points);
    this.group.name = 'walk-route';
    this.group.add(this.dynamic);
    if (points.length) {
      const [sx, sz] = points[0];
      const [ex, ez] = points[points.length - 1];
      this.group.add(marker(sx, sz, 0.85, 0.4, INK, 0xffffff, 60));
      this.group.add(marker(ex, ez, 1.2, 0.48, FLARE, 0xffffff, 63));
    }
    this.setProgress(null);
  }

  /** null = overview; otherwise the index of the step the walker is at (walking towards step + 1). */
  setProgress(step: number | null): void {
    this.clearDynamic();
    const { points: pts, cum } = this;
    const total = cum[cum.length - 1];
    if (pts.length < 2) return;
    const add = (g: THREE.BufferGeometry | null, color: number, order: number, opacity = 1, xray = 0.32) => {
      if (g) this.dynamic.add(twoPass(g, color, order, opacity, xray));
    };
    const band = (a: number, b: number, color: number, order: number, opacity = 1, width = 0.7) => {
      const path = slice(pts, cum, a, b);
      add(ribbon(path, width + 0.5, Y), 0xffffff, order, opacity);
      add(ribbon(path, width, Y + 0.005), color, order + 1, opacity);
    };

    if (step === null || this.steps.length < 2) {
      // Overview is seen from far away: a wider ribbon and sparser, larger chevrons.
      const width = Math.min(1.6, Math.max(0.9, total / 90));
      band(0, total, FLARE, 30, 1, width);
      add(chevrons(pts, cum, 0, total, width * 7, width * 0.7, Y + 0.012), 0xffffff, 33, 0.95, 0);
      return;
    }
    const k = Math.max(0, Math.min(step, this.steps.length - 1));
    const d0 = cum[this.steps[k].pointIndex];
    const next = this.steps[k + 1];
    const d1 = next ? cum[next.pointIndex] : total;
    if (d0 > 0) band(0, d0, WALKED, 26, 1, 0.55);
    if (d1 < total) band(d1, total, AHEAD, 28, 1, 0.6);
    if (d1 > d0) {
      band(d0, d1, FLARE, 30, 1, 0.8);
      add(chevrons(pts, cum, d0, d1, 3.2, 0.5, Y + 0.012), 0xffffff, 33, 1, 0);
    }
    // Turn arrow at the upcoming maneuver (not at the destination: the end marker shows it).
    if (next && k + 1 < this.steps.length - 1) {
      const arrow = turnArrow(pts, cum, d1, Math.min(4, d1 - d0), 3.5, Y + 0.03);
      if (arrow) {
        // The maneuver arrow is small and always drawn on top, as in navigation maps.
        for (const [g, color, order] of [[arrow.outline, INK, 50], [arrow.fill, 0xffffff, 51]] as const) {
          const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide }));
          m.renderOrder = order;
          this.dynamic.add(m);
        }
      }
    }
  }

  private clearDynamic() {
    disposeObject(this.dynamic);
    this.group.remove(this.dynamic);
    this.dynamic = new THREE.Group();
    this.group.add(this.dynamic);
  }

  dispose() {
    disposeObject(this.group);
  }
}

export function disposeObject(object: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      geometries.add(child.geometry);
      (child.material as THREE.Material).dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
}
