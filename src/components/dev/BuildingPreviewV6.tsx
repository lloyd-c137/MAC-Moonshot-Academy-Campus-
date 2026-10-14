import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { ArrowLeft, Box, Eye, EyeOff, Maximize2, Rotate3D } from 'lucide-react';

type Segment = { segmentID: string; sourcePathID: string; layer: string; aPt: [number, number]; bPt: [number, number] };
type TraceEdge = { traceEdgeID: string; aPt: [number, number]; bPt: [number, number]; sourceEvidence: { semantic: string }[] };
type Space = { roomID: string; polygon: null | { coordinatesPdfDisplayPt: [number, number][]; candidateStatus: string; verificationLevel: string } };
type Architecture = {
  coordinateSystem: { metresPerPdfPoint: number; worldOriginPdfPt: [number, number]; pageSizePt: [number, number] };
  source: { drawing: string; sourcePdfSha256: string };
  wallNetwork: { segmentsBySemantic: Record<string, Segment[]>; segmentCounts: Record<string, number>; deduplicatedWallTraceSegments: TraceEdge[]; structuralFillCandidates: { sourcePathID: string; layer: string; polygonPt: [number, number][] }[] };
  evidenceNetworks: Record<string, Segment[]>;
  spaces: Space[];
  coverage: Record<string, unknown>;
};

const GROUP_COLORS: Record<string, number> = {
  'Existing Wall': 0x65766f,
  'New Partition': 0xd08b4b,
  'Architectural Wall': 0x71898a,
  'Structural Wall / Column': 0x344640,
  'Door': 0xc45742,
  'Window / Glazing': 0x48a9b5,
  'Stair': 0x9475aa,
  'Arena / Seating': 0x31817c,
  'Floor / Surface': 0x9b895c,
};
function worldPoint(point: [number, number], model: Architecture) {
  const scale = model.coordinateSystem.metresPerPdfPoint;
  const [originX, originY] = model.coordinateSystem.worldOriginPdfPt;
  return new THREE.Vector3((point[0] - originX) * scale, 0, (point[1] - originY) * scale);
}

