import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { ArrowLeft, Eye, EyeOff, Maximize2, Rotate3D, ScanLine } from 'lucide-react';
import type { ArchitectureV7, PdfPoint } from '../../types/architecture';
import type { ArchitectureV8 } from '../../types/architectureV8';
import { pdfDisplayPtToWorldXZ } from '../../data/canonicalGeometry';
import { createArchitecturalSceneV7, disposeArchitecturalLayers } from './architecturalSceneV7';

type Mode = 'plan' | 'explore';
type Runtime = { scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: MapControls; renderer: THREE.WebGLRenderer; frame: number; source: THREE.Mesh; groups: Record<string, THREE.Group>; transition: number };

function shapeFromRing(ring: PdfPoint[]) {
  const shape = new THREE.Shape();
  ring.forEach((point, index) => {
    const [x, z] = pdfDisplayPtToWorldXZ(point);
    if (!index) shape.moveTo(x, z); else shape.lineTo(x, z);
  });
  shape.closePath(); return shape;
}

function lineGroup(rows: PdfPoint[][], color: number, y: number, opacity=1) {
  const positions: number[]=[];
  for (const line of rows) for (let i=1;i<line.length;i+=1) {
    const [ax,az]=pdfDisplayPtToWorldXZ(line[i-1]); const [bx,bz]=pdfDisplayPtToWorldXZ(line[i]);
    positions.push(ax,y,az,bx,y,bz);
  }
  const group=new THREE.Group(); const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  group.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:false}))); return group;
}

