import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 20000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${exe} failed (${result.status}): ${result.error?.message ?? result.stderr ?? ''}`);
  return result.stdout.trim();
}
function ps(command, env = {}) { return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { env: { ...process.env, ...env } }); }
function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name); if (entry.isSymbolicLink()) throw new Error('Linked package files are forbidden');
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}
export function verifyFiles(root, files) {
  const base = realpathSync(root);
  for (const [name, expected] of Object.entries(files)) {
    const path = resolve(base, name), rel = relative(base, path);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep) || !same(realpathSync(path), path) || !lstatSync(path).isFile()) throw new Error(`Unsafe package path: ${name}`);
    if (sha256(readFileSync(path)) !== expected) throw new Error(`Package hash mismatch: ${name}`);
  }
}
export function ownedProcess(actual, recorded, executable, argument) {
  const epoch = value => /^\/Date\((-?\d+)\)\/$/.test(String(value)) ? Number(String(value).slice(6, -2)) : Date.parse(value);
  return Boolean(actual && recorded && actual.ProcessId === recorded.ProcessId && Number.isFinite(epoch(actual.CreationDate)) && epoch(actual.CreationDate) === epoch(recorded.CreationDate) &&
    same(actual.ExecutablePath, executable) && same(actual.ExecutablePath, recorded.ExecutablePath) && actual.CommandLine === recorded.CommandLine && actual.CommandLine.includes(argument));
}
function processById(id) {
  if (!Number.isSafeInteger(id) || id < 1) return undefined;
  const output = ps(`Get-CimInstance Win32_Process -Filter 'ProcessId=${id}' | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress`);
  return output ? JSON.parse(output) : undefined;
}
function stopOwned(recorded, executable, argument) {
  if (!recorded || !processById(recorded.ProcessId)) return;
  if (!ownedProcess(processById(recorded.ProcessId), recorded, executable, argument)) throw new Error('Process ownership mismatch; refusing to stop');
  ps(`$s=$env:CH_PCP_PROCESS|ConvertFrom-Json; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$s.ProcessId); if (!$p) {exit 0}; function Epoch($v) {if ($v -is [datetime]) {return ([DateTimeOffset]$v).ToUnixTimeMilliseconds()}; if ([string]$v -match '^/Date\\((-?\\d+)\\)/$') {return [long]$Matches[1]}; return ([DateTimeOffset]::Parse([string]$v)).ToUnixTimeMilliseconds()}; if ($p.ProcessId -ne $s.ProcessId -or $p.ExecutablePath -ine $s.ExecutablePath -or $p.CommandLine -cne $s.CommandLine -or (Epoch $p.CreationDate) -ne (Epoch $s.CreationDate)) {throw 'Process changed; refusing to stop'}; Stop-Process -Id $p.ProcessId -ErrorAction Stop`, { CH_PCP_PROCESS: JSON.stringify(recorded) });
}
function configAt(root) {
  const config = json(join(root, 'trial.json'));
  if (!same(realpathSync(root), config.root) || !/^[0-9a-f]{40}$/.test(config.sourceSha)) throw new Error('Trial root/version mismatch');
  const app = join(root, 'versions', config.sourceSha);
  const identity = sha256(resolve(root, 'data').replaceAll('\\', '/').toLowerCase()).slice(0, 16);
  if (config.instanceId !== identity || config.host !== `com.charterion.pcp_trial_${identity}`) throw new Error('Trial identity mismatch');
  return { ...config, app, home: join(root, 'data'), profile: join(root, 'chrome-profile'), logs: join(root, 'data', 'logs') };
}
function environment(c) {
  const env = { ...process.env, GAM_HOME: c.home, GAM_RADAR_PORT: '0' }; delete env.GAM_PIPE_NAME; delete env.GAM_NO_BROWSER;
  return env;
}
function cli(c, args, input = '{}') {
  return JSON.parse(run(c.node, [join(c.app, 'dist-control/gamctl.cjs'), ...args], { env: environment(c), input }));
}
function rpc(c, method, params = {}) {
  const response = cli(c, [method, '--admin', '--stdin'], JSON.stringify(params));
  if (!response.ok) throw new Error(`Kernel rejected ${method}: ${response.error?.code}`); return response.result;
}
function registryValue(host) {
  const result = spawnSync('reg.exe', ['query', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${host}`, '/ve'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return undefined;
  return result.stdout.match(/REG_SZ\s+(.+)\r?\n/)?.[1]?.trim();
}
function verify(c) {
  const release = json(join(c.app, 'release.json'));
  if (release.sourceSha !== c.sourceSha || release.host !== c.host) throw new Error('Release identity mismatch');
  verifyFiles(c.app, release.files);
  if (!same(registryValue(c.host), join(c.app, 'native-host', `${c.host}.json`))) throw new Error('Native Host registration mismatch');
  if (sha256(readFileSync(c.node)) !== c.nodeSha256) throw new Error('Node executable changed; revalidate before use');
  return release;
}
function stateAt(c) { return existsSync(join(c.root, 'processes.json')) ? json(join(c.root, 'processes.json')) : {}; }
function saveState(c, state) { writeJson(join(c.root, 'processes.json'), state); }
export function browserEndpoint(value, port) {
  const url = new URL(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' ||
      url.port !== String(port) || url.username || url.password || url.search || url.hash || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(url.pathname))
    throw new Error('Unexpected trial browser endpoint');
  return url.href;
}
async function closeTrialBrowser(c, state) {
  const recorded = state.chrome;
  if (!recorded || !processById(recorded.ProcessId)) return;
  const assertOwner = () => {
    if (!ownedProcess(processById(recorded.ProcessId), recorded, c.chrome, `--user-data-dir=${c.profile}`))
      throw new Error('Process ownership mismatch; refusing to close');
  };
  assertOwner();
  if (!Number.isInteger(state.cdpPort) || state.cdpPort < 1 || state.cdpPort > 65535) throw new Error('No trial browser endpoint; close its window manually and retry stop');
  const response = await fetch(`http://127.0.0.1:${state.cdpPort}/json/version`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!response.ok) throw new Error('Trial browser endpoint unavailable; close its window manually and retry stop');
  const endpoint = browserEndpoint((await response.json()).webSocketDebuggerUrl, state.cdpPort);
  const socket = new WebSocket(endpoint);
  try {
    await new Promise((resolve, reject) => {
      let closeSent = false;
      const timer = setTimeout(() => reject(new Error('Trial browser close timed out; no process was forced')), 6000);
      const fail = error => { clearTimeout(timer); reject(error); };
      socket.onerror = () => fail(new Error('Trial browser connection failed; no process was forced'));
      socket.onclose = () => {
        if (closeSent) { clearTimeout(timer); resolve(); }
        else fail(new Error('Trial browser disconnected before close was requested'));
      };
      socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'SystemInfo.getProcessInfo' }));
      socket.onmessage = ({ data }) => {
        try {
          const message = JSON.parse(String(data));
          if (message.id === 1) {
            if (message.error || !message.result?.processInfo?.some(p => p.type === 'browser' && p.id === recorded.ProcessId))
              throw new Error('Browser endpoint PID mismatch; refusing to close');
            assertOwner();
            closeSent = true;
            socket.send(JSON.stringify({ id: 2, method: 'Browser.close' }));
          } else if (message.id === 2) {
            if (message.error) throw new Error('Trial browser rejected graceful close');
            clearTimeout(timer); resolve();
          }
        } catch (error) { fail(error); }
      };
    });
  } finally { socket.close(); }
  for (let n = 0; n < 30; n++) {
    if (!processById(recorded.ProcessId)) return;
    assertOwner(); await sleep(200);
  }
  throw new Error('Chrome is still closing; retry stop after it exits. No process was forced');
}
async function stop(c) {
  // Stop remains available even when package integrity fails; process ownership is checked independently.
  const state = stateAt(c);
  // Let Chrome flush its Profile; never turn a failed graceful close into a forced browser kill.
  if (state.browserMode !== 'external-chrome-dev') await closeTrialBrowser(c, state);
  stopOwned(state.kernel, c.node, join(c.app, 'dist-control/gamd.cjs'));
  const browserRunning = () => state.browserMode !== 'external-chrome-dev' && processById(state.chrome?.ProcessId);
  for (let n = 0; n < 40; n++) { if (!browserRunning() && !processById(state.kernel?.ProcessId)) break; await sleep(100); }
  if (browserRunning() || processById(state.kernel?.ProcessId)) throw new Error('Owned processes did not exit');
  saveState(c, { stoppedAt: Date.now() }); return { status: 'stopped', instanceId: c.instanceId };
}
async function start(c) {
  verify(c); const state = stateAt(c);
  if (state.chrome && ownedProcess(processById(state.chrome.ProcessId), state.chrome, c.chrome, `--user-data-dir=${c.profile}`))
    throw new Error('Legacy trial browser is still running; stop it before switching to external Chrome Dev');
  if (state.kernel && processById(state.kernel.ProcessId)) {
    if (!ownedProcess(processById(state.kernel.ProcessId), state.kernel, c.node, join(c.app, 'dist-control/gamd.cjs'))) throw new Error('Kernel PID ownership mismatch');
    if (rpc(c, 'health').instanceId !== c.instanceId) throw new Error('Foreign Kernel');
  } else {
    try { if (rpc(c, 'health')) throw new Error('Untracked Kernel is already active; diagnose before starting'); } catch (error) { if (/Untracked/.test(error.message)) throw error; }
    run(c.node, [join(c.app, 'dist-control/gam.cjs'), 'start', '--no-browser', '--json'], { env: environment(c) });
    const output = ps(`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($env:CH_PCP_BUNDLE)} | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress`, { CH_PCP_BUNDLE: join(c.app, 'dist-control/gamd.cjs') });
    const candidates = output ? JSON.parse(output) : [];
    if (!output || Array.isArray(candidates)) throw new Error('Expected exactly one installed Kernel process');
    state.kernel = candidates; saveState(c, state);
  }
  try {
    const url = new URL(rpc(c, 'radar.open').url); state.origin = url.origin;
    state.browserMode = 'external-chrome-dev';
    saveState(c, state);
    return { status: 'ready', instanceId: c.instanceId, origin: state.origin, browser: 'external-chrome-dev', sourceSha: c.sourceSha };
  } catch (error) { await stop(c); throw error; }
}
export function install(source, root, chrome, nativeDir) {
  if (existsSync(root)) throw new Error('Installation target already exists; refusing to overwrite');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22+ is required');
  if (run('git', ['status', '--porcelain'], { cwd: source })) throw new Error('Source worktree must be clean');
  const sourceSha = run('git', ['rev-parse', 'HEAD'], { cwd: source });
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error('Invalid source SHA');
  const instanceId = sha256(resolve(root, 'data').replaceAll('\\', '/').toLowerCase()).slice(0, 16);
  const host = `com.charterion.pcp_trial_${instanceId}`;
  if (registryValue(host) !== undefined) throw new Error('Native Host identity already registered; refusing to overwrite');
  const extensionManifest = json(join(source, 'manifest.json'));
  const extensionId = [...sha256(Buffer.from(extensionManifest.key, 'base64')).slice(0, 32)].map(n => String.fromCharCode(97 + parseInt(n, 16))).join('');
  for (const path of ['dist/background.js', 'dist-control/gamd.cjs', 'dist-control/gamctl.cjs', 'dist-control/gam.cjs', 'dist-control/dashboard/index.html']) if (!existsSync(join(source, path))) throw new Error(`Build missing: ${path}`);
  if (!existsSync(join(nativeDir, 'GamNativeHost.exe')) || !existsSync(chrome)) throw new Error('Native Host or Chrome is missing');
  run(process.execPath, [join(source, 'scripts/check-dist-fingerprint.mjs')], { cwd: source });
  const app = join(root, 'versions', sourceSha);
  mkdirSync(app, { recursive: true }); for (const dir of ['data', 'chrome-profile']) mkdirSync(join(root, dir));
  for (const dir of ['dist', 'dist-control']) cpSync(join(source, dir), join(app, dir), { recursive: true });
  cpSync(nativeDir, join(app, 'native-host'), { recursive: true });
  writeJson(join(app, 'manifest.json'), extensionManifest); cpSync(script, join(app, 'pcp-trial.mjs'));
  const originalHost = json(join(source, 'shared/native-rpc-protocol.json')).host;
  const background = join(app, 'dist/background.js'), original = readFileSync(background, 'utf8');
  if (!original.includes(originalHost)) throw new Error('Native Host build binding not found');
  writeFileSync(background, original.replaceAll(originalHost, host));
  const nativeConfig = { pipeName: `\\\\.\\pipe\\charterion-${instanceId}`, instanceId, browserTokenPath: join(root, 'data/browser.token'), allowedOrigin: `chrome-extension://${extensionId}/` };
  writeJson(join(app, 'native-host/gam-native-host.json'), nativeConfig);
  const registration = join(app, 'native-host', host + '.json');
  writeJson(registration, { name: host, description: 'Isolated Charterion-PCP trial', path: join(app, 'native-host/GamNativeHost.exe'), type: 'stdio', allowed_origins: [nativeConfig.allowedOrigin] });
  const files = Object.fromEntries(filesUnder(app).map(path => [relative(app, path), sha256(readFileSync(path))]));
  writeJson(join(app, 'release.json'), { sourceSha, instanceId, host, extensionId, originalHost, sourceBackgroundSha256: sha256(Buffer.from(original)), files });
  writeJson(join(root, 'trial.json'), { root: realpathSync(root), sourceSha, instanceId, host, extensionId, node: process.execPath, chrome,
    nodeSha256: sha256(readFileSync(process.execPath)), chromeSha256: sha256(readFileSync(chrome)), installedAt: Date.now() });
  for (const [name, command] of [['PCP-Start', 'start'], ['PCP-Kernel-Start', 'start'], ['PCP-ChromeDev', 'chrome-dev'], ['PCP-Stop', 'stop'], ['PCP-Diagnose', 'doctor'], ['PCP-Control', 'ctl']]) {
    writeFileSync(join(root, name + '.cmd'), `@echo off\r\n"${process.execPath}" "%~dp0versions\\${sourceSha}\\pcp-trial.mjs" ${command} --root "%~dp0." %*\r\nset "PCP_EXIT=%ERRORLEVEL%"\r\n${command === 'doctor' ? 'pause\r\n' : 'if not "%PCP_EXIT%"=="0" pause\r\n'}exit /b %PCP_EXIT%\r\n`, 'utf8');
  }
  // Register last, after all files are validated. Never invoke the legacy overwriting installer.
  verifyFiles(app, files);
  run('reg.exe', ['add', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${host}`, '/ve', '/t', 'REG_SZ', '/d', registration]);
  return { status: 'installed-stopped', root, sourceSha, instanceId, host, extensionId };
}
async function main(argv) {
  if (process.platform !== 'win32') throw new Error('PCP trial supports Windows only');
  const command = argv.shift(); const take = name => { const i = argv.indexOf(name); if (i < 0) return undefined; const value = argv[i + 1]; if (!value) throw new Error(`${name} requires a value`); argv.splice(i, 2); return value; };
  const rootArg = take('--root'); if (!rootArg) throw new Error('--root is required'); const root = resolve(rootArg);
  if (command === 'install') {
    const chrome = take('--chrome'), nativeDir = take('--native-dir');
    if (!chrome || !nativeDir || argv.length) throw new Error('install requires --chrome and --native-dir');
    return install(dirname(dirname(script)), root, resolve(chrome), resolve(nativeDir));
  }
  const c = configAt(root);
  if (command === 'ctl') { verify(c); const result = spawnSync(c.node, [join(c.app, 'dist-control/gamctl.cjs'), ...argv], { env: environment(c), stdio: 'inherit', windowsHide: true }); process.exitCode = result.status ?? 1; return; }
  if (command === 'stop') return stop(c);
  if (command === 'start') {
    if (argv.length) throw new Error('start is Kernel-only; browser flags are not accepted');
    return start(c);
  }
  if (command === 'chrome-dev') {
    if (argv.length) throw new Error('chrome-dev does not accept arguments');
    const browser = join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google/Chrome Dev/Application/chrome.exe');
    if (!existsSync(browser)) throw new Error('Chrome Dev is not installed');
    const result = await start(c);
    ps('Start-Process -FilePath $env:CH_PCP_DEV -ArgumentList @("--profile-directory=Default","--restore-last-session") -WindowStyle Normal', { CH_PCP_DEV: browser });
    return { ...result, browser: 'existing-chrome-dev-default-profile' };
  }
  if (command === 'doctor') {
    const checks = {}; try { verify(c); checks.integrity = 'PASS'; } catch (error) { checks.integrity = error.message; }
    try { checks.kernel = rpc(c, 'health').instanceId === c.instanceId ? 'ready' : 'FOREIGN'; } catch { checks.kernel = 'not-running'; }
    const state = stateAt(c); checks.browser = ownedProcess(processById(state.chrome?.ProcessId), state.chrome, c.chrome, `--user-data-dir=${c.profile}`) ? 'running' : 'not-running';
    if (state.browserMode === 'external-chrome-dev') {
      checks.browser = 'external-chrome-dev (not owned by stop)';
      try { checks.browserRuntime = rpc(c, 'control.snapshot').browserRuntime.map(({ profileId, authStatus, pageHealth, observedAt }) => ({ profileId, authStatus, pageHealth, observedAt })); } catch { checks.browserRuntime = 'unavailable'; }
    }
    if (checks.integrity !== 'PASS' || checks.kernel === 'FOREIGN') process.exitCode = 1;
    return { sourceSha: c.sourceSha, instanceId: c.instanceId, host: c.host, root: c.root, checks, logs: c.logs, origin: state.origin ?? null };
  }
  throw new Error('Use install, start (Kernel only), chrome-dev, stop, doctor or ctl');
}
if (process.argv[1] && resolve(process.argv[1]) === script) main(process.argv.slice(2)).then(result => { if (result) console.log(JSON.stringify(result, null, 2)); }).catch(error => { console.error(error.message); process.exitCode = 1; });
