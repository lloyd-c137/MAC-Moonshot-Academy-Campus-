#!/usr/bin/env python3
"""Build an additive, topology-aware FF-01 geometry candidate model."""
from __future__ import annotations

import csv, gzip, hashlib, json, math, re, shutil
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.ops import unary_union

from build_architecture_v8 import M_PER_PT, candidate_from_seed, chains, edge_evidence, serialize_poly

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source"
WALL = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall"}
NONWALL = {"Door", "Window / Glazing"}
AREA = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*(?:m²|m2|㎡)", re.I)


def pdf_words(summary, anchors):
    path = Path(summary.get("sourcePdf", ""))
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != summary["sourcePdfSha256"]:
        return [], "SOURCE_PDF_UNAVAILABLE_OR_HASH_MISMATCH"
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[0]
        words = [w for w in page.extract_words() if w.get("text", "").strip()]
    room_rows = list(anchors.values())
    result = []
    for word in words:
        x = (word["x0"] + word["x1"]) / 2
        y = (word["top"] + word["bottom"]) / 2
        near = sorted((math.hypot(x-r["sourceLabelPt"][0], y-r["sourceLabelPt"][1]), r["sourceRoomID"]) for r in room_rows)
        associations = [{"roomID": rid, "distancePt": round(d, 3)} for d, rid in near if d <= 64]
        if associations:
            result.append({"text": word["text"], "bboxPt": [round(word[k], 3) for k in ("x0", "top", "x1", "bottom")], "centerPt": [round(x, 3), round(y, 3)], "candidateRoomAssociations": associations[:5]})
    return result, "PDFPLUMBER_ROTATION_NORMALIZED_WORD_BBOX"


def area_evidence(space, words, anchors):
    x, y = space["sourceLabelPt"]
    local = [w for w in words if abs(w["centerPt"][0]-x) <= 64 and abs(w["centerPt"][1]-y) <= 42]
    # Area strings can be split into adjacent PDF words. Preserve both raw
    # tokens and joined baseline text; only an unambiguous complete token is
    # machine-parsed, never used to reshape the geometry.
    rows = defaultdict(list)
    for w in local:
        rows[round(w["centerPt"][1] / 2) * 2].append(w)
    candidates = []
    for row_y, tokens in rows.items():
        tokens.sort(key=lambda item: item["bboxPt"][0])
        raw = " ".join(t["text"] for t in tokens)
        compact = re.sub(r"\s+", "", raw)
        exact_matches=list(AREA.finditer(raw))
        numeric_fragments=[t["text"] for t in tokens if re.fullmatch(r"\d+(?:\.)?|\.\d+",t["text"].strip())]
        for match in exact_matches:
            candidates.append({"valueM2": float(match.group(1)), "parse": "EXACT_TOKEN" if not numeric_fragments else "EXACT_TOKEN_WITH_ADJACENT_NUMERIC_FRAGMENTS", "rawSourceText": raw, "textBBoxesPt": [t["bboxPt"] for t in tokens], "rowYpt": row_y})
        if not AREA.search(raw) and AREA.search(compact):
            match = AREA.search(compact)
            candidates.append({"valueM2": float(match.group(1)), "parse": "JOINED_SPLIT_TOKENS", "rawSourceText": raw, "textBBoxesPt": [t["bboxPt"] for t in tokens], "rowYpt": row_y})
    for candidate in candidates:
        candidate["candidateRoomAssociations"] = []
        for room_id, anchor in anchors.items():
            if min(math.hypot((w["bboxPt"][0]+w["bboxPt"][2])/2-anchor["sourceLabelPt"][0], (w["bboxPt"][1]+w["bboxPt"][3])/2-anchor["sourceLabelPt"][1]) for w in local if w["bboxPt"] in candidate["textBBoxesPt"]) <= 22:
                candidate["candidateRoomAssociations"].append(room_id)
        candidate["candidateRoomAssociations"].sort()
    room_associations = sorted({a["roomID"] for word in local for a in word["candidateRoomAssociations"] if a["distancePt"] <= 22})
    unambiguous = [c for c in candidates if c["candidateRoomAssociations"] == [space["sourceRoomID"]] and c["parse"] == "EXACT_TOKEN"]
    confidence = "HIGH" if len(unambiguous) == 1 and len(room_associations) == 1 else "LOW" if not candidates else "AMBIGUOUS"
    return {"rawSourceText": " | ".join(w["text"] for w in local), "textBoundingBoxesPt": [w["bboxPt"] for w in local], "candidateAreaValues": candidates, "candidateRoomAssociations": room_associations, "parseConfidence": confidence, "ambiguityStatus": "UNAMBIGUOUS_CANDIDATE" if confidence == "HIGH" else "AMBIGUOUS_OR_UNPARSED", "assignedAreaM2": unambiguous[0]["valueM2"] if confidence == "HIGH" else None, "usedToAlterGeometry": False}


def load_lines(paths):
    segments, by_pid = [], defaultdict(list)
    for path in paths:
        sem = path.get("layerSemantic", "Unknown")
        if sem not in WALL | NONWALL:
            continue
        pid = path.get("sourcePathID") or path["id"]
        for chain in chains(path):
            for a, b in zip(chain, chain[1:]):
                if math.dist(a, b) < 0.03:
                    continue
                line = LineString([a, b])
                if not line.is_valid or not math.isfinite(line.length) or line.length <= 0:
                    continue
                row = {"line": line, "pid": pid, "semantic": sem, "layer": path.get("layer"), "drawingID": path.get("id")}
                segments.append(row); by_pid[pid].append(row)
    return segments, by_pid


