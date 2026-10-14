import { NavigationNode, NavigationEdge, NavigationRoute } from '../types/campus';
import { CAMPUS_SPACES } from '../data/floorplanData';

// Core Walkable Circulation Nodes based on Architectural Plan FF-01
export const NAVIGATION_NODES: NavigationNode[] = [
  // 1. Major Entrances
  { id: 'NODE-ENT-WEST', name: '西入口门厅', x: 62, y: 432, type: 'entrance', accessible: true },
  { id: 'NODE-ENT-EAST', name: '东入口门厅', x: 938, y: 410, type: 'entrance', accessible: true },
  { id: 'NODE-ENT-SOUTH', name: '南入口门厅', x: 500, y: 718, type: 'entrance', accessible: true },

  // 2. West Wing Circulation Spine (X=300 corridor)
  { id: 'NODE-WEST-N1', name: '西区北走廊 (M100/M103)', x: 300, y: 160, type: 'corridor', accessible: true },
  { id: 'NODE-WEST-N2', name: '西区创客走廊 (M104/M102)', x: 300, y: 260, type: 'corridor', accessible: true },
  { id: 'NODE-WEST-MID', name: '西区中央走廊交叉口', x: 300, y: 432, type: 'intersection', accessible: true },
  { id: 'NODE-WEST-S1', name: '西区实验走廊北 (M118/M124)', x: 300, y: 560, type: 'corridor', accessible: true },
  { id: 'NODE-WEST-S2', name: '西区科学走廊南 (M126/M127)', x: 300, y: 690, type: 'corridor', accessible: true },
  { id: 'NODE-WEST-S3', name: '西区音乐计算走廊 (M128/M129)', x: 300, y: 790, type: 'corridor', accessible: true },

  // 3. Central Arena Ring Corridor (Circulating around Lotus Arena)
  { id: 'NODE-RING-N', name: '球场北环廊 (S100/S407)', x: 500, y: 290, type: 'corridor', accessible: true },
  { id: 'NODE-RING-NW', name: '球场西北环廊 (S404/S405)', x: 410, y: 340, type: 'corridor', accessible: true },
  { id: 'NODE-RING-W', name: '球场西环廊 (S205)', x: 360, y: 432, type: 'corridor', accessible: true },
  { id: 'NODE-RING-SW', name: '球场西南环廊 (S203/S204)', x: 410, y: 510, type: 'corridor', accessible: true },
  { id: 'NODE-RING-S', name: '球场南环廊 (S104/S202)', x: 500, y: 580, type: 'corridor', accessible: true },
  { id: 'NODE-RING-SE', name: '球场东南环廊 (S101)', x: 590, y: 510, type: 'corridor', accessible: true },
  { id: 'NODE-RING-E', name: '球场东环廊', x: 640, y: 432, type: 'corridor', accessible: true },
  { id: 'NODE-RING-NE', name: '球场东北环廊', x: 590, y: 340, type: 'corridor', accessible: true },

  // Arena Main Court Access Gate
  { id: 'NODE-ARENA-GATE', name: '莲花球场主通道口', x: 500, y: 512, type: 'door', accessible: true },

  // 4. East Wing Circulation Spine (X=680-700 corridor)
  { id: 'NODE-EAST-N1', name: '东区餐厅走廊 (A114/A115)', x: 700, y: 220, type: 'corridor', accessible: true },
  { id: 'NODE-EAST-N2', name: '东区科创走廊 (A111/A112)', x: 700, y: 310, type: 'corridor', accessible: true },
  { id: 'NODE-EAST-MID', name: '东区中央通道枢纽', x: 700, y: 410, type: 'intersection', accessible: true },
  { id: 'NODE-EAST-S1', name: '东区幼小部走廊 (A221/A222)', x: 700, y: 480, type: 'corridor', accessible: true },
  { id: 'NODE-EAST-S2', name: '东区花园中庭步道', x: 700, y: 560, type: 'corridor', accessible: true },
  { id: 'NODE-EAST-S3', name: '东区礼堂剧场走廊 (A217/小剧场)', x: 700, y: 680, type: 'corridor', accessible: true },

  // 5. South Connector Spine (Connecting South Entrance to Arena and East/West Wings)
  { id: 'NODE-SOUTH-HUB', name: '南区集散中心枢纽', x: 500, y: 650, type: 'hub', accessible: true },
  { id: 'NODE-INNOVATION', name: '创新区路演步道', x: 590, y: 720, type: 'corridor', accessible: true },

  // 6. Sub-hallways for deep lab corridors
  { id: 'NODE-WEST-DEEP-LAB', name: '西侧内通道 (M116/M124)', x: 190, y: 560, type: 'corridor', accessible: true },
  { id: 'NODE-EAST-DEEP-LAB', name: '东侧实验走廊 (A226/A227)', x: 860, y: 600, type: 'corridor', accessible: true },
];

