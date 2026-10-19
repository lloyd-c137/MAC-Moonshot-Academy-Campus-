import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { CAMPUS_EVENTS } from '../../data/mockEvents';
import { CampusSpace, MapLayerMode } from '../../types/campus';
import type { RouteStep, WalkRoute } from '../../services/pathfinding';
import { RouteLayer } from './routeLayer';
import { planToWorld, SPATIAL_PLAN } from '../../data/spatialPlan';
import { CampusCameraController, ViewMode } from './cameraController';
import { buildCampusScene, CampusModelRoom, CampusScene, ROOM_KIND_STYLE } from './campusModel3d';
import { loadCampusCore, loadCampusDetail, loadNavGrid } from './modelLoader';
import { dismissBootSplash, setBootStage } from '../../bootSplash';
import { Box, Info, Maximize, Minus, Plus, ScanLine, Square, X } from 'lucide-react';
import { layerColor, NO_DATA_COLOR } from '../ui/mapLayers';

interface CampusCanvasProps {
  layerMode: MapLayerMode;
  selectedSpaceId: string | null;
  hoveredSpaceId: string | null;
  /** Walking route to draw; the camera frames it whenever routeFrameNonce changes. */
  route?: WalkRoute | null;
  routeSteps?: RouteStep[];
  /** Step-by-step guidance: the step the walker is at (null = route overview). */
  routeStep?: number | null;
  routeFrameNonce?: number;
  /** Guidance hides the map's own controls on small screens. */
  guiding?: boolean;
  /** While guiding, frame the whole route instead of the current leg. */
  routeOverview?: boolean;
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
/** Wall height (fraction of 2.8 m) while a route is shown. */
const ROUTE_WALL_HEIGHT = 0.32;

/** Room colour per map layer; rooms a data layer knows nothing about stay neutral. */
function roomColor(room: CampusModelRoom, mode: MapLayerMode, spaces: Map<string, CampusSpace>): number {
  if (mode === 'explore') return ROOM_KIND_STYLE[room.kind].calm;
  if (mode === 'spaces') return ROOM_KIND_STYLE[room.kind].strong;
  return layerColor(mode, spaces.get(room.id), CAMPUS_EVENTS, room.id) ?? NO_DATA;
}

/**
 * A room label: a DOM chip positioned with a compositor-only transform.
 * Only changed values are written, so a frame where nothing moved touches no styles.
 */
interface RoomLabel {
  roomId: string;
  element: HTMLDivElement;
  nameEl: HTMLSpanElement;
  world: THREE.Vector3;
  area: number;
  /** Measured once (CSS px); invalidated when the text changes. */
  size: [number, number] | null;
  drawingName?: string;
  shown: boolean;
  x: number;
  y: number;
  state: '' | 'active' | 'selected';
}

function makeLabel(room: CampusModelRoom): RoomLabel {
  const el = document.createElement('div');
  el.className = 'campus-room-label';
  el.innerHTML = (room.code ? `<span class="campus-room-label__id">${room.code}</span>` : '') + `<span class="campus-room-label__name">${room.name}</span>`;
  if (!room.code) el.classList.add('is-uncoded');
  return {
    roomId: room.id,
    element: el,
    nameEl: el.querySelector('.campus-room-label__name') as HTMLSpanElement,
    world: new THREE.Vector3(room.label[0], 0.4, room.label[1]),
    area: room.areaM2Polygon ?? room.areaM2Label ?? 0,
    size: null,
    shown: false,
    x: NaN,
    y: NaN,
    state: '',
  };
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
  route = null,
  routeSteps,
  routeStep = null,
  routeFrameNonce = 0,
  guiding = false,
  routeOverview = false,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CampusCameraController | null>(null);
  const sceneRef = useRef<CampusScene | null>(null);
  const overlayRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const routeLayerRef = useRef<RouteLayer | null>(null);
  const routeStepRef = useRef<number | null>(routeStep);
  routeStepRef.current = routeStep;
  const labelsRef = useRef<RoomLabel[]>([]);
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
  // Compass and scale bar change every frame of a gesture: written straight to the DOM, not through React.
  const [northUp, setNorthUp] = useState(true);
  const compassRef = useRef<SVGSVGElement>(null);
  const scaleBarRef = useRef<HTMLDivElement>(null);
  const scaleTextRef = useRef<HTMLSpanElement>(null);

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
    controllerRef.current.focusOnPosition(point.x, point.z, 2.4, // never zooms out (controller keeps a closer zoom)
      narrow ? 0 : undefined, narrow ? height * 0.22 : 0);
  }, [selectedSpaceId, modelVersion]);

  // Walking route: rebuild the drawn route whenever it changes.
  useEffect(() => {
    const scene = threeSceneRef.current;
    if (!scene) return;
    if (routeLayerRef.current) {
      scene.remove(routeLayerRef.current.group);
      routeLayerRef.current.dispose();
      routeLayerRef.current = null;
    }
    // Low walls while a route is on the map, so corridors stay visible in 2.5D.
    sceneRef.current?.setWallHeight(route ? ROUTE_WALL_HEIGHT : 1);
    if (route && route.points.length) {
      const layer = new RouteLayer(route.points, routeSteps ?? []);
      layer.setProgress(routeStepRef.current);
      scene.add(layer.group);
      routeLayerRef.current = layer;
    }
    invalidateRef.current();
  }, [route, routeSteps, modelVersion]);

  // Guidance progress restyles the route (walked / current / ahead, turn arrow).
  useEffect(() => {
    routeLayerRef.current?.setProgress(routeStep);
    invalidateRef.current();
  }, [routeStep]);

  // Camera: overview frames the whole route beside the panel; guidance turns the map so the
  // current leg points up the screen and frames it between the banner and the bottom bar.
  useEffect(() => {
    const controller = controllerRef.current;
    const container = mountRef.current;
    if (!route || !controller || !container || route.points.length === 0) return;
    const box = container.getBoundingClientRect();
    const narrow = box.width < 768;
    const steps = routeSteps ?? [];
    const k = routeStep;
    const banner = document.querySelector('[data-route-banner]')?.getBoundingClientRect();
    const bar = document.querySelector('[data-route-bar]')?.getBoundingClientRect();
    const guideInset = {
      top: banner ? banner.bottom - box.top + 16 : 140,
      bottom: bar ? box.bottom - bar.top + 16 : 150,
      left: narrow ? 16 : 32,
      right: narrow ? 16 : 96,
    };
    if (k === null || steps.length < 2 || routeOverview) {
      const panel = document.querySelector('[data-route-panel]')?.getBoundingClientRect();
      const inset = k !== null ? guideInset : narrow
        ? { top: panel ? panel.bottom - box.top + 12 : 80, bottom: 90, left: 16, right: 16 }
        : { left: panel ? panel.right - box.left + 16 : 24, top: 80, bottom: 96, right: 88 };
      controller.framePoints(route.points, inset);
      return;
    }
    const inset = guideInset;
    const pts = route.points;
    const last = steps.length - 1;
    if (k >= last) {
      // Arrived: the last few metres and the destination, keeping the current heading.
      controller.framePoints(pts.slice(Math.max(0, steps[Math.max(0, last - 1)].pointIndex)), inset, { viewMode: 'explore', minSpanM: 16, maxZoom: 3.4 });
      return;
    }
    const i0 = steps[k].pointIndex;
    const i1 = steps[k + 1].pointIndex;
    const leg = pts.slice(i0, i1 + 1);
    // Show a little of what comes after the maneuver, so the turn is visible.
    const after = pts[Math.min(pts.length - 1, i1 + 1)];
    const end = pts[i1];
    const look: [number, number] = (() => {
      const dx = after[0] - end[0], dz = after[1] - end[1];
      const len = Math.hypot(dx, dz);
      return len > 0 ? [end[0] + (dx / len) * Math.min(5, len), end[1] + (dz / len) * Math.min(5, len)] : end;
    })();
    const [sx, sz] = pts[i0];
    const hx = end[0] - sx, hz = end[1] - sz;
    const azimuth = Math.atan2(-hx, -hz); // walking direction points up the screen
    controller.framePoints([...leg, look], inset, { azimuth, viewMode: 'explore', polar: 0.82, minSpanM: 14, maxZoom: 3.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeFrameNonce, modelVersion]);

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
    const byId = new Map(spaces.map((sp) => [sp.id, sp]));
    for (const label of labelsRef.current) {
      const id = label.roomId;
      const space = byId.get(id);
      if (!space) continue;
      if (label.drawingName === undefined) label.drawingName = label.nameEl.textContent ?? '';
      const edited = space.name !== STATIC_SPACES.get(id)?.name;
      const next = edited ? space.name.replace(new RegExp(`^${id}\\s*`), '') : label.drawingName;
      if (label.nameEl.textContent !== next) { label.nameEl.textContent = next; label.size = null; }
    }
    invalidateRef.current();
  }, [spaces, modelVersion]);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.visible = showSourceOverlay;
      if (showSourceOverlay) overlayRef.current.userData.load?.();
    }
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
    const abort = new AbortController(); // marks the effect as torn down

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    threeSceneRef.current = scene;
    scene.background = null; // the page's moonlight gradient shows through

    const frustumSize = 180;
    const aspect = width / height;
    const camera = new THREE.OrthographicCamera((-frustumSize * aspect) / 2, (frustumSize * aspect) / 2, frustumSize / 2, -frustumSize / 2, 1, 2500);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    // Pixel ratio: full sharpness by default. If this GPU cannot keep up while the map moves, step it
    // down once and keep it there (never toggled per gesture: that reallocates the canvas and hitches).
    const maxDpr = Math.min(window.devicePixelRatio, 2);
    const dprSteps = [maxDpr, 1.5, 1.25, 1].filter((v, i, all) => v <= maxDpr && all.indexOf(v) === i);
    let dprStep = 0;
    try { dprStep = Math.min(dprSteps.length - 1, Number(sessionStorage.getItem('campus-dpr-step')) || 0); } catch { /* storage blocked */ }
    renderer.setPixelRatio(dprSteps[dprStep]);
    let motionFrames = 0;
    let slowFrames = 0;
    let lastRenderAt = 0;
    const watchFrameTime = (now: number, moving: boolean) => {
      const dt = now - lastRenderAt;
      lastRenderAt = now;
      if (!moving || dt > 120 || document.hidden) return; // pauses and background tabs say nothing about the GPU
      motionFrames++;
      if (dt > 24) slowFrames++; // below ~40 fps
      if (motionFrames < 45) return;
      if (slowFrames / motionFrames > 0.6 && dprStep < dprSteps.length - 1) {
        dprStep++;
        renderer.setPixelRatio(dprSteps[dprStep]);
        try { sessionStorage.setItem('campus-dpr-step', String(dprStep)); } catch { /* storage blocked */ }
      }
      motionFrames = 0;
      slowFrames = 0;
    };
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    // Render on demand: the loop sleeps until something changes.
    let needsRender = true;
    let frameId = 0;
    const wake = () => { if (!frameId) frameId = requestAnimationFrame(frame); };
    const invalidate = () => { needsRender = true; wake(); };
    invalidateRef.current = invalidate;

    const labelLayer = document.createElement('div');
    labelLayer.className = 'campus-label-layer';
    container.appendChild(labelLayer);
    let viewW = width;
    let viewH = height;

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
    // The drawing (~300 KB) is only fetched the first time someone opens 对照原图.
    sourceOverlay.userData.load = () => {
      if (sourceOverlay.userData.loading) return;
      sourceOverlay.userData.loading = true;
      new THREE.TextureLoader().load(SPATIAL_PLAN.sourceOverlay, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        sourceMaterial.map = texture;
        sourceMaterial.needsUpdate = true;
        invalidate();
      });
    };

    const grid = new THREE.GridHelper(160, 16, 0x9aa4b2, 0xc6ccd4);
    grid.position.y = 0.06;
    grid.visible = false;
    scene.add(grid);
    gridRef.current = grid;

    const controller = new CampusCameraController(camera, renderer.domElement);
    controllerRef.current = controller;
    if (import.meta.env.DEV) Object.assign(window, { __campusController: controller });

    let lastDeg = NaN;
    let lastMpp = NaN;
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
        setCurrentViewMode(controller.targetViewMode); // React skips the render when unchanged
        const deg = (state.azimuth * 180) / Math.PI;
        if (deg !== lastDeg) {
          lastDeg = deg;
          compassRef.current?.style.setProperty('transform', `rotate(${deg.toFixed(1)}deg)`);
          setNorthUp(Math.abs(Math.round(deg) % 360) === 0);
        }
        // Scale bar: the largest "nice" length that fits in ~110 px.
        const mpp = controller.metresPerPixel;
        if (mpp !== lastMpp) {
          lastMpp = mpp;
          const metres = [1, 2, 5, 10, 20, 50, 100].filter((m) => m / mpp <= 110).pop() ?? 1;
          if (scaleBarRef.current) scaleBarRef.current.style.width = `${Math.round(metres / mpp)}px`;
          if (scaleTextRef.current && scaleTextRef.current.textContent !== `${metres} m`) {
            scaleTextRef.current.textContent = `${metres} m`;
            scaleTextRef.current.parentElement?.setAttribute('aria-label', `比例尺 ${metres} 米`);
          }
        }
        invalidate();
      },
      onActivity: wake,
      onDragChange: (dragging) => { renderer.domElement.style.cursor = dragging ? 'grabbing' : 'grab'; },
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

    loadCampusCore()
      .then(async (data) => {
        if (abort.signal.aborted) return;
        // Let the startup screen show the new stage before the (synchronous) scene build.
        setBootStage('正在生成 3D 校园');
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        if (abort.signal.aborted) return;
        const campus = buildCampusScene(data);
        scene.add(campus.root);
        sceneRef.current = campus;
        sourceOverlay.position.set(SPATIAL_PLAN.sourcePageWorldOffsetX, campus.wallTopY + 0.08, SPATIAL_PLAN.sourcePageWorldOffsetZ);
        // Largest rooms first: they win label collisions.
        const labels = data.rooms.map(makeLabel).sort((a, b) => b.area - a.area);
        labelLayer.replaceChildren(...labels.map((label) => label.element));
        // Measure every chip in one layout pass now, instead of one forced layout per chip mid-gesture.
        const measure = () => { for (const label of labels) label.size = [label.element.offsetWidth, label.element.offsetHeight]; };
        measure();
        labelsRef.current = labels;
        // Web fonts arrive after first paint and change chip widths.
        document.fonts?.ready.then(() => { if (!abort.signal.aborted) { measure(); invalidate(); } });
        const [minX, minZ, maxX, maxZ] = data.bounds;
        controller.setFitBounds({ minX, minZ, maxX, maxZ });
        sun.shadow.needsUpdate = true;
        invalidate();
        setModelState('ready');
        // The first frame (shadow map, shader compile) can take a while on slow machines. Present it
        // while the startup screen still covers the map; then dissolve the screen and tilt into 3D
        // together, so the intro motion is never skipped by a blocked main thread.
        requestAnimationFrame(() => requestAnimationFrame(async () => {
          if (abort.signal.aborted) return;
          await dismissBootSplash(); // the name gets its moment; the map tilts in as the screen fades
          if (abort.signal.aborted) return;
          controller.setViewMode('explore');
          controller.fitToPlan();
          setModelVersion((v) => v + 1); // runs ?room= focus after the fit
        }));
        // Floor detail lines are not needed for the first frame; fetch them when the browser is idle.
        const whenIdle = (window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300))) as (cb: () => void) => void;
        whenIdle(() => {
          loadCampusDetail()
            .then((detail) => { if (!abort.signal.aborted) { campus.addFloorDetail(detail); invalidate(); } })
            .catch((error) => console.warn('Floor detail lines could not be loaded.', error))
            // Then the walking grid (~46 KB), so 路线 is ready by the time someone opens it.
            .finally(() => { loadNavGrid().catch(() => {}); });
        });
      })
      .catch((error) => {
        if (abort.signal.aborted) return;
        console.error('FF-01 campus model could not be loaded.', error);
        setModelState('error');
        void dismissBootSplash();
      });

    // Labels: priority order (selected, hovered, then larger rooms); any label that would
    // overlap one already placed is hidden, so the map never shows a pile of chips.
    const projected = new THREE.Vector3();
    const placed: number[] = []; // flat [x0, y0, x1, y1, …], reused every frame
    const setState = (label: RoomLabel, state: RoomLabel['state']) => {
      if (label.state === state) return;
      label.state = state;
      label.element.classList.toggle('is-active', state !== '');
      label.element.classList.toggle('is-selected', state === 'selected');
    };
    const place = (label: RoomLabel, active: boolean): boolean => {
      projected.copy(label.world).project(camera);
      const x = ((projected.x + 1) / 2) * viewW;
      const y = ((1 - projected.y) / 2) * viewH;
      if (x < -60 || x > viewW + 60 || y < -30 || y > viewH + 30) return false;
      if (!label.size) label.size = [label.element.offsetWidth || label.element.textContent!.length * 9 + 18, label.element.offsetHeight || 30];
      const [lw, lh] = label.size;
      const x0 = x - lw / 2 - 3, y0 = y - lh / 2 - 2, x1 = x + lw / 2 + 3, y1 = y + lh / 2 + 2;
      if (!active) {
        for (let i = 0; i < placed.length; i += 4) {
          if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) return false;
        }
      }
      placed.push(x0, y0, x1, y1);
      // Snap to device pixels so text stays crisp, and skip the write when nothing moved.
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.round((x - lw / 2) * dpr) / dpr;
      const sy = Math.round((y - lh / 2) * dpr) / dpr;
      if (sx !== label.x || sy !== label.y) {
        label.x = sx;
        label.y = sy;
        label.element.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      }
      return true;
    };
    const show = (label: RoomLabel, visible: boolean) => {
      if (label.shown === visible) return;
      label.shown = visible;
      label.element.classList.toggle('is-shown', visible);
    };
    const updateLabels = () => {
      const { selected, hovered } = highlightRef.current;
      const zoom = controller.state.zoom;
      const minArea = zoom >= LABEL_ZOOM ? 0 : zoom >= 1.05 ? 95 : Infinity;
      placed.length = 0;
      const labels = labelsRef.current;
      // Active labels claim their space first.
      for (const label of labels) {
        const state = label.roomId === selected ? 'selected' : label.roomId === hovered ? 'active' : '';
        setState(label, state);
        if (state) show(label, place(label, true));
      }
      for (const label of labels) {
        if (label.state) continue;
        show(label, label.area >= minArea && place(label, false));
      }
    };

    let lastFrame = performance.now();
    function frame() {
      frameId = 0;
      controller.update();
      const now = performance.now();
      const wallsWereMoving = sceneRef.current?.wallsMoving ?? false;
      const fading = sceneRef.current?.tick(Math.min(64, now - lastFrame)) ?? false;
      if (wallsWereMoving) sun.shadow.needsUpdate = true; // shadows follow the wall height
      lastFrame = now;
      if (fading) needsRender = true;
      if (needsRender) {
        needsRender = false;
        updateLabels();
        renderer.render(scene, camera);
        watchFrameTime(now, controller.isAnimating || controller.isInteracting);
      }
      // Keep going only while something is animating.
      if (controller.isAnimating || fading || needsRender) wake();
    }
    wake();

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
      viewW = w;
      viewH = h;
      for (const label of labelsRef.current) label.size = null;
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
      cancelAnimationFrame(frameId);
      controller.dispose();
      controllerRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      labelsRef.current = [];
      overlayRef.current = null;
      gridRef.current = null;
      if (routeLayerRef.current) { routeLayerRef.current.dispose(); routeLayerRef.current = null; }
      threeSceneRef.current = null;
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

      {modelState === 'error' && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-regolith" role="alert">
          <div className="text-center">
            <p className="text-[15px] font-semibold text-ink">校园模型没有加载出来</p>
            <p className="mt-1 text-[13px] text-crater">请检查网络后刷新页面。</p>
            <button onClick={() => window.location.reload()} className="mt-4 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white hover:bg-ink-soft">刷新</button>
          </div>
        </div>
      )}

      {/* Map controls: view mode, zoom, framing. Shifts left of the detail sheet when it is open. */}
      <div
        className={`absolute bottom-6 z-20 flex flex-col items-end gap-2 transition-[right] duration-500 ease-[var(--ease-orbit)] ${hasSelectedSpace ? 'right-6 lg:right-[27rem]' : 'right-6'} max-lg:bottom-auto max-lg:top-[8.5rem] ${guiding ? 'max-lg:hidden' : ''}`}
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
          title={northUp ? '北方朝上' : '点击让北方朝上'}
          aria-label="指北针，点击让北方朝上"
          className="glass group grid h-11 w-11 place-items-center rounded-full transition-transform active:scale-95"
        >
          <svg ref={compassRef} viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
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
      <div className="pointer-events-none absolute bottom-[4.6rem] left-7 z-20 flex items-end gap-2 text-[11px] font-medium text-ink-soft max-md:hidden" aria-label="比例尺 10 米">
        <div ref={scaleBarRef} className="h-1.5 border-x-2 border-b-2 border-ink-soft/70" style={{ width: 80 }} />
        <span ref={scaleTextRef}>10 m</span>
      </div>

      {/* Source of the model: quiet by default, details on request. */}
      <div className={`absolute bottom-6 left-6 z-20 max-md:hidden ${guiding ? 'hidden' : ''}`}>
        {infoOpen && (
          <div className="glass animate-rise absolute bottom-12 left-0 w-80 rounded-[var(--radius-tile)] p-4 text-[13px] leading-relaxed text-ink-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-ink">关于这张地图</p>
              <button onClick={() => setInfoOpen(false)} aria-label="关闭" className="-m-1 rounded-full p-1 text-dust hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2">根据一层平面图（FF-01）生成。房间边界还在逐间核对，墙高是示意值。路线按图纸推算，门禁和开放时间未核实。</p>
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
