import React, {useEffect, useMemo, useRef, useState} from 'react';

type Vector = {id:string; sourcePathID:string|null; layer:string; layerSemantic:string; rectPt:number[]|null; items:any[]};
type ReviewStatus = 'PROPOSED'|'MACHINE_REVIEWED'|'HUMAN_REVIEW_REQUIRED'|'VERIFIED'|'REJECTED'|'CANDIDATE'|'UNRESOLVED';
type Space = {id:string; kind:string; points:number[][]; status:ReviewStatus; sourcePathIds:string[]; note:string; candidateStatus?:string; verificationLevel?:string; iouStatus?:string; iouValue?:number|null; geometryRevision?:number; geometryFingerprint?:string; [key:string]:any};
type PilotCandidate = {roomID:string; candidateID:string; status:ReviewStatus; sourceLabelAnchorPt:number[]; polygonSourcePt:number[][]; sourcePathIDs:string[]; areaM2IllustrativeScale:number; boundaryVectorSupportFraction:number; virtualCloseWidthPt:number; unresolvedEdges:any[]; touchesSearchCropEdge:boolean; issues:string[]; visualEvidence:Record<string,string>};
type Decision = {type:string; sourcePathIds:string[]; points?:number[][]; note:string};
type EdgeReview = {roomID:string;edgeID:string;decision:'ACCEPTED'|'REJECTED'|'NEEDS_REVIEW';sourcePathIds:string[];reviewerIdentity:string;reviewedAt:string;note:string};
type ReviewEdge = {edgeID:string;startPt:number[];endPt:number[];lengthPt:number;classification:string;confidence:string;reviewStatus:string;sourcePathIDs:string[];cadLayers:string[];nearestAnyEvidence:any;priorObjection:string|null};
type CorrectionProposal = {proposalID:string;edgeIDs:string[];oldEndpointsPt:number[][];newEndpointsPt:number[][];sourcePathIDs:string[];cadLayer:string;geometryDeltaMaxPt:number;areaDeltaM2IllustrativeScale:number;reason:string;uncertainty:string;resultPolygonSourcePt:number[][]};
type ReviewPackage = {roomID:string;reviewPackageStatus:string;geometry:{areaM2:number;annotatedAreaM2:number;areaDeviationPercent:number;valid:boolean;seedInside:boolean;independentIoU:string};edges:ReviewEdge[];correctionProposals:CorrectionProposal[];outstandingIssues:string[];verificationRecord:any};
type Doc = {schemaVersion:number; revision:number; spaces:Space[]; decisions:Decision[]; edgeReviews?:EdgeReview[]; verificationRecords?:any[]; updatedAt?:string};
type View = {x:number;y:number;width:number;height:number};

const INITIAL: Doc = {schemaVersion:1,revision:0,spaces:[],decisions:[]};
const endpoint='/api/geometry-review';
const SEMANTICS=['Existing Wall','New Partition','Structural Wall / Column','Architectural Wall','Door','Stair','Arena / Seating','Equipment','Annotation'];
const PILOT_ORDER=['M104','M102','S208','M103','S209','S210'];
const REVIEW_QUEUE=[
  {priority:'P0',label:'Footprint, primary walls, public circulation',semantic:'Existing Wall'},
  {priority:'P1',label:'Room dividers and door openings',semantic:'New Partition'},
  {priority:'P2',label:'Lotus Arena ring, seats and stands',semantic:'Arena / Seating'},
  {priority:'P3',label:'Equipment, fixtures and drawing notes',semantic:'Equipment'},
];

function pathD(items:any[]) {
  let d=''; let current:number[]|null=null;
  for(const [kind,...values] of items||[]) {
    if(kind==='l'&&values.length===2){const [a,b]=values;d+=`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} `;current=b;}
    else if(kind==='c'&&values.length===3){const [a,b,c]=values;if(!current)d+=`M ${a[0]} ${a[1]} `;d+=`C ${a[0]} ${a[1]} ${b[0]} ${b[1]} ${c[0]} ${c[1]} `;current=c;}
    else if(kind==='poly'&&values[0]?.length){const pts=values[0];d+=`M ${pts.map((p:number[])=>`${p[0]} ${p[1]}`).join(' L ')} Z `;current=pts[pts.length-1];}
  }
  return d;
}

