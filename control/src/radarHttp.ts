import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import type { RadarSnapshot } from '../../shared/radar';

export function radarPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^(?:0|[1-9]\d{0,4})$/.test(value) || Number(value) > 65535) throw new Error('GAM_RADAR_PORT must be 0..65535; omit it to disable radar');
  return Number(value);
}

export async function startRadarHttp(options: {
  port: number; assetsDir: string; snapshot: (projectId?: string) => RadarSnapshot;
}): Promise<{ openUrl: string; close: () => Promise<void> }> {
  const assets = new Map([
    ['/pcp/', { type: 'text/html; charset=utf-8', body: readFileSync(join(options.assetsDir, 'index.html')) }],
    ['/pcp/radar.js', { type: 'text/javascript; charset=utf-8', body: readFileSync(join(options.assetsDir, 'radar.js')) }],
    ['/pcp/radar.css', { type: 'text/css; charset=utf-8', body: readFileSync(join(options.assetsDir, 'radar.css')) }],
  ]);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(`Bearer ${token}`).digest();
  let origin = '';
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const fail = (status: number, error: string): void => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error })); };
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== origin.slice('http://'.length) ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return fail(403, 'LOCAL_ORIGIN_REQUIRED');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return fail(405, 'READ_ONLY'); }
    let url: URL;
    try { url = new URL(req.url ?? '/', origin); } catch { return fail(400, 'INVALID_URL'); }
    if (url.origin !== origin) return fail(403, 'LOCAL_ORIGIN_REQUIRED');
    const asset = assets.get(url.pathname);
    if (asset && !url.search) { res.writeHead(200, { 'Content-Type': asset.type }); res.end(asset.body); return; }
    if (url.pathname !== '/pcp/api/snapshot') return fail(404, 'NOT_FOUND');
    if (!timingSafeEqual(tokenHash, createHash('sha256').update(req.headers.authorization ?? '').digest())) return fail(401, 'READ_SESSION_REQUIRED');
    if ([...url.searchParams.keys()].some(k => k !== 'projectId') || url.searchParams.getAll('projectId').length > 1) return fail(400, 'INVALID_QUERY');
    const projectId = url.searchParams.get('projectId') ?? undefined;
    if (projectId !== undefined && (!projectId || projectId.length > 256)) return fail(400, 'INVALID_PROJECT');
    try {
      const snapshot = options.snapshot(projectId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(snapshot));
    } catch (error) { fail(error instanceof Error && error.message === 'PROJECT_NOT_FOUND' ? 404 : 503, 'STATE_UNAVAILABLE'); }
  });
  server.maxConnections = 32;
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Radar has no loopback address');
  origin = new URL(`http://127.0.0.1:${address.port}`).origin;
  return { openUrl: `${origin}/pcp/#read=${token}`, close: () => new Promise<void>((resolve, reject) => {
    server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
  }) };
}
