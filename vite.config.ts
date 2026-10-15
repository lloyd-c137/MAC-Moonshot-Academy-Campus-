import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function isSimplePolygon(points: unknown): boolean {
  if (!Array.isArray(points) || points.length < 3 || !points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return false;
  const cross = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const intersects = (a: number[], b: number[], c: number[], d: number[]) => {
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    return ((ab1>0&&ab2<0)||(ab1<0&&ab2>0))&&((cd1>0&&cd2<0)||(cd1<0&&cd2>0));
  };
  let area=0;
  for(let i=0;i<points.length;i++){
    const a=points[i] as number[],b=points[(i+1)%points.length] as number[];area+=a[0]*b[1]-b[0]*a[1];
    for(let j=i+1;j<points.length;j++){
      if(j===i||j===(i+1)%points.length||i===(j+1)%points.length)continue;
      if(intersects(a,b,points[j] as number[],points[(j+1)%points.length] as number[]))return false;
    }
  }
  return Math.abs(area)>1e-4;
}

function geometryReviewApi(): Plugin {
  const root = process.cwd();
  const reviewStore = process.env.MAC_GEOMETRY_REVIEW_DIR ? path.resolve(process.env.MAC_GEOMETRY_REVIEW_DIR) : path.join(root, 'data/geometry-review');
  const overridesFile = path.join(reviewStore, 'overrides.json');
  const candidateFile = path.join(root, 'data/source/pilots/v3/PILOT_HYBRID_RECONSTRUCTION.json');
  const reviewPackagesFile = path.join(root, 'data/source/pilots/v4/review-packages/index.json');
  let cadDrawings: any[] | undefined;
  let sourcePathIDs: Set<string> | undefined;
  const loadDrawings = async (): Promise<any[]> => {
    const drawings: any[] = cadDrawings ?? JSON.parse(gunzipSync(await fs.readFile(path.join(root, 'data/source/ff01-vectors.json.gz'))).toString('utf8')).cadDrawings;
    cadDrawings = drawings;
    sourcePathIDs ??= new Set(drawings.flatMap((row: any) => [row.id, row.sourcePathID].filter(Boolean)));
    return drawings;
  };
  const readOverrides = async () => {
    try { return JSON.parse(await fs.readFile(overridesFile, 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') return {schemaVersion: 1, revision: 0, spaces: [], decisions: []}; throw error; }
  };
  return {
    name: 'geometry-review-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/geometry-review/')) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const remote = request.socket.remoteAddress || '';
          const isLoopback = remote === '::1' || remote === '127.0.0.1' || remote.startsWith('::ffff:127.');
          const origin = request.headers.origin;
          if (!isLoopback || (origin && new URL(origin).host !== request.headers.host)) {
            response.statusCode = 403; response.end(JSON.stringify({error: 'Geometry review API is restricted to the local development browser'})); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/manifest')) {
            response.end(await fs.readFile(path.join(root, 'data/source/FF01_LAYER_MANIFEST.json'), 'utf8')); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/candidates')) {
            response.end(await fs.readFile(candidateFile, 'utf8')); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/review-packages')) {
            const index = JSON.parse(await fs.readFile(reviewPackagesFile, 'utf8'));
            const room = url.searchParams.get('room');
            if (!room) { response.end(JSON.stringify(index)); return; }
            const found = index.rooms.find((entry: any) => entry.roomID === room);
            if (!found) { response.statusCode = 404; response.end(JSON.stringify({error: 'Unknown pilot room'})); return; }
            response.end(JSON.stringify(found)); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/history')) {
            const dir = path.join(reviewStore, 'history');
            let files: string[] = [];
            try { files = (await fs.readdir(dir)).filter((name) => /^rev-\d+\.json$/.test(name)).sort(); } catch {}
            const history = await Promise.all(files.map(async (name) => {
              const data = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'));
              return {revision: data.revision, updatedAt: data.updatedAt, spaces: (data.spaces || []).map((space: any) => ({id: space.id, status: space.status, points: space.points}))};
            }));
            response.end(JSON.stringify(history)); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/progress')) {
            const [manifestText, packagesText, overrides] = await Promise.all([
              fs.readFile(path.join(root, 'data/source/ROOM_MANIFEST.csv'), 'utf8'),
              fs.readFile(reviewPackagesFile, 'utf8'), readOverrides(),
            ]);
            const lines = manifestText.trim().split(/\r?\n/).slice(1);
            const labels = lines.map((line) => line.split(',')[0].replace(/^\ufeff/, '').replace(/^"|"$/g, '')).filter(Boolean);
            const bases = new Set(lines.map((line) => line.split(',')[1]?.replace(/^"|"$/g, '')).filter(Boolean));
            const packages = JSON.parse(packagesText);
            const verified = (overrides.spaces || []).filter((space: any) => ['DRAWING_VERIFIED', 'FIELD_VERIFIED'].includes(space.verificationLevel)).length;
            const rejected = (overrides.spaces || []).filter((space: any) => space.candidateStatus === 'REJECTED' || space.status === 'REJECTED').length;
            response.end(JSON.stringify({sourceLabels: labels.length, sourceBaseRoomCodes: bases.size,
              candidates: packages.rooms.length, machineChecked: packages.rooms.filter((room: any) => room.geometry.valid).length,
              reviewReady: packages.rooms.filter((room: any) => room.reviewPackageStatus === 'REVIEW_READY').length,
              verified, rejected, unresolved: Math.max(0, bases.size - verified - rejected),
              pilot: packages.rooms.map((room: any) => { const space = overrides.spaces.find((item: any) => item.id === room.roomID); return {roomID: room.roomID, candidateStatus: space?.candidateStatus || 'REVIEW_READY', verificationLevel: space?.verificationLevel || 'UNVERIFIED', iouStatus: space?.iouStatus || 'NOT_MEASURABLE', iouValue: space?.iouValue ?? null}; })})); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/canonical-export')) {
            const overrides = await readOverrides();
            const extraction = JSON.parse(await fs.readFile(path.join(root, 'data/source/spatial-extraction-summary.json'), 'utf8'));
            const coordinateSystem = extraction.coordinateSystem;
            const metresPerPdfPoint = 25.4 * 300 / 72 / 1000;
            const rooms = (overrides.spaces || []).filter((space: any) => ['DRAWING_VERIFIED', 'FIELD_VERIFIED'].includes(space.verificationLevel));
            response.end(JSON.stringify({status: rooms.length ? 'READY' : 'NO_DRAWING_VERIFIED_GEOMETRY', count: rooms.length,
              coordinateTransform: {source: 'FF01 normalized PDF display coordinates, points, top-left origin, page rotation normalized', target: 'World X/Z meters; Y elevation', worldX: coordinateSystem.transform.worldXmeters, worldZ: coordinateSystem.transform.worldZmeters, originPdfPt: [coordinateSystem.gridFrame.minXPt, coordinateSystem.gridFrame.minYPt], metresPerPdfPoint},
              spaces: rooms.map((space: any) => ({spaceID: space.id, polygonPdfDisplayPt: space.points, areaM2: Math.abs(space.points.reduce((sum: number, p: number[], i: number) => { const n = space.points[(i + 1) % space.points.length]; return sum + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2 * metresPerPdfPoint ** 2, geometryRevision: space.geometryRevision, verificationLevel: space.verificationLevel, sourcePathIds: space.sourcePathIds, reviewProvenance: (overrides.verificationRecords || []).find((record: any) => record.roomID === space.id)}))})); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/vectors')) {
            const drawings = await loadDrawings();
            const semantic = url.searchParams.get('semantic');
            const layer = url.searchParams.get('layer');
            const rows = drawings.filter((row) => (!semantic || row.layerSemantic === semantic) && (!layer || row.layer === layer));
            response.end(JSON.stringify(rows)); return;
          }
          if (request.method === 'GET' && url.pathname.endsWith('/overrides')) { response.end(JSON.stringify(await readOverrides())); return; }
          if (request.method === 'PUT' && url.pathname.endsWith('/overrides')) {
            let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 8_000_000) throw new Error('Payload too large'); }
            const input = JSON.parse(raw);
            if (input.schemaVersion !== 1 || !Array.isArray(input.spaces) || !Array.isArray(input.decisions) ||
                (input.edgeReviews !== undefined && !Array.isArray(input.edgeReviews)) ||
                (input.verificationRecords !== undefined && !Array.isArray(input.verificationRecords))) throw new Error('Invalid override document');
            const ids = new Set<string>();
            const knownIDs = await loadDrawings();
            const reviewIndex = JSON.parse(await fs.readFile(reviewPackagesFile, 'utf8'));
            for (const row of knownIDs) { if (!row.id || !row.layer) throw new Error('Source drawing cache lacks stable IDs or layer metadata'); }
            const validPathIDs = sourcePathIDs!;
            for (const space of input.spaces) {
              if (typeof space.id !== 'string' || !space.id.trim() || !Array.isArray(space.points) || space.points.length < 3 ||
                  !space.points.every((point: unknown) => Array.isArray(point) && point.length === 2 && point.every((n) => Number.isFinite(n)))) {
                throw new Error(`Invalid polygon for ${space.id || 'unnamed space'}`);
              }
              if (ids.has(space.id)) throw new Error(`Duplicate space ID ${space.id}`);
              ids.add(space.id);
              if (!['room', 'corridor', 'arena', 'wall'].includes(space.kind) || !['PROPOSED', 'MACHINE_REVIEWED', 'HUMAN_REVIEW_REQUIRED', 'VERIFIED', 'REJECTED', 'CANDIDATE', 'UNRESOLVED'].includes(space.status) ||
                  !Array.isArray(space.sourcePathIds) || !space.sourcePathIds.length || !space.sourcePathIds.every((id: unknown) => typeof id === 'string' && validPathIDs.has(id))) throw new Error(`Invalid review metadata or unknown/missing source path for ${space.id}`);
              if (!['PROPOSED', 'MACHINE_CHECKED', 'REVIEW_READY', 'REJECTED'].includes(space.candidateStatus || 'REVIEW_READY') ||
                  !['UNVERIFIED', 'DRAWING_VERIFIED', 'FIELD_VERIFIED'].includes(space.verificationLevel || 'UNVERIFIED') ||
                  !['MEASURED', 'NOT_MEASURABLE'].includes(space.iouStatus || 'NOT_MEASURABLE') ||
                  ((space.iouStatus === 'MEASURED') !== Number.isFinite(space.iouValue)) ||
                  (space.iouStatus === 'MEASURED' && (space.iouValue < 0 || space.iouValue > 1))) throw new Error(`Invalid V5 verification state for ${space.id}`);
              if (['DRAWING_VERIFIED', 'FIELD_VERIFIED'].includes(space.verificationLevel)) {
                const record = (input.verificationRecords || []).find((item: any) => item.roomID === space.id && item.geometryRevision === input.revision + 1);
                const expectedEdges = reviewIndex.rooms.find((item: any) => item.roomID === space.id)?.edges.map((edge: any) => edge.edgeID) || [];
                const reviewedEdges = Array.isArray(record?.reviewedEdges) ? [...record.reviewedEdges].sort() : [];
                if (!record || typeof record.reviewerIdentity !== 'string' || !record.reviewerIdentity.trim() ||
                    typeof record.reviewTime !== 'string' || !record.reviewTime || !Array.isArray(record.reviewedEdges) ||
                    record.geometryFingerprint !== JSON.stringify(space.points) || space.geometryFingerprint !== JSON.stringify(space.points) ||
                    expectedEdges.length === 0 || JSON.stringify(reviewedEdges) !== JSON.stringify([...expectedEdges].sort()) || space.candidateStatus !== 'REVIEW_READY' ||
                    record.verificationMethod !== 'independent-human-source-review' || record.identityAssertion !== 'LOCAL_SELF_DECLARED_NOT_AUTHENTICATED' ||
                    record.sourceReference !== 'FF01_SOURCE_PDF' || !Array.isArray(record.evidenceReferences) || record.evidenceReferences.length === 0 ||
                    !Array.isArray(record.outstandingIssues) || record.outstandingIssues.length > 0 || record.result !== 'PASS' || typeof record.reviewerStatement !== 'string' || !record.reviewerStatement.trim() || !isSimplePolygon(space.points) ||
                    !space.sourcePathIds.length || typeof space.note !== 'string' || !space.note.trim() ||
                    (space.iouStatus === 'MEASURED' && (!Number.isFinite(space.iouValue) || space.iouValue < 0 || space.iouValue > 1 || typeof record.referenceGeometryRef !== 'string' || !record.referenceGeometryRef.trim()))) {
                  throw new Error(`Drawing verification for ${space.id} requires explicit reviewer submission, every packaged edge, source evidence, no unresolved issues and a matching verification record; measured IoU additionally requires an independent reference`);
                }
                const roomReviews = (input.edgeReviews || []).filter((item: any) => item.roomID === space.id);
                if (expectedEdges.some((edgeID: string) => !roomReviews.some((item: any) => item.edgeID === edgeID && item.decision === 'ACCEPT' && item.geometryRevision === input.revision + 1 && item.geometryFingerprint === JSON.stringify(space.points)))) throw new Error(`Drawing verification for ${space.id} requires every edge to be explicitly ACCEPTED on this exact geometry revision`);
                if (space.verificationLevel === 'FIELD_VERIFIED' && (!record.fieldEvidenceRef || space.verificationLevel !== 'FIELD_VERIFIED')) throw new Error(`Field verification for ${space.id} requires field evidence`);
              }
            }
            for (const decision of input.decisions) {
              if (!decision || typeof decision.type !== 'string' || !Array.isArray(decision.sourcePathIds) ||
                  !decision.sourcePathIds.every((id: unknown) => typeof id === 'string' && validPathIDs.has(id))) throw new Error('Invalid decision provenance');
            }
            for (const review of input.edgeReviews || []) {
              if (!review || typeof review.roomID !== 'string' || typeof review.edgeID !== 'string' ||
                  !['ACCEPT', 'CORRECT', 'REJECT', 'CANNOT_DETERMINE', 'ACCEPTED', 'REJECTED', 'NEEDS_REVIEW'].includes(review.decision) ||
                  !Array.isArray(review.sourcePathIds) || !review.sourcePathIds.every((id: unknown) => typeof id === 'string' && validPathIDs.has(id)) ||
                  typeof review.reviewerIdentity !== 'string' || !review.reviewerIdentity.trim() ||
                  typeof review.reviewedAt !== 'string' || !review.reviewedAt || (['ACCEPT', 'CORRECT', 'REJECT', 'CANNOT_DETERMINE'].includes(review.decision) && (review.identityAssertion !== 'LOCAL_SELF_DECLARED_NOT_AUTHENTICATED' || !Number.isInteger(review.geometryRevision) || typeof review.geometryFingerprint !== 'string')) || (review.identityAssertion && review.identityAssertion !== 'LOCAL_SELF_DECLARED_NOT_AUTHENTICATED')) throw new Error('Edge review requires a named reviewer, timestamp, decision, revision binding and valid source provenance');
            }
            const current = await readOverrides();
            if (input.revision !== current.revision) throw new Error(`Stale geometry draft: opened revision ${input.revision}, current revision is ${current.revision}. Reload and compare before saving.`);
            const saved = {...input, revision: current.revision + 1, updatedAt: new Date().toISOString()};
            await fs.mkdir(path.dirname(overridesFile), {recursive: true});
            const historyFile = path.join(reviewStore, `history/rev-${String(saved.revision).padStart(6, '0')}.json`);
            await fs.mkdir(path.dirname(historyFile), {recursive: true});
            await fs.writeFile(historyFile, JSON.stringify(saved, null, 2) + '\n');
            const temporary = `${overridesFile}.tmp`;
            await fs.writeFile(temporary, JSON.stringify(saved, null, 2) + '\n');
            await fs.rename(temporary, overridesFile);
            response.end(JSON.stringify(saved)); return;
          }
          response.statusCode = 404; response.end(JSON.stringify({error: 'Unknown geometry review endpoint'}));
        } catch (error) {
          response.statusCode = 400; response.end(JSON.stringify({error: error instanceof Error ? error.message : String(error)}));
        }
      });
    },
  };
}

