# FF-01 Source Pipeline

## Requirements

Use an isolated Python 3.9+ environment to avoid collisions with globally installed PDF packages:

```sh
python3 -m venv .venv-spatial
. .venv-spatial/bin/activate
python -m pip install -r scripts/requirements-spatial.txt
```

The source PDF is intentionally supplied by path because it is user-owned and is not committed into the repository. The extraction requires PyMuPDF for CAD layer metadata and Shapely for the candidate polygonization pass.

## Extract

```sh
python3 scripts/extract_ff01.py --pdf "/path/to/01_探月26年平面系统图（根据最新导视图更新）20260806-.pdf"
python3 scripts/recover_ff01_pilots.py
npm run validate:spatial
```

The extractor rejects an unexpected page count, rotation, path count, missing overall dimension-chain candidates, or missing room labels. It outputs:

- `data/source/ff01-vectors.json.gz`: full native vector commands and the source summary.
- `data/source/FF01_LAYER_MANIFEST.json`: native CAD layer names, per-layer counts, display-space bounds, style variants, sample geometry, semantic candidate category, confidence and extraction notes.
- `data/source/ff01-structural-candidates.json.gz` / `STRUCTURAL_CANDIDATES.csv`: source-provenanced wall, door, stair and arena/seating candidates. These are not verified room or navigation geometry.
- `data/source/ff01-layer-*.svg` and `public/ff01-layer-*.svg`: layer-isolated wall, door, stair and arena/seating views.
- `data/source/pilots/PILOT_RECONSTRUCTION.json`: two clipped polygonization pilots and explicit coverage/metric states.
- `data/source/pilots/pilot-*.svg`: source, structure, polygon and overlay preview assets. Difference SVGs explicitly say Not Measurable where no independent reviewed geometry exists.
- `scripts/recover_ff01_pilots.py`: layer-filtered Shapely linework, 0.1 pt precision noding and candidate face generation.
- `data/geometry-review/overrides.json` and `history/rev-*.json`: locally saved, revisioned human corrections written by the dev-only review API.
- `data/source/ROOM_MANIFEST.csv`: complete room-label inventory and source anchors.
- `data/source/UNRESOLVED_GEOMETRY.csv`: every painted path awaiting semantic review.
- `data/source/spatial-extraction-summary.json`: source identity, transform, measurements and counts.
- `src/data/sourceAnchors.ts`: generated source label positions for application records.
- `public/ff01-source-plan.svg` and `.png`: vector-preserving source export and full-sheet browser reference.

The coordinate pipeline is deterministic: rotated PDF display coordinates are top-left origin in points; source grid coordinates subtract the measured axis frame origin; plan normalization uses one common scale from the X frame; world X/Z then use the printed 1:300 scale. The axis frame is not the building footprint. Source label anchors identify text, not room centers or boundaries.

PyMuPDF drawing paths use the unrotated page coordinate frame. The extractor applies the PDF page rotation matrix to every native path item before joining to the existing P IDs. For this source revision, all 33,355 PyMuPDF paths join in sequence and their transformed bounding boxes agree with the existing path cache within 0.0002 pt. This validates path-to-layer association, not the architectural meaning of each path.

## Human review editor

Run the Vite dev server and open `/dev/geometry-review`. It is available only in development and the JSON API restricts requests to loopback. Use the source raster and CAD layer vector overlay to select paths, draw/correct room or corridor polygons, snap to visible source-vector points, drag vertices, record door/merge/split decisions, undo/redo, and save. Each save increments a revision and writes both `overrides.json` and `history/rev-XXXXXX.json`. A reviewer may set a geometry status, but saving does not automatically turn it into canonical product geometry or enable navigation.

## Pilot result

The filtered wall set polygonizes into candidate faces, but the chosen M102/M103/M104 and arena-ring label anchors do not fall inside a plausible candidate polygon. In the two review crops, the current pass returns 0/6 candidate room polygons; room IoU and wall alignment are Not Measurable. The failures are retained. Do not increase snap tolerance or close door gaps without verified door-to-wall relationships to force a room match.

The 2D application view shows the original whole-sheet reference at calibrated scale. Synthetic room solids, heatmap fills and unverified routes are withheld from this source-plan mode. The 2.5D toggle remains unavailable until semantic 2D geometry passes validation.
