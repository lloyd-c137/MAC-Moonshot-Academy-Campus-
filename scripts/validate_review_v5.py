#!/usr/bin/env python3
"""Read-only integrity checks for the V5 human review workflow."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = json.loads((ROOT / 'data/source/pilots/v4/review-packages/index.json').read_text())['rooms']
OVERRIDES = json.loads((ROOT / 'data/geometry-review/overrides.json').read_text())
ORDER = ['M104', 'M102', 'S208', 'M103', 'S209', 'S210']

assert [row['roomID'] for row in sorted(PACKAGES, key=lambda row: ORDER.index(row['roomID']))] == ORDER
assert len(PACKAGES) == 6
assert OVERRIDES['revision'] >= 5
m102 = next(row for row in OVERRIDES['spaces'] if row['id'] == 'M102')
revision5 = json.loads((ROOT / 'data/geometry-review/history/rev-000005.json').read_text())
historical_m102 = next(row for row in revision5['spaces'] if row['id'] == 'M102')
assert m102 == historical_m102, 'M102 active draft must remain identical to its saved revision-5 record'
assert len(m102['points']) == 16 and m102['status'] == 'HUMAN_REVIEW_REQUIRED', 'M102 revision 5 draft unexpectedly changed'
assert not any(row.get('verificationLevel') in {'DRAWING_VERIFIED', 'FIELD_VERIFIED'} for row in OVERRIDES['spaces']), 'Do not claim verification without human review'
assert not OVERRIDES.get('verificationRecords'), 'Unexpected verification record in active store'
for package in PACKAGES:
    assert package['reviewPackageStatus'] == 'REVIEW_READY'
    assert package['geometry']['independentIoU'] == 'NOT_MEASURABLE'
    assert package['edges'] and len({edge['edgeID'] for edge in package['edges']}) == len(package['edges'])
    for edge in package['edges']:
        assert edge['sourcePathIDs'] is not None
        assert edge['startPt'] != edge['endPt']
print(json.dumps({'queue': ORDER, 'rooms': len(PACKAGES), 'candidateEdges': sum(len(row['edges']) for row in PACKAGES),
                  'verified': 0, 'm102RevisionPreserved': OVERRIDES['revision'], 'status': 'PASS'}))
