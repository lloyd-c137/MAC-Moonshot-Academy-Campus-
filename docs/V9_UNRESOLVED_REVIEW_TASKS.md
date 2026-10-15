# V9 Unresolved Geometry Review Tasks

This list is generated from FF-01 evidence. `UNVERIFIED` means a source-linked candidate exists; it is not an architectural approval.

## P0: M-West room/corridor conflict

- Compare M104's south / southeast boundary with the corridor's north boundary in `output/architecture-v9/m-west-topology-overlay.png`.
- Review source paths P03616, P03617, P11680 and the corridor paths P08188, P08189, P15462, P14871, P14879, P04056–P04058, P06401–P06402, P16154–P16155.
- Resolve the 14.239 m² overlap by editing the boundary supported by the drawing. Do not clip based on target area.
- Confirm the shared wall faces for M104/M106, M105/M106, and each room/corridor adjacency.
- Confirm all candidate openings independently. Current 345 opening candidates remain UNKNOWN; formal navigation edges remain zero.

## P0: Exterior perimeter

- Review `output/architecture-v9/exterior-gap-contact-sheet.png` and its `EXT-GAP-*` identifiers.
- Identify which open endpoints belong to the true exterior wall, entry recesses, courtyard voids, or unrelated traces.
- The current endpoint graph has 1,746 candidate segments and 265 open endpoints. Do not close all 119 nearest pairs automatically.
- Confirm the one closed source component's architectural meaning before using it as a footprint.

## P1: Missing room polygons

- A100, A106, A114, A115, S407: source crop has no bounded seed-connected component in the 150 pt search context; inspect public-space connections and missing barriers.
- A101 and A102: review the retained contour proposals and add the unsupported wall segments from source evidence before considering them as room candidates.
- M100: determine whether M100 denotes an umbrella/public space around M100-1 and M100-2 or a separately bounded room. Do not merge or overlap polygons without drawing evidence.

## P1: Candidate boundary evidence

- V9 computes per-edge wall-face, door, glazing, and unsupported lengths. Review long unsupported boundaries and cases where side consistency is low.
- The V8 candidate boundary can be visually close while still lacking a physical wall-face classification. The V9 distance metric must be interpreted with layer semantics and side placement, not as a standalone precision claim.
- A210, A207 and A114 area tokens are preserved with raw text and bounds; verify labels before using any numeric parse.

## P2: Lotus Arena

- Trace court surface and court boundary separately.
- Partition the 572 seat outlines into source-supported stand decks and steps.
- Trace inner / outer arena wall faces and identify ring-circulation polygons only where boundaries support them.
- Record uncertain access openings as UNKNOWN; do not infer walkability from a door leaf symbol alone.
