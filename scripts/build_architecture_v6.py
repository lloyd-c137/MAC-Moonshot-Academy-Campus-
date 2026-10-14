#!/usr/bin/env python3
"""Build a source-traceable whole-sheet architectural model from FF-01 vectors.

The output preserves source paths and layer provenance. Native paths are tracing
evidence, not a claim that every path is a wall or every enclosure is verified.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import math
import shutil
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
SEMANTICS = {
    'Existing Wall', 'New Partition', 'Structural Wall / Column', 'Architectural Wall',
    'Door', 'Stair', 'Arena / Seating', 'Floor / Surface', 'Window / Glazing'
}
WALLS = {'Existing Wall', 'New Partition', 'Architectural Wall'}
STRUCTURAL = {'Structural Wall / Column'}
M_PER_PT = 25.4 * 300 / 72 / 1000


def chains(path: dict[str, Any], curve_steps: int = 12) -> list[list[list[float]]]:
    result: list[list[list[float]]] = []
    chain: list[list[float]] = []
    def flush():
        nonlocal chain
        if len(chain) > 1: result.append(chain)
        chain = []
    for item in path.get('items', []):
        if not item: continue
        kind, *v = item
        if kind == 'l' and len(v) == 2:
            a, b = [list(map(float, point)) for point in v]
            if not chain: chain = [a, b]
            elif math.dist(chain[-1], a) < .025: chain.append(b)
            elif math.dist(chain[-1], b) < .025: chain.append(a)
            else: flush(); chain = [a, b]
        elif kind == 'c' and len(v) == 3 and chain:
            p0, p1, p2, p3 = chain[-1], *[list(map(float, point)) for point in v]
            for i in range(1, curve_steps + 1):
                t = i / curve_steps; u = 1 - t
                chain.append([u**3*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t**3*p3[0],
                              u**3*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t**3*p3[1]])
        elif kind == 'poly' and v and v[0]:
            flush(); result.append([list(map(float, point)) for point in v[0]])
    flush()
    return result


def fill_polygons(path: dict[str, Any]) -> list[list[list[float]]]:
    lines = []
    for chain in chains(path):
        pts = list(chain)
        if len(pts) > 2 and math.dist(pts[0], pts[-1]) > .025: pts.append(pts[0])
        if len(pts) >= 4: lines.append(LineString(pts))
    if not lines: return []
    faces = [face for face in polygonize(unary_union(lines)) if face.area > .03]
    if not faces: return []
    merged = unary_union(faces)
    geoms = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    return [[[round(float(x), 4), round(float(y), 4)] for x, y in geom.exterior.coords] for geom in geoms if isinstance(geom, Polygon) and geom.area > .03]


def load_manifest() -> list[dict[str, Any]]:
    rows=[]
    with (SOURCE/'ROOM_MANIFEST.csv').open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            rows.append({'roomID':row['SourceRoomLabel'], 'baseRoomCode':row['BaseRoomCode'],
                         'occurrenceIndex':int(row['OccurrenceIndex']),
                         'sourceLabelPt':[float(row['SourceLabelXPt']),float(row['SourceLabelYPt'])],
                         'planPoint':[float(row['PlanXNormalized']),float(row['PlanYNormalized'])],
                         'areaAnnotation':row['NearbySourceTextCandidates'] or None,
                         'spaceID':f"FF01-ROOM-{row['SourceRoomLabel']}",
                         'geometryStatus':'UNRESOLVED', 'polygon':None})
    return rows


def run() -> None:
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,default=ROOT);args=parser.parse_args();repo=args.repo.resolve();source=repo/'data/source'
    with gzip.open(source/'ff01-vectors.json.gz','rt',encoding='utf-8') as stream: cache=json.load(stream)
    summary=json.loads((source/'spatial-extraction-summary.json').read_text())
    assert cache['summary']['sourcePdfSha256']==summary['sourcePdfSha256']
    paths=[row for row in cache['cadDrawings'] if row.get('layerSemantic') in SEMANTICS]
    groups=defaultdict(list);path_counts=Counter();segment_counts=Counter();fills=[];all_segments=[]
    for path in paths:
        sem=path['layerSemantic'];pid=path.get('sourcePathID') or path['id'];path_counts[sem]+=1
        provenance={'sourcePathID':pid,'drawingID':path.get('id'),'layer':path.get('layer'),'semantic':sem}
        if sem in WALLS | STRUCTURAL:
            if path.get('fill') is not None and sem in STRUCTURAL | {'Existing Wall'}:
                for ring_index,ring in enumerate(fill_polygons(path)):
                    fills.append({**provenance,'ringID':f'{pid}-F{ring_index+1:02d}','polygonPt':ring,'geometryStatus':'SOURCE_FILL_CANDIDATE'})
                continue
            for chain_index,chain in enumerate(chains(path)):
                for a,b in zip(chain,chain[1:]):
                    if math.dist(a,b) < .02: continue
                    seg={**provenance,'segmentID':f'{pid}-S{chain_index+1:02d}-{len(all_segments)+1:06d}','aPt':[round(a[0],4),round(a[1],4)],'bPt':[round(b[0],4),round(b[1],4)]}
                    groups[sem].append(seg);all_segments.append(seg);segment_counts[sem]+=1
        else:
            for chain_index,chain in enumerate(chains(path)):
                for a,b in zip(chain,chain[1:]):
                    if math.dist(a,b) >= .04:
                        groups[sem].append({**provenance,'segmentID':f'{pid}-S{chain_index+1:02d}-{len(groups[sem])+1:06d}','aPt':[round(a[0],4),round(a[1],4)],'bPt':[round(b[0],4),round(b[1],4)]})
                        segment_counts[sem]+=1
    pilots=json.loads((source/'pilots/v3/PILOT_HYBRID_RECONSTRUCTION.json').read_text())['pilots']
    pilot_by_id={row['roomID']:row for row in pilots}
    rooms=load_manifest()
    for room in rooms:
        pilot=pilot_by_id.get(room['roomID']) if room['occurrenceIndex']==1 else None
        if pilot:
            room['polygon']={'candidateID':pilot['candidateID'],'coordinatesPdfDisplayPt':pilot['polygonSourcePt'],'areaM2Illustrative':pilot['areaM2IllustrativeScale'],'sourcePathIDs':pilot['sourcePathIDs'],'candidateStatus':'REVIEW_READY','verificationLevel':'UNVERIFIED','iouStatus':'NOT_MEASURABLE'}
            room['geometryStatus']='PILOT_CANDIDATE_UNVERIFIED'
    # Collapse only exact coincident source segments into one trace edge. This
    # creates a shared evidence graph without snapping endpoints or claiming
    # that adjacent segments form a topologically verified wall.
    trace_edges={}
    for segment in all_segments:
        a=tuple(round(float(value),3) for value in segment['aPt'])
        b=tuple(round(float(value),3) for value in segment['bPt'])
        key=tuple(sorted((a,b)))
        edge=trace_edges.setdefault(key,{'traceEdgeID':f'FF01-TRACE-{len(trace_edges)+1:06d}','aPt':list(a),'bPt':list(b),'sourceEvidence':[]})
        evidence={'sourcePathID':segment['sourcePathID'],'drawingID':segment['drawingID'],'layer':segment['layer'],'semantic':segment['semantic'],'segmentID':segment['segmentID']}
        if evidence not in edge['sourceEvidence']: edge['sourceEvidence'].append(evidence)
    model={
        'schemaVersion':1,'modelID':'FF01-ARCHITECTURE-V6','modelStatus':'DEVELOPER_PREVIEW_SOURCE_TRACES',
        'source':{'drawing':'FF-01','sourcePdfSha256':summary['sourcePdfSha256'],'sourcePdfPath':summary['sourcePdf'],'pageRotation':summary['pageRotation'],'sourcePagePoints':summary['sourcePagePoints'],'nativePathCount':len(cache['cadDrawings']),'tracePathCount':len(paths)},
        'coordinateSystem':{'name':'FF01_NORMALIZED_PDF_DISPLAY_PT','origin':'top-left of page after 270 degree rotation normalization','pageSizePt':summary['sourcePagePoints'],'worldUnits':'meters','metresPerPdfPoint':M_PER_PT,'worldX':summary['coordinateSystem']['transform']['worldXmeters'],'worldZ':summary['coordinateSystem']['transform']['worldZmeters'],'worldOriginPdfPt':[summary['coordinateSystem']['gridFrame']['minXPt'],summary['coordinateSystem']['gridFrame']['minYPt']],'gridFrameIsExteriorFootprint':False},
        'illustrative3D':{'wallHeightM':2.8,'wallThicknessM':0.16,'floorElevationM':0,'parametersAreMeasured':False,'doorOpeningsCutFromWalls':False},
        'buildingFootprint':{'geometry':None,'status':'UNRESOLVED_REQUIRES_TRACING','note':'Do not infer the exterior footprint from overall dimension chains or a room envelope.'},
        'wallNetwork':{'segmentsBySemantic':{key:groups[key] for key in sorted(WALLS)},'structuralFillCandidates':fills,'deduplicatedWallTraceSegments':list(trace_edges.values()),'segmentCounts':dict(segment_counts),'pathCounts':dict(path_counts),'traceEdgeMergePolicy':'Exact source-coordinate coincidence after 0.001 pt serialization rounding only; no endpoint snapping or wall topology inferred.'},
        'evidenceNetworks':{key:groups[key] for key in sorted(SEMANTICS-WALLS-STRUCTURAL)},
        'spaces':rooms,
        'coverage':{'sourceRoomLabelOccurrences':summary['roomLabelOccurrences'],'uniqueSourceRoomLabelIDs':summary['uniqueSourceRoomLabelIDs'],'uniqueBaseRoomCodes':summary['uniqueBaseRoomCodes'],'pilotPolygons':len(pilot_by_id),'otherRoomPolygons':'NOT_GENERATED','verifiedRoomPolygons':0,'doorOpenings':'NOT_ASSERTED','corridorPolygons':'NOT_GENERATED','navigationEdges':0},
        'provenancePolicy':'Every structural/evidence segment retains sourcePathID and CAD layer. Source layers are evidence, not independent semantic verification. Only six room polygons are carried as unverified pilot candidates; other labels have no invented polygon.'}
    output=source/'canonical-architecture-v6.json';output.write_text(json.dumps(model,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    public=repo/'public/ff01-architecture-v6.json';shutil.copy2(output,public)
    report={'model':output.relative_to(repo).as_posix(),'publicCopy':public.relative_to(repo).as_posix(),'tracePaths':len(paths),'wallSegments':dict(segment_counts),'deduplicatedWallTraceEdges':len(trace_edges),'structuralFillCandidates':len(fills),'sourceLabels':len(rooms),'roomPolygonCandidates':sum(bool(row['polygon']) for row in rooms),'verifiedRoomPolygons':0,'status':'SOURCE_TRACES_READY_DEVELOPER_PREVIEW_ONLY'}
    (source/'canonical-architecture-v6-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': run()
