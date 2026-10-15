#!/usr/bin/env python3
"""Dynamic integrity and construction checks for V8 geometry candidates."""
from __future__ import annotations
import gzip, hashlib, json, math
from itertools import combinations
from pathlib import Path
from shapely.geometry import LineString, Polygon, shape

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"data/source"

def walk_source_ids(node):
    if isinstance(node,dict):
        if isinstance(node.get("sourcePathID"),str): yield node["sourcePathID"]
        ids=node.get("sourcePathIDs")
        if isinstance(ids,list): yield from (value for value in ids if isinstance(value,str))
        for key,value in node.items():
            if key not in {"sourcePathID","sourcePathIDs"}: yield from walk_source_ids(value)
    elif isinstance(node,list):
        for value in node: yield from walk_source_ids(value)

def check_polygon(feature, errors):
    geometry=feature.get("geometry")
    if not geometry:
        errors.append(f"{feature.get('id') or feature.get('spaceID')}: expected geometry")
        return None
    try: geom=shape(geometry)
    except Exception as exc:
        errors.append(f"{feature.get('id') or feature.get('spaceID')}: geometry parse failed: {exc}");return None
    if geom.geom_type not in {"Polygon","MultiPolygon"} or not geom.is_valid or geom.area<=0:
        errors.append(f"{feature.get('id') or feature.get('spaceID')}: invalid polygon geometry");return None
    coords=[]
    if geom.geom_type=="Polygon": coords=[list(geom.exterior.coords),*[list(r.coords) for r in geom.interiors]]
    else:
        coords=[ring for part in geom.geoms for ring in [list(part.exterior.coords),*[list(r.coords) for r in part.interiors]]]
    if any(not ring or ring[0]!=ring[-1] for ring in coords): errors.append(f"{feature.get('id') or feature.get('spaceID')}: unclosed ring")
    return geom

