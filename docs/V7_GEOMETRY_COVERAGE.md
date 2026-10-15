# V7 Geometry Coverage

Generated from the V7 model and validation artifacts. These counts describe source-derived evidence and candidate geometry, not completed or verified architectural reconstruction.

## Current coverage

| Object | Count / status |
|---|---:|
| Source room-label occurrences | 101 |
| Unique base room codes | 98 |
| Candidate room polygons carried from prior pilots | 6 |
| Drawing-matched spaces | 0 |
| Drawing-verified spaces | 0 |
| Source wall trace objects | 4,794 |
| Source-filled wall-face candidates | 899 |
| Explicit closed partition-face candidates | 90 |
| Total wall-face candidates | 989 |
| Arena field boundary candidates | 2 |
| Source seat-footprint polygons | 572 |
| Arena trace objects | 1,781 |
| Corridor polygons | 0 |
| Opening candidates | 0 |
| Building footprint | UNRESOLVED |

The 98 base codes are represented by 101 label occurrences because some source IDs have multiple labeled subspaces. Labels outside the M/S/A prefix groups are kept in `UNCLASSIFIED`; this is inventory bookkeeping, not a claim that they are public or service spaces.

## Validation evidence

- Source PDF SHA-256: `28217dcb951ea45b34d2651851f36bcd0af5824d27b5d588b60cdf3672ce3d60`.
- All emitted source P-ID references resolve to IDs in the cached source drawing set.
- Coordinate round-trip arithmetic error is reported by the validation artifact.
- Candidate polygons are checked for valid closed rings.
- V6 remains untouched; V6 validation still expects no footprint, no corridor geometry, and zero verified rooms.
- Room IoU and building-footprint IoU are **NOT MEASURABLE** because there is no independent semantic reference polygon.

## By-series accounting

The canonical V7 JSON contains per-prefix expected-label and candidate-polygon counts for M, S, A, and unclassified labels. A source label is counted even when it has no geometry. Space categories such as public, service, and circulation remain unclassified until source geometry supports a semantic assignment.

## Visual artifacts

Browser screenshots live in `output/playwright/architecture-v7-*.png`. They show source-overlay comparison, independent vector-only rendering, room-label selection, and the unverified 2.5D developer preview. These are implementation screenshots, not accuracy certifications.
