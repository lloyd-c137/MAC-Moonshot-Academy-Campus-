# FF-01 Spatial Fidelity Audit

Audit date: 2026-10-14. Status: **PARTIAL; source-layer association verified, six room-seeded candidates generated, no room boundary independently verified**.

## Source and reproducible evidence

- Source: `/Users/mac/Downloads/01_探月26年平面系统图（根据最新导视图更新）20260806-.pdf`, one A1 page, FF-01, scale 1:300, page `/Rotate=270`.
- SHA-256: `28217dcb951ea45b34d2651851f36bcd0af5824d27b5d588b60cdf3672ce3d60`.
- Extractor: [`scripts/extract_ff01.py`](../scripts/extract_ff01.py), using pypdf native content operators, pdfplumber text/vector primitives and PyMuPDF `page.get_drawings()`. The page is rotation-normalized into a top-left 2384 × 1684 pt display frame.
- Extracted 188,522 content operators, 33,355 painted paths, 10 nonpainting clip paths, 983 text words and 126 native CAD layers. The PDF has no Form/Image XObject `Do` operations.
- PyMuPDF's raw drawing frame is mapped through the page rotation matrix and joined 1:1 to stable pypdf Path IDs. All 33,355 join; maximum bbox error is 0.0002 pt. Layer names provide candidate categories, not verified space semantics.
- The cache retains both original P paths and native F paths, with exact layer, style, transformed bounds and geometry provenance. `UNRESOLVED_GEOMETRY.csv` accounts for every source path and explicitly calls layer-only assignments `CANDIDATE_NOT_VERIFIED`.
- The complete original sheet is rendered as `public/ff01-source-plan.png`; `public/ff01-source-plan.svg` preserves the extracted paths in source page coordinates. Both include the full drawing sheet. The display is a source reference, not reconstructed geometry.

## Existing implementation findings

| Area | Code evidence | Finding |
|---|---|---|
| Room records | `src/data/floorplanData.ts`, 42 total records | 33 base IDs match source labels; all existing polygons are now explicitly `geometryProvenance='illustrative'` and `isVerifiedInPlan=false`. Other records include synthetic/non-label objects. |
| Room polygons | `floorplanData.ts` rectangle helpers and hand-authored `polygon` arrays | Boundaries are not traced from PDF paths. Their area and placement cannot be treated as measured geometry. |
| Walls/doors | `src/components/canvas/architecturalModel.ts` `createWallSegment` and per-room polygon loop | Walls are generated from illustrative room edges; door gaps use a hand-authored `doorPoint` and fixed width. Shared walls can duplicate. |
| Arena | `architecturalModel.ts` custom arena meshes | The previous model was schematic and did not provide a traced complete ring/court/stands model. It is hidden from source-plan mode pending verified 2D geometry. |
| Navigation | `src/services/navigation.ts` | Hand-authored graph, not proven against source walls, door openings, or walkable regions. Route rendering is hidden in source-plan mode. |
| Camera/coordinates | `src/data/spatialPlan.ts`, `src/components/canvas/cameraController.ts` | A deterministic isotropic 1:300 mapping is now used for source page and source-label anchors. Pan/zoom work on a strict top-down source sheet; 2.5D is disabled pending G3. |
| Extraction | no prior native PDF semantic extraction pipeline | Added the reproducible path/text extractor and explicit unresolved accounting. |

## Source room-label accounting

- 101 distinct exact labels/IDs were extracted, representing 98 base room codes. The three suffixed labels `M100-1`, `M100-2`, and `M106-1` remain distinct source labels.
- 33 current application IDs match source base codes. 65 source base codes do not have an application room record; the suffix labels also have no exact application record. No missing labels were removed from the manifest.
- A label position is a verified source-text anchor only. It does not identify room centroid, boundary, area, wall, or door.

## Coordinate audit

The two long overall dimension-chain spans in the PDF display frame are 1267.20 pt and 1094.16 pt. At 1:300, the scale is 0.105833333 m/pt. They reconstruct to 134.1120 m vs 134.1000 m (12.0 mm, 0.00895%) and 115.7986 m vs 115.8000 m (-1.4 mm, 0.00121%). These verify the axis/dimension-chain spans and the global scale. They do **not** assert that either span is the outside-wall footprint.

