# M104 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 98.88 m²; nearby annotation: 62.60 m²; deviation: +58.0%.
- Polygon valid: True; seed inside: True; independent IoU: NOT MEASURABLE.
- Boundary edges: 16; source-aligned wall candidates: 8; openings: 3; unsupported: 0.
- Evidence-based correction proposals: 0 (none auto-applied).

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
| M104-E01 | WALL_ALIGNED_CANDIDATE | P14380 · A05-建筑原有墙体 · 0.138 pt | — |
| M104-E02 | WALL_ALIGNED_CANDIDATE | P03608 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M104-E03 | CANDIDATE_WALL | P03608 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M104-E04 | WALL_ALIGNED_CANDIDATE | P16154 · A07-新建隔墙 · 0.0 pt | — |
| M104-E05 | WALL_ALIGNED_CANDIDATE | P03614 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M104-E06 | WALL_ALIGNED_CANDIDATE | P16155 · A05-建筑原有墙体 · 5.352 pt | — |
| M104-E07 | WALL_ALIGNED_CANDIDATE | P14879 · A07-新建隔墙 · 0.005 pt | — |
| M104-E08 | CANDIDATE_WALL | P14876 · A07-新建隔墙 · 0.224 pt | Raster closure edge is not aligned to a compatible native vector within 2.5 pt. |
| M104-E09 | WALL_ALIGNED_CANDIDATE | P08189 · A07-新建隔墙 · 5.243 pt | — |
| M104-E10 | DOOR_OR_GLAZING | P08190 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M104-E11 | DOOR_OR_GLAZING | P08190 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M104-E12 | DOOR_OR_GLAZING | P17103 · P03-门扇 · 5.64 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M104-E13 | CANDIDATE_WALL | P15466 · A07-新建隔墙 · 0.0 pt | — |
| M104-E14 | CANDIDATE_WALL | P15466 · A07-新建隔墙 · 0.0 pt | — |
| M104-E15 | WALL_ALIGNED_CANDIDATE | P15466 · A07-新建隔墙 · 0.0 pt | — |
| M104-E16 | CANDIDATE_WALL | P03610 · A04-建筑剪力墙柱填充 · 0.0 pt | Raster closure edge is not aligned to a compatible native vector within 2.5 pt. |

## Correction Proposals

No source-supported correction within the conservative 2.5 pt / 8° snapping gate. This is not evidence that current edges are correct.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
