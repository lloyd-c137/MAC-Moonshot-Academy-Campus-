import * as THREE from 'three';
import { CAMPUS_SPACES } from '../../data/floorplanData';
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
  const scale = 0.5; // 1 unit in 3D = 2 units in plan
  return {
    x: (x - 500) * scale,
    z: (y - 431.75) * scale,
  };
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
      // Build arena floor surface for clicking
      const courtShape = new THREE.Shape();
      const firstPt = planToWorld(space.polygon[0].x, space.polygon[0].y);
      courtShape.moveTo(firstPt.x, -firstPt.z);
      for (let i = 1; i < space.polygon.length; i++) {
        const pt = planToWorld(space.polygon[i].x, space.polygon[i].y);
        courtShape.lineTo(pt.x, -pt.z);
      }
      courtShape.closePath();

      const floorGeo = new THREE.ShapeGeometry(courtShape);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xc98d50,
        roughness: 0.35,
      });
      const arenaFloorMesh = new THREE.Mesh(floorGeo, floorMat);
      arenaFloorMesh.position.y = 0.15;
      arenaFloorMesh.receiveShadow = true;
      arenaFloorMesh.userData = { spaceId: space.id };
      rootGroup.add(arenaFloorMesh);
      floorMeshes.set(space.id, arenaFloorMesh);
      pickingMeshes.push(arenaFloorMesh);
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
    const mergedGeometry = (THREE as any).BufferGeometryUtils?.mergeGeometries
      ? (THREE as any).BufferGeometryUtils.mergeGeometries(wallGeometries)
      : mergeGeometriesFallback(wallGeometries);

    const wallsMesh = new THREE.Mesh(mergedGeometry, WALL_MATERIAL);
    wallsMesh.castShadow = true;
    wallsMesh.receiveShadow = true;
    wallGroup.add(wallsMesh);
  }

  // 5. Reconstruct Central Lotus Arena (Real 3D Amphitheater Architecture)
  buildLotusArenaArchitecture(arenaGroup);

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