/**
 * Dev-only: lets /admin write public/campus-config.json directly.
 * Restricted to the local machine; production builds have no write endpoint.
 */
function campusConfigApi(): Plugin {
  const file = path.join(process.cwd(), 'public/campus-config.json');
  return {
    name: 'campus-config-local-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/campus-config')) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        const remote = request.socket.remoteAddress || '';
        const isLoopback = remote === '::1' || remote === '127.0.0.1' || remote.startsWith('::ffff:127.');
        const origin = request.headers.origin;
        if (!isLoopback || (origin && new URL(origin).host !== request.headers.host)) {
          response.statusCode = 403; response.end(JSON.stringify({error: '只能在本机开发服务器上写入配置'})); return;
        }
        if (request.method === 'GET') { response.end(JSON.stringify({writable: true})); return; }
        if (request.method !== 'PUT') { response.statusCode = 405; response.end(JSON.stringify({error: 'Use PUT'})); return; }
        try {
          let body = '';
          for await (const chunk of request) body += chunk;
          const config = JSON.parse(body);
          if (config?.version !== 1 || !Array.isArray(config.sensors) || typeof config.sensorApi?.baseUrl !== 'string') throw new Error('配置格式不正确');
          await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
          response.end(JSON.stringify({ok: true, path: 'public/campus-config.json'}));
        } catch (error: any) {
          response.statusCode = 400; response.end(JSON.stringify({error: error.message}));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), geometryReviewApi(), campusConfigApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
