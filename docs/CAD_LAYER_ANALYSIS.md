# FF-01 CAD layer analysis

## Source and method

Source PDF SHA-256: `28217dcb951ea45b34d2651851f36bcd0af5824d27b5d588b60cdf3672ce3d60`. PyMuPDF 1.24.14 reads one page with `/Rotate 270`, page rotation rectangle `2384 × 1684 pt`, and 33,355 drawing paths. `page.get_drawings()` exposes the original CAD layer name on every path. The full machine-readable inventory is [FF01_LAYER_MANIFEST.json](../data/source/FF01_LAYER_MANIFEST.json).

The native drawing order has a 1:1 correspondence with the existing pypdf extraction. After applying the page rotation matrix to each PyMuPDF path bound, all 33,355 records join to P IDs; maximum bbox disagreement is `0.0002 pt` and median is `0.0001 pt`. This is verified coordinate/provenance association. It does not verify the architectural interpretation of those paths.

## Confirmed source-layer counts

| Original CAD layer | Paths | Initial semantic category | Interpretation limit |
|---|---:|---|---|
| `A05-建筑原有墙体` | 2,014 | Existing Wall | Wall layer candidate; some paths are fragmented/filled compound geometry |
| `A07-新建隔墙` | 336 | New Partition | Wall layer candidate; endpoints and openings need topology review |
| `A04-建筑剪力墙柱填充` | 893 | Structural Wall / Column | Filled structure; do not treat every loop as a room boundary |
| `P03-门扇` | 1,054 | Door | Door leaf/swing candidates, not verified openings |
| `A11-建筑楼梯 平面高差` | 244 | Stair | Stair/elevation plan candidates |
| `T-CC-SEAT-L1$0$SEAT-ATHE` | 574 | Arena / Seating | Seat linework, not a seating-region polygon |
| `S-实验家具` | 9,547 | Furniture | Explicitly excluded from wall polygonization |

Other original layers such as `T-CC...$wall`, `$DOOR`, `$GLAZ`, `$STRS`, `$RAIL`, furniture and annotation families are retained by exact original name and mapped to a candidate category. All 126 names, counts, bboxes, style variants and representative path fragments are in the manifest. The category totals are candidates, not confirmed architectural object counts; 3,802 paths remain in Unknown pending layer-specific review.

## Layer-isolated outputs

- `data/source/ff01-layer-walls.svg`
- `data/source/ff01-layer-doors.svg`
- `data/source/ff01-layer-stairs.svg`
- `data/source/ff01-layer-arena-seating.svg`

The same SVGs are served under `public/` for browser inspection. They use the page-rotation-normalized source coordinate system. The source raster remains visible independently at `/ff01-source-plan.png`.

## Provenance fields

Each cached native path stores `id` (`F00001...`), the original stable P ID, exact `layer`, candidate semantic category/confidence, raw PyMuPDF bounds, display-space bounds, stroke/fill/style, and native path items transformed into display coordinates. `UNRESOLVED_GEOMETRY.csv` now carries layer category and the explicit `CANDIDATE_NOT_VERIFIED` state. Layer membership alone is never marked as a verified wall, door, room or passage.
