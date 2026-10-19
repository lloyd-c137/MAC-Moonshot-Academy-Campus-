/**
 * The walking route on the 3D map: a white-cased orange ribbon on the floor with a
 * start ring and an end dot. Drawn over walls (no depth test) so the whole route stays
 * readable when the 2.5D view puts walls in front of it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FLARE = 0xff7a00;
const INK = 0x18202e;
const Y = 0.2;

/** Flat ribbon along a polyline: one quad per segment plus a disc at every joint (round joins and caps). */
function ribbon(points: [number, number][], width: number, y: number): THREE.BufferGeometry {
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
    const disc = new THREE.CircleGeometry(half, 20).rotateX(-Math.PI / 2).translate(x, y, z);
    disc.deleteAttribute('normal');
    disc.deleteAttribute('uv');
    parts.push(disc.toNonIndexed());
  }
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

const overlay = (color: number, order: number, opacity = 1) => {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  return { material, order };
};

function mesh(geometry: THREE.BufferGeometry, color: number, order: number, opacity = 1): THREE.Mesh {
  const { material } = overlay(color, order, opacity);
  const m = new THREE.Mesh(geometry, material);
  m.renderOrder = order;
  m.frustumCulled = false;
  return m;
}

function marker(x: number, z: number, outer: number, inner: number, outerColor: number, innerColor: number, order: number): THREE.Group {
  const group = new THREE.Group();
  group.add(mesh(new THREE.CircleGeometry(outer + 0.22, 32).rotateX(-Math.PI / 2), 0xffffff, order));
  group.add(mesh(new THREE.CircleGeometry(outer, 32).rotateX(-Math.PI / 2), outerColor, order + 1));
  group.add(mesh(new THREE.CircleGeometry(inner, 32).rotateX(-Math.PI / 2), innerColor, order + 2));
  group.position.set(x, Y + 0.01, z);
  return group;
}

export function buildRouteObject(points: [number, number][]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'walk-route';
  if (points.length === 0) return group;
  if (points.length > 1) {
    group.add(mesh(ribbon(points, 1.25, Y), 0xffffff, 40, 0.95));
    group.add(mesh(ribbon(points, 0.7, Y), FLARE, 41));
  }
  const [sx, sz] = points[0];
  const [ex, ez] = points[points.length - 1];
  group.add(marker(sx, sz, 0.95, 0.45, INK, 0xffffff, 43));
  group.add(marker(ex, ez, 1.25, 0.5, FLARE, 0xffffff, 46));
  return group;
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
}