export function BuildingPreviewV6() {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{ scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: MapControls; renderer: THREE.WebGLRenderer; groups: Map<string, THREE.Object3D>; roomMeshes: Map<string, THREE.Mesh>; frame: number } | null>(null);
  const [model, setModel] = useState<Architecture | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<'explore' | 'plan'>('explore');
  const modeRef = useRef<'explore' | 'plan'>('explore');
  const [selected, setSelected] = useState('M104');
  const [layers, setLayers] = useState<Record<string, boolean>>({ source: true, walls: true, fills: false, doors: false, stairs: false, arena: false, candidates: true });

  useEffect(() => {
    let cancelled = false;
    fetch('/ff01-architecture-v6.json').then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((data: Architecture) => { if (!cancelled) setModel(data); }).catch(error => setLoadError(String(error)));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !model) return;
    const width = Math.max(host.clientWidth, 1), height = Math.max(host.clientHeight, 1), aspect = width / height;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f3f2ec');
    const viewHeight = 190;
    const camera = new THREE.OrthographicCamera(-viewHeight * aspect / 2, viewHeight * aspect / 2, viewHeight / 2, -viewHeight / 2, 0.1, 1000);
    const centerPt: [number, number] = [model.coordinateSystem.pageSizePt[0] / 2, model.coordinateSystem.pageSizePt[1] / 2];
    const target = worldPoint(centerPt, model);
    camera.position.set(target.x + 15, 112, target.z + 132);
    camera.lookAt(target);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    host.replaceChildren(renderer.domElement);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.display = 'block';

    scene.add(new THREE.HemisphereLight(0xffffff, 0xc3c7bd, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0); keyLight.position.set(-90, 150, -70); keyLight.castShadow = true; scene.add(keyLight);

    const groups = new Map<string, THREE.Object3D>();
    const roomMeshes = new Map<string, THREE.Mesh>();
    const texture = new THREE.TextureLoader().load('/ff01-source-plan.png');
    texture.colorSpace = THREE.SRGBColorSpace;
    const pageW = model.coordinateSystem.pageSizePt[0] * model.coordinateSystem.metresPerPdfPoint;
    const pageH = model.coordinateSystem.pageSizePt[1] * model.coordinateSystem.metresPerPdfPoint;
    const source = new THREE.Mesh(new THREE.PlaneGeometry(pageW, pageH), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    source.rotation.x = -Math.PI / 2;
    source.position.copy(worldPoint(centerPt, model)); source.position.y = -0.025;
    scene.add(source); groups.set('source', source);

    const wallSegments = model.wallNetwork.deduplicatedWallTraceSegments;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
    const wallPrototype = new THREE.BoxGeometry(1, 2.8, 0.14);
    const wallInstances = new THREE.InstancedMesh(wallPrototype, wallMaterial, wallSegments.length);
    const wallDummy = new THREE.Object3D(); const wallUnitX = new THREE.Vector3(1, 0, 0);
    wallSegments.forEach((segment, index) => {
      const a = worldPoint(segment.aPt, model), b = worldPoint(segment.bPt, model);
      const delta = b.clone().sub(a); const length = delta.length();
      if (length < 0.01) return;
      wallDummy.position.copy(a).add(b).multiplyScalar(0.5); wallDummy.position.y = 1.4;
      wallDummy.scale.set(length, 1, 1); wallDummy.quaternion.setFromUnitVectors(wallUnitX, delta.normalize());
      wallDummy.updateMatrix(); wallInstances.setMatrixAt(index, wallDummy.matrix);
      const semantics = segment.sourceEvidence.map(item => item.semantic);
      const primary = semantics.includes('New Partition') ? 'New Partition' : semantics.includes('Existing Wall') ? 'Existing Wall' : 'Architectural Wall';
      wallInstances.setColorAt(index, new THREE.Color(GROUP_COLORS[primary]));
    });
    wallInstances.instanceMatrix.needsUpdate = true; wallInstances.castShadow = true; wallInstances.receiveShadow = true;
    const wallRoot = new THREE.Group(); wallRoot.add(wallInstances);
    scene.add(wallRoot); groups.set('walls', wallRoot);

    const fillRoot = new THREE.Group();
    const fillMat = new THREE.MeshStandardMaterial({ color: 0x263a33, roughness: 0.9 });
    for (const fill of model.wallNetwork.structuralFillCandidates) {
      if (fill.polygonPt.length < 3) continue;
      const shape = new THREE.Shape();
      fill.polygonPt.forEach((pt, i) => { const p = worldPoint(pt, model); if (i === 0) shape.moveTo(p.x, p.z); else shape.lineTo(p.x, p.z); });
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.8, bevelEnabled: false });
      geometry.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, fillMat); mesh.position.y = 2.8; mesh.castShadow = true; fillRoot.add(mesh);
    }
    scene.add(fillRoot); groups.set('fills', fillRoot);

    const evidenceMap: Record<string, string> = { doors: 'Door', stairs: 'Stair', arena: 'Arena / Seating' };
    for (const [uiKey, semantic] of Object.entries(evidenceMap)) {
      const evidence = model.evidenceNetworks[semantic] || [];
      const positions: number[] = [];
      for (const item of evidence) {
        const a = worldPoint(item.aPt, model), b = worldPoint(item.bPt, model);
        positions.push(a.x, 0.1, a.z, b.x, 0.1, b.z);
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: GROUP_COLORS[semantic], transparent: true, opacity: 0.9, depthWrite: false }));
      scene.add(line); groups.set(uiKey, line);
    }

    const candidateRoot = new THREE.Group();
    for (const room of model.spaces.filter(space => space.polygon)) {
      const pts = room.polygon!.coordinatesPdfDisplayPt;
      const shape = new THREE.Shape();
      pts.forEach((pt, i) => { const p = worldPoint(pt, model); if (i === 0) shape.moveTo(p.x, p.z); else shape.lineTo(p.x, p.z); });
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({ color: 0xe3a343, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = 0.045; mesh.userData.roomID = room.roomID;
      candidateRoot.add(mesh); roomMeshes.set(room.roomID, mesh);
      const outlinePoints = pts.map(pt => { const p = worldPoint(pt, model); return new THREE.Vector3(p.x, 0.08, p.z); });
      if (outlinePoints.length) outlinePoints.push(outlinePoints[0].clone());
      const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePoints), new THREE.LineBasicMaterial({ color: 0xb26414, linewidth: 1 })); candidateRoot.add(outline);
    }
    scene.add(candidateRoot); groups.set('candidates', candidateRoot);

    const controls = new MapControls(camera, renderer.domElement);
    controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN; controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.minZoom = 0.5; controls.maxZoom = 12; controls.zoomSpeed = 0.8; controls.zoomToCursor = true;
    controls.minPolarAngle = 0.18; controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.screenSpacePanning = false;
    const handleResize = () => {
      if (!host.isConnected) return;
      const w = Math.max(host.clientWidth, 1), h = Math.max(host.clientHeight, 1), ratio = w / h;
      camera.left = -viewHeight * ratio / 2; camera.right = viewHeight * ratio / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(handleResize); observer.observe(host);
    const render = () => { runtimeRef.current!.frame = requestAnimationFrame(render); controls.update(); renderer.render(scene, camera); };
    runtimeRef.current = { scene, camera, controls, renderer, groups, roomMeshes, frame: requestAnimationFrame(render) };
    return () => {
      observer.disconnect(); cancelAnimationFrame(runtimeRef.current?.frame ?? 0); controls.dispose();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Line) { object.geometry.dispose(); const material = object.material; if (Array.isArray(material)) material.forEach(item => item.dispose()); else material.dispose(); } });
      texture.dispose(); renderer.dispose(); renderer.domElement.remove(); runtimeRef.current = null;
    };
  }, [model]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    for (const [key, visible] of Object.entries(layers)) { const group = runtime.groups.get(key); if (group) group.visible = visible; }
  }, [layers, model]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    for (const [roomID, mesh] of runtime.roomMeshes) {
      const active = roomID === selected; (mesh.material as THREE.MeshBasicMaterial).color.set(active ? '#df8b27' : '#e3a343');
    }
  }, [selected, model]);

  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    const previousMode = modeRef.current;
    const target = runtime.controls.target;
    if (mode === 'plan') {
      runtime.controls.enableRotate = false;
      runtime.camera.position.set(target.x, 220, target.z); runtime.camera.up.set(0, 0, -1); runtime.camera.lookAt(target);
      if (previousMode !== mode) runtime.camera.zoom *= 0.9;
    } else {
      runtime.controls.enableRotate = true;
      runtime.camera.up.set(0, 1, 0);
      runtime.camera.position.set(target.x + 15, 112, target.z + 132); runtime.camera.lookAt(target);
      if (previousMode !== mode) runtime.camera.zoom /= 0.9;
    }
    runtime.camera.updateProjectionMatrix(); runtime.controls.update(); modeRef.current = mode;
  }, [mode, model]);

  const fit = () => {
    const runtime = runtimeRef.current; if (!runtime || !model) return;
    const target = worldPoint([model.coordinateSystem.pageSizePt[0] / 2, model.coordinateSystem.pageSizePt[1] / 2], model);
    runtime.controls.target.copy(target);
    runtime.camera.position.set(target.x + (mode === 'plan' ? 0 : 15), mode === 'plan' ? 220 : 112, target.z + (mode === 'plan' ? 0 : 132));
    runtime.camera.up.set(mode === 'plan' ? 0 : 0, 1, mode === 'plan' ? -1 : 0); runtime.camera.lookAt(target); runtime.camera.zoom = mode === 'plan' ? 0.9 : 1; runtime.camera.updateProjectionMatrix(); runtime.controls.update();
  };
  const toggle = (key: string) => setLayers(state => ({ ...state, [key]: !state[key] }));
  const controls = [
    ['source', '原始 FF-01'], ['walls', '墙体路径（示意高度）'], ['fills', '结构填充候选'], ['doors', '门扇路径（非开口确认）'], ['stairs', '楼梯路径'], ['arena', '球场 / 看台路径'], ['candidates', '六室候选（未验证）'],
  ];

  return <main className="fixed inset-0 flex flex-col bg-[#f3f2ec] text-[#17221e]">
    <header className="z-10 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/95 px-4 py-2 shadow-sm">
      <div className="flex items-center gap-3"><a href="/" className="rounded-full border p-2" aria-label="返回 MAC"><ArrowLeft size={16}/></a><div><div className="flex items-center gap-2 text-sm font-semibold"><Box size={16}/>FF-01 · 全图空间证据预览</div><p className="text-[11px] text-neutral-500">Developer Preview · {model ? `${model.source.drawing} · SHA-256 ${model.source.sourcePdfSha256.slice(0, 12)}…` : '加载源数据'}</p></div></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-900">几何未完成验证 · 非正式校园地图</span><button onClick={() => setMode(mode === 'plan' ? 'explore' : 'plan')} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-medium">{mode === 'plan' ? <Rotate3D size={14}/> : <Eye size={14}/>} {mode === 'plan' ? '2.5D 预览' : '严格俯视 2D'}</button><button onClick={fit} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs"><Maximize2 size={14}/> Fit</button></div>
    </header>
    <section className="relative min-h-0 flex-1">
      <div ref={hostRef} className="absolute inset-0" />
      {loadError && <div className="absolute inset-0 grid place-items-center bg-white text-sm text-red-700">空间数据加载失败：{loadError}</div>}
      <div className="absolute left-4 top-4 max-h-[calc(100%-2rem)] w-64 overflow-auto rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
        <h2 className="text-xs font-semibold">源图层与候选显示</h2>
        <div className="mt-2 space-y-1">{controls.map(([key, label]) => <button key={key} onClick={() => toggle(key)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"><span>{label}</span>{layers[key] ? <Eye size={13}/> : <EyeOff size={13}/>}</button>)}</div>
        <div className="mt-3 border-t pt-3"><label className="block text-[11px] font-semibold">候选房间</label><select value={selected} onChange={event => setSelected(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">{['M104','M102','S208','M103','S209','S210'].map(room => <option key={room}>{room}</option>)}</select><p className="mt-2 text-[10px] leading-relaxed text-amber-900">琥珀色多边形是已有可编辑候选，尚未独立逐边确认；不能据此推断其他未建模房间。</p></div>
        <div className="mt-3 border-t pt-3 text-[10px] leading-relaxed text-neutral-600">墙高 2.8 m 与墙厚 0.14 m 仅为预览参数。PDF 门扇路径没有作为门洞确认；未生成建筑外轮廓、完整房间、走廊或导航连接。</div>
      </div>
      <div className="absolute bottom-4 right-4 rounded-lg bg-white/90 px-3 py-2 text-[10px] text-neutral-600 shadow">左键平移 · 滚轮缩放 · 右键旋转（2.5D）</div>
    </section>
    <footer className="flex min-h-9 items-center justify-between border-t border-black/10 bg-white px-4 text-[10px] text-neutral-500"><span>{model ? `去重墙体源迹线 ${model.wallNetwork.deduplicatedWallTraceSegments.length.toLocaleString()} 段 · ${model.wallNetwork.structuralFillCandidates.length.toLocaleString()} 个填充候选 · 101 个标签位置` : '读取模型中'}</span><a className="underline" href="/dev/geometry-review">打开六室审阅工作流</a></footer>
  </main>;
}
