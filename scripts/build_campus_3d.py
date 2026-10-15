#!/usr/bin/env python3
"""Build the FF-01 3D campus model consumed by the main campus map.

Everything spatial comes from FF-01 itself:
  * walls      – CAD wall layers (existing walls, partitions, architectural
                 walls, shear walls / columns). Double-line walls are merged
                 into solid bodies by a small buffer + union; door openings
                 stay open because the CAD wall lines are broken there.
  * glazing    – CAD glazing / window layers.
  * rooms      – V9 room candidate polygons (unchanged) + names / areas read
                 from the room-label text blocks of the source PDF.
  * arena      – V9 court-boundary and 572 seat-footprint candidates.
  * floor lines– furniture, doors, stairs, equipment and court markings drawn
                 flat on the floor.
  * footprint  – morphological closing of the wall union (DERIVED, not traced).

Heights are illustrative (single storey, no section drawing is available).
Nothing here is promoted to DRAWING_VERIFIED; the output records that.

Usage: python3 scripts/build_campus_3d.py [--pdf FF-01.pdf]
"""
from __future__ import annotations

import argparse, base64, gzip, hashlib, json, math, re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from shapely.geometry import LineString, MultiPolygon, Polygon, shape
from shapely.ops import unary_union

from room_regions import PRODUCT_IDS, RegionFinder, derive_regions, named_spaces, read_text_lines

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"
GENERATED = ROOT / "src/generated"
OUT = GENERATED / "ff01-campus-core.json"      # walls, rooms, arena: needed for the first frame
DETAIL_OUT = GENERATED / "ff01-campus-detail.json"  # floor lines: loaded after the first frame
ROOMS_TS = ROOT / "src/data/sourceRooms.ts"

M_PER_PT = 0.10583333333333333           # 1:300, existing V6 calibration
GRID_MIN = (461.72, 304.72)
GRID_MAX = (1728.92, 1398.88)
CENTER = ((GRID_MIN[0] + GRID_MAX[0]) / 2, (GRID_MIN[1] + GRID_MAX[1]) / 2)
PLAN_SCALE = 1000 / (GRID_MAX[0] - GRID_MIN[0])  # legacy 0..1000 plan units

WALL_HEIGHT_M = 2.8  # matches V9 illustrative3D.wallHeightM
GLAZING_SILL_M = 0.0
WALL_SEMANTICS = {"Existing Wall", "New Partition", "Architectural Wall", "Structural Wall / Column"}
GLAZING_LAYERS = {"T-CC+C1-0.00$0$GLAZ", "玻璃隔断", "WINDOW", "P04-窗户"}
WALL_MERGE_RADIUS_PT = 1.05   # per-side buffer: merges double lines up to ~0.22 m apart
GLAZING_RADIUS_PT = 0.45
FOOTPRINT_CLOSING_PT = 28.0   # bridges entrance gaps up to ~5.9 m

FLOOR_LINE_GROUPS = {
    "furniture": {"Furniture", "Equipment"},
    "doors": {"Door"},
    "stairs": {"Stair"},
    "court": set(),
}
COURT_LINE_LAYERS = {"T-CC-SEAT-L1$0$FIELD-FACI", "T-CC-SEAT-L1$0$FIELD-DIVE", "T-CC-SEAT-L1$0$FIELD-AXIS",
                     "T-CC-SEAT-L1$0$FIELD", "T-CC-SEAT-L1$0$RAIL", "T-CC-SEAT-L1$0$stand", "T-CC-SEAT-L1$0$outl"}
SKIP_FLOOR_LAYERS = {"DOOR_FIRE_TEXT"}


def world(pt):
    return ((pt[0] - CENTER[0]) * M_PER_PT, (pt[1] - CENTER[1]) * M_PER_PT)


def plan(pt):
    return ((pt[0] - GRID_MIN[0]) * PLAN_SCALE, (pt[1] - GRID_MIN[1]) * PLAN_SCALE)


def r2(v):
    return round(v, 2)


def bezier(p0, p1, p2, p3, n=8):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3; b = 3 * (1 - t) ** 2 * t; c = 3 * (1 - t) * t * t; d = t ** 3
        out.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return out


def path_polylines(drawing, curve_steps=8):
    """Return a list of point sequences (pdf display pt) for one CAD path."""
    lines = []
    for item in drawing["items"]:
        kind = item[0]
        if kind == "l":
            lines.append([tuple(item[1]), tuple(item[2])])
        elif kind == "c":
            lines.append(bezier(*[tuple(p) for p in item[1:5]], n=curve_steps))
        elif kind == "poly":
            pts = [tuple(p) for p in item[1]]
            lines.append(pts + [pts[0]])
    return lines


