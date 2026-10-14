#!/usr/bin/env python3
"""Build edge-level, source-linked review packages for the six V3 pilots.

This is an analysis/export step only: it never edits the active override file,
never changes candidate status to VERIFIED, and never uses annotated area to
move or scale a boundary.
"""
from __future__ import annotations

import csv
import gzip
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw
from shapely.geometry import LineString, Polygon

ROOT = Path(__file__).resolve().parents[1]
V3 = ROOT / "data/source/pilots/v3"
OUT = ROOT / "data/source/pilots/v4/review-packages"
PUBLIC = ROOT / "public/ff01-pilot-v4"
PILOTS = json.loads((V3 / "PILOT_HYBRID_RECONSTRUCTION.json").read_text())
VECTORS = json.loads(gzip.decompress((ROOT / "data/source/ff01-vectors.json.gz").read_bytes()))["cadDrawings"]
WALL_SEMANTICS = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall"}
SCALE = 300 / 72


def chains(path):
    out, chain = [], []
    for item in path.get("items", []):
        kind, *v = item
        if kind == "l" and len(v) == 2:
            a, b = v
            if not chain:
                chain = [a, b]
            elif math.dist(chain[-1], a) < 0.05:
                chain.append(b)
            elif math.dist(chain[-1], b) < 0.05:
                chain.append(a)
            else:
                if len(chain) > 1: out.append(chain)
                chain = [a, b]
        elif kind == "poly" and v and v[0]:
            if len(chain) > 1: out.append(chain)
            chain = list(v[0])
            if len(chain) > 2 and math.dist(chain[0], chain[-1]) > 0.05: chain.append(chain[0])
    if len(chain) > 1: out.append(chain)
    return out


segments = []
for path in VECTORS:
    if path.get("layerSemantic") not in WALL_SEMANTICS | {"Door", "Window / Glazing"}:
        continue
    for chain in chains(path):
        for a, b in zip(chain, chain[1:]):
            if all(math.isfinite(float(v)) for p in (a, b) for v in p) and math.dist(a, b) >= 0.5:
                segments.append({"a": a, "b": b, "pID": path.get("sourcePathID"), "fid": path.get("id"),
                                 "layer": path.get("layer"), "semantic": path.get("layerSemantic")})


