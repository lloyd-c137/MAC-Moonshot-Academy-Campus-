# S210 Boundary Review Package

Status: **REVIEW_READY** (not verified)

- Candidate area: 48.16 m²; nearby annotation: 50.90 m²; deviation: -5.4%.
- Polygon valid: True; seed inside: True; independent IoU: NOT MEASURABLE.
- Boundary edges: 36; source-aligned wall candidates: 23; openings: 7; unsupported: 1.
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
| S210-E01 | WALL_ALIGNED_CANDIDATE | P12644 · T-CC-L1$0$wall · 0.001 pt | — |
| S210-E02 | DOOR_OR_GLAZING | P06865 · P03-门扇 · 8.946 pt | — |
| S210-E03 | WALL_ALIGNED_CANDIDATE | P08904 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E04 | WALL_ALIGNED_CANDIDATE | P08904 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E05 | DOOR_OR_GLAZING | P06865 · P03-门扇 · 0.487 pt | — |
| S210-E06 | DOOR_OR_GLAZING | P06865 · P03-门扇 · 0.0 pt | — |
| S210-E07 | DOOR_OR_GLAZING | P06865 · P03-门扇 · 0.0 pt | — |
| S210-E08 | DOOR_OR_GLAZING | P06866 · P03-门扇 · 3.729 pt | — |
| S210-E09 | UNSUPPORTED | P06867 · P03-门扇 · 0.714 pt | — |
| S210-E10 | DOOR_OR_GLAZING | P06869 · P03-门扇 · 0.0 pt | — |
| S210-E11 | WALL_ALIGNED_CANDIDATE | P12643 · T-CC-L1$0$wall · 0.0 pt | — |
| S210-E12 | CANDIDATE_WALL | P08925 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E13 | WALL_ALIGNED_CANDIDATE | P08922 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E14 | WALL_ALIGNED_CANDIDATE | P08922 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E15 | WALL_ALIGNED_CANDIDATE | P08924 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E16 | WALL_ALIGNED_CANDIDATE | P12646 · T-CC-L1$0$wall · 0.831 pt | — |
| S210-E17 | WALL_ALIGNED_CANDIDATE | P08916 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E18 | CANDIDATE_WALL | P08916 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E19 | WALL_ALIGNED_CANDIDATE | P08226 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E20 | WALL_ALIGNED_CANDIDATE | P08914 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E21 | WALL_ALIGNED_CANDIDATE | P08914 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E22 | WALL_ALIGNED_CANDIDATE | P14434 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E23 | WALL_ALIGNED_CANDIDATE | P08929 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E24 | WALL_ALIGNED_CANDIDATE | P08927 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E25 | WALL_ALIGNED_CANDIDATE | P08927 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E26 | WALL_ALIGNED_CANDIDATE | P08929 · A05-建筑原有墙体 · 5.735 pt | — |
| S210-E27 | WALL_ALIGNED_CANDIDATE | P14439 · A05-建筑原有墙体 · 1.823 pt | — |
| S210-E28 | CANDIDATE_WALL | P08902 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E29 | WALL_ALIGNED_CANDIDATE | P08902 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E30 | WALL_ALIGNED_CANDIDATE | P08902 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E31 | WALL_ALIGNED_CANDIDATE | P14440 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E32 | CANDIDATE_WALL | P08898 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E33 | CANDIDATE_WALL | P08898 · A04-建筑剪力墙柱填充 · 0.0 pt | — |
| S210-E34 | WALL_ALIGNED_CANDIDATE | P14418 · A05-建筑原有墙体 · 0.0 pt | — |
| S210-E35 | DOOR_OR_GLAZING | P14425 · P03-门扇 · 7.004 pt | — |
| S210-E36 | WALL_ALIGNED_CANDIDATE | P08901 · A05-建筑原有墙体 · 0.0 pt | — |

## Correction Proposals

- **S210-SNAP-E01**: edge S210-E01 → ['P12644'] / `T-CC-L1$0$wall`; max shift 1.234 pt, area delta +0.327 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S210-SNAP-E19**: edge S210-E19 → ['P08226'] / `A05-建筑原有墙体`; max shift 0.523 pt, area delta +0.073 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.
- **S210-SNAP-E21**: edge S210-E21 → ['P08914'] / `A04-建筑剪力墙柱填充`; max shift 0.223 pt, area delta +0.005 m². Candidate only; vector may be a parallel wall face, not the room-side boundary. Reviewer must inspect overlay.

## Review Checklist

- [ ] Compare each numbered edge with the source crop and CAD evidence.
- [ ] Confirm whether candidate wall evidence is the correct room-side boundary.
- [ ] Confirm door/glazing gaps remain openings and are not physical walls.
- [ ] Review unsupported edges and candidate shared boundaries.
- [ ] Record reviewer identity, evidence, decision, and outstanding issues in the editor.
- [ ] Keep room status unverified until independent review is complete.