def build_room_edges(space, tree, segments):
    if not space.get("geometry"):
        return []
    poly = shape(space["geometry"])
    ring = list(poly.exterior.coords)
    edges = []
    for index, (a, b) in enumerate(zip(ring, ring[1:]), 1):
        edge = LineString([a, b]); candidates = []
        for raw_i in tree.query(edge.buffer(2.5)):
            row = segments[int(raw_i)]
            d = edge.distance(row["line"])
            if d <= 2.5:
                candidates.append((d, row))
        candidates.sort(key=lambda r: r[0])
        nearest = candidates[:8]
        ids = list(dict.fromkeys(row["pid"] for _, row in nearest))
        sems = sorted({row["semantic"] for _, row in nearest})
        wall_rows = [row for _, row in candidates if row["semantic"] in WALL]
        door_rows = [row for _, row in candidates if row["semantic"] == "Door"]
        glass_rows = [row for _, row in candidates if row["semantic"] == "Window / Glazing"]
        def support_length(rows, tolerance=0.55):
            if not rows:
                return 0.0
            coverage = unary_union([r["line"].buffer(tolerance, cap_style="flat") for r in rows])
            return min(edge.length, edge.intersection(coverage).length)
        def supporting_ids(rows, tolerance=0.55):
            # Keep provenance for nearby paths, but only call a path boundary
            # evidence when it supports a measurable portion of this edge.
            return sorted({r["pid"] for r in rows if edge.intersection(r["line"].buffer(tolerance, cap_style="flat")).length >= 0.1})
        wall_support = support_length(wall_rows)
        door_support = support_length(door_rows)
        glass_support = support_length(glass_rows)
        if wall_support > 0.1:
            kind = "PHYSICAL_WALL_BOUNDARY_CANDIDATE"
        elif door_support > 0.1:
            kind = "DOOR_OPENING_CANDIDATE"
        elif glass_support > 0.1:
            kind = "GLAZING_BOUNDARY_CANDIDATE"
        else:
            kind = "UNSUPPORTED_INFERRED_BOUNDARY"
        nearest_wall = min((edge.distance(r["line"]) for r in wall_rows), default=None)
        side_results=[]
        if wall_rows:
            midpoint=edge.interpolate(.5,normalized=True);dx=b[0]-a[0];dy=b[1]-a[1];length=max(math.hypot(dx,dy),1e-9)
            nx,ny=-dy/length,dx/length
            inside=None
            for sign in (1,-1):
                probe=Point(midpoint.x+sign*nx*.75,midpoint.y+sign*ny*.75)
                if poly.covers(probe): inside=probe;break
            if inside is not None:
                for row in wall_rows:
                    c,d=row["line"].coords[0],row["line"].coords[-1]
                    side=(d[0]-c[0])*(inside.y-c[1])-(d[1]-c[1])*(inside.x-c[0])
                    if abs(side)>1e-5: side_results.append(side)
        side_consistent=(len(side_results)>0 and (all(x>0 for x in side_results) or all(x<0 for x in side_results))) if side_results else None
        edges.append({"edgeID": f"{space['sourceRoomID']}:E{index:02d}", "startPt": [round(a[0], 3), round(a[1], 3)], "endPt": [round(b[0], 3), round(b[1], 3)], "lengthPt": round(edge.length, 3), "boundaryType": kind, "sourcePathIDs": ids, "sourceLayers": sems, "wallSourcePathIDs": supporting_ids(wall_rows), "doorSourcePathIDs": supporting_ids(door_rows), "glazingSourcePathIDs": supporting_ids(glass_rows), "nearestCompatibleWallDistancePt": None if nearest_wall is None else round(nearest_wall, 3), "wallFaceSupportLengthPt": round(wall_support, 3), "doorEvidenceLengthPt": round(door_support, 3), "glazingEvidenceLengthPt": round(glass_support, 3), "wallSideConsistent": side_consistent, "evidenceStatus": "CANDIDATE_ONLY", "verificationLevel": "UNVERIFIED"})
    return edges


