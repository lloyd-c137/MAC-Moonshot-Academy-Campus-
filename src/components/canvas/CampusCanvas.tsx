import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { CAMPUS_EVENTS } from '../../data/mockEvents';
import { MapLayerMode, NavigationRoute } from '../../types/campus';
import { planToWorld, SPATIAL_PLAN } from '../../data/spatialPlan';
import { CampusCameraController, ViewMode } from './cameraController';
import { buildCampusScene, CampusModelRoom, CampusScene, loadCampusModel, ROOM_KIND_STYLE } from './campusModel3d';
import { Box, Info, Maximize, Minus, Plus, RotateCcw, Square, X } from 'lucide-react';
import { layerColor, NO_DATA_COLOR } from '../ui/mapLayers';

interface CampusCanvasProps {
  layerMode: MapLayerMode;
  selectedSpaceId: string | null;
  hoveredSpaceId: string | null;
  activeRoute: NavigationRoute | null;
  reviewMode: boolean;
  showNavGraph: boolean;
  showGrid: boolean;
  showSourceOverlay: boolean;
  hasSelectedSpace: boolean;
  onSelectSpace: (spaceId: string | null) => void;
  onHoverSpace: (spaceId: string | null) => void;
}

const SPACE_BY_ID = new Map(CAMPUS_SPACES.map((space) => [space.id, space]));
const NO_DATA = parseInt(NO_DATA_COLOR.slice(1), 16);
const LABEL_ZOOM = 1.55;

/** Room colour per map layer; rooms a data layer knows nothing about stay neutral. */
function roomColor(room: CampusModelRoom, mode: MapLayerMode): number {
  if (mode === 'explore') return ROOM_KIND_STYLE[room.kind].calm;
  if (mode === 'spaces') return ROOM_KIND_STYLE[room.kind].strong;
  return layerColor(mode, SPACE_BY_ID.get(room.id), CAMPUS_EVENTS, room.id) ?? NO_DATA;
}

function makeLabel(room: CampusModelRoom): CSS2DObject {
  const el = document.createElement('div');
  el.className = 'campus-room-label';
  el.innerHTML = `<span class="campus-room-label__id">${room.id}</span><span class="campus-room-label__name">${room.name}</span>`;
  const object = new CSS2DObject(el);
  object.position.set(room.label[0], 0.4, room.label[1]);
  object.userData.roomId = room.id;
  object.visible = false;
  object.userData.area = room.areaM2Polygon ?? room.areaM2Label ?? 0;
  return object;
}