def ring_world(ring):
    pts = [tuple(map(r2, world(p))) for p in ring]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return [list(p) for p in pts]


def _export(poly: Polygon):
    return {"o": ring_world(poly.exterior.coords), "h": [ring_world(i.coords) for i in poly.interiors if Polygon(i).area > 0.05]}


def polys_world(poly: Polygon, simplify_pt=0.12):
    """Simplify, round to cm in world metres, and repair anything rounding broke."""
    poly = poly.simplify(simplify_pt, preserve_topology=True)
    if poly.is_empty or poly.area < 0.05:
        return []
    out = _export(poly)
    rounded = Polygon(out["o"], out["h"])
    if rounded.is_valid:
        return [out]
    repaired = []
    for part in polys(rounded.buffer(0)):
        part = Polygon([(round(x, 2), round(z, 2)) for x, z in part.exterior.coords],
                       [[(round(x, 2), round(z, 2)) for x, z in i.coords] for i in part.interiors])
        if part.is_valid and part.area > 0.0006:
            repaired.append({"o": [list(c) for c in part.exterior.coords[:-1]], "h": [[list(c) for c in i.coords[:-1]] for i in part.interiors]})
    return repaired


def poly_world(poly: Polygon, simplify_pt=0.12):
    parts = polys_world(poly, simplify_pt)
    return max(parts, key=lambda p: Polygon(p["o"], p["h"]).area) if parts else None


def polys(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def pack_polylines(polylines, min_length_cm=4):
    """Delta-encoded centimetre polylines: [n, x0, z0, dx1, dz1, ..., n, ...].

    Shared endpoints are stored once and small integers compress well, so this is
    several times smaller over the wire than one record per segment.
    """
    flat, count, segments = [], 0, 0
    for line in polylines:
        pts = []
        for p in line:
            x, z = world(p)
            q = (round(x * 100), round(z * 100))
            if not pts or pts[-1] != q:
                pts.append(q)
        if len(pts) < 2:
            continue
        length = sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in zip(pts, pts[1:]))
        if length < min_length_cm:
            continue
        flat.append(len(pts))
        flat.extend(pts[0])
        for a, b in zip(pts, pts[1:]):
            flat.extend((b[0] - a[0], b[1] - a[1]))
        count += 1
        segments += len(pts) - 1
    return {"polylines": count, "segments": segments, "deltaCm": flat}


# ---------------------------------------------------------------- room names
NAME_KINDS = [
    ("dining", ("餐厅",)),
    ("library", ("图书馆", "阅览", "阅读", "自习")),
    ("lab", ("实验室", "科创", "创客", "准备室")),
    ("creative", ("艺术", "音乐", "设计", "厨艺", "录音", "计算机", "工作坊", "一小步")),
    ("meeting", ("会议", "接待", "对话")),
    ("hall", ("多功能厅", "活动室")),
    ("office", ("办公", "校长", "中心", "护士", "隔离", "监控", "体育组", "咨询")),
    ("service", ("库", "储藏", "机房", "配电", "扩音", "灯光")),
    ("classroom", ("教室", "书院", "语言学习")),
]
AREA_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*(?:m²|m2|㎡)?$")
CJK_RE = re.compile(r"[一-鿿]")


def kind_for(name):
    for kind, words in NAME_KINDS:
        if any(w in name for w in words):
            return kind
    return "room"


def read_label_blocks(pdf_path, label_points):
    import pymupdf
    doc = pymupdf.open(pdf_path)
    page = doc[0]
    matrix = page.rotation_matrix
    lines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line["spans"]).strip()
            if not text:
                continue
            rect = pymupdf.Rect(line["bbox"]) * matrix
            lines.append({"t": text, "c": ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2), "dir": tuple(round(v, 3) for v in line["dir"])})
    known_ids = set(label_points)
    result = {}
    for rid, (x, y) in label_points.items():
        hits = sorted((l for l in lines if l["t"].replace(" ", "") == rid), key=lambda l: math.hypot(l["c"][0] - x, l["c"][1] - y))
        anchor = hits[0] if hits and math.hypot(hits[0]["c"][0] - x, hits[0]["c"][1] - y) < 12 else {"c": (x, y), "dir": (0.0, 1.0)}
        def near(radius, same_dir=True):
            rows = [l for l in lines if l is not anchor and l["t"].replace(" ", "") not in known_ids
                    and (not same_dir or l["dir"] == anchor["dir"])
                    and math.hypot(l["c"][0] - anchor["c"][0], l["c"][1] - anchor["c"][1]) < radius]
            return sorted(rows, key=lambda l: math.hypot(l["c"][0] - anchor["c"][0], l["c"][1] - anchor["c"][1]))
        rows = near(20)
        name = next((l["t"] for l in rows if CJK_RE.search(l["t"])), None)
        name_source = "PDF_LABEL_BLOCK"
        if not name:
            name = next((l["t"] for l in near(26, same_dir=False) if CJK_RE.search(l["t"]) and len(l["t"]) >= 2), None)
            name_source = "PDF_NEARBY_TEXT_LOW_CONFIDENCE" if name else "NONE"
        area = None
        for l in rows[:3]:
            m = AREA_RE.match(l["t"].replace(" ", ""))
            if m:
                area = float(m.group(1)); break
        result[rid] = {"name": name, "nameSource": name_source, "areaM2Label": area}
    return result


