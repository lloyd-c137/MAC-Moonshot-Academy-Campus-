# S209 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 19.60 m²; nearby annotation: 20.00 m²; deviation: -2.0%.
- Polygon valid: True; seed inside: True; independent IoU: NOT MEASURABLE.
- Boundary edges: 20; source-aligned wall candidates: 13; openings: 3; unsupported: 0.
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
| S209-E01 | WALL_ALIGNED_CANDIDATE | P14424 · A05-建筑原有墙体 · 0.001 pt | — |
| S209-E02 | CANDIDATE_WALL | P08909 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E03 | WALL_ALIGNED_CANDIDATE | P08906 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S209-E04 | WALL_ALIGNED_CANDIDATE | P08908 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S209-E05 | WALL_ALIGNED_CANDIDATE | P14420 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E06 | WALL_ALIGNED_CANDIDATE | P14420 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E07 | DOOR_OR_GLAZING | P14426 · P03-门扇 · 7.272 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| S209-E08 | DOOR_OR_GLAZING | P14426 · P03-门扇 · 1.089 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| S209-E09 | DOOR_OR_GLAZING | P14426 · P03-门扇 · 0.154 pt | — |
| S209-E10 | CANDIDATE_WALL | P14419 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E11 | WALL_ALIGNED_CANDIDATE | P14419 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E12 | CANDIDATE_WALL | P08898 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S209-E13 | CANDIDATE_WALL | P08898 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S209-E14 | WALL_ALIGNED_CANDIDATE | P14422 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E15 | WALL_ALIGNED_CANDIDATE | P14422 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E16 | WALL_ALIGNED_CANDIDATE | P08913 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E17 | WALL_ALIGNED_CANDIDATE | P08911 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S209-E18 | WALL_ALIGNED_CANDIDATE | P08913 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E19 | WALL_ALIGNED_CANDIDATE | P14422 · A05-建筑原有墙体 · 0.0 pt | — |
| S209-E20 | WALL_ALIGNED_CANDIDATE | P14424 · A05-建筑原有墙体 · 0.0 pt | — |

## Correction Proposals

- **S209-SNAP-E01**: edge S209-E01 → ['P14424'] / `A05-建筑原有墙体`; max shift 0.616 pt, area delta +0.038 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S209-SNAP-E05**: edge S209-E05 → ['P14420'] / `A05-建筑原有墙体`; max shift 0.778 pt, area delta +0.133 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S209-SNAP-E06**: edge S209-E06 → ['P14420'] / `A05-建筑原有墙体`; max shift 0.287 pt, area delta +0.001 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
