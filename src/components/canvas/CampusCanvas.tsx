import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { CAMPUS_EVENTS } from '../../data/mockEvents';
import { CampusSpace, MapLayerMode, NavigationRoute } from '../../types/campus';
import { planToWorld, SPATIAL_PLAN } from '../../data/spatialPlan';
import { CampusCameraController, ViewMode } from './cameraController';
import { buildCampusScene, CampusModelRoom, CampusScene, loadCampusModel, ROOM_KIND_STYLE } from './campusModel3d';
import { Box, Info, Maximize, Minus, Plus, ScanLine, Square, X } from 'lucide-react';
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
  /** Spaces with live sensor readings and admin edits applied; drives data-layer colours. */
  spaces?: CampusSpace[];
  /** Opens the drawing-comparison panel (from the 关于地图 popover). */
  onOpenReview?: () => void;
}

const STATIC_SPACES = new Map(CAMPUS_SPACES.map((space) => [space.id, space]));
const NO_DATA = parseInt(NO_DATA_COLOR.slice(1), 16);
const LABEL_ZOOM = 1.55;

/** Room colour per map layer; rooms a data layer knows nothing about stay neutral. */
function roomColor(room: CampusModelRoom, mode: MapLayerMode, spaces: Map<string, CampusSpace>): number {
  if (mode === 'explore') return ROOM_KIND_STYLE[room.kind].calm;
  if (mode === 'spaces') return ROOM_KIND_STYLE[room.kind].strong;
  return layerColor(mode, spaces.get(room.id), CAMPUS_EVENTS, room.id) ?? NO_DATA;
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
  spaces,
  onOpenReview,
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
  const [northDeg, setNorthDeg] = useState(0);
  const [scale, setScale] = useState({ metres: 10, px: 80 });
  const [splashGone, setSplashGone] = useState(false);

  const roomWorld = (id: string): { x: number; z: number } | null => {
    const room = sceneRef.current?.roomById.get(id);
    if (room) return { x: room.label[0], z: room.label[1] };
    const space = STATIC_SPACES.get(id);
    return space ? planToWorld(space.center) : null;
  };

  // Focus the camera on the selected space.
  useEffect(() => {
    if (!selectedSpaceId || !controllerRef.current) return;
    const point = roomWorld(selectedSpaceId);
    if (!point) return;
    const narrow = (mountRef.current?.clientWidth ?? 1200) < 1024;
    const height = mountRef.current?.clientHeight ?? 800;
    // Wide screens: keep the room left of the side sheet. Phones: lift it above the bottom sheet.
    controllerRef.current.focusOnPosition(point.x, point.z, 2.4, narrow ? 0 : undefined, narrow ? height * 0.22 : 0);
  }, [selectedSpaceId, modelVersion]);

  // Selection / hover highlight.
  useEffect(() => {
    highlightRef.current = { selected: selectedSpaceId, hovered: hoveredSpaceId };
    sceneRef.current?.setHighlight(selectedSpaceId, hoveredSpaceId);
    invalidateRef.current();
  }, [selectedSpaceId, hoveredSpaceId, modelVersion]);

  // Layer colouring.
  useEffect(() => {
    const byId = spaces ? new Map(spaces.map((sp) => [sp.id, sp])) : STATIC_SPACES;
    sceneRef.current?.setRoomColors((room) => roomColor(room, layerMode, byId));
    sceneRef.current?.setDetailVisible(layerMode === 'explore' || layerMode === 'spaces');
    invalidateRef.current();
  }, [layerMode, modelVersion, spaces]);

  // Room names edited in /admin replace the drawing names on the map labels.
  useEffect(() => {
    if (!spaces) return;
    for (const label of labelsRef.current) {
      const id = label.userData.roomId as string;
      const space = spaces.find((sp) => sp.id === id);
      const nameEl = label.element.querySelector('.campus-room-label__name');
      if (!space || !nameEl) continue;
      if (label.userData.drawingName === undefined) label.userData.drawingName = nameEl.textContent;
      const edited = space.name !== STATIC_SPACES.get(id)?.name;
      const next = edited ? space.name.replace(new RegExp(`^${id}\\s*`), '') : (label.userData.drawingName as string);
      if (nameEl.textContent !== next) { nameEl.textContent = next; label.userData.size = undefined; }
    }
    invalidateRef.current();
  }, [spaces, modelVersion]);

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
      onStateChange: (state) => {
        setCurrentViewMode(controller.targetViewMode);
        setNorthDeg(Math.round((state.azimuth * 180) / Math.PI));
        // Scale bar: the largest "nice" length that fits in ~110 px.
        const mpp = controller.metresPerPixel;
        const metres = [1, 2, 5, 10, 20, 50, 100].filter((m) => m / mpp <= 110).pop() ?? 1;
        setScale((prev) => (prev.metres === metres && Math.abs(prev.px - metres / mpp) < 0.5 ? prev : { metres, px: Math.round(metres / mpp) }));
        invalidate();
      },
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

    // Labels: priority order (selected, hovered, then larger rooms); any label that would
    // overlap one already placed is hidden, so the map never shows a pile of chips.
    const projected = new THREE.Vector3();
    const updateLabels = () => {
      const { selected, hovered } = highlightRef.current;
      const zoom = controller.state.zoom;
      const minArea = zoom >= LABEL_ZOOM ? 0 : zoom >= 1.05 ? 95 : Infinity;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const placed: Array<[number, number, number, number]> = [];
      const ordered = [...labelsRef.current].sort((a, b) => {
        const rank = (o: CSS2DObject) => (o.userData.roomId === selected ? 2e6 : o.userData.roomId === hovered ? 1e6 : (o.userData.area as number));
        return rank(b) - rank(a);
      });
      for (const label of ordered) {
        const id = label.userData.roomId as string;
        const active = id === selected || id === hovered;
        label.element.classList.toggle('is-active', active);
        label.element.classList.toggle('is-selected', id === selected);
        if (!active && label.userData.area < minArea) { label.visible = false; continue; }
        projected.copy(label.position).project(camera);
        const x = ((projected.x + 1) / 2) * w;
        const y = ((1 - projected.y) / 2) * h;
        if (x < -60 || x > w + 60 || y < -30 || y > h + 30) { label.visible = false; continue; }
        if (!label.userData.size && label.element.offsetWidth) label.userData.size = [label.element.offsetWidth, label.element.offsetHeight];
        const [lw, lh] = (label.userData.size as [number, number] | undefined) ?? [label.element.textContent!.length * 9 + 18, 30];
        const box: [number, number, number, number] = [x - lw / 2 - 3, y - lh / 2 - 2, x + lw / 2 + 3, y + lh / 2 + 2];
        const overlaps = placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
        label.visible = active || !overlaps;
        if (label.visible) placed.push(box);
      }
    };

    let animId = 0;
    let lastFrame = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controller.update();
      const now = performance.now();
      if (sceneRef.current?.tick(now - lastFrame)) needsRender = true;
      lastFrame = now;
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
        <div className="glass flex flex-col gap-0.5 rounded-[18px] p-1" role="group" aria-label="视角">
          {([['explore', '立体', Box], ['plan', '平面', Square]] as const).map(([mode, text, Icon]) => (
            <button
              key={mode}
              onClick={() => controllerRef.current?.setViewMode(mode)}
              aria-pressed={currentViewMode === mode}
              className={`flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[10px] font-medium ${currentViewMode === mode ? 'bg-ink text-white' : 'text-ink-soft hover:bg-white'}`}
            >
              <Icon className="h-3.5 w-3.5" />{text}
            </button>
          ))}
        </div>
        <button
          onClick={() => controllerRef.current?.faceNorth()}
          title={northDeg % 360 === 0 ? '北方朝上' : '点击让北方朝上'}
          aria-label="指北针，点击让北方朝上"
          className="glass group grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 transition-transform duration-300" style={{ transform: `rotate(${northDeg}deg)` }} aria-hidden="true">
            <path d="M12 2.5 15.2 12H8.8Z" fill="#ff7a00" />
            <path d="M12 21.5 8.8 12h6.4Z" fill="#c9cfd7" />
            <text x="12" y="10.4" textAnchor="middle" fontSize="4.6" fontWeight="700" fill="#fff" fontFamily="Unbounded, sans-serif">N</text>
          </svg>
        </button>
        <div className="glass flex flex-col gap-0.5 rounded-full p-1" role="group" aria-label="缩放">
          <button onClick={() => controllerRef.current?.zoomIn()} title="放大" aria-label="放大" className={controlButton}><Plus className="h-4 w-4" /></button>
          <button onClick={() => controllerRef.current?.zoomOut()} title="缩小" aria-label="缩小" className={controlButton}><Minus className="h-4 w-4" /></button>
          <button onClick={() => { controllerRef.current?.resetView(); controllerRef.current?.fitToPlan(); }} title="回到全景" aria-label="回到全景" className={controlButton}><Maximize className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Scale bar: snaps to 1 / 2 / 5 / 10 / 20 / 50 / 100 m. */}
      <div className="pointer-events-none absolute bottom-[4.6rem] left-7 z-20 flex items-end gap-2 text-[11px] font-medium text-ink-soft max-md:hidden" aria-label={`比例尺 ${scale.metres} 米`}>
        <div className="h-1.5 border-x-2 border-b-2 border-ink-soft/70 transition-[width] duration-200" style={{ width: scale.px }} />
        <span>{scale.metres} m</span>
      </div>

      {/* Source of the model: quiet by default, details on request. */}
      <div className="absolute bottom-6 left-6 z-20 max-md:hidden">
        {infoOpen && (
          <div className="glass animate-rise absolute bottom-12 left-0 w-80 rounded-[var(--radius-tile)] p-4 text-[13px] leading-relaxed text-ink-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">关于这张地图</p>
              <button onClick={() => setInfoOpen(false)} aria-label="关闭" className="-m-1 rounded-full p-1 text-dust hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2">根据一层平面图（FF-01）生成。房间边界还在逐间核对，墙高是示意值。室内导航暂未开放。</p>
            <p className="mt-2 text-crater">拖动平移，滚轮缩放，右键拖动旋转，按 / 搜索。</p>
            {onOpenReview && (
              <button onClick={() => { setInfoOpen(false); onOpenReview(); }} className="mt-3 flex items-center gap-2 rounded-full border hairline bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
                <ScanLine className="h-4 w-4" />对照原图
              </button>
            )}
          </div>
        )}
        <button
          onClick={() => setInfoOpen((open) => !open)}
          aria-expanded={infoOpen}
          className="glass flex h-10 items-center gap-2 rounded-full px-3.5 text-[12px] font-medium text-ink-soft hover:text-ink"
        >
          <Info className="h-3.5 w-3.5" />关于地图
        </button>
      </div>
    </div>
  );
};
