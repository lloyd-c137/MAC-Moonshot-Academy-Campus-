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
};

const MIN_ZOOM = 0.28;
const MAX_ZOOM = 8;
const PLAN_POLAR = 0;

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
  private pointerButton = -1;
  private pointerStart = new THREE.Vector2();
  private pointerLast = new THREE.Vector2();
  private hasMoved = false;
  private pinchDistance = 0;
  private pinchMidpoint = new THREE.Vector2();
  private transitioning = false;
  private transitionStart: CameraState | null = null;
  private transitionEnd: CameraState | null = null;
  private transitionStartTime = 0;
  private transitionDuration = 600;
  private explorePolar = 0.95;
  private exploreAzimuth = Math.PI / 4;
  private lastTouchTapAt = 0;
  private lastTouchTap = new THREE.Vector2(-Infinity, -Infinity);

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
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.domElement.removeEventListener('lostpointercapture', this.onPointerCancel);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    for (const id of this.pointers.keys()) this.releasePointer(id);
    this.pointers.clear();
  }

  private onContextMenu = (event: MouseEvent) => event.preventDefault();

  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private intersectGroundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.getNDC(clientX, clientY), this.camera);
    return this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
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

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return;
    this.cancelTransition();
    this.pointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    try {
      this.domElement.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded WebGL contexts.
    }

    if (this.pointers.size === 1) {
      this.primaryPointer = event.pointerId;
      this.pointerButton = event.pointerType === 'mouse' ? event.button : 0;
      this.pointerStart.set(event.clientX, event.clientY);
      this.pointerLast.copy(this.pointerStart);
      this.hasMoved = false;
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDistance = a.distanceTo(b);
      this.pinchMidpoint.copy(a).add(b).multiplyScalar(0.5);
      this.hasMoved = true;
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.pointers.get(event.pointerId);
    if (!point) {
      if (this.pointers.size === 0) this.callbacks.onHoverRaycast?.(this.getNDC(event.clientX, event.clientY));
      return;
    }
    point.set(event.clientX, event.clientY);

    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = a.distanceTo(b);
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      if (this.pinchDistance > 0 && distance > 0) {
        const oldGround = this.intersectGroundAt(this.pinchMidpoint.x, this.pinchMidpoint.y);
        this.zoomAt(midpoint.x, midpoint.y, this.state.zoom * (distance / this.pinchDistance));
        if (oldGround) {
          const shiftedGround = this.intersectGroundAt(this.pinchMidpoint.x, this.pinchMidpoint.y);
          if (shiftedGround) this.state.target.add(oldGround.sub(shiftedGround));
          this.updateCameraTransform();
        }
      }
      this.pinchDistance = distance;
      this.pinchMidpoint.copy(midpoint);
      this.hasMoved = true;
      return;
    }

    if (event.pointerId !== this.primaryPointer) return;
    const distanceFromStart = point.distanceTo(this.pointerStart);
    if (distanceFromStart > 6) this.hasMoved = true;
    if (!this.hasMoved) return;

    if (this.pointerButton === 0) {
      const previous = this.intersectGroundAt(this.pointerLast.x, this.pointerLast.y);
      const current = this.intersectGroundAt(point.x, point.y);
      if (previous && current) this.state.target.sub(current.sub(previous));
      this.updateCameraTransform();
    } else if (this.pointerButton === 2 && this.state.viewMode === 'explore') {
      const dx = point.x - this.pointerLast.x;
      const dy = point.y - this.pointerLast.y;
      this.state.azimuth -= dx * 0.006;
      this.state.polar = THREE.MathUtils.clamp(this.state.polar + dy * 0.006, 0.45, 1.28);
      this.updateCameraTransform();
    }
    this.pointerLast.copy(point);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.pointers.has(event.pointerId)) return;
    const wasSinglePointer = this.pointers.size === 1;
    const wasTap = wasSinglePointer && !this.hasMoved && event.pointerId === this.primaryPointer;
    const pointerType = event.pointerType;
    const moved = this.hasMoved;
    this.pointers.delete(event.pointerId);
    this.releasePointer(event.pointerId);

    if (this.pointers.size === 1) {
      const [id, remaining] = [...this.pointers.entries()][0];
      this.primaryPointer = id;
      this.pointerButton = 0;
      this.pointerStart.copy(remaining);
      this.pointerLast.copy(remaining);
      this.hasMoved = true;
      this.pinchDistance = 0;
      return;
    }
    if (this.pointers.size > 1) return;

    this.primaryPointer = null;
    this.pinchDistance = 0;
    if (!wasTap || moved || pointerType === 'mouse' && event.button !== 0) return;
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
    if (this.pointers.size === 0) this.primaryPointer = null;
    else if (this.pointers.size === 1) {
      const [id, point] = [...this.pointers.entries()][0];
      this.primaryPointer = id;
      this.pointerStart.copy(point);
      this.pointerLast.copy(point);
      this.pointerButton = 0;
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

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.cancelTransition();
    const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.domElement.clientHeight : 1);
    this.zoomAt(event.clientX, event.clientY, this.state.zoom * Math.exp(-delta * 0.0015));
  };

  private zoomAt(clientX: number, clientY: number, requestedZoom: number) {
    const nextZoom = THREE.MathUtils.clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(nextZoom - this.state.zoom) < 0.0001) return;
    const before = this.intersectGroundAt(clientX, clientY);
    this.state.zoom = nextZoom;
    this.updateCameraTransform();
    const after = this.intersectGroundAt(clientX, clientY);
    if (before && after) this.state.target.add(before.sub(after));
    this.updateCameraTransform();
  }

  public setViewMode(mode: ViewMode) {
    const pendingMode = this.transitionEnd?.viewMode ?? this.state.viewMode;
    if (pendingMode === mode && !this.transitioning) return;
    if (pendingMode === mode) return;

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
    });
  }

  /** The view mode the camera is in or currently animating towards. */
  public get targetViewMode(): ViewMode {
    return this.transitionEnd?.viewMode ?? this.state.viewMode;
  }

  public toggleViewMode() {
    this.setViewMode((this.transitionEnd?.viewMode ?? this.state.viewMode) === 'explore' ? 'plan' : 'explore');
  }

  public focusOnPosition(x: number, z: number, zoom = 1.45, safeOffsetPx?: number) {
    this.cancelTransition();
    const rect = this.domElement.getBoundingClientRect();
    const panelOffset = safeOffsetPx ?? Math.min(204, Math.max(0, (rect.width - 48) / 2));
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / (rect.height * zoom);
    const target = new THREE.Vector3(x, 0, z).addScaledVector(right, panelOffset * unitsPerPixel);
    this.startTransition({ ...this.state, target, zoom: THREE.MathUtils.clamp(zoom, MIN_ZOOM, MAX_ZOOM) });
  }

  public zoomToPosition(x: number, z: number) {
    this.startTransition({ ...this.state, target: new THREE.Vector3(x, 0, z), zoom: Math.min(MAX_ZOOM, this.state.zoom * 1.5) });
  }

  private fitBounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;

  /** Fit the view to a world-space rectangle (e.g. the building footprint) instead of the full drawing sheet. */
  public setFitBounds(bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    this.fitBounds = bounds;
  }

  public fitToPlan() {
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

  public resetView() {
    const mode = this.transitionEnd?.viewMode ?? this.state.viewMode;
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

  public zoomIn() {
    this.cancelTransition();
    this.zoomAt(this.domElement.clientWidth / 2 + this.domElement.getBoundingClientRect().left, this.domElement.clientHeight / 2 + this.domElement.getBoundingClientRect().top, this.state.zoom * 1.25);
  }

  public zoomOut() {
    this.cancelTransition();
    const rect = this.domElement.getBoundingClientRect();
    this.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, this.state.zoom / 1.25);
  }

  private startTransition(target: CameraState) {
    this.transitionStart = { ...this.state, target: this.state.target.clone() };
    this.transitionEnd = { ...target, target: target.target.clone() };
    this.transitionStartTime = performance.now();
    this.transitionDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
    this.transitioning = true;
  }

  public update() {
    if (!this.transitioning || !this.transitionStart || !this.transitionEnd) return;
    const progress = this.transitionDuration === 0 ? 1 : Math.min(1, (performance.now() - this.transitionStartTime) / this.transitionDuration);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
    this.state.target.lerpVectors(this.transitionStart.target, this.transitionEnd.target, eased);
    this.state.zoom = THREE.MathUtils.lerp(this.transitionStart.zoom, this.transitionEnd.zoom, eased);
    this.state.polar = THREE.MathUtils.lerp(this.transitionStart.polar, this.transitionEnd.polar, eased);
    this.state.azimuth = THREE.MathUtils.lerp(this.transitionStart.azimuth, this.transitionEnd.azimuth, eased);
    if (progress >= 1) {
      this.state.viewMode = this.transitionEnd.viewMode;
      this.transitioning = false;
      this.transitionStart = null;
      this.transitionEnd = null;
    }
    this.updateCameraTransform();
  }

  public updateCameraTransform() {
    const { target, polar, azimuth, distance, zoom, viewMode } = this.state;
    this.camera.position.set(
      target.x + distance * Math.sin(polar) * Math.sin(azimuth),
      target.y + distance * Math.cos(polar),
      target.z + distance * Math.sin(polar) * Math.cos(azimuth),
    );
    const planBlend = viewMode === 'plan' || polar < 0.4
      ? THREE.MathUtils.smoothstep(0.4 - polar, 0, 0.4)
      : 0;
    this.camera.up.set(0, 1 - planBlend, -planBlend).normalize();
    this.camera.lookAt(target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.callbacks.onStateChange?.(this.state);
  }
}
