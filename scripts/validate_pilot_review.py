#!/usr/bin/env python3
"""Regression checks for V4 pilot review packages; never changes review state."""
import gzip
import json
import math
from pathlib import Path

from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data/source/pilots/v4/review-packages/index.json"
OVERRIDES = ROOT / "data/geometry-review/overrides.json"
VECTORS = json.loads(gzip.decompress((ROOT / "data/source/ff01-vectors.json.gz").read_bytes()))["cadDrawings"]


def main():
    index = json.loads(INDEX.read_text())
    overrides = json.loads(OVERRIDES.read_text())
    valid_source_ids = {row.get("sourcePathID") for row in VECTORS} | {row.get("id") for row in VECTORS}
    assert len(index["rooms"]) == 6
    assert index["verifiedCount"] == 0
    assert overrides["revision"] >= 5
    assert any(row["id"] == "M102" for row in overrides["spaces"]), "M102 revision-5 draft must remain present"
    total_edges = total_proposals = 0
    for room in index["rooms"]:
        assert room["reviewPackageStatus"] == "REVIEW_READY"
        assert room["verificationRecord"] is None
        edges = room["edges"]
        assert len(edges) >= 3
        assert len({edge["edgeID"] for edge in edges}) == len(edges)
        total_edges += len(edges)
        polygon_points = []
        for edge in edges:
            assert edge["reviewStatus"] == "HUMAN_REVIEW_REQUIRED"
            assert edge["currentReviewStatus"] == "NOT_REVIEWED"
            assert edge["classification"] in {"WALL_ALIGNED_CANDIDATE", "CANDIDATE_WALL", "DOOR_OR_GLAZING", "UNSUPPORTED"}
            assert all(source_id in valid_source_ids for source_id in edge["sourcePathIDs"])
            assert math.isfinite(edge["lengthPt"]) and edge["lengthPt"] > 0
            polygon_points.append(edge["startPt"])
        polygon = Polygon(polygon_points)
        assert polygon.is_valid and polygon.area > 0
        assert len(room["correctionProposals"]) <= 3
        for proposal in room["correctionProposals"]:
            assert all(source_id in valid_source_ids for source_id in proposal["sourcePathIDs"])
            assert proposal["geometryDeltaMaxPt"] <= 2.5
            changed = Polygon(proposal["resultPolygonSourcePt"])
            assert changed.is_valid and changed.area > 0
            total_proposals += 1
        for file_key in ("candidateOverlay", "sourceCrop", "structuralEvidenceImage"):
            filename = room[file_key]
            assert (ROOT / "data/source/pilots/v4/review-packages" / room["roomID"] / filename).exists()
    assert len(overrides.get("edgeReviews", [])) == 0, "test must not create reviewer identity or decisions"
    assert len(overrides.get("verificationRecords", [])) == 0
    print(json.dumps({"rooms": 6, "edges": total_edges, "proposals": total_proposals,
                      "verified": 0, "overrideRevisionPreserved": overrides["revision"], "status": "PASS"}))


if __name__ == "__main__":
    main()
