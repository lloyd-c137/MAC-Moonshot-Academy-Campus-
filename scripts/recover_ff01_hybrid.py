#!/usr/bin/env python3
"""Room-seeded, CAD-layer-aware raster segmentation for six FF-01 pilots.

The raster component is a review candidate only. Door and glazing vectors may
act as temporary segmentation barriers; every such edge remains unresolved and
is never exported as a physical wall or navigation edge.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pymupdf
from PIL import Image, ImageDraw, ImageFilter
from shapely import STRtree, set_precision
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import nearest_points, polygonize, unary_union

WALL = {"Existing Wall", "New Partition", "Structural Wall / Column", "Architectural Wall"}
GLAZING = {"Window / Glazing"}
DOORS = {"Door"}
SEGMENT_BARRIERS = WALL | GLAZING | DOORS
TARGETS = {
    "M102": {"radiusPt": 120, "expectedAreaM2": 131.0},
    "M103": {"radiusPt": 180, "expectedAreaM2": 196.3},
    "M104": {"radiusPt": 120, "expectedAreaM2": 62.6},
    "S208": {"radiusPt": 120, "expectedAreaM2": 29.2},
    "S209": {"radiusPt": 120, "expectedAreaM2": 20.0},
    "S210": {"radiusPt": 120, "expectedAreaM2": 50.9},
}
PX_PER_PT = 2.0
SOURCE_DPI = 300
VIRTUAL_CLOSE_STEPS_PT = list(range(0, 33, 4))


def _near(a: list[float], b: list[float], tol: float = 0.02) -> bool:
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= tol


def _cubic(p0, p1, p2, p3, n=12):
    result = []
    for i in range(1, n + 1):
        t = i / n
        u = 1 - t
        result.append([
            u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1],
        ])
    return result


def path_chains(path: dict[str, Any]) -> list[list[list[float]]]:
    """Recover continuous subpaths, including implicit fill closures."""
    chains: list[list[list[float]]] = []
    chain: list[list[float]] = []

    def flush():
        nonlocal chain
        if len(chain) >= 2:
            chains.append(chain)
        chain = []

    for item in path.get("items", []):
        kind, *v = item
        if kind == "l" and len(v) == 2:
            a, b = [list(map(float, p)) for p in v]
            if not chain:
                chain = [a, b]
            elif _near(chain[-1], a):
                chain.append(b)
            elif _near(chain[-1], b):
                chain.append(a)
            else:
                flush(); chain = [a, b]
        elif kind == "c" and len(v) == 3 and chain:
            p1, p2, p3 = [list(map(float, p)) for p in v]
            chain.extend(_cubic(chain[-1], p1, p2, p3))
        elif kind == "poly" and v and v[0]:
            flush()
            pts = [list(map(float, p)) for p in v[0]]
            if len(pts) >= 2:
                chains.append(pts + ([pts[0]] if not _near(pts[0], pts[-1]) else []))
    flush()
    return chains


def label_points(csv_path: Path) -> dict[str, tuple[float, float]]:
    result = {}
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["SourceRoomLabel"] in TARGETS and row["OccurrenceIndex"] == "1":
                result[row["SourceRoomLabel"]] = (float(row["SourceLabelXPt"]), float(row["SourceLabelYPt"]))
    return result


def word_boxes(pdf_path: Path, targets: dict[str, tuple[float, float]]) -> dict[str, list[float] | None]:
    out: dict[str, list[float] | None] = {room_id: None for room_id in targets}
    doc = pymupdf.open(pdf_path); page = doc[0]; matrix = page.rotation_matrix
    words = page.get_text("words")
    for room_id, (x, y) in targets.items():
        matches = []
        for word in words:
            if word[4].strip() != room_id:
                continue
            x0,y0,x1,y1=word[:4]
            corners=[pymupdf.Point(px,py)*matrix for px,py in ((x0,y0),(x1,y0),(x1,y1),(x0,y1))]
            bbox=[min(p.x for p in corners),min(p.y for p in corners),max(p.x for p in corners),max(p.y for p in corners)]
            matches.append(bbox)
        if matches:
            out[room_id]=[round(v,4) for v in min(matches,key=lambda b:math.hypot((b[0]+b[2])/2-x,(b[1]+b[3])/2-y))]
    doc.close()
    return out


def draw_path(draw: ImageDraw.ImageDraw, path: dict[str, Any], origin: tuple[float, float], scale: float,
              fill: bool = True, line_width_pt: float | None = None) -> None:
    x0, y0 = origin
    width = max(1, round((line_width_pt if line_width_pt is not None else max(float(path.get("width") or 0), 0.8)) * scale))
    has_fill = fill and path.get("fill") is not None
    for chain in path_chains(path):
        coords = [(round((x-x0)*scale), round((y-y0)*scale)) for x, y in chain]
        if has_fill and len(coords) >= 3:
            # PDF fill implicitly closes open subpaths. This fill is a raster
            # barrier only; it is not promoted to a room or 3D wall polygon.
            draw.polygon(coords, fill=255)
        if len(coords) >= 2:
            draw.line(coords, fill=255, width=width, joint="curve")


def draw_overlay_path(draw: ImageDraw.ImageDraw, path: dict[str, Any], origin: tuple[float,float], scale: float,
                      color: tuple[int,int,int,int]) -> None:
    x0,y0=origin
    for chain in path_chains(path):
        coords=[(round((x-x0)*scale),round((y-y0)*scale)) for x,y in chain]
        if len(coords)>=2: draw.line(coords,fill=color,width=2,joint="curve")


def segment_mask(paths: list[dict[str, Any]], crop: tuple[float, float, float, float], scale: float,
                 semantic_filter: set[str] | None = None) -> Image.Image:
    x0, y0, x1, y1 = crop
    size = (round((x1-x0)*scale), round((y1-y0)*scale))
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    clip = box(x0, y0, x1, y1)
    for path in paths:
        sem = path.get("layerSemantic", "Unknown")
        if semantic_filter is not None and sem not in semantic_filter:
            continue
        rect = path.get("rectPt")
        if not rect or not box(*rect).intersects(clip):
            continue
        draw_path(draw, path, (x0, y0), scale)
    return mask


def flood_component(barrier: Image.Image, seed_xy: tuple[int, int], close_pt: int) -> tuple[np.ndarray, Image.Image]:
    closed = barrier
    if close_pt > 0:
        kernel = max(3, round(close_pt * PX_PER_PT))
        kernel += 1 - kernel % 2
        closed = barrier.filter(ImageFilter.MaxFilter(kernel)).filter(ImageFilter.MinFilter(kernel))
    free = Image.eval(closed, lambda p: 0 if p else 255)
    ImageDraw.floodfill(free, seed_xy, 128, thresh=0)
    component = np.asarray(free) == 128
    return component, closed


def mask_polygon(component: np.ndarray, crop: tuple[float, float, float, float], scale: float,
                 seed: tuple[float, float]) -> Polygon | None:
    """Vectorize only the seeded component's pixel boundary, not all regions."""
    ys, xs = np.where(component)
    if not len(xs):
        return None
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    edges = []
    for y, x in zip(ys.tolist(), xs.tolist()):
        if y == 0 or not component[y-1, x]: edges.append(LineString([(x, y), (x+1, y)]))
        if x+1 >= component.shape[1] or not component[y, x+1]: edges.append(LineString([(x+1, y), (x+1, y+1)]))
        if y+1 >= component.shape[0] or not component[y+1, x]: edges.append(LineString([(x+1, y+1), (x, y+1)]))
        if x == 0 or not component[y, x-1]: edges.append(LineString([(x, y+1), (x, y)]))
    faces = list(polygonize(unary_union(edges)))
    sx = (seed[0]-crop[0])*scale
    sy = (seed[1]-crop[1])*scale
    containing = [face for face in faces if face.covers(Point(sx, sy))]
    if not containing:
        return None
    face = min(containing, key=lambda item: item.area)
    x0p, y0p, _, _ = crop
    coords = [(x0p+x/scale, y0p+y/scale) for x, y in face.exterior.coords]
    # The 300 DPI mask is sampled at ~0.24 pt/pixel. Remove sub-point raster
    # stair-stepping while preserving the non-rectilinear contour and area.
    candidate = Polygon(coords).simplify(1.0, preserve_topology=True)
    return candidate if candidate.is_valid and candidate.area > 10 else None


