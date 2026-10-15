#!/usr/bin/env python3
"""Check V7 source integrity, coordinate round trips and geometry status invariants."""
from __future__ import annotations

import gzip
import hashlib
import json
import math
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"
M_PER_PT = 25.4 * 300 / 72 / 1000


def walk_ids(obj):
    if isinstance(obj, dict):
        if "sourcePathID" in obj:
            yield obj["sourcePathID"]
        for value in obj.values():
            yield from walk_ids(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from walk_ids(value)


def main() -> None:
    model = json.loads((SOURCE / "canonical-architecture-v7.json").read_text())
    summary = json.loads((SOURCE / "spatial-extraction-summary.json").read_text())
    with gzip.open(SOURCE / "ff01-vectors.json.gz", "rt", encoding="utf-8") as stream:
        cache = json.load(stream)
    expected_hash = summary["sourcePdfSha256"]
    assert model["sourceMetadata"]["sourcePdfSha256"] == expected_hash == cache["summary"]["sourcePdfSha256"]
    pdf_path = Path(summary["sourcePdf"])
    assert pdf_path.exists(), f"FF-01 PDF unavailable at recorded source path: {pdf_path}"
    assert hashlib.sha256(pdf_path.read_bytes()).hexdigest() == expected_hash

    source_ids = {p.get("sourcePathID") or p["id"] for p in cache["cadDrawings"]}
    used_ids = list(walk_ids(model))
    assert used_ids and all(pid in source_ids for pid in used_ids), "Unknown/missing source P-ID"

    cs = model["coordinateSystem"]
    ox, oy = cs["worldOriginPdfPt"]
    scale = cs["metresPerPdfPoint"]
    page_w, page_h = cs["pageSizePt"]
    round_trip_error = 0.0
    points = [[0, 0], [page_w, 0], [0, page_h], [page_w, page_h], [733.76, 1154.56], [966.3835, 572.777], [1025.0, 824.92]]
    for x, y in points:
        world = [(x - ox) * scale, (y - oy) * scale]
        restored = [world[0] / scale + ox, world[1] / scale + oy]
        round_trip_error = max(round_trip_error, math.dist([x, y], restored))
    assert round_trip_error < 1e-9

    polygon_count = 0
    for collection in [model["wallNetwork"]["wallFaceCandidates"], model["arena"]["courtBoundaries"], model["arena"]["seatFootprints"]]:
        for feature in collection:
            rings = feature["geometry"]["coordinates"]
            poly = Polygon(rings[0], rings[1:])
            assert poly.is_valid and poly.area > 0, feature["id"]
            assert rings[0][0] == rings[0][-1], f"Unclosed ring: {feature['id']}"
            polygon_count += 1

    spaces = model["spaces"]
    assert len(spaces) == 101
    assert len({space["spaceID"] for space in spaces}) == 101
    candidates = [space for space in spaces if space["geometry"] is not None]
    assert len(candidates) == 6
    assert not any(space["verificationLevel"] != "UNVERIFIED" for space in spaces)
    assert model["buildingFootprint"]["geometry"] is None
    assert model["circulation"]["corridors"] == []
    assert not model["arena"]["ringCorridor"]

    public = json.loads((ROOT / "public/ff01-architecture-v7.json").read_text())
    assert public["sourceMetadata"]["sourcePdfSha256"] == expected_hash
    result = {
        "result": "PASS_V7_SOURCE_GEOMETRY_INTEGRITY",
        "pdfHashMatched": True,
        "sourcePathReferences": len(used_ids),
        "uniqueSourcePathIDs": len(set(used_ids)),
        "coordinateRoundTripMaxErrorPt": round_trip_error,
        "validCandidatePolygons": polygon_count,
        "sourceLabelCount": len(spaces), "candidateRoomPolygons": len(candidates),
        "drawingMatchedSpaces": model["coverage"]["drawingMatchedSpaces"],
        "drawingVerifiedSpaces": model["coverage"]["drawingVerifiedSpaces"],
        "wallTraceObjects": len(model["wallNetwork"]["traceObjects"]),
        "wallFaceCandidates": len(model["wallNetwork"]["wallFaceCandidates"]),
        "courtBoundaryCandidates": len(model["arena"]["courtBoundaries"]),
        "seatFootprints": len(model["arena"]["seatFootprints"]),
        "corridorPolygons": len(model["circulation"]["corridors"]),
        "buildingFootprintStatus": model["buildingFootprint"]["geometryStatus"],
        "note": "Integrity checks do not certify semantic completeness or independent architectural accuracy.",
    }
    out = SOURCE / "canonical-architecture-v7-validation.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
