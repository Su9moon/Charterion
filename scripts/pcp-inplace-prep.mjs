// Offline only. No subprocesses, registry access, RPC, data access or activation.
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync, readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET = '0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a';
const hash = b => createHash('sha256').update(b).digest('hex');
const bytes = v => Buffer.from(JSON.stringify(v, null, 2) + '\n');
const fail = message => { throw new Error(`BLOCKED: ${message}`); };
const check = (condition, message) => { if (!condition) fail(message); };
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hex = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const sha = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const inside = (parent, child) => child === parent || child.startsWith(parent + sep);
const winEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase();
function safeName(name) {
  check(typeof name === 'string' && name.length > 0 && !name.includes('\\') &&
    name.split('/').every(p => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)), 'unsafe relative file name');
  check(!/(^|\/)(data|chrome-profile|browser\.token|admin\.token|global\.db(?:-wal|-shm)?)($|\/)/i.test(name), 'runtime data is forbidden');
  return name;
}
// Reject symlinks/junctions and noncanonical ancestors, including the output parent.
function safePath(path) {
  check(typeof path === 'string' && !path.split(/[\\/]/).includes('..'), 'path traversal');
  const full = resolve(path);
  let cursor = full;
  while (true) {
    const st = lstatSync(cursor);
    check(!st.isSymbolicLink() && (st.isDirectory() || st.isFile()), 'linked or special path');
    check(realpathSync(cursor).toLowerCase() === cursor.toLowerCase(), 'reparse/noncanonical path');
    if (dirname(cursor) === cursor) break;
    cursor = dirname(cursor);
  }
  return full;
}
function read(path) {
  safePath(path);
  check(lstatSync(path).isFile() && lstatSync(path).nlink === 1, 'nonregular or hardlinked input');
  return readFileSync(path);
}
function tree(root, prefix = '') {
  safePath(root);
  const result = {};
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const name = safeName(prefix + entry.name), path = join(root, entry.name);
    safePath(path);
    if (entry.isDirectory()) Object.assign(result, tree(path, name + '/'));
    else result[name] = read(path);
  }
  return result;
}
function inventory(files) { return Object.fromEntries(Object.keys(files).sort().map(n => [n, hash(files[n])])); }
function sameInventory(actual, expected) {
  check(expected && typeof expected === 'object' && !Array.isArray(expected), 'missing full inventory');
  for (const [n, h] of Object.entries(expected)) { safeName(n); check(hex(h), 'invalid SHA256'); }
  check(Object.keys(actual).length === Object.keys(expected).length && Object.entries(actual).every(([n, b]) => expected[n] === hash(b)), 'file set/hash mismatch');
}
const copiedNames = ['trial.json', 'release.json', 'manifest.json', 'native-host/gam-native-host.json', 'registration.json'];
function parse(b) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b)); }