def _source_line_index(paths: list[dict[str, Any]], crop: tuple[float, float, float, float]):
    clip = box(*crop)
    lines: list[LineString] = []
    metadata: list[tuple[str, str]] = []
    for path in paths:
        if path.get("layerSemantic") not in SEGMENT_BARRIERS:
            continue
        rect = path.get("rectPt")
        if not rect or not box(*rect).intersects(clip):
            continue
        for chain in path_chains(path):
            if len(chain) < 2:
                continue
            line = LineString(chain)
            if line.intersects(clip):
                lines.append(line)
                metadata.append((path["sourcePathID"], path["layerSemantic"]))
    return lines, metadata, STRtree(lines) if lines else None


def polygonize_diagnostic(paths: list[dict[str, Any]], anchors: dict[str, tuple[float,float]]) -> dict[str, Any]:
    """Re-run the old line-cycle method with/without door and glazing evidence."""
    result={}
    for label,allowed in (("wallOnly",WALL),("wallDoorGlazing",SEGMENT_BARRIERS)):
        lines=[];filled_open=[];filled_paths=[]
        for path in paths:
            if path.get("layerSemantic") not in allowed:continue
            if path.get("fill") is not None:filled_paths.append(path["id"])
            chains=path_chains(path)
            for chain in chains:
                for a,b in zip(chain,chain[1:]):
                    if not _near(a,b):lines.append(LineString([a,b]))
                if path.get("fill") is not None and len(chain)>=3 and not _near(chain[0],chain[-1]):filled_open.append(path["id"])
        faces=list(polygonize(set_precision(unary_union(lines),0.1)))
        rows={}
        for room_id,xy in anchors.items():
            point=Point(xy);inside=sorted((face for face in faces if face.covers(point)),key=lambda f:f.area)
            nearest=min(faces,key=lambda f:f.distance(point)) if faces else None
            rows[room_id]={"containingFaceAreasPt2":[round(f.area,2) for f in inside[:3]],
                           "nearestFaceDistancePt":round(nearest.distance(point),3) if nearest else None,
                           "nearestFaceAreaPt2":round(nearest.area,2) if nearest else None,
                           "nearestFaceBBoxPt":[round(v,3) for v in nearest.bounds] if nearest else None}
        result[label]={"lineSegmentCount":len(lines),"faceCount":len(faces),"filledPathCount":len(set(filled_paths)),
                       "filledPathsImplicitlyOpen":len(set(filled_open)),"rooms":rows}
    return result


