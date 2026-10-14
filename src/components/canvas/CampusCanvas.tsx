import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CAMPUS_SPACES } from '../../data/floorplanData';
import { NAVIGATION_NODES, NAVIGATION_EDGES } from '../../services/navigation';
import { CampusSpace, MapLayerMode, NavigationRoute } from '../../types/campus';
import {
  buildArchitecturalModel,
  planToWorld,
  ModelBuildResult,
} from './architecturalModel';
import { CampusCameraController, CameraState, ViewMode } from './cameraController';
import { Compass, Maximize2, RotateCcw, Plus, Minus, Layers } from 'lucide-react';

interface CampusCanvasProps {
  layerMode: MapLayerMode;
  selectedSpaceId: string | null;
  hoveredSpaceId: string | null;
  activeRoute: NavigationRoute | null;
  reviewMode: boolean;
  showNavGraph: boolean;
  showGrid: boolean;
  onSelectSpace: (spaceId: string | null) => void;
  onHoverSpace: (spaceId: string | null) => void;
}

// Generate color based on active layer mode
function getSpaceColor(space: CampusSpace, layerMode: MapLayerMode, isHovered: boolean, isSelected: boolean): number {
  if (isSelected) return 0xf59e0b; // Bright amber accent
  if (isHovered) return 0xfcd34d; // Soft amber hover

  if (layerMode === 'temperature') {
    const t = space.environment.temperature;
    if (t < 22.0) return 0x38bdf8; // Light Sky Blue (Cool)
    if (t < 22.8) return 0x34d399; // Mint Emerald (Ideal)
    if (t < 23.5) return 0xfbbf24; // Warm Amber
    return 0xf87171; // Soft Coral (Warm)
  }

  if (layerMode === 'humidity') {
    const h = space.environment.humidity;
    if (h < 44) return 0x93c5fd; // Pale Blue
    if (h < 48) return 0x38bdf8; // Cyan
    if (h < 52) return 0x2dd4bf; // Teal
    return 0x0ea5e9; // Deeper Blue
  }

  if (layerMode === 'co2') {
    const c = space.environment.co2;
    if (c < 550) return 0x4ade80; // Fresh Green
    if (c < 680) return 0xa3e635; // Lime Green
    if (c < 750) return 0xfbbf24; // Moderate Amber
    return 0xf87171; // Higher CO2 Warning
  }

  if (layerMode === 'pulse') {
    switch (space.pulse) {
      case 'very_busy':
        return 0xec4899; // Rose Red
      case 'busy':
        return 0xf97316; // Orange
      case 'moderate':
        return 0x38bdf8; // Cyan Blue
      case 'quiet':
      default:
        return 0x10b981; // Tranquil Green
    }
  }

  if (layerMode === 'spaces') {
    switch (space.category) {
      case 'arena':
        return 0xc98d50; // Maple court
      case 'creative_maker':
        return 0xa7f3d0; // Mint green creative
      case 'quiet_study':
        return 0xbae6fd; // Quiet sky
      case 'library_reading':
        return 0xc7d2fe; // Lavender blue
      case 'laboratory':
        return 0x99f6e4; // Crisp scientific teal
      case 'dining':
        return 0xfde68a; // Warm dining cream
      case 'performance_hall':
        return 0xfecdd3; // Velvet rose
      case 'courtyard':
        return 0x8cc67c; // Fresh garden grass
      case 'entrance':
        return 0xe2e8f0; // Slate lobby
      default:
        return 0xf1f5f9;
    }
  }

  // Default 'explore' mode: architectural soft materials
  if (space.category === 'arena') return 0xc98d50;
  if (space.category === 'courtyard') return 0x8cc67c;
  if (space.category === 'creative_maker') return 0xd1fae5;
  if (space.category === 'quiet_study') return 0xe0f2fe;
  if (space.category === 'dining') return 0xfef3c7;
  if (space.category === 'performance_hall') return 0xfce7f3;

  return 0xffffff;
}

