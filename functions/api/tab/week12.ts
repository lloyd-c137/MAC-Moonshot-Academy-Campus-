import scheduleData from '../../../data/tab/reconstructed/2026-fall-week12/week12-schedule.json';

interface AccessEnv {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

interface PagesRequestContext {
  request: Request;
  env: AccessEnv;
}

type JwtClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number };
type JwkSet = { keys?: Array<JsonWebKey & { kid?: string; alg?: string; use?: string }> };

const encoder = new TextEncoder();

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer as ArrayBuffer;
}

async function verifyAccessJwt(token: string, env: AccessEnv): Promise<boolean> {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = env.CF_ACCESS_AUD;
  if (!team || !audience) return false;

  const [encodedHeader, encodedClaims, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature) return false;

  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as { alg?: string; kid?: string };
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedClaims))) as JwtClaims;
    const issuer = `https://${team}`;
    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== issuer || !audiences.includes(audience)) return false;
    if (!claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now)) return false;

    const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
    if (!response.ok) return false;
    const jwks = await response.json() as JwkSet;
    const jwk = jwks.keys?.find((key) => key.kid === header.kid && (!key.alg || key.alg === 'RS256'));
    if (!jwk) return false;
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey,
      asArrayBuffer(decodeBase64Url(encodedSignature)),
      asArrayBuffer(encoder.encode(`${encodedHeader}.${encodedClaims}`)),
    );
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie, CF-Access-Jwt-Assertion' },
  });
}

export async function onRequestGet({ request, env }: PagesRequestContext): Promise<Response> {
  const token = request.headers.get('CF-Access-Jwt-Assertion');
  if (!token || !(await verifyAccessJwt(token, env))) return json({ error: 'SCHOOL_ACCESS_REQUIRED' }, 401);

  const url = new URL(request.url);
  const roomId = url.searchParams.get('room')?.trim() ?? '';
  const date = url.searchParams.get('date') ?? '';
  if (!/^[AMS]\d{3}(?:-\d+)?$/.test(roomId) || !/^2026-11-0[2-6]$/.test(date)) {
    return json({ error: 'INVALID_ROOM_OR_DATE' }, 400);
  }

  const rows = scheduleData.weekly_display_events.filter((row) => row.room_id === roomId && row.date === date);
  return json({
    room_id: roomId,
    date,
    week: { start: '2026-11-02', end: '2026-11-06', number: 12 },
    data_state: 'valid',
    rows,
  });
}
