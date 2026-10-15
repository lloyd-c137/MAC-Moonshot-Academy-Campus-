import * as THREE from 'three';
import type { ArchitectureV7, PdfPoint } from '../../types/architecture';
import type { ArchitectureV8 } from '../../types/architectureV8';
import { pdfDisplayPtToWorldXZ } from '../../data/canonicalGeometry';
import { createArchitecturalSceneV7, disposeArchitecturalLayers, type V7SceneLayers } from './architecturalSceneV7';

type V9Model = ArchitectureV8 & {
  wallNetwork: ArchitectureV8['wallNetwork'] & {
    semanticObjects: Array<{ id: string; geometry: { type: 'MultiLineString'; coordinates: PdfPoint[][] }; sourcePathID: string; layerSemantic: string }>;
    semanticFaces: Array<{ id: string; geometry: { type: 'Polygon'; coordinates: PdfPoint[][] }; sourcePathID: string }>;
  };
};

function lineLayer(lines: PdfPoint[][], color: number) {
  const positions: number[] = [];
  for (const line of lines) for (let i = 1; i < line.length; i += 1) {
    const [ax, az] = pdfDisplayPtToWorldXZ(line[i - 1]);
    const [bx, bz] = pdfDisplayPtToWorldXZ(line[i]);
    positions.push(ax, 0.04, az, bx, 0.04, bz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const group = new THREE.Group();
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false })));
  return group;
}

function faceShape(ring: PdfPoint[]) {
  const shape = new THREE.Shape();
  ring.forEach((pt, i) => {
    const [x, z] = pdfDisplayPtToWorldXZ(pt);
    if (!i) shape.moveTo(x, z); else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function clearLayer(group: THREE.Group) {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  group.clear();
}

/** Reuses V7 floor/arena/picking geometry, replacing raw wall rendering with V9 topology-linked source objects. */
export function createArchitecturalSceneV9(model: V9Model): V7SceneLayers {
  const adapted = {
    ...model,
    modelID: 'FF01-ARCHITECTURE-V7',
    arena: {
      courtBoundaries: model.arena.courtBoundaryCandidates,
      seatFootprints: model.arena.seatFootprintCandidates,
      standTraces: model.arena.standTraceCandidates,
      arenaBoundaryTraces: model.arena.boundaryTraceCandidates,
      ringCorridor: null,
    },
  } as unknown as ArchitectureV7;
  const layers = createArchitecturalSceneV7(adapted);
  clearLayer(layers.traces);
  clearLayer(layers.wallFaces);
  const byType = new Map<string, PdfPoint[][]>();
  for (const wall of model.wallNetwork.semanticObjects) {
    const rows = byType.get(wall.layerSemantic) ?? [];
    rows.push(...wall.geometry.coordinates);
    byType.set(wall.layerSemantic, rows);
  }
  const colors: Record<string, number> = { 'Existing Wall': 0x34443e, 'Structural Wall / Column': 0x263831, 'New Partition': 0xa86f46, 'Architectural Wall': 0x66776e };
  for (const [type, lines] of byType) layers.traces.add(lineLayer(lines, colors[type] ?? 0x54645d));
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x48564e, roughness: 0.9, side: THREE.DoubleSide });
  for (const face of model.wallNetwork.semanticFaces) {
    const geometry = new THREE.ExtrudeGeometry(faceShape(face.geometry.coordinates[0]), { depth: model.illustrative3D.wallHeightM, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, wallMaterial);
    mesh.position.y = model.illustrative3D.wallHeightM;
    mesh.userData.sourcePathID = face.sourcePathID;
    mesh.userData.semanticStatus = 'SOURCE_WALL_FACE_CANDIDATE_UNVERIFIED';
    layers.wallFaces.add(mesh);
  }
  return layers;
}

export function disposeArchitecturalSceneV9(layers: V7SceneLayers) {
  disposeArchitecturalLayers(layers);
}
