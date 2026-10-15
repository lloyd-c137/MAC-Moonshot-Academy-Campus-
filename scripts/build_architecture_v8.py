#!/usr/bin/env python3
"""Build an editable, source-guided V8 architectural candidate model.

V8 is additive: V6/V7 remain immutable evidence baselines. Raster-seeded
spaces are candidates only; wall paths, virtual closures, and authored traces
retain explicit source provenance and unresolved boundaries.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize, unary_union

ROOT = Path(__file__).resolve().parents[1]
WALL_LAYERS = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall"}
BARRIER_LAYERS = WALL_LAYERS | {"Door", "Window / Glazing"}
M_PER_PT = 25.4 * 300 / 72 / 1000


def distance(a, b):
    return math.hypot(float(a[0]) - float(b[0]), float(a[1]) - float(b[1]))


def chains(path: dict[str, Any]) -> list[list[list[float]]]:
    out: list[list[list[float]]] = []
    current: list[list[float]] = []
    def flush():
        nonlocal current
        if len(current) >= 2:
            out.append(current)
        current = []
    for item in path.get("items", []):
        if not item:
            continue
        if item[0] == "l" and len(item) >= 3:
            a, b = [list(map(float, point)) for point in item[1:3]]
            if not current:
                current = [a, b]
            elif distance(current[-1], a) < 0.03:
                current.append(b)
            elif distance(current[-1], b) < 0.03:
                current.append(a)
            else:
                flush(); current = [a, b]
        elif item[0] == "poly" and len(item) >= 2:
            flush()
            pts = [list(map(float, point)) for point in item[1]]
            if len(pts) >= 2:
                out.append(pts + ([] if distance(pts[0], pts[-1]) < 0.03 else [pts[0]]))
    flush()
    return out


def candidate_from_seed(paths, seed, radius, close_steps):
    sx, sy = map(float, seed)
    crop = (sx-radius, sy-radius, sx+radius, sy+radius)
    scale = 2.0
    width, height = round(radius*2*scale), round(radius*2*scale)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    clip = box(*crop)
    selected = []
    for path in paths:
        if path.get("layerSemantic") not in BARRIER_LAYERS:
            continue
        rect = path.get("rectPt")
        if not rect or not box(*rect).intersects(clip):
            continue
        selected.append(path)
        line_width = max(1, round(max(float(path.get("width") or 0), 0.8)*scale))
        for chain in chains(path):
            pts = [(round((x-crop[0])*scale), round((y-crop[1])*scale)) for x, y in chain]
            if path.get("fill") is not None and len(pts) >= 3:
                draw.polygon(pts, fill=255)
            if len(pts) >= 2:
                draw.line(pts, fill=255, width=line_width, joint="curve")

    result = None
    for close_pt in close_steps:
        kernel = max(3, round(close_pt*scale)); kernel += 1-kernel % 2
        closed = mask.filter(ImageFilter.MaxFilter(kernel)).filter(ImageFilter.MinFilter(kernel)) if close_pt else mask
        free = Image.eval(closed, lambda pixel: 0 if pixel else 255)
        seed_px = (round((sx-crop[0])*scale), round((sy-crop[1])*scale))
        if not (0 <= seed_px[0] < width and 0 <= seed_px[1] < height):
            continue
        ImageDraw.floodfill(free, seed_px, 128, thresh=0)
        component = np.asarray(free) == 128
        ys, xs = np.where(component)
        if not len(xs) or component[0].any() or component[-1].any() or component[:,0].any() or component[:,-1].any():
            continue
        # Trace the boundary of only the seed-connected component.
        boundary = []
        for py, px in zip(ys.tolist(), xs.tolist()):
            if py == 0 or not component[py-1, px]: boundary.append(LineString([(px,py),(px+1,py)]))
            if px+1 >= width or not component[py,px+1]: boundary.append(LineString([(px+1,py),(px+1,py+1)]))
            if py+1 >= height or not component[py+1,px]: boundary.append(LineString([(px+1,py+1),(px,py+1)]))
            if px == 0 or not component[py,px-1]: boundary.append(LineString([(px,py+1),(px,py)]))
        faces = list(polygonize(unary_union(boundary)))
        local_seed = Point(seed_px)
        containing = [face for face in faces if face.covers(local_seed)]
        if not containing:
            continue
        face = min(containing, key=lambda geom: geom.area)
        ring = [(crop[0]+x/scale, crop[1]+y/scale) for x,y in face.exterior.coords]
        poly = Polygon(ring).simplify(0.75, preserve_topology=True)
        if not poly.is_valid or poly.area <= 10:
            continue
        result = (poly, close_pt, selected)
        break
    return result


def serialize_poly(poly: Polygon):
    ring = [[round(float(x), 3), round(float(y), 3)] for x,y in poly.exterior.coords]
    if ring[0] != ring[-1]: ring.append(ring[0])
    holes = []
    for interior in poly.interiors:
        hole = [[round(float(x),3),round(float(y),3)] for x,y in interior.coords]
        if hole[0] != hole[-1]: hole.append(hole[0])
        holes.append(hole)
    return {"type":"Polygon","coordinates":[ring,*holes]}


def geometry_lines(poly: Polygon):
    return [LineString([a,b]) for a,b in zip(poly.exterior.coords, list(poly.exterior.coords)[1:])]


def edge_evidence(poly, paths, radius=2.5):
    indexed=[]
    for path in paths:
        if path.get("layerSemantic") not in BARRIER_LAYERS: continue
        for chain in chains(path):
            if len(chain)>=2:
                line=LineString(chain)
                if line.length>0.01: indexed.append((line,path))
    edges=[]; used=set()
    for index, edge in enumerate(geometry_lines(poly),1):
        midpoint=edge.interpolate(.5,normalized=True)
        nearest=sorted(((line.distance(midpoint),line,path) for line,path in indexed),key=lambda x:x[0])[:4]
        matches=[row for row in nearest if row[0]<=radius]
        for _,_,path in matches: used.add(path.get("sourcePathID") or path["id"])
        edges.append({"edgeID":f"E{index:02d}","startPt":[round(v,3) for v in edge.coords[0]],"endPt":[round(v,3) for v in edge.coords[-1]],"lengthPt":round(edge.length,3),"sourcePathIDs":[path.get("sourcePathID") or path["id"] for _,_,path in matches],"sourceLayers":sorted({path.get("layerSemantic","Unknown") for _,_,path in matches}),"evidenceStatus":"VECTOR_ALIGNED_CANDIDATE" if matches else "UNSUPPORTED_OR_VIRTUAL_CLOSURE","verificationLevel":"UNVERIFIED"})
    return edges,sorted(used)


def seat_clusters(seats: list[dict[str, Any]], tolerance_pt: float = 2.0):
    """Group source seat footprints into plan clusters without filling the gaps."""
    rows=[]
    for seat in seats:
        poly=Polygon(seat["geometry"]["coordinates"][0])
        rows.append((seat,poly))
    # Buffer is used for connectivity only. Exported component geometry is the
    # original union, so the illustrative clustering tolerance adds no floor.
    links=[(seat,poly.buffer(tolerance_pt)) for seat,poly in rows]
    parent=list(range(len(links)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(i,j):
        a,b=find(i),find(j)
        if a!=b: parent[b]=a
    from shapely.strtree import STRtree
    tree=STRtree([g for _,g in links])
    for i,(_,geom) in enumerate(links):
        for j in tree.query(geom):
            j=int(j)
            if j>i and geom.intersects(links[j][1]): union(i,j)
    groups={}
    for i,(seat,_) in enumerate(rows): groups.setdefault(find(i),[]).append(seat)
    result=[]
    for idx,items in enumerate(sorted(groups.values(),key=lambda g:min(s["sourcePathID"] for s in g)),1):
        polys=[Polygon(s["geometry"]["coordinates"][0]) for s in items]
        merged=unary_union(polys)
        components=list(merged.geoms) if hasattr(merged,"geoms") else [merged]
        mp={"type":"MultiPolygon","coordinates":[[[[round(x,3),round(y,3)] for x,y in comp.exterior.coords],*[[[round(x,3),round(y,3)] for x,y in ring.coords] for ring in comp.interiors]] for comp in components]}
        result.append({"id":f"FF01-ARENA-SEAT-CLUSTER-{idx:02d}","type":"SOURCE_SEAT_FOOTPRINT_CLUSTER","geometry":mp,"seatCount":len(items),"sourcePathIDs":sorted(s["sourcePathID"] for s in items),"clusteringTolerancePt":tolerance_pt,"toleranceUsedOnlyForConnectivity":True,"status":"DERIVED_CANDIDATE","verificationLevel":"UNVERIFIED","note":"Geometry is the exact union of source seat footprints; this is not a complete spectator-stand deck polygon."})
    return result


def write_geometry_evidence(repo: Path, model: dict[str, Any]):
    source_image=repo/"public/ff01-source-plan.png"
    if not source_image.exists(): return
    base=Image.open(source_image).convert("RGBA")
    sx=base.width/model["coordinateSystem"]["pageSizePt"][0]
    sy=base.height/model["coordinateSystem"]["pageSizePt"][1]
    overlay=Image.new("RGBA",base.size,(0,0,0,0)); draw=ImageDraw.Draw(overlay)
    def pix(point): return (round(point[0]*sx),round(point[1]*sy))
    colors={"M105":(30,150,90,135),"M106":(40,115,220,135),"M107":(220,145,35,135)}
    for space in model["spaces"]:
        if space["sourceRoomID"] not in colors or not space.get("geometry"): continue
        ring=space["geometry"]["coordinates"][0]; pts=[pix(p) for p in ring]
        color=colors[space["sourceRoomID"]]
        draw.polygon(pts,fill=color,outline=(color[0],color[1],color[2],255),width=3)
        for edge in space.get("boundaryEdges",[]):
            if edge["evidenceStatus"]!="VECTOR_ALIGNED_CANDIDATE":
                draw.line([pix(edge["startPt"]),pix(edge["endPt"])],fill=(220,45,50,255),width=5)
    for corridor in model["circulation"]["corridors"]:
        pts=[pix(p) for p in corridor["geometry"]["coordinates"][0]]
        draw.polygon(pts,fill=(30,130,205,110),outline=(15,90,165,255),width=4)
        for edge in corridor.get("boundaryEdges",[]):
            if edge["evidenceStatus"]!="SOURCE_BOUNDARY_CANDIDATE":
                draw.line([pix(edge["startPt"]),pix(edge["endPt"])],fill=(225,45,45,255),width=6)
    outdir=repo/"output/architecture-v8";outdir.mkdir(parents=True,exist_ok=True)
    Image.alpha_composite(base,overlay).convert("RGB").save(outdir/"m-west-source-overlay.png")
    # Show canonical candidates alone, independent of the drawing background.
    blank=Image.new("RGBA",base.size,(249,248,242,255));Image.alpha_composite(blank,overlay).convert("RGB").save(outdir/"m-west-geometry-only.png")
    bounds=(460,1180,760,1400)
    crop=tuple(round(v*scale) for v,scale in zip(bounds,(sx,sy,sx,sy)))
    Image.alpha_composite(base,overlay).crop(crop).convert("RGB").resize((1500,1100)).save(outdir/"m-west-source-overlay-detail.png")
    perimeter=Image.new("RGBA",base.size,(0,0,0,0));pd=ImageDraw.Draw(perimeter)
    for seg in model["buildingFootprint"]["boundarySegments"]:
        pd.line([pix(p) for p in seg["geometry"]["coordinates"]],fill=(202,55,42,225),width=3)
    Image.alpha_composite(base,perimeter).convert("RGB").save(outdir/"open-footprint-source-evidence.png")


def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--repo",type=Path,default=ROOT); args=parser.parse_args(); repo=args.repo.resolve()
    src=repo/"data/source"; v7=json.loads((src/"canonical-architecture-v7.json").read_text()); edits=json.loads((src/"architecture-v8-edits.json").read_text())
    with gzip.open(src/"ff01-vectors.json.gz","rt",encoding="utf-8") as stream: cache=json.load(stream)
    expected=v7["sourceMetadata"]["sourcePdfSha256"]
    if cache["summary"]["sourcePdfSha256"]!=expected or edits["sourcePdfSha256"]!=expected: raise SystemExit("V8 inputs refer to different source PDFs")
    paths=cache["cadDrawings"]
    labels={space["sourceRoomID"]:space for space in v7["spaces"]}
    additions=[]; seed_reports=[]; attempted={}
    seed_specs={row["roomID"]:row for row in edits["recoverySeeds"]}
    all_seed_specs=[]
    for space in v7["spaces"]:
        if space["geometry"] is not None: continue
        explicit=seed_specs.get(space["sourceRoomID"])
        if explicit:
            all_seed_specs.append(explicit)
        elif edits.get("recoveryScope",{}).get("attemptAllUnmodeledLabels"):
            all_seed_specs.append({"roomID":space["sourceRoomID"],"closePt":edits["recoveryScope"]["defaultClosePt"],"cropRadiusPt":edits["recoveryScope"]["defaultCropRadiusPt"]})
    for seed_spec in all_seed_specs:
        room_id=seed_spec["roomID"]
        if room_id not in labels: raise SystemExit(f"Unknown source room label: {room_id}")
        result=candidate_from_seed(paths,labels[room_id]["sourceLabelPt"],seed_spec["cropRadiusPt"],seed_spec["closePt"])
        if not result:
            attempted[room_id]={"status":"UNRESOLVED","reason":"Seeded structural mask leaked to crop boundary or failed to form a valid bounded region."}
            seed_reports.append({"roomID":room_id,**attempted[room_id]}); continue
        poly,close_pt,local_paths=result
        edges,pids=edge_evidence(poly,local_paths)
        ratio=sum(edge["evidenceStatus"]=="VECTOR_ALIGNED_CANDIDATE" for edge in edges)/max(1,len(edges))
        area_m2=poly.area*M_PER_PT**2
        scope=edits.get("recoveryScope",{})
        if ratio<float(scope.get("minimumVectorAlignedBoundaryRatio",0.7)) or not float(scope.get("minimumAreaM2",0))<=area_m2<=float(scope.get("maximumAreaM2",1e9)):
            attempted[room_id]={"status":"UNRESOLVED","reason":"Candidate did not meet the declared vector-evidence ratio or bounded-area sanity gate; area annotation was not used to reshape geometry.","vectorAlignedBoundaryRatio":round(ratio,3),"candidateAreaM2":round(area_m2,3)}
            seed_reports.append({"roomID":room_id,**attempted[room_id]}); continue
        source=labels[room_id]
        annotated=source.get("areaAnnotation") or ""
        area_match=re.search(r"([0-9]+(?:\.[0-9]+)?)\s*m",annotated)
        annotated_m2=float(area_match.group(1)) if area_match else None
        area_m2=round(poly.area*M_PER_PT**2,3)
        deviation=round((area_m2-annotated_m2)/annotated_m2*100,2) if annotated_m2 else None
        row={**source,"spaceID":f"FF01-SPACE-{room_id}","geometry":serialize_poly(poly),"areaM2":area_m2,"areaAnnotationDiagnostic":{"annotatedM2":annotated_m2,"candidateDeltaPercent":deviation,"usedToAlterGeometry":False},"geometryStatus":"CANDIDATE","verificationLevel":"UNVERIFIED","sourcePathIDs":pids,"authoringMethod":"ROOM_SEEDED_RASTER_WITH_NATIVE_VECTOR_EVIDENCE","sourceLayers":sorted({p.get("layer") for p in local_paths if p.get("layerSemantic") in BARRIER_LAYERS}),"boundaryEdges":edges,"unresolvedEdges":[edge for edge in edges if edge["evidenceStatus"]!="VECTOR_ALIGNED_CANDIDATE"],"segmentation":{"seedPt":source["sourceLabelPt"],"temporaryClosingPt":close_pt,"temporaryClosureIsPhysicalWall":False,"maskLayers":sorted(BARRIER_LAYERS),"cropRadiusPt":seed_spec["cropRadiusPt"]},"candidateRevision":1}
        additions.append(row); attempted[room_id]={"status":"CANDIDATE","candidateAreaM2":row["areaM2"],"vectorAlignedBoundaryRatio":round(ratio,3),"temporaryClosingPt":close_pt,"unresolvedEdges":len(row["unresolvedEdges"])}
        seed_reports.append({"roomID":room_id,**attempted[room_id],"annotatedArea":row.get("areaAnnotation"),"candidateDeltaPercent":deviation,"boundaryEdges":len(edges),"vectorAlignedEdges":sum(e["evidenceStatus"]=="VECTOR_ALIGNED_CANDIDATE" for e in edges),"sourcePathIDs":pids})
    additions_by_id={space["sourceRoomID"]:space for space in additions}
    all_spaces=[]
    for space in v7["spaces"]:
        if space["sourceRoomID"] in additions_by_id: all_spaces.append(additions_by_id[space["sourceRoomID"]])
        else: all_spaces.append({**space,"spaceID":f"FF01-SPACE-{space['sourceRoomID']}","authoringMethod":"V7_SOURCE_CANDIDATE_OR_LABEL_ANCHOR","boundaryEdges":[],"sourceLayers":[],"candidateRevision":1,"recoveryAttempt":attempted.get(space["sourceRoomID"])})

    # Exterior source evidence is deliberately open where the drawing contains
    # entries, discontinuities, or ambiguous line classes. No grid rectangle.
    perimeter=[]
    # Narrow search strips around observed exterior wall bands. Segment portions
    # are clipped to the bands, so long interior walls crossing the perimeter
    # do not appear as exterior boundaries.
    zones=[box(360,300,1745,320),box(360,1384,1745,1402),box(458,300,478,1402),box(1714,300,1732,1402)]
    for path in paths:
        if path.get("layerSemantic") not in WALL_LAYERS: continue
        for chain in chains(path):
            for a,b in zip(chain,chain[1:]):
                line=LineString([a,b]); x0,y0,x1,y1=line.bounds
                if line.length<1.8: continue
                for zone in zones:
                    clipped=line.intersection(zone)
                    pieces=[clipped] if clipped.geom_type=="LineString" else [g for g in getattr(clipped,"geoms",[]) if g.geom_type=="LineString"]
                    for piece in pieces:
                        if piece.length<1.0: continue
                        perimeter.append({"id":f"PERIM-{path.get('sourcePathID') or path['id']}-{len(perimeter)+1:05d}","geometry":{"type":"LineString","coordinates":[[round(x,3),round(y,3)] for x,y in piece.coords]},"sourcePathID":path.get("sourcePathID") or path["id"],"sourceLayer":path.get("layer"),"geometryStatus":"TRACE_ONLY","verificationLevel":"UNVERIFIED"})

    corridor_objects=[]
    for authored in edits["authoredObjects"]:
        poly=Polygon(authored["coordinatesPdfDisplayPt"])
        if not poly.is_valid or poly.area<=0: raise SystemExit(f"Invalid authored geometry {authored['id']}")
        evidence,nearest_ids=edge_evidence(poly,paths,radius=1.25)
        explicit_ids=set(authored.get("sourcePathIDs",[]))
        for edge in evidence:
            edge["evidenceStatus"]="SOURCE_BOUNDARY_CANDIDATE" if set(edge["sourcePathIDs"])&explicit_ids else "UNRESOLVED_TRACE_EDGE"
        corridor_objects.append({**authored,"geometry":serialize_poly(poly),"areaM2":round(poly.area*M_PER_PT**2,3),"boundaryReferences":[f"{authored['id']}:E{i+1}" for i in range(len(poly.exterior.coords)-1)],"boundaryEdges":evidence,"geometryStatus":"CANDIDATE","verificationLevel":"UNVERIFIED","passabilityStatus":"UNKNOWN"})

    arena_source={
        "courtBoundaryCandidates":v7["arena"]["courtBoundaries"],
        "seatFootprintCandidates":v7["arena"]["seatFootprints"],
        "standTraceCandidates":v7["arena"]["standTraces"],
        "boundaryTraceCandidates":v7["arena"]["arenaBoundaryTraces"],
        "semanticRegions":[
            {"id":"FF01-ARENA-COURT-BOUNDARY-WEST","type":"COURT_BOUNDARY_CANDIDATE","geometry":v7["arena"]["courtBoundaries"][0]["geometry"],"sourcePathIDs":[v7["arena"]["courtBoundaries"][0]["sourcePathID"]],"status":"CANDIDATE","verificationLevel":"UNVERIFIED"},
            {"id":"FF01-ARENA-COURT-BOUNDARY-EAST","type":"COURT_BOUNDARY_CANDIDATE","geometry":v7["arena"]["courtBoundaries"][1]["geometry"],"sourcePathIDs":[v7["arena"]["courtBoundaries"][1]["sourcePathID"]],"status":"CANDIDATE","verificationLevel":"UNVERIFIED"},
        ],
        "seatFootprintClusters":seat_clusters(v7["arena"]["seatFootprints"]),
        "ringCorridor":None,
        "unresolved":[{"id":"FF01-ARENA-RING-CORRIDOR","reason":"Arena line/seat evidence is available, but the walkable ring boundary and openings cannot be separated from seating and adjacent spaces without review."}]
    }

    native_ids={p.get("sourcePathID") or p["id"] for p in paths}
    used_ids={p["sourcePathID"] for p in perimeter}|{pid for space in all_spaces for pid in space.get("sourcePathIDs",[])}|{pid for obj in corridor_objects for pid in obj.get("sourcePathIDs",[])}
    for obj in arena_source["semanticRegions"]: used_ids.update(obj["sourcePathIDs"])
    bad=sorted(used_ids-native_ids)
    if bad: raise SystemExit(f"V8 refers to absent source IDs: {bad[:5]}")
    model={
      "schemaVersion":1,"modelID":"FF01-ARCHITECTURE-V8","modelStatus":"SOURCE_GUIDED_DIGITIZATION_CANDIDATE",
      "sourceMetadata":{**v7["sourceMetadata"],"sourceModelVersion":"FF01-ARCHITECTURE-V7","generatedAt":datetime.now(timezone.utc).isoformat()},
      "coordinateSystem":v7["coordinateSystem"],
      "buildingFootprint":{"geometry":None,"candidateGeometry":None,"geometryStatus":"OPEN_BOUNDARY_CANDIDATE","verificationLevel":"UNVERIFIED","sourcePathIDs":sorted({p["sourcePathID"] for p in perimeter}),"boundarySegments":perimeter,"unresolvedBoundaries":[{"id":"FF01-FOOTPRINT-GAP-REVIEW","reason":"Source perimeter has openings and non-continuous/ambiguous exterior traces. A closed footprint is not asserted; inspect the listed source segments and close only with source evidence."}]},
        "wallNetwork":{**v7["wallNetwork"],"sourcePathIDs":sorted({row.get("sourcePathID") for row in v7["wallNetwork"]["traceObjects"]+v7["wallNetwork"]["wallFaceCandidates"] if row.get("sourcePathID")}),"geometrySemantics":"Native wall faces are source-fill candidates; single-line paths remain traces. No inferred wall thickness is promoted."},
      "spaces":all_spaces,
      "circulation":{"corridors":corridor_objects,"entranceHalls":[],"geometryStatus":"PARTIAL_CANDIDATE","unresolvedObjects":[{"id":"FF01-CORRIDOR-CONNECTIONS","reason":"Only the M-west narrow passage candidate is digitized; exact openings and additional corridor extents require review."}]},
      "arena":arena_source,
      "openings":{"candidates":[],"status":"NOT_PROMOTED","unresolvedObjects":[{"id":"FF01-OPENINGS-ALL","reason":"Door leaf source paths are not promoted to walkable openings without confirmed wall gap and adjacent-space association."}]},
      "coverage":{"sourceLabelOccurrences":len(all_spaces),"uniqueBaseRoomCodes":len({s["baseRoomCode"] for s in all_spaces}),"candidateRoomPolygons":sum(s.get("geometry") is not None for s in all_spaces),"drawingMatchedSpaces":0,"drawingVerifiedSpaces":0,"missingRoomGeometry":sum(s.get("geometry") is None for s in all_spaces),"corridorPolygons":len(corridor_objects),"arenaSemanticRegions":len(arena_source["semanticRegions"]),"openBoundarySegments":len(perimeter),"sourcePathReferenceCount":len(used_ids),"sourceLabelInventoryComplete":True,"bySeries":{series:{"sourceLabels":sum(s["baseRoomCode"].startswith(series) for s in all_spaces),"candidatePolygons":sum(s["baseRoomCode"].startswith(series) and s.get("geometry") is not None for s in all_spaces),"missingGeometry":sum(s["baseRoomCode"].startswith(series) and s.get("geometry") is None for s in all_spaces)} for series in ["M","S","A"]}},
      "illustrative3D":{"wallHeightM":2.8,"floorThicknessM":0.12,"seatStepHeightM":0.18,"parametersAreMeasured":False},
      "provenancePolicy":"Source P-ID establishes provenance, not semantic verification. Seeded polygons and traced circulation remain candidates until independent review."
    }
    out=src/"canonical-architecture-v8.json";out.write_text(json.dumps(model,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    shutil.copy2(out,repo/"public/ff01-architecture-v8.json")
    report={"model":"canonical-architecture-v8.json","sourcePdfSha256":expected,"sourceLabels":len(all_spaces),"candidateRoomPolygons":model["coverage"]["candidateRoomPolygons"],"newRoomCandidates":len(additions),"seedResults":seed_reports,"corridorPolygons":len(corridor_objects),"buildingFootprint":"OPEN_BOUNDARY_CANDIDATE","openExteriorSegments":len(perimeter),"arenaSemanticRegions":len(arena_source["semanticRegions"]),"arenaSeatFootprintCandidates":len(arena_source["seatFootprintCandidates"]),"sourcePathReferences":len(used_ids),"drawingMatched":0,"drawingVerified":0,"status":"PARTIAL_SOURCE_GUIDED_CANDIDATE"}
    (src/"canonical-architecture-v8-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    write_geometry_evidence(repo,model)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__": main()