export const CampusCanvas: React.FC<CampusCanvasProps> = ({
  layerMode,
  selectedSpaceId,
  hoveredSpaceId,
  showGrid,
  showSourceOverlay,
  hasSelectedSpace,
  onSelectSpace,
  onHoverSpace,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CampusCameraController | null>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const overlayRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const labelsRef = useRef<CSS2DObject[]>([]);
  const highlightRef = useRef<{ selected: string | null; hovered: string | null }>({ selected: null, hovered: null });
  // The scene is static: render only when the camera, highlight or a layer changes.
  const invalidateRef = useRef<() => void>(() => {});
  const selectRef = useRef(onSelectSpace);
  const hoverRef = useRef(onHoverSpace);
  selectRef.current = onSelectSpace;
  hoverRef.current = onHoverSpace;

  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>('plan');
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [modelVersion, setModelVersion] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  const roomWorld = (id: string): { x: number; z: number } | null => {
    const room = sceneRef.current?.roomById.get(id);
    if (room) return { x: room.label[0], z: room.label[1] };
    const space = SPACE_BY_ID.get(id);
    return space ? planToWorld(space.center) : null;
  };

  // Focus the camera on the selected space.
  useEffect(() => {
    if (!selectedSpaceId || !controllerRef.current) return;
    const point = roomWorld(selectedSpaceId);
    if (point) controllerRef.current.focusOnPosition(point.x, point.z, 2.4);
  }, [selectedSpaceId, modelVersion]);

  // Selection / hover highlight.
  useEffect(() => {
    highlightRef.current = { selected: selectedSpaceId, hovered: hoveredSpaceId };
    sceneRef.current?.setHighlight(selectedSpaceId, hoveredSpaceId);
    invalidateRef.current();
  }, [selectedSpaceId, hoveredSpaceId, modelVersion]);

  // Layer colouring.
  useEffect(() => {
    sceneRef.current?.setRoomColors((room) => roomColor(room, layerMode));
    sceneRef.current?.setDetailVisible(layerMode === 'explore' || layerMode === 'spaces');
    invalidateRef.current();
  }, [layerMode, modelVersion]);

  useEffect(() => {
    if (overlayRef.current) overlayRef.current.visible = showSourceOverlay;
    invalidateRef.current();
  }, [showSourceOverlay, modelVersion]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
    invalidateRef.current();
  }, [showGrid, modelVersion]);

  // Three.js scene initialisation.
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const abort = new AbortController();

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null; // the page's moonlight gradient shows through

    const frustumSize = 180;
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera((-frustumSize * aspect) / 2, (frustumSize * aspect) / 2, frustumSize / 2, -frustumSize / 2, 1, 2500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    let needsRender = true;
    const invalidate = () => { needsRender = true; };
    invalidateRef.current = invalidate;

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.className = 'campus-label-layer';
    container.appendChild(labelRenderer.domElement);

    // Lighting: soft sky fill + a low warm sun for wall shadows.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9dee4, 1.95));
    const sun = new THREE.DirectionalLight(0xfff6ec, 0.95);
    sun.position.set(-34, 130, -24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(3072, 3072);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.autoUpdate = false; // static geometry: shadow map is rebuilt only when the model loads
    scene.add(sun);
    scene.add(sun.target);

    // Source drawing overlay (review aid), floating just above the wall tops.
    const sourceMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
    const sourceOverlay = new THREE.Mesh(new THREE.PlaneGeometry(SPATIAL_PLAN.sourcePageWorldWidth, SPATIAL_PLAN.sourcePageWorldHeight), sourceMaterial);
    sourceOverlay.rotation.x = -Math.PI / 2;
    sourceOverlay.renderOrder = 10;
    sourceOverlay.visible = false;
    scene.add(sourceOverlay);
    overlayRef.current = sourceOverlay;
    new THREE.TextureLoader().load(SPATIAL_PLAN.sourceOverlay, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      sourceMaterial.map = texture;
      sourceMaterial.needsUpdate = true;
      invalidate();
    });

    const grid = new THREE.GridHelper(160, 16, 0x9aa4b2, 0xc6ccd4);
    grid.position.y = 0.06;
    grid.visible = false;
    scene.add(grid);
    gridRef.current = grid;

    const controller = new CampusCameraController(camera, renderer.domElement);
    controllerRef.current = controller;
    if (import.meta.env.DEV) Object.assign(window, { __campusController: controller });

    const raycaster = new THREE.Raycaster();
    const pickRoom = (ndc: THREE.Vector2): string | null => {
      const model = sceneRef.current;
      if (!model) return null;
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(model.pickables, false)[0];
      return (hit?.object.userData.roomId as string | undefined) ?? null;
    };

    controller.setCallbacks({
      onStateChange: () => { setCurrentViewMode(controller.targetViewMode); invalidate(); },
      onClickRaycast: (ndc) => selectRef.current(pickRoom(ndc)),
      onDoubleClickRaycast: (ndc) => {
        raycaster.setFromCamera(ndc, camera);
        const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        if (point) controller.zoomToPosition(point.x, point.z);
      },
      onHoverRaycast: (ndc) => {
        const id = pickRoom(ndc);
        hoverRef.current(id);
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
      },
    });

    loadCampusModel(abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return;
        const campus = buildCampusScene(data);
        scene.add(campus.root);
        sceneRef.current = campus;
        sourceOverlay.position.set(SPATIAL_PLAN.sourcePageWorldOffsetX, campus.wallTopY + 0.08, SPATIAL_PLAN.sourcePageWorldOffsetZ);
        const labels = data.rooms.map(makeLabel);
        labels.forEach((label) => scene.add(label));
        labelsRef.current = labels;
        const [minX, minZ, maxX, maxZ] = data.bounds;
        controller.setFitBounds({ minX, minZ, maxX, maxZ });
        sun.shadow.needsUpdate = true;
        invalidate();
        controller.setViewMode('explore');
        controller.fitToPlan();
        setModelState('ready');
        window.setTimeout(() => setSplashGone(true), 700);
        setModelVersion((v) => v + 1);
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        console.error('FF-01 campus model could not be loaded.', error);
        setModelState('error');
      });

    let lastLabelKey = '';
    const updateLabels = () => {
      const { selected, hovered } = highlightRef.current;
      const zoom = controller.state.zoom;
      const key = `${zoom.toFixed(2)}|${selected}|${hovered}`;
      if (key === lastLabelKey) return;
      lastLabelKey = key;
      // Large rooms get labels first; everything is labelled once zoomed in.
      const minArea = zoom >= LABEL_ZOOM ? 0 : zoom >= 1.05 ? 95 : Infinity;
      for (const label of labelsRef.current) {
        const id = label.userData.roomId as string;
        const active = id === selected || id === hovered;
        label.visible = active || label.userData.area >= minArea;
        label.element.classList.toggle('is-active', active);
        label.element.classList.toggle('is-selected', id === selected);
      }
    };

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controller.update();
      if (!needsRender) return;
      needsRender = false;
      updateLabels();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const asp = w / h;
      camera.left = (-frustumSize * asp) / 2;
      camera.right = (frustumSize * asp) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      invalidate();
    };
    window.addEventListener('resize', handleResize);

    const canvasElem = renderer.domElement;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL context lost, pausing render.');
    };
    canvasElem.addEventListener('webglcontextlost', handleContextLost, false);

    return () => {
      abort.abort();
      invalidateRef.current = () => {};
      window.removeEventListener('resize', handleResize);
      canvasElem.removeEventListener('webglcontextlost', handleContextLost);
      cancelAnimationFrame(animId);
      controller.dispose();
      controllerRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      labelsRef.current = [];
      overlayRef.current = null;
      gridRef.current = null;
      sourceOverlay.geometry.dispose();
      sourceMaterial.map?.dispose();
      sourceMaterial.dispose();
      grid.dispose();
      renderer.dispose();
      container.replaceChildren();
    };
  }, []);

  const controlButton = 'grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-white hover:text-ink';

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[radial-gradient(ellipse_75%_70%_at_50%_46%,#f3f5f8_0%,#e3e7eb_58%,#cfd6de_100%)]">
      <div ref={mountRef} className="relative isolate h-full w-full" />

      {!splashGone && (
        <div
          className={`absolute inset-0 z-40 grid place-items-center bg-regolith transition-opacity duration-700 ${modelState === 'ready' ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-6">
            <img src="/brand/mac-logo-256.png" alt="" className={`h-24 w-24 ${modelState === 'loading' ? 'animate-orbit' : ''}`} />
            <div className="text-center">
              <div className="wordmark text-lg font-semibold text-ink">Moonshot Academy Campus</div>
              <div className="mt-2 text-sm text-crater">
                {modelState === 'error' ? '校园模型没有加载出来。请检查网络后刷新页面。' : '正在根据 FF-01 图纸生成校园模型'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map controls: view mode, zoom, framing. Shifts left of the detail sheet when it is open. */}
      <div
        className={`absolute bottom-6 z-20 flex flex-col items-end gap-2 transition-[right] duration-500 ease-[var(--ease-orbit)] ${hasSelectedSpace ? 'right-6 lg:right-[27rem]' : 'right-6'} max-lg:bottom-auto max-lg:top-[8.5rem]`}
      >
        <div className="glass flex flex-col gap-0.5 rounded-full p-1" role="group" aria-label="视角">
          <button
            onClick={() => controllerRef.current?.setViewMode('explore')}
            aria-pressed={currentViewMode === 'explore'}
            title="立体视角"
            className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${currentViewMode === 'explore' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white'}`}
          >
            <Box className="h-4 w-4" />
            <span className="sr-only">立体视角</span>
          </button>
          <button
            onClick={() => controllerRef.current?.setViewMode('plan')}
            aria-pressed={currentViewMode === 'plan'}
            title="平面视角"
            className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${currentViewMode === 'plan' ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white'}`}
          >
            <Square className="h-4 w-4" />
            <span className="sr-only">平面视角</span>
          </button>
        </div>
        <div className="glass flex flex-col gap-0.5 rounded-full p-1" role="group" aria-label="缩放">
          <button onClick={() => controllerRef.current?.zoomIn()} title="放大" aria-label="放大" className={controlButton}><Plus className="h-4 w-4" /></button>
          <button onClick={() => controllerRef.current?.zoomOut()} title="缩小" aria-label="缩小" className={controlButton}><Minus className="h-4 w-4" /></button>
          <button onClick={() => controllerRef.current?.fitToPlan()} title="查看整个校园" aria-label="查看整个校园" className={controlButton}><Maximize className="h-4 w-4" /></button>
          <button onClick={() => { controllerRef.current?.resetView(); controllerRef.current?.fitToPlan(); }} title="恢复默认视角" aria-label="恢复默认视角" className={controlButton}><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Source of the model: quiet by default, details on request. */}
      <div className="absolute bottom-6 left-6 z-20 max-md:hidden">
        {infoOpen && (
          <div className="glass animate-rise absolute bottom-12 left-0 w-80 rounded-[var(--radius-tile)] p-4 text-[13px] leading-relaxed text-ink-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">这张地图是怎么来的</p>
              <button onClick={() => setInfoOpen(false)} aria-label="关闭说明" className="-m-1 rounded-full p-1 text-dust hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2">墙体、门洞、房间和看台座位都由 FF-01 一层平面图的 CAD 矢量生成，比例 1:300。</p>
            <p className="mt-2">墙高是示意值，房间边界还没有逐间人工核验。环境、人流数据是演示样例。室内导航暂未开放。</p>
            <p className="mt-3 border-t hairline pt-3 text-crater">拖动平移，滚轮缩放，右键拖动旋转。按 / 搜索房间。</p>
          </div>
        )}
        <button
          onClick={() => setInfoOpen((open) => !open)}
          aria-expanded={infoOpen}
          className="glass flex h-10 items-center gap-2 rounded-full px-3 text-xs text-ink-soft transition-colors hover:text-ink xl:pr-4"
        >
          <Info className="h-3.5 w-3.5 text-dust" />
          <span className="max-xl:sr-only">模型源自 FF-01 图纸，尚未逐间核验</span>
        </button>
      </div>
    </div>
  );
};
