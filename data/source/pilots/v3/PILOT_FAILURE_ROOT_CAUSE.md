# Pilot failure root cause — V3

## Coordinate diagnosis

**VERIFIED_CONSISTENT**: raw MediaBox [0.0, 0.0, 1684.0, 2384.0] pt and CropBox [0.0, 0.0, 1684.0, 2384.0] pt are transformed by rotation 270 to display frame [0.0, 0.0, 2384.0, 1684.0] pt. The six source crops draw each independently extracted Room ID bbox and 10 pt grid over the PDF and layer vectors.

## Why the previous Polygonize run returned 0/6

Wall-only linework generated 2647 faces; adding door and glazing candidates generated 4017 faces. A face count is not room count.

| Room | Nearest wall-only face | Adding door and glazing evidence |
|---|---:|---|
| M102 | 29.023 pt; nearest face 21.78 pt² | no containing face; nearest 22.56 pt, area 329.57 pt² |
| M103 | 30.729 pt; nearest face 21.78 pt² | no containing face; nearest 30.729 pt, area 21.78 pt² |
| M104 | 22.308 pt; nearest face 15.3 pt² | no containing face; nearest 3.416 pt, area 241.71 pt² |
| S208 | 9.614 pt; nearest face 20.8 pt² | containing face(s) [1945.31] pt² |
| S209 | 10.37 pt; nearest face 61.65 pt² | no containing face; nearest 10.37 pt, area 61.65 pt² |
| S210 | 7.83 pt; nearest face 89.7 pt² | no containing face; nearest 7.83 pt, area 89.7 pt² |

The wall-only input has 921 filled paths (0 open fill chains under the path-chain diagnostic). The old polygonizer treated these as line outlines only; V3 also rasterizes filled source subpaths into structural barrier masks. The primary blocker was topology, not a rotated coordinate frame: the old pipeline required closed line cycles, excluded opening/glazing evidence, did not distinguish temporary door closure from physical walls, and had no room-seed semantics. The prior M102/M103/M104 crop also clipped context around M103.

## V3 room-seeded candidate results

| Room | Candidate area | Simple/valid | Seed contained | Vector support | Virtual close | Unresolved edges | Independent IoU |
|---|---:|---|---|---:|---:|---:|---|
| M102 | 72.81 m² | True | True | 100.0% | 0 pt | 8 | NOT MEASURABLE |
| M103 | 177.67 m² | True | True | 81.7% | 12 pt | 8 | NOT MEASURABLE |
| M104 | 98.88 m² | True | True | 80.8% | 24 pt | 6 | NOT MEASURABLE |
| S208 | 21.18 m² | True | True | 100.0% | 0 pt | 4 | NOT MEASURABLE |
| S209 | 19.60 m² | True | True | 100.0% | 0 pt | 3 | NOT MEASURABLE |
| S210 | 48.16 m² | True | True | 100.0% | 0 pt | 5 | NOT MEASURABLE |

All six geometries are `HUMAN_REVIEW_REQUIRED`. CAD door/glazing geometry was used only as temporary segmentation evidence. Independent room IoU remains unmeasurable until a reviewer confirms source boundaries. Per-room PNG crops, masks, vector/raster overlays, and candidate contours are next to `PILOT_HYBRID_RECONSTRUCTION.json`.
