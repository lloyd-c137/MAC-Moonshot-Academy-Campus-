import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CampusCanvas } from './components/canvas/CampusCanvas';
import { TopNav } from './components/ui/TopNav';
import { LayerRail } from './components/ui/LayerRail';
import { ContextDetailPanel } from './components/ui/ContextDetailPanel';
import { BottomDiscoverDock } from './components/ui/BottomDiscoverDock';
import { FindMySpotModal } from './components/ui/FindMySpotModal';
import { NavigationPanel } from './components/ui/NavigationPanel';
import { AddMomentModal } from './components/ui/AddMomentModal';
import { GeometryReviewDrawer } from './components/ui/GeometryReviewDrawer';
import { GeometryReviewEditor } from './components/dev/GeometryReviewEditor';
import { GeometryReviewSession } from './components/dev/GeometryReviewSession';
import { BuildingPreviewV6 } from './components/dev/BuildingPreviewV6';
import { BuildingPreviewV7 } from './components/dev/BuildingPreviewV7';
import { BuildingPreviewV8, BuildingPreviewV9 } from './components/dev/BuildingPreviewV8';
import { CAMPUS_SPACES } from './data/floorplanData';
import { CAMPUS_EVENTS } from './data/mockEvents';
import { getStoredMoments, toggleLikeMoment } from './data/mockMoments';
import type { CampusMoment, MapLayerMode, NavigationRoute } from './types/campus';

type LeftPanel = 'none' | 'route' | 'review';

function CampusApp() {
  const [layerMode, setLayerMode] = useState<MapLayerMode>('explore');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('none');
  const [findOpen, setFindOpen] = useState(false);
  const [momentSpaceId, setMomentSpaceId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showSourceOverlay, setShowSourceOverlay] = useState(false);
  const [moments, setMoments] = useState<CampusMoment[]>(() => getStoredMoments());

  const selectedSpace = useMemo(() => CAMPUS_SPACES.find((s) => s.id === selectedSpaceId) ?? null, [selectedSpaceId]);
  const selectSpace = useCallback((id: string | null) => setSelectedSpaceId(id), []);

  const likeMoment = (momentId: string) => {
    toggleLikeMoment(momentId);
    setMoments((prev) => prev.map((m) => (m.id === momentId ? { ...m, likes: m.likes + 1 } : m)));
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
        />
      </div>

      <TopNav
        spaces={CAMPUS_SPACES}
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
        onClose={() => setSelectedSpaceId(null)}
        onNavigateTo={(id) => { setSelectedSpaceId(id); setLeftPanel('route'); }}
        onOpenAddMoment={(id) => setMomentSpaceId(id)}
        onLikeMoment={likeMoment}
      />

      <BottomDiscoverDock
        events={CAMPUS_EVENTS}
        spaces={CAMPUS_SPACES}
        compact={selectedSpaceId !== null}
        onSelectSpace={selectSpace}
        onOpenFindSpot={() => setFindOpen(true)}
      />

      <FindMySpotModal isOpen={findOpen} onClose={() => setFindOpen(false)} onSelectSpace={selectSpace} />

      <AddMomentModal
        isOpen={momentSpaceId !== null}
        defaultSpaceId={momentSpaceId ?? undefined}
        onClose={() => setMomentSpaceId(null)}
        onMomentAdded={(m) => setMoments((prev) => [m, ...prev])}
      />
    </main>
  );
}

export default function App() {
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview') return <BuildingPreviewV6 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview-v7') return <BuildingPreviewV7 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview-v8') return <BuildingPreviewV8 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview-v9') return <BuildingPreviewV9 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/geometry-review') return new URLSearchParams(window.location.search).get('mode') === 'edit' ? <GeometryReviewEditor /> : <GeometryReviewSession />;
  return <CampusApp />;
}