## CAD layer recovery and pilot

The full 126-layer inventory is in [`CAD_LAYER_ANALYSIS.md`](CAD_LAYER_ANALYSIS.md) and `data/source/FF01_LAYER_MANIFEST.json`. Confirmed source counts include A05 existing walls 2,014, A07 new partitions 336, A04 structural fills 893, P03 door leaves 1,054, A11 stairs 244, arena seating 574 and experimental furniture 9,547. These are drawing-path counts, not architectural object counts.

The initial wall-only polygonizer produced 2,647 global faces and **0/6 seeded room candidates**. V3 records the failure by room and adds native-vector plus 300 DPI raster evidence, room-seeded connected-component segmentation, limited virtual barriers, and vector-supported contour edges. It now produces **6/6 mechanically valid editable candidates**. Candidate areas are 72.81, 177.67, 98.88, 21.18, 19.60, and 48.16 m² for M102/M103/M104/S208/S209/S210. Source area annotations identify large discrepancies for M102 (44.4%), M104 (58.0%) and S208 (27.5%); these are review flags, not substitutes for boundary comparison. All six stay `HUMAN_REVIEW_REQUIRED`; independently verified polygons remain **0/6**, room IoU is Not Measurable, and no candidate enters production geometry or navigation. See `PILOT_FAILURE_ROOT_CAUSE.md`, `HYBRID_RECONSTRUCTION.md`, and `PILOT_GEOMETRY_VALIDATION.md`.

The local review editor is available at `/dev/geometry-review` in development. It displays the source and semantic-layer vectors, allows source-path selection, polygon drawing/vertex edits with source snapping, door and wall merge/split decisions, undo/redo, and persistent revisioned saves. The API is loopback-only. Manual correction persists, but no reviewer has yet approved pilot polygons.

## What is reusable

- Existing React/Three.js shell, search, details, availability/environment/event UI and stable space IDs.
- Existing orthographic camera controller for pan/zoom and source-label focus.
- The extracted text anchors for known application IDs.
- Existing business records as mock/product data, kept separate from source geometry.

## Gates

| Gate | Status | Evidence |
|---|---|---|
| G0 Source audit | VERIFIED | Source hash, page rotation, native path/text counts, 126 CAD layers and 1:1 path-to-layer join. |
| G1 Inventory | VERIFIED for labels only | 101 exact labels / 98 base codes accounted for; room boundaries unresolved. |
| G2 Coordinate calibration | VERIFIED for global axis/dimension spans | Two independent labeled overall spans under 0.01% relative error; not an exterior footprint check. |
| G3 2D geometry fidelity | FAILED / candidate recovery implemented | Six seeded polygons are available for review; source-area conflicts and unresolved edges remain, and no room polygon has independent verification. |
| G4 Spatial topology | BLOCKED | No verified door/corridor connections; indoor routing is paused instead of presenting unverified edges. |
| G5 3D reconstruction | BLOCKED | 2.5D illustrative geometry is withheld from source-plan mode until G3 passes. |
| G6 Camera and interaction | PARTIAL | Strict top-down pan/zoom, source-label selection and focus implemented; no map-polygon selection or 2.5D mode. |
| G7 Product regression | PARTIAL | Existing business UI retained; spatial overlays/routes cannot be certified. |
| G8 Browser validation | PARTIAL | At 1536×864, the dev editor loaded candidates, focused M102, inserted a candidate-edge vertex, undid the edit, saved a HUMAN_REVIEW_REQUIRED revision, reloaded it, and focused an unresolved Door P-ID. Browser page errors: 0. Evidence: `output/playwright/geometry-review-v3_1536x864.png` and `geometry-review-v3_edge-evidence_1536x864.png`. No room-boundary human acceptance or 2.5D acceptance. |

The source map now shows the complete original sheet in its page frame and calibrated scale. It is not a claim that MAC has reconstructed the building. See [`GEOMETRY_VALIDATION.md`](GEOMETRY_VALIDATION.md), [`UNRESOLVED_GEOMETRY.md`](UNRESOLVED_GEOMETRY.md), and [`RECONSTRUCTION_PIPELINE.md`](RECONSTRUCTION_PIPELINE.md).
