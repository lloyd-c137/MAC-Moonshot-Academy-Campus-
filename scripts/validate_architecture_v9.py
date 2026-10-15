#!/usr/bin/env python3
"""Dynamic source, geometry, topology, and verification checks for V9."""
from __future__ import annotations

import gzip, hashlib, json, math
from collections import Counter
from itertools import combinations
from pathlib import Path

from shapely.geometry import Point, shape

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"data/source"

def read_json(path): return json.loads(path.read_text())

def main():
    model=read_json(SRC/"canonical-architecture-v9.json")
    v8=read_json(SRC/"canonical-architecture-v8.json")
    v7=read_json(SRC/"canonical-architecture-v7.json")
    v6=read_json(SRC/"canonical-architecture-v6.json")
    source_summary=read_json(SRC/"spatial-extraction-summary.json")
    with gzip.open(SRC/"ff01-vectors.json.gz","rt",encoding="utf-8") as f: cache=json.load(f)
    errors=[];warnings=[];metrics={}
    expected=source_summary["sourcePdfSha256"]
    hashes={"V6":v6["source"]["sourcePdfSha256"],"V7":v7["sourceMetadata"]["sourcePdfSha256"],"V8":v8["sourceMetadata"]["sourcePdfSha256"],"V9":model["sourceMetadata"]["sourcePdfSha256"],"vectors":cache["summary"]["sourcePdfSha256"]}
    if set(hashes.values())!={expected}: errors.append("Source PDF hash differs across V6-V9/vector evidence")
    if model["modelID"]!="FF01-ARCHITECTURE-V9": errors.append("Unexpected V9 model id")
    if model["sourceModel"]!="V8 additive; V6/V7/V8 immutable": errors.append("V9 source lineage missing")
    if model["coordinateSystem"]["id"]!=v8["coordinateSystem"]["id"]: errors.append("Coordinate system changed from V8")
    if model["coordinateSystem"]["metresPerPdfPoint"]!=v8["coordinateSystem"]["metresPerPdfPoint"]: errors.append("V9 scale differs from V8 calibrated scale")
    spaces=model["spaces"]
    if len(spaces)!=101 or {x["sourceRoomID"] for x in spaces}!={x["sourceRoomID"] for x in v8["spaces"]}: errors.append("V9 source room label inventory mismatch")
    with gzip.open(SRC/"ff01-vectors.json.gz","rt",encoding="utf-8") as f: source_paths=json.load(f)["cadDrawings"]
    vector_ids={p.get("sourcePathID") or p["id"] for p in source_paths}
    path_semantics={p.get("sourcePathID") or p["id"]:p.get("layerSemantic","Unknown") for p in source_paths}
    used=set()
    polygons={}
    for room in spaces:
        if room.get("geometry"):
            try: geom=shape(room["geometry"])
            except Exception as exc: errors.append(f"{room['sourceRoomID']}: parse error {exc}");continue
            if geom.geom_type not in {"Polygon","MultiPolygon"} or not geom.is_valid or geom.area<=0: errors.append(f"{room['sourceRoomID']}: invalid polygon")
            if not geom.covers(Point(room["sourceLabelPt"])): errors.append(f"{room['sourceRoomID']}: label seed outside candidate")
            polygons[room["sourceRoomID"]]=geom
        for pid in room.get("sourcePathIDs",[]): used.add(pid)
        for edge in room.get("boundaryEdgesV9",[]):
            if edge.get("verificationLevel")!="UNVERIFIED": errors.append(f"{room['sourceRoomID']}: generated boundary was promoted")
            if edge.get("boundaryType") not in {"PHYSICAL_WALL_BOUNDARY_CANDIDATE","DOOR_OPENING_CANDIDATE","GLAZING_BOUNDARY_CANDIDATE","UNSUPPORTED_INFERRED_BOUNDARY"}: errors.append(f"{room['sourceRoomID']}: unknown edge semantic")
            used.update(edge.get("sourcePathIDs",[]))
            if any(path_semantics.get(pid) not in {"Existing Wall","New Partition","Structural Wall / Column","Architectural Wall"} for pid in edge.get("wallSourcePathIDs",[])): errors.append(f"{room['sourceRoomID']}: non-wall path classified as wall-face support")
            if any(path_semantics.get(pid)!="Door" for pid in edge.get("doorSourcePathIDs",[])): errors.append(f"{room['sourceRoomID']}: non-door path classified as door evidence")
            if any(path_semantics.get(pid)!="Window / Glazing" for pid in edge.get("glazingSourcePathIDs",[])): errors.append(f"{room['sourceRoomID']}: non-glazing path classified as glazing evidence")
        if room.get("areaTextEvidence",{}).get("usedToAlterGeometry") is not False: errors.append(f"{room['sourceRoomID']}: annotation influenced geometry")
    corridors={}
    for corridor in model["circulation"]["corridors"]:
        geom=shape(corridor["geometry"])
        if not geom.is_valid or geom.area<=0: errors.append(f"{corridor['id']}: invalid corridor polygon")
        corridors[corridor["id"]]=geom;used.update(corridor.get("sourcePathIDs",[]))
        if corridor.get("passabilityStatus")!="UNKNOWN": errors.append(f"{corridor['id']}: unreviewed passability promoted")
        for edge in corridor.get("boundaryEdgesV9",[]):
            used.update(edge.get("sourcePathIDs",[]))
            if any(path_semantics.get(pid) not in {"Existing Wall","New Partition","Structural Wall / Column","Architectural Wall"} for pid in edge.get("wallSourcePathIDs",[])): errors.append(f"{corridor['id']}: non-wall path classified as wall-face support")
    unknown=sorted(used-vector_ids)
    if unknown: errors.append(f"Source P-ID references missing from native PDF cache: {unknown[:8]}")
    room_overlaps=[]
    for (a,ga),(b,gb) in combinations(polygons.items(),2):
        overlap=ga.intersection(gb).area
        if overlap>1: room_overlaps.append({"roomA":a,"roomB":b,"overlapPt2":round(overlap,3)})
    if room_overlaps: errors.append(f"Unreported room overlap pairs: {len(room_overlaps)}")
    actual_corridor_conflicts=[]
    for rid,geom in polygons.items():
        for cid,cgeom in corridors.items():
            area=geom.intersection(cgeom).area
            if area>1: actual_corridor_conflicts.append((rid,cid,area))
    graph=model["topologyGraph"];node_ids={x["id"] for x in graph["nodes"]}
    if len(node_ids)!=len(graph["nodes"]): errors.append("Topology node IDs are not unique")
    relations=graph["relations"]
    for relation in relations:
        if relation.get("from") not in node_ids or relation.get("to") not in node_ids: errors.append(f"Dangling topology relation: {relation}");break
        if relation["type"]=="ADJACENT_TO" and relation.get("passability")!="UNKNOWN": errors.append("Adjacency was promoted to passability")
        if relation["type"]=="ADJACENT_TO" and relation.get("overlapPt2",0)>1: errors.append("Overlapping spaces are incorrectly marked adjacent")
    conflict_relations={(r["from"],r["to"]) for r in relations if r["type"]=="SPATIAL_CONFLICT"}|{(r["to"],r["from"]) for r in relations if r["type"]=="SPATIAL_CONFLICT"}
    for rid,cid,area in actual_corridor_conflicts:
        key=(f"FF01-SPACE-{rid}",cid)
        if key not in conflict_relations: errors.append(f"Unreported room/corridor conflict: {rid}/{cid}")
    wall_node_ids={n["id"] for n in graph["nodes"] if n["type"]=="STRUCTURAL_WALL_CANDIDATE"}
    for r in relations:
        if r["type"]=="BOUNDED_BY" and r["to"] not in wall_node_ids: errors.append("Bounded-by relation references a missing wall candidate")
    for opening in graph["openingCandidates"]:
        if opening.get("passability")!="UNKNOWN" or opening.get("verificationLevel")!="UNVERIFIED": errors.append(f"Opening candidate improperly verified: {opening['id']}")
        used.update(opening.get("sourcePathIDs",[]))
    if graph["formalNavigationEdges"]: errors.append("Formal navigation edges must remain disabled until topology review")
    if any(s.get("verificationLevel")!="UNVERIFIED" for s in spaces): errors.append("No Drawing/Field verification records exist; generated spaces must remain unverified")
    perimeter=model["buildingFootprint"]["perimeterGraph"]
    if perimeter["segmentCount"]!=len(model["buildingFootprint"]["boundarySegments"]): errors.append("Exterior graph segment count mismatch")
    if model["buildingFootprint"].get("geometry") is not None: errors.append("V9 must not claim closed footprint without source-supported closure")
    if len(model["arena"]["v9SemanticModel"]["seatFootprintClusters"])!=6 or sum(x["seatCount"] for x in model["arena"]["v9SemanticModel"]["seatFootprintClusters"])!=572: errors.append("Arena seat source accounting changed")
    if model["arena"]["v9SemanticModel"]["ringCorridor"] is not None: warnings.append("Arena ring corridor candidate is present; review before circulation use")
    if len(model["mWestRegion"]["conflicts"]) and not actual_corridor_conflicts: errors.append("M-West conflict report is stale")
    if model["coverage"]["drawingVerifiedSpaces"]!=0 or model["coverage"]["fieldVerified"]!=0: errors.append("V9 must not create human verification records")
    for room_id in ["M102"]:
        # V9 preserves old pilot geometry in V8; human review storage is not touched by the builder.
        if not any(x["sourceRoomID"]==room_id for x in v8["spaces"]): errors.append("M102 V8 candidate/revision lineage absent")
    coverage=model["coverage"]
    drawing_matched=coverage["drawingMatchedSpaces"]
    drawing_verified=coverage["drawingVerifiedSpaces"]
    edge_types=Counter(edge["boundaryType"] for room in spaces for edge in room.get("boundaryEdgesV9",[]))
    edge_lengths={key:round(sum(edge["lengthPt"] for room in spaces for edge in room.get("boundaryEdgesV9",[]) if edge["boundaryType"]==key),3) for key in {"PHYSICAL_WALL_BOUNDARY_CANDIDATE","DOOR_OPENING_CANDIDATE","GLAZING_BOUNDARY_CANDIDATE","UNSUPPORTED_INFERRED_BOUNDARY"}}
    metrics={"sourceLabelOccurrences":len(spaces),"candidateRoomPolygons":len(polygons),"drawingMatched":drawing_matched,"drawingVerified":drawing_verified,"candidateRoomRoomOverlapPairs":len(room_overlaps),"reportedRoomCorridorConflicts":len(actual_corridor_conflicts),"topologyNodes":len(graph["nodes"]),"topologyRelations":len(relations),"topologyRelationTypes":dict(__import__("collections").Counter(r["type"] for r in relations)),"wallTraceObjects":len(model["wallNetwork"]["semanticObjects"]),"mWestWallTraceObjects":coverage["wallTraceObjectsInMWest"],"openingCandidates":len(graph["openingCandidates"]),"formalNavigationEdges":len(graph["formalNavigationEdges"]),"boundaryEdgeTypes":dict(edge_types),"boundaryLengthByEvidenceTypePt":edge_lengths,"exteriorSegments":perimeter["segmentCount"],"exteriorOpenEndpoints":perimeter["openEndpointCount"],"exteriorGapCandidates":len(perimeter["gapCandidates"]),"exteriorClosedComponentsUnclassified":perimeter["closedComponentCount"],"arenaCourtCandidates":len(model["arena"]["v9SemanticModel"]["courtSurfaceCandidates"]),"seatFootprints":sum(x["seatCount"] for x in model["arena"]["v9SemanticModel"]["seatFootprintClusters"]),"areaLabelsWithCandidates":model["qualityAudit"]["sourceLabelsWithAreaText"],"ambiguousAreaLabels":model["qualityAudit"]["unresolvedAreaAssociations"],"labelsWithoutAreaCandidate":model["qualityAudit"]["labelsWithoutAreaCandidate"]}
    gates={"DATA_INTEGRITY":"PASS" if not errors else "FAIL","GEOMETRY_CONSTRUCTION":"PARTIAL" if len(polygons)<len(spaces) or not model["buildingFootprint"].get("geometry") else "CANDIDATE_COMPLETE_UNVERIFIED","TOPOLOGY_CONSISTENCY":"PARTIAL" if actual_corridor_conflicts or room_overlaps else "PARTIAL_CANDIDATE","SOURCE_ALIGNMENT":"PARTIAL" if drawing_matched==0 else "CANDIDATE_MATCHED","DRAWING_VERIFICATION":"PENDING" if drawing_verified==0 else "PASS"}
    result={"modelID":model["modelID"],"sourcePdfSha256":expected,"sourceHashes":hashes,"gates":gates,"metrics":metrics,"roomCorridorConflicts":[{"roomID":a,"corridorID":b,"overlapPt2":round(x,3),"overlapM2":round(x*model["coordinateSystem"]["metresPerPdfPoint"]**2,3)} for a,b,x in actual_corridor_conflicts],"errors":errors,"warnings":warnings,"overall":"PASS_DATA_INTEGRITY_PARTIAL_GEOMETRY" if not errors else "FAIL"}
    (SRC/"canonical-architecture-v9-validation.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors: raise SystemExit(1)

if __name__=="__main__": main()
