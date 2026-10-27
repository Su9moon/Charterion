import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import type { RadarSnapshot } from '../../shared/radar';
import { RadarControlError, type RadarControl } from './radarControl';

async function commandBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    // Keep the error listener until the request is released: a peer can reset an already rejected body.
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', aborted); };
    const error = () => { cleanup(); reject(new RadarControlError(400, 'INVALID_BODY')); };
    const aborted = error;
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8192) { cleanup(); req.resume(); reject(new RadarControlError(413, 'BODY_TOO_LARGE')); }
      else chunks.push(chunk);
    };
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new RadarControlError(400, 'INVALID_JSON')); } };
    const timer = setTimeout(() => { cleanup(); req.resume(); reject(new RadarControlError(408, 'BODY_TIMEOUT')); }, 5000);
    req.on('data', data).once('end', end).on('error', error).once('aborted', aborted);
  });
}

export function radarPort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^(?:0|[1-9]\d{0,4})$/.test(value) || Number(value) > 65535) throw new Error('GAM_RADAR_PORT must be 0..65535; omit it to disable radar');
  return Number(value);
}

export async function startRadarHttp(options: {
  port: number; assetsDir: string; snapshot: (projectId?: string) => RadarSnapshot; control?: RadarControl;
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
    const fail = (status: number, error: string): void => {
      if (!req.complete) res.setHeader('Connection', 'close');
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error }));
    };
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== origin.slice('http://'.length) ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return fail(403, 'LOCAL_ORIGIN_REQUIRED');
    let url: URL;
    try { url = new URL(req.url ?? '/', origin); } catch { return fail(400, 'INVALID_URL'); }
    if (url.origin !== origin) return fail(403, 'LOCAL_ORIGIN_REQUIRED');
    if (req.method === 'POST' && url.pathname === '/pcp/api/fleet-control' && options.control) {
      if (req.headers.origin !== origin || (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin')) return fail(403, 'LOCAL_ORIGIN_REQUIRED');
      if (!timingSafeEqual(tokenHash, createHash('sha256').update(req.headers.authorization ?? '').digest())) return fail(401, 'READ_SESSION_REQUIRED');
      const controlToken = req.headers['x-charterion-control'];
      if (typeof controlToken !== 'string' || !/^fleet_[A-Za-z0-9_-]{43}$/.test(controlToken)) return fail(403, 'CONTROL_AUTHORIZATION_REQUIRED');
      if (url.search || req.headers['content-type'] !== 'application/json') return fail(400, 'JSON_COMMAND_REQUIRED');
      void commandBody(req).then(body => {
        const result = options.control!.execute(controlToken, body);
        res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result.body));
      }).catch(error => fail(error instanceof RadarControlError ? error.status : 503, error instanceof RadarControlError ? error.code : 'CONTROL_UNAVAILABLE'));
      return;
    }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return fail(405, 'READ_ONLY'); }
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
