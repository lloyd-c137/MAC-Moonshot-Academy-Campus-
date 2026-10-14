# S208 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 21.18 m²; nearby annotation: 29.20 m²; deviation: -27.5%.
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
| S208-E01 | CANDIDATE_WALL | P08893 · A05-建筑原有墙体 · 0.0 pt | — |
| S208-E02 | CANDIDATE_WALL | P08890 · A04-建筑剪力墙柱填充 · 1.426 pt | — |
| S208-E03 | WALL_ALIGNED_CANDIDATE | P03168 · T-CC-L1$0$wall · 0.0 pt | — |
| S208-E04 | WALL_ALIGNED_CANDIDATE | P08895 · A04-建筑剪力墙柱填充 · 3.453 pt | — |
| S208-E05 | WALL_ALIGNED_CANDIDATE | P08897 · A05-建筑原有墙体 · 0.0 pt | — |
| S208-E06 | CANDIDATE_WALL | P14820 · A05-建筑原有墙体 · 0.0 pt | — |
| S208-E07 | WALL_ALIGNED_CANDIDATE | P14820 · A05-建筑原有墙体 · 0.0 pt | — |
| S208-E08 | DOOR_OR_GLAZING | P12685 · WINDOW · 0.13 pt | Boundary coincides with Window / Glazing candidate; segmentation closure is virtual, not a physical wall. |
| S208-E09 | WALL_ALIGNED_CANDIDATE | P03887 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S208-E10 | CANDIDATE_WALL | P08870 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S208-E11 | WALL_ALIGNED_CANDIDATE | P08870 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S208-E12 | WALL_ALIGNED_CANDIDATE | P08870 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S208-E13 | WALL_ALIGNED_CANDIDATE | P03887 · A04-建筑剪力墙柱填充 · 0.576 pt | — |
| S208-E14 | WALL_ALIGNED_CANDIDATE | P03208 · T-CC-L1$0$wall · 0.0 pt | — |
| S208-E15 | WALL_ALIGNED_CANDIDATE | P03214 · T-CC-L1$0$wall · 0.0 pt | — |
| S208-E16 | DOOR_OR_GLAZING | P03212 · P03-门扇 · 6.88 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| S208-E17 | DOOR_OR_GLAZING | P03212 · P03-门扇 · 0.82 pt | — |
| S208-E18 | WALL_ALIGNED_CANDIDATE | P03215 · T-CC-L1$0$wall · 2.28 pt | Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. |
| S208-E19 | WALL_ALIGNED_CANDIDATE | P03210 · T-CC-L1$0$wall · 0.0 pt | — |
| S208-E20 | WALL_ALIGNED_CANDIDATE | P03215 · T-CC-L1$0$wall · 0.0 pt | — |

## Correction Proposals

- **S208-SNAP-E09**: edge S208-E09 → ['P03887'] / `A04-建筑剪力墙柱填充`; max shift 0.576 pt, area delta +0.071 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S208-SNAP-E13**: edge S208-E13 → ['P03887'] / `A04-建筑剪力墙柱填充`; max shift 0.576 pt, area delta +0.101 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S208-SNAP-E20**: edge S208-E20 → ['P03215'] / `T-CC-L1$0$wall`; max shift 0.657 pt, area delta +0.088 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
