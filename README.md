# Moonshot Academy Campus

MAC is a campus discovery prototype with room details, search, environmental sample data, events, moments, and map interaction. Spatial fidelity is under active reconstruction from the FF-01 source drawing.

Interface design (tokens, layout, brand assets): [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).

## 3D campus map

The main map (`/`) now renders a 3D model of FF-01 generated from the drawing itself: 159 wall bodies extruded from the CAD wall layers (existing walls, new partitions, architectural walls, shear walls / columns, with door openings kept where the CAD lines break), 182 glazing bodies, 93 clickable room floors from the V9 candidates, all 101 room labels with names read from the PDF label text, the Lotus Arena court and 572 seats as stepped tiers, plus furniture / door / stair lines on the floor. It supports 2.5D and 2D views, search-to-focus, room selection, layer colouring and a toggleable FF-01 overlay for comparison (图纸对照 → 叠加 FF-01 原始图纸).

Heights are illustrative (2.8 m walls; no section drawing), the outer slab is a derived closing of the wall union, and no room is DRAWING_VERIFIED. Indoor routing stays disabled.

```sh
npm run rebuild:campus-3d -- --pdf "/path/to/FF-01.pdf"   # writes public/ff01-campus-3d.json + src/data/sourceRooms.ts
npm run validate:campus-3d
```

See [`docs/CAMPUS_3D_MODEL.md`](docs/CAMPUS_3D_MODEL.md).

## Current spatial status

The repository includes a reproducible native-vector and CAD-layer extraction of the one-page FF-01 drawing (1:300, rotated PDF page), a complete inventory of 101 room-label IDs / 98 base room codes, and a calibrated full-sheet 2D source reference. All 33,355 original vectors join to PyMuPDF's CAD layer records with a maximum transformed bbox error of 0.0002 pt. The two overall axis/dimension-chain spans reconstruct within 0.01% of their printed values. Those spans are not the exterior building footprint.

The PDF contains 126 CAD layers, including source-named existing walls, new partitions, structural fills, door leaves, stairs, seating and furniture. Layer association is verified; these categories do not by themselves prove room polygons, door openings, corridor topology or passability. The V3 hybrid pipeline emits six room-seeded candidates (M102, M103, M104, S208, S209, S210). V4 packages all 131 boundary edges with nearest CAD-layer/P-ID evidence and up to three conservative snap proposals per room. All six review packets are ready; 0/6 room geometries are independently verified and IoU is not measurable. M102 draft revision 5 remains preserved. Existing app polygons, wall segments, arena geometry and navigation connections remain illustrative or unverified. Source-plan mode displays the actual drawing; schematic 2.5D meshes, heatmap fills and navigation routes remain withheld until source geometry is independently checked. Indoor routing is temporarily unavailable.

**Current status: PARTIAL. Do not treat the map as a completed digital twin or verified indoor navigation system.** See [`docs/SPATIAL_FIDELITY_AUDIT.md`](docs/SPATIAL_FIDELITY_AUDIT.md), [`docs/PILOT_FAILURE_ROOT_CAUSE.md`](docs/PILOT_FAILURE_ROOT_CAUSE.md), [`docs/PILOT_BOUNDARY_ERROR_AUDIT.md`](docs/PILOT_BOUNDARY_ERROR_AUDIT.md), [`docs/PILOT_GEOMETRY_VALIDATION.md`](docs/PILOT_GEOMETRY_VALIDATION.md), and [`docs/UPDATED_UNRESOLVED_GEOMETRY.md`](docs/UPDATED_UNRESOLVED_GEOMETRY.md).

### V8 PDF-guided digitization

V8 adds an independent candidate model built from source-seeded raster regions snapped and audited against FF-01 native vectors. It currently accounts for all 101 room-label occurrences and contains 88 source-aligned room polygon candidates, one M-west corridor candidate, two court-boundary candidates, six seat-footprint clusters (572 source seats), and 1,746 open exterior trace segments. The 13 remaining labels, exterior closure gaps, corridor openings, and ring-corridor limits remain unresolved. All candidate geometry is UNVERIFIED; the V8 work does not change the production campus map or enable indoor navigation.

Run `npm run rebuild:architecture-v8` and `npm run validate:architecture-v8`. Start `npm run dev` and open `/dev/building-preview-v8` for the development-only source overlay and orthographic 2.5D candidate preview. See [`docs/ARCHITECTURE_RECONSTRUCTION_V8.md`](docs/ARCHITECTURE_RECONSTRUCTION_V8.md) and [`docs/V8_UNRESOLVED_GEOMETRY.md`](docs/V8_UNRESOLVED_GEOMETRY.md).

V6 adds a source-provenance full-sheet evidence model and a development-only architectural trace preview. Run `npm run rebuild:architecture-v6` and `npm run validate:architecture-v6`, then visit `/dev/building-preview` while Vite is running. The preview can inspect source wall, partition, structural-fill, door, stair, and arena/seating traces over the FF-01 sheet, with an illustrative 2.5D extrusion. This is not a complete or verified building model: footprint and corridor polygons remain unresolved, all six room candidates remain unverified, and door paths do not establish passable openings. Details and limits are in [`docs/ARCHITECTURE_RECONSTRUCTION_V6.md`](docs/ARCHITECTURE_RECONSTRUCTION_V6.md).

## Run the app

```sh
npm install
npm run dev
```

The app listens on port 3000. Room details and environmental/event panels remain product mock data. Map selection is anchored to source room-label text for matching spaces; it does not yet represent verified full room boundaries. Install the pinned spatial dependencies from `scripts/requirements-spatial.txt`, run `python3 scripts/extract_ff01.py --pdf /path/to/FF-01.pdf`, then `npm run recover:ff01-hybrid`, `npm run recover:pilot-review`, `npm run validate:spatial`, and `npm run validate:review`. The dev-only `/dev/geometry-review` opens the focused six-room Drawing Verification Session (M104, M102, S208, M103, S209, S210); use `/dev/geometry-review?mode=edit` for the full editor and geometry corrections. Review decisions are local, append-only revisions. Reviewer names are self-declared and unauthenticated. Only explicit final human review can produce DRAWING_VERIFIED; `FIELD_VERIFIED` additionally requires field/as-built evidence. IoU stays NOT_MEASURABLE without independent reference geometry. Canonical export includes verified spaces only. See [`docs/V5_REVIEW_SESSION.md`](docs/V5_REVIEW_SESSION.md) and [`docs/V5_VERIFICATION_STATUS.md`](docs/V5_VERIFICATION_STATUS.md).

## Re-extract the source drawing

Install pinned Python dependencies and provide the locally available FF-01 PDF:

```sh
python3 -m pip install -r scripts/requirements-spatial.txt
python3 scripts/extract_ff01.py --pdf "/path/to/01_探月26年平面系统图（根据最新导视图更新）20260806-.pdf"
npm run validate:spatial
```

See [`docs/RECONSTRUCTION_PIPELINE.md`](docs/RECONSTRUCTION_PIPELINE.md) for outputs and coordinate conventions.

## Checks

```sh
npm run validate:spatial
npm run validate:review
npm run lint
npm run build
```

Extraction validation checks source identity, vector and label counts, manifest accounting and the two overall dimension-chain measurements. It does not verify semantic room geometry, walls, doors, corridors, arena boundaries, or route validity.
