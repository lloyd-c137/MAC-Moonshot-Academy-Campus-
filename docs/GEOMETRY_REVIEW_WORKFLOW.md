# V4 Geometry Review Workflow

## Regenerate review evidence

With the pinned Python dependencies installed:

```sh
npm run recover:pilot-review
npm run validate:review
```

This reads the existing V3 candidate polygons, source CAD vector cache, and pilot masks. It writes review packages under `data/source/pilots/v4/review-packages/` and browser-visible evidence under `public/ff01-pilot-v4/`. It does not change `data/geometry-review/overrides.json`.

Each package includes the source crop, wall mask, door and glazing evidence, vector/raster overlay, segmentation preview, numbered edge overlay, complete edge-level JSON, at most three snap proposals, and a review checklist. Wall alignment is a candidate signal. The system does not resolve which face of a double-line wall is the correct room boundary.

## Review an edge

Run `npm run dev` and open `/dev/geometry-review`. Selecting a pilot focuses its source crop. Choose a numbered boundary segment on the map or in the edge list to inspect its P-ID, drawing ID, CAD layer, distance, overlap support, classification, and prior objection. `Move selected edge` translates both endpoints as a draft. Vertex movement, insertion, deletion, undo/redo and revision comparison remain available. Snap tolerance is expressed in normalized PDF points.

An edge decision requires a reviewer name and is stored with timestamp and Source P-IDs. `ACCEPTED` is an edge-level decision only. It does not promote the room polygon to VERIFIED. Save rejects stale revisions so an older browser cannot overwrite a newer draft. Each successful save writes the next numbered history document and atomically replaces the active draft.

Correction proposals are new unverified drafts. They preserve the source candidate and prior saved revisions, and are never selected by annotated area. Rejected or uncertain suggestions remain unapplied.

## Verification boundary

The review package can be `REVIEW_READY` while its room remains `HUMAN_REVIEW_REQUIRED`. That means all candidate edges and known evidence are available for a reviewer. It does not mean a reviewer has confirmed them. The editor has no direct VERIFIED control. A complete independent verification record would need a reviewer identity, reviewed geometry revision, reviewed edge IDs, source references, result, and zero outstanding issues. No such record currently exists.

Room IoU remains `NOT_MEASURABLE` until an independent reference polygon has been reviewed and saved. Candidate-to-candidate or candidate-to-itself comparison is not accepted as ground truth.

## Isolated persistence tests

The revision save/reload and edge-record smoke tests were run against a separate Vite instance with `MAC_GEOMETRY_REVIEW_DIR` pointed at a disposable `/tmp` store seeded from revision 5. The real project override file and M102 revision 5 were not written during these tests. The server supports this environment variable for isolated review-store testing.
