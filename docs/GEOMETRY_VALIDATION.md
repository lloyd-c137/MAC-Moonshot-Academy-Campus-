# FF-01 Geometry Validation

Generated from `data/source/spatial-extraction-summary.json`; V3 pilot metrics regenerated 2026-10-14. Run the extractor, `npm run recover:ff01-hybrid`, then `npm run validate:spatial` to validate extraction, layer association, label inventory, pilot candidate accounting, provenance and dimensional calculations.

## Verified measurements

| Check | Source | Reconstructed | Absolute error | Relative error | Status |
|---|---:|---:|---:|---:|---|
| X overall axis/dimension-chain span | 134,100 mm | 134,112 mm | 12 mm | 0.00895% | VERIFIED |
| Z overall axis/dimension-chain span | 115,800 mm | 115,798.6 mm | -1.4 mm | 0.00121% | VERIFIED |

Scale is uniform: `25.4 × 300 / 72 / 1000 = 0.105833333 m per PDF point`. The source frame is the dimension/axis chain, not the exterior wall boundary. No independent 8400 mm interval endpoint pairing has yet been certified.

## Coverage and semantic metrics

| Metric | Measured result | Status / interpretation |
|---|---:|---|
| Painted native vector paths retained | 33,355 / 33,355 | Accounted in pypdf and PyMuPDF extraction. |
| Distinct native CAD layers | 126 | Exact source layer-name inventory in `FF01_LAYER_MANIFEST.json`. |
| Native path to stable P-ID association | 33,355 / 33,355 | VERIFIED by path order and transformed bbox; max discrepancy 0.0002 pt. This is provenance association only. |
| Important layer counts | 2,014 A05 / 336 A07 / 893 A04 / 1,054 P03 / 244 A11 / 574 arena seats / 9,547 furniture | Counts describe PDF drawing paths, not architectural objects. |
| Exact room-label IDs | 101 | Accounted in manifest. |
| Distinct base room codes | 98 | Source inventory. |
| Application IDs matching source base codes | 33 / 98 (33.67%) | ID coverage only; not geometry coverage. |
| Source room polygons verified | 0 / 98 (0%) | No path-to-room boundary assignments. |
| Major footprint IoU | Not measurable | No independently traced building footprint. |
| Key arena IoU | Not measurable | No independent source/reference semantic polygon. |
| Room polygon accuracy | Not measurable | Source room polygons have not been identified. |
| Layer-filtered wall candidate faces | 2,647 | Polygonizer output from candidate wall layers, not verified room spaces. |
| Pilot room candidates / independently verified | 6 / 6 candidates; 0 / 6 verified | Seeded polygons are mechanically valid and editable; source-area conflicts and edge objections remain. See the V3 report below. |
| Wall alignment error | Not measurable | Candidate paths were extracted from this same source; no independently reviewed wall reference exists. |
| Corridor coverage | Not measurable | Corridors not semantically traced. |
| Door coverage/connectivity | Not measurable | Door swings/openings not assigned to graph connections. |
| Topology consistency | Not measurable | No verified shared-space topology. |
| Navigation validity / wall crossings | Not measurable | Existing navigation graph is hand-authored and unverified. |

These results fail the spatial fidelity acceptance targets. Label inventory completeness is not room-geometry completeness. No IoU or error figure is fabricated from an overlay of a drawing against itself.

## Reproducibility checks

`npm run validate:spatial` verifies source hash, page orientation, path and label counts, all 126 layer entries, key native layer counts, 33,355 path joins, label accounting, pilot non-PASS status, and the two overall dimension checks. `npm run lint` and `npm run build` validate the app. Neither build check proves geometric accuracy.

## Browser checks (2026-10-13 local)

Actual Vite app at `http://127.0.0.1:3000/`, viewport 1536 × 864:

