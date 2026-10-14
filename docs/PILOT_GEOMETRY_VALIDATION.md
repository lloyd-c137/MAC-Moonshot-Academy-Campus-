# Pilot Geometry Validation — V4

## Actual results

- Six candidate polygons are valid, have nonzero area, and contain the label seed according to Shapely 2.0.7 machine checks.
- Complete numbered boundary edges: 131.
- Source-evidence correction proposals: 14; at most three per room, max endpoint displacement 2.5 PDF pt. None were auto-applied.
- Source-boundary matching is candidate evidence only; it is not independent room boundary validation.
- Verified room geometries: 0/6. Independent room IoU: not measurable for all six.
- All edge-review records remain NOT_REVIEWED; no reviewer identity or verification record was created.
- M102 local draft revision 5 remains present. The package generator does not write to active overrides.

## Results by room

| Room | Candidate m² | Label annotation m² | Deviation | Edges | Wall-aligned candidates | Door/glazing candidates | Unsupported | Proposals | Independent IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M102 | 72.81 | 131.00 | -44.4% | 15 | 6 | 7 | 1 | 3 | NOT MEASURABLE |
| M103 | 177.67 | 196.30 | -9.5% | 24 | 14 | 4 | 0 | 2 | NOT MEASURABLE |
| M104 | 98.88 | 62.60 | +58.0% | 16 | 8 | 3 | 0 | 0 | NOT MEASURABLE |
| S208 | 21.18 | 29.20 | -27.5% | 20 | 13 | 3 | 0 | 3 | NOT MEASURABLE |
| S209 | 19.60 | 20.00 | -2.0% | 20 | 13 | 3 | 0 | 3 | NOT MEASURABLE |
| S210 | 48.16 | 50.90 | -5.4% | 36 | 23 | 7 | 1 | 3 | NOT MEASURABLE |

## What the measurements establish

Polygon validity and seed containment test internal consistency only. Vector alignment measures distance/orientation/coverage against source CAD paths but cannot distinguish a room-side wall face from a parallel face, door swing, glazing, or annotation. Area annotation deviation does not locate a boundary error. Candidate corrections are small evidence-guided variants, not asserted improvements. A separately reviewed reference polygon is required before IoU can be calculated.

## Acceptance status

- Automated review infrastructure: PASS for the implemented evidence package, edge review controls, correction draft, undo, revision persistence, and reload flows. This does not verify room boundaries.
- Six-room geometry: AWAITING VERIFICATION.
- Formal room polygons remain unavailable for production map, 2.5D, and navigation.

## Browser evidence

Actual Chrome at 1536 × 864 on the local dev server exercised M104 room focus, numbered-edge selection and evidence, missing-reviewer guard, M102 correction proposal application and undo, and M104 edge translation and undo. A separate Vite instance pointed at a disposable `/tmp` review store exercised save as revision 6, reload of the saved polygon, and append-only edge-decision persistence as revision 7. The temp fixture used an explicitly test-only identity and was not copied into project data. Active project revision remains 5; no human edge decision was saved.

![M104 source crop with selected boundary evidence](../output/playwright/geometry-review-v4_M104-edge_1536x864.png)

![M102 candidate with evidence-guided draft proposal](../output/playwright/geometry-review-v4_M104-review_1536x864.png)
