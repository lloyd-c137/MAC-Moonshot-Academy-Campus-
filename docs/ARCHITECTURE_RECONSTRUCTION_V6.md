# FF-01 Architecture Reconstruction V6

## Status

`PARTIAL — SOURCE-ALIGNED DEVELOPER PREVIEW`

V6 adds a whole-sheet, provenance-preserving vector evidence model and a development-only 2.5D inspection route. It does not claim that source CAD layers alone identify complete walls, rooms, doors, corridors, or a verified building footprint.

## Rebuild and validate

```sh
npm run rebuild:architecture-v6
npm run validate:architecture-v6
```

The deterministic extraction reads the existing `data/source/ff01-vectors.json.gz` cache and the existing room manifest, preserving the PDF digest, source path IDs, drawing IDs, CAD layer names, and normalized display-point coordinates. It writes:

- `data/source/canonical-architecture-v6.json`
- `data/source/canonical-architecture-v6-report.json`
- `public/ff01-architecture-v6.json` (the developer preview payload)
- `data/source/canonical-architecture-v6-validation.json`

The source image remains `public/ff01-source-plan.png`. The model uses the existing isotropic 1:300 scale and the previously calibrated page/display coordinate frame. It does not use the dimension-chain envelope as the building footprint.

## Current extracted evidence

The current build includes 8,959 source paths classified by the existing extraction pipeline, 16,502 provenance-bearing line segments, a whole-sheet evidence network of 3,982 exact-coincident deduplicated wall trace edges, 899 structural fill candidates, and all 101 room-label occurrences (98 unique base room codes). The edge deduplication uses only source-coordinate equality after serialization rounding to 0.001 pt; it does not snap endpoints or assert verified wall topology. Six existing pilot polygons are carried through as editable candidates only. Their original versioned review history is not changed by this export.

The current source path classifications are evidence categories, not independently confirmed architectural semantics. Door paths are shown as source traces and are not cut into the 3D wall display as openings. Structural fill candidates remain a separate optional overlay because hatch/fill contours can represent more than wall masses.

## Developer preview

Start the existing Vite app, then open:

`http://localhost:3000/dev/building-preview`

The route is development-only. It displays the full FF-01 sheet as a reference surface, extrudes source wall/partition path segments with illustrative dimensions, and lets the reviewer toggle source traces and the six unverified pilot polygons. Left-drag pans, wheel zooms, right-drag rotates in 2.5D, and the strict top-down button switches to orthographic plan view.

Browser captures from the local Vite app are saved at `output/playwright/architecture-preview-v6-1536x864.png`, `output/playwright/architecture-preview-v6-plan-1536x864.png`, and `output/playwright/architecture-preview-v6-rotated.png`.

The 2.8 m illustrative wall height and 0.14 m rendering thickness are not measured construction data. The preview does not assert a complete footprint, room inventory geometry, corridor polygons, door connectivity, or navigation graph.

## Validation boundary

`npm run validate:architecture-v6` checks source digest consistency, source path provenance, all label occurrences, the six pilot candidate identities, and guards against accidental verification/footprint/corridor claims. Its PASS means **source-trace integrity only**. It does not measure room IoU or establish architectural accuracy. The current model has zero independently verified room polygons.

## Next work needed for production geometry

Trace and review the exterior boundary, shared wall faces, corridor polygons, arena/stand regions, and door openings against the source sheet. Resolve ambiguous classifications in the existing geometry review workflow, then establish independent drawing review records before exporting verified canonical room polygons or enabling production navigation.
