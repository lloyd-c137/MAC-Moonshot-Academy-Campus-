# FF-01 Source-Guided Digitization — V8

## Purpose

V8 is an additive spatial layer built from the frozen FF-01 V6/V7 evidence. It does not edit those baselines or the V5 review store. Coordinates remain normalized PDF display points; Three.js converts them with the existing isotropic 1:300 transform. The source PDF SHA-256 is `28217dcb951ea45b34d2651851f36bcd0af5824d27b5d588b60cdf3672ce3d60`.

## Reproducible pipeline

```sh
npm run rebuild:architecture-v8
npm run validate:architecture-v8
npm run dev
```

Open `/dev/building-preview-v8` in the local development server. The generated model is `data/source/canonical-architecture-v8.json`; the served copy is `public/ff01-architecture-v8.json`. Persistent authoring parameters and the traced west-corridor polygon are in `data/source/architecture-v8-edits.json`. Seeded room boundaries are reconstructed deterministically from the cached native path geometry and retain P-ID/layer evidence, seed coordinates, mask layers, and temporary-closure width.

The candidate routine creates a local wall/door/glazing mask, flood-fills from the source room label, and accepts only valid bounded regions whose sampled boundary edges are at least 70% within 2.5 PDF points of compatible native vectors. Area annotations are diagnostics only and never alter a boundary. Temporary raster closure is not exported as a physical wall or a passable door.

## Current construction results

| Geometry | Result | State |
|---|---:|---|
| Source room labels accounted for | 101 / 101 | Complete inventory |
| Room polygons | 88 | Candidate, all unverified |
| M-series | 30 / 32 | Candidate polygons |
| S-series | 31 / 32 | Candidate polygons |
| A-series | 27 / 37 | Candidate polygons |
| Pairwise candidate room overlap | 0 above 0.5 pt² | Machine checked |
| M-west corridor | 1 polygon | Candidate; passability unknown |
| Court boundary semantic polygons | 2 nested source candidates | Unverified |
| Seat footprint clusters | 6 clusters / 572 source seats | Derived grouping; not stand-deck polygons |
| Open exterior boundary evidence | 1,746 clipped source segments / 606 P-IDs | Partial; no closed footprint asserted |
| Drawing matched / drawing verified | 0 / 0 | Pending independent review |

V7's existing 4,794 wall trace objects and 989 wall-face candidates remain distinguishable: traces are not promoted to wall volumes, and source-filled faces are candidates rather than verified semantic walls. The V8 preview may render these source-derived candidates in 2.5D with illustrative heights; they do not constitute a complete or verified campus model.

## Validation meaning

`PASS_DATA_INTEGRITY` covers source hash agreement, source P-ID existence, coordinate round-trip, valid closed candidate polygons, room-label inventory, candidate overlap, seat accounting, and preservation of M102 revision 5. It does not certify building accuracy, room IoU, a complete footprint, door topology, or human verification. Room IoU is not measurable without an independent reference polygon. Drawing-verified and field-verified counts remain zero.

## Preview and regression boundary

The V8 page is development-only. The production campus application remains on its existing map and data behavior. The geometry preview offers source overlay on/off, floor-plan and orthographic cutaway modes, source-space selection, pan, cursor zoom, and explore-mode rotation. Indoor navigation is not enabled from these candidate openings or corridor boundaries.
