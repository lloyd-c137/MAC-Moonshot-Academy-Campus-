#!/usr/bin/env python3
"""Build the FF-01 walking grid used by in-browser route finding.

Input: the generated campus model (src/generated/ff01-campus-{core,detail}.json).
Output: src/generated/ff01-nav-grid.json

The grid is derived, not surveyed:
- Blocked: walls, glazing, arena stands, and everything outside the derived footprint.
- Walkable: cells at least CLEARANCE_M from any blocked cell.
- Door gaps in the wall model are narrow (CAD wall lines were thickened when the 3D
  walls were built), so the clearance is small and a separate cost keeps routes
  centred in corridors.
- Some rooms come out sealed: their door gap closed when the wall lines were
  thickened, though the door leaf and swing are drawn on FF-01. For those, a portal
  is inferred: the shortest crossing (<= MAX_PORTAL_M of non-walkable cells) to the
  main walkable area, allowed only next to a drawn door. Every portal is recorded.

No floors other than FF-01 are modelled, stairs are not used as connections, and
nothing here verifies that a door is unlocked or passable.
"""
from __future__ import annotations

import argparse
import base64
import heapq
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'src' / 'generated'

CELL_M = 0.2
MARGIN_M = 1.0
CLEARANCE_M = 0.15          # route centre-line keeps at least this far from walls
COMFORT_M = 0.7             # beyond this distance from walls, walking costs the minimum
DOOR_REACH_M = 0.8          # inferred portals must lie this close to a drawn door line
MAX_PORTAL_M = 1.6          # longest inferred crossing through non-walkable cells
COST_LEVELS = 6             # stored cost values 1..COST_LEVELS (0 = blocked)
PORTAL_COST = 3


def decode_polylines(packed: dict) -> list[list[tuple[float, float]]]:
    flat = packed['deltaCm']
    out, i = [], 0
    while i < len(flat):
        n, x, z = flat[i], flat[i + 1], flat[i + 2]
        i += 3
        line = [(x / 100, z / 100)]
        for _ in range(1, n):
            x += flat[i]
            z += flat[i + 1]
            i += 2
            line.append((x / 100, z / 100))
        out.append(line)
    return out


class Grid:
    def __init__(self, bounds: list[float]):
        x0, z0, x1, z1 = bounds
        self.x0 = x0 - MARGIN_M
        self.z0 = z0 - MARGIN_M
        self.w = int(np.ceil((x1 - x0 + 2 * MARGIN_M) / CELL_M))
        self.h = int(np.ceil((z1 - z0 + 2 * MARGIN_M) / CELL_M))

    def px(self, p) -> tuple[float, float]:
        return ((p[0] - self.x0) / CELL_M, (p[1] - self.z0) / CELL_M)

    def cell(self, p) -> tuple[int, int]:
        return int((p[0] - self.x0) / CELL_M), int((p[1] - self.z0) / CELL_M)

    def mask(self) -> Image.Image:
        return Image.new('L', (self.w, self.h), 0)

    def fill_polygon(self, target: Image.Image, poly: dict) -> None:
        """Fill a polygon with holes into `target` without erasing other shapes."""
        m = self.mask()
        draw = ImageDraw.Draw(m)
        draw.polygon([self.px(p) for p in poly['o']], fill=255)
        for hole in poly.get('h', []):
            draw.polygon([self.px(p) for p in hole], fill=0)
        target.paste(255, mask=m)


def distance_to_blocked(blocked: np.ndarray, max_cells: int) -> np.ndarray:
    """Euclidean distance (in cells) to the nearest blocked cell, capped at max_cells."""
    dist = np.full(blocked.shape, float(max_cells), dtype=np.float32)
    dist[blocked] = 0.0
    padded = np.pad(blocked, max_cells, constant_values=False)
    h, w = blocked.shape
    offsets = sorted(
        ((dx * dx + dz * dz) ** 0.5, dx, dz)
        for dx in range(-max_cells, max_cells + 1)
        for dz in range(-max_cells, max_cells + 1)
        if 0 < dx * dx + dz * dz <= max_cells * max_cells
    )
    for d, dx, dz in offsets:
        shifted = padded[max_cells + dz:max_cells + dz + h, max_cells + dx:max_cells + dx + w]
        np.minimum(dist, np.where(shifted, d, max_cells), out=dist)
    return dist