// Reconstructed Edges with calibrated walking distances in meters (Scale 1:300)
export const NAVIGATION_EDGES: NavigationEdge[] = [
  // West Entrance to West Spine
  { from: 'NODE-ENT-WEST', to: 'NODE-WEST-MID', distance: 32, accessible: true },

  // West Spine Connections
  { from: 'NODE-WEST-N1', to: 'NODE-WEST-N2', distance: 15, accessible: true },
  { from: 'NODE-WEST-N2', to: 'NODE-WEST-MID', distance: 24, accessible: true },
  { from: 'NODE-WEST-MID', to: 'NODE-WEST-S1', distance: 19, accessible: true },
  { from: 'NODE-WEST-S1', to: 'NODE-WEST-S2', distance: 20, accessible: true },
  { from: 'NODE-WEST-S2', to: 'NODE-WEST-S3', distance: 16, accessible: true },
  { from: 'NODE-WEST-S1', to: 'NODE-WEST-DEEP-LAB', distance: 14, accessible: true },

  // West Spine to Arena Ring
  { from: 'NODE-WEST-MID', to: 'NODE-RING-W', distance: 9, accessible: true },
  { from: 'NODE-WEST-N2', to: 'NODE-RING-NW', distance: 20, accessible: true },
  { from: 'NODE-WEST-S1', to: 'NODE-RING-SW', distance: 21, accessible: true },

  // Arena Ring Internal Loop (Octagonal Walkway)
  { from: 'NODE-RING-N', to: 'NODE-RING-NW', distance: 16, accessible: true },
  { from: 'NODE-RING-NW', to: 'NODE-RING-W', distance: 16, accessible: true },
  { from: 'NODE-RING-W', to: 'NODE-RING-SW', distance: 16, accessible: true },
  { from: 'NODE-RING-SW', to: 'NODE-RING-S', distance: 17, accessible: true },
  { from: 'NODE-RING-S', to: 'NODE-RING-SE', distance: 17, accessible: true },
  { from: 'NODE-RING-SE', to: 'NODE-RING-E', distance: 16, accessible: true },
  { from: 'NODE-RING-E', to: 'NODE-RING-NE', distance: 16, accessible: true },
  { from: 'NODE-RING-NE', to: 'NODE-RING-N', distance: 16, accessible: true },

  // Arena Court Access
  { from: 'NODE-RING-S', to: 'NODE-ARENA-GATE', distance: 10, accessible: true },

  // Arena Ring to East Spine
  { from: 'NODE-RING-E', to: 'NODE-EAST-MID', distance: 10, accessible: true },
  { from: 'NODE-RING-NE', to: 'NODE-EAST-N2', distance: 20, accessible: true },
  { from: 'NODE-RING-SE', to: 'NODE-EAST-S1', distance: 21, accessible: true },

  // East Spine Connections
  { from: 'NODE-EAST-N1', to: 'NODE-EAST-N2', distance: 14, accessible: true },
  { from: 'NODE-EAST-N2', to: 'NODE-EAST-MID', distance: 16, accessible: true },
  { from: 'NODE-EAST-MID', to: 'NODE-EAST-S1', distance: 12, accessible: true },
  { from: 'NODE-EAST-S1', to: 'NODE-EAST-S2', distance: 13, accessible: true },
  { from: 'NODE-EAST-S2', to: 'NODE-EAST-S3', distance: 18, accessible: true },
  { from: 'NODE-EAST-S3', to: 'NODE-EAST-DEEP-LAB', distance: 22, accessible: true },

  // East Entrance to East Spine
  { from: 'NODE-ENT-EAST', to: 'NODE-EAST-MID', distance: 34, accessible: true },

  // South Entrance & South Hub Connections
  { from: 'NODE-ENT-SOUTH', to: 'NODE-SOUTH-HUB', distance: 12, accessible: true },
  { from: 'NODE-SOUTH-HUB', to: 'NODE-RING-S', distance: 15, accessible: true },
  { from: 'NODE-SOUTH-HUB', to: 'NODE-WEST-S3', distance: 36, accessible: true },
  { from: 'NODE-SOUTH-HUB', to: 'NODE-EAST-S3', distance: 34, accessible: true },
  { from: 'NODE-ENT-SOUTH', to: 'NODE-INNOVATION', distance: 15, accessible: true },
  { from: 'NODE-INNOVATION', to: 'NODE-SOUTH-HUB', distance: 16, accessible: true },
];

