import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

const repo = process.cwd();
const packageVersion = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
const home = mkdtempSync(join(tmpdir(), 'gam-native-smoke-'));
const pipe = process.platform === 'win32' ? `\\\\.\\pipe\\gam-native-${randomUUID()}` : join(home, 'gamd.sock');
const env = { ...process.env, GAM_HOME: home, GAM_PIPE_NAME: pipe };
const daemon = spawn(process.execPath, [join(repo, 'dist-control', 'gamd.cjs')], {
  cwd: repo, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
});
let daemonError = '';
daemon.stderr.setEncoding('utf8');
daemon.stderr.on('data', (chunk) => { daemonError += chunk; });
// Configure only a disposable copy; the published host may already be in use.
const sourceHostDir = resolve(process.env.GAM_NATIVE_HOST_DIR || join(repo, 'dist-native-host'));
const hostDir = join(home, 'native-host');
const hostExe = join(hostDir, 'GamNativeHost.exe');
const hostConfig = join(hostDir, 'gam-native-host.json');
const origin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';
function cli(method, params = {}) {
  const result = spawnSync(process.execPath, [join(repo, 'dist-control', 'gamctl.cjs'), method, '--admin', '--stdin'], {
    cwd: repo, env, input: JSON.stringify(params), encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
  if (result.error) throw result.error;
  const response = JSON.parse(result.stdout.trim());
  if (!response.ok) throw new Error(`${method} failed: ${response.error?.message}`);
  return response.result;
}

async function waitReady() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { return cli('health'); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error(`gamd did not become ready: ${daemonError}`);
}

function frame(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}
function invokeNative(request) {
  const result = spawnSync(hostExe, [origin, '--parent-window=0'], {
    cwd: hostDir,
    input: frame(request),
    encoding: null,
    windowsHide: true,
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Native host failed: ${Buffer.from(result.stderr).toString('utf8')}`);
  const stdout = Buffer.from(result.stdout);
  if (stdout.length < 4) throw new Error('Native host returned an incomplete frame');
  const length = stdout.readUInt32LE(0);
  if (stdout.length !== length + 4) throw new Error('Native host response frame length is invalid');
  return JSON.parse(stdout.subarray(4).toString('utf8'));
}

try {
  mkdirSync(hostDir);
  cpSync(sourceHostDir, hostDir, { recursive: true });
  const health = await waitReady();
  if (!/^[0-9a-f]{16}$/.test(health.instanceId ?? '')) throw new Error('gamd health did not expose a valid instanceId');
  const project = cli('project.create', {
    name: 'Native Host Project', rootPath: join(home, 'project'), isolationTier: 'c1-container', minSlots: 0, maxSlots: 1,
  });
  const browserTokenPath = join(home, 'browser.token');
  if (readFileSync(browserTokenPath, 'utf8').trim().length < 32) throw new Error('browser.token was not created');
  writeFileSync(hostConfig, JSON.stringify({ pipeName: pipe, instanceId: health.instanceId, browserTokenPath, allowedOrigin: origin }, null, 2));
  const listed = invokeNative({ id: 'list', method: 'project.list', params: {} });
  if (!listed.ok || !Array.isArray(listed.result) || !listed.result.some((item) => item.id === project.id)) {
    throw new Error('Native host did not return the expected project');
  }
  const reported = invokeNative({ id: 'browser-report', method: 'browser.report', params: {
    profileId: 'gam-default', authStatus: 'authenticated', pageHealth: 'ready', openTabs: 2, extensionVersion: packageVersion, observedAt: Date.now(),
  }});
  if (!reported.ok || reported.result?.authStatus !== 'authenticated') throw new Error('Native host did not accept browser runtime report');
  const browserStatus = invokeNative({ id: 'browser-status', method: 'browser.status', params: {} });
  if (!browserStatus.ok || !Array.isArray(browserStatus.result) || browserStatus.result[0]?.authStatus !== 'authenticated') {
    throw new Error('Native host did not return browser runtime status');
  }
  cli('project.fleet-control-set', { projectId: project.id, mode: 'elastic', lifecycleLocked: true, expectedRevision: 0, actor: 'native-smoke', reason: 'manual lifecycle test' });
  const slot = cli('agent.spawn', { projectId: project.id, role: 'ROLE_NATIVE' });
  const address = { slotId: slot.id, profileId: 'gam-default', browserState: 'open', tabId: 77 };
  const canonical = { ...address, conversationKey: 'conversation:native-worker' };
  const unapproved = invokeNative({ id: 'unapproved', method: 'agent.browser-report', params: canonical });
  if (unapproved.ok || !unapproved.error?.message?.includes('explicit bootstrap authorization')) throw new Error('Native host allowed an unauthorized first binding');
  const opened = invokeNative({ id: 'open', method: 'agent.browser-report', params: address });
  if (!opened.ok) throw new Error('Native host did not report a provisional tab');
  const runtime = invokeNative({ id: 'runtime', method: 'agent.runtime-report', params: {
    slotId: slot.id, profileId: 'gam-default', tabId: 77, contentEpoch: 'native-epoch', revision: 1,
    semanticSignature: 'blank', pageStatus: 'idle', observedAt: Date.now(),
  }});
  if (!runtime.ok) throw new Error('Native host did not accept runtime identity');
  cli('agent.conversation-bootstrap-authorize', { slotId: slot.id, projectId: project.id, role: slot.role, expectedLeaseEpoch: slot.leaseEpoch,
    profileId: 'gam-default', tabId: 77, provisionalKey: 'provisional:native', actor: 'native-smoke', reason: 'authorize first canonical' });
  const planned = invokeNative({ id: 'plan', method: 'browser.operation-plan', params: {
    id: 'native-first-prompt', idempotencyKey: 'native-first-prompt', operation: 'prompt.send', slotId: slot.id, tabId: 77,
    contentEpoch: 'native-epoch', conversationKey: 'provisional:native', preconditionsHash: 'blank', plannedAt: Date.now(),
  }});
  if (!planned.ok) throw new Error('Native host did not plan bootstrap prompt');
  if (!invokeNative({ id: 'dispatch', method: 'browser.operation-dispatch', params: { id: 'native-first-prompt' } }).ok) throw new Error('Native host did not dispatch bootstrap prompt');
  const agentObserved = invokeNative({ id: 'agent-observe', method: 'agent.browser-report', params: {
    ...canonical, observedAt: Date.now(),
  }});
  if (!agentObserved.ok || agentObserved.result?.conversationGeneration !== 1) throw new Error('Native host did not accept authorized first canonical');
  const rebind = invokeNative({ id: 'rebind', method: 'agent.browser-report', params: { ...canonical, conversationKey: 'conversation:another' } });
  if (rebind.ok) throw new Error('Native host allowed automatic rebind');
  const otherProject = cli('project.create', { name: 'Other Native Project', rootPath: join(home, 'other-project'), minSlots: 0, maxSlots: 1 });
  const otherSlot = cli('agent.spawn', { projectId: otherProject.id, role: slot.role });
  const crossed = invokeNative({ id: 'cross-project', method: 'agent.browser-report', params: { ...canonical, slotId: otherSlot.id, tabId: 79 } });
  if (crossed.ok || !crossed.error?.message?.includes('another project')) throw new Error('Native host allowed cross-project binding');
  const rollover = invokeNative({ id: 'auto-rollover', method: 'agent.rollover-request', params: { slotId: slot.id, reason: 'auto', handoffText: 'not authorized', state: {} } });
  if (rollover.ok || rollover.error?.code !== 'UNAUTHORIZED') throw new Error('Native host allowed automatic rollover authorization');
  const bootstrapDenied = invokeNative({ id: 'browser-authorize', method: 'agent.conversation-bootstrap-authorize', params: {} });
  if (bootstrapDenied.ok || bootstrapDenied.error?.code !== 'FORBIDDEN') throw new Error('Native host exposed admin bootstrap authorization');
  if (!invokeNative({ id: 'close', method: 'agent.browser-report', params: { slotId: slot.id, profileId: 'gam-default', browserState: 'absent' } }).ok) throw new Error('Native host did not close tab');
  const reopened = invokeNative({ id: 'reopen', method: 'agent.browser-report', params: { ...canonical, tabId: 78 } });
  if (!reopened.ok || reopened.result?.conversationKey !== canonical.conversationKey || reopened.result?.conversationGeneration !== 1) throw new Error('Native host did not restore durable binding');
  // Synthetic aged observation makes the slot eligible for real Kernel cleanup.
  if (!invokeNative({ id: 'aged-idle', method: 'agent.runtime-report', params: { slotId: slot.id, profileId: 'gam-default', tabId: 78,
    contentEpoch: 'reopened-native-epoch', revision: 1, semanticSignature: 'idle', pageStatus: 'idle', observedAt: Date.now() - 130_000 } }).ok) throw new Error('Native host did not accept idle test evidence');
  if (!invokeNative({ id: 'fleet', method: 'fleet.reconcile', params: {} }).ok) throw new Error('Native fleet reconcile failed');
  const protectedSlot = cli('agent.list', { projectId: project.id }).find(item => item.id === slot.id);
  if (protectedSlot?.desiredState !== 'active') throw new Error('Automatic fleet bypassed lifecycle lock');
  cli('project.fleet-control-set', { projectId: project.id, lifecycleLocked: false, expectedRevision: 1, actor: 'native-smoke', reason: 'negative control: explicit unlock' });
  if (!invokeNative({ id: 'unlocked-fleet', method: 'fleet.reconcile', params: {} }).ok) throw new Error('Unlocked fleet reconcile failed');
  if (cli('agent.list', { projectId: project.id }).find(item => item.id === slot.id)?.desiredState !== 'suspended') throw new Error('Lifecycle lock test lacked an effective negative control');
  const nativeSpawnDenied = invokeNative({ id: 'agent-spawn', method: 'agent.spawn', params: { projectId: project.id, role: 'ROLE_FORBIDDEN' } });
  if (nativeSpawnDenied.ok || nativeSpawnDenied.error?.code !== 'FORBIDDEN') throw new Error('Native host allowed browser-side fleet mutation');

  const denied = invokeNative({
    id: 'write', method: 'project.status', params: { projectId: project.id, status: 'paused' },
  });
  if (denied.ok || denied.error?.code !== 'FORBIDDEN') throw new Error('Native host did not block a mutation');

  const wrongOrigin = spawnSync(hostExe, ['chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/'], {
    cwd: hostDir, input: frame({ id: 'x', method: 'health' }), encoding: null, timeout: 10_000, windowsHide: true,
  });
  if (wrongOrigin.status === 0) throw new Error('Native host accepted an unapproved origin');
  console.log(JSON.stringify({ ok: true, projectId: project.id, nativeRead: true, browserReport: true, mutationBlocked: true, originBlocked: true,
    bootstrapAuthorized: true, automaticRebindBlocked: true, crossProjectBlocked: true, automaticRolloverBlocked: true, closeReopenPreserved: true,
    lifecycleLockPreserved: true, lifecycleLockNegativeControl: true, evidenceScope: 'real .NET host and Kernel; browser observations are synthetic, not Chrome/ChatGPT E2E' }, null, 2));
} finally {
  daemon.kill();
  if (daemon.exitCode === null && daemon.signalCode === null) await new Promise((resolve) => daemon.once('exit', resolve));
  if (!home.startsWith(resolve(tmpdir()) + sep) || !home.split(sep).at(-1)?.startsWith('gam-native-smoke-')) throw new Error('Refusing cleanup outside owned smoke home');
  rmSync(home, { recursive: true, force: true });
}
