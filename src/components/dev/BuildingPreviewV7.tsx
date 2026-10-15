import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { ArrowLeft, Eye, EyeOff, Maximize2, Rotate3D, ScanLine } from 'lucide-react';
import type { ArchitectureV7 } from '../../types/architecture';
import { pdfDisplayPtToWorldXZ } from '../../data/canonicalGeometry';
import { createArchitecturalSceneV7, disposeArchitecturalLayers, type V7SceneLayers } from './architecturalSceneV7';

type Runtime = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: MapControls;
  renderer: THREE.WebGLRenderer;
  layers: V7SceneLayers;
  sourcePlane: THREE.Mesh;
  target: THREE.Vector3;
  frame: number;
  transitionFrame: number;
  transitionToken: number;
  explorePose: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null;
};

const COLOR_BY_LAYER = {
  traces: '墙体迹线', wallFaces: '墙体面候选', arena: '莲花球场与座席', candidates: '六室候选', labels: '全部房间标签',
};

export function BuildingPreviewV7() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [model, setModel] = useState<ArchitectureV7 | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'explore' | 'plan'>('explore');
  const [sourceVisible, setSourceVisible] = useState(false);
  const [layersVisible, setLayersVisible] = useState({ traces: true, wallFaces: true, arena: true, candidates: true, labels: true });
  const [selected, setSelected] = useState('M104');
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/ff01-architecture-v7.json').then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<ArchitectureV7>;
    }).then(data => {
      if (!cancelled) setModel(data);
    }).catch(reason => setError(String(reason)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f1f0e9');
    const viewHeight = 145;
    const camera = new THREE.OrthographicCamera(-viewHeight * width / height / 2, viewHeight * width / height / 2, viewHeight / 2, -viewHeight / 2, 0.05, 1200);
    const layers = createArchitecturalSceneV7(model);
    const traceCoordinates = model.wallNetwork.traceObjects.flatMap(item => item.geometry.coordinates);
    const points = traceCoordinates;
    const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
    const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
    const centerPt: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
    const [centerX, centerZ] = pdfDisplayPtToWorldXZ(centerPt);
    const target = new THREE.Vector3(centerX, 0, centerZ);
    camera.up.set(0, 1, 0);
    camera.position.set(centerX + 19, 118, centerZ + 132);
    camera.lookAt(target);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc8c7bd, 2.2));
    const sun = new THREE.DirectionalLight(0xfff8e9, 2.0);
    sun.position.set(-85, 155, -75); sun.castShadow = true; scene.add(sun);
    for (const group of [layers.traces, layers.wallFaces, layers.arena, layers.candidates, layers.labels]) scene.add(group);

    const texture = new THREE.TextureLoader().load('/ff01-source-plan.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    const pageW = model.coordinateSystem.pageSizePt[0] * model.coordinateSystem.metresPerPdfPoint;
    const pageH = model.coordinateSystem.pageSizePt[1] * model.coordinateSystem.metresPerPdfPoint;
    const [pageX, pageZ] = pdfDisplayPtToWorldXZ([model.coordinateSystem.pageSizePt[0] / 2, model.coordinateSystem.pageSizePt[1] / 2]);
    const sourcePlane = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageH), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }));
    sourcePlane.rotation.x = -Math.PI / 2; sourcePlane.position.set(pageX, -0.16, pageZ); sourcePlane.visible = false; scene.add(sourcePlane);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
    host.replaceChildren(renderer.domElement);

    const controls = new MapControls(camera, renderer.domElement);
    controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN; controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.minZoom = 0.45; controls.maxZoom = 14; controls.zoomSpeed = 0.85; controls.zoomToCursor = true;
    controls.minPolarAngle = 0.18; controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.screenSpacePanning = false;

    const runtime: Runtime = { scene, camera, controls, renderer, layers, sourcePlane, target, frame: 0, transitionFrame: 0, transitionToken: 0, explorePose: null };
    runtimeRef.current = runtime;
    const resize = () => {
      const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1), aspect = w / h;
      camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize); observer.observe(host);
    const render = () => { runtime.frame = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); };
    runtime.frame = requestAnimationFrame(render);

    let down: [number, number] | null = null;
    const onDown = (event: PointerEvent) => { down = [event.clientX, event.clientY]; };
    const onUp = (event: PointerEvent) => {
      if (event.button !== 0) { down = null; return; }
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.params.Points!.threshold = Math.max(0.25, 1.5 / camera.zoom);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([layers.candidates, layers.labels], true);
      const hit = hits[0];
      if (!hit) return;
      const roomID = hit.object.userData.roomID as string | undefined;
      if (roomID) setSelected(roomID);
      else if (hit.object.userData.roomIDs && typeof hit.index === 'number') setSelected((hit.object.userData.roomIDs as string[])[hit.index]);
    };
    const onManualInput = () => {
      if (runtime.transitionFrame) cancelAnimationFrame(runtime.transitionFrame);
      runtime.transitionFrame = 0; runtime.transitionToken += 1; controls.enabled = true;
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointerdown', onManualInput);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    return () => {
      observer.disconnect(); cancelAnimationFrame(runtime.frame); cancelAnimationFrame(runtime.transitionFrame);
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointerdown', onManualInput); renderer.domElement.removeEventListener('contextmenu', onContextMenu); controls.dispose();
      disposeArchitecturalLayers(layers);
      sourcePlane.geometry.dispose(); (sourcePlane.material as THREE.Material).dispose(); texture.dispose(); renderer.dispose(); renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.sourcePlane.visible = sourceVisible;
    for (const [key, visible] of Object.entries(layersVisible)) {
      const group = runtime.layers[key as keyof typeof layersVisible];
      group.visible = visible;
    }
    const selectedSpace = model?.spaces.find(space => space.sourceRoomID === selected);
    setSelectedStatus(selectedSpace ? selectedSpace.geometry ? `${selectedSpace.geometryStatus} · ${selectedSpace.verificationLevel}` : '几何未恢复 · 仅标签锚点' : '');
    for (const space of model?.spaces ?? []) {
      const mesh = runtime.layers.selectable.get(space.spaceID);
      if (mesh instanceof THREE.Mesh) (mesh.material as THREE.MeshBasicMaterial).color.set(space.sourceRoomID === selected ? '#e38a24' : '#f2a64a');
    }
  }, [sourceVisible, layersVisible, selected, model]);

  const toggleMode = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const nextMode = mode === 'explore' ? 'plan' : 'explore';
    const { camera, controls } = runtime;
    const fromPosition = camera.position.clone(), fromQuaternion = camera.quaternion.clone();
    const fromTarget = controls.target.clone(), fromZoom = camera.zoom;
    if (mode === 'explore') runtime.explorePose = { position: fromPosition.clone(), target: fromTarget.clone(), zoom: fromZoom };
    const toTarget = fromTarget.clone();
    const toPosition = nextMode === 'plan'
      ? new THREE.Vector3(toTarget.x, 205, toTarget.z)
      : runtime.explorePose?.position.clone() ?? new THREE.Vector3(toTarget.x + 19, 118, toTarget.z + 132);
    const toZoom = nextMode === 'plan' ? Math.max(fromZoom * 0.95, 0.7) : runtime.explorePose?.zoom ?? fromZoom;
    const targetCamera = camera.clone();
    targetCamera.up.set(nextMode === 'plan' ? 0 : 0, nextMode === 'plan' ? 0 : 1, nextMode === 'plan' ? -1 : 0); targetCamera.position.copy(toPosition); targetCamera.lookAt(toTarget);
    const toQuaternion = targetCamera.quaternion.clone();
    controls.enableRotate = nextMode === 'explore';
    controls.minPolarAngle = nextMode === 'plan' ? 0 : 0.18;
    controls.maxPolarAngle = nextMode === 'plan' ? 0.0001 : Math.PI / 2 - 0.025;
    controls.enabled = false;
    const token = ++runtime.transitionToken, started = performance.now(), duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 560;
    const animate = (now: number) => {
      if (runtime.transitionToken !== token) return;
      const t = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fromPosition, toPosition, eased);
      camera.quaternion.copy(fromQuaternion).slerp(toQuaternion, eased);
      camera.zoom = fromZoom + (toZoom - fromZoom) * eased;
      controls.target.copy(fromTarget).lerp(toTarget, eased);
      camera.updateProjectionMatrix();
      if (t < 1) runtime.transitionFrame = requestAnimationFrame(animate);
      else { runtime.transitionFrame = 0; controls.enabled = true; }
    };
    runtime.transitionFrame = requestAnimationFrame(animate);
    camera.up.set(nextMode === 'plan' ? 0 : 0, nextMode === 'plan' ? 0 : 1, nextMode === 'plan' ? -1 : 0);
    setMode(nextMode);
  };

  const fit = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (runtime.transitionFrame) cancelAnimationFrame(runtime.transitionFrame);
    runtime.transitionFrame = 0; runtime.transitionToken += 1;
    const target = runtime.target.clone(); runtime.controls.target.copy(target);
    runtime.camera.up.set(0, mode === 'plan' ? 0 : 1, mode === 'plan' ? -1 : 0);
    runtime.camera.position.set(target.x + (mode === 'plan' ? 0 : 19), mode === 'plan' ? 205 : 118, target.z + (mode === 'plan' ? 0 : 132));
    runtime.camera.lookAt(target); runtime.camera.zoom = mode === 'plan' ? 0.95 : 0.9;
    runtime.camera.updateProjectionMatrix(); runtime.controls.enabled = true; runtime.controls.update();
  };

  return <main className="fixed inset-0 flex flex-col bg-[#f1f0e9] text-[#20322d]">
    <header className="z-10 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/95 px-4 py-2 shadow-sm">
      <div className="flex items-center gap-3"><a href="/" className="rounded-full border p-2" aria-label="返回 MAC"><ArrowLeft size={16}/></a><div><div className="flex items-center gap-2 text-sm font-semibold"><ScanLine size={16}/>FF-01 · V7 语义建筑几何</div><p className="text-[11px] text-neutral-500">源图对齐候选 · SHA-256 {model?.sourceMetadata.sourcePdfSha256.slice(0, 12) ?? '加载中'}…</p></div></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-950">Unverified Architectural Preview</span><button onClick={toggleMode} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-medium">{mode === 'explore' ? <Eye size={14}/> : <Rotate3D size={14}/>} {mode === 'explore' ? '2D 平面' : '2.5D 预览'}</button><button onClick={fit} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs"><Maximize2 size={14}/> Fit Building</button></div>
    </header>
    <section className="relative min-h-0 flex-1"><div ref={hostRef} className="absolute inset-0"/>
      {error && <div className="absolute inset-0 grid place-items-center bg-white text-sm text-red-700">V7 几何数据加载失败：{error}</div>}
      <aside className="absolute left-4 top-4 max-h-[calc(100%-2rem)] w-72 overflow-auto rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
        <h2 className="text-xs font-semibold">Canonical 2D / 2.5D Geometry</h2>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-600">视图共享 FF-01 PDF Display Point 坐标。关闭源图后仍显示独立矢量建筑证据。</p>
        <button onClick={() => setSourceVisible(value => !value)} className="mt-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"><span>Source PDF Overlay</span>{sourceVisible ? <Eye size={13}/> : <EyeOff size={13}/>}</button>
        <div className="mt-2 space-y-1">{Object.entries(COLOR_BY_LAYER).map(([key, label]) => <button key={key} onClick={() => setLayersVisible(value => ({ ...value, [key]: !value[key as keyof typeof value] }))} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"><span>{label}</span>{layersVisible[key as keyof typeof layersVisible] ? <Eye size={13}/> : <EyeOff size={13}/>}</button>)}</div>
        <div className="mt-3 border-t pt-3"><label className="block text-[11px] font-semibold">图纸房间标签</label><select value={selected} onChange={event => setSelected(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">{model?.spaces.map(space => <option key={space.spaceID} value={space.sourceRoomID}>{space.sourceRoomID}</option>)}</select><p className="mt-1 text-[10px] font-medium text-amber-900">{selected} · {selectedStatus}</p></div>
        <div className="mt-3 border-t pt-3 text-[10px] leading-relaxed text-neutral-600">{model ? `${model.wallNetwork.traceObjects.length.toLocaleString()} 条墙迹线 · ${model.wallNetwork.wallFaceCandidates.length.toLocaleString()} 个墙面候选 · ${model.arena.seatFootprints.length} 个图纸座席` : '读取模型中'}<br/>{model?.coverage.expectedLabels as number} 个图纸标签 · {model?.coverage.candidateSpaces as number} 个未验证房间候选 · 走廊 0 · 建筑外轮廓未解析</div>
        <p className="mt-2 rounded bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-950">墙体高度和座席高度仅为示意参数。图层源迹线不等于已确认墙体语义；未生成走廊、完整外轮廓或正式导航。</p>
      </aside>
      <div className="absolute bottom-4 right-4 rounded-lg bg-white/90 px-3 py-2 text-[10px] text-neutral-600 shadow">左键平移 · 滚轮光标缩放 · 右键旋转（2.5D）· 点击房间标签</div>
    </section>
    <footer className="flex min-h-9 items-center justify-between border-t border-black/10 bg-white px-4 text-[10px] text-neutral-500"><span>V6 源证据保留 · V7 候选 geometry 不代表 Drawing Verified</span><a className="underline" href="/dev/geometry-review">打开房间边界审阅</a></footer>
  </main>;
}
