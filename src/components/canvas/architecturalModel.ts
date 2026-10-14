import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { planToWorld as toWorld } from '../../data/spatialPlan';
import { CampusSpace, Point2D } from '../../types/campus';

export interface ModelBuildResult {
  rootGroup: THREE.Group;
  floorMeshes: Map<string, THREE.Mesh>;
  wallGroup: THREE.Group;
  arenaGroup: THREE.Group;
  pickingMeshes: THREE.Mesh[];
}

// Convert 2D plan coordinates (0..1000, 0..863.5) to Three.js world coordinates
export function planToWorld(x: number, y: number): { x: number; z: number } {
  return toWorld({ x, y });
}

// Reusable standard materials
const WALL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xe8e5de, // Warm architectural off-white plaster
  roughness: 0.8,
  metalness: 0.05,
});

const WALL_TOP_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xd2cdc2, // Slightly darker top rim cap for depth definition
  roughness: 0.7,
  metalness: 0.08,
});

const CORRIDOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xf5f3ee, // Polished terrazzo / light concrete floor
  roughness: 0.85,
  metalness: 0.02,
});

const COURTYARD_GRASS_MAT = new THREE.MeshStandardMaterial({
  color: 0x8cc67c, // Fresh garden lawn
  roughness: 0.9,
});

const BLEACHER_MAT = new THREE.MeshStandardMaterial({
  color: 0xc8c4ba, // Light architectural precast concrete
  roughness: 0.75,
});

const BLEACHER_SEAT_MAT = new THREE.MeshStandardMaterial({
  color: 0x3b82f6, // Navy blue spectator seats
  roughness: 0.6,
});

// Helper: build a 3D wall segment box between two points with thickness and door gap
function createWallSegment(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  height: number,
  thickness: number,
  doorOpening?: { x: number; z: number; width: number }
): THREE.BufferGeometry[] {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.2) return [];

  const angle = Math.atan2(dz, dx);
  const midX = (p1.x + p2.x) / 2;
  const midZ = (p1.z + p2.z) / 2;

  // Check if doorOpening lies on or very close to this segment
  if (doorOpening) {
    // Project door point onto segment line
    const t = ((doorOpening.x - p1.x) * dx + (doorOpening.z - p1.z) * dz) / (length * length);
    if (t > 0.2 && t < 0.8) {
      // Split wall into two sub-segments leaving a door gap
      const doorWidth = Math.min(doorOpening.width, length * 0.4);
      const doorDist = t * length;
      const leftLen = Math.max(0.5, doorDist - doorWidth / 2);
      const rightLen = Math.max(0.5, length - (doorDist + doorWidth / 2));

      // Left piece
      const leftP1 = p1;
      const leftP2 = {
        x: p1.x + (dx / length) * leftLen,
        z: p1.z + (dz / length) * leftLen,
      };

      // Right piece
      const rightP1 = {
        x: p1.x + (dx / length) * (doorDist + doorWidth / 2),
        z: p1.z + (dz / length) * (doorDist + doorWidth / 2),
      };
      const rightP2 = p2;

      const leftGeo = new THREE.BoxGeometry(leftLen, height, thickness);
      leftGeo.rotateY(-angle);
      leftGeo.translate(
        (leftP1.x + leftP2.x) / 2,
        height / 2,
        (leftP1.z + leftP2.z) / 2
      );

      const rightGeo = new THREE.BoxGeometry(rightLen, height, thickness);
      rightGeo.rotateY(-angle);
      rightGeo.translate(
        (rightP1.x + rightP2.x) / 2,
        height / 2,
        (rightP1.z + rightP2.z) / 2
      );

      return [leftGeo, rightGeo];
    }
  }

  // Solid continuous segment
  const geo = new THREE.BoxGeometry(length, height, thickness);
  geo.rotateY(-angle);
  geo.translate(midX, height / 2, midZ);
  return [geo];
}

