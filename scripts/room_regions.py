#!/usr/bin/env python3
"""Room regions for FF-01, derived from the drawing's own barriers.

A room is the enclosed free space that contains its label. Barriers are the CAD
walls, glazing, door leaves and swing arcs (which close door openings), and
long door-layer runs (folding partitions). Because glazing and folding partitions
sometimes divide a room and sometimes separate two rooms, every label is tried
against four barrier variants and five small gap-closing radii; the candidate that
does not swallow another room's label and is closest to the printed area wins.

Labels that share one open space (e.g. two dining areas) split it in proportion to
their printed areas. A few boundaries that the drawing shows only as dashed lines or
leaves open are closed with explicit rectangles, recorded as such.

Everything is a candidate (UNVERIFIED) until reviewed.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from shapely.geometry import LineString, MultiPoint, Point, Polygon, box, shape
from shapely.ops import unary_union

M_PER_PT = 0.10583333333333333
LEVELS = (0, 4.5, 6, 7.5, 9)           # gap-closing radii in pt (0.0 – 0.95 m)
MAX_ROOM_M2 = 700
LEAF_MAX_PT = 12                        # door leaves / short door lines; longer runs are tracks

# Boundaries the drawing does not close with solid lines (pdf display pt).
CLOSURES = {
    # A106 库房: bounded by a dashed line on its south side.
    'A106': ('DRAWING_DASHED_BOUNDARY', box(1638, 355, 1690, 402)),
    # 小剧场: open to the corridor on its north-east side (reviewed 2026-10-15).
    '小剧场': ('REVIEWER_DEFINED_CLOSURE', box(864, 1209, 948, 1332)),
}

# Named spaces without a room code that already exist in the product data.
PRODUCT_IDS = {
    '小剧场': 'THEATER-01', '西入口门厅': 'ENTRANCE-WEST', '东入口门厅': 'ENTRANCE-EAST',
    '南入口门厅': 'ENTRANCE-SOUTH', '创新区': 'INNOVATION-01', '茶室': 'TEA-ROOM-01',
}

NAMED_KINDS = [
    ('restroom', ('卫生间', '男卫', '女卫')),
    ('stair', ('楼梯间',)),
    ('entrance', ('门厅', '门斗')),
    ('garden', ('花园',)),
    ('hall', ('小剧场', '创新区')),
    ('dining', ('茶室',)),
    ('meeting', ('讨论室',)),
    ('service', ('机房', '配电', '配线', '设备', '储藏', '储物', '库', '热水器', '排烟', '通风', '清洁')),
]
CODE_RE = re.compile(r'^([MSA]\d{3}(?:-\d)?)\s*(.*)$')
AREA_RE = re.compile(r'^(\d+(?:\.\d+)?)\s*(?:m²|m2|㎡)$')
CJK_RE = re.compile(r'[一-鿿]')


def _comps(g):
    return list(g.geoms) if hasattr(g, 'geoms') else ([g] if not g.is_empty else [])


def _bezier(p0, p1, p2, p3, n=6):
    out = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


@dataclass
class Region:
    key: str                 # room code or text name
    point: tuple
    polygon: Polygon | None
    method: str
    variant: str | None = None
    close_pt: float | None = None
    area_ref: float | None = None
    shared_with: list = field(default_factory=list)

    @property
    def area_m2(self):
        return self.polygon.area * M_PER_PT ** 2 if self.polygon is not None else None


class RegionFinder:
    def __init__(self, drawings, wall_semantics, glazing_layers, wall_merge_pt, wall_faces, path_polylines):
        walls, glaz, doors, tracks = [], [], [], []
        for d in drawings:
            sem, layer = d['layerSemantic'], d['layer']
            if sem in wall_semantics:
                if d['type'] != 'fs':
                    walls += [LineString(l) for l in path_polylines(d) if len(l) >= 2]
            elif layer in glazing_layers:
                glaz += [LineString(l) for l in path_polylines(d) if len(l) >= 2]
            elif sem == 'Door' and layer != 'DOOR_FIRE_TEXT':
                for item in d['items']:
                    if item[0] == 'c':
                        doors.append(LineString(_bezier(*[tuple(q) for q in item[1:5]])))
                    elif item[0] == 'l':
                        ls = LineString([item[1], item[2]])
                        (doors if ls.length <= LEAF_MAX_PT else tracks).append(ls)
                    elif item[0] == 'poly':
                        ls = LineString([tuple(q) for q in item[1]] + [tuple(item[1][0])])
                        x0, y0, x1, y1 = ls.bounds
                        (doors if max(x1 - x0, y1 - y0) <= LEAF_MAX_PT else tracks).append(ls)
        wall_u = unary_union([l.buffer(wall_merge_pt, cap_style=2, join_style=2) for l in walls] + [f for f in wall_faces if f.is_valid])
        glaz_u = unary_union([l.buffer(0.6) for l in glaz])
        door_u = unary_union([l.buffer(0.5) for l in doors])
        track_u = unary_union([l.buffer(0.5) for l in tracks])
        self.variants = {
            'glass+tracks': unary_union([wall_u, glaz_u, door_u, track_u]),
            'glass': unary_union([wall_u, glaz_u, door_u]),
            'tracks': unary_union([wall_u, door_u, track_u]),
            'walls+doors': unary_union([wall_u, door_u]),
        }
        self.frame = box(*self.variants['glass+tracks'].bounds)
        self._faces = {}

    def faces(self, variant, close):
        key = (variant, close)
        if key not in self._faces:
            bar = self.variants[variant]
            if close:
                bar = bar.buffer(close, join_style=1).buffer(-close, join_style=1)
            self._faces[key] = [f for f in _comps(self.frame.difference(bar)) if f.area > 1]
        return self._faces[key]

    def face_at(self, variant, close, pt):
        P = Point(pt)
        fs = self.faces(variant, close)
        hit = next((f for f in fs if f.contains(P)), None)
        if hit is None:
            near = [f for f in fs if f.distance(P) < 4]
            hit = min(near, key=lambda f: f.distance(P)) if near else None
        return hit

    def best(self, pt, ref_m2, other_pts):
        cands = []
        for vi, variant in enumerate(self.variants):
            for close in LEVELS:
                f = self.face_at(variant, close, pt)
                if f is None or f.area * M_PER_PT ** 2 > MAX_ROOM_M2:
                    continue
                a = f.area * M_PER_PT ** 2
                swallowed = sum(1 for q in other_pts if f.contains(q))
                cands.append((swallowed > 0, a, variant, close, f, vi))
        if not cands:
            return None
        if ref_m2:
            return min(cands, key=lambda c: (c[0], round(abs(math.log(c[1] / ref_m2)), 2), c[5], c[3]))
        small = [c for c in cands if c[1] < 300]
        return min(small or cands, key=lambda c: (c[0], c[5], c[3]))


def _split_by_area(face, members):
    """Split one open space among several labels, in proportion to their printed areas,
    with cuts across the axis along which the labels are spread."""
    pts = [m.point for m in members]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    axis = 0 if (max(xs) - min(xs)) >= (max(ys) - min(ys)) else 1
    order = sorted(members, key=lambda m: m.point[axis])
    weights = [m.area_ref or 1 for m in order]
    total_area = face.area
    x0, y0, x1, y1 = face.bounds
    lo, hi = (x0, x1) if axis == 0 else (y0, y1)
    pieces, start, acc = {}, lo, 0.0
    for i, m in enumerate(order):
        acc += weights[i] / sum(weights)
        if i == len(order) - 1:
            end = hi
        else:  # bisect the cut position for the target cumulative area
            a, b = start, hi
            for _ in range(40):
                mid = (a + b) / 2
                part = face.intersection(box(lo, y0, mid, y1) if axis == 0 else box(x0, lo, x1, mid)).area
                a, b = (mid, b) if part < acc * total_area else (a, mid)
            end = (a + b) / 2
        strip = box(start, y0, end, y1) if axis == 0 else box(x0, start, x1, end)
        piece = face.intersection(strip)
        pieces[m.key] = max(_comps(piece), key=lambda g: g.area) if not piece.is_empty else None
        start = end
    return pieces


def read_text_lines(page):
    import pymupdf
    matrix = page.rotation_matrix
    lines = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            if text:
                r = pymupdf.Rect(line['bbox']) * matrix
                lines.append({'t': text, 'c': ((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), 'dir': tuple(round(v, 3) for v in line['dir'])})
    return lines


def named_spaces(lines, known_codes):
    """Rooms written as text only: a name with a printed area below it, a known public
    space keyword, or a room code fused with its name (e.g. "M109教室")."""
    out = []
    for i, l in enumerate(lines):
        t = l['t'].replace(' ', '')
        m = CODE_RE.match(t)
        if m and m.group(1) not in known_codes and CJK_RE.search(m.group(2) or ''):
            area = _area_below(lines, l)
            out.append({'key': m.group(1), 'name': m.group(2), 'pt': l['c'], 'area': area, 'coded': True})
            continue
        if not CJK_RE.search(t) or CODE_RE.match(t):
            continue
        kind = next((k for k, words in NAMED_KINDS if any(w in t for w in words)), None)
        area = _area_below(lines, l)
        if kind is None and area is None:
            continue
        name = re.sub(r'\s*\d+$', '', l['t'].strip()) if kind in ('service', 'restroom') else l['t'].strip()
        out.append({'key': t, 'name': name, 'pt': l['c'], 'area': area, 'kind': kind or 'room', 'coded': False})
    return out


def _area_below(lines, l):
    best = None
    for o in lines:
        if o is l or o['dir'] != l['dir']:
            continue
        dx, dy = o['c'][0] - l['c'][0], o['c'][1] - l['c'][1]
        if abs(dx) < 14 and 2 < dy < 14:
            m = AREA_RE.match(o['t'].replace(' ', ''))
            if m and (best is None or dy < best[0]):
                best = (dy, float(m.group(1)))
    return best[1] if best else None


def derive_regions(finder: RegionFinder, coded_labels: dict, coded_area: dict, extra: list):
    """coded_labels: code -> pdf point; coded_area: code -> printed m² (or None);
    extra: named_spaces() output. Returns (coded Region dict, named Region list)."""
    all_pts = {k: Point(v) for k, v in coded_labels.items()}
    for e in extra:
        if e['coded']:
            all_pts[e['key']] = Point(e['pt'])

    regions: dict[str, Region] = {}
    for code, pt in list(coded_labels.items()) + [(e['key'], e['pt']) for e in extra if e['coded']]:
        ref = coded_area.get(code) if code in coded_area else next((e['area'] for e in extra if e['key'] == code), None)
        if code in CLOSURES:
            method, rect = CLOSURES[code]
            poly = max(_comps(rect.difference(finder.variants['glass+tracks'])), key=lambda g: g.area)
            regions[code] = Region(code, pt, poly, method, area_ref=ref)
            continue
        others = [q for k, q in all_pts.items() if k != code]
        hit = finder.best(pt, ref, others)
        if hit is None:
            regions[code] = Region(code, pt, None, 'NO_ENCLOSED_SPACE', area_ref=ref)
        else:
            _, _, variant, close, face, _ = hit
            regions[code] = Region(code, pt, face, 'WALL_ENCLOSED', variant, close, ref)

    # Labels that ended up in the same open space share it by printed area.
    groups: dict[bytes, list[Region]] = {}
    for r in regions.values():
        if r.polygon is not None and r.method == 'WALL_ENCLOSED':
            groups.setdefault(r.polygon.wkb, []).append(r)
    for members in groups.values():
        if len(members) < 2:
            continue
        face = members[0].polygon
        pieces = _split_by_area(face, members)
        for m in members:
            m.polygon = pieces.get(m.key)
            m.method = 'SHARED_SPACE_SPLIT_BY_AREA'
            m.shared_with = [o.key for o in members if o is not m]

    taken = unary_union([r.polygon for r in regions.values() if r.polygon is not None])
    named: list[Region] = []
    used_faces = set()
    for e in extra:
        if e['coded']:
            continue
        if e['key'] in CLOSURES:
            method, rect = CLOSURES[e['key']]
            poly = max(_comps(rect.difference(finder.variants['glass+tracks'])), key=lambda g: g.area)
            r = Region(e['key'], e['pt'], poly, method, area_ref=e['area'])
        else:
            hit = finder.best(e['pt'], e['area'], list(all_pts.values()))
            if hit is None or hit[0]:
                continue
            _, a, variant, close, face, _ = hit
            if a < 1:
                continue  # a sliver between fixtures, not a room
            if e['area'] and abs(math.log(a / e['area'])) > 0.35:
                continue  # the enclosed space does not match the printed area: not this room
            if not e['area'] and a > 400:
                continue
            if face.intersection(taken).area > 0.3 * face.area or face.wkb in used_faces:
                continue
            used_faces.add(face.wkb)
            r = Region(e['key'], e['pt'], face, 'WALL_ENCLOSED', variant, close, e['area'])
        r.name = e['name']
        r.kind = e.get('kind', 'room')
        named.append(r)
        taken = taken.union(r.polygon)
    return regions, named