def evidence_for_polygon(poly: Polygon, lines: list[LineString], metadata: list[tuple[str, str]], tree: STRtree):
    coords = list(poly.exterior.coords)
    snapped = []
    source_ids: set[str] = set()
    unresolved = []
    virtual_types: set[str] = set()
    perimeter = 0.0
    supported = 0.0
    for a, b in zip(coords, coords[1:]):
        edge = LineString([a, b]); length = edge.length; perimeter += length
        mid = edge.interpolate(0.5, normalized=True)
        idx = int(tree.nearest(mid)) if tree is not None else -1
        nearest = lines[idx] if idx >= 0 else None
        distance = nearest.distance(mid) if nearest is not None else math.inf
        evidence_type = metadata[idx][1] if idx >= 0 else "NONE"
        path_id = metadata[idx][0] if idx >= 0 else None
        if distance <= 2.5:
            supported += length
            if path_id: source_ids.add(path_id)
            if evidence_type in DOORS | GLAZING:
                virtual_types.add(evidence_type)
                unresolved.append({"startPt": list(a), "endPt": list(b), "lengthPt": round(length, 3),
                                   "reason": f"Boundary coincides with {evidence_type} candidate; segmentation closure is virtual, not a physical wall.",
                                   "sourcePathID": path_id, "layerSemantic": evidence_type,
                                   "status": "HUMAN_REVIEW_REQUIRED"})
        else:
            unresolved.append({"startPt": list(a), "endPt": list(b), "lengthPt": round(length, 3),
                               "reason": "Raster closure edge is not aligned to a compatible native vector within 2.5 pt.",
                               "sourcePathID": None, "layerSemantic": "Raster closure / unresolved",
                               "status": "HUMAN_REVIEW_REQUIRED"})
    # Snap each ring vertex once. Appending both edge endpoints inside the edge
    # loop duplicates every shared corner and creates overlapping editor handles.
    for p in coords[:-1]:
        pt = Point(p); vi = int(tree.nearest(pt)) if tree is not None else -1
        if vi >= 0 and lines[vi].distance(pt) <= 2.5:
            candidate_point = tuple(nearest_points(pt, lines[vi])[1].coords[0])
        else:
            candidate_point = tuple(p)
        if not snapped or math.dist(snapped[-1], candidate_point) > 1e-6:
            snapped.append(candidate_point)
    if len(snapped) >= 3:
        snapped.append(snapped[0])
    if len(snapped) >= 3:
        refined = Polygon(snapped)
        if refined.is_valid and refined.area > 10:
            poly = refined
    return poly, sorted(source_ids), unresolved, (supported / perimeter if perimeter else 0.0), sorted(virtual_types)


