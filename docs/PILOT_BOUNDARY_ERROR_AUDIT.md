# Pilot Boundary Error Audit (V4)

## Evidence limits

FF-01 registration remains the V3 normalized display frame (270° rotation, 2384 × 1684 pt). The six seeds remain inside their candidate polygons. This supports coordinate consistency for the seed-to-candidate relation, but is not proof that every vector, raster mask, and label is registered without local error. Each package shows the source crop and numbered edges in the same PDF display-point frame.

Edge classifications are machine-derived evidence classes only. `WALL_ALIGNED_CANDIDATE` means a nearby native structural vector has compatible direction and longitudinal coverage; it does not establish which wall face bounds the room. Door/glazing evidence is explicitly not a physical wall. Unsupported boundaries remain visible.

The original V3 failure was not simply “polygonize found no faces”: the room-seeded flood-fill selected one connected free-space component after virtual morphological closure, then traced its raster contour and snapped some vertices. Openings and unaligned segments therefore become room-boundary risks. The V3 `unresolvedEdges` stored only objections, not every ring edge. V4 now enumerates all edges and attaches nearest vector/layer evidence. The area annotation remains a diagnostic because its measurement convention and exact text-to-space mapping have not been independently checked.

## Candidate measurements

| Room | Candidate m² | Label annotation m² | Deviation | Edges | Wall-aligned candidates | Door/glazing candidates | Unsupported | Proposals | Independent IoU |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| M102 | 72.81 | 131.00 | -44.4% | 15 | 6 | 7 | 1 | 3 | NOT MEASURABLE |
| M103 | 177.67 | 196.30 | -9.5% | 24 | 14 | 4 | 0 | 2 | NOT MEASURABLE |
| M104 | 98.88 | 62.60 | +58.0% | 16 | 8 | 3 | 0 | 0 | NOT MEASURABLE |
| S208 | 21.18 | 29.20 | -27.5% | 20 | 13 | 3 | 0 | 3 | NOT MEASURABLE |
| S209 | 19.60 | 20.00 | -2.0% | 20 | 13 | 3 | 0 | 3 | NOT MEASURABLE |
| S210 | 48.16 | 50.90 | -5.4% | 36 | 23 | 7 | 1 | 3 | NOT MEASURABLE |

## P0 diagnosis

### M102

- Candidate is valid and contains the source label seed; measured candidate/annotated area deviation is -44.4%. That difference is a diagnostic, not a correction target.
- The current polygon was selected from one flood-filled component after virtual gap closing. Six listed objections map to Door-layer paths (`P08172`, `P30609`, `P30610`, `P30611`); these are door-leaf evidence, not verified room closure. This directly establishes that multiple candidate edges rely on opening/virtual-closure evidence. It does not prove those edges cause the entire area deficit.
- Edge evidence classes: 6 wall-aligned candidates, 1 weak wall candidates, 7 opening evidence edges, 1 unsupported edges.
- Source P-IDs near candidate edges: P08172, P08212, P08754, P09215, P09302, P16150, P16151, P30608, P30609, P30610, P30611.
- Unsupported edge IDs: M102-E08.
- V3 recorded objections: M102-E03 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P08172); M102-E05 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P30610); M102-E07 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P30610); M102-E08 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P30611); M102-E09 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P30609); M102-E10 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P30609).
- Conservative vector-snap proposals: 3; each is under 2.5 pt max shift. They are un-applied alternatives and may snap to the wrong face of a double-line wall.
- No independent reference polygon exists; IoU is NOT MEASURABLE. No room has been verified.

### M104

- Candidate is valid and contains the source label seed; measured candidate/annotated area deviation is +58.0%. That difference is a diagnostic, not a correction target.
- The numbered source overlay shows a broad candidate region around the M104 seed. Five prior objections include two edges not aligned within 2.5 pt (`M104-E08` / `P14876`, `M104-E16` / `P03610`) and three door-leaf candidates (`M104-E10`–`E12`, `P08190` / `P17103`). These provide concrete boundary ambiguities; the available evidence does not establish whether the excess area is a merged neighboring region, an annotation-area convention difference, or both. No safe structural snap under 2.5 pt exists for the flagged edges, so V4 emits no M104 geometry correction rather than inventing a split.
- Edge evidence classes: 8 wall-aligned candidates, 5 weak wall candidates, 3 opening evidence edges, 0 unsupported edges.
- Source P-IDs near candidate edges: P03608, P03610, P03614, P08189, P08190, P14380, P14876, P14879, P15466, P16154, P16155, P17103.
- Unsupported edge IDs: none.
- V3 recorded objections: M104-E08 Raster closure edge is not aligned to a compatible native vector within 2.5 pt. (P-ID P14876); M104-E10 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P08190); M104-E11 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P08190); M104-E12 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P17103); M104-E16 Raster closure edge is not aligned to a compatible native vector within 2.5 pt. (P-ID P03610).
- Conservative vector-snap proposals: 0; each is under 2.5 pt max shift. They are un-applied alternatives and may snap to the wrong face of a double-line wall.
- No independent reference polygon exists; IoU is NOT MEASURABLE. No room has been verified.

### S208

- Candidate is valid and contains the source label seed; measured candidate/annotated area deviation is -27.5%. That difference is a diagnostic, not a correction target.
- The candidate retains non-axis-aligned edges. Three prior objections are one glazing boundary (`S208-E08` / `P12685`) and two door candidates (`S208-E16` / `P03212`, `S208-E18` / `P03215`); four additional edges have only weak wall matches. This proves the angled contour is present in the candidate and identifies its opening ambiguity, but does not prove the contour is the full S208 enclosure or explain the area deficit.
- Edge evidence classes: 13 wall-aligned candidates, 4 weak wall candidates, 3 opening evidence edges, 0 unsupported edges.
- Source P-IDs near candidate edges: P03168, P03208, P03210, P03212, P03214, P03215, P03887, P08870, P08890, P08893, P08895, P08897, P12685, P14820.
- Unsupported edge IDs: none.
- V3 recorded objections: S208-E08 Boundary coincides with Window / Glazing candidate; segmentation closure is virtual, not a physical wall. (P-ID P12685); S208-E16 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P03212); S208-E18 Boundary coincides with Door candidate; segmentation closure is virtual, not a physical wall. (P-ID P03215).
- Conservative vector-snap proposals: 3; each is under 2.5 pt max shift. They are un-applied alternatives and may snap to the wrong face of a double-line wall.
- No independent reference polygon exists; IoU is NOT MEASURABLE. No room has been verified.

## Room-by-room edge evidence

Full records are in `data/source/pilots/v4/review-packages/<ROOM>/review-package.json`; numbered overlays and source crops are adjacent. Every edge status is `HUMAN_REVIEW_REQUIRED` / `NOT_REVIEWED`.

- [M102 review package](../data/source/pilots/v4/review-packages/M102/README.md) · 15 complete edges · 3 proposals
- [M103 review package](../data/source/pilots/v4/review-packages/M103/README.md) · 24 complete edges · 2 proposals
- [M104 review package](../data/source/pilots/v4/review-packages/M104/README.md) · 16 complete edges · 0 proposals
- [S208 review package](../data/source/pilots/v4/review-packages/S208/README.md) · 20 complete edges · 3 proposals
- [S209 review package](../data/source/pilots/v4/review-packages/S209/README.md) · 20 complete edges · 3 proposals
- [S210 review package](../data/source/pilots/v4/review-packages/S210/README.md) · 36 complete edges · 3 proposals
