import { mkdir, rm, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = 'dist-control';
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'warning',
};

await Promise.all([
  build({ ...common, entryPoints: ['control/src/gamd.ts'], outfile: `${outdir}/gamd.cjs` }),
  build({ ...common, entryPoints: ['control/src/gamctl.ts'], outfile: `${outdir}/gamctl.cjs` }),
  build({ ...common, entryPoints: ['control/src/gam.ts'], outfile: `${outdir}/gam.cjs` }),
  build({ entryPoints: ['dashboard/main.ts'], outfile: `${outdir}/dashboard/radar.js`, bundle: true, platform: 'browser', target: 'chrome114', format: 'iife' }),
]);
await Promise.all(['index.html', 'radar.css'].map(name => copyFile(`dashboard/${name}`, `${outdir}/dashboard/${name}`)));

console.log('Built gamd, gamctl, and GAM launcher in dist-control/.');