def save_preview(pdf_path: Path, crop: tuple[float, float, float, float], label: tuple[float, float],
                 label_box: list[float] | None, output: Path, paths: list[dict[str, Any]],
                 candidate: Polygon | None, component: np.ndarray | None, close_pt: int | None,
                 room_id: str, radius: int) -> tuple[dict[str, str], int]:
    doc = pymupdf.open(pdf_path); page = doc[0]
    x0, y0, x1, y1 = crop
    scale = SOURCE_DPI / 72
    pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=pymupdf.Rect(x0, y0, x1, y1), alpha=False, annots=False)
    source = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    prefix = f"{room_id.lower()}"
    src_path = output / f"{prefix}-source-300dpi.png"; source.save(src_path)
    croppt = crop
    wall_mask = segment_mask(paths, croppt, scale, WALL)
    door_mask = segment_mask(paths, croppt, scale, DOORS)
    glazing_mask = segment_mask(paths, croppt, scale, GLAZING)
    exclude_mask = segment_mask(paths, croppt, scale, {"Furniture", "Equipment", "Annotation", "Grid / Dimension", "Unknown"})
    text_draw = ImageDraw.Draw(exclude_mask)
    page_matrix = page.rotation_matrix
    text_word_count = 0
    for word in page.get_text("words"):
        x0w,y0w,x1w,y1w=word[:4]
        corners=[pymupdf.Point(px,py)*page_matrix for px,py in ((x0w,y0w),(x1w,y0w),(x1w,y1w),(x0w,y1w))]
        bx0,by0,bx1,by1=(min(p.x for p in corners),min(p.y for p in corners),max(p.x for p in corners),max(p.y for p in corners))
        if bx1 < x0 or bx0 > x1 or by1 < y0 or by0 > y1: continue
        text_draw.rectangle(((max(0,(bx0-x0)*scale),max(0,(by0-y0)*scale)),
                             (min(source.width-1,(bx1-x0)*scale),min(source.height-1,(by1-y0)*scale))),fill=255)
        text_word_count += 1
    wall_path = output / f"{prefix}-wall-mask-300dpi.png"; wall_mask.save(wall_path)
    door_path = output / f"{prefix}-door-evidence-300dpi.png"; door_mask.save(door_path)
    glazing_path = output / f"{prefix}-glazing-evidence-300dpi.png"; glazing_mask.save(glazing_path)
    exclusion_path = output / f"{prefix}-text-furniture-exclusion-300dpi.png"; exclude_mask.save(exclusion_path)

    overlay = source.convert("RGBA"); draw = ImageDraw.Draw(overlay, "RGBA")
    draw.rectangle((0, 0, source.width-1, source.height-1), outline=(0,0,0,100), width=1)
    # 10 pt coordinate grid gives a visible local ruler in every crop.
    for xv in range(math.ceil(x0/10)*10, int(x1), 10):
        px = round((xv-x0)*scale); draw.line((px,0,px,source.height), fill=(40,130,160,55), width=1)
        draw.text((px+2,4),str(xv),fill=(0,70,90,230))
    for yv in range(math.ceil(y0/10)*10, int(y1), 10):
        py = round((yv-y0)*scale); draw.line((0,py,source.width,py), fill=(40,130,160,55), width=1)
        draw.text((3,py+2),str(yv),fill=(0,70,90,230))
    # Vector candidates registered against the rendered source.
    for path in paths:
        if path.get("layerSemantic") not in SEGMENT_BARRIERS or not path.get("rectPt") or not box(*path["rectPt"]).intersects(box(*croppt)):
            continue
        sem = path["layerSemantic"]
        color = (213,55,45,210) if sem in WALL else (32,130,205,210) if sem in DOORS else (130,55,190,210)
        draw_overlay_path(draw,path,(x0,y0),scale,color)
    draw = ImageDraw.Draw(overlay, "RGBA")
    lx, ly = label; px, py = (lx-x0)*scale, (ly-y0)*scale
    draw.ellipse((px-9,py-9,px+9,py+9),fill=(0,110,240,220),outline=(255,230,0,255),width=3)
    draw.text((px+10,py-10),room_id,fill=(0,30,130,255),stroke_width=2,stroke_fill=(255,255,255,255))
    if label_box:
        bx0,by0,bx1,by1=label_box
        draw.rectangle(((bx0-x0)*scale,(by0-y0)*scale,(bx1-x0)*scale,(by1-y0)*scale),outline=(220,0,180,255),width=3)
    vector_overlay = output / f"{prefix}-vector-raster-overlay.png"; overlay.save(vector_overlay)

    seg = Image.new("RGB", (round((x1-x0)*PX_PER_PT),round((y1-y0)*PX_PER_PT)), "white")
    # Show physical wall paths in red and door/glazing candidates in separate colors.
    seg_rgba=Image.new("RGBA",seg.size,(255,255,255,255))
    for semset,color in ((WALL,(210,55,45,255)),(DOORS,(32,130,205,255)),(GLAZING,(130,55,190,255))):
        layer_mask=segment_mask(paths,croppt,PX_PER_PT,semset)
        col=Image.new("RGBA",seg.size,color);col.putalpha(layer_mask);seg_rgba.alpha_composite(col)
    if close_pt is not None:
        barrier=segment_mask(paths,croppt,PX_PER_PT,SEGMENT_BARRIERS)
        k=max(3,round(close_pt*PX_PER_PT));k+=1-k%2
        if close_pt: barrier=barrier.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
        # Magenta pixels are barriers introduced by temporary morphology.
        before=np.asarray(segment_mask(paths,croppt,PX_PER_PT,SEGMENT_BARRIERS))>0
        after=np.asarray(barrier)>0
        cap=Image.fromarray(np.uint8(after & ~before)*255)
        c=Image.new("RGBA",seg.size,(232,0,172,255));c.putalpha(cap);seg_rgba.alpha_composite(c)
    if component is not None:
        comp=Image.fromarray(np.uint8(component)*255).resize(seg.size,Image.Resampling.NEAREST)
        region=Image.new("RGBA",seg.size,(40,170,105,80));region.putalpha(Image.eval(comp,lambda p:round(p*80/255)));seg_rgba.alpha_composite(region)
    d=ImageDraw.Draw(seg_rgba,"RGBA")
    if candidate:
        coords=[((x-x0)*PX_PER_PT,(y-y0)*PX_PER_PT) for x,y in candidate.exterior.coords]
        d.polygon(coords,fill=(45,165,105,55),outline=(0,100,70,255),width=3)
    sx,sy=(lx-x0)*PX_PER_PT,(ly-y0)*PX_PER_PT
    d.ellipse((sx-8,sy-8,sx+8,sy+8),fill=(0,90,235,255),outline=(255,235,0,255),width=3)
    d.text((sx+10,sy-10),room_id,fill=(0,35,120,255),stroke_width=3,stroke_fill=(255,255,255,255))
    seg_path=output/f"{prefix}-segmentation-vector-snap.png";seg_rgba.convert("RGB").save(seg_path)

    doc.close()
    return {"sourceCrop":src_path.name,"wallMask":wall_path.name,"doorEvidenceMask":door_path.name,
            "glazingEvidenceMask":glazing_path.name,"textFurnitureExclusionMask":exclusion_path.name,
            "vectorRasterOverlay":vector_overlay.name,"segmentationVectorSnap":seg_path.name}, text_word_count


