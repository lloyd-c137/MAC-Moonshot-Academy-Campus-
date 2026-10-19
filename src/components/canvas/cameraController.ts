import * as THREE from 'three';
import { SPATIAL_PLAN } from '../../data/spatialPlan';

export type ViewMode = 'explore' | 'plan';

export interface CameraState {
  viewMode: ViewMode;
  target: THREE.Vector3;
  zoom: number;
  polar: number;
  azimuth: number;
  distance: number;
}

type CameraCallbacks = {
  onStateChange?: (state: CameraState) => void;
  onClickRaycast?: (ndc: THREE.Vector2) => void;
  onDoubleClickRaycast?: (ndc: THREE.Vector2) => void;
  onHoverRaycast?: (ndc: THREE.Vector2) => void;
  /** Something started moving (animation, inertia, smooth zoom); the render loop should wake up. */
  onActivity?: () => void;
  /** Drag started / ended, for the grab cursor. */
  onDragChange?: (dragging: boolean) => void;
};

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 8;
const PLAN_POLAR = 0;
const MIN_POLAR = 0.45;
const MAX_POLAR = 1.28;

// Feel constants.
const DRAG_THRESHOLD_MOUSE = 3;   // px before a press becomes a drag
const DRAG_THRESHOLD_TOUCH = 8;
const INERTIA_DECAY_MS = 325;     // time constant of the glide after a fling
const INERTIA_MIN_SPEED = 0.06;   // px/ms below which a release does not glide
const VELOCITY_WINDOW_MS = 90;    // how far back to look when estimating release velocity
const WHEEL_ZOOM_SMOOTH_MS = 70;  // time constant for mouse-wheel zoom easing
const ROTATE_SPEED = 0.006;       // rad per px

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

interface Sample { t: number; x: number; y: number; az: number }

/**
 * Orthographic map camera with direct manipulation:
 * - drag pans with the ground point under the finger staying under it, then glides;
 * - right-drag, ⌘/Ctrl-drag or two-finger twist rotates (and tilts), also with glide;
 * - mouse wheel zooms smoothly toward the cursor; trackpad pinch zooms 1:1;
 *   trackpad two-finger scroll pans;
 * - fly-to animations ease out, interpolate zoom in log space and can be interrupted.
 */
export class CampusCameraController {
  public state: CameraState = {
    viewMode: 'plan',
    target: new THREE.Vector3(),
    zoom: 1,
    polar: PLAN_POLAR,
    azimuth: 0,
    distance: 600,
  };

  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointers = new Map<number, THREE.Vector2>();
  private callbacks: CameraCallbacks = {};
  private primaryPointer: number | null = null;
  private dragMode: 'pan' | 'rotate' = 'pan';
  private pointerStart = new THREE.Vector2();
  private pointerLast = new THREE.Vector2();
  private pointerType = 'mouse';
  private hasMoved = false;
  private dragging = false;
  private pinchDistance = 0;
  private pinchAngle = 0;
  private pinchMidpoint = new THREE.Vector2();
  private samples: Sample[] = [];

  // Fly-to transitions.
  private transitioning = false;
  private transitionStart: CameraState | null = null;
  private transitionEnd: CameraState | null = null;
  private transitionStartTime = 0;
  private transitionDuration = 500;
  private transitionEase: (t: number) => number = easeOutCubic;

  // Inertia (screen px/ms for pan, rad/ms for rotation).
  private glide = { vx: 0, vy: 0, vaz: 0, active: false };
  // Smooth wheel zoom toward an anchor.
  private zoomGoal: number | null = null;
  private zoomAnchor = new THREE.Vector2();

  private lastUpdate = performance.now();
  private explorePolar = 0.95;
  private exploreAzimuth = Math.PI / 4;
  private lastTouchTapAt = 0;
  private lastTouchTap = new THREE.Vector2(-Infinity, -Infinity);
  private fitBounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;

  constructor(
    private readonly camera: THREE.OrthographicCamera,
    private readonly domElement: HTMLElement,
  ) {
    this.domElement.style.touchAction = 'none';
    this.bindEvents();
    this.updateCameraTransform();
  }

  public setCallbacks(callbacks: CameraCallbacks) {
    this.callbacks = callbacks;
  }

