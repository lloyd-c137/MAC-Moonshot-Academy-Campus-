#!/usr/bin/env python3
"""Polygonize CAD-layer-filtered wall candidates for two review pilots.

Outputs are suggestions only. Polygonization cannot establish room semantics,
door connectivity, or source accuracy without independent review.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
from pathlib import Path

from shapely import set_precision
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, unary_union

WALL_SEMANTICS = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall"}
PILOTS = {
    "pilot-a-m102-m103-m104": {"ids": ["M102", "M103", "M104"], "bbox": [590, 1090, 805, 1310]},
    "pilot-b-arena-ring": {"ids": ["S208", "S209", "S210"], "bbox": [735, 535, 1040, 760]},
}


def path_lines(path: dict) -> list[LineString]:
    result: list[LineString] = []
    current = None
    for item in path.get("items", []):
        kind, *values = item
        if kind == "l" and len(values) == 2:
            a, b = values
            if a != b: result.append(LineString([a, b]))
            current = b
        elif kind == "c" and len(values) == 3:
            if current is None: continue
            p0, p1, p2, p3 = current, values[0], values[1], values[2]
            points = []
            for i in range(13):
                t = i / 12; u = 1 - t
                points.append((u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],
                               u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]))
            result.append(LineString(points)); current = p3
        elif kind == "poly" and values and values[0]:
            pts = values[0]
            if len(pts) > 1: result.append(LineString([*pts, pts[0]]))
            current = pts[-1]
    return result


def svg_path(line: LineString) -> str:
    if line.geom_type in ("MultiLineString", "GeometryCollection"):
        return "".join(svg_path(part) for part in line.geoms if part.geom_type == "LineString")
    coords = list(line.coords)
    if not coords: return ""
    d = f"M {coords[0][0]:.3f} {coords[0][1]:.3f} " + " L ".join(f"{x:.3f} {y:.3f}" for x, y in coords[1:])
    return f'<path d="{d}" fill="none" stroke="#c54b36" stroke-width="0.8"/>'


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    repo = args.repo.resolve(); source = repo / "data/source"; out = source / "pilots"
    out.mkdir(parents=True, exist_ok=True)
    with gzip.open(source / "ff01-vectors.json.gz", "rt", encoding="utf-8") as stream:
        vectors = json.load(stream)
    structural = [d for d in vectors["cadDrawings"] if d["layerSemantic"] in WALL_SEMANTICS]
    lines = [(path, line) for path in structural for line in path_lines(path)]
    # 0.1 pt is about 10.6 mm in world scale at 1:300. This only nodes near-coincident linework; it never closes door gaps.
    merged = unary_union([line for _, line in lines])
    merged = set_precision(merged, 0.1)
    faces = list(polygonize(merged))
    with (source / "ROOM_MANIFEST.csv").open(encoding="utf-8-sig", newline="") as stream:
        labels = list(csv.DictReader(stream))
    by_id = {}
    for label in labels:
        by_id.setdefault(label["SourceRoomLabel"], []).append(Point(float(label["SourceLabelXPt"]), float(label["SourceLabelYPt"])))

    summary = {"sourcePdfSha256": vectors["summary"]["sourcePdfSha256"], "sourceDrawingCount": len(vectors["cadDrawings"]),
               "wallLayerPathCount": len(structural), "primitiveLineCount": len(lines), "polygonizeFaceCount": len(faces),
               "snapGridPt": 0.1, "doorLayerUsedToCloseFaces": False,
               "status": "IMPLEMENTED_BUT_UNVERIFIED", "reason": "CAD layer and wall geometry produce candidate planar faces; labels and room/corridor semantics need visual human approval."}
    pilot_rows = []
    for name, config in PILOTS.items():
        clip = box(*config["bbox"])
        candidate_faces = [face for face in faces if face.area > 150 and face.intersects(clip)]
        records = []
        for room_id in config["ids"]:
            for occurrence, anchor in enumerate(by_id.get(room_id, []), 1):
                containing = sorted([face for face in candidate_faces if face.covers(anchor)], key=lambda f: f.area)
                candidate = containing[0] if containing else None
                if candidate is not None:
                    coords = [[round(x, 3), round(y, 3)] for x, y in list(candidate.exterior.coords)]
                    source_ids = sorted(path["id"] for path in structural if any(line.distance(candidate.boundary) <= 0.2 for line in path_lines(path)))
                    records.append({"id": room_id if occurrence == 1 else f"{room_id}#{occurrence}", "sourceLabel": room_id,
                                    "labelPointPt": [round(anchor.x, 3), round(anchor.y, 3)], "polygonPt": coords,
                                    "areaM2IllustrativeScale": round(candidate.area * (0.105833333**2), 3),
                                    "boundsPt": [round(x,3) for x in candidate.bounds], "geometryStatus": "SUGGESTED_UNVERIFIED",
                                    "confidence": "CANDIDATE", "sourcePathIDs": source_ids,
                                    "issues": ["Face derived from filtered CAD wall linework; door closures are not inferred.", "Room-label containment is a candidate association, not verification."]})
                else:
                    records.append({"id": room_id, "sourceLabel": room_id, "labelPointPt": [round(anchor.x,3),round(anchor.y,3)],
                                    "polygonPt": [], "geometryStatus": "UNRESOLVED", "confidence": "NONE", "sourcePathIDs": [],
                                    "issues": ["No plausible polygonized face contains the extracted source label anchor."]})
        matched = sum(bool(record["polygonPt"]) for record in records)
        pilot_rows.append({"id": name, "sourceBoundingBoxPt": config["bbox"], "targetRoomIDs": config["ids"],
                           "polygonizedFacesIntersectingCrop": len(candidate_faces), "labelOccurrencesAccounted": len(records),
                           "candidatePolygonCount": matched, "roomPolygonCoverage": f"{matched}/{len(records)}",
                           "roomPolygonIoU": "NOT_MEASURABLE: no reviewed reference polygons exist", "wallAlignmentError": "NOT_MEASURABLE: CAD layer paths are candidates, not independent reference wall axes",
                           "spaces": records, "status": "IMPLEMENTED_BUT_UNVERIFIED"})
        selected_face_ids = {tuple(record["polygonPt"]) for record in records if record["polygonPt"]}
        viewbox=f'{clip.bounds[0]} {clip.bounds[1]} {clip.bounds[2]-clip.bounds[0]} {clip.bounds[3]-clip.bounds[1]}'
        cropped_lines=[svg_path(line.intersection(clip)) for _, line in lines if line.intersects(clip) and not line.intersection(clip).is_empty]
        source_svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1400" height="1000"><image href="/ff01-source-plan.png" x="0" y="0" width="2384" height="1684"/></svg>']
        structural_svg=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1400" height="1000"><rect x="{clip.bounds[0]}" y="{clip.bounds[1]}" width="{clip.bounds[2]-clip.bounds[0]}" height="{clip.bounds[3]-clip.bounds[1]}" fill="#fffdf8"/>',*cropped_lines,'</svg>']
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1400" height="1000">',
               '<image href="/ff01-source-plan.png" x="0" y="0" width="2384" height="1684" opacity="0.75"/>',*cropped_lines]
        for rec in records:
            if not rec["polygonPt"]: continue
            points = " ".join(f"{x},{y}" for x,y in rec["polygonPt"])
            svg.append(f'<polygon points="{points}" fill="#44aa8830" stroke="#18745d" stroke-width="1.4"/>')
            x,y=rec["labelPointPt"]; svg.append(f'<text x="{x}" y="{y}" font-size="7" fill="#073b32">{rec["id"]} · CANDIDATE</text>')
        svg.append('</svg>')
        for base in (out, repo / "public"):
            (base / f"{name}.svg").write_text("\n".join(svg), encoding="utf-8")
            (base / f"{name}-source.svg").write_text("\n".join(source_svg), encoding="utf-8")
            (base / f"{name}-structural.svg").write_text("\n".join(structural_svg), encoding="utf-8")
            (base / f"{name}-polygon.svg").write_text("\n".join([f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1400" height="1000"><rect x="{clip.bounds[0]}" y="{clip.bounds[1]}" width="{clip.bounds[2]-clip.bounds[0]}" height="{clip.bounds[3]-clip.bounds[1]}" fill="#fffdf8"/>',
              *[f'<polygon points="{" ".join(f"{x},{y}" for x,y in row["polygonPt"])}" fill="#44aa8840" stroke="#18745d" stroke-width="1.4"/>' for row in records if row["polygonPt"]],'</svg>']), encoding="utf-8")
            (base / f"{name}-difference.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300"><rect width="100%" height="100%" fill="#fffdf8"/><text x="24" y="72" font-size="34">Difference metric: NOT MEASURABLE</text><text x="24" y="128" font-size="22">No independently reviewed room/wall reference geometry</text><text x="24" y="178" font-size="18">Candidate polygons: {matched}/{len(records)} · candidate faces in crop: {len(candidate_faces)}</text></svg>', encoding="utf-8")
    result = {"summary": summary, "pilots": pilot_rows}
    (out / "PILOT_RECONSTRUCTION.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__": run()
