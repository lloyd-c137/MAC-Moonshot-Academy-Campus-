# FF-01 3D Campus Model

The main campus map (`/`) renders a 3D model generated directly from the FF-01 drawing. It replaces the earlier "source sheet only" map. The model is **source-derived and unverified**: every wall, room, seat and floor line traces back to FF-01 vectors or V9 candidates, but no geometry has been DRAWING_VERIFIED, and heights are illustrative.

![2.5D overview](evidence/campus-3d/campus-3d-overview-1536x864.png)

## What is modelled, and from where

| Element | Source | Method | Count |
|---|---|---|---|
| Walls | CAD layers `A05-建筑原有墙体`, `A07-新建隔墙`, `T-*$0$wall(-thin)`, columns; filled shear walls from V9 `wallFaceCandidates` | Line paths buffered 1.05 pt per side (merges double-line walls ≤ 0.22 m apart), unioned with filled faces, extruded 2.8 m. Door openings stay open where the CAD wall lines break. | 159 bodies from 3,722 source paths |
| Glazing | `T-CC+C1-0.00$0$GLAZ`, `玻璃隔断`, `WINDOW`, `P04-窗户` | Buffered 0.45 pt, minus walls, rendered as glass | 182 bodies |
| Rooms | V9 room candidates (unchanged) | Floor tiles, one pickable mesh per room | 93 polygons |
| Room labels and names | Room-ID text blocks in the PDF (PyMuPDF, rotation-normalised) | Name = the CJK line in the same label block; area = the m² line | 101 labels, 98 names from label blocks |
| Lotus Arena | V9 court-boundary and seat-footprint candidates | Court surface; each seat extruded by row (row = distance from the court edge ÷ 7.6 pt) | 572 seats, 8 rows |
| Floor detail | Furniture, equipment, door leaves and swings, stairs, court markings | Flat lines at floor level | ~65k segments |
| Slab / footprint | Wall ∪ glazing union | Morphological closing (28 pt), largest exterior ring | 15,616 m² (1.006 × the 134.1 × 115.8 m dimension-chain rectangle) |

The coordinate frame is metres, origin at the FF-01 grid centre, x east, z south, 1 pt = 0.10583 m (the existing V6 1:300 calibration). It coincides with `planToWorld()`, so existing space centres, search focus and the camera controller work unchanged.

## Verification evidence

The source drawing can be overlaid on the model (图纸对照 → 叠加 FF-01 原始图纸). Walls, seats, court lines and door swings coincide with the PDF raster:

![FF-01 overlay on the model](evidence/campus-3d/campus-3d-source-overlay-1536x864.png)

![2D plan mode](evidence/campus-3d/campus-3d-plan-1536x864.png)

![Arena detail](evidence/campus-3d/campus-3d-arena-detail-1536x864.png)

![Room selection](evidence/campus-3d/campus-3d-selected-1536x864.png)

`npm run validate:campus-3d` checks:
- the PDF hash,
- room inventory parity with V9 (101 labels, the same 93 polygons),
- polygon validity,
- label-in-room containment,
- footprint span and area against the printed dimension chains,
- walls and rooms inside the footprint,
- the seat count,
- line-layer decoding,
- `src/data/sourceRooms.ts` parity.

## Known limits

- **Heights**: 2.8 m walls (same as V9 `illustrative3D.wallHeightM`); seat rise 0.38 m per row. There is no section drawing.
- **Room boundaries**: V9 candidates, all UNVERIFIED. The M104 / M-West corridor overlap (14.2 m²) is unchanged. A100, A101, A102, A106, A114, A115, M100 and S407 have labels only (no floor tile), so they are selectable through search but not by clicking.
- **Names**: S208 (灯光室) and S310 (莲花球场扩音间) are hand readings of glyphs stacked one per text line on FF-01. A209's name is a low-confidence nearby-text match. M106-1 and S102 have no name text on the sheet.
- **Footprint**: derived, not traced. Entrance recesses narrower than ~5.9 m are bridged.
- **Arena**: no ring-corridor polygon and no access openings. Stand height is illustrative.
- **Navigation**: still disabled. The wall model shows openings but does not establish passability.
- **Rooms without product content**: rooms not described in `floorplanData.ts` get a drawing-only entry (name and area). They show no sensor, occupancy or event data, and none is invented.

## Rebuild

```sh
python3 -m pip install -r scripts/requirements-spatial.txt
npm run rebuild:campus-3d -- --pdf "/path/to/01_探月26年平面系统图（根据最新导视图更新）20260806-.pdf"
npm run validate:campus-3d
```

Without `--pdf`, the builder uses the path recorded in `data/source/spatial-extraction-summary.json`. It refuses to run if the PDF hash differs. Outputs:
- `src/generated/ff01-campus-core.json`: walls, rooms, arena. About 50 KB over the wire (Brotli); fetched at start-up.
- `src/generated/ff01-campus-detail.json`: furniture, door, stair and court lines as delta-encoded centimetre polylines. About 95 KB over the wire; fetched once the browser is idle after the first frame.

Both are emitted by Vite with content hashes under `/assets/`, so they are cached for a year.
- `src/data/sourceRooms.ts`

## Code map

- `scripts/build_campus_3d.py`: the builder.
- `scripts/validate_campus_3d.py`: the validator.
- `src/components/canvas/campusModel3d.ts`: model types, loading, Three.js scene construction (walls with dark caps and light sides, glass, rooms, arena, floor lines), highlight and recolour API.
- `src/components/canvas/CampusCanvas.tsx`: renderer, lighting and shadows (computed once), CSS2D room labels by zoom level, picking, layer colouring, on-demand rendering, view controls.
- `src/components/canvas/cameraController.ts`: adds `setFitBounds` and `targetViewMode`. An interrupted 2D/2.5D switch now completes its tilt.
- `src/data/floorplanData.ts`: appends drawing-only spaces for every FF-01 label not covered by product content.

## Performance

| | Before | After |
|---|---|---|
| Downloaded before the map is usable (live site, 9 Mbit/s + 150 ms) | 1,129 KB | see the commit message for the measured figure |
| Model data at start-up | 384 KB (one file, no long cache) | ~50 KB core; detail follows when idle |
| FF-01 drawing texture | 296 KB at every start-up | only when 对照原图 is opened |
| Logo | 62 KB PNG | 7 KB WebP |
| JavaScript | one 978 KB file, 4 h cache | app shell, three.js and map code in separate files, cached for a year |
| Rendering when nothing moves | animation loop running | loop sleeps (0 frames) |

Other changes:
- A startup screen is drawn from HTML, before any JavaScript runs.
- Fonts no longer block the first paint. The wide display font is subset to Latin letters and digits.
- The pixel ratio drops while the camera is moving.
- Sensor polling pauses in background tabs.
- Dev-only preview pages are left out of production builds.
