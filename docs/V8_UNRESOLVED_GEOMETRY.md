# V8 Unresolved Geometry

V8 preserves unresolved source geometry explicitly. None of these objects is silently closed or promoted to verified geometry.

## Missing room polygons

The 13 source labels that did not yield a bounded room-seeded region at the configured 4–12 pt closure range are:

`A100`, `A101`, `A102`, `A106`, `A112`, `A114`, `A115`, `A217`, `A221`, `A226`, `M100`, `M124`, `S407`.

Their source labels and anchors remain in the 101-row V8 space inventory. Each failed attempt records that the seeded structural mask leaked to the crop boundary or did not produce a valid bounded region. They need a larger contextual trace or manual boundary decision; no estimated rectangle is substituted.

## Building exterior

The exterior source trace currently consists of 1,746 segments drawn from 606 P-IDs in narrow perimeter search bands. It visually follows the outer wall runs, but has discontinuities around doors, entrances, stairs, and ambiguous joins. V8 does not use the dimension-grid extents as a substitute and does not assert a closed Building Footprint Polygon. Exterior segment grouping, verified wall-face selection, void boundaries, and closure positions remain open review items.

## M-west corridor candidate

`FF01-CORRIDOR-M-WEST-01` is a source-guided narrow passage Polygon spanning the wall runs near M104/M105/M106. Its four edges map to structural paths:

| Edge | Evidence | Open question |
|---|---|---|
| E01 | P03616, P03617, P08188, P11680 | Confirm wall face and interruptions |
| E02 | P17117, Door layer | Confirm opening width and eastern continuation |
| E03 | P13111, P04057 | Confirm discontinuities and jambs |
| E04 | P16155 | Confirm junction and termination |

This is a review candidate, not a routing edge. `passabilityStatus` remains `UNKNOWN`.

## Lotus Arena

Two nested court polygons are direct source candidates. The 572 seat outlines are grouped into six proximity clusters for semantic indexing without filling the spaces between seats. These are not complete stand deck polygons. Source seat rows, court boundary hierarchy, inner/outer arena wall rings, ring-corridor limits, and entry connections still need targeted review. The ring corridor remains absent.

## Room boundary issues

All 82 new room candidates preserve their vector-aligned and unsupported/virtual closure edge records. The review state remains `UNVERIFIED`; a high vector alignment ratio is not independent verification. Some source label annotations contain OCR/placement ambiguity, and candidate area deltas are not a valid reason to reshape a polygon. The six previous pilots remain unchanged in revision history, including M102 revision 5.
