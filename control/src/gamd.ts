import { ensureAdminToken, ensureBrowserToken, resolveDaemonConfig } from './config';
import { ControlDatabase } from './database';
import { ControlPlane } from './controlPlane';
import { startIpcServer } from './ipc';
import { RpcRouter } from './rpc';
import { join } from 'node:path';
import { radarPort, startRadarHttp } from './radarHttp';
import { readRadarSnapshot } from './radarSnapshot';
import { RadarControl } from './radarControl';

async function main(): Promise<void> {
  const config = resolveDaemonConfig();
  const port = radarPort(process.env.GAM_RADAR_PORT);
  const adminToken = ensureAdminToken(config);
  const browserToken = ensureBrowserToken(config);
  const database = new ControlDatabase(config.databasePath);
  const plane = new ControlPlane(database, config.gitPath);
  const radarControl = new RadarControl(plane);
  const recoveredOrganizationWorkflows = plane.reconcilePersistedOrganizationWorkflows();
  if (recoveredOrganizationWorkflows > 0) console.error(`gamd recovered organization workflows=${recoveredOrganizationWorkflows}`);
  let radar: Awaited<ReturnType<typeof startRadarHttp>> | undefined;
  try {
    if (port !== undefined) radar = await startRadarHttp({ port, assetsDir: join(__dirname, 'dashboard'), control: radarControl,
      snapshot: projectId => readRadarSnapshot(plane, config.instanceId, projectId) });
  } catch (error) { database.close(); throw error; }
  const router = new RpcRouter(plane, adminToken, browserToken, config.instanceId, () => radar?.openUrl,
    (projectId, actor) => radarControl.issue(projectId, actor));
  const server = await startIpcServer(config.pipeName, router).catch(async error => {
    await radar?.close(); database.close(); throw error;
  });

  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    void (async () => {
      await radar?.close();
      server.close(() => { database.close(); });
    })().catch(error => { console.error(error); process.exitCode = 1; });
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
  process.on('uncaughtException', (error) => {
    console.error(error);
    close();
  });
  console.error(`gamd ready instance=${config.instanceId} pipe=${config.pipeName}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