export function BuildingPreviewV8() {
  const hostRef=useRef<HTMLDivElement>(null); const runtimeRef=useRef<Runtime|null>(null);
  const [model,setModel]=useState<ArchitectureV8|null>(null); const [error,setError]=useState('');
  const [mode,setMode]=useState<Mode>('explore'); const [sourceVisible,setSourceVisible]=useState(false);
  const [visible,setVisible]=useState({traces:true,wallFaces:true,rooms:true,corridors:true,arena:true,footprint:true});
  const [selected,setSelected]=useState('M105'); const [selectedStatus,setSelectedStatus]=useState('');

  useEffect(()=>{let cancelled=false;fetch('/ff01-architecture-v8.json').then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json() as Promise<ArchitectureV8>;}).then(data=>{if(!cancelled)setModel(data);}).catch(reason=>setError(String(reason)));return()=>{cancelled=true;};},[]);

  useEffect(()=>{
    const host=hostRef.current;if(!host||!model)return;
    const width=Math.max(host.clientWidth,1),height=Math.max(host.clientHeight,1),viewHeight=145;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#f2f0e9');
    const camera=new THREE.OrthographicCamera(-viewHeight*width/height/2,viewHeight*width/height/2,viewHeight/2,-viewHeight/2,0.05,1500);
    const adapted={...model,modelID:'FF01-ARCHITECTURE-V7',arena:{courtBoundaries:model.arena.courtBoundaryCandidates,seatFootprints:model.arena.seatFootprintCandidates,standTraces:model.arena.standTraceCandidates,arenaBoundaryTraces:model.arena.boundaryTraceCandidates,ringCorridor:null}} as unknown as ArchitectureV7;
    const layers=createArchitecturalSceneV7(adapted);
    const groups:Record<string,THREE.Group>={traces:layers.traces,wallFaces:layers.wallFaces,rooms:layers.candidates,corridors:new THREE.Group(),arena:layers.arena,footprint:new THREE.Group()};
    const corridorMaterial=new THREE.MeshBasicMaterial({color:0x3d9bc7,transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false});
    for(const corridor of model.circulation.corridors){
      const geometry=new THREE.ShapeGeometry(shapeFromRing(corridor.geometry.coordinates[0]));geometry.rotateX(Math.PI/2);
      const mesh=new THREE.Mesh(geometry,corridorMaterial);mesh.position.y=.18;mesh.userData.corridorID=corridor.id;groups.corridors.add(mesh);
      const edgeRows=corridor.geometry.coordinates.map(ring=>ring as PdfPoint[]);groups.corridors.add(lineGroup(edgeRows,0x126c99,.205,1));
    }
    const perimeterRows=model.buildingFootprint.boundarySegments.map(segment=>segment.geometry.coordinates);
    groups.footprint.add(lineGroup(perimeterRows,0xb94f3d,.16,.82));
    for(const group of Object.values(groups))scene.add(group);

    scene.add(new THREE.HemisphereLight(0xffffff,0xc7c5bc,2.1));const key=new THREE.DirectionalLight(0xfff8e9,1.8);key.position.set(-80,155,-75);key.castShadow=true;scene.add(key);
    const texture=new THREE.TextureLoader().load('/ff01-source-plan.png');texture.colorSpace=THREE.SRGBColorSpace;
    const pageW=model.coordinateSystem.pageSizePt[0]*model.coordinateSystem.metresPerPdfPoint,pageH=model.coordinateSystem.pageSizePt[1]*model.coordinateSystem.metresPerPdfPoint;
    const [pageX,pageZ]=pdfDisplayPtToWorldXZ([model.coordinateSystem.pageSizePt[0]/2,model.coordinateSystem.pageSizePt[1]/2]);
    const source=new THREE.Mesh(new THREE.PlaneGeometry(pageW,pageH),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.54,side:THREE.DoubleSide,depthWrite:false}));source.rotation.x=-Math.PI/2;source.position.set(pageX,-.16,pageZ);source.visible=false;scene.add(source);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(width,height);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none;';host.replaceChildren(renderer.domElement);
    const [cx,cz]=pdfDisplayPtToWorldXZ([1095,850]);const target=new THREE.Vector3(cx,0,cz);camera.up.set(0,1,0);camera.position.set(cx+20,118,cz+132);camera.lookAt(target);
    const controls=new MapControls(camera,renderer.domElement);controls.target.copy(target);controls.enableDamping=true;controls.dampingFactor=.08;controls.mouseButtons.LEFT=THREE.MOUSE.PAN;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;controls.minZoom=.42;controls.maxZoom=16;controls.zoomSpeed=.85;controls.zoomToCursor=true;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI/2-.025;controls.screenSpacePanning=false;
    const runtime:Runtime={scene,camera,controls,renderer,frame:0,source,groups,transition:0};runtimeRef.current=runtime;
    const resize=()=>{const w=Math.max(host.clientWidth,1),h=Math.max(host.clientHeight,1),aspect=w/h;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();renderer.setSize(w,h);};const observer=new ResizeObserver(resize);observer.observe(host);
    const render=()=>{runtime.frame=requestAnimationFrame(render);controls.update();renderer.render(scene,camera);};runtime.frame=requestAnimationFrame(render);
    let down:{x:number;y:number;id:number}|null=null;const onDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY,id:event.pointerId};};
    const onUp=(event:PointerEvent)=>{if(event.button!==0||!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect();const pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects([layers.candidates],true)[0];const roomID=hit?.object.userData.roomID as string|undefined;if(roomID)setSelected(roomID);};
    const preventContext=(event:MouseEvent)=>event.preventDefault();renderer.domElement.addEventListener('pointerdown',onDown);renderer.domElement.addEventListener('pointerup',onUp);renderer.domElement.addEventListener('contextmenu',preventContext);
    return()=>{cancelAnimationFrame(runtime.frame);if(runtime.transition)cancelAnimationFrame(runtime.transition);observer.disconnect();renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('contextmenu',preventContext);controls.dispose();texture.dispose();disposeArchitecturalLayers(layers);for(const group of [groups.corridors,groups.footprint])group.traverse(obj=>{if(obj instanceof THREE.Mesh||obj instanceof THREE.LineSegments){obj.geometry.dispose();const mats=Array.isArray(obj.material)?obj.material:[obj.material];mats.forEach(mat=>mat.dispose());}});corridorMaterial.dispose();renderer.dispose();host.replaceChildren();runtimeRef.current=null;};
  },[model]);

  useEffect(()=>{const runtime=runtimeRef.current;if(!runtime||!model)return;for(const [key,group] of Object.entries(runtime.groups))group.visible=visible[key as keyof typeof visible];runtime.source.visible=sourceVisible;},[visible,sourceVisible,model]);
  useEffect(()=>{const space=model?.spaces.find(item=>item.sourceRoomID===selected);setSelectedStatus(space?.geometry?`${space.geometryStatus} · ${space.areaM2?.toFixed(1)} m² · ${space.verificationLevel}`:'仅有源标签锚点 · 几何未恢复');},[selected,model]);
  useEffect(()=>{const group=runtimeRef.current?.groups.rooms;if(!group)return;group.traverse(object=>{if(!(object instanceof THREE.Mesh)||!object.userData.roomID)return;const material=object.material as THREE.MeshBasicMaterial;const active=object.userData.roomID===selected;material.color.set(active?0xe47d2b:0xf2a64a);material.opacity=active?.82:.42;material.needsUpdate=true;});},[selected,model]);

  const setView=(next:Mode)=>{const r=runtimeRef.current;if(!r)return;if(r.transition)cancelAnimationFrame(r.transition);const token=performance.now();const startPos=r.camera.position.clone(),startUp=r.camera.up.clone(),startZoom=r.camera.zoom;const target=r.controls.target.clone();const explorePos=target.clone().add(new THREE.Vector3(20,118,132));const planPos=target.clone().add(new THREE.Vector3(0,205,0));const endPos=next==='plan'?planPos:explorePos;const endUp=next==='plan'?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0);const endZoom=next==='plan'?1.0:.88;r.controls.enableRotate=next==='explore';r.controls.enabled=false;const animate=()=>{const t=Math.min((performance.now()-token)/600,1);const e=t*t*(3-2*t);r.camera.position.copy(startPos).lerp(endPos,e);r.camera.up.copy(startUp).lerp(endUp,e).normalize();r.camera.zoom=startZoom+(endZoom-startZoom)*e;r.camera.lookAt(target);r.camera.updateProjectionMatrix();if(t<1)r.transition=requestAnimationFrame(animate);else{r.transition=0;r.controls.enabled=true;r.controls.update();}};setMode(next);r.transition=requestAnimationFrame(animate);};
  const fit=()=>{const r=runtimeRef.current;if(!r)return;const target=r.controls.target;const pos=mode==='plan'?target.clone().add(new THREE.Vector3(0,205,0)):target.clone().add(new THREE.Vector3(20,118,132));r.camera.position.copy(pos);r.camera.up.copy(mode==='plan'?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0));r.camera.lookAt(target);r.camera.zoom=mode==='plan'?.92:.82;r.camera.updateProjectionMatrix();r.controls.update();};

  const controls:Record<string,string>={traces:'墙体迹线',wallFaces:'源填充墙面候选',rooms:'房间候选',corridors:'走廊候选',arena:'球场与原始座席',footprint:'外墙开边界证据'};
  return <main className="fixed inset-0 flex flex-col bg-[#f2f0e9] text-[#20322d]">
    <header className="z-10 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-white/95 px-4 py-2 shadow-sm">
      <div className="flex items-center gap-3"><a href="/" className="rounded-full border p-2" aria-label="返回 MAC"><ArrowLeft size={16}/></a><div><div className="flex items-center gap-2 text-sm font-semibold"><ScanLine size={16}/>FF-01 · V8 Source-guided Geometry</div><p className="text-[11px] text-neutral-500">SHA-256 {model?.sourceMetadata.sourcePdfSha256.slice(0,12)??'加载中'}… · 候选模型</p></div></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-950">Unverified Architectural Preview</span><button data-testid="v8-toggle-view" onClick={()=>setView(mode==='plan'?'explore':'plan')} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-medium">{mode==='explore'?<Eye size={14}/>:<Rotate3D size={14}/>} {mode==='explore'?'2D 平面':'2.5D 预览'}</button><button data-testid="v8-fit-map" onClick={fit} className="flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs"><Maximize2 size={14}/> Fit Map</button></div>
    </header>
    <section className="relative min-h-0 flex-1"><div ref={hostRef} data-testid="v8-canvas" className="absolute inset-0"/>{error&&<div className="absolute inset-0 grid place-items-center bg-white text-sm text-red-700">V8 几何数据加载失败：{error}</div>}
      <aside className="absolute left-4 top-4 max-h-[calc(100%-2rem)] w-72 overflow-auto rounded-xl border border-black/10 bg-white/95 p-3 shadow-lg backdrop-blur">
        <h2 className="text-xs font-semibold">Canonical Geometry V8</h2><p className="mt-1 text-[10px] leading-relaxed text-neutral-600">坐标直接使用 FF-01 归一化 PDF Display Points。平面与立体视图共享同一批几何对象。</p>
        <button data-testid="v8-source-toggle" onClick={()=>setSourceVisible(v=>!v)} className="mt-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"><span>Source PDF Overlay</span>{sourceVisible?<Eye size={13}/>:<EyeOff size={13}/>}</button>
        <div className="mt-1 space-y-1">{Object.entries(controls).map(([key,label])=><button key={key} data-testid={`v8-layer-${key}`} onClick={()=>setVisible(v=>({...v,[key]:!v[key as keyof typeof v]}))} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-neutral-100"><span>{label}</span>{visible[key as keyof typeof visible]?<Eye size={13}/>:<EyeOff size={13}/>}</button>)}</div>
        <div className="mt-3 border-t pt-3"><label className="block text-[11px] font-semibold">空间选择</label><select data-testid="v8-room-select" value={selected} onChange={e=>setSelected(e.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 text-xs">{model?.spaces.map(space=><option key={space.spaceID} value={space.sourceRoomID}>{space.sourceRoomID}{space.geometry?' · candidate':' · no polygon'}</option>)}</select><p data-testid="v8-room-status" className="mt-1 text-[10px] font-medium text-amber-900">{selected} · {selectedStatus}</p></div>
        <div className="mt-3 border-t pt-3 text-[10px] leading-relaxed text-neutral-600" data-testid="v8-coverage">{model?`${model.coverage.candidateRoomPolygons} 个房间 Polygon · ${model.wallNetwork.traceObjects.length.toLocaleString()} 条墙迹线 · ${model.wallNetwork.wallFaceCandidates.length.toLocaleString()} 个填充墙面候选 · ${model.circulation.corridors.length} 段走廊候选 · ${model.arena.seatFootprintCandidates.length} 个座席图元`:'读取模型中'}<br/>建筑外轮廓未闭合 · 图纸 Verified 0 · FIELD Verified 0</div>
        <p className="mt-2 rounded bg-amber-50 p-2 text-[10px] leading-relaxed text-amber-950">外边界仍为分段迹线；走廊与新增房间均为源图支持的候选，不代表独立核验。未确认门洞不会进入导航。</p>
      </aside>
      <div className="absolute bottom-4 right-4 rounded-lg bg-white/90 px-3 py-2 text-[10px] text-neutral-600 shadow">左键平移 · 滚轮光标缩放 · 右键旋转（2.5D）· 点击候选房间</div>
    </section>
    <footer className="flex min-h-9 items-center justify-between border-t border-black/10 bg-white px-4 text-[10px] text-neutral-500"><span>V8 独立候选层 · V6/V7 与人工审阅历史保留 · 非生产校园地图</span><a className="underline" href="/dev/geometry-review">打开几何审阅器</a></footer>
  </main>;
}
