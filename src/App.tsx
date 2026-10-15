import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampusCanvas } from './components/canvas/CampusCanvas';
import { TopNav } from './components/ui/TopNav';
import { LayerRail } from './components/ui/LayerRail';
import { ContextDetailPanel } from './components/ui/ContextDetailPanel';
import { BottomDiscoverDock } from './components/ui/BottomDiscoverDock';
import { FindMySpotModal } from './components/ui/FindMySpotModal';
import { NavigationPanel } from './components/ui/NavigationPanel';
import { AddMomentModal } from './components/ui/AddMomentModal';
import { GeometryReviewDrawer } from './components/ui/GeometryReviewDrawer';
import { ToastProvider, useToast } from './components/ui/Toast';
import { AdminPage } from './admin/AdminPage';
import { GeometryReviewEditor } from './components/dev/GeometryReviewEditor';
import { GeometryReviewSession } from './components/dev/GeometryReviewSession';
import { BuildingPreviewV6 } from './components/dev/BuildingPreviewV6';
import { BuildingPreviewV7 } from './components/dev/BuildingPreviewV7';
import { BuildingPreviewV8, BuildingPreviewV9 } from './components/dev/BuildingPreviewV8';
import { CAMPUS_SPACES } from './data/floorplanData';
import { CAMPUS_EVENTS } from './data/mockEvents';
import { getLikedMomentIds, getStoredMoments, toggleLikeMoment } from './data/mockMoments';
import { useCampusConfig } from './config/campusConfig';
import { useLiveSensors } from './services/sensorApi';
import { buildSpaces } from './services/spaceModel';
import { displayName } from './components/ui/format';
import type { CampusMoment, MapLayerMode, NavigationRoute } from './types/campus';

type LeftPanel = 'none' | 'route' | 'review';
const VALID_IDS = new Set(CAMPUS_SPACES.map((s) => s.id));

const roomFromUrl = () => {
  const id = new URLSearchParams(window.location.search).get('room');
  return id && VALID_IDS.has(id) ? id : null;
};

function CampusApp() {
  const toast = useToast();
  const { config, ready } = useCampusConfig();
  const live = useLiveSensors(config, ready);
  const spaces = useMemo(() => buildSpaces(CAMPUS_SPACES, config, live), [config, live]);

  const [layerMode, setLayerMode] = useState<MapLayerMode>('explore');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(roomFromUrl);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('none');
  const [findOpen, setFindOpen] = useState(false);
  const [momentSpaceId, setMomentSpaceId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showSourceOverlay, setShowSourceOverlay] = useState(false);
  const [moments, setMoments] = useState<CampusMoment[]>(() => getStoredMoments());
  const [likedIds, setLikedIds] = useState<Set<string>>(() => getLikedMomentIds());
  const [tabRequest, setTabRequest] = useState<{ tab: 'now' | 'past' | 'next'; nonce: number } | null>(null);

  const selectedSpace = useMemo(() => spaces.find((s) => s.id === selectedSpaceId) ?? null, [spaces, selectedSpaceId]);
  const selectSpace = useCallback((id: string | null) => setSelectedSpaceId(id), []);

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
    setTabRequest({ tab: 'past', nonce: Date.now() });
    const space = spaces.find((s) => s.id === moment.spaceId);
    toast(`回忆已保存到 ${space ? displayName(space) : moment.spaceId}`);
  };

  // Escape closes the topmost layer first. Dialogs handle their own Escape.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || findOpen || momentSpaceId) return;
      if (leftPanel !== 'none') setLeftPanel('none');
      else setSelectedSpaceId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findOpen, momentSpaceId, leftPanel]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-regolith text-ink">
      <h1 className="sr-only">Moonshot Academy Campus 校园地图</h1>

      <div className="absolute inset-0">
        <CampusCanvas
          layerMode={layerMode}
          selectedSpaceId={selectedSpaceId}
          hoveredSpaceId={hoveredSpaceId}
          activeRoute={activeRoute}
          reviewMode={leftPanel === 'review'}
          showNavGraph={false}
          showGrid={showGrid}
          showSourceOverlay={showSourceOverlay}
          hasSelectedSpace={selectedSpaceId !== null}
          onSelectSpace={selectSpace}
          onHoverSpace={setHoveredSpaceId}
          spaces={spaces}
        />
      </div>

      <TopNav
        spaces={spaces}
        events={CAMPUS_EVENTS}
        reviewMode={leftPanel === 'review'}
        onSelectSpace={selectSpace}
        onOpenFindSpot={() => setFindOpen(true)}
        onToggleReviewMode={() => setLeftPanel((p) => (p === 'review' ? 'none' : 'review'))}
        onOpenNavigation={() => setLeftPanel((p) => (p === 'route' ? 'none' : 'route'))}
      />

      <LayerRail layerMode={layerMode} onLayerChange={setLayerMode} hideLegend={leftPanel !== 'none'} />

      <NavigationPanel
        isOpen={leftPanel === 'route'}
        selectedDestinationId={selectedSpaceId}
        onClose={() => { setLeftPanel('none'); setActiveRoute(null); }}
        onRouteCalculated={setActiveRoute}
        onShowDestination={(id) => { setSelectedSpaceId(id); setLeftPanel('none'); }}
      />

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

      <ContextDetailPanel
        space={selectedSpace}
        events={CAMPUS_EVENTS}
        moments={moments}
        likedIds={likedIds}
        tabRequest={tabRequest}
        onClose={() => setSelectedSpaceId(null)}
        onNavigateTo={(id) => { setSelectedSpaceId(id); setLeftPanel('route'); }}
        onOpenAddMoment={(id) => setMomentSpaceId(id)}
        onLikeMoment={likeMoment}
        onShare={shareSpace}
      />

      <BottomDiscoverDock
        events={CAMPUS_EVENTS}
        spaces={spaces}
        compact={selectedSpaceId !== null}
        onSelectSpace={selectSpace}
        onOpenFindSpot={() => setFindOpen(true)}
      />

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
  if (import.meta.env.DEV && path === '/dev/building-preview') return <BuildingPreviewV6 />;
  if (import.meta.env.DEV && path === '/dev/building-preview-v7') return <BuildingPreviewV7 />;
  if (import.meta.env.DEV && path === '/dev/building-preview-v8') return <BuildingPreviewV8 />;
  if (import.meta.env.DEV && path === '/dev/building-preview-v9') return <BuildingPreviewV9 />;
  if (import.meta.env.DEV && path === '/dev/geometry-review') return new URLSearchParams(window.location.search).get('mode') === 'edit' ? <GeometryReviewEditor /> : <GeometryReviewSession />;
  return (
    <ToastProvider>
      {path === '/admin' ? <AdminPage /> : <CampusApp />}
    </ToastProvider>
  );
}
