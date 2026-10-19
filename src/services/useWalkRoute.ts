import { useEffect, useMemo, useState } from 'react';
import { loadNavGrid } from '../components/canvas/modelLoader';
import { hasRoomCode } from '../components/ui/format';
import { describeRoute, findRoute, type NavGrid, type RouteStep, type WalkRoute } from './pathfinding';
import type { RouteStatus } from '../components/ui/RoutePanel';

interface WalkRouteState {
  grid: NavGrid | null;
  routableIds: Set<string> | null;
  status: RouteStatus;
  route: WalkRoute | null;
  steps: RouteStep[];
}

/** Loads the walking grid once routing is opened, then computes the route whenever both ends are set. */
export function useWalkRoute(active: boolean, fromId: string | null, toId: string | null): WalkRouteState {
  const [grid, setGrid] = useState<NavGrid | null>(null);
  const [gridFailed, setGridFailed] = useState(false);
  const [result, setResult] = useState<{ key: string; route: WalkRoute | null } | null>(null);

  useEffect(() => {
    if (!active || grid) return;
    let cancelled = false;
    setGridFailed(false);
    loadNavGrid()
      .then((g) => { if (!cancelled) setGrid(g); })
      .catch((error) => { console.error('Walking grid could not be loaded.', error); if (!cancelled) setGridFailed(true); });
    return () => { cancelled = true; };
  }, [active, grid]);

  const key = `${fromId}>${toId}`;
  useEffect(() => {
    if (!grid || !fromId || !toId) return;
    // Let the panel paint "正在计算" before the (synchronous, tens of ms) search.
    const timer = window.setTimeout(() => setResult({ key, route: findRoute(grid, fromId, toId) }), 16);
    return () => window.clearTimeout(timer);
  }, [grid, fromId, toId, key]);

  const routableIds = useMemo(() => (grid ? new Set(grid.anchors.keys()) : null), [grid]);
  const current = result?.key === key ? result.route : undefined;
  const steps = useMemo(() => (grid && current ? describeRoute(grid, current, hasRoomCode) : []), [grid, current]);

  let status: RouteStatus = 'idle';
  if (fromId && toId) {
    if (gridFailed) status = 'error';
    else if (!grid || current === undefined) status = 'loading';
    else status = current ? 'ready' : 'none';
  }
  return { grid, routableIds, status, route: active && current ? current : null, steps };
}
