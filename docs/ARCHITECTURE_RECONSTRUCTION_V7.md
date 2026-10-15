# FF-01 Architecture Reconstruction V7

## Scope and status

V7 is a separate, source-provenance-preserving geometry layer. V6 remains unchanged as the frozen extraction/evidence baseline. V7 is currently a **partial source-aligned candidate model**, not a verified building model.

The builder reuses the V6 native-path decoder and the cached FF-01 vector export. It does not synthesize a building footprint, corridor, door opening, wall thickness, or room rectangle. Native wall traces remain traces; only source-filled wall paths and explicitly closed native polylines are emitted as wall-face candidates. Arena field paths and seat-layer paths are preserved as source polygon candidates. The six existing pilot polygons are carried through without replacing geometry-review drafts or history.

## Coordinate contract

Canonical 2D coordinates use the rotation-normalized FF-01 PDF display-point space (`FF01_NORMALIZED_PDF_DISPLAY_PT_V1`). The same isotropic scale from V6 is used for the world adapter: `0.105833333333… m / PDF point`. PDF display X maps to world X; PDF display Y maps to world Z; world Y is elevation. The converter and inverse converter are in `src/data/canonicalGeometry.ts`.

The V7 validator checks page corners and representative source points through a point-to-world-to-point round trip. Current maximum observed numeric round-trip error is recorded in `data/source/canonical-architecture-v7-validation.json`; this tests transform arithmetic, not architectural alignment or room accuracy.

## Generated objects

- Source wall trace objects retain layer, source P-ID, semantic classification and unverified status.
- Wall-face candidates come only from source filled polygons and explicitly closed native partition polylines. The term *candidate* is intentional: a source CAD layer alone does not establish architectural meaning.
- Arena candidates contain source field boundaries, seating footprints, stand traces, and arena-layer traces. Preview heights are illustrative and are not measured building dimensions.
- Space records preserve all source labels and stable IDs. Existing six pilot candidate polygons remain `CANDIDATE / UNVERIFIED`; remaining labels have no polygon.
- Building footprint, corridors, verified openings, and navigation remain unresolved or absent.

## Development preview

Run `npm run dev`, then open `/dev/building-preview-v7`. This route renders V7 data independently of the production map. Turn off **Source PDF Overlay** to inspect only the current vector geometry; turn it on to compare against FF-01. Layer controls, room-label selection, fit, top-down mode, and orthographic 2.5D preview are provided. The scene does not claim that all traces are walls or that the source geometry is drawing-verified. Illustrative vertical dimensions affect only preview elevation.

The preview is development-only and is not wired as the production campus map. Existing app data and review history are not migrated or overwritten.

## Rebuild and validation

```sh
npm run rebuild:architecture-v7
npm run validate:architecture-v7
```

The builder requires the frozen V6 model and vector cache and verifies the PDF hash when the source PDF is available at the recorded path. Validation checks source hash consistency, source P-ID references, polygon closure/validity, label inventory, and verification-state invariants. It does **not** certify semantic completeness, independent polygon IoU, or drawing verification.

## Current limitations

No reliable exterior footprint, room-complete geometry, explicit corridor polygon, verified door opening, or navigation graph has been recovered. Several thousand line traces are not equivalent to wall objects. The arena preview is source-derived but not independently reviewed. The full 101-label manifest is accounted for, while only six labels have candidate polygons. See `V7_GEOMETRY_COVERAGE.md` and `V7_UNRESOLVED_GEOMETRY.md` for counts and gaps.
