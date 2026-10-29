"""Run source-only checks; retain every result, including blocked socket tests."""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess

root = Path(__file__).resolve().parent.parent
out = root / 'reports/T-000459'
env = dict(os.environ, PATH='/home/jjyy/.local/opt/node-v22.23.4-linux-x64/bin:/usr/bin:/bin')
candidate = root / '.build-cache/T-000459-pr13-candidate'
checks = [
    ('registered-check', root, ['npm', 'run', 'check']),
    ('registered-check-control', root, ['npm', 'run', 'check:control']),
    ('registered-focused-final', root, ['npm', 'test', '--', 'control/tests/projectGroups.test.ts', 'control/tests/projectGroupContracts.test.ts', 'control/tests/databaseMigration.test.ts', 'tests/projectGroupCards.test.ts', '--exclude', '**/.build-cache/**']),
    ('registered-build', root, ['npm', 'run', 'build']),
    ('registered-build-control', root, ['npm', 'run', 'build:control']),
    ('pr13-check-final', candidate, ['npm', 'run', 'check']),
    ('pr13-check-control-final', candidate, ['npm', 'run', 'check:control']),
    ('pr13-migrations-final', candidate, ['npm', 'test', '--', 'control/tests/databaseMigration.test.ts', 'control/tests/projectGroupMigration.test.ts']),
    ('pr13-groups-final', candidate, ['npm', 'test', '--', 'control/tests/projectGroups.test.ts', 'control/tests/projectGroupContracts.test.ts']),
    ('pr13-rendering-final', candidate, ['npm', 'test', '--', 'tests/projectGroupCards.test.ts', 'tests/radarProjectGroups.test.ts']),
    ('pr13-build-final', candidate, ['npm', 'run', 'build']),
    ('pr13-build-control-final', candidate, ['npm', 'run', 'build:control']),
    ('pr13-sockets-final', candidate, ['npm', 'test', '--', 'control/tests/ipc.test.ts', '-t', '^named-pipe transport']),
]
results = []
for name, cwd, command in checks:
    log = out / 'logs' / (name + '.txt')
    with log.open('w') as stream:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=stream, stderr=subprocess.STDOUT)
    text = log.read_text()
    item = dict(name=name, cwd=str(cwd.relative_to(root)), command=shlex.join(command), exit_code=result.returncode,
                outcome='passed' if result.returncode == 0 else 'failed', log=str(log.relative_to(root)),
                counts=re.findall(r'^\s*(?:Test Files|Tests)\s+.*$', text, re.M))
    results.append(item)
    (out / 'checks.json').write_text(json.dumps(results, indent=2) + '\n')
    print(name, item['outcome'], item['counts'], flush=True)

raise SystemExit(1 if any(r['outcome'] == 'failed' for r in results) else 0)
