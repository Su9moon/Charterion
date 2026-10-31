import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { execute, TARGET } from '../pcp-inplace-prep.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
const encoded = x => Buffer.from(JSON.stringify(x, null, 2) + '\n');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pcp-offline-'));
  const source = join(root, 'source'), evidence = join(root, 'evidence'), outDir = join(root, 'candidate');
  const put = (base, n, b) => { mkdirSync(winPath(base, n), { recursive: true }); writeFileSync(join(base, n), b); };
  function winPath(base, n) { return join(base, ...n.split('/').slice(0, -1)); }
  const trialRoot = 'F:\\mock trial', oldSha = 'd'.repeat(40), originalHost = 'com.charterion.control';
  const instanceId = hash(win32.join(trialRoot, 'data').replaceAll('\\', '/').toLowerCase()).slice(0, 16);
  const host = `com.charterion.pcp_trial_${instanceId}`, key = Buffer.from('mock-key').toString('base64');
  const extensionId = [...hash(Buffer.from(key, 'base64')).slice(0, 32)].map(n => String.fromCharCode(97 + parseInt(n, 16))).join('');
  const manifest = { key, manifest_version: 3, name: 'fixture', version: '1' };
  const artifacts = {
    'manifest.json': encoded(manifest), 'scripts/pcp-trial.mjs': Buffer.from('// mock existing script'),
    'shared/native-rpc-protocol.json': encoded({ host: originalHost }),
    'dist/background.js': Buffer.from(`const host = "${originalHost}";`),
    'dist/content.js': Buffer.from('content'), 'dist/sidepanel.js': Buffer.from('sidepanel'),
    'dist/sidepanel.html': Buffer.from('<html>'), 'dist/sidepanel.css': Buffer.from('body{}'),
    'dist-control/gamd.cjs': Buffer.from('kernel'), 'dist-control/gamctl.cjs': Buffer.from('cli'),
    'dist-control/gam.cjs': Buffer.from('launcher'), 'dist-control/dashboard/index.html': Buffer.from('dashboard'),
    'dist-native-host/GamNativeHost.exe': Buffer.from('mock PE; never executed'),
  };
  const meta = { schemaVersion: 1, version: '1', sourceFingerprint: 'a'.repeat(64), files: {} };
  for (const n of ['background.js', 'content.js', 'sidepanel.js', 'sidepanel.html', 'sidepanel.css']) meta.files[n] = hash(artifacts['dist/' + n]);
  artifacts['dist/build-meta.json'] = encoded(meta);
  const oldFiles = Object.fromEntries(Object.keys(artifacts).filter(n => /^(dist\/|dist-control\/|dist-native-host\/)/.test(n)).map(n => [n.replace('dist-native-host/', 'native-host/'), 'b'.repeat(64)]));
  for (const n of ['manifest.json', 'pcp-trial.mjs', 'native-host/gam-native-host.json', `native-host/${host}.json`]) oldFiles[n] = 'b'.repeat(64);
  const copies = {
    'trial.json': encoded({ root: trialRoot, sourceSha: oldSha, instanceId, host, extensionId }),
    'release.json': encoded({ sourceSha: oldSha, instanceId, host, extensionId, originalHost, sourceBackgroundSha256: 'a'.repeat(64), files: oldFiles }),
    'manifest.json': encoded(manifest),
    'native-host/gam-native-host.json': encoded({ instanceId, pipeName: `\\\\.\\pipe\\charterion-${instanceId}`, browserTokenPath: win32.join(trialRoot, 'data/browser.token'), allowedOrigin: `chrome-extension://${extensionId}/` }),
    'registration.json': encoded({ name: host, type: 'stdio', path: win32.join(trialRoot, 'versions', oldSha, 'native-host/GamNativeHost.exe'), allowed_origins: [`chrome-extension://${extensionId}/`] }),
  };
  const inv = files => Object.fromEntries(Object.entries(files).map(([n, b]) => [n, hash(b)]));
  const receipt = { schemaVersion: 1, targetSourceSha: TARGET, buildSourceSha: TARGET, readOnlyCopies: true,
    observedAt: '2026-11-01T00:00:00Z', provenance: 'MOCK ONLY', copies: inv(copies), artifacts: inv(artifacts),
    oldReleaseFiles: oldFiles, oldReleaseReadHash: 'PASS', verify: 'PASS', distFingerprint: 'PASS', nativePublish: 'PASS',
    registrationPath: win32.join(trialRoot, 'versions', oldSha, 'native-host', host + '.json') };
  for (const [n, b] of Object.entries(artifacts)) put(source, n, b);
  for (const [n, b] of Object.entries(copies)) put(evidence, n, b);
  const save = () => put(evidence, 'evidence.json', encoded(receipt)); save();
  return { root, source, evidence, outDir, targetSha: TARGET, receipt, save, put, artifacts };
}
function run(fn) { const f = fixture(); try { fn(f); } finally { rmSync(f.root, { recursive: true, force: true }); } }
test('prepare and verify preserve metadata, identity, input bytes and remain BLOCKED', () => run(f => {
  const before = readFileSync(join(f.evidence, 'trial.json'));
  assert.deepEqual(execute({ ...f, mode: 'prepare' }), { integrity: 'PASS', readiness: 'BLOCKED', targetSourceSha: TARGET, mode: 'prepare' });
  assert.equal(execute({ ...f, mode: 'verify' }).readiness, 'BLOCKED');
  assert.deepEqual(readFileSync(join(f.evidence, 'trial.json')), before);
  assert.deepEqual(readFileSync(join(f.outDir, 'versions', TARGET, 'dist/build-meta.json')), f.artifacts['dist/build-meta.json']);
  assert.equal(existsSync(join(f.outDir, 'trial.json')), false);
  assert.throws(() => execute({ ...f, mode: 'prepare' }), /already exists/);
}));
test('verify rejects tampered, extra and missing files', () => {
  for (const kind of ['tampered', 'extra', 'missing']) run(f => {
    execute({ ...f, mode: 'prepare' });
    const path = join(f.outDir, 'versions', TARGET, 'dist/content.js');
    if (kind === 'missing') rmSync(path); else writeFileSync(kind === 'extra' ? join(f.outDir, 'extra') : path, 'bad');
    assert.throws(() => execute({ ...f, mode: 'verify' }), /file set\/hash mismatch/);
  });
});
test('reject unknown provenance, incomplete inventory, bad target, traversal, source overlap before output', () => {
  for (const mutate of [f => { f.receipt.provenance = ''; f.save(); }, f => { delete f.receipt.artifacts['dist/content.js']; f.save(); },
    f => { f.targetSha = 'c'.repeat(40); }, f => { f.outDir = join(f.root, 'new') + '/../escape'; }, f => { f.outDir = join(f.source, 'candidate'); }]) run(f => {
    mutate(f); assert.throws(() => execute({ ...f, mode: 'prepare' }), /BLOCKED/);
    assert.equal(existsSync(join(f.root, 'candidate')), false);
  });
});
test('reject links and binding mismatch even when copied receipt hash is updated', () => run(f => {
  const path = join(f.evidence, 'registration.json'), registration = JSON.parse(readFileSync(path));
  registration.name = 'foreign.host'; const b = encoded(registration); writeFileSync(path, b);
  f.receipt.copies['registration.json'] = hash(b); f.save();
  assert.throws(() => execute({ ...f, mode: 'prepare' }), /registration JSON mismatch/);
}));
test('reject symbolic input and output parent', { skip: process.platform === 'win32' ? 'requires symlink privilege; junction coverage required separately on Windows' : false }, () => run(f => {
  const link = join(f.root, 'link'); symlinkSync(f.source, link, 'dir');
  assert.throws(() => execute({ ...f, source: link, mode: 'prepare' }), /linked|reparse/);
  assert.throws(() => execute({ ...f, outDir: join(link, 'candidate'), mode: 'prepare' }), /linked|reparse/);
}));
test('reject key, pipe, metadata and installed file-set inconsistencies despite matching supplied hashes', () => {
  for (const kind of ['key', 'pipe', 'metadata', 'file-set']) run(f => {
    if (kind === 'key' || kind === 'pipe' || kind === 'file-set') {
      const n = kind === 'key' ? 'manifest.json' : kind === 'pipe' ? 'native-host/gam-native-host.json' : 'release.json';
      const value = JSON.parse(readFileSync(join(f.evidence, n)));
      if (kind === 'key') value.key = Buffer.from('foreign-key').toString('base64');
      if (kind === 'pipe') value.pipeName = 'foreign-pipe';
      if (kind === 'file-set') { value.files['extra.js'] = 'a'.repeat(64); f.receipt.oldReleaseFiles = value.files; }
      const b = encoded(value); f.put(f.evidence, n, b); f.receipt.copies[n] = hash(b);
    } else {
      const n = 'dist/build-meta.json', meta = JSON.parse(f.artifacts[n]);
      meta.files['background.js'] = '0'.repeat(64);
      const b = encoded(meta); f.put(f.source, n, b); f.receipt.artifacts[n] = hash(b);
    }
    f.save();
    assert.throws(() => execute({ ...f, mode: 'prepare' }), /mismatch|differs/);
    assert.equal(existsSync(f.outDir), false);
  });
});
