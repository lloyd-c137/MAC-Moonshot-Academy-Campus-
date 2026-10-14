# M103 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 177.67 m²; nearby annotation: 196.30 m²; deviation: -9.5%.
- Polygon valid: True; seed inside: True; independent IoU: NOT MEASURABLE.
- Boundary edges: 24; source-aligned wall candidates: 14; openings: 4; unsupported: 0.
- Evidence-based correction proposals: 2 (none auto-applied).

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
| M103-E01 | CANDIDATE_WALL | P08748 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E02 | WALL_ALIGNED_CANDIDATE | P08748 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E03 | WALL_ALIGNED_CANDIDATE | P08748 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E04 | WALL_ALIGNED_CANDIDATE | P08748 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E05 | WALL_ALIGNED_CANDIDATE | P04659 · A05-建筑原有墙体 · 0.0 pt | — |
| M103-E06 | WALL_ALIGNED_CANDIDATE | P08756 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E07 | WALL_ALIGNED_CANDIDATE | P08756 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E08 | WALL_ALIGNED_CANDIDATE | P08756 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E09 | CANDIDATE_WALL | P14391 · A05-建筑原有墙体 · 0.0 pt | — |
| M103-E10 | WALL_ALIGNED_CANDIDATE | P17042 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E11 | WALL_ALIGNED_CANDIDATE | P17042 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E12 | CANDIDATE_WALL | P17042 · A04-建筑剪力墙柱填充 · 1.06 pt | — |
| M103-E13 | DOOR_OR_GLAZING | P17112 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M103-E14 | WALL_ALIGNED_CANDIDATE | P16150 · A05-建筑原有墙体 · 0.0 pt | — |
| M103-E15 | DOOR_OR_GLAZING | P08171 · P03-门扇 · 0.515 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M103-E16 | WALL_ALIGNED_CANDIDATE | P08754 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| M103-E17 | DOOR_OR_GLAZING | P08225 · P03-门扇 · 0.0 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| M103-E18 | CANDIDATE_WALL | P09302 · A05-建筑原有墙体 · 0.0 pt | Raster closure edge is not aligned to a compatible native vector within 2.5 pt. |
| M103-E19 | WALL_ALIGNED_CANDIDATE | P09302 · A05-建筑原有墙体 · 0.0 pt | — |
| M103-E20 | WALL_ALIGNED_CANDIDATE | P09302 · A05-建筑原有墙体 · 0.0 pt | — |
| M103-E21 | DOOR_OR_GLAZING | P17076 · P03-门扇 · 1.347 pt | Raster closure edge is not aligned to a compatible native vector within 2.5 pt. |
| M103-E22 | CANDIDATE_WALL | P00003 · A04-建筑剪力墙柱填充 · 1.216 pt | — |
| M103-E23 | WALL_ALIGNED_CANDIDATE | P09304 · A05-建筑原有墙体 · 3.278 pt | — |
| M103-E24 | CANDIDATE_WALL | P08744 · A04-建筑剪力墙柱填充 · 0.0 pt | — |

## Correction Proposals

- **M103-SNAP-E05**: edge M103-E05 → ['P04659'] / `A05-建筑原有墙体`; max shift 0.96 pt, area delta +0.385 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **M103-SNAP-E08**: edge M103-E08 → ['P08756'] / `A04-建筑剪力墙柱填充`; max shift 1.276 pt, area delta -0.320 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
