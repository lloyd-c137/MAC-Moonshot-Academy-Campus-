#!/usr/bin/env python3
"""Validate src/generated/ff01-campus-core.json (+ detail) against FF-01 and the V9 candidate model.

Checks provenance and internal consistency only. Passing does NOT mean the
geometry is architecturally verified; the model must keep saying so.
"""
from __future__ import annotations

import gzip, json, re, sys
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "src/generated/ff01-campus-core.json"
DETAIL = ROOT / "src/generated/ff01-campus-detail.json"
V9 = ROOT / "public/ff01-architecture-v9.json"
VECTORS = ROOT / "data/source/ff01-vectors.json.gz"
ROOMS_TS = ROOT / "src/data/sourceRooms.ts"
DIMENSION_CHAIN_M = (134.1, 115.8)   # printed overall spans on FF-01

failures: list[str] = []


def check(ok: bool, message: str):
    print(("PASS " if ok else "FAIL ") + message)
    if not ok:
        failures.append(message)


def poly(p):
    return Polygon(p["o"], p["h"])


def main():
    model = json.loads(MODEL.read_text())
    v9 = json.loads(V9.read_text())
    summary = json.loads(gzip.decompress(VECTORS.read_bytes()))["summary"]

    check(model["source"]["sourcePdfSha256"] == summary["sourcePdfSha256"] == v9["sourceMetadata"]["sourcePdfSha256"], "source PDF hash matches extraction summary and V9")
    check(model["status"].endswith("UNVERIFIED") and model["heights"]["measured"] is False, "model declares itself unverified with illustrative heights")
    check(model["footprint"]["status"] == "DERIVED_UNVERIFIED", "footprint is labelled as derived")

    v9_ids = [s["sourceRoomID"] for s in v9["spaces"]]
    ids = [r["id"] for r in model["rooms"]]
    check(ids == v9_ids, f"room inventory equals V9 label inventory ({len(ids)} labels)")
    v9_poly = {s["sourceRoomID"] for s in v9["spaces"] if s.get("geometry")}
    with_poly = {r["id"] for r in model["rooms"] if r["polygon"]}
    check(with_poly == v9_poly, f"room polygons are exactly the V9 candidates ({len(with_poly)})")
    check(all(r["geometryStatus"] in ("V9_CANDIDATE_UNVERIFIED", "NO_POLYGON_LABEL_ONLY") for r in model["rooms"]), "no room claims verified geometry")

    bad = [r["id"] for r in model["rooms"] if r["polygon"] and not poly(r["polygon"]).is_valid]
    check(not bad, f"room polygons are valid ({bad or 'all'})")
    named = [r for r in model["rooms"] if r["nameSource"] in ("PDF_LABEL_BLOCK", "MANUAL_READING_OF_STACKED_GLYPHS")]
    check(len(named) >= 95, f"room names read from FF-01 label text ({len(named)}/{len(ids)})")
    off_label = [r["id"] for r in model["rooms"] if r["polygon"] and not poly(r["polygon"]).buffer(1.0).contains(Polygon([(r["label"][0]-.01, r["label"][1]-.01), (r["label"][0]+.01, r["label"][1]-.01), (r["label"][0], r["label"][1]+.01)]))]
    check(len(off_label) <= 5, f"source label lies inside (or within 1 m of) its room polygon; exceptions: {off_label}")

    fp = poly(model["footprint"]["polygon"])
    minx, minz, maxx, maxz = fp.bounds
    span_ok = abs((maxx - minx) - DIMENSION_CHAIN_M[0]) < 4.0 and abs((maxz - minz) - DIMENSION_CHAIN_M[1]) < 4.0
    check(span_ok, f"footprint spans {maxx-minx:.1f} m x {maxz-minz:.1f} m vs printed 134.1 x 115.8 m (entrance canopy / stair tolerance 4 m)")
    area_ratio = fp.area / (DIMENSION_CHAIN_M[0] * DIMENSION_CHAIN_M[1])
    check(0.95 < area_ratio < 1.05, f"footprint area {fp.area:.0f} m² is {area_ratio:.3f} of the dimension-chain rectangle")

    walls = [poly(w) for w in model["walls"]]
    check(len(walls) > 50 and all(w.is_valid for w in walls), f"{len(walls)} valid wall bodies")
    outside = [i for i, w in enumerate(walls) if not fp.buffer(3.0).contains(w)]
    check(len(outside) <= 3, f"wall bodies lie within the footprint (+3 m); outside: {len(outside)}")
    rooms_inside = [r["id"] for r in model["rooms"] if r["polygon"] and not fp.buffer(0.5).contains(poly(r["polygon"]))]
    check(not rooms_inside, f"room polygons lie within the footprint ({rooms_inside or 'all'})")

    check(model["arena"]["seatCount"] == len(v9["arena"]["seatFootprintCandidates"]) == 572, "572 source seat footprints carried into the arena")
    detail = json.loads(DETAIL.read_text())
    check(detail["modelID"] == model["modelID"], "detail file belongs to the same model")
    for key, packed in detail["floorLines"].items():
        flat, i, lines, segs, ok = packed["deltaCm"], 0, 0, 0, True
        while i < len(flat):
            n = flat[i]
            if n < 2 or i + 1 + 2 * n > len(flat): ok = False; break
            i += 1 + 2 * n; lines += 1; segs += n - 1
        check(ok and lines == packed["polylines"] and segs == packed["segments"] and segs > 0, f"floor line layer '{key}' decodes ({lines} polylines, {segs} segments)")

    ts_ids = re.findall(r'"id": "([^"]+)"', ROOMS_TS.read_text(encoding="utf-8"))
    check(ts_ids == ids, "src/data/sourceRooms.ts matches the model room inventory")

    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
