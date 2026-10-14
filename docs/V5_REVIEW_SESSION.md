# V5 Drawing Verification Review Session

## Start and resume

Run `npm run dev` from the project directory, then open:

`http://127.0.0.1:3000/dev/geometry-review`

The focused session opens the six-room queue in this order: M104, M102, S208, M103, S209, S210. It remembers the active room and the reviewer's locally declared display name in browser local storage. Per-edge decisions and room revisions are stored through the existing versioned local review API. Use `/dev/geometry-review?mode=edit` to open the full geometry editor for vertex/edge corrections; return to the session to review the corrected revision.

## Decision and verification model

`candidateStatus` describes candidate processing (`PROPOSED`, `MACHINE_CHECKED`, `REVIEW_READY`, `REJECTED`). `verificationLevel` is separate (`UNVERIFIED`, `DRAWING_VERIFIED`, `FIELD_VERIFIED`). `iouStatus` is independent (`MEASURED`, `NOT_MEASURABLE`); absent independent reference geometry remains `NOT_MEASURABLE` and does not by itself prevent source drawing review.

Each edge decision is stored against its underlying Edge ID and source P-IDs. The session requires a reviewer name as a local assertion, explicitly records `LOCAL_SELF_DECLARED_NOT_AUTHENTICATED`, and does not treat the name as authentication. `DRAWING_VERIFIED` requires a human to accept every packaged boundary edge and press the final submit control with a review statement. `CORRECT`, `REJECT`, and `CANNOT_DETERMINE` leave the room unverified. The API refuses a room promotion without the matching revision-bound review record and complete accepted-edge set.

Canonical geometry is exposed only through the development API's `/api/geometry-review/canonical-export`, which returns verified rooms only. With no drawing verification record it returns `NO_DRAWING_VERIFIED_GEOMETRY` and an empty list. It does not overwrite application mock polygons. No whole-campus 2.5D was enabled; no local region has yet cleared the human review gate.

The canonical endpoint includes the PDF display-point to calibrated world X/Z transform and computes m² from the verified PDF-space polygon. Review decisions are bound to an exact polygon fingerprint. If geometry is corrected after reviewing edges, those earlier edge decisions no longer count for the new polygon; edges must be reviewed again.

## Current risk ordering

- **M104 (P0):** candidate area 98.88 m² versus 62.6 m² annotation (+58.0%). Review possible neighboring-space intrusion and missing partitions; do not force-fit area.
- **M102 (P0):** candidate area 72.81 m² versus 131 m² annotation (-44.4%). Revision 5 is retained unchanged; inspect whether a continuous part of the room is missing.
- **S208 (P0):** candidate area 21.18 m² versus 29.2 m² annotation (-27.5%). Inspect angled walls and truncation.
- M103, S209, S210 remain full edge-by-edge reviews regardless of area deviation.

Source crops and numbered candidate overlays are in `public/ff01-pilot-v4/<ROOM>/`. The edge list identifies Source P-IDs and CAD layer evidence. A REVIEW_READY package only means evidence is assembled; it does not mean its boundaries are verified.

## Limits

The review UI is local development tooling. The reviewer identity is not authenticated, and a reviewer must operate the browser. Drawing verification certifies the FF-01 depiction only, not built conditions. Field verification requires separate field/as-built evidence. Room IoU remains not measurable until an independent reference polygon exists.