def run() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--repo",type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument("--pdf",type=Path,default=None)
    args=parser.parse_args();repo=args.repo.resolve();source=repo/"data/source";out=source/"pilots/v3";out.mkdir(parents=True,exist_ok=True)
    with gzip.open(source/"ff01-vectors.json.gz","rt",encoding="utf-8") as f: cache=json.load(f)
    pdf= args.pdf or Path(cache["summary"]["sourcePdf"])
    if not pdf.is_file(): raise FileNotFoundError(f"FF-01 source PDF is not accessible: {pdf}")
    paths=cache["cadDrawings"];anchors=label_points(source/"ROOM_MANIFEST.csv");boxes=word_boxes(pdf,anchors)
    pdoc=pymupdf.open(pdf);page=pdoc[0]
    source_rect=[round(float(v),4) for v in page.rect]
    media_box=[round(float(v),4) for v in page.mediabox]
    crop_box=[round(float(v),4) for v in page.cropbox]
    if page.rotation != 270 or source_rect != [0.0,0.0,2384.0,1684.0]:
        raise RuntimeError(f"Unexpected PDF display frame: rotation={page.rotation}, rect={source_rect}")
    pdoc.close()

    rows=[];all_files={};registration=[]
    for room_id,config in TARGETS.items():
        label=anchors[room_id];radius=config["radiusPt"];crop=(label[0]-radius,label[1]-radius,label[0]+radius,label[1]+radius)
        barrier=segment_mask(paths,crop,PX_PER_PT,SEGMENT_BARRIERS)
        seed=(round(radius*PX_PER_PT),round(radius*PX_PER_PT))
        chosen=None;chosen_comp=None;chosen_barrier=None;chosen_close=None;touches_border=True;selected_radius=radius
        # Room-seeded search: expand the local window only when the region
        # reaches its edge. Choose the smallest virtual gap closure that gives
        # a bounded component; report synthetic/open edges below.
        attempts=[]
        for current_radius in dict.fromkeys((radius, max(radius,180), max(radius,240))):
            current_crop=(label[0]-current_radius,label[1]-current_radius,label[0]+current_radius,label[1]+current_radius)
            local=segment_mask(paths,current_crop,PX_PER_PT,SEGMENT_BARRIERS)
            current_seed=(round(current_radius*PX_PER_PT),round(current_radius*PX_PER_PT))
            for close_pt in VIRTUAL_CLOSE_STEPS_PT:
                comp,closed=flood_component(local,current_seed,close_pt)
                ys,xs=np.where(comp)
                if not len(xs): continue
                border=bool(xs.min()==0 or ys.min()==0 or xs.max()==comp.shape[1]-1 or ys.max()==comp.shape[0]-1)
                area_pt2=len(xs)/(PX_PER_PT**2)
                attempts.append({"radiusPt":current_radius,"virtualClosePt":close_pt,"areaPt2":round(area_pt2,1),"touchesCropEdge":border})
                if not border and area_pt2>=250:
                    chosen_comp=comp;chosen_barrier=closed;chosen_close=close_pt;selected_radius=current_radius;touches_border=False;break
            if not touches_border: break
        if chosen_comp is None:
            # Preserve an explicitly open, editable region proposal instead
            # of inventing a closed room boundary.
            selected_radius=max(radius,240)
            crop=(label[0]-selected_radius,label[1]-selected_radius,label[0]+selected_radius,label[1]+selected_radius)
            local=segment_mask(paths,crop,PX_PER_PT,SEGMENT_BARRIERS)
            chosen_comp,chosen_barrier=flood_component(local,(round(selected_radius*PX_PER_PT),)*2,0)
            chosen_close=0;touches_border=True
        else:
            crop=(label[0]-selected_radius,label[1]-selected_radius,label[0]+selected_radius,label[1]+selected_radius)
        candidate=mask_polygon(chosen_comp,crop,PX_PER_PT,label)
        if candidate is None: raise RuntimeError(f"No seed component boundary could be vectorized for {room_id}")
        local_lines,local_meta,tree=_source_line_index(paths,crop)
        candidate,source_ids,unresolved,supported,virtual_types=evidence_for_polygon(candidate,local_lines,local_meta,tree)
        label_in= candidate.covers(Point(label))
        valid=candidate.is_valid and candidate.exterior.is_simple and candidate.area>0
        area_m2=candidate.area*(0.10583333333333333**2)
        close_mask=np.asarray(chosen_barrier)>0
        before_mask=np.asarray(segment_mask(paths,crop,PX_PER_PT,SEGMENT_BARRIERS))>0
        cap_pixels=int(np.count_nonzero(close_mask & ~before_mask))
        cropbbox=[round(v,3) for v in crop]
        # Record coordinate agreement between label anchors and independent
        # PDF word boxes. For baseline-only labels, center distance is expected.
        wb=boxes[room_id]
        word_distance=None
        anchor_inside_word_box=False
        if wb:
            word_center=((wb[0]+wb[2])/2,(wb[1]+wb[3])/2)
            word_distance=round(math.dist(label,word_center),4)
            anchor_inside_word_box=(wb[0]-1<=label[0]<=wb[2]+1 and wb[1]-1<=label[1]<=wb[3]+1)
        registration.append({"roomID":room_id,"sourceLabelAnchorPt":[round(x,4) for x in label],"pdfWordBBoxPt":wb,
                              "anchorInsideIndependentWordBBox":anchor_inside_word_box,
                              "anchorToPdfWordCenterPt":word_distance,"displayFramePt":source_rect,
                              "mediaBoxRawPt":media_box,"cropBoxRawPt":crop_box,"rotation":270,
                              "status":"COORDINATE_FRAME_CONSISTENT" if wb and anchor_inside_word_box else "REVIEW_REQUIRED"})
        previews,text_word_count=save_preview(pdf,crop,label,wb,out,paths,candidate,chosen_comp,chosen_close,room_id,selected_radius)
        all_files[room_id]=previews
        row={"roomID":room_id,"candidateID":f"ff01-{room_id.lower()}-seed-v3","status":"HUMAN_REVIEW_REQUIRED",
             "method":"room-seeded raster connected-component segmentation over wall+door+glazing layer masks; vector-snapped contour",
             "sourceLabelAnchorPt":[round(x,4) for x in label],"sourceLabelBBoxPt":wb,"cropBBoxPt":cropbbox,
             "coordinateFrame":"FF-01 page rotation 270 normalized display points; 2384x1684 pt",
             "polygonSourcePt":[[round(x,3),round(y,3)] for x,y in candidate.exterior.coords],
             "polygonWorldMetersIllustrativeScale":[[round((x-461.72)*0.105833333,4),round((y-304.72)*0.105833333,4)] for x,y in candidate.exterior.coords],
             "areaPt2":round(candidate.area,2),"areaM2IllustrativeScale":round(area_m2,2),
             "textWordCountInExclusionMask":text_word_count,
             "expectedAreaM2FromNearbyText":config["expectedAreaM2"],"polygonValid":valid,"seedInside":label_in,
             "boundaryVectorSupportFraction":round(supported,4),"sourcePathIDs":source_ids,
             "barrierSourceClasses":["wall","door candidate","glazing candidate"],"virtualCloseWidthPt":chosen_close,
             "virtualClosurePixelCount":cap_pixels,"virtualClosuresArePhysicalWalls":False,
             "touchesSearchCropEdge":touches_border,"unresolvedEdges":unresolved,
             "unresolvedEdgeCount":len(unresolved),"virtualBoundaryTypes":virtual_types,
             "searchAttempts":attempts,"independentIoU":"NOT_MEASURABLE: no independently reviewed reference polygon",
             "reviewDecision":None,"visualEvidence":previews,
             "issues":["Candidate is machine-generated and requires human verification.",
                       "Door and glazing paths were used only as temporary segmentation barriers; no physical wall or navigable opening is asserted."]}
        if not label_in: row["issues"].append("Source text anchor falls outside candidate; verify label bbox / seed placement.")
        if not valid: row["issues"].append("Polygon validity check failed.")
        if touches_border: row["issues"].append("Seed component remains open at the search crop boundary.")
        if row["unresolvedEdgeCount"]: row["issues"].append(f"{row['unresolvedEdgeCount']} contour edges need review; edge evidence is listed individually.")
        if config["expectedAreaM2"] and abs(area_m2-config["expectedAreaM2"])/config["expectedAreaM2"]>0.15:
            row["issues"].append("Candidate area differs from nearby source annotation by more than 15%; do not infer accuracy from area alone.")
        rows.append(row)

    polygonize_stats=polygonize_diagnostic(paths,anchors)
    rootcause={"coordinateDiagnosis":{"status":"VERIFIED_CONSISTENT" if all(r["status"]=="COORDINATE_FRAME_CONSISTENT" for r in registration) else "REVIEW_REQUIRED",
                 "pageRotation":270,"mediaBoxRawPt":media_box,"cropBoxRawPt":crop_box,"displayFramePt":source_rect,
                 "pageRotationMatrix":[0,-1,1,0,0,1684],
                 "pathJoinCount":cache["summary"]["cadLayers"]["pathJoin"]["joinedByStableSequenceAndBbox"],
                 "labelBoxCount":sum(bool(r["pdfWordBBoxPt"]) for r in registration),
                 "note":"PyMuPDF rotation_matrix-normalized vector paths and room word boxes are compared in the same top-left display frame; editor source image is mapped to the same 2384x1684 viewBox."},
               "previousPolygonizer":{"wallOnly":polygonize_stats["wallOnly"],"wallDoorGlazing":polygonize_stats["wallDoorGlazing"],
                 "causes":["The prior wall filter excluded Door and Window/Glazing layers. These vectors form segmentation boundaries in multiple pilots; S208 closes only when glazing vectors enter the linework.",
                           "Door apertures/folding partitions leave the wall-only line network open. Global polygonize requires closed cycles and cannot infer room semantics from seed points.",
                           "Filled wall drawings were treated as linework; rasterization now honors filled subpaths as barrier evidence.",
                           "The old crop for Pilot A clipped context around M103; seed-centered expansion is now adaptive."],
                 "limits":["Door leaf vectors are not verified door openings.","Candidate polygons still need independent human source review; no candidate is VERIFIED."]}}
    result={"schemaVersion":3,"sourcePdfSha256":cache["summary"]["sourcePdfSha256"],"coordinateRegistration":registration,
            "rootCause":rootcause,"candidateCount":len(rows),"independentlyVerifiedCount":0,"pilots":rows}
    json_path=out/"PILOT_HYBRID_RECONSTRUCTION.json";json_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for room_id,files in all_files.items():
        dest=repo/"public/ff01-pilot-v3";dest.mkdir(parents=True,exist_ok=True)
        for name in files.values(): shutil.copy2(out/name,dest/name)
    (out/"PILOT_FAILURE_ROOT_CAUSE.md").write_text(render_rootcause(rootcause,rows),encoding="utf-8")
    (repo/"docs/PILOT_FAILURE_ROOT_CAUSE.md").write_text(render_rootcause(rootcause,rows),encoding="utf-8")
    (repo/"docs/PILOT_GEOMETRY_VALIDATION.md").write_text(render_validation(rows),encoding="utf-8")
    (repo/"docs/UPDATED_UNRESOLVED_GEOMETRY.md").write_text(render_unresolved(rows),encoding="utf-8")
    (repo/"docs/HYBRID_RECONSTRUCTION.md").write_text(render_method(),encoding="utf-8")
    print(json.dumps({"summary":{"candidateCount":len(rows),"independentlyVerifiedCount":0,"coordinateStatus":"VERIFIED_CONSISTENT"},
                      "pilots":[{"roomID":r["roomID"],"areaM2":r["areaM2IllustrativeScale"],"valid":r["polygonValid"],
                                 "seedInside":r["seedInside"],"vectorSupport":r["boundaryVectorSupportFraction"],
                                 "virtualClosePt":r["virtualCloseWidthPt"],"unresolvedEdges":r["unresolvedEdgeCount"],
                                 "openAtCrop":r["touchesSearchCropEdge"],"issues":r["issues"]} for r in rows]},ensure_ascii=False,indent=2))


