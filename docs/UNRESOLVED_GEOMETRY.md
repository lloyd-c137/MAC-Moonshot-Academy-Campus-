# Unresolved FF-01 Geometry

## Queue

- `data/source/UNRESOLVED_GEOMETRY.csv` contains every one of the 33,355 painted PDF paths. Every row includes stable pypdf and PyMuPDF source IDs, original layer, candidate category, paint/style data, transformed bounds, and `CANDIDATE_NOT_VERIFIED` status.
- `data/source/ff01-vectors.json.gz` contains the original extracted path commands and every native CAD-layer path. All 33,355 paths join to the legacy P IDs by stable sequence plus transformed bbox (max error 0.0002 pt). No path is discarded.
- `data/source/FF01_LAYER_MANIFEST.json` inventories all 126 source layer names with counts, display-coordinate bounds, style variants, representative geometry and category confidence.
- `data/source/STRUCTURAL_CANDIDATES.csv` and `.json.gz` provide layer-filtered walls, doors, stairs, structural fills and seating with source provenance.
- `data/source/ROOM_MANIFEST.csv` contains all 101 exact source room labels (98 base room codes), their source coordinates, normalized anchors and any nearby text candidates. Every room boundary is explicitly `UNRESOLVED`.

## Unresolved object classes

CAD layer membership now identifies useful candidates, but all building semantics remain unverified: exterior/interior wall roles, columns, actual door openings, windows, room and corridor polygons, stairs, court boundary, stands, arena ring, and entrance connections. The full set has 3,802 paths in Unknown, and every other category is still a layer-based candidate. Layer names do not establish path-to-room assignment, shared-wall topology or door passability.

`scripts/recover_ff01_pilots.py` is the original wall-only baseline: it polygonizes filtered wall paths at 0.1 pt and finds 2,647 global faces, with 0/6 pilot labels contained. The V3 replacement `scripts/recover_ff01_hybrid.py` does not treat those facelets as rooms. It starts from each source label, rasterizes wall/door/glazing CAD layers at 300 DPI, segments the seeded component, then snaps contour vertices to source linework within 2.5 pt. It generates six HUMAN_REVIEW_REQUIRED candidates; source-area conflicts are called out in `docs/PILOT_GEOMETRY_VALIDATION.md`. Independent IoU and VERIFIED room count remain unavailable (0/6).

The development editor at `/dev/geometry-review` provides source/layer overlays, room-first candidate focus, per-edge source P-ID/layer/reason/status evidence, candidate room/corridor polygon drawing, edge insertion, vertex dragging/snapping/deletion, door marking, wall merge/split annotations, undo/redo and revisioned persistence. An editor save is a reviewer record, not automatic product geometry activation.

Six pilot source crops, wall masks, door and glazing evidence masks, text/furniture exclusion masks, vector/raster overlays and segmentation/vector-snap views are stored in `data/source/pilots/v3/` and served under `/ff01-pilot-v3/`. Candidate geometries are also served from the dev-only API to the review route. The current M102 local override saved for review is revisioned and remains HUMAN_REVIEW_REQUIRED; it is not included in production map geometry.

The exact 2D source sheet is displayed as a reference. The current application only supports selection near the text anchor of an existing space ID. It does not claim that a click selects the full room polygon. Illustrative polygons, route graph, room shading and 2.5D meshes are not shown as ground-truth geometry.

## Human review required

1. Review the extracted vector page by page/region, distinguish CAD linework from furniture, dimensions, axis grids, text and symbols, and record reviewed source path IDs.
2. Assign boundary path IDs to source labels and trace true closed room/walkable polygons; retain gaps and uncertain edges as unresolved.
3. Identify shared wall segments and door swings/openings, then record verified adjacency and passability separately.
4. Trace the complete campus perimeter and irregular arena/court/stands/ring. Validate independent grid intervals and key local dimensions before any geometry is marked verified.
5. Recompute IoU, room coverage, wall error, corridor/door coverage and topology checks from independent source/reconstruction datasets.

Do not set a geometry status to `VERIFIED` solely because a path is near a room label or has a thick/dark stroke.