def project(point, a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    den = dx*dx + dy*dy
    t = max(0, min(1, ((point[0]-a[0])*dx + (point[1]-a[1])*dy) / den)) if den else 0
    return [a[0] + t*dx, a[1] + t*dy]


def edge_evidence(a, b, candidates):
    line = LineString([a, b]); best = []
    length = max(line.length, 1e-6)
    angle = math.degrees(math.atan2(b[1]-a[1], b[0]-a[0])) % 180
    for seg in candidates:
        other = LineString([seg["a"], seg["b"]])
        dist = line.distance(other)
        other_angle = math.degrees(math.atan2(seg["b"][1]-seg["a"][1], seg["b"][0]-seg["a"][0])) % 180
        angle_delta = min(abs(angle-other_angle), 180-abs(angle-other_angle))
        # Measure longitudinal support by projecting source endpoints on candidate edge axis.
        ux, uy = (b[0]-a[0])/length, (b[1]-a[1])/length
        projections = [((p[0]-a[0])*ux + (p[1]-a[1])*uy) for p in (seg["a"], seg["b"])]
        overlap = max(0.0, min(length, max(projections))-max(0.0, min(projections))) / length
        if dist <= 10:
            best.append((dist, angle_delta, overlap, seg))
    best.sort(key=lambda row: (row[0] + row[1]*0.15 - row[2]*2, row[0]))
    return best


def source_crop_overlay(room, candidate, all_evidence):
    image = Image.open(V3 / candidate["visualEvidence"]["sourceCrop"]).convert("RGBA")
    draw = ImageDraw.Draw(image, "RGBA")
    x0, y0, x1, y1 = candidate["cropBBoxPt"]
    def pix(p): return ((p[0]-x0)*SCALE, (p[1]-y0)*SCALE)
    ring = candidate["polygonSourcePt"]
    if len(ring) > 2:
        draw.polygon([pix(p) for p in ring], fill=(234, 159, 30, 35))
    for edge in all_evidence:
        a, b = pix(edge["startPt"]), pix(edge["endPt"])
        color = {"WALL_ALIGNED_CANDIDATE": (20, 145, 85, 220), "DOOR_OR_GLAZING": (32, 120, 220, 230),
                 "CANDIDATE_WALL": (225, 135, 25, 230), "UNSUPPORTED": (225, 45, 45, 235)}[edge["classification"]]
        draw.line((a, b), fill=color, width=max(2, round(SCALE*0.55)))
        mid = ((a[0]+b[0])/2, (a[1]+b[1])/2)
        draw.ellipse((mid[0]-4, mid[1]-4, mid[0]+4, mid[1]+4), fill=color)
        draw.text((mid[0]+4, mid[1]+2), str(edge["edgeID"]), fill=(15, 15, 15, 255), stroke_width=1, stroke_fill=(255,255,255,255))
    return image


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    all_reports=[]
    for candidate in PILOTS["pilots"]:
        room = candidate["roomID"]
        folder = OUT / room
        folder.mkdir(parents=True, exist_ok=True)
        ring = candidate["polygonSourcePt"]
        if len(ring) > 3 and math.dist(ring[0], ring[-1]) < 1e-6:
            ring = ring[:-1]
        poly = Polygon(ring)
        crop = candidate["cropBBoxPt"]
        local = [s for s in segments if crop[0]-4 <= min(s["a"][0],s["b"][0]) <= crop[2]+4 and crop[1]-4 <= min(s["a"][1],s["b"][1]) <= crop[3]+4]
        edges=[]; proposals=[]
        for i, (a,b) in enumerate(zip(ring, ring[1:]+ring[:1])):
            ev=edge_evidence(a,b,local)
            wall=next((r for r in ev if r[3]["semantic"] in WALL_SEMANTICS and r[2]>=0.65 and r[1]<=12),None)
            nonwall=next((r for r in ev if r[3]["semantic"] in {"Door","Window / Glazing"} and r[2]>=0.45),None)
            nearest=ev[0] if ev else None
            if wall:
                cls="WALL_ALIGNED_CANDIDATE"; conf="SOURCE_WALL_ALIGNMENT_CANDIDATE_NOT_VERIFIED"
                selected=wall
            elif nonwall:
                cls="DOOR_OR_GLAZING"; conf="OPENING_EVIDENCE_NOT_WALL"
                selected=nonwall
            elif nearest and nearest[3]["semantic"] in WALL_SEMANTICS and nearest[0] <= 10:
                cls="CANDIDATE_WALL"; conf="LOW_ALIGNMENT_REQUIRES_REVIEW"; selected=nearest
            else:
                cls="UNSUPPORTED"; conf="NO_CLOSE_STRUCTURAL_VECTOR"; selected=nearest
            rec={"edgeID":f"{room}-E{i+1:02d}","startPt":a,"endPt":b,"lengthPt":round(math.dist(a,b),3),
                 "orientationDegrees":round(math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))%180,2),
                 "classification":cls,"confidence":conf,"reviewStatus":"HUMAN_REVIEW_REQUIRED",
                 "sourcePathIDs":[],"cadLayers":[],"nearestWallEvidence":None,"nearestAnyEvidence":None,
                 "currentReviewStatus":"NOT_REVIEWED"}
            for slot,hit in (("nearestWallEvidence",wall),("nearestAnyEvidence",selected)):
                if hit:
                    d, da, overlap, seg=hit
                    rec[slot]={"sourcePathID":seg["pID"],"drawingID":seg["fid"],"layer":seg["layer"],"semantic":seg["semantic"],
                               "distancePt":round(d,3),"angleDeltaDegrees":round(da,2),"overlapFraction":round(overlap,3)}
                    if seg["pID"]: rec["sourcePathIDs"].append(seg["pID"])
                    rec["cadLayers"].append(seg["layer"])
            old=next((e for e in candidate["unresolvedEdges"] if math.dist(a,e["startPt"])+math.dist(b,e["endPt"])<1 or math.dist(a,e["endPt"])+math.dist(b,e["startPt"])<1),None)
            rec["priorObjection"]=old["reason"] if old else None
            edges.append(rec)
            # Evidence-only correction proposals: snap a single edge endpoint pair to a
            # close, well-aligned structural vector. Only emit if geometry remains valid.
            hits=[r for r in ev if r[3]["semantic"] in WALL_SEMANTICS and r[0] <= 2.5 and r[1] <= 8 and r[2] >= 0.7]
            for dist, da, overlap, seg in hits[:1]:
                na, nb=project(a,seg["a"],seg["b"]),project(b,seg["a"],seg["b"])
                delta=max(math.dist(a,na),math.dist(b,nb))
                if delta < 0.15 or delta > 2.5: continue
                changed=list(ring);changed[i]=na;changed[(i+1)%len(changed)]=nb
                variant=Polygon(changed)
                if not variant.is_valid or variant.area<=0: continue
                proposals.append({"proposalID":f"{room}-SNAP-E{i+1:02d}","edgeIDs":[rec["edgeID"]],
                                  "oldEndpointsPt":[a,b],"newEndpointsPt":[na,nb],"sourcePathIDs":[seg["pID"]] if seg["pID"] else [],
                                  "cadLayer":seg["layer"],"geometryDeltaMaxPt":round(delta,3),
                                  "areaDeltaM2IllustrativeScale":round((variant.area-poly.area)*(0.10583333333333333**2),3),
                                  "reason":"Align this boundary edge to a nearby, direction-compatible native structural vector.",
                                  "uncertainty":"Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.",
                                  "resultPolygonSourcePt":[[round(x,3),round(y,3)] for x,y in variant.exterior.coords]})
        proposals=proposals[:3]
        # Shared-edge and overlap candidates are explicitly advisory and require reciprocal review.
        shared=[]; overlaps=[]
        for other in PILOTS["pilots"]:
            if other["roomID"]==room: continue
            other_poly=Polygon(other["polygonSourcePt"])
            boundary=poly.boundary.intersection(other_poly.boundary)
            if not boundary.is_empty and boundary.length>2:
                shared.append({"otherRoomID":other["roomID"],"sharedBoundaryLengthPt":round(boundary.length,3),"status":"CANDIDATE_SHARED_BOUNDARY_REQUIRES_REVIEW"})
            intersection=poly.intersection(other_poly)
            if intersection.area>1:
                overlaps.append({"otherRoomID":other["roomID"],"overlapAreaPt2":round(intersection.area,3),"status":"CANDIDATE_OVERLAP_REQUIRES_REVIEW"})
        status="REVIEW_READY" if poly.is_valid and candidate.get("seedInside") and all(e["classification"] for e in edges) else "HUMAN_REVIEW_REQUIRED"
        report={"roomID":room,"candidateID":candidate["candidateID"],"candidateStatus":candidate["status"],"reviewPackageStatus":status,
                "sourcePdf":"FF-01 · page rotation normalized · 2384x1684 display points","sourceCrop":"original-source-crop.png",
                "structuralEvidenceImage":"vector-raster-evidence.png","candidateOverlay":"candidate-edge-overlay.png",
                "geometry":{"areaM2":candidate["areaM2IllustrativeScale"],"annotatedAreaM2":candidate["expectedAreaM2FromNearbyText"],
                            "areaDeviationPercent":round((candidate["areaM2IllustrativeScale"]/candidate["expectedAreaM2FromNearbyText"]-1)*100,1),
                            "valid":poly.is_valid,"selfIntersection":not poly.is_valid,"seedInside":candidate.get("seedInside"),
                            "independentIoU":"NOT_MEASURABLE"},
                "edgeCount":len(edges),"edges":edges,"correctionProposals":proposals,"candidateSharedBoundaries":shared,"candidateOverlaps":overlaps,
                "outstandingIssues":candidate["issues"],"verificationRecord":None,
                "verificationNote":"REVIEW_READY describes a complete machine-generated review packet. It does not mean a person reviewed or verified this room."}
        image=source_crop_overlay(room,candidate,edges)
        image.save(folder/"candidate-edge-overlay.png")
        (PUBLIC/room).mkdir(parents=True, exist_ok=True)
        image.save(PUBLIC/room/"candidate-edge-overlay.png")
        for key, dest in ((candidate["visualEvidence"]["sourceCrop"],"original-source-crop.png"),
                          (candidate["visualEvidence"]["wallMask"],"wall-evidence.png"),
                          (candidate["visualEvidence"]["doorEvidenceMask"],"door-evidence.png"),
                          (candidate["visualEvidence"]["glazingEvidenceMask"],"glazing-evidence.png"),
                          (candidate["visualEvidence"]["vectorRasterOverlay"],"vector-raster-evidence.png"),
                          (candidate["visualEvidence"]["segmentationVectorSnap"],"candidate-segmentation.png")):
            source=V3/key
            if source.exists():
                (folder/dest).write_bytes(source.read_bytes())
                if dest in {"original-source-crop.png","wall-evidence.png","door-evidence.png","glazing-evidence.png","vector-raster-evidence.png","candidate-segmentation.png"}:
                    (PUBLIC/room/dest).write_bytes(source.read_bytes())
        (folder/"review-package.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
        md=[f"# {room} Boundary Review Package","",f"Status: **{status}** (not verified)","",
            f"- Candidate area: {candidate['areaM2IllustrativeScale']:.2f} m²; nearby annotation: {candidate['expectedAreaM2FromNearbyText']:.2f} m²; deviation: {report['geometry']['areaDeviationPercent']:+.1f}%.",
            f"- Polygon valid: {poly.is_valid}; seed inside: {candidate.get('seedInside')}; independent IoU: NOT MEASURABLE.",
            f"- Boundary edges: {len(edges)}; source-aligned wall candidates: {sum(e['classification']=='WALL_ALIGNED_CANDIDATE' for e in edges)}; openings: {sum(e['classification']=='DOOR_OR_GLAZING' for e in edges)}; unsupported: {sum(e['classification']=='UNSUPPORTED' for e in edges)}.",
            f"- Evidence-based correction proposals: {len(proposals)} (none auto-applied).","",
            "## Images","", "- `original-source-crop.png` — original source crop.","- `wall-evidence.png` — structural wall mask.","- `door-evidence.png` and `glazing-evidence.png` — opening evidence.","- `vector-raster-evidence.png` — vector/raster overlay.","- `candidate-edge-overlay.png` — candidate with numbered edges.","- `candidate-segmentation.png` — segmented/snapped contour.","",
            "## Edge Findings","", "| Edge | Class | Evidence | Prior objection |", "|---|---|---|---|"]
        for e in edges:
            ev=e['nearestAnyEvidence'] or {}
            md.append(f"| {e['edgeID']} | {e['classification']} | {ev.get('sourcePathID','—')} · {ev.get('layer','—')} · {ev.get('distancePt','—')} pt | {(e['priorObjection'] or '—').replace('|','/')} |")
        md += ["", "## Correction Proposals", ""]
        if proposals:
            for p in proposals: md.append(f"- **{p['proposalID']}**: edge {', '.join(p['edgeIDs'])} → {p['sourcePathIDs']} / `{p['cadLayer']}`; max shift {p['geometryDeltaMaxPt']} pt, area delta {p['areaDeltaM2IllustrativeScale']:+.3f} m². {p['uncertainty']}")
        else: md.append("No source-supported correction within the conservative 2.5 pt / 8° snapping gate. This is not evidence that current edges are correct.")
        md += ["", "## Review Checklist", "", "- [ ] Compare each numbered edge with the source crop and CAD evidence.","- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.","- [ ] Confirm door/glazing gaps remain openings and are not physical walls.","- [ ] Review unsupported edges and candidate shared boundaries.","- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.","- [ ] Keep room status unverified until independent review is complete.",""]
        (folder/"README.md").write_text("\n".join(md))
        all_reports.append(report)
    (OUT/"index.json").write_text(json.dumps({"schemaVersion":1,"generatedBy":"scripts/build_pilot_review_packages.py","verifiedCount":0,"rooms":all_reports},ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"rooms":len(all_reports),"edges":sum(r['edgeCount'] for r in all_reports),"proposals":sum(len(r['correctionProposals']) for r in all_reports),"verified":0,"output":str(OUT)},ensure_ascii=False))


if __name__ == "__main__": build()