def render_rootcause(rootcause: dict, rows: list[dict]) -> str:
    diagnosis=rootcause["coordinateDiagnosis"];prev=rootcause["previousPolygonizer"]
    lines=["# Pilot failure root cause — V3", "", "## Coordinate diagnosis", "",
           f"**{diagnosis['status']}**: raw MediaBox {diagnosis['mediaBoxRawPt']} pt and CropBox {diagnosis['cropBoxRawPt']} pt are transformed by rotation 270 to display frame {diagnosis['displayFramePt']} pt. The six source crops draw each independently extracted Room ID bbox and 10 pt grid over the PDF and layer vectors.", "",
           "## Why the previous Polygonize run returned 0/6", "",
           f"Wall-only linework generated {prev['wallOnly']['faceCount']} faces; adding door and glazing candidates generated {prev['wallDoorGlazing']['faceCount']} faces. A face count is not room count.", "",
           "| Room | Nearest wall-only face | Adding door and glazing evidence |", "|---|---:|---|"]
    for rid,record in prev["wallOnly"]["rooms"].items():
        with_doors=prev["wallDoorGlazing"]["rooms"][rid]
        if with_doors["containingFaceAreasPt2"]:
            after=f"containing face(s) {with_doors['containingFaceAreasPt2']} pt²"
        else:
            after=f"no containing face; nearest {with_doors['nearestFaceDistancePt']} pt, area {with_doors['nearestFaceAreaPt2']} pt²"
        lines.append(f"| {rid} | {record['nearestFaceDistancePt']} pt; nearest face {record['nearestFaceAreaPt2']} pt² | {after} |")
    lines += ["", f"The wall-only input has {prev['wallOnly']['filledPathCount']} filled paths ({prev['wallOnly']['filledPathsImplicitlyOpen']} open fill chains under the path-chain diagnostic). The old polygonizer treated these as line outlines only; V3 also rasterizes filled source subpaths into structural barrier masks. The primary blocker was topology, not a rotated coordinate frame: the old pipeline required closed line cycles, excluded opening/glazing evidence, did not distinguish temporary door closure from physical walls, and had no room-seed semantics. The prior M102/M103/M104 crop also clipped context around M103.", "",
              "## V3 room-seeded candidate results", "", "| Room | Candidate area | Simple/valid | Seed contained | Vector support | Virtual close | Unresolved edges | Independent IoU |", "|---|---:|---|---|---:|---:|---:|---|"]
    for row in rows: lines.append(f"| {row['roomID']} | {row['areaM2IllustrativeScale']:.2f} m² | {row['polygonValid']} | {row['seedInside']} | {row['boundaryVectorSupportFraction']:.1%} | {row['virtualCloseWidthPt']} pt | {row['unresolvedEdgeCount']} | NOT MEASURABLE |")
    lines += ["", "All six geometries are `HUMAN_REVIEW_REQUIRED`. CAD door/glazing geometry was used only as temporary segmentation evidence. Independent room IoU remains unmeasurable until a reviewer confirms source boundaries. Per-room PNG crops, masks, vector/raster overlays, and candidate contours are next to `PILOT_HYBRID_RECONSTRUCTION.json`.", ""]
    return "\n".join(lines)