def perimeter_graph(segments, tolerance=0.45):
    # Endpoint buckets are intentionally small: this joins native CAD vertices
    # only and does not bridge entry gaps or guessed exterior discontinuities.
    rows = []
    for s in segments:
        line = shape(s["geometry"])
        rows.append({"id": s["id"], "pid": s["sourcePathID"], "layer": s["sourceLayer"], "line": line})
    points = []
    for i, row in enumerate(rows):
        points.extend([(tuple(row["line"].coords[0]), i), (tuple(row["line"].coords[-1]), i)])
    buckets = defaultdict(list)
    for p, i in points:
        key = (round(p[0] / tolerance), round(p[1] / tolerance))
        buckets[key].append((p, i))
    adj = [set() for _ in rows]; degree = Counter()
    for p, i in points:
        key = (round(p[0] / tolerance), round(p[1] / tolerance))
        neighbors = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbors.extend(buckets.get((key[0]+dx, key[1]+dy), []))
        connected = {(j, tuple(q)) for q, j in neighbors if j != i and math.dist(p, q) <= tolerance}
        if connected:
            degree[(i, p)] = 2
            for j, _ in connected: adj[i].add(j); adj[j].add(i)
        else:
            degree[(i, p)] = 1
    seen, components = set(), []
    for i in range(len(rows)):
        if i in seen: continue
        stack=[i];seen.add(i);component=[]
        while stack:
            node=stack.pop();component.append(node)
            for nxt in adj[node]:
                if nxt not in seen:seen.add(nxt);stack.append(nxt)
        components.append(component)
    endpoints = []
    for p, i in points:
        key = (round(p[0] / tolerance), round(p[1] / tolerance))
        neighbors=[]
        for dx in (-1,0,1):
            for dy in (-1,0,1): neighbors.extend(buckets.get((key[0]+dx,key[1]+dy),[]))
        if not any(j != i and math.dist(p,q)<=tolerance for q,j in neighbors):
            endpoints.append({"pointPt":[round(p[0],3),round(p[1],3)],"segmentID":rows[i]["id"],"sourcePathID":rows[i]["pid"],"layer":rows[i]["layer"]})
    # Pair nearby open ends for review; never connect them in the exported graph.
    gaps=[]; used=set()
    for i, a in enumerate(endpoints):
        if i in used: continue
        candidates=sorted((math.dist(a["pointPt"],b["pointPt"]),j,b) for j,b in enumerate(endpoints[i+1:],i+1) if j not in used and a["segmentID"] != b["segmentID"])
        if candidates and candidates[0][0] <= 18:
            dist,j,b=candidates[0];used.update((i,j));gaps.append({"id":f"EXT-GAP-{len(gaps)+1:04d}","endpointA":a,"endpointB":b,"gapDistancePt":round(dist,3),"status":"REVIEW_REQUIRED_NO_AUTOCLOSE"})
    component_rows=[]
    for ci, component in enumerate(components,1):
        closed=all(len(adj[i])==2 for i in component)
        component_id=f"EXT-CHAIN-{ci:04d}"
        for i in component: rows[i]["componentID"]=component_id
        component_rows.append({"id":component_id,"segmentCount":len(component),"sourcePathIDs":sorted({rows[i]["pid"] for i in component}),"lengthPt":round(sum(rows[i]["line"].length for i in component),3),"closedByNativeEndpoints":closed,"classification":"UNCLASSIFIED_EXTERIOR_CANDIDATE"})
    segment_map={row["id"]:row for row in rows}
    for seg in segments:
        found=segment_map.get(seg["id"])
        if found: seg["componentID"]=found["componentID"]
    return {"snapTolerancePt":tolerance,"connectedChainCount":len(components),"segmentCount":len(rows),"openEndpointCount":len(endpoints),"closedComponentCount":sum(x["closedByNativeEndpoints"] for x in component_rows),"components":component_rows,"segments":segments,"openEndpoints":endpoints,"gapCandidates":gaps}


def feature_node(feature, kind):
    return {"id": feature.get("spaceID", feature.get("id")), "type": kind, "sourceRoomID": feature.get("sourceRoomID"), "geometry": feature.get("geometry"), "status": feature.get("geometryStatus", "CANDIDATE"), "verificationLevel": feature.get("verificationLevel", "UNVERIFIED"), "sourcePathIDs": feature.get("sourcePathIDs", [])}


