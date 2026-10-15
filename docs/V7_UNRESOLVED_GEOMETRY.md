# V7 Unresolved Geometry

This list is intentionally conservative. Missing geometry remains missing; no object is inferred from area labels or remaining whitespace.

| Object | Current status | Evidence / next required step |
|---|---|---|
| Complete exterior footprint | UNRESOLVED | Wall-layer paths do not consistently distinguish exterior faces from interior partitions or prove a closed boundary. Trace and review the exterior boundary against FF-01. |
| Structural wall semantics | CANDIDATE | 4,794 source-derived line traces and 989 source-filled/closed-path face candidates retain P-ID and layer provenance. Verify wall-vs-furniture/detail classification and resolve connected wall topology. |
| Interior room boundaries | PARTIAL | Six prior pilot candidates are retained; 95 of 101 labels have no polygon. Recover boundaries using shared wall faces and local source tracing. |
| M102 revision 5 | PRESERVED | Existing V5 draft and history were not modified by V7 generation. Review and merge only through the existing versioned review workflow. |
| Lotus arena | SOURCE CANDIDATES | Two field-boundary polygons, 572 seat footprints and 1,781 arena-layer traces are present. The set is not yet classified into complete court, stands, inner/outer ring, and ring circulation regions. |
| Corridors and entrance halls | NOT GENERATED | No corridor polygon is asserted. Trace explicit corridor bounds and confirm connections from door/wall evidence. |
| Door openings | NOT GENERATED | Door leaf evidence is not promoted to wall openings. Associate leaves with verified wall gaps and adjacent regions before use. |
| Navigation graph | NOT GENERATED | There are no verified walkable polygons or opening connections. Indoor routing remains disabled. |
| Public/service space classes | NOT CLASSIFIED | The source-label manifest is inventoried; labels are not assigned a functional category without geometric/source evidence. |
| Independent alignment metrics | NOT MEASURABLE | No independent ground-truth geometry exists for IoU or semantic boundary accuracy. Source overlay is visual evidence only. |

## Verification policy

All V7 source-derived geometry is unverified unless an explicit independent review record exists. Machine validity, source provenance, and visual alignment do not imply `DRAWING_VERIFIED` or `FIELD_VERIFIED`. V7 generation does not create human review records.