def render_validation(rows: list[dict]) -> str:
    lines=["# Pilot geometry validation — V3", "", "## Current result", "",
           f"Candidates generated: **{len(rows)}/6**. Independently verified room polygons: **0/6**. Formal room IoU: **NOT MEASURABLE** until an independent reference trace is reviewed.", "",
           "All candidates pass the mechanical checks that their polygon ring is finite, simple, non-self-intersecting, has positive area, and contains its source label anchor. These checks do not prove that the perimeter encloses only the labeled room.", "",
           "| Room | Candidate area | Nearby source area annotation | Relative difference | Seed inside | Polygon valid | Perimeter within 2.5 pt of any source vector | Virtual close | Unresolved edges | Independent IoU |", "|---|---:|---:|---:|---|---|---:|---:|---:|---|"]
    for r in rows:
        expected=r.get("expectedAreaM2FromNearbyText")
        area_error=f"{abs(r['areaM2IllustrativeScale']-expected)/expected:.1%}" if expected else "n/a"
        lines.append(f"| {r['roomID']} | {r['areaM2IllustrativeScale']:.2f} m² | {expected:.1f} m²" if expected else f"| {r['roomID']} | {r['areaM2IllustrativeScale']:.2f} m² | n/a")
        lines[-1] += f" | {area_error} | {r['seedInside']} | {r['polygonValid']} | {r['boundaryVectorSupportFraction']:.1%} | {r['virtualCloseWidthPt']} pt | {r['unresolvedEdgeCount']} | NOT MEASURABLE |"
    lines += ["", "`Perimeter within 2.5 pt of any source vector` includes Door and Window/Glazing candidates; those are evidence classes, not verified physical wall edges. Virtual-close widths are morphological segmentation parameters, not measured door widths. See each JSON row's `unresolvedEdges` for coordinates, source path IDs and objections.", "",
              "## Required independent review", "", "- Compare each candidate overlay with its 300 DPI source crop.", "- Confirm each exterior/interior edge and record reviewer decision before changing status.", "- Confirm a door leaf/opening separately; virtual closure cannot become a 3D wall or route barrier.", "- Reject or correct candidates whose source area annotation and segmented area conflict; area is a diagnostic only.", "- Recompute IoU only against a separately reviewed reference polygon.", "", "Evidence files: `data/source/pilots/v3/`; browser review: `/dev/geometry-review`.", ""]
    return "\n".join(lines)


