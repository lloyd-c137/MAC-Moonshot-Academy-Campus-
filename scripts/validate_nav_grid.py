#!/usr/bin/env python3
"""Validate src/generated/ff01-nav-grid.json against the campus model it was built from."""
from __future__ import annotations

import base64
import json
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / 'src' / 'generated'
MAX_PORTALS = 12            # a jump here means the wall model lost many door gaps; inspect before shipping
MAX_PORTAL_CROSSING_M = 1.6


def rle_decode(b64: str, size: int) -> bytearray:
    raw = base64.b64decode(b64)
    out = bytearray()
    for i in range(0, len(raw), 2):
        out += bytes([raw[i]]) * raw[i + 1]
    if len(out) != size:
        raise AssertionError(f'RLE size {len(out)} != {size}')
    return out


def main() -> int:
    core = json.loads((GENERATED / 'ff01-campus-core.json').read_text())
    nav = json.loads((GENERATED / 'ff01-nav-grid.json').read_text())
    failures: list[str] = []
    check = lambda ok, msg: ok or failures.append(msg)

    check(nav['sourceModelID'] == core['modelID'], 'grid was built from a different campus model')
    w, h = nav['width'], nav['height']
    cost = rle_decode(nav['cost'], w * h)
    room_index = rle_decode(nav['roomIndex'], w * h)
    check(max(cost) <= nav['parameters']['costLevels'], 'cost value out of range')
    check(max(room_index) <= len(nav['roomOrder']), 'room index out of range')
    check(all(cost[i] for i in range(w * h) if room_index[i]), 'room index set on a blocked cell')

    room_ids = {r['id'] for r in core['rooms']}
    check(set(nav['rooms']) == room_ids, f"rooms without an anchor: {sorted(room_ids - set(nav['rooms']))}")
    check(not nav['unreachable'], f"unreachable rooms: {nav['unreachable']}")

    # Every anchor must be reachable from every other one, using the browser's movement
    # rule (8-connected, no diagonal squeeze past a wall corner).
    anchors = {rid: z * w + x for rid, (x, z) in nav['rooms'].items()}
    for rid, i in anchors.items():
        check(cost[i] > 0, f'{rid}: anchor on a blocked cell')
    start = next(iter(anchors.values()))
    seen = bytearray(w * h)
    seen[start] = 1
    queue = deque([start])
    while queue:
        i = queue.popleft()
        x, z = i % w, i // w
        for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, nz = x + dx, z + dz
            if not (0 <= nx < w and 0 <= nz < h):
                continue
            j = nz * w + nx
            if seen[j] or not cost[j]:
                continue
            if dx and dz and not (cost[z * w + nx] and cost[nz * w + x]):
                continue
            seen[j] = 1
            queue.append(j)
    disconnected = sorted(rid for rid, i in anchors.items() if not seen[i])
    check(not disconnected, f'anchors not connected to the rest: {disconnected}')

    check(len(nav['portals']) <= MAX_PORTALS, f"{len(nav['portals'])} inferred portals (limit {MAX_PORTALS})")
    for p in nav['portals']:
        check(p['crossingM'] <= MAX_PORTAL_CROSSING_M, f"{p['roomId']}: portal crossing {p['crossingM']} m")
        check(p['method'] == 'INFERRED_FROM_DOOR_LAYER', f"{p['roomId']}: unknown portal method")

    walkable_m2 = sum(1 for c in cost if c) * nav['cellM'] ** 2
    footprint_m2 = 15616  # docs/CAMPUS_3D_MODEL.md
    check(0.6 * footprint_m2 < walkable_m2 < 0.95 * footprint_m2, f'walkable area {walkable_m2:.0f} m2 is implausible')

    if failures:
        print('FAIL')
        for f in failures:
            print('  -', f)
        return 1
    print(f"OK: {len(anchors)} rooms connected, {walkable_m2:.0f} m2 walkable, {len(nav['portals'])} inferred portals "
          f"({', '.join(p['roomId'] for p in nav['portals'])})")
    return 0


if __name__ == '__main__':
    sys.exit(main())
