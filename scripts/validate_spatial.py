#!/usr/bin/env python3
"""Fail-fast consistency checks for the reproducible FF-01 extraction outputs."""

import csv
import gzip
import json
import struct
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / "data/source"
summary = json.loads((source / "spatial-extraction-summary.json").read_text())
with (source / "ROOM_MANIFEST.csv").open(encoding="utf-8-sig", newline="") as stream:
    rooms = list(csv.DictReader(stream))
with (source / "UNRESOLVED_GEOMETRY.csv").open(encoding="utf-8-sig", newline="") as stream:
    paths = list(csv.DictReader(stream))
with gzip.open(source / "ff01-vectors.json.gz", "rt", encoding="utf-8") as stream:
    vectors = json.load(stream)
layers = json.loads((source / "FF01_LAYER_MANIFEST.json").read_text())

assert summary["sourcePdfSha256"] == "28217dcb951ea45b34d2651851f36bcd0af5824d27b5d588b60cdf3672ce3d60"
assert summary["pageCount"] == 1 and summary["pageRotation"] == 270
assert summary["paintedNativePathCount"] == len(paths) == 33355
assert summary["uniqueSourceRoomLabelIDs"] == len({row["SourceRoomLabel"] for row in rooms}) == 101
assert summary["uniqueBaseRoomCodes"] == 98
assert summary["applicationSpaceIDsMatched"] == 33
assert len(vectors["cadDrawings"]) == summary["cadLayers"]["nativeDrawingCount"] == 33355
assert summary["cadLayers"]["distinctLayerCount"] == layers["distinctLayerCount"] == 126
assert summary["cadLayers"]["pathJoin"]["joinStatus"] == "VERIFIED"
assert summary["cadLayers"]["pathJoin"]["joinedByStableSequenceAndBbox"] == 33355
layer_counts = {row["originalLayerName"]: row["pathCount"] for row in layers["layers"]}
assert layer_counts["A05-建筑原有墙体"] == 2014
assert layer_counts["A07-新建隔墙"] == 336
assert layer_counts["A04-建筑剪力墙柱填充"] == 893
assert layer_counts["P03-门扇"] == 1054
assert layer_counts["A11-建筑楼梯 平面高差"] == 244
assert layer_counts["T-CC-SEAT-L1$0$SEAT-ATHE"] == 574
assert layer_counts["S-实验家具"] == 9547
assert all(row["SourceFitzPathID"] for row in paths)
assert {row["Classification"] for row in paths} >= {"Existing Wall", "New Partition", "Door", "Furniture"}
pilot = json.loads((source / "pilots/PILOT_RECONSTRUCTION.json").read_text())
assert pilot["summary"]["polygonizeFaceCount"] > 0
assert pilot["summary"]["doorLayerUsedToCloseFaces"] is False
assert pilot["summary"]["status"] == "IMPLEMENTED_BUT_UNVERIFIED"
assert all(space["geometryStatus"] != "VERIFIED" for item in pilot["pilots"] for space in item["spaces"])
assert all(row["GeometryStatus"] == "UNRESOLVED" for row in rooms)
measurements = summary["coordinateSystem"]["axisDimensionValidation"]
assert [row["status"] for row in measurements] == ["VERIFIED", "VERIFIED"]
assert max(row["relativeErrorPercent"] for row in measurements) < 0.01
assert (root / "public/ff01-source-plan.png").is_file()
assert (root / "public/ff01-source-plan.svg").is_file()
assert (source / "ff01-vectors.json.gz").is_file()
assert (source / "STRUCTURAL_CANDIDATES.csv").is_file()
assert (source / "ff01-layer-walls.svg").is_file()
assert (root / "public/ff01-layer-walls.svg").is_file()
hybrid = json.loads((source / "pilots/v3/PILOT_HYBRID_RECONSTRUCTION.json").read_text())
pilot_ids = {"M102", "M103", "M104", "S208", "S209", "S210"}
assert hybrid["candidateCount"] == len(hybrid["pilots"]) == 6
assert hybrid["independentlyVerifiedCount"] == 0
assert {row["roomID"] for row in hybrid["pilots"]} == pilot_ids
assert all(row["status"] == "HUMAN_REVIEW_REQUIRED" for row in hybrid["pilots"])
assert all(row["polygonValid"] and row["seedInside"] for row in hybrid["pilots"])
assert all(row["independentIoU"].startswith("NOT_MEASURABLE") for row in hybrid["pilots"])
assert hybrid["rootCause"]["coordinateDiagnosis"]["status"] == "VERIFIED_CONSISTENT"
assert all(row["status"] == "COORDINATE_FRAME_CONSISTENT" and row["anchorInsideIndependentWordBBox"] for row in hybrid["coordinateRegistration"])
valid_source_ids = {row["id"] for row in vectors["cadDrawings"]} | {row["sourcePathID"] for row in vectors["cadDrawings"] if row.get("sourcePathID")}
def png_size(path):
    with path.open("rb") as stream:
        header = stream.read(24)
    assert header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
    return struct.unpack(">II", header[16:24])

