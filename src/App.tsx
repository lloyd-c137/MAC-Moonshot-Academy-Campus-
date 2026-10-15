import React, { useState, useEffect, useMemo } from 'react';
import { CampusCanvas } from './components/canvas/CampusCanvas';
import { TopNav } from './components/ui/TopNav';
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
import { BuildingPreviewV8 } from './components/dev/BuildingPreviewV8';
import { CAMPUS_SPACES } from './data/floorplanData';
import { CAMPUS_EVENTS } from './data/mockEvents';
import { getStoredMoments, toggleLikeMoment } from './data/mockMoments';
import { CampusSpace, MapLayerMode, NavigationRoute, CampusMoment } from './types/campus';
import { Thermometer, Droplets, Cloud, Layers, Info } from 'lucide-react';

function CampusApp() {
  const [layerMode, setLayerMode] = useState<MapLayerMode>('explore');
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);

  // Modals & Drawers state
  const [isFindSpotOpen, setIsFindSpotOpen] = useState(false);
  const [isNavPanelOpen, setIsNavPanelOpen] = useState(false);
  const [isAddMomentOpen, setIsAddMomentOpen] = useState(false);
  const [addMomentSpaceId, setAddMomentSpaceId] = useState<string | undefined>(undefined);
  const [reviewMode, setReviewMode] = useState(false);
  const [showNavGraph, setShowNavGraph] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showSourceOverlay, setShowSourceOverlay] = useState(false);

  // Dynamic moments loaded from local storage & defaults
  const [moments, setMoments] = useState<CampusMoment[]>(() => getStoredMoments());

  const selectedSpace = useMemo(() => {
    return CAMPUS_SPACES.find((s) => s.id === selectedSpaceId) || null;
  }, [selectedSpaceId]);

  // Real-time search matches
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return CAMPUS_SPACES.filter((s) => {
      return (
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.englishName && s.englishName.toLowerCase().includes(q)) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }).slice(0, 6);
  }, [searchQuery]);

  const handleSelectSpace = (id: string | null) => {
    setSelectedSpaceId(id);
    if (id) {
      setSearchQuery('');
    }
  };

  const handleOpenAddMoment = (spaceId: string) => {
    setAddMomentSpaceId(spaceId);
    setIsAddMomentOpen(true);
  };

  const handleMomentAdded = (newMoment: CampusMoment) => {
    setMoments((prev) => [newMoment, ...prev]);
  };

  const handleLikeMoment = (momentId: string) => {
    toggleLikeMoment(momentId);
    setMoments((prev) =>
      prev.map((m) => (m.id === momentId ? { ...m, likes: m.likes + 1 } : m))
    );
  };

  const handleNavigateTo = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setIsNavPanelOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isAddMomentOpen) setIsAddMomentOpen(false);
      else if (isFindSpotOpen) setIsFindSpotOpen(false);
      else if (isNavPanelOpen) setIsNavPanelOpen(false);
      else if (reviewMode) setReviewMode(false);
      else setSelectedSpaceId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAddMomentOpen, isFindSpotOpen, isNavPanelOpen, reviewMode]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-neutral-100 font-sans">
      {/* 1. Top Navigation Bar */}
      <TopNav
        layerMode={layerMode}
        searchQuery={searchQuery}
        reviewMode={reviewMode}
        onLayerChange={setLayerMode}
        onSearchChange={setSearchQuery}
        onOpenFindSpot={() => setIsFindSpotOpen(true)}
        onToggleReviewMode={() => setReviewMode(!reviewMode)}
        onOpenNavigation={() => setIsNavPanelOpen(true)}
      />

      {/* Real-time Search Dropdown Results */}
      {searchResults.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-neutral-200/90 overflow-hidden divide-y divide-neutral-100">
          <div className="px-4 py-2 bg-neutral-50/70 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            匹配图纸空间 ({searchResults.length})
          </div>
          {searchResults.map((space) => (
            <div
              key={space.id}
              onClick={() => handleSelectSpace(space.id)}
              className="px-4 py-2.5 hover:bg-neutral-100/80 cursor-pointer flex items-center justify-between transition-colors"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-neutral-800">{space.id}</span>
                  <span className="text-xs font-bold text-neutral-900">{space.name}</span>
                </div>
                <div className="text-[11px] text-neutral-500 mt-0.5 line-clamp-1">
                  {space.description}
                </div>
              </div>
              <span className="text-xs font-medium text-amber-700 whitespace-nowrap ml-3">
                聚焦定位 →
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 2. Interactive 2.5D Campus Three.js Canvas */}
      <div className="w-full h-full">
        <CampusCanvas
          layerMode={layerMode}
          selectedSpaceId={selectedSpaceId}
          hoveredSpaceId={hoveredSpaceId}
          activeRoute={activeRoute}
          reviewMode={reviewMode}
          showNavGraph={showNavGraph}
          showGrid={showGrid}
          showSourceOverlay={showSourceOverlay}
          hasSelectedSpace={selectedSpaceId !== null}
          onSelectSpace={handleSelectSpace}
          onHoverSpace={setHoveredSpaceId}
        />
      </div>

      {/* 3. Layer Legend Indicator (when environmental layers are active) */}
      {(layerMode === 'temperature' || layerMode === 'humidity' || layerMode === 'co2') && (
        <div className="absolute top-20 right-6 z-10 p-3 bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/80 shadow-sm text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-neutral-800 mb-2">
            {layerMode === 'temperature' && <Thermometer className="w-3.5 h-3.5 text-amber-500" />}
            {layerMode === 'humidity' && <Droplets className="w-3.5 h-3.5 text-sky-500" />}
            {layerMode === 'co2' && <Cloud className="w-3.5 h-3.5 text-emerald-500" />}
            <span>
              {layerMode === 'temperature' && '温度分级热力图 (°C)'}
              {layerMode === 'humidity' && '相对湿度分级 (%)'}
              {layerMode === 'co2' && 'CO₂ 新风浓度分级 (ppm)'}
            </span>
          </div>

          {layerMode === 'temperature' && (
            <div className="flex items-center gap-2 text-[11px] text-neutral-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-sky-400" /> &lt;22.0 清凉</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400" /> 22.0~22.8 舒适</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" /> 22.8~23.5 偏温</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400" /> &gt;23.5 暖热</span>
            </div>
          )}

          {layerMode === 'humidity' && (
            <div className="flex items-center gap-2 text-[11px] text-neutral-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-300" /> &lt;44% 干燥</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-sky-400" /> 44~48% 宜人</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-teal-400" /> 48~52% 润和</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-sky-600" /> &gt;52% 湿润</span>
            </div>
          )}

          {layerMode === 'co2' && (
            <div className="flex items-center gap-2 text-[11px] text-neutral-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400" /> &lt;550 极佳</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-lime-400" /> 550~680 良好</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" /> 680~750 适中</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400" /> &gt;750 建议通风</span>
            </div>
          )}
        </div>
      )}

      {/* 4. Contextual Detail Panel (Selected Space) */}
      <ContextDetailPanel
        space={selectedSpace}
        events={CAMPUS_EVENTS}
        moments={moments}
        onClose={() => setSelectedSpaceId(null)}
        onNavigateTo={handleNavigateTo}
        onOpenAddMoment={handleOpenAddMoment}
        onLikeMoment={handleLikeMoment}
      />

      {/* 5. Indoor Navigation Panel */}
      <NavigationPanel
        isOpen={isNavPanelOpen}
        selectedDestinationId={selectedSpaceId}
        onClose={() => {
          setIsNavPanelOpen(false);
          setActiveRoute(null);
        }}
        onRouteCalculated={setActiveRoute}
      />

      {/* 6. Geometry Review & Floor Plan Audit Drawer */}
      <GeometryReviewDrawer
        isOpen={reviewMode}
        showNavGraph={showNavGraph}
        showGrid={showGrid}
        showSourceOverlay={showSourceOverlay}
        onClose={() => setReviewMode(false)}
        onToggleNavGraph={() => setShowNavGraph(!showNavGraph)}
        onToggleGrid={() => setShowGrid(!showGrid)}
        onToggleSourceOverlay={() => setShowSourceOverlay(!showSourceOverlay)}
      />

      {/* 7. Bottom Ergonomic Discover Dock */}
      <BottomDiscoverDock
        events={CAMPUS_EVENTS}
        spaces={CAMPUS_SPACES}
        onSelectSpace={handleSelectSpace}
        onOpenFindSpot={() => setIsFindSpotOpen(true)}
      />

      {/* 8. Find My Spot Recommendation Modal */}
      <FindMySpotModal
        isOpen={isFindSpotOpen}
        onClose={() => setIsFindSpotOpen(false)}
        onSelectSpace={handleSelectSpace}
      />

      {/* 9. Add Moment to Space Modal */}
      <AddMomentModal
        isOpen={isAddMomentOpen}
        defaultSpaceId={addMomentSpaceId}
        onClose={() => setIsAddMomentOpen(false)}
        onMomentAdded={handleMomentAdded}
      />
    </main>
  );
}

export default function App() {
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview') return <BuildingPreviewV6 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview-v7') return <BuildingPreviewV7 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/building-preview-v8') return <BuildingPreviewV8 />;
  if (import.meta.env.DEV && window.location.pathname === '/dev/geometry-review') return new URLSearchParams(window.location.search).get('mode') === 'edit' ? <GeometryReviewEditor /> : <GeometryReviewSession />;
  return <CampusApp />;
}