export const CampusCanvas: React.FC<CampusCanvasProps> = ({
  layerMode,
  selectedSpaceId,
  hoveredSpaceId,
  activeRoute,
  reviewMode,
  showNavGraph,
  showGrid,
  onSelectSpace,
  onHoverSpace,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const controllerRef = useRef<CampusCameraController | null>(null);
  const modelResultRef = useRef<ModelBuildResult | null>(null);

  const routeLineRef = useRef<THREE.Line | null>(null);
  const navGraphGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperGroupRef = useRef<THREE.Group | null>(null);
  const pulseRipplesRef = useRef<THREE.Mesh[]>([]);

  // Local camera state for HUD display
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>('explore');
  const [currentZoom, setCurrentZoom] = useState(1.0);

  // Focus on selected space smoothly
  useEffect(() => {
    if (!selectedSpaceId || !controllerRef.current) return;
    const space = CAMPUS_SPACES.find((s) => s.id === selectedSpaceId);
    if (!space) return;

    const wPos = planToWorld(space.center.x, space.center.y);
    controllerRef.current.focusOnPosition(wPos.x, wPos.z, 1.45);
  }, [selectedSpaceId]);

  // Three.js scene initialization
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf6f5f1); // Warm architectural off-white
    scene.fog = new THREE.FogExp2(0xf6f5f1, 0.0005);

    // 2. Camera: Orthographic Isometric Camera
    const aspect = width / height;
    const frustumSize = 460;
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      1,
      2500
    );
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // 4. Studio Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.3);
    dirLight.position.set(320, 520, 260);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 1300;
    const d = 340;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.45);
    fillLight.position.set(-300, 250, -250);
    scene.add(fillLight);

    // 5. Build Architectural Cutaway Campus Model (Hollow rooms + 3D walls + 3D Lotus Arena)
    const modelResult = buildArchitecturalModel();
    modelResultRef.current = modelResult;
    scene.add(modelResult.rootGroup);

    // 6. Camera Controller
    const controller = new CampusCameraController(camera, renderer.domElement);
    controllerRef.current = controller;

    controller.setCallbacks({
      onStateChange: (state: CameraState) => {
        setCurrentViewMode(state.viewMode);
        setCurrentZoom(state.zoom);

        // Adjust walls in 2D Plan View: in Plan view, scale wall height down slightly
        // so the flat floor blueprint is 100% visible and unoccluded!
        if (modelResultRef.current) {
          const isPlan = state.viewMode === 'plan';
          const wallYScale = THREE.MathUtils.lerp(
            modelResultRef.current.wallGroup.scale.y,
            isPlan ? 0.05 : 1.0,
            0.15
          );
          modelResultRef.current.wallGroup.scale.y = wallYScale;
        }
      },
      onClickRaycast: (ndc: THREE.Vector2) => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        if (modelResultRef.current) {
          const intersects = raycaster.intersectObjects(
            modelResultRef.current.pickingMeshes,
            false
          );
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            const spaceId = hit.userData?.spaceId;
            if (spaceId) {
              onSelectSpace(spaceId);
              return;
            }
          }
        }
        // Clicked on ground/empty area
        onSelectSpace(null);
      },
      onHoverRaycast: (ndc: THREE.Vector2) => {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        if (modelResultRef.current) {
          const intersects = raycaster.intersectObjects(
            modelResultRef.current.pickingMeshes,
            false
          );
          if (intersects.length > 0) {
            const hit = intersects[0].object;
            const spaceId = hit.userData?.spaceId;
            if (spaceId && spaceId !== hoveredSpaceId) {
              onHoverSpace(spaceId);
              renderer.domElement.style.cursor = 'pointer';
              return;
            }
          } else if (hoveredSpaceId) {
            onHoverSpace(null);
            renderer.domElement.style.cursor = 'default';
          }
        }
      },
    });

    // 7. Architectural Grid & Axis Markers (FF-01 Reference Grid 1-18, A-Q)
    const gridGroup = new THREE.Group();
    gridHelperGroupRef.current = gridGroup;
    scene.add(gridGroup);

    const gridLinesMat = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.25,
    });

    for (let xNorm = 50; xNorm <= 950; xNorm += 55) {
      const wPt1 = planToWorld(xNorm, 40);
      const wPt2 = planToWorld(xNorm, 820);
      const pts = [new THREE.Vector3(wPt1.x, 0.4, wPt1.z), new THREE.Vector3(wPt2.x, 0.4, wPt2.z)];
      const gLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridLinesMat);
      gridGroup.add(gLine);
    }
    for (let yNorm = 60; yNorm <= 800; yNorm += 55) {
      const wPt1 = planToWorld(40, yNorm);
      const wPt2 = planToWorld(960, yNorm);
      const pts = [new THREE.Vector3(wPt1.x, 0.4, wPt1.z), new THREE.Vector3(wPt2.x, 0.4, wPt2.z)];
      const gLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridLinesMat);
      gridGroup.add(gLine);
    }

    // 8. Navigation Graph Visualization (Review Mode)
    const navGroup = new THREE.Group();
    navGraphGroupRef.current = navGroup;
    scene.add(navGroup);

    const edgeLineMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.6,
    });

    NAVIGATION_EDGES.forEach((edge) => {
      const fromNode = NAVIGATION_NODES.find((n) => n.id === edge.from);
      const toNode = NAVIGATION_NODES.find((n) => n.id === edge.to);
      if (fromNode && toNode) {
        const p1 = planToWorld(fromNode.x, fromNode.y);
        const p2 = planToWorld(toNode.x, toNode.y);
        const pts = [new THREE.Vector3(p1.x, 2.5, p1.z), new THREE.Vector3(p2.x, 2.5, p2.z)];
        const eLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeLineMat);
        navGroup.add(eLine);
      }
    });

    const nodeDotGeo = new THREE.SphereGeometry(1.4, 8, 8);
    const nodeDotMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    NAVIGATION_NODES.forEach((n) => {
      const p = planToWorld(n.x, n.y);
      const dot = new THREE.Mesh(nodeDotGeo, nodeDotMat);
      dot.position.set(p.x, 2.5, p.z);
      navGroup.add(dot);
    });

    // 9. Pulse Ripples
    const pulseLocs = [
      { x: 500, y: 432, col: 0xf97316 }, // Lotus Arena
      { x: 780, y: 150, col: 0xec4899 }, // A114 Dining
      { x: 230, y: 220, col: 0x6366f1 }, // M103 Makerspace
      { x: 500, y: 780, col: 0x10b981 }, // South Entrance
    ];

    pulseLocs.forEach((loc) => {
      const rippleGeo = new THREE.RingGeometry(4, 7, 32);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: loc.col,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      const wp = planToWorld(loc.x, loc.y);
      ripple.position.set(wp.x, 9.2, wp.z);
      scene.add(ripple);
      pulseRipplesRef.current.push(ripple);
    });

    // 10. Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      controller.update();

      // Animate pulse ripples
      const time = clock.getElapsedTime();
      pulseRipplesRef.current.forEach((r, idx) => {
        const s = 1.0 + Math.sin(time * 3 + idx * 1.5) * 0.35;
        r.scale.set(s, s, 1);
        (r.material as THREE.MeshBasicMaterial).opacity =
          0.35 + Math.cos(time * 3 + idx * 1.5) * 0.25;
      });

      // Animate active navigation route glow
      if (routeLineRef.current) {
        const mat = routeLineRef.current.material as THREE.LineBasicMaterial;
        mat.opacity = 0.75 + Math.sin(time * 4) * 0.25;
      }

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
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync Layer Mode & Color Highlights
  useEffect(() => {
    if (!modelResultRef.current) return;
    const { floorMeshes } = modelResultRef.current;

    CAMPUS_SPACES.forEach((space) => {
      const mesh = floorMeshes.get(space.id);
      if (!mesh) return;

      const isSel = space.id === selectedSpaceId;
      const isHov = space.id === hoveredSpaceId;
      const col = getSpaceColor(space, layerMode, isHov, isSel);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.setHex(col);

      // Floor height slight elevation on select
      if (isSel) {
        mesh.position.y = 0.45;
      } else if (isHov) {
        mesh.position.y = 0.3;
      } else {
        mesh.position.y = space.category === 'courtyard' ? 0.08 : 0.12;
      }
    });
  }, [layerMode, selectedSpaceId, hoveredSpaceId]);

  // Sync Active Route Line in 3D
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (routeLineRef.current) {
      scene.remove(routeLineRef.current);
      routeLineRef.current.geometry.dispose();
      routeLineRef.current = null;
    }

    if (activeRoute && activeRoute.nodes.length > 1) {
      const points = activeRoute.nodes.map((n) => {
        const p = planToWorld(n.x, n.y);
        return new THREE.Vector3(p.x, 1.2, p.z);
      });

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x0284c7, // Vibrant electric cyan path
        linewidth: 4,
        transparent: true,
        opacity: 0.9,
      });

      const routeMesh = new THREE.Line(lineGeo, lineMat);
      scene.add(routeMesh);
      routeLineRef.current = routeMesh;
    }
  }, [activeRoute]);

  // Sync Review Mode, Grid, and Nav Graph Visibility
  useEffect(() => {
    if (navGraphGroupRef.current) {
      navGraphGroupRef.current.visible = showNavGraph || reviewMode;
    }
    if (gridHelperGroupRef.current) {
      gridHelperGroupRef.current.visible = showGrid || reviewMode;
    }
  }, [showNavGraph, showGrid, reviewMode]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* Modern Compact Map Controls HUD (Bottom Right of 3D Canvas) */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        {/* 2D / 2.5D View Mode Segmented Switcher */}
        <div className="flex items-center p-1 bg-white/90 backdrop-blur-md rounded-xl border border-neutral-200/90 shadow-lg">
          <button
            onClick={() => controllerRef.current?.setViewMode('explore')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentViewMode === 'explore'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2.5D 立体</span>
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
        <span>点击教室查看详情</span>
      </div>

      {/* Verified Plan Stamp Badge (Top Left) */}
      <div className="absolute top-20 left-6 z-10 pointer-events-none flex flex-col gap-1 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800">图纸标准: FF-01</span>
          <span aria-hidden="true">·</span>
          <span>比例 1:300</span>
          <span aria-hidden="true">·</span>
          <span>134.1m × 115.8m</span>
        </div>
        <div className="text-[11px] text-neutral-400">
          基于广州亚泰工程出图平面 · 莲花球场与各翼真实轴网
        </div>
      </div>
    </div>
  );
};