for row in hybrid["pilots"]:
    assert row["sourcePathIDs"] and set(row["sourcePathIDs"]) <= valid_source_ids
    assert len(row["polygonSourcePt"]) >= 4 and row["polygonSourcePt"][0] == row["polygonSourcePt"][-1]
    assert all(len(point) == 2 and all(isinstance(value, (int, float)) for value in point) for point in row["polygonSourcePt"])
    assert row["virtualClosuresArePhysicalWalls"] is False
    assert all(point != nxt for point,nxt in zip(row["polygonSourcePt"],row["polygonSourcePt"][1:]))
    assert all(edge["status"] == "HUMAN_REVIEW_REQUIRED" for edge in row["unresolvedEdges"])
    assert all(edge.get("layerSemantic") and len(edge["startPt"]) == len(edge["endPt"]) == 2 for edge in row["unresolvedEdges"])
    assert all(edge.get("sourcePathID") is None or edge["sourcePathID"] in valid_source_ids for edge in row["unresolvedEdges"])
    assert row["unresolvedEdgeCount"] == len(row["unresolvedEdges"])
    assert row["textWordCountInExclusionMask"] > 0
    for name in row["visualEvidence"].values():
        assert (source / "pilots/v3" / name).is_file()
        assert (root / "public/ff01-pilot-v3" / name).is_file()
    x0,y0,x1,y1=row["cropBBoxPt"]
    source_width,source_height=png_size(source / "pilots/v3" / row["visualEvidence"]["sourceCrop"])
    wall_width,wall_height=png_size(source / "pilots/v3" / row["visualEvidence"]["wallMask"])
    assert abs(source_width-round((x1-x0)*300/72)) <= 2 and abs(source_height-round((y1-y0)*300/72)) <= 2
    assert abs(wall_width-round((x1-x0)*300/72)) <= 2 and abs(wall_height-round((y1-y0)*300/72)) <= 2
assert all((source / "pilots/v3" / f"{row['roomID'].lower()}-source-300dpi.png").is_file() for row in hybrid["pilots"])
assert all((source / "pilots/v3" / f"{row['roomID'].lower()}-wall-mask-300dpi.png").is_file() for row in hybrid["pilots"])
assert all((root / "docs" / name).is_file() for name in ["PILOT_FAILURE_ROOT_CAUSE.md", "PILOT_GEOMETRY_VALIDATION.md", "HYBRID_RECONSTRUCTION.md", "UPDATED_UNRESOLVED_GEOMETRY.md"])
overrides = root / "data/geometry-review/overrides.json"
if overrides.is_file():
    review = json.loads(overrides.read_text())
    assert review["revision"] >= 1 and all(space["status"] != "VERIFIED" for space in review["spaces"])
print("FF-01 extraction validation: PASS (source identity, 126 CAD layers, 33,355 path joins, scale and inventory)")
print(f"CAD path-to-layer association: {summary['cadLayers']['pathJoin']['joinStatus']}; Hybrid V3 candidates: {hybrid['candidateCount']}/6 valid seeded polygons; edge provenance/status: PASS; independently verified: {hybrid['independentlyVerifiedCount']}/6.")