# --------------------------------------------------------------------- build
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=Path, default=None)
    args = parser.parse_args()

    vectors = json.loads(gzip.decompress((SOURCE / "ff01-vectors.json.gz").read_bytes()))
    summary = vectors["summary"]
    v9 = json.loads((ROOT / "public/ff01-architecture-v9.json").read_text())
    drawings = vectors["cadDrawings"]

    pdf_path = args.pdf or Path(summary["sourcePdf"])
    if not pdf_path.is_file():
        raise SystemExit(f"FF-01 PDF not found: {pdf_path} (pass --pdf)")
    pdf_sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    if pdf_sha != summary["sourcePdfSha256"]:
        raise SystemExit("FF-01 PDF hash mismatch; refusing to build from a different drawing")

    # ---- walls
    wall_lines, wall_faces, glazing_lines, wall_path_ids = [], [], [], set()
    floor_lines = {k: [] for k in FLOOR_LINE_GROUPS}
    for d in drawings:
        sem, layer = d["layerSemantic"], d["layer"]
        if sem in WALL_SEMANTICS:
            wall_path_ids.add(d["sourcePathID"])
            if d["type"] == "fs":
                continue  # polygonized below from V9 wall-face candidates
            for line in path_polylines(d):
                if len(line) >= 2:
                    wall_lines.append(LineString(line))
        elif layer in GLAZING_LAYERS:
            for line in path_polylines(d):
                if len(line) >= 2:
                    glazing_lines.append(LineString(line))
        elif layer in COURT_LINE_LAYERS:
            floor_lines["court"].extend(path_polylines(d, curve_steps=4))
        elif layer not in SKIP_FLOOR_LAYERS:
            for group, sems in FLOOR_LINE_GROUPS.items():
                if sem in sems:
                    floor_lines[group].extend(path_polylines(d, curve_steps=4))
    for face in v9["wallNetwork"]["wallFaceCandidates"]:
        g = shape(face["geometry"])
        if g.is_valid and not g.is_empty:
            wall_faces.append(g)

    wall_union = unary_union([l.buffer(WALL_MERGE_RADIUS_PT, cap_style=2, join_style=2) for l in wall_lines] + wall_faces)
    wall_union = wall_union.buffer(0)
    glazing_union = unary_union([l.buffer(GLAZING_RADIUS_PT, cap_style=2, join_style=2) for l in glazing_lines]).difference(wall_union)

    # ---- footprint (derived)
    closed = unary_union([wall_union, glazing_union]).buffer(FOOTPRINT_CLOSING_PT, join_style=2).buffer(-FOOTPRINT_CLOSING_PT, join_style=2)
    footprint = max(polys(closed), key=lambda p: p.area)
    footprint = Polygon(footprint.exterior).simplify(0.5)

    # ---- rooms: regions derived from the drawing's walls, glass and doors (see room_regions.py)
    import pymupdf
    label_points = {s["sourceRoomID"]: tuple(s["sourceLabelPt"]) for s in v9["spaces"]}
    labels = read_label_blocks(pdf_path, label_points)
    text_lines = read_text_lines(pymupdf.open(pdf_path)[0])
    extra = named_spaces(text_lines, set(label_points))
    finder = RegionFinder(drawings, WALL_SEMANTICS, GLAZING_LAYERS, WALL_MERGE_RADIUS_PT, wall_faces, path_polylines)
    coded, named = derive_regions(finder, label_points, {k: v["areaM2Label"] for k, v in labels.items()}, extra)

    def room_record(rid, name, name_source, kind, series, area_label, region, code):
        poly = region.polygon
        lx, lz = world(region.point)
        px, py = plan(region.point)
        status = {
            "WALL_ENCLOSED": "WALL_ENCLOSED_CANDIDATE",
            "SHARED_SPACE_SPLIT_BY_AREA": "SHARED_SPACE_SPLIT_CANDIDATE",
            "DRAWING_DASHED_BOUNDARY": "DASHED_BOUNDARY_CANDIDATE",
            "REVIEWER_DEFINED_CLOSURE": "REVIEWER_DEFINED_CLOSURE",
            "NO_ENCLOSED_SPACE": "NO_POLYGON_LABEL_ONLY",
        }[region.method]
        return {
            "id": rid, "code": code, "name": name, "nameSource": name_source, "kind": kind, "series": series,
            "areaM2Label": area_label,
            "areaM2Polygon": round(poly.area * M_PER_PT ** 2, 1) if poly is not None else None,
            "label": [r2(lx), r2(lz)], "labelPlan": [round(px, 2), round(py, 2)],
            "polygon": poly_world(poly, 0.05) if poly is not None else None,
            "geometryStatus": status if poly is not None else "NO_POLYGON_LABEL_ONLY",
            "regionMethod": {"barrierVariant": region.variant, "gapClosingPt": region.close_pt, "sharedWith": region.shared_with} if poly is not None else None,
        }

    rooms = []
    for rid in label_points:
        info = labels[rid]
        name = info["name"] or f"房间 {rid}"
        rooms.append(room_record(rid, name, info["nameSource"], kind_for(name), rid[0], info["areaM2Label"], coded[rid], rid))
    for e in extra:  # codes written together with their name, e.g. "M109教室"
        if e["coded"]:
            rooms.append(room_record(e["key"], e["name"], "PDF_FUSED_CODE_AND_NAME", kind_for(e["name"]), e["key"][0], e["area"], coded[e["key"]], e["key"]))

    counters = {}
    PUBLIC_KIND = {"restroom": "restroom", "stair": "stair", "entrance": "public", "garden": "garden", "hall": "hall", "dining": "dining", "meeting": "meeting", "service": "service", "room": "room"}
    PREFIX = {"restroom": "WC", "stair": "STAIR", "entrance": "HALL", "garden": "GARDEN", "service": "SVC", "meeting": "ROOM", "hall": "HALL", "dining": "ROOM", "room": "ROOM"}
    for r in sorted(named, key=lambda r: (r.point[1], r.point[0])):
        name = {"男卫": "男卫生间", "女卫": "女卫生间"}.get(r.name, r.name)
        rid = PRODUCT_IDS.get(r.name)
        if rid is None and r.name.startswith("花园"):
            rid = "COURTYARD-01" if r.point[1] < CENTER[1] else "COURTYARD-02"
        if rid is None:
            prefix = PREFIX[r.kind]
            counters[prefix] = counters.get(prefix, 0) + 1
            rid = f"{prefix}-{counters[prefix]:02d}"
        rooms.append(room_record(rid, name, "PDF_ROOM_TEXT", PUBLIC_KIND[r.kind], "SERVICE" if r.kind in ("service", "restroom", "stair") else "PUBLIC", r.area_ref, r, None))
    # Open public spaces with product pages (entrance halls, 创新区, 茶室) have no enclosing walls;
    # keep them as located labels so search and selection land on the right spot.
    from room_regions import Region
    have = {r["id"] for r in rooms}
    for e in extra:
        rid = PRODUCT_IDS.get(e["name"])
        if rid and rid not in have:
            rooms.append(room_record(rid, e["name"], "PDF_ROOM_TEXT", "public", "PUBLIC", e["area"], Region(e["key"], e["pt"], None, "NO_ENCLOSED_SPACE"), None))
            have.add(rid)
    corridors = []  # corridors are the building floor; no separate candidate polygons
    # The slab must contain every room region (e.g. A106, whose outer side is a dashed line).
    room_polys = [r.polygon for r in list(coded.values()) + list(named) if r.polygon is not None]
    grown = unary_union([footprint] + [p.buffer(0.5) for p in room_polys])
    footprint = Polygon(max(polys(grown), key=lambda p: p.area).exterior).simplify(0.5)

    # ---- arena
    arena = v9["arena"]
    court = unary_union([shape(c["geometry"]) for c in arena["courtBoundaryCandidates"]])
    court_hull = court.convex_hull
    seats = []
    seat_polys = [shape(s["geometry"]) for s in arena["seatFootprintCandidates"]]
    dists = [court_hull.exterior.distance(p.centroid) for p in seat_polys]
    # Seat rows: quantize distance from the court edge by the dominant row pitch.
    row_pitch = 7.6  # pt (~0.8 m) — median spacing between successive seat rows on FF-01
    d0 = min(dists)
    for p, dist in zip(seat_polys, dists):
        row = int(round((dist - d0) / row_pitch))
        seats.append({"p": ring_world(p.exterior.coords), "row": row})
    stand_blocks = unary_union([p.buffer(2.2, join_style=2) for p in seat_polys]).buffer(-1.2, join_style=2)

    # ---- bounds
    minx, miny, maxx, maxy = footprint.bounds
    out = {
        "schemaVersion": 1,
        "modelID": "FF01-CAMPUS-3D-V1",
        "status": "SOURCE_DERIVED_3D_UNVERIFIED",
        "statement": "Walls, glazing, rooms, seats and floor detail are generated from FF-01 CAD vectors and V9 candidates. Heights are illustrative; nothing is DRAWING_VERIFIED.",
        "source": {"drawing": "FF-01", "sourcePdfSha256": pdf_sha, "v9ModelID": v9["modelID"], "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds")},
        "frame": {"units": "m", "origin": "FF-01 grid centre", "originPdfPt": list(CENTER), "metresPerPdfPoint": M_PER_PT, "axes": {"x": "east", "y": "up", "z": "south"}},
        "heights": {"wallM": WALL_HEIGHT_M, "glazingSillM": GLAZING_SILL_M, "seatRowRiseM": 0.38, "seatBaseM": 0.45, "measured": False},
        "bounds": [r2(world((minx, miny))[0]), r2(world((minx, miny))[1]), r2(world((maxx, maxy))[0]), r2(world((maxx, maxy))[1])],
        "footprint": {"polygon": poly_world(footprint, 0.5), "method": f"morphological closing ({FOOTPRINT_CLOSING_PT} pt) of the source wall union", "status": "DERIVED_UNVERIFIED"},
        "walls": [w for p in polys(wall_union) for w in polys_world(p)],
        "glazing": [w for p in polys(glazing_union) for w in polys_world(p)],
        "rooms": rooms,
        "corridors": corridors,
        "arena": {
            "court": [ring_world(p.exterior.coords) for p in polys(court)],
            "seats": seats,
            "standBlocks": [w for p in polys(stand_blocks) for w in polys_world(p, 0.3)],
            "seatCount": len(seats),
        },
        "counts": {"wallSourcePaths": len(wall_path_ids), "wallLineObjects": len(wall_lines), "wallFaceObjects": len(wall_faces),
                   "wallBodies": len(polys(wall_union)), "glazingBodies": len(polys(glazing_union)),
                   "roomsWithPolygon": sum(1 for r in rooms if r["polygon"]), "roomLabels": len(rooms), "seats": len(seats)},
    }
    GENERATED.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    detail = {"modelID": out["modelID"], "frame": out["frame"], "floorLines": {k: pack_polylines(v) for k, v in floor_lines.items()}}
    DETAIL_OUT.write_text(json.dumps(detail, separators=(",", ":")))

    # Static room index for search / detail panel (no geometry).
    ts_rows = [{k: r[k] for k in ("id", "code", "name", "kind", "series", "areaM2Label", "areaM2Polygon", "labelPlan", "geometryStatus")} for r in rooms]
    ROOMS_TS.write_text(
        "// Generated by scripts/build_campus_3d.py from FF-01; do not hand edit.\n"
        "export type SourceRoomKind = " + " | ".join(sorted({f"'{k}'" for k, _ in NAME_KINDS} | {"'room'", "'restroom'", "'stair'", "'public'", "'garden'"})) + ";\n"
        "export interface SourceRoom { id: string; code: string | null; name: string; kind: SourceRoomKind; series: string; areaM2Label: number | null; areaM2Polygon: number | null; labelPlan: [number, number]; geometryStatus: string }\n"
        f"export const SOURCE_ROOMS: SourceRoom[] = {json.dumps(ts_rows, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8")
    print(json.dumps(out["counts"], ensure_ascii=False))
    print("footprint m²", round(footprint.area * M_PER_PT ** 2), "bounds m", out["bounds"])
    print("seat rows", sorted({s['row'] for s in seats}))
    print("coded rooms", sum(1 for r in rooms if r["code"]), "named spaces", sum(1 for r in rooms if not r["code"]), "with polygon", sum(1 for r in rooms if r["polygon"]))
    print("without name", [r["id"] for r in rooms if r["name"].startswith("房间 ")], "low confidence", [(r["id"], r["name"]) for r in rooms if r["nameSource"] == "PDF_NEARBY_TEXT_LOW_CONFIDENCE"])
    print("label only", [r["id"] for r in rooms if not r["polygon"]])
    print("bytes core", OUT.stat().st_size, "detail", DETAIL_OUT.stat().st_size)


if __name__ == "__main__":
    main()