// Helper: map room ID to closest navigation node
export function getClosestNavNodeForRoom(spaceId: string): string {
  const space = CAMPUS_SPACES.find((s) => s.id === spaceId);
  if (!space) return 'NODE-RING-S';

  let bestNodeId = 'NODE-RING-S';
  let bestDist = Infinity;

  for (const node of NAVIGATION_NODES) {
    const dx = node.x - space.doorPoint.x;
    const dy = node.y - space.doorPoint.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      bestNodeId = node.id;
    }
  }

  return bestNodeId;
}

// Dijkstra Pathfinding implementation
export function findCampusRoute(startSpaceOrNodeId: string, destSpaceOrNodeId: string): NavigationRoute | null {
  const startNodeId = startSpaceOrNodeId.startsWith('NODE-')
    ? startSpaceOrNodeId
    : getClosestNavNodeForRoom(startSpaceOrNodeId);

  const destNodeId = destSpaceOrNodeId.startsWith('NODE-')
    ? destSpaceOrNodeId
    : getClosestNavNodeForRoom(destSpaceOrNodeId);

  // Build adjacency list
  const adj: Map<string, { to: string; distance: number }[]> = new Map();
  for (const node of NAVIGATION_NODES) {
    adj.set(node.id, []);
  }

  for (const edge of NAVIGATION_EDGES) {
    adj.get(edge.from)?.push({ to: edge.to, distance: edge.distance });
    adj.get(edge.to)?.push({ to: edge.from, distance: edge.distance }); // bidirectional corridors
  }

  const distances: Map<string, number> = new Map();
  const previous: Map<string, string | null> = new Map();
  const unvisited: Set<string> = new Set();

  for (const node of NAVIGATION_NODES) {
    distances.set(node.id, Infinity);
    previous.set(node.id, null);
    unvisited.add(node.id);
  }

  distances.set(startNodeId, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let minDistance = Infinity;

    for (const node of unvisited) {
      const d = distances.get(node) ?? Infinity;
      if (d < minDistance) {
        minDistance = d;
        current = node;
      }
    }

    if (!current || minDistance === Infinity) break;
    if (current === destNodeId) break;

    unvisited.delete(current);

    const neighbors = adj.get(current) || [];
    for (const neighbor of neighbors) {
      if (!unvisited.has(neighbor.to)) continue;
      const alt = minDistance + neighbor.distance;
      if (alt < (distances.get(neighbor.to) ?? Infinity)) {
        distances.set(neighbor.to, alt);
        previous.set(neighbor.to, current);
      }
    }
  }

  if (distances.get(destNodeId) === Infinity) {
    return null; // Route not found
  }

  // Backtrack route
  const pathNodeIds: string[] = [];
  let curr: string | null = destNodeId;
  while (curr) {
    pathNodeIds.unshift(curr);
    curr = previous.get(curr) ?? null;
  }

  const routeNodes = pathNodeIds
    .map((id) => NAVIGATION_NODES.find((n) => n.id === id))
    .filter((n): n is NavigationNode => Boolean(n));

  const totalDist = distances.get(destNodeId) || 0;
  const estimatedMin = Math.max(1, Math.round(totalDist / 50)); // ~50m/min relaxed campus walk speed

  const steps: string[] = [];
  steps.push(`从 ${routeNodes[0]?.name || '起点'} 出发`);
  for (let i = 1; i < routeNodes.length - 1; i++) {
    steps.push(`途经 ${routeNodes[i].name}`);
  }
  steps.push(`到达目的地：${routeNodes[routeNodes.length - 1]?.name || '终点'}`);

  return {
    nodes: routeNodes,
    totalDistanceMeters: Math.round(totalDist),
    estimatedMinutes: estimatedMin,
    steps,
  };
}
