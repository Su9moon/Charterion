import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const errors = [];
const requireTrue = (ok, reason) => { if (!ok) errors.push(reason); };

const manifest = json('manifest.json');
const pkg = json('package.json');
const lock = json('package-lock.json');
const schema = json('docs/readme/README_SCHEMA.json');
requireTrue(manifest.name === 'Hive', 'Extension manifest must be Hive');
requireTrue(manifest.action?.default_title === '打开 Hive 侧边栏', 'Toolbar title must describe the Hive Side Panel');
requireTrue(manifest.side_panel?.default_path === 'dist/sidepanel.html', 'Side Panel entry must be preserved');
requireTrue(typeof manifest.key === 'string' && manifest.key.length > 100, 'Stable extension key missing');
requireTrue(pkg.name === 'hive' && lock.name === 'hive' && lock.packages?.['']?.name === 'hive',
  'npm identity and lock must all be hive');
requireTrue(schema.invariants?.canonical_project_name === 'Hive', 'README schema brand mismatch');

const heading = '# ' + schema.invariants?.canonical_project_title + '\n';
for (const locale of ['README.md', ...['zh-CN'].map((name) => 'README.' + name + '.md')]) {
  requireTrue(read(locale).startsWith(heading), locale + ': Hive heading missing');
}
const radar = read('dashboard/index.html');
const panel = read('src/sidepanel.html');
requireTrue(radar.includes('<title>Hive · 状态雷达 / Status Radar</title>') &&
  radar.includes('HIVE / LOCAL KERNEL'), 'Radar Hive brand missing');
requireTrue(panel.includes('<title>Hive</title>') && panel.includes('<h1>Hive</h1>'),
  'Side Panel Hive brand missing');
requireTrue(read('scripts/package-release.mjs').includes('hive-v${pkg.version}.zip'),
  'Release ZIP name must start with hive');
requireTrue(read('scripts/package-runtime.mjs').includes('hive-v${pkg.version}-windows-runtime.zip'),
  'Windows runtime ZIP name must start with hive');

for (const path of ['scripts/setup-windows.ps1', 'scripts/install-runtime-windows.ps1']) {
  const script = read(path);
  requireTrue(script.includes("'Hive.lnk'"), path + ': desktop shortcut must be Hive');
  requireTrue(script.includes("'.hive'") && script.includes("'.charterion'"),
    path + ': existing state must be preserved by compatibility fallback');
}
const native = read('native-host/scripts/install.ps1');
requireTrue(native.includes("$CharterionNativeHostName") &&
  native.includes('Hive local control-plane bridge'),
  'Native host must preserve old protocol ID while displaying Hive');
if (errors.length) {
  console.error('HIVE_BRAND_STATIC_FAIL\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exitCode = 1;
} else {
  console.log('HIVE_BRAND_STATIC_PASS');
}
