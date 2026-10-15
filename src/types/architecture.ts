export type PdfPoint = [x: number, y: number];
export type WorldPoint = [x: number, z: number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: PdfPoint[][] };
export type LineGeometry = { type: 'LineString'; coordinates: PdfPoint[] };

export interface ProvenancedTrace {
  id: string;
  geometry: LineGeometry;
  wallType: string;
  sourcePathID: string;
  sourceLayer: string;
  classification: string;
  geometryStatus: 'TRACE_ONLY';
  verificationLevel: 'UNVERIFIED';
}

export interface WallFaceCandidate {
  id: string;
  geometry: PolygonGeometry;
  wallType: string;
  sourcePathID: string;
  sourceLayer: string;
  classification: string;
  geometryStatus: 'CANDIDATE';
  verificationLevel: 'UNVERIFIED';
  faceAreaM2?: number;
}

export interface CanonicalSpace {
  spaceID: string;
  sourceRoomID: string;
  baseRoomCode: string;
  sourceLabel: string;
  sourceLabelPt: PdfPoint;
  geometry: PolygonGeometry | null;
  sourcePathIDs: string[];
  areaAnnotation: string | null;
  areaM2: number | null;
  geometryStatus: 'CANDIDATE' | 'UNRESOLVED';
  verificationLevel: 'UNVERIFIED';
  unresolvedEdges: unknown[];
}

export interface ArchitectureV7 {
  schemaVersion: 1;
  modelID: 'FF01-ARCHITECTURE-V7';
  modelStatus: string;
  sourceMetadata: {
    sourcePdfSha256: string;
    drawingID: string;
    sourceModelVersion: string;
    coordinateSystemVersion: string;
    generatedAt: string;
  };
  coordinateSystem: {
    id: string;
    pageSizePt: [number, number];
    metresPerPdfPoint: number;
    worldOriginPdfPt: PdfPoint;
    worldAxes: { x: string; y: string; z: string };
  };
  buildingFootprint: { geometry: null; geometryStatus: string; unresolvedBoundaries: unknown[] };
  wallNetwork: { traceObjects: ProvenancedTrace[]; wallFaceCandidates: WallFaceCandidate[]; counts: Record<string, number> };
  spaces: CanonicalSpace[];
  circulation: { corridors: unknown[]; entranceHalls: unknown[]; geometryStatus: string };
  arena: {
    courtBoundaries: { id: string; geometry: PolygonGeometry; sourcePathID: string; sourceLayer: string }[];
    seatFootprints: { id: string; geometry: PolygonGeometry; sourcePathID: string; sourceLayer: string }[];
    standTraces: { id: string; geometry: LineGeometry; sourcePathID: string; sourceLayer: string }[];
    arenaBoundaryTraces: { id: string; geometry: LineGeometry; sourcePathID: string; sourceLayer: string }[];
    ringCorridor: null;
  };
  coverage: Record<string, unknown>;
  illustrative3D: { wallHeightM: number; seatStepHeightM: number; parametersAreMeasured: false };
}
