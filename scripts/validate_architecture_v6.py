#!/usr/bin/env python3
"""Validate provenance and safety invariants for the V6 source-trace model."""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/source'
EXPECTED_PILOTS = {'M102', 'M103', 'M104', 'S208', 'S209', 'S210'}


def main() -> None:
    model = json.loads((SOURCE / 'canonical-architecture-v6.json').read_text())
    summary = json.loads((SOURCE / 'spatial-extraction-summary.json').read_text())
    with gzip.open(SOURCE / 'ff01-vectors.json.gz', 'rt', encoding='utf-8') as stream:
        cache = json.load(stream)

    assert model['source']['sourcePdfSha256'] == summary['sourcePdfSha256'] == cache['summary']['sourcePdfSha256']
    pdf_path = Path(summary['sourcePdf'])
    if pdf_path.exists():
        digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        assert digest == model['source']['sourcePdfSha256'], 'Source PDF digest differs from vector cache'

    source_ids = {p.get('sourcePathID') or p['id'] for p in cache['cadDrawings']}
    segment_total = 0
    provenance_errors = []
    for group_name, segments in model['wallNetwork']['segmentsBySemantic'].items():
        for segment in segments:
            segment_total += 1
            if segment['sourcePathID'] not in source_ids or not segment.get('layer'):
                provenance_errors.append((group_name, segment.get('segmentID')))
    for group_name, segments in model['evidenceNetworks'].items():
        for segment in segments:
            segment_total += 1
            if segment['sourcePathID'] not in source_ids or not segment.get('layer'):
                provenance_errors.append((group_name, segment.get('segmentID')))
    for fill in model['wallNetwork']['structuralFillCandidates']:
        if fill['sourcePathID'] not in source_ids or not fill.get('layer'):
            provenance_errors.append(('structuralFillCandidates', fill.get('ringID')))
    for edge in model['wallNetwork']['deduplicatedWallTraceSegments']:
        if len(edge['aPt']) != 2 or len(edge['bPt']) != 2 or not edge['sourceEvidence']:
            provenance_errors.append(('deduplicatedWallTraceSegments', edge.get('traceEdgeID')))
        for evidence in edge['sourceEvidence']:
            if evidence['sourcePathID'] not in source_ids or not evidence.get('layer'):
                provenance_errors.append(('deduplicatedWallTraceSegments', edge.get('traceEdgeID')))
    assert not provenance_errors, f'{len(provenance_errors)} provenance errors; first={provenance_errors[:3]}'

    assert len(model['spaces']) == 101, f"Expected 101 room label occurrences, got {len(model['spaces'])}"
    pilots = {room['roomID'] for room in model['spaces'] if room.get('polygon')}
    assert pilots == EXPECTED_PILOTS, f'Pilot candidates changed unexpectedly: {sorted(pilots)}'
    assert all(room['polygon']['candidateStatus'] == 'REVIEW_READY' for room in model['spaces'] if room.get('polygon'))
    assert all(room['polygon']['verificationLevel'] == 'UNVERIFIED' for room in model['spaces'] if room.get('polygon'))
    assert model['coverage']['verifiedRoomPolygons'] == 0
    assert model['buildingFootprint']['geometry'] is None
    assert model['buildingFootprint']['status'] == 'UNRESOLVED_REQUIRES_TRACING'
    assert model['coverage']['corridorPolygons'] == 'NOT_GENERATED'
    assert model['coverage']['navigationEdges'] == 0
    assert model['illustrative3D']['parametersAreMeasured'] is False
    assert model['illustrative3D']['doorOpeningsCutFromWalls'] is False

    public = json.loads((ROOT / 'public/ff01-architecture-v6.json').read_text())
    assert public['source']['sourcePdfSha256'] == model['source']['sourcePdfSha256']
    report = {
        'result': 'PASS_SOURCE_TRACE_INTEGRITY_ONLY',
        'sourcePdfHashMatchesCache': True,
        'sourcePdfHashRecomputed': pdf_path.exists(),
        'sourcePaths': len(cache['cadDrawings']),
        'provenanceBearingSegments': segment_total,
        'deduplicatedWallTraceEdges': len(model['wallNetwork']['deduplicatedWallTraceSegments']),
        'structuralFillCandidates': len(model['wallNetwork']['structuralFillCandidates']),
        'roomLabelOccurrences': len(model['spaces']),
        'pilotCandidates': len(pilots),
        'verifiedRoomPolygons': 0,
        'buildingFootprint': model['buildingFootprint']['status'],
        'corridors': model['coverage']['corridorPolygons'],
        'note': 'This validates source provenance and non-overclaim invariants, not architectural accuracy or room verification.'
    }
    (SOURCE / 'canonical-architecture-v6-validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
