import * as THREE from 'three';
import type { ArchitectureV7, PdfPoint } from '../../types/architecture';
import { pdfDisplayPtToWorldXZ } from '../../data/canonicalGeometry';

export type V7SceneLayers = {
  traces: THREE.Group;
  wallFaces: THREE.Group;
  arena: THREE.Group;
  candidates: THREE.Group;
  labels: THREE.Group;
  selectable: Map<string, THREE.Object3D>;
};

function shapeFromRing(ring: PdfPoint[]) {
  const shape = new THREE.Shape();
  ring.forEach((point, index) => {
    const [x, z] = pdfDisplayPtToWorldXZ(point);
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  return shape;
}

function addLine(positions: number[], line: PdfPoint[], model: ArchitectureV7, y: number) {
  for (let index = 1; index < line.length; index += 1) {
    const [ax, az] = pdfDisplayPtToWorldXZ(line[index - 1]);
    const [bx, bz] = pdfDisplayPtToWorldXZ(line[index]);
    positions.push(ax, y, az, bx, y, bz);
  }
}

function lineMesh(positions: number[], color: number, opacity = 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }));
}

export function createArchitecturalSceneV7(model: ArchitectureV7): V7SceneLayers {
  const traces = new THREE.Group();
  const wallFaces = new THREE.Group();
  const arena = new THREE.Group();
  const candidates = new THREE.Group();
  const labels = new THREE.Group();
  const selectable = new Map<string, THREE.Object3D>();

  const traceGroups = new Map<string, number[]>();
  for (const trace of model.wallNetwork.traceObjects) {
    const rows = traceGroups.get(trace.wallType) ?? [];
    addLine(rows, trace.geometry.coordinates, model, 0.035);
    traceGroups.set(trace.wallType, rows);
  }
  const traceColors: Record<string, number> = { 'Existing Wall': 0x31413b, 'New Partition': 0xb8753d, 'Architectural Wall': 0x73877d };
  for (const [wallType, points] of traceGroups) traces.add(lineMesh(points, traceColors[wallType] ?? 0x52635d, 0.94));

  const wallMaterials = {
    existing: new THREE.MeshStandardMaterial({ color: 0x63716c, roughness: 0.88, side: THREE.DoubleSide }),
    structure: new THREE.MeshStandardMaterial({ color: 0x35433e, roughness: 0.9, side: THREE.DoubleSide }),
    partition: new THREE.MeshStandardMaterial({ color: 0xb78c67, roughness: 0.9, side: THREE.DoubleSide }),
  };
  for (const face of model.wallNetwork.wallFaceCandidates.filter(item => item.wallType !== 'New Partition')) {
    const ring = face.geometry.coordinates[0];
    if (ring.length < 4) continue;
    const height = model.illustrative3D.wallHeightM;
    const geometry = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth: height, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const material = face.wallType === 'Existing Wall' ? wallMaterials.existing : wallMaterials.structure;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height;
    mesh.userData.sourcePathID = face.sourcePathID;
    mesh.userData.geometryStatus = face.geometryStatus;
    wallFaces.add(mesh);
  }
  for (const face of model.wallNetwork.wallFaceCandidates.filter(item => item.wallType === 'New Partition')) {
    const ring = face.geometry.coordinates[0];
    const height = model.illustrative3D.wallHeightM;
    const geometry = new THREE.ExtrudeGeometry(shapeFromRing(ring), { depth: height, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, wallMaterials.partition);
    mesh.position.y = height;
    mesh.userData.sourcePathID = face.sourcePathID;
    wallFaces.add(mesh);
  }

  const courtPositions: number[] = [];
  for (const item of model.arena.courtBoundaries) {
    addLine(courtPositions, item.geometry.coordinates[0], model, 0.08);
  }
  arena.add(lineMesh(courtPositions, 0x567f79, 1));

  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0x9a7758, roughness: 0.76, side: THREE.DoubleSide });
  for (const seat of model.arena.seatFootprints) {
    const geometry = new THREE.ExtrudeGeometry(shapeFromRing(seat.geometry.coordinates[0]), {
      depth: model.illustrative3D.seatStepHeightM, bevelEnabled: false,
    });
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, seatMaterial);
    mesh.position.y = model.illustrative3D.seatStepHeightM;
    mesh.userData.sourcePathID = seat.sourcePathID;
    arena.add(mesh);
  }
  const arenaPositions: number[] = [];
  for (const trace of [...model.arena.standTraces, ...model.arena.arenaBoundaryTraces]) {
    addLine(arenaPositions, trace.geometry.coordinates, model, 0.09);
  }
  arena.add(lineMesh(arenaPositions, 0x7d7468, 0.72));

  for (const space of model.spaces.filter(item => item.geometry)) {
    const geometry = new THREE.ShapeGeometry(shapeFromRing(space.geometry!.coordinates[0]));
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xf2a64a, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.12;
    mesh.userData.spaceID = space.spaceID;
    mesh.userData.roomID = space.sourceRoomID;
    candidates.add(mesh);
    selectable.set(space.spaceID, mesh);
  }

  const labelPoints: number[] = [];
  for (const space of model.spaces) {
    const [x, z] = pdfDisplayPtToWorldXZ(space.sourceLabelPt);
    labelPoints.push(x, 0.14, z);
  }
  const labelGeometry = new THREE.BufferGeometry();
  labelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(labelPoints, 3));
  const labelMaterial = new THREE.PointsMaterial({ color: 0x234a43, size: 1.45, sizeAttenuation: true, depthTest: false });
  const pointCloud = new THREE.Points(labelGeometry, labelMaterial);
  pointCloud.renderOrder = 8;
  pointCloud.userData.roomIDs = model.spaces.map(space => space.sourceRoomID);
  labels.add(pointCloud);
  selectable.set('source-labels', pointCloud);

  return { traces, wallFaces, arena, candidates, labels, selectable };
}

export function disposeArchitecturalLayers(layers: V7SceneLayers) {
  const seenGeometry = new Set<THREE.BufferGeometry>();
  const seenMaterial = new Set<THREE.Material>();
  for (const root of [layers.traces, layers.wallFaces, layers.arena, layers.candidates, layers.labels]) {
    root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
        if (!seenGeometry.has(object.geometry)) { object.geometry.dispose(); seenGeometry.add(object.geometry); }
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) if (!seenMaterial.has(material)) { material.dispose(); seenMaterial.add(material); }
      }
    });
  }
}
