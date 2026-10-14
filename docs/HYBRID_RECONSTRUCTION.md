# FF-01 Hybrid Reconstruction Pipeline V3

## Coordinate frame

The source page has raw MediaBox/CropBox `[0, 0, 1684, 2384]` and `/Rotate 270`. PyMuPDF's rotation matrix maps the plan into the display frame `[0, 0, 2384, 1684]` points. The vector cache and source label anchors already use this top-left display frame. V3 independently obtains PDF text word boxes, transforms them through the same matrix, and verifies the anchor is inside the matching room-ID word box. Each local crop includes a 10 pt grid and the label box.

## Evidence masks

`scripts/recover_ff01_hybrid.py` reads the layer-aware vector cache. The source PDF crop, vector overlay and exported wall/door/glazing/exclusion masks render at 300 DPI. The bounded room-seed morphology works on a 2-pixel-per-point (144 DPI) local barrier mask; vector snapping returns contour vertices to source coordinates. Source PDF words are transformed through the page rotation matrix and added to the exclusion mask along with furniture, equipment, annotation, dimensions and unknown paths. Filled PDF subpaths are filled using their PDF implicit-close semantics. The rendered PDF crop is kept separately as the visual reference.

The local seed segmentation uses only those structural masks. Door and glazing vectors may participate as temporary barriers to segment a seed region; those edges remain unresolved evidence, never physical walls. A small morphology close can bridge pixel-scale gaps; the actual close width is stored per room. Contour vertices are snapped to source vectors only within 2.5 pt. Every unsupported contour edge is serialized with coordinates and an explanation.

## Outputs and status

The pipeline writes `data/source/pilots/v3/PILOT_HYBRID_RECONSTRUCTION.json`, six source crops, six wall masks, door/glazing masks, exclusion masks, vector/raster overlays, segmentation/vector-snap images, and mirrored browser assets under `public/ff01-pilot-v3/`. Candidate coordinates remain in normalized PDF display points and include illustrative scale-derived metres, source P-IDs, unresolved edges and per-pilot attempts. All candidates remain `HUMAN_REVIEW_REQUIRED`; no automatic result is VERIFIED or production geometry.

## Reproduction

With the dependencies in `scripts/requirements-spatial.txt` installed in an isolated environment and the source PDF at its recorded source path:

```sh
python scripts/recover_ff01_hybrid.py
npm run validate:spatial
```

Run `npm run dev` and open `/dev/geometry-review` to focus a room, inspect its candidate and source evidence, edit vertices, snap to vector edges, split an edge, remove a vertex, undo/redo, and save a local revision. A reviewer decision is required before verification.