// Detailed architectural reconstruction of Lotus Arena
function buildLotusArenaArchitecture(group: THREE.Group) {
  // A. Maple Basketball Court (Center of arena)
  const courtLinesCanvas = document.createElement('canvas');
  courtLinesCanvas.width = 1024;
  courtLinesCanvas.height = 640;
  const ctx = courtLinesCanvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#C88C4B'; // Warm maple court floor
    ctx.fillRect(0, 0, 1024, 640);

    // Subtle parquet board lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1024; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 640);
      ctx.stroke();
    }

    // Court boundaries
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, 944, 560);

    // Half court line
    ctx.beginPath();
    ctx.moveTo(512, 40);
    ctx.lineTo(512, 600);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(512, 320, 85, 0, Math.PI * 2);
    ctx.stroke();

    // Key areas & free throw circles
    ctx.strokeRect(40, 210, 180, 220);
    ctx.beginPath();
    ctx.arc(220, 320, 85, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.strokeRect(804, 210, 180, 220);
    ctx.beginPath();
    ctx.arc(804, 320, 85, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();

    // 3-point arcs
    ctx.beginPath();
    ctx.arc(130, 320, 230, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(894, 320, 230, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();
  }

  const courtTex = new THREE.CanvasTexture(courtLinesCanvas);
  courtTex.colorSpace = THREE.SRGBColorSpace;
  const courtGeo = new THREE.BoxGeometry(68, 0.4, 42);
  const courtMat = new THREE.MeshStandardMaterial({
    map: courtTex,
    roughness: 0.35,
    metalness: 0.05,
  });
  const courtMesh = new THREE.Mesh(courtGeo, courtMat);
  courtMesh.position.set(0, 0.25, 0);
  courtMesh.receiveShadow = true;
  group.add(courtMesh);

  // B. 3D Tiered Spectator Stands (4 concentric amphitheater seating steps)
  // Each step rises gradually around the central playing floor
  const STEP_COUNT = 4;
  for (let s = 1; s <= STEP_COUNT; s++) {
    const stepInnerR = 36 + (s - 1) * 7.5;
    const stepOuterR = 36 + s * 7.5;
    const stepHeight = 1.6;
    const stepY = (s - 1) * stepHeight + 0.3;

    // Build 8-sided ring segment for this tier
    const shape = new THREE.Shape();
    // Outer polygon
    for (let a = 0; a < 8; a++) {
      const angle = (a * Math.PI) / 4 + Math.PI / 8;
      const x = Math.cos(angle) * stepOuterR * 1.08;
      const z = Math.sin(angle) * stepOuterR;
      if (a === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    shape.closePath();

    // Inner hole
    const holePath = new THREE.Path();
    for (let a = 0; a < 8; a++) {
      const angle = (a * Math.PI) / 4 + Math.PI / 8;
      const x = Math.cos(angle) * stepInnerR * 1.08;
      const z = Math.sin(angle) * stepInnerR;
      if (a === 0) holePath.moveTo(x, z);
      else holePath.lineTo(x, z);
    }
    holePath.closePath();
    shape.holes.push(holePath);

    const tierGeo = new THREE.ExtrudeGeometry(shape, {
      depth: stepHeight,
      bevelEnabled: false,
    });
    tierGeo.rotateX(Math.PI / 2);

    const tierMesh = new THREE.Mesh(tierGeo, BLEACHER_MAT);
    tierMesh.position.y = stepY + stepHeight;
    tierMesh.castShadow = true;
    tierMesh.receiveShadow = true;
    group.add(tierMesh);

    // Add modular spectator seats on each tier
    const seatR = (stepInnerR + stepOuterR) / 2;
    const seatCount = 24 + s * 4;
    for (let i = 0; i < seatCount; i++) {
      // Leave passage openings for access aisles at cardinals (North, South, East, West)
      const aNorm = (i / seatCount) * Math.PI * 2;
      const isAisle =
        Math.abs(Math.sin(aNorm)) < 0.15 || Math.abs(Math.cos(aNorm)) < 0.15;
      if (isAisle) continue;

      const sx = Math.cos(aNorm) * seatR * 1.08;
      const sz = Math.sin(aNorm) * seatR;
      const seatBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.6, 1.2),
        BLEACHER_SEAT_MAT
      );
      seatBox.position.set(sx, stepY + stepHeight + 0.3, sz);
      seatBox.rotation.y = -aNorm + Math.PI / 2;
      group.add(seatBox);
    }
  }

  // C. Lotus Arena Outer Polygonal Colonnade Wall with Portal Openings
  const outerRadius = 72;
  const arenaWallHeight = 10.0;
  for (let a = 0; a < 8; a++) {
    const angle1 = (a * Math.PI) / 4 + Math.PI / 8;
    const angle2 = ((a + 1) * Math.PI) / 4 + Math.PI / 8;

    const p1 = {
      x: Math.cos(angle1) * outerRadius * 1.08,
      z: Math.sin(angle1) * outerRadius,
    };
    const p2 = {
      x: Math.cos(angle2) * outerRadius * 1.08,
      z: Math.sin(angle2) * outerRadius,
    };

    // Open portal passages on East, West, North, South
    const midAngle = (angle1 + angle2) / 2;
    const isMajorExit =
      Math.abs(Math.sin(midAngle)) < 0.35 || Math.abs(Math.cos(midAngle)) < 0.35;

    const segGeos = createWallSegment(
      p1,
      p2,
      arenaWallHeight,
      1.8,
      isMajorExit
        ? {
            x: (p1.x + p2.x) / 2,
            z: (p1.z + p2.z) / 2,
            width: 14.0, // Wide architectural arena portal
          }
        : undefined
    );

    segGeos.forEach((g) => {
      const w = new THREE.Mesh(g, WALL_MATERIAL);
      w.castShadow = true;
      w.receiveShadow = true;
      group.add(w);
    });
  }

  // D. Floating Arena Center Scoreboard / Jumbotron (Iconic visual anchor)
  const jumbotronGeo = new THREE.BoxGeometry(14, 5, 10);
  const jumbotronMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
  });
  const jumbotron = new THREE.Mesh(jumbotronGeo, jumbotronMat);
  jumbotron.position.set(0, 18, 0);

  // Scoreboard glow screen
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
  const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.5), screenMat);
  screen1.position.set(0, 0, 5.05);
  jumbotron.add(screen1);

  const screen2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.5), screenMat);
  screen2.rotation.y = Math.PI;
  screen2.position.set(0, 0, -5.05);
  jumbotron.add(screen2);

  // Suspension cables
  const cableMat = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
  const cableCorners = [
    [-6, 4.5],
    [6, 4.5],
    [-6, -4.5],
    [6, -4.5],
  ];
  cableCorners.forEach(([cx, cz]) => {
    const pts = [new THREE.Vector3(cx, 18, cz), new THREE.Vector3(cx * 1.5, 30, cz * 1.5)];
    const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat);
    group.add(cable);
  });

  group.add(jumbotron);
}
