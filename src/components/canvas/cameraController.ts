import * as THREE from 'three';

export type ViewMode = 'explore' | 'plan';

export interface CameraState {
  viewMode: ViewMode;
  target: THREE.Vector3;
  zoom: number;
  polar: number; // radians from vertical: ~0.001 for 2D plan, ~0.95 (~54.7 deg) for 2.5D explore
  azimuth: number; // horizontal orbit angle in radians
  distance: number;
}

export class CampusCameraController {
  private camera: THREE.OrthographicCamera;
  private domElement: HTMLElement;
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private raycaster = new THREE.Raycaster();

  // Current active state
  public state: CameraState = {
    viewMode: 'explore',
    target: new THREE.Vector3(0, 0, 0),
    zoom: 1.0,
    polar: 0.95, // ~54.7 degrees
    azimuth: Math.PI / 4, // 45 degrees isometric
    distance: 600,
  };

  // Remembered 2.5D angles when toggled to 2D
  private lastExplorePolar = 0.95;
  private lastExploreAzimuth = Math.PI / 4;

  // Animation interpolation state
  private isTransitioning = false;
  private transitionStart: CameraState | null = null;
  private transitionEnd: CameraState | null = null;
  private transitionProgress = 0;
  private transitionDuration = 600; // ms
  private transitionStartTime = 0;

  // Gesture state
  private isPointerDown = false;
  private pointerButton = -1;
  private pointerStart = new THREE.Vector2();
  private pointerLast = new THREE.Vector2();
  private hasMovedPastThreshold = false;
  private moveThresholdPx = 6;

  // Callbacks
  private onStateChange?: (state: CameraState) => void;
  private onClickRaycast?: (ndc: THREE.Vector2) => void;
  private onHoverRaycast?: (ndc: THREE.Vector2) => void;

  constructor(camera: THREE.OrthographicCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.bindEvents();
    this.updateCameraTransform();
  }

  public setCallbacks(callbacks: {
    onStateChange?: (state: CameraState) => void;
    onClickRaycast?: (ndc: THREE.Vector2) => void;
    onHoverRaycast?: (ndc: THREE.Vector2) => void;
  }) {
    this.onStateChange = callbacks.onStateChange;
    this.onClickRaycast = callbacks.onClickRaycast;
    this.onHoverRaycast = callbacks.onHoverRaycast;
  }