// evidence.json is an external, caller-reviewed provenance receipt, never synthesized by this tool.
export function plan({ source, evidence, targetSha }) {
  check(targetSha === TARGET, 'unsupported target sourceSha');
  source = safePath(source); evidence = safePath(evidence);
  const receiptBytes = read(join(evidence, 'evidence.json')), receipt = parse(receiptBytes);
  check(receipt.schemaVersion === 1 && receipt.targetSourceSha === TARGET && receipt.readOnlyCopies === true &&
    typeof receipt.observedAt === 'string' && Number.isFinite(Date.parse(receipt.observedAt)) &&
    typeof receipt.provenance === 'string' && receipt.provenance.trim().length > 0, 'unknown evidence provenance');
  const copies = Object.fromEntries(copiedNames.map(n => [n, read(join(evidence, n))]));
  sameInventory(copies, receipt.copies);
  const [trial, old, manifest, config, registration] = copiedNames.map(n => parse(copies[n]));
  check(typeof trial.root === 'string' && /^[A-Za-z]:\\/.test(trial.root) && !trial.root.split(/[\\/]/).includes('..') &&
    !/[<>"|?*\x00-\x1f]/.test(trial.root) && !trial.root.slice(2).includes(':'), 'invalid Windows TrialRoot');
  for (const path of [source, evidence]) check(!inside(resolve(trial.root).toLowerCase(), path.toLowerCase()), 'inputs must be offline copies outside TrialRoot');
  check(sha(trial.sourceSha) && trial.sourceSha !== TARGET, 'invalid old sourceSha');
  const id = hash(win32.resolve(trial.root, 'data').replaceAll('\\', '/').toLowerCase()).slice(0, 16);
  check(trial.instanceId === id && trial.host === `com.charterion.pcp_trial_${id}`, 'Trial identity mismatch');
  check(typeof manifest.key === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(manifest.key), 'missing manifest key');
  const extensionId = [...hash(Buffer.from(manifest.key, 'base64')).slice(0, 32)].map(n => String.fromCharCode(97 + parseInt(n, 16))).join('');
  check(trial.extensionId === extensionId, 'extension ID/key mismatch');
  for (const k of ['sourceSha', 'instanceId', 'host', 'extensionId']) check(old[k] === trial[k], `old release ${k} mismatch`);
  check(typeof old.originalHost === 'string' && /^[a-z0-9_.]+$/.test(old.originalHost) && old.originalHost !== trial.host && hex(old.sourceBackgroundSha256), 'old release binding evidence missing');
  check(old.files && Object.keys(old.files).length > 0, 'old release inventory missing');
  for (const [n, h] of Object.entries(old.files)) { safeName(n.replaceAll('\\', '/')); check(hex(h), 'old inventory hash missing'); }
  const origin = `chrome-extension://${extensionId}/`, appPath = win32.join(trial.root, 'versions', trial.sourceSha);
  check(config.instanceId === id && config.pipeName === `\\\\.\\pipe\\charterion-${id}` && config.allowedOrigin === origin &&
    winEqual(config.browserTokenPath, win32.join(trial.root, 'data', 'browser.token')), 'native config binding mismatch');
  check(registration.name === trial.host && registration.type === 'stdio' && equal(registration.allowed_origins, [origin]) &&
    winEqual(registration.path, win32.join(appPath, 'native-host', 'GamNativeHost.exe')), 'current Host registration JSON mismatch');
  check(winEqual(receipt.registrationPath, win32.join(appPath, 'native-host', trial.host + '.json')), 'current registry value evidence mismatch');
  check(receipt.oldReleaseReadHash === 'PASS' && equal(receipt.oldReleaseFiles, old.files), 'old installed release integrity unproven');

  const artifacts = {};
  for (const dir of ['dist', 'dist-control', 'dist-native-host']) {
    for (const [n, b] of Object.entries(tree(join(source, dir)))) artifacts[`${dir}/${n}`] = b;
  }
  for (const n of ['manifest.json', 'scripts/pcp-trial.mjs', 'shared/native-rpc-protocol.json']) artifacts[n] = read(join(source, n));
  sameInventory(artifacts, receipt.artifacts);
  check(receipt.buildSourceSha === TARGET && receipt.verify === 'PASS' && receipt.distFingerprint === 'PASS' && receipt.nativePublish === 'PASS', 'build/test provenance unproven');
  check(equal(parse(artifacts['manifest.json']), manifest), 'candidate manifest differs from exact copied manifest');
  check(parse(artifacts['shared/native-rpc-protocol.json']).host === old.originalHost, 'original host mismatch');
  for (const n of ['dist/background.js', 'dist-control/gamd.cjs', 'dist-control/gamctl.cjs', 'dist-control/gam.cjs', 'dist-control/dashboard/index.html', 'dist-native-host/GamNativeHost.exe']) check(artifacts[n]?.length > 0, `missing ${n}`);
  const meta = parse(artifacts['dist/build-meta.json']);
  check(meta.schemaVersion === 1 && hex(meta.sourceFingerprint) && meta.version === manifest.version, 'invalid/inconsistent original build-meta');
  for (const n of ['background.js', 'content.js', 'sidepanel.js', 'sidepanel.html', 'sidepanel.css']) check(meta.files?.[n] === hash(artifacts['dist/' + n] ?? Buffer.alloc(0)), 'build-meta artifact mismatch');
  const background = new TextDecoder('utf-8', { fatal: true }).decode(artifacts['dist/background.js']);
  check(background.includes(old.originalHost) && !background.includes(trial.host), 'background binding not uniquely attributable');
  const app = {};
  for (const [n, b] of Object.entries(artifacts)) {
    if (n.startsWith('dist/') || n.startsWith('dist-control/')) app[n] = b;
    if (n.startsWith('dist-native-host/')) app[n.replace('dist-native-host/', 'native-host/')] = b;
  }
  // Match install's application layout, but provide no launchers or active root trial.json.
  app['manifest.json'] = artifacts['manifest.json'];
  app['pcp-trial.mjs'] = artifacts['scripts/pcp-trial.mjs'];
  app['dist/background.js'] = Buffer.from(background.replaceAll(old.originalHost, trial.host));
  app['native-host/gam-native-host.json'] = copies['native-host/gam-native-host.json'];
  const targetApp = win32.join(trial.root, 'versions', TARGET);
  app[`native-host/${trial.host}.json`] = bytes({ ...registration, path: win32.join(targetApp, 'native-host', 'GamNativeHost.exe') });
  const expectedSet = Object.keys(old.files).map(n => n.replaceAll('\\', '/')).sort();
  check(equal(Object.keys(app).sort(), expectedSet), 'candidate differs from old install file set; manual review required');
  app['release.json'] = bytes({ sourceSha: TARGET, instanceId: id, host: trial.host, extensionId, originalHost: old.originalHost,
    sourceBackgroundSha256: hash(artifacts['dist/background.js']), files: inventory(app) });
  const files = {};
  for (const [n, b] of Object.entries(app)) files[`versions/${TARGET}/${n}`] = b;
  for (const [n, b] of Object.entries(copies)) files[`evidence/${n}`] = b;
  files['evidence/evidence.json'] = receiptBytes;
  files['installation-manifest.json'] = bytes({ schemaVersion: 1, status: 'BLOCKED', targetSourceSha: TARGET,
    toolCommitSha: null, originalTrialRoot: trial.root, instanceId: id, host: trial.host, extensionId,
    pipeName: config.pipeName, intendedAppPath: targetApp, activationImplemented: false,
    originalBuildMetaSha256: hash(artifacts['dist/build-meta.json']),
    backgroundRewrite: { from: old.originalHost, to: trial.host, before: hash(artifacts['dist/background.js']), after: hash(app['dist/background.js']) },
    blockers: ['Chrome Dev Default actual loaded path and reversible same-ID reload/storage retention unproven',
      'Authorized Kernel SQLite consistent backup and restore rehearsal unavailable', 'Current DB schema compatibility unknown',
      'Lease/attempt read-only snapshot unavailable', 'Native Host runtime smoke NOT_RUN'],
    integrityScope: 'Caller-attested copies and artifact inventories only; no live verification or activation approval' });
  files['SHA256SUMS.json'] = bytes(inventory(files));
  return { files, trialRoot: trial.root, source, evidence };
}
export function execute(options) {
  check(['prepare', 'verify'].includes(options.mode), 'use prepare or verify');
  const p = plan(options), out = resolve(options.outDir);
  check(typeof options.outDir === 'string' && options.outDir.length > 0 && !options.outDir.split(/[\\/]/).includes('..'), 'explicit fresh outDir required');
  safePath(dirname(out));
  // On Windows this catches case-insensitive overlap without reading TrialRoot.
  const normalized = s => resolve(s).toLowerCase();
  for (const protectedPath of [p.trialRoot, p.source, p.evidence]) {
    check(!inside(normalized(protectedPath), normalized(out)) && !inside(normalized(out), normalized(protectedPath)), 'output overlaps protected input');
  }
  if (options.mode === 'prepare') {
    check(!existsSync(out), 'outDir already exists');
    mkdirSync(out); // atomic exclusive creation; no overwrite, no cleanup on error
    for (const [n, b] of Object.entries(p.files)) {
      const path = join(out, n); mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, b, { flag: 'wx' });
    }
  }
  const actual = tree(out);
  sameInventory(actual, inventory(p.files));
  return { integrity: 'PASS', readiness: 'BLOCKED', targetSourceSha: TARGET, mode: options.mode };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, ...args] = process.argv.slice(2), options = { mode };
    const flags = { '--source': 'source', '--evidence': 'evidence', '--target-sha': 'targetSha', '--out-dir': 'outDir' };
    for (let i = 0; i < args.length; i += 2) {
      check(flags[args[i]] && args[i + 1] && options[flags[args[i]]] === undefined, 'invalid/duplicate arguments');
      options[flags[args[i]]] = args[i + 1];
    }
    for (const key of Object.values(flags)) check(typeof options[key] === 'string', `missing ${key}`);
    console.log(JSON.stringify(execute(options), null, 2));
    process.exitCode = 2; // BLOCKED is never deployment success, even with package integrity PASS.
  } catch (error) { console.error(JSON.stringify({ readiness: 'BLOCKED', error: error.message })); process.exitCode = 1; }
}