// Generate the complete architectural cutaway campus model
export function buildArchitecturalModel(): ModelBuildResult {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'CampusArchitecturalModel';

  const floorMeshes = new Map<string, THREE.Mesh>();
  const pickingMeshes: THREE.Mesh[] = [];
  const wallGroup = new THREE.Group();
  wallGroup.name = 'ArchitecturalWalls';
  rootGroup.add(wallGroup);

  const arenaGroup = new THREE.Group();
  arenaGroup.name = 'LotusArenaStructuralDetails';
  rootGroup.add(arenaGroup);

  // 1. Foundation Slab Plinth (Base podium)
  const baseGeo = new THREE.BoxGeometry(530, 4, 440);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xe6e3dc,
    roughness: 0.9,
    metalness: 0.04,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.set(0, -2, 0);
  baseMesh.receiveShadow = true;
  rootGroup.add(baseMesh);

  // 2. Continuous Hallway / Walkable Corridor Base (Level Y = 0.05)
  const corridorPlaneGeo = new THREE.PlaneGeometry(500, 410);
  const corridorMesh = new THREE.Mesh(corridorPlaneGeo, CORRIDOR_MATERIAL);
  corridorMesh.rotation.x = -Math.PI / 2;
  corridorMesh.position.y = 0.05;
  corridorMesh.receiveShadow = true;
  rootGroup.add(corridorMesh);

  // Collect wall geometries for merged efficient rendering
  const wallGeometries: THREE.BufferGeometry[] = [];
  const WALL_HEIGHT = 10.0;
  const WALL_THICKNESS = 1.4;

  // 3. Construct Rooms (Hollow Floor + Surrounding 3D Walls with Doors)
  CAMPUS_SPACES.forEach((space) => {
    // Special handling for central Lotus Arena (built with custom amphitheater architecture below)
    if (space.id === 'ARENA-01') {
      return;
    }

    // A. Hollow Room Floor Surface
    const shape = new THREE.Shape();
    const wPoints = space.polygon.map((p) => planToWorld(p.x, p.y));
    shape.moveTo(wPoints[0].x, -wPoints[0].z);
    for (let i = 1; i < wPoints.length; i++) {
      shape.lineTo(wPoints[i].x, -wPoints[i].z);
    }
    shape.closePath();

    const floorGeo = new THREE.ShapeGeometry(shape);
    floorGeo.rotateX(-Math.PI / 2);

    const isCourtyard = space.category === 'courtyard';
    const floorMat = new THREE.MeshStandardMaterial({
      color: isCourtyard ? 0x8cc67c : 0xffffff,
      roughness: isCourtyard ? 0.95 : 0.65,
      metalness: 0.02,
    });

    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = isCourtyard ? 0.08 : 0.12;
    floorMesh.receiveShadow = true;
    floorMesh.userData = { spaceId: space.id };
    rootGroup.add(floorMesh);
    floorMeshes.set(space.id, floorMesh);
    pickingMeshes.push(floorMesh);

    // B. Real 3D Extruded Wall Segments around room boundary
    if (!isCourtyard) {
      const doorW = planToWorld(space.doorPoint.x, space.doorPoint.y);
      for (let i = 0; i < wPoints.length; i++) {
        const p1 = wPoints[i];
        const p2 = wPoints[(i + 1) % wPoints.length];
        const segGeos = createWallSegment(p1, p2, WALL_HEIGHT, WALL_THICKNESS, {
          x: doorW.x,
          z: doorW.z,
          width: 7.0, // verified door gap width
        });
        wallGeometries.push(...segGeos);
      }
    } else {
      // Courtyard has low decorative planter edge (height 2.0)
      for (let i = 0; i < wPoints.length; i++) {
        const p1 = wPoints[i];
        const p2 = wPoints[(i + 1) % wPoints.length];
        const segGeos = createWallSegment(p1, p2, 2.0, 1.2);
        wallGeometries.push(...segGeos);
      }

      // Add a couple of stylized miniature courtyard trees
      const treeCount = 3;
      for (let t = 0; t < treeCount; t++) {
        const treeGroup = new THREE.Group();
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4.0, 6);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x85583b, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2.0;

        const foliageGeo = new THREE.DodecahedronGeometry(2.4, 1);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x489643, roughness: 0.85 });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = 4.8;
        foliage.castShadow = true;

        treeGroup.add(trunk);
        treeGroup.add(foliage);

        const centerW = planToWorld(space.center.x, space.center.y);
        const offsetX = (t - 1) * 7.0;
        const offsetZ = Math.sin(t) * 3.0;
        treeGroup.position.set(centerW.x + offsetX, 0, centerW.z + offsetZ);
        rootGroup.add(treeGroup);
      }
    }
  });

  // 4. Merge wall geometries into a single high-performance mesh
  if (wallGeometries.length > 0) {
    const mergedGeometry = mergeGeometries(wallGeometries, false) ?? mergeGeometriesFallback(wallGeometries);
    wallGeometries.forEach((geometry) => geometry.dispose());

    const wallsMesh = new THREE.Mesh(mergedGeometry, WALL_MATERIAL);
    wallsMesh.castShadow = true;
    wallsMesh.receiveShadow = true;
    wallGroup.add(wallsMesh);
  }

  // 5. Reconstruct Central Lotus Arena (Real 3D Amphitheater Architecture)
  const arenaCenter = planToWorld(500, 432);
  arenaGroup.position.set(arenaCenter.x, 0, arenaCenter.z);
  const arenaCourt = buildLotusArenaArchitecture(arenaGroup);
  arenaCourt.userData = { spaceId: 'ARENA-01' };
  floorMeshes.set('ARENA-01', arenaCourt);
  pickingMeshes.push(arenaCourt);

  return {
    rootGroup,
    floorMeshes,
    wallGroup,
    arenaGroup,
    pickingMeshes,
  };
}

