import type { ArchitectureV7, PdfPoint, PolygonGeometry } from './architecture';

export interface V8BoundaryEvidence {
  edgeID: string;
  startPt: PdfPoint;
  endPt: PdfPoint;
  lengthPt: number;
  sourcePathIDs: string[];
  sourceLayers: string[];
  evidenceStatus: string;
  verificationLevel: 'UNVERIFIED';
}

export type V8Space = ArchitectureV7['spaces'][number] & {
  spaceID: string;
  geometry: PolygonGeometry | null;
  authoringMethod: string;
  boundaryEdges: V8BoundaryEvidence[];
  sourceLayers: string[];
  candidateRevision: number;
  segmentation?: {
    seedPt: PdfPoint;
    temporaryClosingPt: number;
    temporaryClosureIsPhysicalWall: false;
    maskLayers: string[];
    cropRadiusPt: number;
  };
};

export type ArchitectureV8 = Omit<ArchitectureV7, 'modelID' | 'spaces' | 'buildingFootprint' | 'circulation' | 'arena'> & {
  modelID: 'FF01-ARCHITECTURE-V8';
  spaces: V8Space[];
  buildingFootprint: {
    geometry: PolygonGeometry | null;
    candidateGeometry: PolygonGeometry | null;
    geometryStatus: string;
    verificationLevel: string;
    sourcePathIDs: string[];
    boundarySegments: Array<{ id: string; geometry: { type: 'LineString'; coordinates: PdfPoint[] }; sourcePathID: string; sourceLayer: string; geometryStatus: string; verificationLevel: string }>;
    unresolvedBoundaries: Array<{ id: string; reason: string }>;
  };
  circulation: {
    corridors: Array<{
      id: string;
      type: string;
      geometry: PolygonGeometry;
      areaM2: number;
      sourcePathIDs: string[];
      sourceLayers: string[];
      sourceRoomIDs: string[];
      boundaryEdges: V8BoundaryEvidence[];
      unresolvedBoundaries: Array<{ edge: number; reason: string }>;
      geometryStatus: string;
      verificationLevel: string;
      passabilityStatus: string;
    }>;
    entranceHalls: unknown[];
    geometryStatus: string;
    unresolvedObjects: unknown[];
  };
  arena: {
    courtBoundaryCandidates: ArchitectureV7['arena']['courtBoundaries'];
    seatFootprintCandidates: ArchitectureV7['arena']['seatFootprints'];
    standTraceCandidates: ArchitectureV7['arena']['standTraces'];
    boundaryTraceCandidates: ArchitectureV7['arena']['arenaBoundaryTraces'];
    semanticRegions: Array<{ id: string; type: string; geometry: PolygonGeometry; sourcePathIDs: string[]; status: string; verificationLevel: string }>;
    seatFootprintClusters: Array<{ id: string; type: string; geometry: { type: 'MultiPolygon'; coordinates: PdfPoint[][][] }; seatCount: number; sourcePathIDs: string[]; clusteringTolerancePt: number; toleranceUsedOnlyForConnectivity: boolean; status: string; verificationLevel: string; note: string }>;
    ringCorridor: null;
    unresolved: Array<{ id: string; reason: string }>;
  };
  coverage: Record<string, any>;
};