  private bindEvents() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.domElement.addEventListener('lostpointercapture', this.onPointerCancel);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.resizeObserver?.observe(this.domElement);
    window.addEventListener('resize', this.dropRect);
    window.addEventListener('scroll', this.dropRect, true);
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.domElement.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    cancelAnimationFrame(this.hoverFrame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.dropRect);
    window.removeEventListener('scroll', this.dropRect, true);
    for (const id of this.pointers.keys()) this.releasePointer(id);
    this.pointers.clear();
  }

  private onContextMenu = (event: MouseEvent) => event.preventDefault();

  // The canvas rect is read on every pointer move; cache it so a move never forces a layout.
  private rectCache: DOMRect | null = null;
  private readonly resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { this.rectCache = null; }) : null;
  private readonly dropRect = () => { this.rectCache = null; };
  private rect(): DOMRect {
    return (this.rectCache ??= this.domElement.getBoundingClientRect());
  }

  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.rect();
    return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  }

  private intersectGroundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.getNDC(clientX, clientY), this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
  }

  /** Move the camera so the ground under (fromX, fromY) ends up under (toX, toY). */
  private panScreen(fromX: number, fromY: number, toX: number, toY: number) {
    const a = this.intersectGroundAt(fromX, fromY);
    const b = this.intersectGroundAt(toX, toY);
    if (a && b) this.state.target.sub(b.sub(a));
  }

  /** Stop everything the user is about to take over from. */
  private haltMotion() {
    this.cancelTransition();
    this.glide.active = false;
    this.zoomGoal = null;
  }

  private cancelTransition() {
    if (!this.transitioning) return;
    const end = this.transitionEnd;
    // An interrupted 2D/2.5D switch completes its tilt immediately so the camera
    // never stays stranded between modes; pan / zoom keep their current values.
    if (end && end.viewMode !== this.state.viewMode) {
      this.state.viewMode = end.viewMode;
      this.state.polar = end.polar;
      this.state.azimuth = end.azimuth;
    }
    this.transitioning = false;
    this.transitionStart = null;
    this.transitionEnd = null;
    this.updateCameraTransform();
  }

  private setDragging(on: boolean) {
    if (this.dragging === on) return;
    this.dragging = on;
    this.callbacks.onDragChange?.(on);
  }

  /** `t` is the input event's own timestamp, so a busy main thread does not distort the release velocity. */
  private recordSample(x: number, y: number, t: number) {
    this.samples.push({ t, x, y, az: this.state.azimuth });
    while (this.samples.length > 2 && t - this.samples[0].t > VELOCITY_WINDOW_MS) this.samples.shift();
  }

  // ---------------------------------------------------------------- pointer input

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
    this.haltMotion();
    this.pointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    try {
      this.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded WebGL contexts.
    }
    this.pointerType = event.pointerType;

    if (this.pointers.size === 1) {
      this.primaryPointer = event.pointerId;
      const rotate = event.button === 2 || ((event.metaKey || event.ctrlKey) && event.pointerType === 'mouse');
      this.dragMode = rotate && this.state.viewMode === 'explore' ? 'rotate' : 'pan';
      this.pointerStart.set(event.clientX, event.clientY);
      this.pointerLast.copy(this.pointerStart);
      this.hasMoved = false;
      this.samples = [];
      this.recordSample(event.clientX, event.clientY, event.timeStamp);
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDistance = a.distanceTo(b);
      this.pinchAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.pinchMidpoint.copy(a).add(b).multiplyScalar(0.5);
      this.hasMoved = true;
      this.samples = [];
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.pointers.get(event.pointerId);
    if (!point) {
      if (this.pointers.size === 0) this.queueHover(event.clientX, event.clientY);
      return;
    }
    point.set(event.clientX, event.clientY);

    if (this.pointers.size >= 2) {
      // Two fingers: the midpoint pans, the spread zooms around it, a twist rotates.
      const [a, b] = [...this.pointers.values()];
      const distance = a.distanceTo(b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      if (this.pinchDistance > 0 && distance > 0) {
        this.panScreen(this.pinchMidpoint.x, this.pinchMidpoint.y, midpoint.x, midpoint.y);
        this.updateCameraTransform(false);
        this.zoomAt(midpoint.x, midpoint.y, this.state.zoom * (distance / this.pinchDistance), false);
        if (this.state.viewMode === 'explore') {
          let d = angle - this.pinchAngle;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          this.rotateAround(midpoint.x, midpoint.y, -d, 0);
        }
        this.updateCameraTransform();
      }
      this.pinchDistance = distance;
      this.pinchAngle = angle;
      this.pinchMidpoint.copy(midpoint);
      this.hasMoved = true;
      return;
    }

    if (event.pointerId !== this.primaryPointer) return;
    if (!this.hasMoved) {
      const threshold = event.pointerType === 'mouse' ? DRAG_THRESHOLD_MOUSE : DRAG_THRESHOLD_TOUCH;
      if (point.distanceTo(this.pointerStart) < threshold) return;
      this.hasMoved = true;
      this.setDragging(true);
    }

    if (this.dragMode === 'pan') {
      this.panScreen(this.pointerLast.x, this.pointerLast.y, point.x, point.y);
    } else {
      this.state.azimuth -= (point.x - this.pointerLast.x) * ROTATE_SPEED;
      this.state.polar = THREE.MathUtils.clamp(this.state.polar + (point.y - this.pointerLast.y) * ROTATE_SPEED, MIN_POLAR, MAX_POLAR);
    }
    this.updateCameraTransform();
    this.pointerLast.copy(point);
    this.recordSample(point.x, point.y, event.timeStamp);
  };

  // Hover picking runs at most once per frame; high-rate mice send several moves per frame.
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverFrame = 0;
  private queueHover(x: number, y: number) {
    this.hoverPoint = { x, y };
    if (this.hoverFrame) return;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      const p = this.hoverPoint;
      this.hoverPoint = null;
      if (p && this.pointers.size === 0) this.callbacks.onHoverRaycast?.(this.getNDC(p.x, p.y));
    });
  }

  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    const wasSinglePointer = this.pointers.size === 1;
    const wasTap = wasSinglePointer && !this.hasMoved && event.pointerId === this.primaryPointer;
    const pointerType = event.pointerType;
    this.pointers.delete(event.pointerId);
    this.releasePointer(event.pointerId);

    if (this.pointers.size === 1) {
      // Lifting one finger of a pinch continues as a one-finger pan without a jump.
      const [id, remaining] = [...this.pointers.entries()][0];
      this.primaryPointer = id;
      this.dragMode = 'pan';
      this.pointerStart.copy(remaining);
      this.pointerLast.copy(remaining);
      this.hasMoved = true;
      this.pinchDistance = 0;
      this.samples = [];
      return;
    }
    if (this.pointers.size > 1) return;

    this.primaryPointer = null;
    this.pinchDistance = 0;
    this.setDragging(false);
    if (!wasTap) {
      this.startGlide(event.clientX, event.clientY, event.timeStamp);
      return;
    }
    if (pointerType === 'mouse' && event.button !== 0) return;
    const ndc = this.getNDC(event.clientX, event.clientY);
    const now = performance.now();
    const touchDoubleTap = pointerType !== 'mouse' && now - this.lastTouchTapAt < 320 && this.lastTouchTap.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) < 24;
    if (event.detail >= 2 || touchDoubleTap) {
      this.callbacks.onDoubleClickRaycast?.(ndc);
      this.lastTouchTapAt = 0;
    } else {
      this.callbacks.onClickRaycast?.(ndc);
      this.lastTouchTapAt = pointerType === 'mouse' ? 0 : now;
      this.lastTouchTap.set(event.clientX, event.clientY);
    }
  };

  private onPointerCancel = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    this.releasePointer(event.pointerId);
    this.hasMoved = true;
    if (this.pointers.size === 0) {
      this.primaryPointer = null;
      this.setDragging(false);
    } else if (this.pointers.size === 1) {
      const [id, point] = [...this.pointers.entries()][0];
      this.primaryPointer = id;
      this.pointerStart.copy(point);
      this.pointerLast.copy(point);
      this.dragMode = 'pan';
    }
    this.pinchDistance = 0;
  };

  private releasePointer(id: number) {
    try {
      if (this.domElement.hasPointerCapture(id)) this.domElement.releasePointerCapture(id);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  /** After a fling, keep moving with the release velocity and slow down smoothly. */
  private startGlide(x: number, y: number, now: number) {
    if (reduceMotion()) return;
    this.recordSample(x, y, now);
    const recent = this.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
    // A pause before release means the user wanted to stop there.
    if (recent.length < 2 || now - recent[recent.length - 2].t > 60) return;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = Math.max(16, last.t - first.t);
    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    const vaz = (last.az - first.az) / dt;
    if (this.dragMode === 'pan' && Math.hypot(vx, vy) < INERTIA_MIN_SPEED) return;
    if (this.dragMode === 'rotate' && Math.abs(vaz) < 0.0002) return;
    this.glide = this.dragMode === 'pan' ? { vx, vy, vaz: 0, active: true } : { vx: 0, vy: 0, vaz, active: true };
    this.pointerLast.set(x, y);
    this.lastUpdate = performance.now();
    this.callbacks.onActivity?.();
  }

  // ---------------------------------------------------------------- wheel / trackpad

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.cancelTransition();
    this.glide.active = false;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.domElement.clientHeight : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;

    if (event.ctrlKey) {
      // Trackpad pinch (browsers report it as ctrl+wheel): follow the fingers exactly.
      this.zoomGoal = null;
      this.zoomAt(event.clientX, event.clientY, this.state.zoom * Math.exp(-dy * 0.012));
      return;
    }
    // Two-finger trackpad scroll pans the map; a mouse wheel (large, vertical, line-sized steps) zooms.
    const looksLikeTrackpad = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && (Math.abs(dx) > 0 || Math.abs(dy) < 40 || !Number.isInteger(dy));
    if (looksLikeTrackpad) {
      this.zoomGoal = null;
      this.panScreen(event.clientX, event.clientY, event.clientX - dx, event.clientY - dy);
      this.updateCameraTransform();
      return;
    }
    const base = this.zoomGoal ?? this.state.zoom;
    this.zoomGoal = THREE.MathUtils.clamp(base * Math.exp(-dy * 0.0022), MIN_ZOOM, MAX_ZOOM);
    this.zoomAnchor.set(event.clientX, event.clientY);
    if (reduceMotion()) {
      this.zoomAt(event.clientX, event.clientY, this.zoomGoal);
      this.zoomGoal = null;
      return;
    }
    this.lastUpdate = performance.now();
    this.callbacks.onActivity?.();
  };

  /** Zoom keeping the ground point under (clientX, clientY) fixed. */
  private zoomAt(clientX: number, clientY: number, requestedZoom: number, notify = true) {
    const nextZoom = THREE.MathUtils.clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - this.state.zoom) < 1e-5) return;
    const before = this.intersectGroundAt(clientX, clientY);
    this.state.zoom = nextZoom;
    this.updateCameraTransform(false);
    const after = this.intersectGroundAt(clientX, clientY);
    if (before && after) this.state.target.add(before.sub(after));
    this.updateCameraTransform(notify);
  }

  /** Rotate (and tilt) keeping the ground point under (clientX, clientY) fixed. */
  private rotateAround(clientX: number, clientY: number, dAzimuth: number, dPolar: number) {
    const before = this.intersectGroundAt(clientX, clientY);
    this.state.azimuth += dAzimuth;
    this.state.polar = THREE.MathUtils.clamp(this.state.polar + dPolar, MIN_POLAR, MAX_POLAR);
    this.updateCameraTransform(false);
    const after = this.intersectGroundAt(clientX, clientY);
    if (before && after) this.state.target.add(before.sub(after));
  }

  // ---------------------------------------------------------------- programmatic moves

  public setViewMode(mode: ViewMode) {
    const pendingMode = this.transitionEnd?.viewMode ?? this.state.viewMode;
    if (pendingMode === mode) return;
    this.glide.active = false;
    if (mode === 'plan') {
      this.explorePolar = this.state.polar;
      this.exploreAzimuth = this.state.azimuth;
    }
    this.startTransition({
      ...this.state,
      viewMode: mode,
      target: this.state.target.clone(),
      polar: mode === 'plan' ? PLAN_POLAR : this.explorePolar,
      azimuth: mode === 'plan' ? 0 : this.exploreAzimuth,
      distance: 600,
    }, { duration: 520, ease: easeInOutCubic });
  }

  /** The view mode the camera is in or currently animating towards. */
  public get targetViewMode(): ViewMode {
    return this.transitionEnd?.viewMode ?? this.state.viewMode;
  }

  public toggleViewMode() {
    this.setViewMode(this.targetViewMode === 'explore' ? 'plan' : 'explore');
  }

  /**
   * Fly to a point. `safeOffsetPx` keeps it clear of a side panel (shifts the point left);
   * `liftPx` keeps it clear of a bottom sheet (shifts the point up the screen).
   * Never zooms out: if the user is already closer than `zoom`, their zoom is kept.
   */
  public focusOnPosition(x: number, z: number, zoom = 1.45, safeOffsetPx?: number, liftPx = 0) {
    this.haltMotion();
    const finalZoom = THREE.MathUtils.clamp(Math.max(zoom, this.state.zoom), MIN_ZOOM, MAX_ZOOM);
    const rect = this.rect();
    const panelOffset = safeOffsetPx ?? Math.min(204, Math.max(0, (rect.width - 48) / 2));
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / (rect.height * finalZoom);
    const target = new THREE.Vector3(x, 0, z).addScaledVector(right, panelOffset * unitsPerPixel);
    if (liftPx) {
      // Screen-up on the ground plane points away from the camera; ground is foreshortened by cos(polar).
      const away = new THREE.Vector3(-Math.sin(this.state.azimuth), 0, -Math.cos(this.state.azimuth));
      target.addScaledVector(away, -(liftPx * unitsPerPixel) / Math.max(0.3, Math.cos(this.state.polar)));
    }
    this.startTransition({ ...this.state, target, zoom: finalZoom });
  }

  /** Rotate so north points up, keeping the current tilt, target and zoom. */
  public faceNorth() {
    const end = this.transitionEnd ?? this.state;
    if (Math.abs(end.azimuth % (Math.PI * 2)) < 1e-3) return;
    this.glide.active = false;
    // Take the short way round.
    const turns = Math.round(this.state.azimuth / (Math.PI * 2));
    this.state.azimuth -= turns * Math.PI * 2;
    if (end.viewMode === 'explore') this.exploreAzimuth = 0;
    this.startTransition({ ...end, target: end.target.clone(), azimuth: 0 }, { duration: 420 });
  }

  /** World metres covered by one CSS pixel horizontally at the current zoom. */
  public get metresPerPixel(): number {
    const rect = this.rect();
    return (this.camera.top - this.camera.bottom) / (Math.max(1, rect.height) * this.state.zoom);
  }

  public zoomToPosition(x: number, z: number) {
    this.haltMotion();
    this.startTransition({ ...this.state, target: new THREE.Vector3(x, 0, z), zoom: Math.min(MAX_ZOOM, this.state.zoom * 1.8) }, { duration: 380 });
  }

  /** Fit the view to a world-space rectangle (e.g. the building footprint) instead of the full drawing sheet. */
  public setFitBounds(bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    this.fitBounds = bounds;
  }

  public fitToPlan() {
    this.glide.active = false;
    this.zoomGoal = null;
    const b = this.fitBounds;
    const viewW = this.camera.right - this.camera.left;
    const viewH = this.camera.top - this.camera.bottom;
    if (!b) {
      const fitZoom = Math.min(viewW / SPATIAL_PLAN.sourcePageWorldWidth, viewH / SPATIAL_PLAN.sourcePageWorldHeight) * 0.92;
      this.startTransition({ ...this.state, target: new THREE.Vector3(), zoom: THREE.MathUtils.clamp(fitZoom, MIN_ZOOM, MAX_ZOOM) });
      return;
    }
    const mode = this.transitionEnd?.viewMode ?? this.state.viewMode;
    const polar = this.transitionEnd?.polar ?? this.state.polar;
    const azimuth = this.transitionEnd?.azimuth ?? this.state.azimuth;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    // Screen-space extent of the rotated rectangle under the current azimuth / tilt.
    const c = Math.abs(Math.cos(azimuth));
    const s = Math.abs(Math.sin(azimuth));
    const across = w * c + d * s;
    const deep = (w * s + d * c) * (mode === 'plan' ? 1 : Math.cos(polar));
    const fitZoom = Math.min(viewW / across, viewH / deep) * 0.86;
    this.startTransition({
      ...this.state,
      target: new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2),
      zoom: THREE.MathUtils.clamp(fitZoom, MIN_ZOOM, MAX_ZOOM),
      viewMode: mode,
      polar,
      azimuth,
    });
  }

  /**
   * Fit a world-space rectangle (e.g. a walking route) into the part of the screen not
   * covered by panels. Insets are CSS pixels; keeps the current view mode, tilt and heading.
   */
  public frameBounds(
    b: { minX: number; minZ: number; maxX: number; maxZ: number },
    inset: { left?: number; right?: number; top?: number; bottom?: number } = {},
    maxZoom = 3.2,
  ) {
    this.haltMotion();
    const rect = this.rect();
    const left = inset.left ?? 0, right = inset.right ?? 0, top = inset.top ?? 0, bottom = inset.bottom ?? 0;
    const usableW = Math.max(120, rect.width - left - right);
    const usableH = Math.max(120, rect.height - top - bottom);
    const mode = this.transitionEnd?.viewMode ?? this.state.viewMode;
    const polar = this.transitionEnd?.polar ?? this.state.polar;
    const azimuth = this.transitionEnd?.azimuth ?? this.state.azimuth;
    const w = Math.max(4, b.maxX - b.minX);
    const d = Math.max(4, b.maxZ - b.minZ);
    const c = Math.abs(Math.cos(azimuth));
    const s = Math.abs(Math.sin(azimuth));
    const across = w * c + d * s;
    const deep = (w * s + d * c) * (mode === 'plan' ? 1 : Math.cos(polar));
    const viewW = (this.camera.right - this.camera.left) * (usableW / rect.width);
    const viewH = (this.camera.top - this.camera.bottom) * (usableH / rect.height);
    const zoom = THREE.MathUtils.clamp(Math.min(viewW / across, viewH / deep) * 0.82, MIN_ZOOM, Math.min(MAX_ZOOM, maxZoom));
    // Shift the target so the rectangle sits in the middle of the uncovered area.
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / (rect.height * zoom);
    const screenRight = new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth));
    const away = new THREE.Vector3(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    const target = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2)
      .addScaledVector(screenRight, ((right - left) / 2) * unitsPerPixel)
      .addScaledVector(away, -(((bottom - top) / 2) * unitsPerPixel) / Math.max(0.3, mode === 'plan' ? 1 : Math.cos(polar)));
    this.startTransition({ ...this.state, target, zoom, viewMode: mode, polar, azimuth });
  }

  public resetView() {
    const mode = this.transitionEnd?.viewMode ?? this.state.viewMode;
    this.glide.active = false;
    this.startTransition({
      ...this.state,
      viewMode: mode,
      target: new THREE.Vector3(),
      zoom: Math.min(1, this.state.zoom),
      polar: mode === 'plan' ? PLAN_POLAR : 0.95,
      azimuth: mode === 'plan' ? 0 : Math.PI / 4,
    });
    if (mode === 'explore') {
      this.explorePolar = 0.95;
      this.exploreAzimuth = Math.PI / 4;
    }
  }

  /** Button zoom: animated toward the centre of the view. */
  public zoomIn() {
    this.stepZoom(1.4);
  }

  public zoomOut() {
    this.stepZoom(1 / 1.4);
  }

  private stepZoom(factor: number) {
    this.cancelTransition();
    this.glide.active = false;
    const rect = this.rect();
    this.zoomAnchor.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    this.zoomGoal = THREE.MathUtils.clamp((this.zoomGoal ?? this.state.zoom) * factor, MIN_ZOOM, MAX_ZOOM);
    if (reduceMotion()) {
      this.zoomAt(this.zoomAnchor.x, this.zoomAnchor.y, this.zoomGoal);
      this.zoomGoal = null;
      return;
    }
    this.lastUpdate = performance.now();
    this.callbacks.onActivity?.();
  }

  /** True while a finger or mouse button is down on the map. */
  public get isInteracting(): boolean {
    return this.pointers.size > 0;
  }

  /** True while anything moves on its own (fly-to, glide, smooth zoom). */
  public get isAnimating(): boolean {
    return this.transitioning || this.glide.active || this.zoomGoal !== null;
  }

  private startTransition(target: CameraState, options: { duration?: number; ease?: (t: number) => number } = {}) {
    this.transitionStart = { ...this.state, target: this.state.target.clone() };
    this.transitionEnd = { ...target, target: target.target.clone() };
    this.transitionStartTime = performance.now();
    if (reduceMotion()) {
      this.transitionDuration = 0;
    } else if (options.duration !== undefined) {
      this.transitionDuration = options.duration;
    } else {
      // Scale with how far the view travels on screen: short hops are quick.
      const rect = this.rect();
      const unitsPerPixel = (this.camera.top - this.camera.bottom) / (Math.max(1, rect.height) * this.state.zoom);
      const travelPx = this.transitionStart.target.distanceTo(this.transitionEnd.target) / unitsPerPixel;
      const zoomSteps = Math.abs(Math.log(this.transitionEnd.zoom / this.transitionStart.zoom));
      this.transitionDuration = THREE.MathUtils.clamp(320 + travelPx * 0.25 + zoomSteps * 140, 320, 700);
    }
    this.transitionEase = options.ease ?? easeOutCubic;
    this.transitioning = true;
    this.callbacks.onActivity?.();
  }

  /** Advance animations; call once per frame. */
  public update() {
    const now = performance.now();
    const dt = Math.min(64, now - this.lastUpdate);
    this.lastUpdate = now;
    let changed = false;

    if (this.transitioning && this.transitionStart && this.transitionEnd) {
      const progress = this.transitionDuration === 0 ? 1 : Math.min(1, (now - this.transitionStartTime) / this.transitionDuration);
      const e = this.transitionEase(progress);
      const s = this.transitionStart;
      const t = this.transitionEnd;
      this.state.target.lerpVectors(s.target, t.target, e);
      this.state.zoom = Math.exp(THREE.MathUtils.lerp(Math.log(s.zoom), Math.log(t.zoom), e)); // even zoom speed
      this.state.polar = THREE.MathUtils.lerp(s.polar, t.polar, e);
      this.state.azimuth = THREE.MathUtils.lerp(s.azimuth, t.azimuth, e);
      if (progress >= 1) {
        this.state.viewMode = t.viewMode;
        this.transitioning = false;
        this.transitionStart = null;
        this.transitionEnd = null;
      }
      changed = true;
    }

    if (this.glide.active && dt > 0) {
      const decay = Math.exp(-dt / INERTIA_DECAY_MS);
      if (this.glide.vx || this.glide.vy) {
        const x = this.pointerLast.x;
        const y = this.pointerLast.y;
        this.updateCameraTransform(false);
        this.panScreen(x, y, x + this.glide.vx * dt, y + this.glide.vy * dt);
        this.glide.vx *= decay;
        this.glide.vy *= decay;
        if (Math.hypot(this.glide.vx, this.glide.vy) < 0.01) this.glide.active = false;
      } else {
        this.state.azimuth += this.glide.vaz * dt;
        this.glide.vaz *= decay;
        if (Math.abs(this.glide.vaz) < 0.00002) this.glide.active = false;
      }
      changed = true;
    }

    if (this.zoomGoal !== null && dt > 0) {
      const k = 1 - Math.exp(-dt / WHEEL_ZOOM_SMOOTH_MS);
      const next = Math.exp(THREE.MathUtils.lerp(Math.log(this.state.zoom), Math.log(this.zoomGoal), k));
      const done = Math.abs(Math.log(next / this.zoomGoal)) < 0.002;
      this.zoomAt(this.zoomAnchor.x, this.zoomAnchor.y, done ? this.zoomGoal : next, false);
      if (done) this.zoomGoal = null;
      changed = true;
    }

    if (changed) this.updateCameraTransform();
  }

  public updateCameraTransform(notify = true) {
    const { target, polar, azimuth, distance, zoom, viewMode } = this.state;
    this.camera.position.set(
      target.x + distance * Math.sin(polar) * Math.sin(azimuth),
      target.y + distance * Math.cos(polar),
      target.z + distance * Math.sin(polar) * Math.cos(azimuth),
    );
    const planBlend = viewMode === 'plan' || polar < 0.4 ? THREE.MathUtils.smoothstep(0.4 - polar, 0, 0.4) : 0;
    this.camera.up.set(0, 1 - planBlend, -planBlend).normalize();
    this.camera.lookAt(target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    if (notify) this.callbacks.onStateChange?.(this.state);
  }
}