def main():
    model=json.loads((SOURCE/"canonical-architecture-v8.json").read_text())
    edits=json.loads((SOURCE/"architecture-v8-edits.json").read_text())
    v7=json.loads((SOURCE/"canonical-architecture-v7.json").read_text())
    summary=json.loads((SOURCE/"spatial-extraction-summary.json").read_text())
    with gzip.open(SOURCE/"ff01-vectors.json.gz","rt",encoding="utf-8") as stream: cache=json.load(stream)
    errors=[]; warnings=[]
    expected=summary["sourcePdfSha256"]
    if not (model["sourceMetadata"]["sourcePdfSha256"]==expected==cache["summary"]["sourcePdfSha256"]==v7["sourceMetadata"]["sourcePdfSha256"]==edits["sourcePdfSha256"]): errors.append("Source PDF hashes do not match")
    if model["sourceMetadata"]["coordinateSystemVersion"]!=model["coordinateSystem"]["id"]: errors.append("Coordinate system version mismatch")
    cs=model["coordinateSystem"];ox,oy=cs["worldOriginPdfPt"];scale=cs["metresPerPdfPoint"]
    pagew,pageh=cs["pageSizePt"]
    checkpts=[[0,0],[pagew,0],[0,pageh],[pagew,pageh],[733.76,1154.56],[966.3835,572.777],[1025,824.92],[651.3835,1261.817]]
    max_roundtrip=0.0
    for x,y in checkpts:
        wx,wz=(x-ox)*scale,(y-oy)*scale
        rx,ry=wx/scale+ox,wz/scale+oy
        max_roundtrip=max(max_roundtrip,math.dist((x,y),(rx,ry)))
    if max_roundtrip>1e-9: errors.append("Coordinate transform round trip failed")
    source_ids={p.get("sourcePathID") or p["id"] for p in cache["cadDrawings"]}
    used=list(walk_source_ids(model));unknown=sorted(set(used)-source_ids)
    if unknown: errors.append(f"Unknown source P-IDs: {unknown[:10]}")
    if len(model["spaces"])!=101: errors.append("Source room label manifest is not fully accounted for")
    if {s["sourceRoomID"] for s in model["spaces"]}!={s["sourceRoomID"] for s in v7["spaces"]}: errors.append("V8 room labels differ from V7 source manifest")
    if model["coverage"]["sourceLabelOccurrences"]!=101 or not model["coverage"]["sourceLabelInventoryComplete"]: errors.append("Coverage accounting does not include all source labels")
    if any(s.get("verificationLevel") not in {"UNVERIFIED","DRAWING_VERIFIED","FIELD_VERIFIED"} for s in model["spaces"]): errors.append("Unknown verification level")
    if any(s.get("verificationLevel")!="UNVERIFIED" for s in model["spaces"]): errors.append("No human verification records were provided; generated geometry must remain UNVERIFIED")
    room_geoms={}
    for space in model["spaces"]:
        if space.get("geometry"):
            geom=check_polygon(space,errors)
            if geom: room_geoms[space["sourceRoomID"]]=geom
            if not space.get("sourcePathIDs"): errors.append(f"{space['sourceRoomID']}: candidate lacks source path provenance")
    overlap_rows=[]
    for (a,ga),(b,gb) in combinations(room_geoms.items(),2):
        area=ga.intersection(gb).area
        if area>0.5: overlap_rows.append({"roomA":a,"roomB":b,"overlapPt2":round(area,3),"overlapM2":round(area*scale*scale,4)})
    if overlap_rows: warnings.append("Candidate room overlaps exist and require review")
    corridor_geoms=[]
    for corridor in model["circulation"]["corridors"]:
        geom=check_polygon(corridor,errors)
        if geom: corridor_geoms.append(geom)
        if not corridor.get("sourcePathIDs"): errors.append(f"{corridor.get('id')}: corridor lacks source path provenance")
        if corridor.get("passabilityStatus")!="UNKNOWN": errors.append("Unreviewed corridor was promoted to passable")
    footprint=model["buildingFootprint"]
    footprint_geom=None
    if footprint.get("geometry"):
        footprint_geom=check_polygon({"id":"building-footprint","geometry":footprint["geometry"]},errors)
    perimeter_segments=footprint.get("boundarySegments",[])
    if not perimeter_segments: errors.append("No open exterior source boundary evidence provided")
    for segment in perimeter_segments:
        try:
            line=shape(segment["geometry"])
            if line.geom_type!="LineString" or line.length<=0: errors.append(f"Invalid perimeter segment {segment.get('id')}")
        except Exception: errors.append(f"Malformed perimeter evidence {segment.get('id')}")
    arena_regions=model["arena"].get("semanticRegions",[])
    for region in arena_regions: check_polygon(region,errors)
    for group in model["arena"].get("seatFootprintClusters",[]): check_polygon(group,errors)
    expected_seats=len(v7["arena"]["seatFootprints"])
    seats=sum(group["seatCount"] for group in model["arena"].get("seatFootprintClusters",[]))
    if seats!=expected_seats: errors.append("Arena seat cluster accounting lost source seat footprints")
    # V7 remains the frozen baseline; V8 must not rewrite historical review state.
    overrides=json.loads((ROOT/"data/geometry-review/overrides.json").read_text())
    if overrides.get("revision")!=5 or not any(row.get("id")=="M102" for row in overrides.get("spaces",[])): errors.append("M102 revision 5 review data is not preserved")
    if not (ROOT/"data/geometry-review/history/rev-000005.json").exists(): errors.append("M102 revision 5 history is missing")
    public=json.loads((ROOT/"public/ff01-architecture-v8.json").read_text())
    if public.get("modelID")!=model.get("modelID") or public.get("sourceMetadata",{}).get("sourcePdfSha256")!=expected: errors.append("Public V8 copy differs from source model")
    room_count=len(room_geoms)
    reviewed_edges=[edge for space in model["spaces"] for edge in space.get("boundaryEdges",[])]
    aligned_edges=sum(edge.get("evidenceStatus")=="VECTOR_ALIGNED_CANDIDATE" for edge in reviewed_edges)
    result={"result":"PASS_DATA_INTEGRITY" if not errors else "FAIL_DATA_INTEGRITY","errors":errors,"warnings":warnings,"sourcePdfSha256":expected,"sourcePathReferences":len(used),"uniqueSourcePathIDs":len(set(used)),"coordinateRoundTripMaxErrorPt":max_roundtrip,"sourceLabels":len(model["spaces"]),"candidateRoomPolygons":room_count,"candidateRoomIDs":sorted(room_geoms),"roomCoverageBySeries":model["coverage"].get("bySeries",{}),"candidateBoundaryEdges":len(reviewed_edges),"vectorAlignedCandidateEdges":aligned_edges,"candidateBoundaryAlignmentRatio":round(aligned_edges/len(reviewed_edges),4) if reviewed_edges else None,"candidateRoomOverlaps":overlap_rows,"corridorPolygons":len(corridor_geoms),"buildingFootprintGeometry":"CLOSED_CANDIDATE" if footprint_geom else "OPEN_BOUNDARY_CANDIDATE","openExteriorBoundarySegments":len(perimeter_segments),"semanticArenaRegions":len(arena_regions),"arenaSeatClusters":len(model["arena"].get("seatFootprintClusters",[])),"seatFootprintsAccounted":seats,"drawingMatched":model["coverage"]["drawingMatchedSpaces"],"drawingVerified":model["coverage"]["drawingVerifiedSpaces"],"geometryConstruction":"PARTIAL" if not footprint_geom or not corridor_geoms or room_count<9 else "CANDIDATE_COMPLETE_FOR_INITIAL_REGION","drawingVerification":"PENDING"}
    out=SOURCE/"canonical-architecture-v8-validation.json";out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors: raise SystemExit(1)

if __name__=="__main__": main()
