# V5 Verification Status

## Engineering gate

**PASS.** The focused session is implemented over the existing V4 package, candidate data, review editor, and versioned API. It keeps six rooms in the requested risk order, restores the last active room, records per-edge decisions and reviewer assertion, binds reviews to the exact polygon fingerprint, separates candidate state from verification level and IoU, and requires an explicit final submission before drawing verification. M102 revision 5 remains in the active store.

Validation run on 2026-10-14: `npm run validate:review`, `npm run validate:spatial`, `npm run lint`, and `npm run build` all passed. The real browser opened the review route at 1536×864, switched evidence layers, navigated to S208 and back to M104, reloaded and resumed M104, selected M104-E01 to reveal its P-ID/layer evidence, and confirmed edge-decision controls stay disabled until a reviewer name is entered. No review decision was entered. A separate Vite instance used a disposable `/tmp` store to verify canonical export is empty at zero verified rooms and the API rejects a drawing-verification promotion with missing per-edge decisions. A stale-save request against the active API was rejected without changing revision 5. The active M102 record matches its stored revision-5 history entry. The browser console had one external Google Fonts connection error; the app rendered and review interactions remained functional.

## Geometry gate

**AWAITING HUMAN REVIEW.** Current state is 0/6 drawing-verified, 0/6 field-verified, and IoU is NOT_MEASURABLE for all six rooms. No reviewer decisions were submitted by this implementation run. There is no canonical verified geometry to export and no local 2.5D proof of concept is eligible.

| Room | Candidate | Edge review | Verification | IoU | Main issue |
|---|---|---|---|---|---|
| M104 | REVIEW_READY | 0/16 | UNVERIFIED | NOT_MEASURABLE | +58.0% area delta |
| M102 | REVIEW_READY | 0/15 | UNVERIFIED | NOT_MEASURABLE | -44.4% area delta; revision 5 retained |
| S208 | REVIEW_READY | 0/20 | UNVERIFIED | NOT_MEASURABLE | -27.5%; angled boundary |
| M103 | REVIEW_READY | 0/24 | UNVERIFIED | NOT_MEASURABLE | Full edge review required |
| S209 | REVIEW_READY | 0/20 | UNVERIFIED | NOT_MEASURABLE | Full edge review required |
| S210 | REVIEW_READY | 0/36 | UNVERIFIED | NOT_MEASURABLE | Full edge review required |

The reviewer must inspect the source crop, wall and opening evidence, decide each numbered edge, correct geometry in the full editor where needed, save a revision, and make an explicit final statement. A displayed reviewer name is only a local self-assertion and is not authentication.

Browser capture: `output/playwright/geometry-review-v5-M104-1536x864.png` and `output/playwright/geometry-review-v5-M104-edge-evidence-1536x864.png`.