// Fallback geometry merger if BufferGeometryUtils is not imported
function mergeGeometriesFallback(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();
  const posArrays: number[] = [];
  const normArrays: number[] = [];

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    if (!pos) continue;

    for (let i = 0; i < pos.count; i++) {
      posArrays.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) {
        normArrays.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      } else {
        normArrays.push(0, 1, 0);
      }
    }
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(posArrays, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normArrays, 3));
  return merged;
}

// Source-shaped arena study: portrait court, two side stands, and a polygonal ring.
// Dimensions are schematic until the CAD wall and aisle vectors are traced.
function buildLotusArenaArchitecture(group: THREE.Group): THREE.Mesh {
  // A. Maple Basketball Court (Center of arena)
  const courtLinesCanvas = document.createElement('canvas');
  courtLinesCanvas.width = 512;
  courtLinesCanvas.height = 1024;
  const ctx = courtLinesCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#C88C4B';
    ctx.fillRect(0, 0, 512, 1024);

    // Subtle parquet board lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 1024; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Court boundaries
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 10;
    ctx.strokeRect(24, 24, 464, 976);

    // Half court line
    ctx.beginPath();
    ctx.moveTo(24, 512);
    ctx.lineTo(488, 512);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(256, 512, 68, 0, Math.PI * 2);
    ctx.stroke();

    // Key areas & free throw circles
    ctx.strokeRect(118, 24, 276, 150);
    ctx.beginPath();
    ctx.arc(256, 174, 68, 0, Math.PI);
    ctx.stroke();

    ctx.strokeRect(118, 850, 276, 150);
    ctx.beginPath();
    ctx.arc(256, 850, 68, Math.PI, Math.PI * 2);
    ctx.stroke();

    // 3-point arcs
    ctx.beginPath();
    ctx.arc(256, 75, 250, 0, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(256, 949, 250, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  const courtTex = new THREE.CanvasTexture(courtLinesCanvas);
  courtTex.colorSpace = THREE.SRGBColorSpace;
  const courtGeo = new THREE.BoxGeometry(54, 0.4, 104);
  const courtMat = new THREE.MeshStandardMaterial({
    map: courtTex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const courtMesh = new THREE.Mesh(courtGeo, courtMat);
  courtMesh.position.set(0, 0.22, 0);
  courtMesh.receiveShadow = true;
  group.add(courtMesh);

  // B. Seating is shown only on the two sides drawn in FF-01. Heights are illustrative.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      const rowDepth = 4.8;
      const x = side * (29 + (row + 0.5) * rowDepth);
      const y = 0.55 + row * 0.8;
      for (const z of [-25, 25]) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(rowDepth, 1.1, 38), BLEACHER_MAT);
        step.position.set(x, y, z);
        step.castShadow = true;
        step.receiveShadow = true;
        group.add(step);

        const seat = new THREE.Mesh(new THREE.BoxGeometry(rowDepth * 0.72, 0.45, 30), BLEACHER_SEAT_MAT);
        seat.position.set(x, y + 0.78, z);
        group.add(seat);
      }
    }
  }

  // C. Walkable arena ring with clipped corners; the exact wall trace remains illustrative.
  const outer = [[-90, -180], [90, -180], [145, -115], [145, 115], [90, 180], [-90, 180], [-145, 115], [-145, -115]];
  const inner = [[-76, -142], [76, -142], [94, -112], [94, 112], [76, 142], [-76, 142], [-94, 112], [-94, -112]];
  const ringShape = new THREE.Shape();
  outer.forEach(([x, z], index) => index ? ringShape.lineTo(x, -z) : ringShape.moveTo(x, -z));
  ringShape.closePath();
  const ringHole = new THREE.Path();
  inner.forEach(([x, z], index) => index ? ringHole.lineTo(x, -z) : ringHole.moveTo(x, -z));
  ringHole.closePath();
  ringShape.holes.push(ringHole);
  const ring = new THREE.Mesh(new THREE.ShapeGeometry(ringShape), CORRIDOR_MATERIAL);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  ring.receiveShadow = true;
  group.add(ring);

  return courtMesh;
}