- Full FF-01 sheet loaded in Plan mode; camera fit shows the full page, including its title block.
- Left drag panned the source sheet; wheel input zoomed around the pointer. Captured in `output/playwright/source_plan_pan_zoom_1536x864.png`.
- Clicking near the M104 source label selected the M104 record; searching M104 also focused it and opened the detail panel. The selected record is a text-anchor selection, not a polygon selection. Screenshot: `output/playwright/source_plan_M104_selected_1536x864.png`.
- The 2.5D control is disabled while 2D geometry is unverified.
- Browser console: zero errors and zero warnings during the inspected session.

These checks validate source viewing and interaction wiring only. They are not evidence of room-boundary fidelity. No source-vs-reconstruction overlay/difference screenshot is available because no independent reconstructed geometry exists yet.

## CAD layer and editor checks (2026-10-13 local)

- PyMuPDF 1.24.14 returned 33,355 paths and 126 source layer names. Transforming raw PyMuPDF points with `page.rotation_matrix` yielded a full 33,355/33,355 association to the prior P-ID extraction; max bbox error is 0.0002 pt.
- Layer-isolated vectors for walls, doors, stairs and seating are generated from native path items. The dev review route loaded the original plan and 2,014 existing-wall vectors in a real browser at `/dev/geometry-review`. Screenshot: `output/playwright/geometry-review-editor_1536x864.png`.
- Source and candidate preview files exist under `data/source/pilots/` and are served from `public/`: source crop, structural crop, polygon layer, overlay and Not-Measurable difference panel for each pilot.
- Pilot A (M102/M103/M104): 5 qualifying faces intersect crop; 0/3 room-label points contained. Pilot B (S208/S209/S210): 5 qualifying faces intersect crop; 0/3 points contained. Door leaves were deliberately excluded from gap-closing. No room polygon was labeled verified.
- Quantitative room IoU, dimension errors for individual rooms, wall alignment, corridor coverage and door connectivity are all Not Measurable. The full-plan 2,647 polygonized faces are candidate topology and must not be read as 2,647 rooms.
- The editor API returned all 126 layer records and 2,014 existing-wall paths. Browser interaction created a temporary CANDIDATE polygon with a selected source path, saved revision 1, reloaded the page and confirmed the same ID/revision. The test object and its history file were removed after verification. Wheel zoom and pointer pan changed the SVG viewBox; the latest browser console check reported 0 errors and 0 warnings.

## V3 hybrid pilot result (2026-10-14)

The earlier 0/6 polygonizer result is the baseline failure, not the current candidate count. Room-seeded hybrid raster/vector recovery now emits six valid, seed-containing candidate rings with simplified contours and per-edge evidence. Current candidate areas: M102 72.81 m² (44.4% from 131.0 m² nearby annotation), M103 177.67 m² (9.5% from 196.3), M104 98.88 m² (58.0% from 62.6), S208 21.18 m² (27.5% from 29.2), S209 19.60 m² (2.0% from 20.0), S210 48.16 m² (5.4% from 50.9). The annotation check is a diagnostic only. All six remain HUMAN_REVIEW_REQUIRED; independent IoU and final verification are NOT MEASURABLE. `npm run validate:spatial` checks six polygon rings, seed containment, source P-ID provenance, per-edge review status, barrier semantics, source crops and masks.

Browser tests in Chrome at 1536×864 focused M102, inserted a vertex on a candidate edge, undid that edit, saved/reloaded a HUMAN_REVIEW_REQUIRED revision, then expanded edge evidence and selected Door path P08212. A later explicit replacement synchronized the local M102 draft with the simplified 16-vertex candidate and saved/reloaded revision 5; the current `data/geometry-review/overrides.json` is still HUMAN_REVIEW_REQUIRED. Page errors: 0. Screenshots: `output/playwright/geometry-review-v3_1536x864.png`, `geometry-review-v3_edge-evidence_1536x864.png`, and `geometry-review-v3_M102_1536x864.png`. These tests validate review tooling and persistence, not the true accuracy of room polygons.
