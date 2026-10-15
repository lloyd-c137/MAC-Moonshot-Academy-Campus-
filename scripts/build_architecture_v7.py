#!/usr/bin/env python3
"""Build V7 semantic geometry candidates from the preserved FF-01 source evidence.

V7 does not reinterpret the source PDF as verified BIM. Polygonal source fills,
explicit field/seating polylines, and room-review candidates retain their own
provenance and status so renderers can use geometry without implying review.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from shapely.geometry import LineString, Polygon
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_architecture_v6 import chains  # Reuse the established V6 path decoder.

M_PER_PT = 25.4 * 300 / 72 / 1000
WALL_SEMANTICS = {"Existing Wall", "New Partition", "Architectural Wall"}
STRUCTURAL_SEMANTIC = "Structural Wall / Column"
ARENA_PREFIX = "T-CC-SEAT-L1$0$"


def line_geometry(path: dict[str, Any]) -> list[list[list[float]]]:
    return [
        [[round(float(x), 3), round(float(y), 3)] for x, y in chain]
        for chain in chains(path)
        if len(chain) >= 2 and any(math.dist(chain[0], p) > 1e-5 for p in chain[1:])
    ]


def explicit_polygons(path: dict[str, Any]) -> list[list[list[float]]]:
    """Only consume explicit native poly commands, never infer from nearby lines."""
    output = []
    for item in path.get("items", []):
        if not item or item[0] != "poly" or len(item) < 2:
            continue
        points = [[float(p[0]), float(p[1])] for p in item[1]]
        if len(points) < 3:
            continue
        polygon = Polygon(points)
        if not polygon.is_valid or polygon.area <= 0.01:
            continue
        polygon = orient(polygon, sign=1.0)
        ring = [[round(float(x), 3), round(float(y), 3)] for x, y in polygon.exterior.coords]
        output.append(ring)
    return output


def geo_polygon(ring: list[list[float]]) -> dict[str, Any]:
    closed = ring if ring[0] == ring[-1] else [*ring, ring[0]]
    return {"type": "Polygon", "coordinates": [closed]}


def bbox(lines: list[list[list[float]]]) -> list[float] | None:
    points = [p for line in lines for p in line]
    if not points:
        return None
    return [round(min(p[0] for p in points), 3), round(min(p[1] for p in points), 3),
            round(max(p[0] for p in points), 3), round(max(p[1] for p in points), 3)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=ROOT)
    args = parser.parse_args()
    repo = args.repo.resolve()
    source = repo / "data/source"
    v6 = json.loads((source / "canonical-architecture-v6.json").read_text())
    summary = json.loads((source / "spatial-extraction-summary.json").read_text())
    with gzip.open(source / "ff01-vectors.json.gz", "rt", encoding="utf-8") as stream:
        cache = json.load(stream)
    if cache["summary"]["sourcePdfSha256"] != v6["source"]["sourcePdfSha256"]:
        raise SystemExit("V6 and vector-cache source hashes differ")

    # V6's trace edges are retained as line evidence. They are not buffered into
    # fictional wall thicknesses; only source-filled polygons become wall-face
    # candidates for the 2.5D preview.
    wall_traces: list[dict[str, Any]] = []
    for semantic, rows in v6["wallNetwork"]["segmentsBySemantic"].items():
        for row in rows:
            wall_traces.append({
                "id": row["segmentID"], "geometry": {"type": "LineString", "coordinates": [row["aPt"], row["bPt"]]},
                "wallType": semantic, "sourcePathID": row["sourcePathID"], "sourceLayer": row["layer"],
                "classification": "CAD_LAYER_TRACE", "geometryStatus": "TRACE_ONLY",
                "verificationLevel": "UNVERIFIED",
            })

    wall_faces: list[dict[str, Any]] = []
    for row in v6["wallNetwork"]["structuralFillCandidates"]:
        ring = row["polygonPt"]
        poly = Polygon(ring)
        if not poly.is_valid or poly.area <= 0.01:
            continue
        normalized = orient(poly, sign=1.0)
        coords = [[round(float(x), 3), round(float(y), 3)] for x, y in normalized.exterior.coords]
        layer = row["layer"]
        semantic = "Existing Wall" if layer == "A05-建筑原有墙体" else "Structural Wall / Column"
        wall_faces.append({
            "id": row["ringID"], "geometry": geo_polygon(coords), "wallType": semantic,
            "sourcePathID": row["sourcePathID"], "sourceLayer": layer,
            "classification": "NATIVE_FILLED_PATH_POLYGONIZED", "geometryStatus": "CANDIDATE",
            "verificationLevel": "UNVERIFIED", "faceAreaM2": round(float(normalized.area) * M_PER_PT ** 2, 4),
        })

    # A07 polylines may explicitly encode wall-width rectangles. Preserve only
    # closed native poly commands, with no endpoint closure or snapping.
    partition_faces = []
    for path in cache["cadDrawings"]:
        if path.get("layerSemantic") != "New Partition":
            continue
        for i, ring in enumerate(explicit_polygons(path)):
            partition_faces.append({
                "id": f"{path.get('sourcePathID') or path['id']}-P{i + 1:02d}",
                "geometry": geo_polygon(ring), "wallType": "New Partition",
                "sourcePathID": path.get("sourcePathID") or path["id"], "sourceLayer": path.get("layer"),
                "classification": "EXPLICIT_CLOSED_NATIVE_POLY", "geometryStatus": "CANDIDATE",
                "verificationLevel": "UNVERIFIED",
            })

    arena_paths = [p for p in cache["cadDrawings"] if (p.get("layer") or "").startswith(ARENA_PREFIX)]
    arena_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in arena_paths:
        layer = path.get("layer", "")
        pid = path.get("sourcePathID") or path["id"]
        lines = line_geometry(path)
        polygons = explicit_polygons(path)
        for i, ring in enumerate(polygons):
            target = "courtBoundaries" if layer.endswith("$FIELD") else "seatFootprints" if layer.endswith("$SEAT-ATHE") else "arenaPolygonEvidence"
            arena_groups[target].append({
                "id": f"{pid}-P{i + 1:02d}", "geometry": geo_polygon(ring), "sourcePathID": pid,
                "sourceLayer": layer, "geometryStatus": "SOURCE_POLYGON_CANDIDATE", "verificationLevel": "UNVERIFIED",
            })
        if lines:
            target = "standTraces" if layer.endswith("$stand") else "arenaBoundaryTraces"
            for i, line in enumerate(lines):
                arena_groups[target].append({
                    "id": f"{pid}-L{i + 1:02d}", "geometry": {"type": "LineString", "coordinates": line},
                    "sourcePathID": pid, "sourceLayer": layer, "geometryStatus": "TRACE_ONLY",
                    "verificationLevel": "UNVERIFIED",
                })

    spaces = []
    for room in v6["spaces"]:
        polygon = room.get("polygon")
        geometry = geo_polygon(polygon["coordinatesPdfDisplayPt"]) if polygon else None
        spaces.append({
            "spaceID": room["spaceID"], "sourceRoomID": room["roomID"], "baseRoomCode": room["baseRoomCode"],
            "sourceLabel": room["roomID"], "sourceLabelPt": room["sourceLabelPt"],
            "spaceType": "ROOM_CANDIDATE", "geometry": geometry,
            "sourcePathIDs": polygon["sourcePathIDs"] if polygon else [],
            "areaAnnotation": room.get("areaAnnotation"),
            "areaM2": round(Polygon(polygon["coordinatesPdfDisplayPt"]).area * M_PER_PT ** 2, 3) if polygon else None,
            "geometryStatus": "CANDIDATE" if polygon else "UNRESOLVED",
            "verificationLevel": "UNVERIFIED", "unresolvedEdges": [],
        })

    source_pdf_path = Path(summary["sourcePdf"])
    actual_hash = hashlib.sha256(source_pdf_path.read_bytes()).hexdigest() if source_pdf_path.exists() else None
    if actual_hash and actual_hash != v6["source"]["sourcePdfSha256"]:
        raise SystemExit("Current FF-01 PDF hash differs from the frozen V6 evidence")

    label_count = len(spaces)
    modeled = sum(space["geometry"] is not None for space in spaces)
    model = {
        "schemaVersion": 1,
        "modelID": "FF01-ARCHITECTURE-V7",
        "modelStatus": "PARTIAL_SOURCE_ALIGNED_CANDIDATE",
        "sourceMetadata": {
            "sourcePdfSha256": v6["source"]["sourcePdfSha256"], "drawingID": "FF-01",
            "sourceModelVersion": "FF01-ARCHITECTURE-V6", "coordinateSystemVersion": "FF01_NORMALIZED_PDF_DISPLAY_PT_V1",
            "generatedAt": datetime.now(timezone.utc).isoformat(), "sourcePdfAvailableAtBuild": source_pdf_path.exists(),
            "nativePathCount": v6["source"]["nativePathCount"], "classifiedPathCount": v6["source"]["tracePathCount"],
        },
        "coordinateSystem": {
            "id": "FF01_NORMALIZED_PDF_DISPLAY_PT_V1", "name": "FF01_NORMALIZED_PDF_DISPLAY_PT",
            "units": "pdf-display-point", "origin": "top-left after page rotation normalization",
            "pageSizePt": v6["coordinateSystem"]["pageSizePt"], "metresPerPdfPoint": M_PER_PT,
            "worldUnits": "meters", "worldOriginPdfPt": v6["coordinateSystem"]["worldOriginPdfPt"],
            "worldAxes": {"x": "east", "y": "elevation", "z": "south"},
            "pdfDisplayPtToWorldXZ": "[(x-originX)*metresPerPdfPoint, (y-originY)*metresPerPdfPoint]",
            "worldXZToPdfDisplayPt": "[x/metresPerPdfPoint+originX, z/metresPerPdfPoint+originY]",
            "legacyPlanAdapter": {"scale": "1000/(gridMaxX-gridMinX)", "gridMinPdfPt": [summary["coordinateSystem"]["gridFrame"]["minXPt"], summary["coordinateSystem"]["gridFrame"]["minYPt"]]},
            "scaleSource": "Existing V6 1:300 calibration; no independent X/Z scaling",
        },
        "buildingFootprint": {
            "geometry": None, "candidateGeometry": None, "geometryStatus": "UNRESOLVED",
            "verificationLevel": "UNVERIFIED", "sourcePathIDs": [],
            "unresolvedBoundaries": [{"id": "FF01-EXTERIOR-BOUNDARY-01", "reason": "The source wall layers do not distinguish exterior faces from interior partitions consistently; no closed footprint is asserted.", "status": "OPEN_BOUNDARY_REQUIRES_TRACING"}],
        },
        "wallNetwork": {
            "traceObjects": wall_traces, "wallFaceCandidates": wall_faces + partition_faces,
            "counts": {"traceObjects": len(wall_traces), "sourceFilledWallFaceCandidates": len(wall_faces), "explicitPartitionFaceCandidates": len(partition_faces)},
            "policy": "Single-line evidence remains TRACE_ONLY. Polygonal wall faces are candidates only when directly represented by source fills or explicit closed native polylines; illustrative height is not construction data.",
        },
        "spaces": spaces,
        "circulation": {
            "corridors": [], "entranceHalls": [], "geometryStatus": "NOT_GENERATED",
            "unresolvedObjects": [{"id": "FF01-CIRCULATION-01", "reason": "No corridor face has been independently isolated from shared walls and door openings; residual whitespace is not classified as circulation."}],
        },
        "arena": {
            "courtBoundaries": arena_groups["courtBoundaries"],
            "seatFootprints": arena_groups["seatFootprints"],
            "standTraces": arena_groups["standTraces"],
            "arenaBoundaryTraces": arena_groups["arenaBoundaryTraces"],
            "ringCorridor": None,
            "status": "SOURCE_GEOMETRY_CANDIDATES",
            "verificationLevel": "UNVERIFIED",
        },
        "openings": {"candidates": [], "status": "NOT_GENERATED", "note": "Door leaf paths are preserved in V6 evidence; a leaf alone is not promoted to a verified opening."},
        "coverage": {
            "expectedLabels": label_count, "uniqueBaseRoomCodes": len({s["baseRoomCode"] for s in spaces}),
            "modeledSpaces": modeled, "candidateSpaces": modeled, "drawingMatchedSpaces": 0,
            "drawingVerifiedSpaces": 0, "missingSpaces": label_count - modeled,
            "bySeries": {
                series: {
                    "expectedLabels": sum(1 for s in spaces if (s["baseRoomCode"].startswith(series) if series != "UNCLASSIFIED" else s["baseRoomCode"][:1] not in {"M", "S", "A"})),
                    "candidatePolygons": sum(1 for s in spaces if (s["baseRoomCode"].startswith(series) if series != "UNCLASSIFIED" else s["baseRoomCode"][:1] not in {"M", "S", "A"}) and s["geometry"]),
                }
                for series in ["M", "S", "A", "UNCLASSIFIED"]
            },
            "semanticSpaceTypes": {"PUBLIC": "NOT_CLASSIFIED", "SERVICE": "NOT_CLASSIFIED", "CIRCULATION": "NOT_CLASSIFIED"},
            "corridorPolygons": 0, "openingCandidates": 0,
            "unresolvedObjects": 1 + (label_count - modeled),
        },
        "illustrative3D": {"wallHeightM": 2.8, "floorThicknessM": 0.12, "seatStepHeightM": 0.18, "parametersAreMeasured": False},
        "provenancePolicy": "Source paths and layers establish provenance only. CAD semantic labels and generated candidates do not establish independent drawing or field verification.",
    }

    output = source / "canonical-architecture-v7.json"
    output.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    public = repo / "public/ff01-architecture-v7.json"
    shutil.copy2(output, public)
    report = {
        "model": output.relative_to(repo).as_posix(), "publicCopy": public.relative_to(repo).as_posix(),
        "sourcePdfSha256": model["sourceMetadata"]["sourcePdfSha256"], "currentPdfHashMatched": actual_hash is not None,
        "sourceLabels": label_count, "candidateRoomPolygons": modeled, "drawingMatchedSpaces": 0,
        "drawingVerifiedSpaces": 0, "wallTraceObjects": len(wall_traces),
        "sourceFilledWallFaceCandidates": len(wall_faces), "explicitPartitionFaceCandidates": len(partition_faces),
        "courtBoundaryCandidates": len(arena_groups["courtBoundaries"]), "seatFootprints": len(arena_groups["seatFootprints"]),
        "arenaBoundaryTraces": len(arena_groups["arenaBoundaryTraces"]), "corridorPolygons": 0,
        "buildingFootprint": "UNRESOLVED", "status": "PARTIAL_SOURCE_ALIGNED_CANDIDATE",
    }
    (source / "canonical-architecture-v7-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