export function GeometryReviewEditor() {
  const svgRef=useRef<SVGSVGElement>(null);
  const [layers,setLayers]=useState<any[]>([]); const [semantic,setSemantic]=useState(SEMANTICS[0]); const [layer,setLayer]=useState('');
  const [vectors,setVectors]=useState<Vector[]>([]); const [doc,setDoc]=useState<Doc>(INITIAL); const [saved,setSaved]=useState(0); const [candidates,setCandidates]=useState<PilotCandidate[]>([]);
  const [selectedPaths,setSelectedPaths]=useState<string[]>([]); const [selectedSpace,setSelectedSpace]=useState<string|null>(null);
  const [spaceId,setSpaceId]=useState(''); const [kind,setKind]=useState('room'); const [status,setStatus]=useState<ReviewStatus>('HUMAN_REVIEW_REQUIRED'); const [reviewNote,setReviewNote]=useState(''); const [candidateId,setCandidateId]=useState(''); const [insertEdgeMode,setInsertEdgeMode]=useState(false);
  const [drawing,setDrawing]=useState(false); const [snap,setSnap]=useState(true); const [opacity,setOpacity]=useState(55);
  const [message,setMessage]=useState('加载图纸图层…'); const [view,setView]=useState<View>({x:0,y:0,width:2384,height:1684});
  const [undo,setUndo]=useState<Doc[]>([]); const [redo,setRedo]=useState<Doc[]>([]);
  const [reviewPackage,setReviewPackage]=useState<ReviewPackage|null>(null); const [selectedEdgeID,setSelectedEdgeID]=useState<string|null>(null);
  const [reviewerIdentity,setReviewerIdentity]=useState(''); const [reviewProgress,setReviewProgress]=useState<any>(null);
  const [history,setHistory]=useState<any[]>([]); const [compareRevision,setCompareRevision]=useState<number|null>(null);
  const [snapTolerancePt,setSnapTolerancePt]=useState(2.5);
  const [moveEdgeMode,setMoveEdgeMode]=useState(false);
  const pan=useRef<{x:number;y:number;view:View;moved:boolean}|null>(null);
  const draggingVertex=useRef<{spaceId:string;index:number;before:Doc}|null>(null);
  const draggingEdge=useRef<{spaceId:string;index:number;before:Doc;start:number[];original:number[][]}|null>(null);
  const focusPathAfterLayerLoad=useRef<string|null>(null);
  const splitMode=useRef(false); const [splitPoints,setSplitPoints]=useState<number[][]>([]);
  const layerNames=useMemo(()=>layers.filter((l)=>l.semanticCategory===semantic),[layers,semantic]);

  useEffect(()=>{(async()=>{
    try {
      const [m,o,c,p,h,progress]=await Promise.all([fetch(`${endpoint}/manifest`).then(r=>r.json()),fetch(`${endpoint}/overrides`).then(r=>r.json()),fetch(`${endpoint}/candidates`).then(r=>r.json()),fetch(`${endpoint}/review-packages`).then(r=>r.json()),fetch(`${endpoint}/history`).then(r=>r.json()),fetch(`${endpoint}/progress`).then(r=>r.json())]);
      setLayers(m.layers.map((l:any)=>({name:l.originalLayerName,semanticCategory:l.semanticCategory,pathCount:l.pathCount})));
      setDoc(o);setSaved(o.revision);setCandidates([...(c.pilots||[])].sort((a:any,b:any)=>PILOT_ORDER.indexOf(a.roomID)-PILOT_ORDER.indexOf(b.roomID)));setReviewProgress(progress);setHistory(h);setMessage(`载入 ${m.distinctLayerCount} 个原始图层；${o.spaces.length} 条本地校正；${c.pilots?.length||0} 个 V3 candidates；${p.rooms?.length||0} 个逐边审阅包。`);
    } catch(e) {setMessage(`无法读取本地校正 API：${String(e)}`);}
  })();},[]);
  useEffect(()=>{if(!candidateId){setReviewPackage(null);return;}(async()=>{try{const pkg=await fetch(`${endpoint}/review-packages?room=${encodeURIComponent(candidateId)}`).then(r=>r.json());setReviewPackage(pkg);setSelectedEdgeID(null);}catch(e){setReviewPackage(null);setMessage(`审阅包读取失败：${String(e)}`);}})();},[candidateId]);
  useEffect(()=>{(async()=>{
    try {const params=new URLSearchParams({semantic});if(layer)params.set('layer',layer);const rows=await fetch(`${endpoint}/vectors?${params}`).then(r=>r.json());setVectors(rows);setSelectedPaths(focusPathAfterLayerLoad.current?[focusPathAfterLayerLoad.current]:[]);focusPathAfterLayerLoad.current=null;}
    catch(e){setMessage(`图层读取失败：${String(e)}`);}
  })();},[semantic,layer]);

  const invalidateGeometry=(draft:Doc,ids:string[]):Doc=>({...draft,spaces:draft.spaces.map(space=>ids.includes(space.id)?{...space,status:'HUMAN_REVIEW_REQUIRED' as ReviewStatus,candidateStatus:'REVIEW_READY',verificationLevel:'UNVERIFIED',iouStatus:'NOT_MEASURABLE',iouValue:null,geometryRevision:undefined,geometryFingerprint:undefined}:space),verificationRecords:(draft.verificationRecords||[]).filter((record:any)=>!ids.includes(record.roomID))});
  const remember=(next:Doc)=>{const changed=next.spaces.filter(space=>{const previous=doc.spaces.find(row=>row.id===space.id);return previous&&JSON.stringify(previous.points)!==JSON.stringify(space.points);}).map(space=>space.id);const safe=changed.length?invalidateGeometry(next,changed):next;setUndo((items)=>[...items.slice(-39),doc]);setRedo([]);setDoc(safe);};
  const updateSpace=(id:string,fn:(space:Space)=>Space)=>remember({...doc,spaces:doc.spaces.map(s=>s.id===id?fn(s):s)});
  const svgPoint=(event:{clientX:number;clientY:number})=>{
    const rect=svgRef.current!.getBoundingClientRect();
    return [view.x+(event.clientX-rect.left)/rect.width*view.width,view.y+(event.clientY-rect.top)/rect.height*view.height];
  };
  const snapPoint=(point:number[])=>{
    if(!snap||!svgRef.current)return point;
    const threshold=snapTolerancePt; let nearest=point;let distance=threshold;
    const visit=(candidate:any):void=>{
      if(Array.isArray(candidate)&&candidate.length===2&&candidate.every((n)=>typeof n==='number')){
      const d=Math.hypot(candidate[0]-point[0],candidate[1]-point[1]);if(d<distance){distance=d;nearest=candidate;}
      }else if(Array.isArray(candidate))candidate.forEach(visit);
    };
    for(const vector of vectors)for(const item of vector.items||[]){
      if(item[0]==='l'&&item.length===3){
        const [a,b]=item.slice(1);const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
        const t=den?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/den)):0;
        const projection=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(projection[0]-point[0],projection[1]-point[1]);
        if(d<distance){distance=d;nearest=projection;}
      }else visit(item.slice(1));
    }
    return nearest;
  };
  const handleMapDown=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(event.button!==0)return;
    const target=event.target as Element;
    const reviewEdge=target.closest('[data-edge]') as SVGLineElement|null;
    if(reviewEdge){event.stopPropagation();const edgeID=reviewEdge.dataset.edge!;setSelectedEdgeID(edgeID);
      if(moveEdgeMode&&selectedSpace){const match=edgeID.match(/-E(\d+)$/);const space=doc.spaces.find(row=>row.id===selectedSpace);const index=match?Number(match[1])-1:-1;
        if(space&&index>=0&&index<space.points.length-1){draggingEdge.current={spaceId:selectedSpace,index,before:doc,start:svgPoint(event),original:[space.points[index],space.points[index+1]]};event.currentTarget.setPointerCapture(event.pointerId);return;}}
      return;}
    const vertex=target.closest('[data-vertex]') as SVGCircleElement|null;
    if(vertex){event.stopPropagation();draggingVertex.current={spaceId:vertex.dataset.spaceId!,index:Number(vertex.dataset.vertex),before:doc};event.currentTarget.setPointerCapture(event.pointerId);return;}
    const p=snapPoint(svgPoint(event));
    if(insertEdgeMode&&selectedSpace){
      const selected=doc.spaces.find(s=>s.id===selectedSpace);if(!selected||selected.points.length<3){setMessage('先加载或选择一个候选 Polygon。');return;}
      let best={distance:Infinity,index:-1,point:p};
      selected.points.forEach((a,i)=>{const b=selected.points[(i+1)%selected.points.length];const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;const q=[a[0]+t*dx,a[1]+t*dy];const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<best.distance)best={distance:d,index:i,point:q};});
      const limit=view.width/(svgRef.current?.clientWidth||1)*18;if(best.distance>limit){setMessage('点击位置离候选边过远；请放大后点选边界。');return;}
      const points=[...selected.points];points.splice(best.index+1,0,best.point);remember({...doc,spaces:doc.spaces.map(s=>s.id===selectedSpace?{...s,points,status:'HUMAN_REVIEW_REQUIRED'}:s)});setInsertEdgeMode(false);setMessage(`已在最近边插入顶点；当前 ${selected.id} 仍待人工确认。`);return;
    }
    if(drawing){if(splitMode.current){const next=[...splitPoints,p];setSplitPoints(next);if(next.length===2){remember({...doc,decisions:[...doc.decisions,{type:'split-wall-segment',sourcePathIds:[selectedPaths[0]],points:next,note:'Reviewer marked split points; geometry remains a candidate.'}]});splitMode.current=false;setDrawing(false);setMessage('分割校正已记录，仍需核验墙体语义。');setSplitPoints([]);}}else setDoc(current=>invalidateGeometry({...current,spaces:current.spaces.map(s=>s.id===spaceId?{...s,points:[...s.points,p]}:s)},[spaceId]));return;}
    if((event.target as Element).closest('[data-path],[data-candidate]'))return;
    pan.current={x:event.clientX,y:event.clientY,view:{...view},moved:false};event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleMapMove=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(draggingEdge.current){const {spaceId:id,index,start,original}=draggingEdge.current;const point=svgPoint(event);const delta=[point[0]-start[0],point[1]-start[1]];
      setDoc(current=>invalidateGeometry({...current,spaces:current.spaces.map(space=>{if(space.id!==id)return space;const last=space.points.length-1;const closed=last>2&&Math.hypot(space.points[0][0]-space.points[last][0],space.points[0][1]-space.points[last][1])<.01;return {...space,points:space.points.map((value,i)=>{if(i===index)return [original[0][0]+delta[0],original[0][1]+delta[1]];if(i===index+1)return [original[1][0]+delta[0],original[1][1]+delta[1]];if(closed&&index+1===last&&i===0)return [original[1][0]+delta[0],original[1][1]+delta[1]];if(closed&&index===0&&i===last)return [original[0][0]+delta[0],original[0][1]+delta[1]];return value;}),status:'HUMAN_REVIEW_REQUIRED'};} )},[id]));return;}
    if(draggingVertex.current){const {spaceId:id,index}=draggingVertex.current;const p=snapPoint(svgPoint(event));setDoc((current)=>invalidateGeometry({...current,spaces:current.spaces.map(s=>s.id===id?{...s,points:s.points.map((v,i)=>i===index?p:v)}:s)},[id]));return;}
    if(!pan.current)return;
    const dx=event.clientX-pan.current.x,dy=event.clientY-pan.current.y;pan.current.moved||=Math.hypot(dx,dy)>5;
    const rect=svgRef.current!.getBoundingClientRect();const initial=pan.current.view;
    setView({...initial,x:initial.x-dx/rect.width*initial.width,y:initial.y-dy/rect.height*initial.height});
  };
  const handleMapUp=(event:React.PointerEvent<SVGSVGElement>)=>{
    if(draggingEdge.current){const {before,spaceId:id}=draggingEdge.current;draggingEdge.current=null;setUndo(items=>[...items.slice(-39),before]);setRedo([]);setMessage(`${id} boundary edge moved as an unverified draft; review geometry before saving.`);setMoveEdgeMode(false);try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}return;}
    if(draggingVertex.current){const {spaceId:id,before}=draggingVertex.current;draggingVertex.current=null;setUndo((items)=>[...items.slice(-39),before]);setRedo([]);setSelectedSpace(id);return;}
    if(pan.current&&!pan.current.moved&&drawing&&spaceId){const next=doc.spaces.find(s=>s.id===spaceId)?.points||[];if(next.length>=3){remember({...doc,spaces:doc.spaces.map(s=>s.id===spaceId?{...s,status,sourcePathIds:selectedPaths}:s)});setDrawing(false);setMessage(`${spaceId} 已形成候选边界；保存后仍保持 ${status}。`);}}
    pan.current=null;try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}
  };
  const zoom=(event:WheelEvent)=>{event.preventDefault();const p=svgPoint(event);const factor=event.deltaY<0?.82:1.22;const width=Math.max(100,Math.min(3000,view.width*factor));const height=width*view.height/view.width;const sx=(p[0]-view.x)/view.width,sy=(p[1]-view.y)/view.height;setView({x:p[0]-sx*width,y:p[1]-sy*height,width,height});};
  useEffect(()=>{const svg=svgRef.current;if(!svg)return;const listener=(event:WheelEvent)=>zoom(event);svg.addEventListener('wheel',listener,{passive:false});return()=>svg.removeEventListener('wheel',listener);},[view]);
  const startPolygon=(polygonKind=kind)=>{if(!spaceId.trim()){setMessage('先填写房间或走廊 ID。');return;}const existing=doc.spaces.find(s=>s.id===spaceId);if(!existing)remember({...doc,spaces:[...doc.spaces,{id:spaceId,kind:polygonKind,points:[],status:'HUMAN_REVIEW_REQUIRED',sourcePathIds:selectedPaths,note:reviewNote}]});else setSelectedSpace(spaceId);setDrawing(true);setMessage('点击图纸添加顶点；双击结束，顶点会吸附到最近的 CAD 线段或端点。');};
  const finishPolygon=()=>{const polygon=doc.spaces.find(s=>s.id===spaceId);if(!polygon||polygon.points.length<3){setMessage('至少需要三个顶点才能结束多边形。');return;}if(status==='VERIFIED'){setMessage('此工具不会把绘制动作标记为 VERIFIED；请保留 HUMAN_REVIEW_REQUIRED，独立验证记录必须另行完成。');return;}if(!selectedPaths.length){setMessage('每个几何候选都必须关联至少一条源 CAD 路径。');return;}remember({...doc,spaces:doc.spaces.map(s=>s.id===spaceId?{...s,status,sourcePathIds:selectedPaths,note:reviewNote}:s)});setDrawing(false);setMessage(`${spaceId} 已形成 ${status} 边界。`);};
  const save=async()=>{try{const response=await fetch(`${endpoint}/overrides`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});const result=await response.json();if(!response.ok)throw new Error(result.error);setDoc(result);setSaved(result.revision);const selected=result.spaces.find((space:Space)=>space.id===selectedSpace);const reviews=(result.edgeReviews||[]).filter((edge:EdgeReview)=>edge.roomID===selectedSpace);const unrecorded=reviewPackage?Math.max(0,reviewPackage.edges.length-reviews.length):0;const needsReview=reviews.filter((edge:EdgeReview)=>edge.decision==='NEEDS_REVIEW').length;setMessage(`保存 revision ${result.revision} · ${selected?polygonCheck(selected.points):'无选中 Polygon'} · ${unrecorded} 条边未记录决定，${needsReview} 条标记 Needs Review`);setHistory(await fetch(`${endpoint}/history`).then(r=>r.json()));}catch(e){setMessage(`保存失败：${String(e)}`);}};
  const undoOnce=()=>{if(!undo.length)return;const prior=undo[undo.length-1];setRedo((s)=>[...s,doc]);setUndo((s)=>s.slice(0,-1));setDoc(prior);};
  const redoOnce=()=>{if(!redo.length)return;const next=redo[redo.length-1];setUndo((s)=>[...s,doc]);setRedo((s)=>s.slice(0,-1));setDoc(next);};
  const addDecision=(type:string)=>{if(!selectedPaths.length){setMessage('先选择 CAD 源路径。');return;}if(type==='merge-wall-segments'&&selectedPaths.length<2){setMessage('合并建议至少选择两条墙体路径。');return;}remember({...doc,decisions:[...doc.decisions,{type,sourcePathIds:selectedPaths,note:'Reviewer decision; candidate only until separately verified.'}]});setMessage(`已记录 ${type} 决策候选。`);};
  const togglePath=(id:string,shift:boolean,sourcePathID?:string|null)=>{const key=sourcePathID||id;setSelectedPaths((current)=>shift?(current.includes(key)?current.filter(v=>v!==key):[...current,key]):[key]);};
  const shownPath=selectedSpace?doc.spaces.find(s=>s.id===selectedSpace):undefined;
  const selectedCandidate=candidates.find(c=>c.roomID===candidateId);
  const loadCandidate=(candidate=selectedCandidate)=>{
    if(!candidate)return;
    const space:Space={id:candidate.roomID,kind:'room',points:candidate.polygonSourcePt,status:'HUMAN_REVIEW_REQUIRED',sourcePathIds:candidate.sourcePathIDs,note:`Hybrid V3 seed candidate. Reviewer must verify each listed edge against FF-01; no independent IoU exists.`};
    const existing=doc.spaces.some(s=>s.id===candidate.roomID);
    if(!existing)remember({...doc,spaces:[...doc.spaces,space]});
    setCandidateId(candidate.roomID);setSelectedSpace(candidate.roomID);setSpaceId(candidate.roomID);setKind('room');setStatus('HUMAN_REVIEW_REQUIRED');setReviewNote(space.note);
    setSelectedPaths(candidate.sourcePathIDs);setSemantic('Existing Wall');setLayer('');setDrawing(false);setInsertEdgeMode(false);
    const xs=candidate.polygonSourcePt.map(p=>p[0]),ys=candidate.polygonSourcePt.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    const width=Math.max(Math.max(...xs)-Math.min(...xs)+50,(Math.max(...ys)-Math.min(...ys)+50)*1.65);
    setView({x:cx-width/2,y:cy-width/1.65/2,width,height:width/1.65});
    setMessage(`${candidate.roomID} room-seed candidate loaded. ${candidate.unresolvedEdges.length} boundary objections; status HUMAN_REVIEW_REQUIRED.`);
  };
  const replaceWithCurrentCandidate=(candidate=selectedCandidate)=>{
    if(!candidate)return;
    const space:Space={id:candidate.roomID,kind:'room',points:candidate.polygonSourcePt,status:'HUMAN_REVIEW_REQUIRED',sourcePathIds:candidate.sourcePathIDs,note:'Reset to current Hybrid V3 machine candidate; reviewer must verify every boundary edge.'};
    remember({...doc,spaces:doc.spaces.some(s=>s.id===candidate.roomID)?doc.spaces.map(s=>s.id===candidate.roomID?space:s):[...doc.spaces,space]});
    setSelectedSpace(space.id);setSpaceId(space.id);setStatus(space.status);setReviewNote(space.note);setSelectedPaths(candidate.sourcePathIDs);
    setMessage(`${space.id} updated to current generated candidate; previous draft is undoable and this candidate remains unverified.`);
  };
  const removeVertex=(index:number)=>{
    const current=doc.spaces.find(s=>s.id===selectedSpace);if(!current||current.points.length<=3){setMessage('至少需要保留三个顶点。');return;}
    remember({...doc,spaces:doc.spaces.map(s=>s.id===selectedSpace?{...s,points:s.points.filter((_,i)=>i!==index),status:'HUMAN_REVIEW_REQUIRED'}:s)});
  };
  const removeLastVertex=()=>{const current=doc.spaces.find(s=>s.id===selectedSpace);if(current)removeVertex(current.points.length-1);};
  const focusBoundaryEvidence=(edge:any)=>{
    const [ax,ay]=edge.startPt;const [bx,by]=edge.endPt;const cx=(ax+bx)/2;const cy=(ay+by)/2;
    const width=Math.max(45,Math.max(Math.abs(bx-ax),Math.abs(by-ay))*5);setView({x:cx-width/2,y:cy-width/1.65/2,width,height:width/1.65});
    if(edge.sourcePathID){focusPathAfterLayerLoad.current=edge.sourcePathID;setSelectedPaths([edge.sourcePathID]);if(SEMANTICS.includes(edge.layerSemantic))setSemantic(edge.layerSemantic);setLayer('');}
  };
  const polygonCheck=(raw:number[][])=>{if(raw.length<3)return 'Polygon invalid (fewer than 3 vertices)';if(raw.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n))))return 'Polygon invalid (non-finite coordinate)';const points=raw.length>3&&Math.hypot(raw[0][0]-raw[raw.length-1][0],raw[0][1]-raw[raw.length-1][1])<1e-6?raw.slice(0,-1):raw;let twice=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];twice+=a[0]*b[1]-b[0]*a[1];}
    const orient=(a:number[],b:number[],c:number[])=>Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){if(j===i||j===(i+1)%points.length||i===(j+1)%points.length)continue;const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];if(orient(a,b,c)!==orient(a,b,d)&&orient(c,d,a)!==orient(c,d,b))return 'Polygon invalid (self-intersection)';}
    return Math.abs(twice)>1e-4?'Polygon valid (nonzero area; no crossing edges detected)':'Polygon invalid (zero area)';};
  const recordEdgeReview=(decision:EdgeReview['decision'])=>{
    const edge=reviewPackage?.edges.find(item=>item.edgeID===selectedEdgeID);if(!edge||!candidateId){setMessage('先选择一个边界边。');return;}
    if(!reviewerIdentity.trim()){setMessage('填写审阅者姓名后才能记录边界审阅；这不会验证整个房间。');return;}
    const record:EdgeReview={roomID:candidateId,edgeID:edge.edgeID,decision,sourcePathIds:edge.sourcePathIDs,reviewerIdentity:reviewerIdentity.trim(),reviewedAt:new Date().toISOString(),note:edge.priorObjection||edge.confidence};
    remember({...doc,edgeReviews:[...(doc.edgeReviews||[]).filter(item=>!(item.roomID===record.roomID&&item.edgeID===record.edgeID)),record]});
    setMessage(`${edge.edgeID} 已记录 ${decision} · 仅为逐边审阅记录，不会验证房间。`);
  };
  const applyCorrection=(proposal:CorrectionProposal)=>{
    if(!candidateId)return;const current=doc.spaces.find(space=>space.id===candidateId);
    const next:Space={id:candidateId,kind:'room',points:proposal.resultPolygonSourcePt,status:'HUMAN_REVIEW_REQUIRED',
      sourcePathIds:Array.from(new Set([...(current?.sourcePathIds||[]),...proposal.sourcePathIDs])),
      note:`New evidence-guided candidate ${proposal.proposalID}; original geometry retained in prior revision/history; not verified.`};
    remember({...doc,spaces:current?doc.spaces.map(space=>space.id===candidateId?next:space):[...doc.spaces,next]});
    setSelectedSpace(candidateId);setSpaceId(candidateId);setStatus('HUMAN_REVIEW_REQUIRED');setReviewNote(next.note);
    setMessage(`${proposal.proposalID} applied as an unverified draft; save creates a new revision and keeps previous history.`);
  };
  const compareSpace=history.find(revision=>revision.revision===compareRevision)?.spaces?.find((space:any)=>space.id===selectedSpace);
  const handleRadius=view.width/(svgRef.current?.clientWidth||1180)*4.5;
  const labelSize=view.width/(svgRef.current?.clientWidth||1180)*12;

  return <main className="fixed inset-0 z-[100] flex bg-[#f4f2ec] text-neutral-900">
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-neutral-300 bg-white px-5 py-3">
        <div><h1 className="text-base font-semibold">FF-01 Geometry Review</h1><p className="text-xs text-neutral-500">原始页面坐标 · 270° PDF rotation 已归一化 · 候选几何默认未验证</p></div>
        <div className="flex gap-2"><button onClick={undoOnce} disabled={!undo.length} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">Undo</button><button onClick={redoOnce} disabled={!redo.length} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">Redo</button><button onClick={save} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Save revision</button></div>
      </header>
      <div className="flex items-center gap-3 border-b border-neutral-300 bg-white px-5 py-2 text-xs">
        <label>CAD layer type <select value={semantic} onChange={e=>{setSemantic(e.target.value);setLayer('');}} className="ml-2 rounded border p-1">{SEMANTICS.map(v=><option key={v}>{v}</option>)}</select></label>
        <label>Layer <select value={layer} onChange={e=>setLayer(e.target.value)} className="ml-2 max-w-64 rounded border p-1"><option value="">All {semantic} layers</option>{layerNames.map((v:any)=><option key={v.name} value={v.name}>{v.name} ({v.pathCount})</option>)}</select></label>
        <label className="ml-auto flex items-center gap-1">Overlay <input type="range" min="0" max="100" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/>{opacity}%</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> Snap</label>
        <label className="flex items-center gap-1">tolerance <input aria-label="Snap tolerance in points" type="number" min="0.25" max="8" step="0.25" value={snapTolerancePt} onChange={e=>setSnapTolerancePt(Math.max(.25,Math.min(8,Number(e.target.value)||.25)))} className="w-14 rounded border px-1 py-0.5"/> pt</label>
        <label className="flex items-center gap-1">Compare <select value={compareRevision??''} onChange={e=>setCompareRevision(e.target.value?Number(e.target.value):null)} className="max-w-20 rounded border p-1"><option value="">off</option>{history.map((rev:any)=><option key={rev.revision} value={rev.revision}>r{rev.revision}</option>)}</select></label>
        <button onClick={()=>setView({x:0,y:0,width:2384,height:1684})} className="rounded border px-2 py-1">Fit plan</button>
      </div>
      <div className="min-h-0 flex-1 p-3">
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} onPointerDown={handleMapDown} onPointerMove={handleMapMove} onPointerUp={handleMapUp} onContextMenu={e=>{const vertex=(e.target as Element).closest('[data-vertex]') as SVGCircleElement|null;if(vertex){e.preventDefault();e.stopPropagation();removeVertex(Number(vertex.dataset.vertex));}else e.preventDefault();}} onDoubleClick={()=>drawing&&spaceId&&setDrawing(false)} className="h-full w-full touch-none overscroll-none cursor-crosshair border border-neutral-300 bg-white" aria-label="FF-01 source geometry review canvas">
          <image href="/ff01-source-plan.png" x="0" y="0" width="2384" height="1684" opacity="0.84"/>
          <g opacity={opacity/100}>{vectors.map(v=>{const selected=selectedPaths.includes(v.id)||selectedPaths.includes(v.sourcePathID||'');return <path key={v.id} data-path="true" d={pathD(v.items)} fill="none" stroke={selected?'#0088a6':'#c54b36'} strokeWidth={selected?2.5:1.1} vectorEffect="non-scaling-stroke" onClick={e=>{e.stopPropagation();togglePath(v.id,e.shiftKey,v.sourcePathID);}}/>;})}</g>
          {candidates.map(candidate=><g key={candidate.candidateID} data-candidate="true" onClick={()=>loadCandidate(candidate)}><polygon points={candidate.polygonSourcePt.map(p=>p.join(',')).join(' ')} fill={candidate.roomID===candidateId?'#14a87940':'#ef9c2830'} stroke={candidate.roomID===candidateId?'#05784f':'#b56409'} strokeWidth={candidate.roomID===candidateId?3:1.5} strokeDasharray="7 5" vectorEffect="non-scaling-stroke"/><text x={candidate.sourceLabelAnchorPt?.[0]??candidate.polygonSourcePt[0]?.[0]??0} y={candidate.sourceLabelAnchorPt?.[1]??candidate.polygonSourcePt[0]?.[1]??0} fontSize={labelSize} fill="#593b10" stroke="white" strokeWidth="3" paintOrder="stroke" vectorEffect="non-scaling-stroke">{candidate.roomID} · REVIEW</text></g>)}
          {compareSpace&&<polygon points={compareSpace.points.map((p:number[])=>p.join(',')).join(' ')} fill="none" stroke="#7638b5" strokeWidth="3" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
          {reviewPackage?.edges.map(edge=><line key={edge.edgeID} data-edge={edge.edgeID} x1={edge.startPt[0]} y1={edge.startPt[1]} x2={edge.endPt[0]} y2={edge.endPt[1]} stroke={selectedEdgeID===edge.edgeID?'#111827':edge.classification==='WALL_ALIGNED_CANDIDATE'?'#18895a':edge.classification==='DOOR_OR_GLAZING'?'#237ac1':edge.classification==='CANDIDATE_WALL'?'#d18b16':'#dc3b34'} strokeWidth={selectedEdgeID===edge.edgeID?5:3} vectorEffect="non-scaling-stroke" style={{cursor:'pointer'}} onClick={e=>{e.stopPropagation();setSelectedEdgeID(edge.edgeID);focusBoundaryEvidence({startPt:edge.startPt,endPt:edge.endPt,sourcePathID:edge.nearestAnyEvidence?.sourcePathID,layerSemantic:edge.nearestAnyEvidence?.semantic});}}/>)}
          {doc.spaces.map(space=><g key={space.id} onClick={()=>{setSelectedSpace(space.id);setSpaceId(space.id);setStatus(space.status);}}><polygon data-room-polygon="true" data-space-id={space.id} points={space.points.map(p=>p.join(',')).join(' ')} fill={space.status==='VERIFIED'?'#56a97842':'#e7a63833'} stroke={space.status==='VERIFIED'?'#18734c':'#bd7621'} strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/><text x={space.points[0]?.[0]||0} y={space.points[0]?.[1]||0} fontSize={labelSize} fill="#172b27" vectorEffect="non-scaling-stroke" pointerEvents="none">{space.id} · {space.status}</text>{space.points.map((p,i)=><circle key={i} data-vertex={i} data-space-id={space.id} cx={p[0]} cy={p[1]} r={handleRadius} fill="#fff" stroke="#167965" strokeWidth="2" vectorEffect="non-scaling-stroke"/> )}</g>)}
          {splitPoints.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#ea5b3d"/>)}
          {drawing&&doc.spaces.find(s=>s.id===spaceId)?.points.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r="5" fill="#0787a0"/>)}
        </svg>
      </div>
      <footer className="border-t border-neutral-300 bg-white px-5 py-2 text-xs text-neutral-600">{message} · 当前 revision {saved}</footer>
    </section>
    <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-neutral-300 bg-white p-4">
      <h2 className="font-semibold">Boundary Verification</h2><p className="mt-1 text-xs text-neutral-500">边界证据来自 FF-01 原图层，仅供审阅；自动包不会确认几何。</p>
      {reviewProgress&&<div className="mt-2 grid grid-cols-2 gap-1 rounded border bg-neutral-50 p-2 text-[10px]" aria-label="Review progress"><span>Source labels {reviewProgress.sourceLabels}</span><span>Base codes {reviewProgress.sourceBaseRoomCodes}</span><span>Candidates {reviewProgress.candidates}</span><span>Machine checks {reviewProgress.machineChecked}</span><span>Packets ready {reviewProgress.reviewReady}</span><span>Verified rooms {reviewProgress.verified}</span><span>Rejected {reviewProgress.rejected}</span><span>Unresolved codes {reviewProgress.unresolved}</span></div>}
      <div className="mt-3 flex gap-2"><select value={candidateId} onChange={e=>{const room=e.target.value;const candidate=candidates.find(row=>row.roomID===room);if(candidate)loadCandidate(candidate);else setCandidateId('');}} className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs"><option value="">Select pilot room…</option>{candidates.map(c=><option key={c.roomID} value={c.roomID}>{c.roomID} · {c.areaM2IllustrativeScale.toFixed(1)} m² · REVIEW</option>)}</select><button onClick={()=>loadCandidate()} disabled={!selectedCandidate} className="rounded bg-teal-800 px-2 py-1.5 text-xs text-white disabled:opacity-40">Focus</button></div>
      {selectedCandidate&&doc.spaces.some(s=>s.id===selectedCandidate.roomID)&&<button onClick={()=>replaceWithCurrentCandidate()} className="mt-1 w-full rounded border border-amber-300 px-2 py-1 text-[10px] text-amber-900 hover:bg-amber-50">Replace local draft with current machine candidate · Undoable</button>}
      {selectedCandidate&&reviewPackage&&<section className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-[10px] leading-relaxed"><div className="font-semibold">{selectedCandidate.roomID} · {reviewPackage.reviewPackageStatus} · room remains HUMAN_REVIEW_REQUIRED</div><div>Area {reviewPackage.geometry.areaM2.toFixed(2)} m² vs annotation {reviewPackage.geometry.annotatedAreaM2.toFixed(2)} m² ({reviewPackage.geometry.areaDeviationPercent>0?'+':''}{reviewPackage.geometry.areaDeviationPercent.toFixed(1)}%). Area is diagnostic only.</div><div>{reviewPackage.edges.length} complete edges · {reviewPackage.edges.filter(e=>e.classification==='WALL_ALIGNED_CANDIDATE').length} wall-aligned candidates · IoU {reviewPackage.geometry.independentIoU}</div><a className="mt-1 inline-block underline" href={`/ff01-pilot-v4/${candidateId}/candidate-edge-overlay.png`} target="_blank">Open numbered edge overlay</a><div className="mt-1 max-h-40 space-y-1 overflow-auto">{reviewPackage.edges.map(edge=>{const review=(doc.edgeReviews||[]).find(item=>item.roomID===candidateId&&item.edgeID===edge.edgeID);return <button key={edge.edgeID} onClick={()=>{setSelectedEdgeID(edge.edgeID);focusBoundaryEvidence({startPt:edge.startPt,endPt:edge.endPt,sourcePathID:edge.nearestAnyEvidence?.sourcePathID,layerSemantic:edge.nearestAnyEvidence?.semantic});}} className={`block w-full rounded border p-1.5 text-left ${selectedEdgeID===edge.edgeID?'border-neutral-800 bg-white':'border-amber-200 bg-white hover:bg-amber-100'}`}><span className="font-mono">{edge.edgeID} · {edge.classification} · {review?.decision||'NOT_REVIEWED'}</span><span className="block">{edge.nearestAnyEvidence?.sourcePathID||'no source P-ID'} · {edge.nearestAnyEvidence?.layer||'unsupported'} · {edge.nearestAnyEvidence?.distancePt??'—'} pt</span><span className="block text-neutral-500">{edge.priorObjection||edge.confidence}</span></button>;})}</div>
        {selectedEdgeID&&<div className="mt-2 rounded border border-neutral-300 bg-white p-2"><strong>{selectedEdgeID} evidence</strong>{(()=>{const edge=reviewPackage.edges.find(item=>item.edgeID===selectedEdgeID);return edge?<div className="mt-1">P-ID: {edge.nearestAnyEvidence?.sourcePathID||'none'}<br/>Layer: {edge.nearestAnyEvidence?.layer||'none'}<br/>Boundary: {edge.classification}<br/>Confidence: {edge.confidence}<br/>Source IDs: {edge.sourcePathIDs.join(', ')||'none'}<br/>Open issue: {edge.priorObjection||'no prior objection recorded'}</div>:null})()}<button onClick={()=>{setMoveEdgeMode(value=>!value);setMessage(moveEdgeMode?'Edge move cancelled.':'Drag the selected edge on the map to translate both endpoints.');}} className={`mt-2 w-full rounded border px-1 py-1 ${moveEdgeMode?'bg-amber-100':''}`}>{moveEdgeMode?'Cancel edge move':'Move selected edge'}</button><div className="mt-2 grid grid-cols-2 gap-1"><button onClick={()=>recordEdgeReview('ACCEPTED')} className="rounded border px-1 py-1">Accept edge</button><button onClick={()=>recordEdgeReview('REJECTED')} className="rounded border px-1 py-1">Reject edge</button><button onClick={()=>recordEdgeReview('NEEDS_REVIEW')} className="col-span-2 rounded border px-1 py-1">Needs review</button></div></div>}
        <label className="mt-2 block">Reviewer identity<input value={reviewerIdentity} onChange={e=>setReviewerIdentity(e.target.value)} placeholder="Required for edge review" className="mt-1 w-full rounded border px-2 py-1"/></label>
        <details className="mt-2"><summary className="cursor-pointer font-semibold">Evidence-guided correction proposals ({reviewPackage.correctionProposals.length}, max 3)</summary>{reviewPackage.correctionProposals.map(proposal=><div key={proposal.proposalID} className="mt-2 rounded border bg-white p-2"><strong>{proposal.proposalID}</strong><div>Edge {proposal.edgeIDs.join(', ')} → {proposal.sourcePathIDs.join(', ')} · {proposal.cadLayer}</div><div>Shift ≤ {proposal.geometryDeltaMaxPt} pt · area Δ {proposal.areaDeltaM2IllustrativeScale>0?'+':''}{proposal.areaDeltaM2IllustrativeScale} m²</div><div className="text-amber-900">{proposal.uncertainty}</div><button onClick={()=>applyCorrection(proposal)} className="mt-1 rounded border px-2 py-1">Apply as new draft</button></div>)}{!reviewPackage.correctionProposals.length&&<p className="mt-1">No conservative structural snap proposal; no geometry was changed.</p>}</details>
        <p className="mt-2">{reviewPackage.outstandingIssues.join(' · ')}</p></section>}
      <p className="mt-2 text-xs text-neutral-500">当前视图源路径 {vectors.length} 条；选中 {selectedPaths.length} 条。CAD layer 和种子标签只提供证据，不自动确认房间语义。</p>
      <div className="mt-3 space-y-1.5">{REVIEW_QUEUE.map(item=>{const count=layers.filter(l=>l.semanticCategory===item.semantic).reduce((sum,l)=>sum+l.pathCount,0);return <button key={item.priority} onClick={()=>{setSemantic(item.semantic);setLayer('');}} className="flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left hover:bg-neutral-50"><span className="w-8 rounded bg-amber-100 px-1 py-0.5 text-center font-mono text-[10px] font-semibold text-amber-900">{item.priority}</span><span className="min-w-0 flex-1 text-[11px]">{item.label}</span><span className="font-mono text-[10px] text-neutral-500">{count}</span></button>;})}</div>
      <div className="mt-4 space-y-2"><label className="block text-xs">Room / corridor ID<input value={spaceId} onChange={e=>setSpaceId(e.target.value)} placeholder="M103 / corridor-west" className="mt-1 w-full rounded border px-2 py-1.5 text-sm"/></label>
        <div className="flex gap-2"><select value={kind} onChange={e=>setKind(e.target.value)} className="w-1/2 rounded border p-1.5 text-sm"><option value="room">Room</option><option value="corridor">Corridor</option><option value="arena">Arena region</option><option value="wall">Wall geometry</option></select><select value={status} onChange={e=>setStatus(e.target.value as ReviewStatus)} className="w-1/2 rounded border p-1.5 text-sm"><option>PROPOSED</option><option>MACHINE_REVIEWED</option><option>HUMAN_REVIEW_REQUIRED</option><option>REJECTED</option></select></div>
        <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={2} placeholder="审核依据、核对的墙线/轴网尺寸…" className="w-full rounded border px-2 py-1.5 text-xs"/>
        <button onClick={()=>startPolygon()} className="w-full rounded bg-teal-800 px-3 py-2 text-sm text-white">{drawing?'Continue polygon':'Draw / correct polygon'}</button><button disabled={!drawing} onClick={finishPolygon} className="w-full rounded border px-3 py-1.5 text-sm disabled:opacity-40">Close polygon</button>
        <div className="grid grid-cols-2 gap-2"><button onClick={()=>setInsertEdgeMode(true)} disabled={!shownPath} className="rounded border px-2 py-1.5 text-xs disabled:opacity-40">Split nearest edge</button><button onClick={removeLastVertex} disabled={!shownPath||shownPath.points.length<=3} className="rounded border px-2 py-1.5 text-xs disabled:opacity-40">Join / remove last vertex</button></div>
        <div className="grid grid-cols-2 gap-2"><button onClick={()=>addDecision('door-opening-candidate')} className="rounded border px-2 py-1.5 text-xs">Mark door candidate</button><button onClick={()=>addDecision('merge-wall-segments')} className="rounded border px-2 py-1.5 text-xs">Propose wall merge</button><button onClick={()=>{if(selectedPaths.length!==1){setMessage('Split requires exactly one selected source path.');return;}splitMode.current=true;setSplitPoints([]);setDrawing(true);setMessage('在地图上依次点击分割起点和终点。');}} className="rounded border px-2 py-1.5 text-xs">Propose wall split</button><button onClick={()=>{setKind('corridor');startPolygon('corridor');}} className="rounded border px-2 py-1.5 text-xs">Draw corridor boundary</button></div>
      </div>
      <h3 className="mt-5 text-sm font-semibold">当前图层源路径</h3><div className="mt-2 max-h-48 overflow-auto rounded border text-xs">{vectors.slice(0,1200).map(v=><button key={v.id} onClick={e=>togglePath(v.id,e.shiftKey,v.sourcePathID)} className={`block w-full border-b px-2 py-1 text-left font-mono ${selectedPaths.includes(v.id)||selectedPaths.includes(v.sourcePathID||'')?'bg-cyan-100':'hover:bg-neutral-50'}`} title={v.layer}>{v.id} · {v.sourcePathID||'no P-ID'} · {v.layer}</button>)}</div><p className="mt-1 text-[10px] text-neutral-400">列表最多展示前 1,200 条；画布路径可直接点选。</p>
      <h3 className="mt-5 text-sm font-semibold">Local reviewed polygons</h3><div className="mt-2 space-y-1">{doc.spaces.map(space=><button key={space.id} onClick={()=>{setSelectedSpace(space.id);setSpaceId(space.id);setStatus(space.status);}} className="flex w-full justify-between rounded border p-2 text-left text-xs"><span>{space.id} · {space.kind}</span><span>{space.status}</span></button>)}</div>
      <p className="mt-4 rounded bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-900">边级决策写入版本化 JSON，并要求姓名、时间与 Source P-ID。Accept Edge 仅接受该条证据，不等于确认房间。VERIFIED 需要独立审核记录，此界面不会自动生成。</p>
    </aside>
  </main>;
}