NEIGHBOURS8 = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def label_components(walkable: np.ndarray) -> tuple[np.ndarray, int]:
    h, w = walkable.shape
    labels = np.zeros((h, w), dtype=np.int32)
    current = 0
    for z0, x0 in zip(*np.nonzero(walkable)):
        if labels[z0, x0]:
            continue
        current += 1
        labels[z0, x0] = current
        queue = deque([(x0, z0)])
        while queue:
            x, z = queue.popleft()
            for dx, dz in NEIGHBOURS8:
                nx, nz = x + dx, z + dz
                # Same rule as the browser pathfinder: no diagonal squeeze past a wall corner.
                if dx and dz and not (0 <= nx < w and 0 <= nz < h and walkable[z, nx] and walkable[nz, x]):
                    continue
                if 0 <= nx < w and 0 <= nz < h and walkable[nz, nx] and not labels[nz, nx]:
                    labels[nz, nx] = current
                    queue.append((nx, nz))
    return labels, current


def infer_portal(labels: np.ndarray, component: int, main: int, walkable: np.ndarray, near_door: np.ndarray, hard: np.ndarray):
    """0-1 BFS from a sealed component to the main area. Crossing a non-walkable cell
    costs 1 and is allowed only near a drawn door; walls far from doors are impassable."""
    h, w = labels.shape
    max_cost = int(round(MAX_PORTAL_M / CELL_M))
    cost = np.full((h, w), np.iinfo(np.int32).max, dtype=np.int32)
    parent: dict[tuple[int, int], tuple[int, int]] = {}
    queue: deque = deque()
    for z, x in zip(*np.nonzero(labels == component)):
        cost[z, x] = 0
        queue.append((x, z))
    while queue:
        x, z = queue.popleft()
        c = cost[z, x]
        if labels[z, x] == main:
            path = [(x, z)]
            while path[-1] in parent:
                path.append(parent[path[-1]])
            crossing = [(px, pz) for px, pz in path if not walkable[pz, px]]
            return crossing, int(c)
        for dx, dz in NEIGHBOURS8[:4]:  # 4-connected so a portal cannot slip diagonally through a wall corner
            nx, nz = x + dx, z + dz
            if not (0 <= nx < w and 0 <= nz < h) or hard[nz, nx]:
                continue
            if walkable[nz, nx]:
                step = 0
            elif near_door[nz, nx]:
                step = 1
            else:
                continue
            nc = c + step
            if nc > max_cost or nc >= cost[nz, nx]:
                continue
            cost[nz, nx] = nc
            parent[(nx, nz)] = (x, z)
            (queue.appendleft if step == 0 else queue.append)((nx, nz))
    return None, None


def rle_encode(values: np.ndarray) -> str:
    """Run-length encode a uint8 array as (value, run) byte pairs, runs capped at 255."""
    flat = values.ravel()
    out = bytearray()
    i, n = 0, len(flat)
    while i < n:
        v = flat[i]
        j = i + 1
        while j < n and flat[j] == v and j - i < 255:
            j += 1
        out += bytes((int(v), j - i))
        i = j
    return base64.b64encode(bytes(out)).decode('ascii')


