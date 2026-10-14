# M102 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 72.81 m²; nearby annotation: 131.00 m²; deviation: -44.4%.
- Polygon valid: True; seed inside: True; independent IoU: NOT MEASURABLE.
- Boundary edges: 15; source-aligned wall candidates: 6; openings: 7; unsupported: 1.
- Evidence-based correction proposals: 3 (none auto-applied).

## Images

- `original-source-crop.png` — original source crop.
- `wall-evidence.png` — structural wall mask.
- `door-evidence.png` and `glazing-evidence.png` — opening evidence.
- `vector-raster-evidence.png` — vector/raster overlay.
- `candidate-edge-overlay.png` — candidate with numbered edges.
- `candidate-segmentation.png` — segmented/snapped contour.

## Edge Findings

| Edge | Class | Evidence | Prior objection |
|---|---|---|---|
| M102-E01 | DOOR_OR_GLAZING | P08212 · P03-门扇 · 0.0 pt | — |
| M102-E02 | CANDIDATE_WALL | P08754 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M102-E03 | DOOR_OR_GLAZING | P08172 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E04 | WALL_ALIGNED_CANDIDATE | P16150 · A05-建筑原有墙体 · 0.0 pt | — |
| M102-E05 | DOOR_OR_GLAZING | P30610 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E06 | DOOR_OR_GLAZING | P30610 · P03-门扇 · 0.123 pt | — |
| M102-E07 | DOOR_OR_GLAZING | P30610 · P03-门扇 · 4.224 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E08 | UNSUPPORTED | P30611 · P03-门扇 · 0.02 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E09 | DOOR_OR_GLAZING | P30609 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E10 | DOOR_OR_GLAZING | P30609 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M102-E11 | WALL_ALIGNED_CANDIDATE | P16151 · A05-建筑原有墙体 · 0.0 pt | — |
| M102-E12 | WALL_ALIGNED_CANDIDATE | P09215 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M102-E13 | WALL_ALIGNED_CANDIDATE | P09215 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M102-E14 | WALL_ALIGNED_CANDIDATE | P30608 · A07-新建隔墙 · 0.0 pt | — |
| M102-E15 | WALL_ALIGNED_CANDIDATE | P09302 · A05-建筑原有墙体 · 0.0 pt | — |

## Correction Proposals

- **M102-SNAP-E12**: edge M102-E12 → ['P09215'] / `A04-建筑剪力墙柱填充`; max shift 0.99 pt, area delta -0.181 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **M102-SNAP-E14**: edge M102-E14 → ['P30608'] / `A07-新建隔墙`; max shift 0.54 pt, area delta +0.200 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **M102-SNAP-E15**: edge M102-E15 → ['P09302'] / `A05-建筑原有墙体`; max shift 0.505 pt, area delta +0.249 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