def save_overlay(model, source_image):
    if not source_image.exists(): return
    base=Image.open(source_image).convert("RGBA"); sx=base.width/model["coordinateSystem"]["pageSizePt"][0]; sy=base.height/model["coordinateSystem"]["pageSizePt"][1]
    def px(p): return (round(p[0]*sx),round(p[1]*sy))
    overlays=Image.new("RGBA",base.size,(0,0,0,0));d=ImageDraw.Draw(overlays)
    colors={"M104":(228,94,143,100),"M105":(36,140,210,100),"M106":(47,164,110,100)}
    for room in model["spaces"]:
        if room["sourceRoomID"] not in colors or not room.get("geometry"): continue
        pts=[px(p) for p in room["geometry"]["coordinates"][0]];color=colors[room["sourceRoomID"]]
        d.polygon(pts,fill=color,outline=(color[0],color[1],color[2],255),width=4)
    for corridor in model["corridors"]:
        pts=[px(p) for p in corridor["geometry"]["coordinates"][0]]
        d.polygon(pts,fill=(27,149,200,115),outline=(0,93,150,255),width=5)
    conflict=model["mWestRegion"]["conflicts"]
    if conflict.get("M104_CORRIDOR_OVERLAP"):
        geom=shape(conflict["M104_CORRIDOR_OVERLAP"]["geometry"])
        if geom.geom_type=="Polygon": d.polygon([px(p) for p in geom.exterior.coords],fill=(230,40,80,150),outline=(200,10,45,255),width=5)
    out=ROOT/"output/architecture-v9";out.mkdir(parents=True,exist_ok=True)
    p0,p1=map(px,[[520,1190],[720,1410]])
    # px() on corners returns coordinates; crop is source and overlay in the same page transform.
    crop=(p0[0],p0[1],p1[0],p1[1])
    Image.alpha_composite(base,overlays).crop(crop).resize((1400,1540)).convert("RGB").save(out/"m-west-topology-overlay.png")
    Image.alpha_composite(Image.new("RGBA",base.size,(249,248,242,255)),overlays).crop(crop).resize((1400,1540)).convert("RGB").save(out/"m-west-topology-geometry-only.png")
    # Exterior overview with every gap pair and endpoints marked for targeted review.
    exterior=Image.new("RGBA",base.size,(0,0,0,0));ed=ImageDraw.Draw(exterior)
    for seg in model["buildingFootprint"]["perimeterGraph"]["segments"]:
        pts=[px(p) for p in seg["geometry"]["coordinates"]];ed.line(pts,fill=(184,53,43,220),width=3)
    for gap in model["buildingFootprint"]["perimeterGraph"]["gapCandidates"]:
        p=px(gap["endpointA"]["pointPt"]);q=px(gap["endpointB"]["pointPt"]);ed.line([p,q],fill=(245,135,27,240),width=4);ed.ellipse((p[0]-4,p[1]-4,p[0]+4,p[1]+4),fill=(235,40,35,255));ed.ellipse((q[0]-4,q[1]-4,q[0]+4,q[1]+4),fill=(235,40,35,255))
    Image.alpha_composite(base,exterior).convert("RGB").save(out/"exterior-gap-review.png")
    gaps=model["buildingFootprint"]["perimeterGraph"]["gapCandidates"]
    cols=10;tile_w=160;tile_h=145
    sheet=Image.new("RGB",(cols*tile_w,math.ceil(max(len(gaps),1)/cols)*tile_h),(247,246,241))
    for index,gap in enumerate(gaps):
        a=gap["endpointA"]["pointPt"];b=gap["endpointB"]["pointPt"];mx=(a[0]+b[0])/2;my=(a[1]+b[1])/2
        radius=35;cx,cy=px([mx,my]);half_x=round(radius*sx);half_y=round(radius*sy)
        crop=base.crop((max(0,cx-half_x),max(0,cy-half_y),min(base.width,cx+half_x),min(base.height,cy+half_y))).convert("RGBA")
        cd=ImageDraw.Draw(crop);aa=px(a);bb=px(b);cd.line([(aa[0]-(cx-half_x),aa[1]-(cy-half_y)),(bb[0]-(cx-half_x),bb[1]-(cy-half_y))],fill=(245,125,20,255),width=3)
        tile=Image.alpha_composite(crop,Image.new("RGBA",crop.size,(0,0,0,0))).convert("RGB").resize((tile_w,tile_h-22))
        cell=Image.new("RGB",(tile_w,tile_h),(255,255,255));cell.paste(tile,(0,22));ImageDraw.Draw(cell).text((4,4),f"{gap['id']} · {gap['gapDistancePt']}pt",fill=(45,55,49))
        sheet.paste(cell,((index%cols)*tile_w,(index//cols)*tile_h))
    sheet.save(out/"exterior-gap-contact-sheet.png")
    # The thirteen failed labels are rendered at their source coordinate with
    # the extended-context polygon (if one formed) so review does not require
    # rerunning the seed search or navigating an unlabeled vector dump.
    review_rows=model["remaining13Recovery"]["results"]
    by_room={s["sourceRoomID"]:s for s in model["spaces"]}
    proposal_sheet=Image.new("RGB",(4*320,math.ceil(max(len(review_rows),1)/4)*350),(247,246,241))
    for index,row in enumerate(review_rows):
        room=by_room[row["roomID"]];x,y=room["sourceLabelPt"];cx,cy=px([x,y]);rx=round(110*sx);ry=round(110*sy)
        rect=(max(0,cx-rx),max(0,cy-ry),min(base.width,cx+rx),min(base.height,cy+ry));crop=base.crop(rect).convert("RGBA")
        overlay=Image.new("RGBA",crop.size,(0,0,0,0));rd=ImageDraw.Draw(overlay)
        if row.get("candidateGeometry"):
            coords=row["candidateGeometry"]["coordinates"][0]
            points=[(round(p[0]*sx-rect[0]),round(p[1]*sy-rect[1])) for p in coords]
            fill=(30,148,100,90) if row["status"]=="CANDIDATE_ADDED" else (231,151,27,85)
            rd.polygon(points,fill=fill,outline=(220,100,15,255),width=3)
        rd.ellipse((cx-rect[0]-5,cy-rect[1]-5,cx-rect[0]+5,cy-rect[1]+5),fill=(195,36,36,255))
        tile=Image.alpha_composite(crop,overlay).convert("RGB").resize((320,320))
        cell=Image.new("RGB",(320,350),(255,255,255));cell.paste(tile,(0,26));ImageDraw.Draw(cell).text((5,5),f"{row['roomID']} · {row['status']}",fill=(40,50,45))
        proposal_sheet.paste(cell,((index%4)*320,(index//4)*350))
        tile.save(out/f"remaining13-{row['roomID']}.png")
    proposal_sheet.save(out/"remaining13-review-contact-sheet.png")


def main():
    v8=json.loads((SOURCE/"canonical-architecture-v8.json").read_text());v7=json.loads((SOURCE/"canonical-architecture-v7.json").read_text());summary=json.loads((SOURCE/"spatial-extraction-summary.json").read_text())
    with gzip.open(SOURCE/"ff01-vectors.json.gz","rt",encoding="utf-8") as f: cache=json.load(f)
    if cache["summary"]["sourcePdfSha256"] != v8["sourceMetadata"]["sourcePdfSha256"]: raise SystemExit("V8/PDF hash mismatch")
    paths=cache["cadDrawings"]; segments, by_pid=load_lines(paths)
    from shapely.strtree import STRtree
    tree=STRtree([row["line"] for row in segments])
    labels={s["sourceRoomID"]:s for s in v8["spaces"]}
    words,word_status=pdf_words(summary,labels)

    # V8's remaining labels get one larger-context recovery attempt. Candidate
    # polygons are retained only when they contain their seed, meet bounded
    # area/support checks, and do not overlap an existing candidate.
    expanded=[]; expanded_results=[]
    existing=[(s["sourceRoomID"],shape(s["geometry"])) for s in v8["spaces"] if s.get("geometry")]
    for room in v8["spaces"]:
        if room.get("geometry") is not None: continue
        result=candidate_from_seed(paths,room["sourceLabelPt"],150,[2,4,6,8,10,12,16])
        if not result:
            expanded_results.append({"roomID":room["sourceRoomID"],"status":"UNRESOLVED","reason":"No bounded seed-connected component at 150 pt regional context; likely open adjacency, non-room public region, or missing barrier evidence."});continue
        poly,closing,local=result
        edges,pids=edge_evidence(poly,local)
        shaped=Polygon(poly)
        support=sum(e["lengthPt"] for e in edges if set(e.get("sourceLayers",[])) & WALL)/max(1,sum(e["lengthPt"] for e in edges))
        overlaps=[(rid,shaped.intersection(g).area) for rid,g in existing if shaped.intersection(g).area>1.0]
        area=shaped.area*M_PER_PT**2
        if not shaped.is_valid or not (5<=area<=800) or support<0.60 or overlaps:
            expanded_results.append({"roomID":room["sourceRoomID"],"status":"UNRESOLVED","reason":"Extended seed region failed geometry, wall-support, bounded-area or conflict screen; proposal is retained for review only.","candidateAreaM2":round(area,3),"wallSupportRatio":round(support,3),"overlapCandidates":[{"roomID":rid,"areaPt2":round(a,3)} for rid,a in overlaps],"temporaryClosurePt":closing,"sourcePathIDs":pids,"candidateGeometry":serialize_poly(shaped)});continue
        row={**room,"geometry":serialize_poly(shaped),"areaM2":round(area,3),"geometryStatus":"CANDIDATE","verificationLevel":"UNVERIFIED","sourcePathIDs":pids,"authoringMethod":"V9_EXTENDED_CONTEXT_SOURCE_GUIDED_CANDIDATE","candidateRevision":int(room.get("candidateRevision",0))+1,"segmentation":{"seedPt":room["sourceLabelPt"],"cropRadiusPt":150,"temporaryClosingPt":closing,"temporaryClosureIsPhysicalWall":False},"boundaryEdges":edges}
        expanded.append(row);existing.append((room["sourceRoomID"],shaped));expanded_results.append({"roomID":room["sourceRoomID"],"status":"CANDIDATE_ADDED","candidateAreaM2":round(area,3),"wallSupportRatio":round(support,3),"temporaryClosurePt":closing,"sourcePathIDs":pids,"candidateGeometry":serialize_poly(shaped)})

    spaces_by_id={s["sourceRoomID"]:{**s} for s in v8["spaces"]}
    for row in expanded: spaces_by_id[row["sourceRoomID"]]=row
    spaces=list(spaces_by_id.values())
    for room in spaces:
        room["areaTextEvidence"]=area_evidence(room,words,labels)
        room["boundaryEdgesV9"]=build_room_edges(room,tree,segments) if room.get("geometry") else []

    corridors=v8["circulation"]["corridors"]
    for corridor in corridors:
        corridor["boundaryEdgesV9"] = build_room_edges({"sourceRoomID":corridor["id"],"geometry":corridor["geometry"]},tree,segments)
    corridor_geoms=[(c,shape(c["geometry"])) for c in corridors]
    conflicts={}
    for rid in ["M104","M105","M106"]:
        room=spaces_by_id[rid]
        if not room.get("geometry"): continue
        rg=shape(room["geometry"])
        for corridor,cg in corridor_geoms:
            overlap=rg.intersection(cg)
            if overlap.area>1:
                conflicts[f"{rid}_{corridor['id']}_OVERLAP"]={"areaPt2":round(overlap.area,3),"areaM2":round(overlap.area*M_PER_PT**2,3),"geometry":{"type":"Polygon","coordinates":[[[round(x,3),round(y,3)] for x,y in overlap.exterior.coords]]} if overlap.geom_type=="Polygon" else None,"sourceRoomPathIDs":room.get("sourcePathIDs",[]),"corridorPathIDs":corridor.get("sourcePathIDs",[]),"status":"TOPOLOGY_CONFLICT_REVIEW_REQUIRED"}
    mwest_spaces=[spaces_by_id[r] for r in ["M104","M105","M106"]]
    physical_pids=defaultdict(list)
    feature_by_id={s["spaceID"]:s for s in spaces}
    for room in spaces:
        for edge in room.get("boundaryEdgesV9",[]):
            for pid in edge.get("wallSourcePathIDs",[]):
                physical_pids[pid].append({"objectID":room["spaceID"],"edgeID":edge["edgeID"],"supportedLengthPt":edge["wallFaceSupportLengthPt"]})
    for corridor in corridors:
        for edge in corridor.get("boundaryEdgesV9",[]):
            for pid in edge.get("wallSourcePathIDs",[]):
                physical_pids[pid].append({"objectID":corridor["id"],"edgeID":edge["edgeID"],"supportedLengthPt":edge["wallFaceSupportLengthPt"]})
    wall_objects=[]
    for pid,refs in sorted(physical_pids.items()):
        rows=by_pid.get(pid,[])
        wall_objects.append({"id":f"FF01-WALL-CAND-{pid}","type":"WALL_TRACE_CANDIDATE","geometry":{"type":"MultiLineString","coordinates":[[[round(x,3),round(y,3)] for x,y in row["line"].coords] for row in rows]},"sourcePathID":pid,"sourceLayer":rows[0]["layer"] if rows else None,"layerSemantic":rows[0]["semantic"] if rows else None,"boundedFeatureReferences":refs,"geometryStatus":"TRACE_ONLY","verificationLevel":"UNVERIFIED"})
    wall_ids_by_feature=defaultdict(set)
    for wall in wall_objects:
        for ref in wall["boundedFeatureReferences"]: wall_ids_by_feature[ref["objectID"]].add(wall["id"])
    relations=[]
    for feature_id, wall_ids in wall_ids_by_feature.items():
        for wall_id in sorted(wall_ids): relations.append({"type":"BOUNDED_BY","from":feature_id,"to":wall_id,"evidence":"SHARED_SOURCE_PATH_ID","passability":"NOT_IMPLIED","verificationLevel":"UNVERIFIED"})
    feature_geoms={s["spaceID"]:shape(s["geometry"]) for s in spaces if s.get("geometry")}
    feature_geoms.update({c["id"]:shape(c["geometry"]) for c in corridors})
    for (id_a,geom_a),(id_b,geom_b) in __import__('itertools').combinations(feature_geoms.items(),2):
        common=wall_ids_by_feature[id_a]&wall_ids_by_feature[id_b]
        gap=geom_a.distance(geom_b); overlap=geom_a.intersection(geom_b).area
        if overlap>1.0:
            relations.append({"type":"SPATIAL_CONFLICT","from":id_a,"to":id_b,"overlapPt2":round(overlap,3),"sharedWallIDs":sorted(common),"status":"REVIEW_REQUIRED","passability":"NOT_APPLICABLE","verificationLevel":"UNVERIFIED"})
        elif common and gap<=6.0:
            relations.append({"type":"ADJACENT_TO","from":id_a,"to":id_b,"sharedWallIDs":sorted(common),"minimumGapPt":round(gap,3),"overlapPt2":round(overlap,3),"status":"CANDIDATE_ADJACENCY","passability":"UNKNOWN","verificationLevel":"UNVERIFIED"})
    openings=[]
    for feat in spaces:
        for edge in feat.get("boundaryEdgesV9",[]):
            if edge["boundaryType"]=="DOOR_OPENING_CANDIDATE":
                openings.append({"id":f"OPENING-CAND-{edge['edgeID']}","type":"OPENING_CANDIDATE","geometry":{"type":"LineString","coordinates":[edge["startPt"],edge["endPt"]]},"sourcePathIDs":[p for p in edge["sourcePathIDs"] if any(r["semantic"]=="Door" for r in by_pid.get(p,[]))],"hostWallIDs":[f"FF01-WALL-CAND-{p}" for p in edge["sourcePathIDs"] if p in physical_pids],"relatedFeatureID":feat["spaceID"],"passability":"UNKNOWN","verificationLevel":"UNVERIFIED"})
    for corridor in corridors:
        for edge in corridor.get("boundaryEdgesV9",[]):
            if edge.get("doorEvidenceLengthPt",0)>0.1:
                openings.append({"id":f"OPENING-CAND-{corridor['id']}-{edge['edgeID']}","type":"OPENING_CANDIDATE","geometry":{"type":"LineString","coordinates":[edge["startPt"],edge["endPt"]]},"sourcePathIDs":edge.get("doorSourcePathIDs",[]),"hostWallIDs":[f"FF01-WALL-CAND-{p}" for p in edge.get("wallSourcePathIDs",[]) if p in physical_pids],"relatedFeatureID":corridor["id"],"passability":"UNKNOWN","verificationLevel":"UNVERIFIED"})
    mwest_feature_ids={s["spaceID"] for s in mwest_spaces}|{c["id"] for c in corridors if c["id"]=="FF01-CORRIDOR-M-WEST-01"}
    mwest_wall_objects=[w for w in wall_objects if any(ref["objectID"] in mwest_feature_ids for ref in w["boundedFeatureReferences"])]
    mwest_nodes=[feature_node(s,"ROOM") for s in mwest_spaces]
    mwest_nodes += [feature_node(c,"CORRIDOR") for c in corridors if c.get("id")=="FF01-CORRIDOR-M-WEST-01"]

    # Room-wide audit: evidence classes are mutually explicit; the old 2.5 pt
    # proximity flag is retained only as legacy metadata and is not a precision claim.
    quality=[]; room_geoms={s["sourceRoomID"]:shape(s["geometry"]) for s in spaces if s.get("geometry")}
    fill_geoms=[shape(row["geometry"]) for row in v8["wallNetwork"]["wallFaceCandidates"] if row.get("geometry")]
    fill_union=unary_union(fill_geoms) if fill_geoms else None
    for room in spaces:
        if not room.get("geometry"):
            quality.append({"roomID":room["sourceRoomID"],"status":"UNRESOLVED","labelInside":None,"areaM2":None,"areaTextEvidence":room["areaTextEvidence"],"edgeCount":0,"unsupportedBoundaryLengthPt":None,"virtualClosureLengthPt":None,"doorEvidenceLengthPt":None,"glazingEvidenceLengthPt":None,"wallFaceSupportRatio":None,"wallSideConsistency":"NOT_MEASURABLE","roomCorridorConflicts":[]});continue
        geom=shape(room["geometry"]); edges=room["boundaryEdgesV9"]
        totals=defaultdict(float)
        for edge in edges:
            totals[edge["boundaryType"]]+=edge["lengthPt"]
            totals["wallFaceSupport"]+=edge["wallFaceSupportLengthPt"]
            totals["doorEvidence"]+=edge["doorEvidenceLengthPt"]
            totals["glazingEvidence"]+=edge["glazingEvidenceLengthPt"]
        corridor_conflicts=[]
        for corridor,cg in corridor_geoms:
            a=geom.intersection(cg).area
            if a>1: corridor_conflicts.append({"corridorID":corridor["id"],"overlapM2":round(a*M_PER_PT**2,3)})
        fill_area=geom.intersection(fill_union).area if fill_union else 0
        label_inside=geom.covers(Point(room["sourceLabelPt"]))
        label_dist=geom.distance(Point(room["sourceLabelPt"]))
        total=max(geom.exterior.length,1e-9)
        supported=totals["wallFaceSupport"]
        old_edges={f"E{i:02d}":e for i,e in enumerate(room.get("boundaryEdges",[]),1)}
        virtual=sum(e["lengthPt"] for e in edges if old_edges.get(e["edgeID"].split(":")[-1],{}).get("evidenceStatus")=="UNSUPPORTED_OR_VIRTUAL_CLOSURE")
        side_length=sum(e["lengthPt"] for e in edges if e.get("wallSideConsistent") is True)
        side_denominator=sum(e["lengthPt"] for e in edges if e.get("wallSideConsistent") is not None)
        assigned_area=room["areaTextEvidence"].get("assignedAreaM2")
        deviation=round((geom.area*M_PER_PT**2-assigned_area)/assigned_area*100,2) if assigned_area else None
        quality.append({"roomID":room["sourceRoomID"],"status":"CANDIDATE","labelInside":label_inside,"labelDistancePt":round(label_dist,3),"areaM2":round(geom.area*M_PER_PT**2,3),"areaTextEvidence":room["areaTextEvidence"],"areaDeviationPercent":deviation,"edgeCount":len(edges),"boundaryLengthPt":round(total,3),"boundaryLengthWeightedWallSupportRatio":round(min(supported,total)/total,4),"distanceToCompatibleWallFaceMeanPt":round(sum(e["nearestCompatibleWallDistancePt"] for e in edges if e["nearestCompatibleWallDistancePt"] is not None)/max(1,sum(e["nearestCompatibleWallDistancePt"] is not None for e in edges)),3),"unsupportedBoundaryLengthPt":round(totals["UNSUPPORTED_INFERRED_BOUNDARY"],3),"virtualClosureLengthPt":round(virtual,3),"virtualClosureLengthStatus":"MEASURED_FROM_V8_EDGE_CLASSIFICATION" if room.get("boundaryEdges") else "NOT_MEASURABLE_FOR_LEGACY_CANDIDATE","doorEvidenceLengthPt":round(totals["doorEvidence"],3),"glazingEvidenceLengthPt":round(totals["glazingEvidence"],3),"wallFaceIntersectionM2":round(fill_area*M_PER_PT**2,3),"wallSideConsistencyRatio":round(side_length/max(side_denominator,1e-9),4) if side_denominator else None,"roomCorridorConflicts":corridor_conflicts,"verificationLevel":"UNVERIFIED"})
    pair_conflicts=[]
    for (ra,ga),(rb,gb) in __import__('itertools').combinations(room_geoms.items(),2):
        overlap=ga.intersection(gb).area
        if overlap>1: pair_conflicts.append({"roomA":ra,"roomB":rb,"overlapPt2":round(overlap,3),"overlapM2":round(overlap*M_PER_PT**2,3)})

    # Perimeter evidence is the original V8 trace set; endpoint connectivity is
    # analyzed without snapping gaps shut.
    ext=perimeter_graph(v8["buildingFootprint"]["boundarySegments"])
    # Semantic arena candidates retain exact source polygons/seat footprints;
    # their envelopes are never filled into unsupported stand decks.
    arena={"courtSurfaceCandidates":v8["arena"]["semanticRegions"],"seatFootprintClusters":v8["arena"]["seatFootprintClusters"],"standDeckRegions":[],"standSteps":"SOURCE_SEAT_FOOTPRINTS_ONLY; HEIGHT_ILLUSTRATIVE","innerOuterRing":"UNRESOLVED","ringCorridor":None,"accessCandidates":[],"unresolved":[{"id":"ARENA-INNER-OUTER-RING","reason":"Source arena traces and seat footprints identify the court/seat regions, but do not yet distinguish a continuous inner/outer architectural ring or a clear corridor polygon."}]}

    # Add source text evidence for every label, including unresolved spaces.
    all_word_evidence={s["sourceRoomID"]:area_evidence(s,words,labels) for s in v8["spaces"]}
    known_ids={p.get("sourcePathID") or p["id"] for p in paths}
    used_ids=set()
    for s in spaces: used_ids.update(s.get("sourcePathIDs",[]))
    for c in corridors: used_ids.update(c.get("sourcePathIDs",[]))
    for w in wall_objects: used_ids.add(w["sourcePathID"])
    for r in arena["courtSurfaceCandidates"]: used_ids.update(r.get("sourcePathIDs",[]))
    invalid_ids=sorted(used_ids-known_ids)
    if invalid_ids: raise SystemExit(f"Unknown source P-IDs in V9: {invalid_ids[:10]}")
    from shapely.geometry import box
    mwest_bounds=box(520,1190,720,1410)
    semantic_faces=[row for row in v8["wallNetwork"]["wallFaceCandidates"] if row.get("geometry") and shape(row["geometry"]).intersects(mwest_bounds)]
    full_nodes=[feature_node(s,"ROOM" if s.get("geometry") else "UNKNOWN_REGION") for s in spaces]
    full_nodes += [feature_node(c,"CORRIDOR") for c in corridors]
    full_nodes += [{"id":w["id"],"type":"STRUCTURAL_WALL_CANDIDATE","geometry":w["geometry"],"status":w["geometryStatus"],"verificationLevel":w["verificationLevel"],"sourcePathIDs":[w["sourcePathID"]]} for w in wall_objects]
    full_nodes += [{"id":r["id"],"type":r["type"],"geometry":r["geometry"],"status":r["status"],"verificationLevel":r["verificationLevel"],"sourcePathIDs":r["sourcePathIDs"]} for r in arena["courtSurfaceCandidates"]]
    drawing_area_count=sum(bool(e["candidateAreaValues"]) for e in all_word_evidence.values())
    local_text_count=sum(bool(e["rawSourceText"]) for e in all_word_evidence.values())
    ambiguous_area_count=sum(bool(e["candidateAreaValues"]) and e["ambiguityStatus"]!="UNAMBIGUOUS_CANDIDATE" for e in all_word_evidence.values())
    labels_without_area=sum(not e["candidateAreaValues"] for e in all_word_evidence.values())
    model={
      "schemaVersion":1,"modelID":"FF01-ARCHITECTURE-V9","modelStatus":"TOPOLOGY_CANDIDATE_PARTIAL","illustrative3D":v8["illustrative3D"],
      "sourceModel":"V8 additive; V6/V7/V8 immutable","sourceMetadata":v8["sourceMetadata"],"coordinateSystem":v8["coordinateSystem"],
      "spaces":spaces,"corridors":corridors,
      "wallNetwork":{**v8["wallNetwork"],"semanticObjects":wall_objects,"semanticFaces":semantic_faces,"sourceTraceCount":len(v8["wallNetwork"]["traceObjects"]),"sourceWallFaceCandidateCount":len(v8["wallNetwork"]["wallFaceCandidates"]),"semanticStatus":"Source-backed wall trace and fill candidates; none independently verified."},
      "circulation":{**v8["circulation"],"corridors":corridors},
      "topologyGraph":{"nodes":full_nodes,"relations":relations,"openingCandidates":openings,"formalNavigationEdges":[],"passabilityPolicy":"ADJACENCY DOES NOT IMPLY PASSABILITY; all unreviewed openings remain UNKNOWN"},
      "mWestRegion":{"focusRoomIDs":["M104","M105","M106"],"corridorIDs":[c["id"] for c in corridors if c.get("id")=="FF01-CORRIDOR-M-WEST-01"],"sharedWallCandidateCount":len(mwest_wall_objects),"adjacencyRelations":[r for r in relations if r["type"]=="ADJACENT_TO" and r["from"] in mwest_feature_ids and r["to"] in mwest_feature_ids],"conflicts":conflicts,"reviewStatus":"REVIEW_REQUIRED"},
      "buildingFootprint":{**v8["buildingFootprint"],"perimeterGraph":ext,"geometryStatus":"OPEN_BOUNDARY_CANDIDATE","verificationLevel":"UNVERIFIED"},
      "arena":{**v8["arena"],"v9SemanticModel":arena},
      "qualityAudit":{"areaTextExtractionStatus":word_status,"candidateRooms":quality,"roomRoomConflicts":pair_conflicts,"sourceLabelsWithAreaText":drawing_area_count,"sourceLabelsWithLocalText":local_text_count,"unresolvedAreaAssociations":ambiguous_area_count,"labelsWithoutAreaCandidate":labels_without_area},
      "remaining13Recovery":{"attemptRadiusPt":150,"results":expanded_results,"unresolvedRoomIDs":[r["roomID"] for r in expanded_results if r["status"]!="CANDIDATE_ADDED"]},
      "coverage":{**v8["coverage"],"sourceLabelOccurrences":len(spaces),"uniqueBaseRoomCodes":len({s["baseRoomCode"] for s in spaces}),"candidateRoomPolygons":sum(bool(s.get("geometry")) for s in spaces),"drawingMatchedSpaces":0,"drawingVerifiedSpaces":0,"fieldVerified":0,"additionalRoomCandidates":len(expanded),"corridorPolygons":len(corridors),"formalNavigationEdges":0,"topologyRelations":len(relations),"wallTraceObjectsInMWest":len(mwest_wall_objects),"semanticWallTraceObjects":len(wall_objects),"openingCandidates":len(openings),"footprintClosed":False,"arenaSemanticRegions":len(arena["courtSurfaceCandidates"]),"seatFootprintCount":sum(c["seatCount"] for c in arena["seatFootprintClusters"]),"bySeries":{series:{"labels":sum(s["baseRoomCode"].startswith(series) for s in spaces),"candidatePolygons":sum(s["baseRoomCode"].startswith(series) and bool(s.get("geometry")) for s in spaces)} for series in "MSA"}},
      "verificationPolicy":"No geometry is DRAWING_VERIFIED or FIELD_VERIFIED without a real review record."
    }
    (SOURCE/"canonical-architecture-v9.json").write_text(json.dumps(model,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    shutil.copy2(SOURCE/"canonical-architecture-v9.json",ROOT/"public/ff01-architecture-v9.json")
    report={"sourcePdfSha256":v8["sourceMetadata"]["sourcePdfSha256"],"coverage":model["coverage"],"mWestConflicts":conflicts,"remaining13Recovery":expanded_results,"qualitySummary":{"candidateRoomPolygons":model["coverage"]["candidateRoomPolygons"],"roomsWithLabelInside":sum(r.get("labelInside") is True for r in quality),"roomsWithRoomCorridorOverlap":sum(bool(r.get("roomCorridorConflicts")) for r in quality),"roomRoomOverlapPairs":len(pair_conflicts),"totalUnsupportedBoundaryPt":round(sum(r.get("unsupportedBoundaryLengthPt") or 0 for r in quality),3),"totalDoorEvidenceBoundaryPt":round(sum(r.get("doorEvidenceLengthPt") or 0 for r in quality),3),"totalGlazingEvidenceBoundaryPt":round(sum(r.get("glazingEvidenceLengthPt") or 0 for r in quality),3),"areaLabelsWithCandidates":drawing_area_count,"ambiguousAreaAssociations":ambiguous_area_count,"labelsWithoutAreaCandidate":labels_without_area},"exteriorBoundary":{"connectedChainCount":ext["connectedChainCount"],"openEndpointCount":ext["openEndpointCount"],"gapCandidates":len(ext["gapCandidates"]),"closedComponentCount":ext["closedComponentCount"]},"gates":{"DATA_INTEGRITY":"PENDING_VALIDATOR","GEOMETRY_CONSTRUCTION":"PARTIAL","TOPOLOGY_CONSISTENCY":"PARTIAL","SOURCE_ALIGNMENT":"PARTIAL","DRAWING_VERIFICATION":"PENDING"}}
    (SOURCE/"canonical-architecture-v9-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"output/architecture-v9").mkdir(parents=True,exist_ok=True)
    (ROOT/"output/architecture-v9/room-quality-audit.json").write_text(json.dumps(quality,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"output/architecture-v9/area-text-associations.json").write_text(json.dumps(all_word_evidence,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"output/architecture-v9/exterior-gap-analysis.json").write_text(json.dumps(ext,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"output/architecture-v9/remaining-13-recovery.json").write_text(json.dumps(expanded_results,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    save_overlay(model,ROOT/"public/ff01-source-plan.png")
    print(json.dumps({**report,"wordCount":len(words),"newCandidates":len(expanded)},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
