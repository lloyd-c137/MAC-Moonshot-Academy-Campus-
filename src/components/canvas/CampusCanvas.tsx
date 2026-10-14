import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { MapLayerMode, NavigationRoute } from '../../types/campus';
import { SOURCE_ANCHORS } from '../../data/sourceAnchors';
import { planToWorld, SPATIAL_PLAN } from '../../data/spatialPlan';
import { CampusCameraController, CameraState, ViewMode } from './cameraController';
import { Compass, Maximize2, RotateCcw, Plus, Minus, Layers } from 'lucide-react';

const planPointToWorld = (x: number, y: number) => planToWorld({ x, y });

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

export const CampusCanvas: React.FC<CampusCanvasProps> = ({
  selectedSpaceId,
  hasSelectedSpace,
  onSelectSpace,
  onHoverSpace,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<CampusCameraController | null>(null);
  const sourceSelectionMarkerRef = useRef<THREE.Mesh | null>(null);

  // Local camera state for HUD display
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>('plan');

  // Focus on selected space smoothly
  useEffect(() => {
    if (!selectedSpaceId || !controllerRef.current) return;
    const space = CAMPUS_SPACES.find((s) => s.id === selectedSpaceId);
    if (!space) return;

    const wPos = planPointToWorld(space.center.x, space.center.y);
    controllerRef.current.focusOnPosition(wPos.x, wPos.z, 1.45);
  }, [selectedSpaceId]);

  useEffect(() => {
    const marker = sourceSelectionMarkerRef.current;
    if (!marker) return;
    const space = CAMPUS_SPACES.find((candidate) => candidate.id === selectedSpaceId);
    marker.visible = Boolean(space);
    if (space) {
      const point = planPointToWorld(space.center.x, space.center.y);
      marker.position.set(point.x, 0.04, point.z);
    }
  }, [selectedSpaceId]);

  // Three.js scene initialization
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f5f1); // Warm architectural off-white

    // 2. Camera: Orthographic Isometric Camera
    const aspect = width / height;
    const frustumSize = 180;
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      1,
      2500
    );

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Keep the source sheet as the only spatial drawing until semantic paths
    // have been reviewed and a separate reconstruction can be compared.
    const sourceMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide,
    });
    const sourceOverlay = new THREE.Mesh(new THREE.PlaneGeometry(
      SPATIAL_PLAN.sourcePageWorldWidth,
      SPATIAL_PLAN.sourcePageWorldHeight,
    ), sourceMaterial);
    sourceOverlay.name = 'FF-01 source drawing overlay';
    sourceOverlay.rotation.x = -Math.PI / 2;
    sourceOverlay.position.set(SPATIAL_PLAN.sourcePageWorldOffsetX, 0.02, SPATIAL_PLAN.sourcePageWorldOffsetZ);
    sourceOverlay.visible = true;
    sourceOverlay.renderOrder = 1;
    scene.add(sourceOverlay);
    new THREE.TextureLoader().load(
      SPATIAL_PLAN.sourceOverlay,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        sourceMaterial.map = texture;
        sourceMaterial.needsUpdate = true;
      },
      undefined,
      (error) => console.warn('FF-01 reference overlay could not be loaded.', error),
    );

    const selectionMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 2.2, 40),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    selectionMarker.name = 'SourceRoomLabelSelectionMarker';
    selectionMarker.rotation.x = -Math.PI / 2;
    selectionMarker.position.y = 0.04;
    selectionMarker.visible = false;
    selectionMarker.renderOrder = 3;
    scene.add(selectionMarker);
    sourceSelectionMarkerRef.current = selectionMarker;

    // 6. Camera Controller
    const controller = new CampusCameraController(camera, renderer.domElement);
    controllerRef.current = controller;

    controller.setCallbacks({
      onStateChange: (state: CameraState) => setCurrentViewMode(state.viewMode),
      onClickRaycast: (ndc: THREE.Vector2) => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        // Spatial selection currently targets source-confirmed room labels only;
        // the surrounding room boundaries have not been traced yet.
        const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02), new THREE.Vector3());
        if (point) {
          const label = SOURCE_ANCHORS.find((anchor) => {
            const anchorWorld = planPointToWorld(anchor.x, anchor.y);
            return Math.hypot(anchorWorld.x - point.x, anchorWorld.z - point.z) < 1.6;
          });
          if (label && CAMPUS_SPACES.some((space) => space.id === label.id)) {
            onSelectSpace(label.id);
            return;
          }
        }
        // Clicked on an unassigned drawing area
        onSelectSpace(null);
      },
      onDoubleClickRaycast: (ndc: THREE.Vector2) => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02), new THREE.Vector3());
        if (point) controller.zoomToPosition(point.x, point.z);
      },
      onHoverRaycast: (ndc: THREE.Vector2) => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02), new THREE.Vector3());
        const label = point && SOURCE_ANCHORS.find((anchor) => {
          const anchorWorld = planPointToWorld(anchor.x, anchor.y);
          return Math.hypot(anchorWorld.x - point.x, anchorWorld.z - point.z) < 1.6;
        });
        const hoveredId = label && CAMPUS_SPACES.some((space) => space.id === label.id) ? label.id : null;
        onHoverSpace(hoveredId);
        renderer.domElement.style.cursor = hoveredId ? 'pointer' : 'grab';
      },
    });

    // Render only the source sheet and a selected source-label marker.
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controller.update();
      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const asp = w / h;
      camera.left = (-frustumSize * asp) / 2;
      camera.right = (frustumSize * asp) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    const canvasElem = renderer.domElement;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL context lost, pausing render.');
    };
    const handleContextRestored = () => {
      console.info('WebGL context restored.');
    };
    canvasElem.addEventListener('webglcontextlost', handleContextLost, false);
    canvasElem.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasElem.removeEventListener('webglcontextlost', handleContextLost);
      canvasElem.removeEventListener('webglcontextrestored', handleContextRestored);
      cancelAnimationFrame(animId);
      controller.dispose();
      sourceSelectionMarkerRef.current = null;
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) geometries.add(object.geometry);
        const attached = (object as THREE.Mesh).material;
        if (Array.isArray(attached)) attached.forEach((material) => materials.add(material));
        else if (attached) materials.add(attached);
      });
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
      geometries.forEach((geometry) => geometry.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      <div className="absolute left-6 top-20 z-10 rounded-xl border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-900 shadow-sm pointer-events-none">
        <div className="font-semibold">FF-01 原始图纸 · 1:300 等比坐标</div>
        <div className="mt-0.5 text-amber-800">空间边界与门墙待核验；仅房间编号可定位，环境值为模拟样例</div>
      </div>

      {/* Modern Compact Map Controls HUD (Bottom Right of 3D Canvas) */}
      <div className={`absolute z-20 flex flex-col items-end gap-2 pointer-events-auto transition-[right,bottom] duration-300 ${hasSelectedSpace ? 'right-[26rem] bottom-[5.5rem] max-lg:right-6 max-lg:bottom-[34rem]' : 'right-6 bottom-6'}`}>
        {/* 2D / 2.5D View Mode Segmented Switcher */}
        <div className="flex items-center p-1 bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-lg">
          <button
            disabled
            title="等待 FF-01 房间边界、墙体和门洞完成校验"
            onClick={() => controllerRef.current?.setViewMode('explore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-not-allowed ${
              currentViewMode === 'explore'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'text-neutral-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2.5D 待校验</span>
          </button>
          <button
            onClick={() => controllerRef.current?.setViewMode('plan')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentViewMode === 'plan'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>2D 平面</span>
          </button>
        </div>

        {/* Map Tool Actions: Zoom In, Zoom Out, Reset, Fit */}
        <div className="flex items-center gap-1 p-1 bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-lg">
          <button
            onClick={() => controllerRef.current?.zoomIn()}
            title="放大 (Zoom In / 滚轮向前)"
            className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => controllerRef.current?.zoomOut()}
            title="缩小 (Zoom Out / 滚轮向后)"
            className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-neutral-200 mx-0.5" />
          <button
            onClick={() => controllerRef.current?.fitToPlan()}
            title="全图视野 (Fit Map)"
            className="px-2.5 py-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors flex items-center gap-1"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>全图</span>
          </button>
          <button
            onClick={() => controllerRef.current?.resetView()}
            title="重置视角 (Reset View)"
            className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modern Interaction Helper Hint (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-10 pointer-events-none hidden md:flex items-center gap-3 text-xs text-neutral-500 bg-white/70 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-neutral-200/60 shadow-sm">
        <span>左键拖拽平移</span>
        <span aria-hidden="true">·</span>
        <span>滚轮光标缩放</span>
        {currentViewMode === 'explore' && (
          <>
            <span aria-hidden="true">·</span>
            <span>右键拖拽环视旋转</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>点击房间编号查看详情</span>
      </div>

    </div>
  );
};
