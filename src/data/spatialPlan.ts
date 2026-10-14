import { Point2D } from '../types/campus';

/** Shared FF-01 plan frame used by rooms, anchors, routes, overlays and the camera. */
export const SPATIAL_PLAN = {
  width: 1000,
  height: 863.5416667,
  worldUnitsPerPlanUnit: 0.134112,
  sourcePageWidth: 2384,
  sourcePageHeight: 1684,
  sourcePointToPlanUnit: 1000 / 1267.2,
  sourceGridCenterPdfX: (461.72 + 1728.92) / 2,
  sourceGridCenterPdfY: (304.72 + 1398.88) / 2,
  sourcePageWorldOffsetX: (2384 / 2 - (461.72 + 1728.92) / 2) * 0.10583333333333333,
  sourcePageWorldOffsetZ: (1684 / 2 - (304.72 + 1398.88) / 2) * 0.10583333333333333,
  sourcePageWorldWidth: 2384 * 0.10583333333333333,
  sourcePageWorldHeight: 1684 * 0.10583333333333333,
  sourceOverlay: '/ff01-source-plan.png',
} as const;

export function planToWorld(point: Point2D): { x: number; z: number } {
  return {
    x: (point.x - SPATIAL_PLAN.width / 2) * SPATIAL_PLAN.worldUnitsPerPlanUnit,
    z: (point.y - SPATIAL_PLAN.height / 2) * SPATIAL_PLAN.worldUnitsPerPlanUnit,
  };
}