  private bindEvents() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointercancel', this.onPointerUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
  }

  public dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault(); // Suppress right-click menu so right-drag orbit feels native
  };

  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  // Intersect ray with ground plane (Y=0)
  private intersectGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const result = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    return result ? hit : null;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.isPointerDown = true;
    this.pointerButton = e.button;
    this.pointerStart.set(e.clientX, e.clientY);
    this.pointerLast.set(e.clientX, e.clientY);
    this.hasMovedPastThreshold = false;

    // Any manual gesture interrupts automatic transition
    if (this.isTransitioning) {
      this.isTransitioning = false;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const ndc = this.getNDC(e.clientX, e.clientY);

    if (!this.isPointerDown) {
      // Hover raycasting when not dragging
      if (this.onHoverRaycast) {
        this.onHoverRaycast(ndc);
      }
      return;
    }

    const dist = Math.hypot(e.clientX - this.pointerStart.x, e.clientY - this.pointerStart.y);
    if (dist > this.moveThresholdPx) {
      this.hasMovedPastThreshold = true;
    }

    const dx = e.clientX - this.pointerLast.x;
    const dy = e.clientY - this.pointerLast.y;

    if (this.pointerButton === 0) {
      // LEFT DRAG = FREE PAN (Precise Ground Plane Ray Intersection)
      const prevNDC = this.getNDC(this.pointerLast.x, this.pointerLast.y);
      const currNDC = ndc;

      const pPrev = this.intersectGround(prevNDC);
      const pCurr = this.intersectGround(currNDC);

      if (pPrev && pCurr) {
        const deltaWorld = new THREE.Vector3().subVectors(pCurr, pPrev);
        this.state.target.sub(deltaWorld);
        this.updateCameraTransform();
      }
    } else if (this.pointerButton === 2) {
      // RIGHT DRAG = ORBIT ROTATE (Only in 2.5D Explore View)
      if (this.state.viewMode === 'explore') {
        const rotSpeed = 0.006;
        this.state.azimuth -= dx * rotSpeed;
        this.state.polar = THREE.MathUtils.clamp(
          this.state.polar + dy * rotSpeed,
          0.45, // ~26 degrees
          1.28 // ~73 degrees
        );
        this.updateCameraTransform();
      }
    }

    this.pointerLast.set(e.clientX, e.clientY);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    // Gesture Arbitration: If pointer didn't move beyond threshold, treat as CLICK!
    if (!this.hasMovedPastThreshold && (e.button === 0 || this.pointerButton === 0)) {
      const ndc = this.getNDC(e.clientX, e.clientY);
      if (this.onClickRaycast) {
        this.onClickRaycast(ndc);
      }
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.isTransitioning) this.isTransitioning = false;

    const ndc = this.getNDC(e.clientX, e.clientY);
    const groundPoint = this.intersectGround(ndc);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const oldZoom = this.state.zoom;
    const newZoom = THREE.MathUtils.clamp(oldZoom * zoomFactor, 0.45, 3.8);

    if (Math.abs(newZoom - oldZoom) < 0.001) return;

    // Cursor-centered zoom math:
    // Keep groundPoint at the exact same screen location after zoom change!
    if (groundPoint) {
      const ratio = oldZoom / newZoom;
      this.state.target.x = groundPoint.x + (this.state.target.x - groundPoint.x) * ratio;
      this.state.target.z = groundPoint.z + (this.state.target.z - groundPoint.z) * ratio;
    }

    this.state.zoom = newZoom;
    this.updateCameraTransform();
  };

  // Toggle between 2D Plan View and 2.5D Explore View smoothly
  public setViewMode(mode: ViewMode) {
    if (this.state.viewMode === mode && !this.isTransitioning) return;

    if (this.state.viewMode === 'explore' && mode === 'plan') {
      // Save current 2.5D orbit angles
      this.lastExplorePolar = this.state.polar;
      this.lastExploreAzimuth = this.state.azimuth;

      this.startTransition({
        viewMode: 'plan',
        target: this.state.target.clone(),
        zoom: Math.max(0.75, this.state.zoom),
        polar: 0.001, // strictly perpendicular from top
        azimuth: 0, // aligned with FF-01 drawing axis
        distance: 600,
      });
    } else if (this.state.viewMode === 'plan' && mode === 'explore') {
      this.startTransition({
        viewMode: 'explore',
        target: this.state.target.clone(),
        zoom: this.state.zoom,
        polar: this.lastExplorePolar || 0.95,
        azimuth: this.lastExploreAzimuth || Math.PI / 4,
        distance: 600,
      });
    }
  }

  public toggleViewMode() {
    this.setViewMode(this.state.viewMode === 'explore' ? 'plan' : 'explore');
  }

  // Focus smoothly onto a specific world coordinate (with optional viewport offset for UI panels)
  public focusOnPosition(x: number, z: number, zoomLevel = 1.45) {
    const endState: CameraState = {
      ...this.state,
      target: new THREE.Vector3(x, 0, z),
      zoom: zoomLevel,
    };
    this.startTransition(endState);
  }

  // Fit the whole verified plan into camera
  public fitToPlan() {
    const endState: CameraState = {
      ...this.state,
      target: new THREE.Vector3(0, 0, 0),
      zoom: this.state.viewMode === 'plan' ? 0.92 : 0.85,
    };
    this.startTransition(endState);
  }

  // Reset to default orientation & center
  public resetView() {
    const isPlan = this.state.viewMode === 'plan';
    const endState: CameraState = {
      viewMode: this.state.viewMode,
      target: new THREE.Vector3(0, 0, 0),
      zoom: 1.0,
      polar: isPlan ? 0.001 : 0.95,
      azimuth: isPlan ? 0 : Math.PI / 4,
      distance: 600,
    };
    this.startTransition(endState);
  }

  public zoomIn() {
    const newZoom = THREE.MathUtils.clamp(this.state.zoom * 1.25, 0.45, 3.8);
    this.state.zoom = newZoom;
    this.updateCameraTransform();
  }

  public zoomOut() {
    const newZoom = THREE.MathUtils.clamp(this.state.zoom * 0.8, 0.45, 3.8);
    this.state.zoom = newZoom;
    this.updateCameraTransform();
  }

  private startTransition(targetState: CameraState) {
    this.transitionStart = {
      viewMode: this.state.viewMode,
      target: this.state.target.clone(),
      zoom: this.state.zoom,
      polar: this.state.polar,
      azimuth: this.state.azimuth,
      distance: this.state.distance,
    };
    this.transitionEnd = targetState;
    this.isTransitioning = true;
    this.transitionStartTime = performance.now();
  }

  // Called in per-frame requestAnimationFrame loop
  public update() {
    if (this.isTransitioning && this.transitionStart && this.transitionEnd) {
      const elapsed = performance.now() - this.transitionStartTime;
      const progress = Math.min(1.0, elapsed / this.transitionDuration);

      // Smooth cubic easing (ease-in-out)
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.state.target.lerpVectors(this.transitionStart.target, this.transitionEnd.target, ease);
      this.state.zoom = THREE.MathUtils.lerp(this.transitionStart.zoom, this.transitionEnd.zoom, ease);
      this.state.polar = THREE.MathUtils.lerp(this.transitionStart.polar, this.transitionEnd.polar, ease);
      this.state.azimuth = THREE.MathUtils.lerp(this.transitionStart.azimuth, this.transitionEnd.azimuth, ease);

      if (progress >= 1.0) {
        this.isTransitioning = false;
        this.state.viewMode = this.transitionEnd.viewMode;
      }

      this.updateCameraTransform();
    }
  }

  // Update Three.js OrthographicCamera position, lookAt, up vector, and projection matrix
  public updateCameraTransform() {
    const { target, polar, azimuth, distance, zoom, viewMode } = this.state;

    // Spherical position offset
    const sinPolar = Math.sin(polar);
    const cosPolar = Math.cos(polar);
    const sinAzimuth = Math.sin(azimuth);
    const cosAzimuth = Math.cos(azimuth);

    const posX = target.x + distance * sinPolar * sinAzimuth;
    const posY = target.y + distance * cosPolar;
    const posZ = target.z + distance * sinPolar * cosAzimuth;

    this.camera.position.set(posX, posY, posZ);

    if (viewMode === 'plan') {
      // In 2D Plan View (looking directly down along -Y axis):
      // The camera UP vector must be (0, 0, -1) so North on the plan is UP on screen!
      this.camera.up.set(0, 0, -1);
    } else {
      // In 2.5D Explore View:
      // When polar is tilted, standard world UP is (0, 1, 0)
      // Interpolate smoothly if polar is near zero
      const t = THREE.MathUtils.clamp((polar - 0.05) / 0.4, 0, 1);
      this.camera.up.set(0, t, -(1 - t)).normalize();
    }

    this.camera.lookAt(target);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();

    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }
}
