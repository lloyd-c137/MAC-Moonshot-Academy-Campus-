import { SPATIAL_PLAN } from './spatialPlan';
import type { PdfPoint, WorldPoint } from '../types/architecture';

const SCALE_M_PER_PT = 25.4 * 300 / 72 / 1000;
const GRID_WIDTH_PT = SPATIAL_PLAN.sourcePointToPlanUnit * SPATIAL_PLAN.width;
const GRID_ORIGIN: PdfPoint = [
  SPATIAL_PLAN.sourceGridCenterPdfX - GRID_WIDTH_PT / 2,
  SPATIAL_PLAN.sourceGridCenterPdfY - GRID_WIDTH_PT * SPATIAL_PLAN.height / SPATIAL_PLAN.width / 2,
];

/** FF-01 display-point coordinates to the shared V6/V7 world frame (meters). */
export function pdfDisplayPtToWorldXZ(point: PdfPoint): WorldPoint {
  const [originX, originY] = [
    SPATIAL_PLAN.sourceGridCenterPdfX - GRID_WIDTH_PT / 2,
    SPATIAL_PLAN.sourceGridCenterPdfY - GRID_WIDTH_PT * SPATIAL_PLAN.height / SPATIAL_PLAN.width / 2,
  ];
  return [(point[0] - originX) * SCALE_M_PER_PT, (point[1] - originY) * SCALE_M_PER_PT];
}

export function worldXZToPdfDisplayPt(point: WorldPoint): PdfPoint {
  return [point[0] / SCALE_M_PER_PT + GRID_ORIGIN[0], point[1] / SCALE_M_PER_PT + GRID_ORIGIN[1]];
}

/** Adapter to the legacy normalized plan grid; no independent axis scaling. */
export function pdfDisplayPtToLegacyPlan(point: PdfPoint): WorldPoint {
  const scale = SPATIAL_PLAN.sourcePointToPlanUnit;
  return [(point[0] - GRID_ORIGIN[0]) * scale, (point[1] - GRID_ORIGIN[1]) * scale];
}

export function legacyPlanToPdfDisplayPt(point: WorldPoint): PdfPoint {
  const scale = SPATIAL_PLAN.sourcePointToPlanUnit;
  return [point[0] / scale + GRID_ORIGIN[0], point[1] / scale + GRID_ORIGIN[1]];
}

export const ARCHITECTURE_COORDINATES = {
  scaleMPerPdfPt: SCALE_M_PER_PT,
  gridOriginPdfPt: GRID_ORIGIN,
  coordinateSystemId: 'FF01_NORMALIZED_PDF_DISPLAY_PT_V1',
} as const;