def build(core_path: Path, detail_path: Path, out_path: Path, preview: Path | None) -> dict:
    core = json.loads(core_path.read_text())
    detail = json.loads(detail_path.read_text())
    grid = Grid(core['bounds'])

    walls_img = grid.mask()
    for poly in core['walls']:
        grid.fill_polygon(walls_img, poly)
    glass_img = grid.mask()
    for poly in core['glazing']:
        grid.fill_polygon(glass_img, poly)
    stands_img = grid.mask()
    for poly in core['arena']['standBlocks']:
        grid.fill_polygon(stands_img, poly)
    inside_img = grid.mask()
    grid.fill_polygon(inside_img, core['footprint']['polygon'])

    walls = np.array(walls_img) > 0
    glass = np.array(glass_img) > 0
    stands = np.array(stands_img) > 0
    inside = np.array(inside_img) > 0
    blocked = walls | glass | stands | ~inside

    comfort_cells = int(np.ceil(COMFORT_M / CELL_M))
    dist_m = distance_to_blocked(blocked, comfort_cells) * CELL_M
    walkable = dist_m > CLEARANCE_M

    # Cells close to a drawn door line (door leaves and swings on the FF-01 door layer).
    door_img = grid.mask()
    draw = ImageDraw.Draw(door_img)
    reach = max(1, int(round(DOOR_REACH_M / CELL_M)))
    for line in decode_polylines(detail['floorLines']['doors']):
        if len(line) > 1:
            draw.line([grid.px(p) for p in line], fill=255, width=1)
    door_lines = np.array(door_img) > 0
    near_door = distance_to_blocked(door_lines, reach) < reach
    # Stands and the outside are never crossed by an inferred portal.
    hard = stands | ~inside

    labels, _ = label_components(walkable)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())

    # Room seeds: the walkable cells of each room's region (or around its label).
    room_masks: dict[str, np.ndarray] = {}
    for room in core['rooms']:
        if room.get('polygon'):
            m = grid.mask()
            grid.fill_polygon(m, room['polygon'])
            room_masks[room['id']] = (np.array(m) > 0) & walkable
        else:
            cx, cz = grid.cell(room['label'])
            r = int(round(3.0 / CELL_M))
            m = np.zeros_like(walkable)
            m[max(0, cz - r):cz + r + 1, max(0, cx - r):cx + r + 1] = True
            room_masks[room['id']] = m & walkable

    portals = []
    carved = np.zeros_like(walkable)
    for room in core['rooms']:
        rid = room['id']
        comps = set(np.unique(labels[room_masks[rid]]).tolist()) - {0}
        if not comps or main in comps:
            continue
        component = max(comps, key=lambda c: sizes[c])
        crossing, cost = infer_portal(labels, component, main, walkable, near_door, hard)
        if crossing is None:
            continue
        for x, z in crossing:
            carved[z, x] = True
        xs = [x for x, _ in crossing]
        zs = [z for _, z in crossing]
        portals.append({
            'roomId': rid,
            'cells': len(crossing),
            'crossingM': round(cost * CELL_M, 2),
            'centre': [round(float(grid.x0 + (np.mean(xs) + 0.5) * CELL_M), 2), round(float(grid.z0 + (np.mean(zs) + 0.5) * CELL_M), 2)],
            'method': 'INFERRED_FROM_DOOR_LAYER',
        })
        # Merge the sealed component into the main area for later rooms.
        labels[labels == component] = main
        for x, z in crossing:
            labels[z, x] = main

    walk = walkable | carved
    labels, _ = label_components(walk)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    main = int(sizes.argmax())
    reachable = labels == main

    # Cost: 1 in open corridors, rising towards walls; portal cells a little higher.
    closeness = np.clip((COMFORT_M - dist_m) / (COMFORT_M - CLEARANCE_M), 0, 1)
    cost = (1 + np.round(closeness * (COST_LEVELS - 1))).astype(np.uint8)
    cost[carved] = np.maximum(cost[carved], PORTAL_COST)
    cost[~reachable] = 0

    rooms_out = {}
    unreachable = []
    for room in core['rooms']:
        rid = room['id']
        m = room_masks[rid] & reachable
        if not m.any():
            # A carved portal may be the only reachable part; look near the label.
            cx, cz = grid.cell(room['label'])
            r = int(round(3.0 / CELL_M))
            near = np.zeros_like(reachable)
            near[max(0, cz - r):cz + r + 1, max(0, cx - r):cx + r + 1] = True
            m = near & reachable
        if not m.any():
            unreachable.append(rid)
            continue
        zs, xs = np.nonzero(m)
        cx, cz = grid.cell(room['label'])
        # Anchor: the reachable room cell nearest the label, preferring roomy cells.
        score = (xs - cx) ** 2 + (zs - cz) ** 2 - (dist_m[zs, xs] / CELL_M) ** 2 * 0.5
        k = int(np.argmin(score))
        rooms_out[rid] = [int(xs[k]), int(zs[k])]

    # Which room each cell belongs to (1-based index into roomOrder; 0 = corridor / open space).
    # Routes pay extra to cross rooms other than their start and end, so they keep to corridors.
    room_order: list[str] = []
    room_index = np.zeros((grid.h, grid.w), dtype=np.uint8)
    # Rooms closed only by a reviewer-drawn line (no wall on that side, e.g. 小剧场) are open floor.
    open_rooms = {r['id'] for r in core['rooms'] if r.get('geometryStatus') == 'REVIEWER_DEFINED_CLOSURE'}
    for room in sorted((r for r in core['rooms'] if r.get('polygon') and r['id'] not in open_rooms), key=lambda r: -(r.get('areaM2Polygon') or 0)):
        m = grid.mask()
        grid.fill_polygon(m, room['polygon'])
        room_order.append(room['id'])
        room_index[np.array(m) > 0] = len(room_order)  # smaller rooms drawn last win shared cells
    court = grid.mask()
    for ring in core['arena']['court']:
        ImageDraw.Draw(court).polygon([grid.px(p) for p in ring], fill=255)
    room_order.append('ARENA-COURT')
    room_index[np.array(court) > 0] = len(room_order)
    assert len(room_order) < 256
    room_index[cost == 0] = 0

    result = {
        'schemaVersion': 1,
        'modelID': 'FF01-NAV-GRID-V1',
        'status': 'SOURCE_DERIVED_UNVERIFIED',
        'statement': 'Walking grid derived from the FF-01 3D wall, glazing, stand and footprint geometry. '
                     'Routes are estimates: doors are not verified as passable, and some door openings are inferred.',
        'sourceModelID': core['modelID'],
        'cellM': CELL_M,
        'origin': [round(grid.x0, 4), round(grid.z0, 4)],
        'width': grid.w,
        'height': grid.h,
        'parameters': {
            'clearanceM': CLEARANCE_M, 'comfortM': COMFORT_M, 'doorReachM': DOOR_REACH_M,
            'maxPortalM': MAX_PORTAL_M, 'costLevels': COST_LEVELS,
        },
        'cost': rle_encode(cost),
        'roomIndex': rle_encode(room_index),
        'roomOrder': room_order,
        'rooms': rooms_out,
        'portals': portals,
        'unreachable': unreachable,
        'counts': {
            'walkableM2': round(float(reachable.sum()) * CELL_M * CELL_M, 1),
            'rooms': len(core['rooms']),
            'reachableRooms': len(rooms_out),
            'inferredPortals': len(portals),
        },
    }
    out_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))

    if preview:
        img = np.full((grid.h, grid.w, 3), 255, np.uint8)
        img[inside] = (236, 238, 241)
        shade = (cost.astype(np.float32) - 1) / (COST_LEVELS - 1)
        on = cost > 0
        img[on] = np.stack([150 + 80 * shade[on], 205 - 20 * shade[on], 160 - 40 * shade[on]], axis=-1).astype(np.uint8)
        img[walls | stands] = (30, 32, 44)
        img[glass] = (70, 140, 210)
        img[carved] = (230, 60, 60)
        Image.fromarray(img).resize((grid.w * 2, grid.h * 2), Image.NEAREST).save(preview)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--core', type=Path, default=GENERATED / 'ff01-campus-core.json')
    parser.add_argument('--detail', type=Path, default=GENERATED / 'ff01-campus-detail.json')
    parser.add_argument('--out', type=Path, default=GENERATED / 'ff01-nav-grid.json')
    parser.add_argument('--preview', type=Path, default=None, help='optional PNG of the grid, portals in red')
    args = parser.parse_args()
    result = build(args.core, args.detail, args.out, args.preview)
    c = result['counts']
    print(f"{args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}: "
          f"{result['width']}x{result['height']} cells, {c['walkableM2']} m2 walkable, "
          f"{c['reachableRooms']}/{c['rooms']} rooms reachable, {c['inferredPortals']} inferred portals")
    for p in result['portals']:
        print(f"  portal {p['roomId']}: {p['crossingM']} m at {p['centre']}")
    if result['unreachable']:
        print('  unreachable:', ', '.join(result['unreachable']))


if __name__ == '__main__':
    main()
