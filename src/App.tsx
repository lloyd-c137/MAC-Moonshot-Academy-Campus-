import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopNav } from './components/ui/TopNav';
import { LayerRail } from './components/ui/LayerRail';
import { ContextDetailPanel, type DetailTab } from './components/ui/ContextDetailPanel';
import { BottomDiscoverDock } from './components/ui/BottomDiscoverDock';
import { FindMySpotModal } from './components/ui/FindMySpotModal';
import { AddMomentModal } from './components/ui/AddMomentModal';
import { GeometryReviewDrawer } from './components/ui/GeometryReviewDrawer';
import { RoutePanel, type RouteField } from './components/ui/RoutePanel';
import { RouteGuidance } from './components/ui/RouteGuidance';
import { routeNames } from './components/ui/routeText';
import { useWalkRoute } from './services/useWalkRoute';
import { ToastProvider, useToast } from './components/ui/Toast';

// Heavy or rarely visited views are separate chunks: three.js ships with the map, not the shell.
// Dev-only previews are compiled out of production builds entirely.
const NotAvailable: React.FC = () => null;
const CampusCanvas = lazy(() => import('./components/canvas/CampusCanvas').then((m) => ({ default: m.CampusCanvas })));
const AdminPage = lazy(() => import('./admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const GeometryReviewEditor = import.meta.env.DEV ? lazy(() => import('./components/dev/GeometryReviewEditor').then((m) => ({ default: m.GeometryReviewEditor }))) : NotAvailable;
const GeometryReviewSession = import.meta.env.DEV ? lazy(() => import('./components/dev/GeometryReviewSession').then((m) => ({ default: m.GeometryReviewSession }))) : NotAvailable;
const BuildingPreviewV6 = import.meta.env.DEV ? lazy(() => import('./components/dev/BuildingPreviewV6').then((m) => ({ default: m.BuildingPreviewV6 }))) : NotAvailable;
const BuildingPreviewV7 = import.meta.env.DEV ? lazy(() => import('./components/dev/BuildingPreviewV7').then((m) => ({ default: m.BuildingPreviewV7 }))) : NotAvailable;
const BuildingPreviewV8 = import.meta.env.DEV ? lazy(() => import('./components/dev/BuildingPreviewV8').then((m) => ({ default: m.BuildingPreviewV8 }))) : NotAvailable;
const BuildingPreviewV9 = import.meta.env.DEV ? lazy(() => import('./components/dev/BuildingPreviewV8').then((m) => ({ default: m.BuildingPreviewV9 }))) : NotAvailable;
import { CAMPUS_SPACES } from './data/floorplanData';
import { CAMPUS_EVENTS } from './data/mockEvents';
import { getLikedMomentIds, getStoredMoments, toggleLikeMoment } from './data/mockMoments';
import { useCampusConfig } from './config/campusConfig';
import { formatAge, useLiveSensors } from './services/sensorApi';
import { buildSpaces } from './services/spaceModel';
import { displayName } from './components/ui/format';
import { dismissBootSplash } from './bootSplash';
import type { CampusMoment, MapLayerMode } from './types/campus';

type LeftPanel = 'none' | 'review' | 'route';
const VALID_IDS = new Set(CAMPUS_SPACES.map((s) => s.id));

const idFromUrl = (key: string) => {
  const id = new URLSearchParams(window.location.search).get(key);
  return id && VALID_IDS.has(id) ? id : null;
};
const roomFromUrl = () => idFromUrl('room');

function CampusApp() {
  const toast = useToast();
  const { config, ready } = useCampusConfig();
  const { readings: live, refreshing: refreshingSensors, refresh: refreshSensors } = useLiveSensors(config, ready);
  const spaces = useMemo(() => buildSpaces(CAMPUS_SPACES, config, live), [config, live]);

  const [layerMode, setLayerMode] = useState<MapLayerMode>('explore');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(roomFromUrl);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(() => (idFromUrl('from') || idFromUrl('to') ? 'route' : 'none'));
  const [findOpen, setFindOpen] = useState(false);
  const [momentSpaceId, setMomentSpaceId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showSourceOverlay, setShowSourceOverlay] = useState(false);
  const [moments, setMoments] = useState<CampusMoment[]>(() => getStoredMoments());
  const [likedIds, setLikedIds] = useState<Set<string>>(() => getLikedMomentIds());
  const [tabRequest, setTabRequest] = useState<{ tab: DetailTab; nonce: number } | null>(null);

  const selectedSpace = useMemo(() => spaces.find((s) => s.id === selectedSpaceId) ?? null, [spaces, selectedSpaceId]);

  // Routes: ?from= & ?to= in the address bar so a route can be shared.
  const [routeFrom, setRouteFrom] = useState<string | null>(() => idFromUrl('from'));
  const [routeTo, setRouteTo] = useState<string | null>(() => idFromUrl('to'));
  const [pickField, setPickField] = useState<RouteField | null>(() => (idFromUrl('to') && !idFromUrl('from') ? 'from' : null));
  const [routeFrameNonce, setRouteFrameNonce] = useState(0);
  const routeOpen = leftPanel === 'route';
  const walk = useWalkRoute(routeOpen, routeFrom, routeTo);
  // Step-by-step guidance: the step the walker is at, or null for the route overview.
  const [guideStep, setGuideStep] = useState<number | null>(null);
  const [guidePeek, setGuidePeek] = useState(false); // whole route in view while guiding
  const guiding = routeOpen && guideStep !== null && walk.route !== null && walk.steps.length > 1;
  const reframe = useCallback(() => setRouteFrameNonce((n) => n + 1), []);
  useEffect(() => { setGuideStep(null); if (walk.route) reframe(); }, [walk.route, reframe]);
  useEffect(() => { if (!routeOpen) setGuideStep(null); }, [routeOpen]);
  const lastStep = Math.max(0, walk.steps.length - 1);
  const goToStep = useCallback((k: number | null) => {
    setGuideStep(k === null ? null : Math.max(0, Math.min(lastStep, k)));
    setGuidePeek(false);
    setSelectedSpaceId(null);
    setPickField(null);
    reframe();
  }, [lastStep, reframe]);
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const names = useMemo(() => routeNames(spaceById, routeFrom, routeTo), [spaceById, routeFrom, routeTo]);
  // The landmark of the upcoming turn is highlighted on the map.
  const guideLandmark = guiding && guideStep !== null ? walk.steps[guideStep + 1]?.landmarkId ?? null : null;
  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string | null) => (value && routeOpen ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    set('from', routeFrom);
    set('to', routeTo);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }, [routeFrom, routeTo, routeOpen]);

  const setRouteEnd = useCallback((field: RouteField, id: string | null) => {
    if (field === 'from') setRouteFrom(id); else setRouteTo(id);
    // After choosing one end, move on to the other if it is still empty.
    setPickField(id ? (field === 'from' ? (routeTo ? null : 'to') : (routeFrom ? null : 'from')) : field);
  }, [routeFrom, routeTo]);
  const openRoute = useCallback((field: RouteField, id: string) => {
    setLeftPanel('route');
    setSelectedSpaceId(null);
    if (field === 'to') { setRouteTo(id); setPickField(routeFrom && routeFrom !== id ? null : 'from'); if (routeFrom === id) setRouteFrom(null); }
    else { setRouteFrom(id); setPickField(routeTo && routeTo !== id ? null : 'to'); if (routeTo === id) setRouteTo(null); }
  }, [routeFrom, routeTo]);
  const closeRoute = useCallback(() => { setLeftPanel('none'); setPickField(null); }, []);

  // While an end of the route is being picked, a click on the map fills it instead of opening the room.
  const selectSpace = useCallback((id: string | null) => {
    if (routeOpen && pickField) {
      if (id) setRouteEnd(pickField, id);
      return;
    }
    setSelectedSpaceId(id);
  }, [routeOpen, pickField, setRouteEnd]);

  // Keep ?room= in the address bar so a room can be shared and Back returns to the previous room.
  const fromHistory = useRef(false);
  useEffect(() => {
    if (fromHistory.current) { fromHistory.current = false; return; }
    if (roomFromUrl() === selectedSpaceId) return;
    const url = new URL(window.location.href);
    if (selectedSpaceId) url.searchParams.set('room', selectedSpaceId);
    else url.searchParams.delete('room');
    window.history.pushState({ room: selectedSpaceId }, '', url);
  }, [selectedSpaceId]);
  useEffect(() => {
    const onPop = () => { fromHistory.current = true; setSelectedSpaceId(roomFromUrl()); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const shareSpace = async (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast('链接已复制，打开后会直接定位到这个房间');
    } catch {
      toast('无法写入剪贴板，请从地址栏复制链接', 'error');
    }
  };

  const refreshEnvironment = async (id: string) => {
    const reading = await refreshSensors(id);
    if (!reading) return;
    if (reading.status === 'live') toast('已更新到最新读数');
    else if (reading.status === 'stale' && reading.error) toast(`传感器接口暂时无法访问，仍显示 ${formatAge(reading.ageMinutes)}的读数`, 'error');
    else if (reading.status === 'stale') toast(`已刷新，传感器最近一次上报在 ${formatAge(reading.ageMinutes)}`);
    else if (reading.status === 'empty') toast('传感器还没有上报数据', 'error');
    else if (reading.status === 'error') toast(reading.error ?? '传感器暂时连不上', 'error');
  };

  const likeMoment = (momentId: string) => {
    const { likes, liked } = toggleLikeMoment(momentId);
    setMoments((prev) => prev.map((m) => (m.id === momentId ? { ...m, likes } : m)));
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (liked) next.add(momentId); else next.delete(momentId);
      return next;
    });
  };

  const momentSaved = (moment: CampusMoment) => {
    setMoments((prev) => [moment, ...prev]);
    setSelectedSpaceId(moment.spaceId);
    setTabRequest({ tab: 'memories', nonce: Date.now() });
    const space = spaces.find((s) => s.id === moment.spaceId);
    toast(`回忆已保存到 ${space ? displayName(space) : moment.spaceId}`);
  };

  // Escape closes the topmost layer first. Dialogs handle their own Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (findOpen || momentSpaceId) return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
      if (guiding && !typing && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        goToStep((guideStep ?? 0) + (event.key === 'ArrowRight' ? 1 : -1));
        return;
      }
      if (event.key !== 'Escape') return;
      if (guiding) goToStep(null);
      else if (leftPanel === 'route' && pickField) setPickField(null);
      else if (leftPanel !== 'none') closeRoute();
      else setSelectedSpaceId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findOpen, momentSpaceId, leftPanel, pickField, closeRoute, guiding, guideStep, goToStep]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-regolith text-ink">
      <h1 className="sr-only">Moonshot Academy Campus 校园地图</h1>

      <div className="absolute inset-0">
        <Suspense fallback={null}>
        <CampusCanvas
          layerMode={layerMode}
          selectedSpaceId={selectedSpaceId}
          hoveredSpaceId={guideLandmark ?? hoveredSpaceId}
          route={walk.route}
          routeSteps={walk.steps}
          routeStep={guiding ? guideStep : null}
          routeFrameNonce={routeFrameNonce}
          guiding={guiding}
          routeOverview={guiding && guidePeek}
          reviewMode={leftPanel === 'review'}
          showNavGraph={false}
          showGrid={showGrid}
          showSourceOverlay={showSourceOverlay}
          hasSelectedSpace={selectedSpaceId !== null}
          onSelectSpace={selectSpace}
          onHoverSpace={setHoveredSpaceId}
          spaces={spaces}
          onOpenReview={() => setLeftPanel('review')}
        />
        </Suspense>
      </div>

      {!guiding && <>
      <TopNav
        spaces={spaces}
        events={CAMPUS_EVENTS}
        onSelectSpace={selectSpace}
        onOpenFindSpot={() => setFindOpen(true)}
        onOpenRoute={() => { setLeftPanel('route'); if (!routeFrom) setPickField('from'); else if (!routeTo) setPickField('to'); }}
        routeOpen={routeOpen}
      />

      <LayerRail layerMode={layerMode} onLayerChange={setLayerMode} hideLegend={leftPanel !== 'none'} liveRoomIds={Object.entries(live).filter(([, r]) => r.latest).map(([id]) => id)} />

      <GeometryReviewDrawer
        isOpen={leftPanel === 'review'}
        showNavGraph={false}
        showGrid={showGrid}
        showSourceOverlay={showSourceOverlay}
        onClose={() => setLeftPanel('none')}
        onToggleNavGraph={() => {}}
        onToggleGrid={() => setShowGrid((v) => !v)}
        onToggleSourceOverlay={() => setShowSourceOverlay((v) => !v)}
      />
      </>}

      {guiding && guideStep !== null && (
        <RouteGuidance
          steps={walk.steps}
          index={guideStep}
          names={names}
          onPrev={() => goToStep(guideStep - 1)}
          onNext={() => goToStep(guideStep + 1)}
          onEnd={() => goToStep(null)}
          overview={guidePeek}
          onOverview={() => { setGuidePeek((v) => !v); reframe(); }}
          onRecenter={() => { setGuidePeek(false); reframe(); }}
          onShowDestination={() => { const id = routeTo; closeRoute(); if (id) setSelectedSpaceId(id); }}
        />
      )}

      <RoutePanel
        isOpen={routeOpen && !guiding}
        spaces={spaces}
        routableIds={walk.routableIds}
        fromId={routeFrom}
        toId={routeTo}
        pickField={pickField}
        status={walk.status}
        route={walk.route}
        steps={walk.steps}
        onPickField={setPickField}
        onChange={setRouteEnd}
        onSwap={() => { setRouteFrom(routeTo); setRouteTo(routeFrom); }}
        onFrameRoute={reframe}
        onStartGuidance={(k) => goToStep(k ?? 0)}
        onClose={closeRoute}
      />

      <ContextDetailPanel
        space={selectedSpace}
        events={CAMPUS_EVENTS}
        moments={moments}
        likedIds={likedIds}
        tabRequest={tabRequest}
        onClose={() => setSelectedSpaceId(null)}
        onOpenAddMoment={(id) => setMomentSpaceId(id)}
        onLikeMoment={likeMoment}
        onShare={shareSpace}
        onRouteTo={(id) => openRoute('to', id)}
        onRouteFrom={(id) => openRoute('from', id)}
        onRefreshEnvironment={selectedSpaceId && live[selectedSpaceId] ? refreshEnvironment : undefined}
        refreshingEnvironment={selectedSpaceId ? refreshingSensors.has(selectedSpaceId) : false}
      />

      {!guiding && <BottomDiscoverDock
        events={CAMPUS_EVENTS}
        spaces={spaces}
        compact={selectedSpaceId !== null}
        onSelectSpace={selectSpace}
        onOpenFindSpot={() => setFindOpen(true)}
      />}

      <FindMySpotModal isOpen={findOpen} onClose={() => setFindOpen(false)} onSelectSpace={selectSpace} />

      <AddMomentModal
        isOpen={momentSpaceId !== null}
        defaultSpaceId={momentSpaceId ?? undefined}
        onClose={() => setMomentSpaceId(null)}
        onMomentAdded={momentSaved}
      />
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const dev = (() => {
    if (!import.meta.env.DEV) return null;
    if (path === '/dev/building-preview') return <BuildingPreviewV6 />;
    if (path === '/dev/building-preview-v7') return <BuildingPreviewV7 />;
    if (path === '/dev/building-preview-v8') return <BuildingPreviewV8 />;
    if (path === '/dev/building-preview-v9') return <BuildingPreviewV9 />;
    if (path === '/dev/geometry-review') return new URLSearchParams(window.location.search).get('mode') === 'edit' ? <GeometryReviewEditor /> : <GeometryReviewSession />;
    return null;
  })();
  if (dev) return <Suspense fallback={null}><DismissSplash />{dev}</Suspense>;
  if (path === '/tab/demo' || path.startsWith('/tab/demo/')) return <RetiredTabDemoRoute />;
  return (
    <ToastProvider>
      {path === '/admin' ? <Suspense fallback={null}><AdminPage /></Suspense> : <CampusApp />}
    </ToastProvider>
  );
}

function RetiredTabDemoRoute() {
  useEffect(() => { window.location.replace('/'); }, []);
  return null;
}

/** Pages without the 3D map remove the startup screen as soon as they mount. */
function DismissSplash() {
  useEffect(() => { void dismissBootSplash(); }, []);
  return null;
}