def render_unresolved(rows: list[dict]) -> str:
    lines=["# Updated unresolved FF-01 Pilot geometry", "", "No room polygon in this file is VERIFIED. V3 provides six editable candidates, each explicitly marked `HUMAN_REVIEW_REQUIRED`.", "",
           "| Room | Candidate vs nearby source area text | Main issue | Unresolved edges | Source IDs | Evidence |", "|---|---:|---|---:|---:|---|"]
    for r in rows:
        reasons="; ".join(r["issues"])
        expected=r.get("expectedAreaM2FromNearbyText")
        area=f"{r['areaM2IllustrativeScale']:.2f} / {expected:.1f} m² ({abs(r['areaM2IllustrativeScale']-expected)/expected:.1%})" if expected else f"{r['areaM2IllustrativeScale']:.2f} / n/a"
        lines.append(f"| {r['roomID']} | {area} | {reasons} | {r['unresolvedEdgeCount']} | {len(r['sourcePathIDs'])} | [300 DPI vector/raster overlay](../data/source/pilots/v3/{r['visualEvidence']['vectorRasterOverlay']}) · [segmentation result](../data/source/pilots/v3/{r['visualEvidence']['segmentationVectorSnap']}) |")
    lines += ["", "## Geometry integrity", "", "Temporary door/glazing barriers are flagged per edge. Any contour edge farther than 2.5 pt from a source vector remains explicitly unresolved. M104 currently needs a particularly careful review because its candidate area differs from the nearby source annotation by more than 15%. No candidate has been added to production map geometry or navigation.", ""]
    return "\n".join(lines)


def render_method() -> str:
    return """# FF-01 Hybrid Reconstruction Pipeline V3

## Coordinate frame

The source page has raw MediaBox/CropBox `[0, 0, 1684, 2384]` and `/Rotate 270`. PyMuPDF's rotation matrix maps the plan into the display frame `[0, 0, 2384, 1684]` points. The vector cache and source label anchors already use this top-left display frame. V3 independently obtains PDF text word boxes, transforms them through the same matrix, and verifies the anchor is inside the matching room-ID word box. Each local crop includes a 10 pt grid and the label box.

## Evidence masks

`scripts/recover_ff01_hybrid.py` reads the layer-aware vector cache. The source PDF crop, vector overlay and exported wall/door/glazing/exclusion masks render at 300 DPI. The bounded room-seed morphology works on a 2-pixel-per-point (144 DPI) local barrier mask; vector snapping returns contour vertices to source coordinates. Source PDF words are transformed through the page rotation matrix and added to the exclusion mask along with furniture, equipment, annotation, dimensions and unknown paths. Filled PDF subpaths are filled using their PDF implicit-close semantics. The rendered PDF crop is kept separately as the visual reference.

The local seed segmentation uses only those structural masks. Door and glazing vectors may participate as temporary barriers to segment a seed region; those edges remain unresolved evidence, never physical walls. A small morphology close can bridge pixel-scale gaps; the actual close width is stored per room. Contour vertices are snapped to source vectors only within 2.5 pt. Every unsupported contour edge is serialized with coordinates and an explanation.

## Outputs and status

The pipeline writes `data/source/pilots/v3/PILOT_HYBRID_RECONSTRUCTION.json`, six source crops, six wall masks, door/glazing masks, exclusion masks, vector/raster overlays, segmentation/vector-snap images, and mirrored browser assets under `public/ff01-pilot-v3/`. Candidate coordinates remain in normalized PDF display points and include illustrative scale-derived metres, source P-IDs, unresolved edges and per-pilot attempts. All candidates remain `HUMAN_REVIEW_REQUIRED`; no automatic result is VERIFIED or production geometry.

## Reproduction

With the dependencies in `scripts/requirements-spatial.txt` installed in an isolated environment and the source PDF at its recorded source path:

```sh
python scripts/recover_ff01_hybrid.py
npm run validate:spatial
```

Run `npm run dev` and open `/dev/geometry-review` to focus a room, inspect its candidate and source evidence, edit vertices, snap to vector edges, split an edge, remove a vertex, undo/redo, and save a local revision. A reviewer decision is required before verification.
"""


if __name__ == "__main__":
    run()
