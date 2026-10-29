"""Run from a reviewed trusted checkout on Windows; read-only, no installation."""
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[2]
backup = pathlib.Path(r'C:\Users\jjyyz\AppData\Local\Hive\migration-backups\v29-npxwIX')
args = [sys.executable, str(root / 'tools/offline_restore/audit.py')]
for key, path in {
    'source': backup / 'old.db', 'destination': backup / 'hive.db',
    'candidate': backup / 'stage-wjtj38/hive-candidate.db',
    'live-source': pathlib.Path(r'F:\0 codex\Charterion-PCP-Trial-006\data\global.db'),
    'live-destination': pathlib.Path(r'F:\0 codex\Hive-PCP-Dev-Trial-001\data\global.db'),
    'code': root / 'control/src/database.ts',
}.items():
    args.extend(['--' + key, str(path)])
args.extend(['--sha', 'af3adf8696bff745c33abb2baa5598609ba27a4407661141919b2f820eaa20bc',
             'ac800ff5bd645a75bb109dbeefce5ccbfb463b0a7c4d6e76a088f3b1ce7e95e4',
             'c9652708e2e71ed455b74c60dca77be8e3a8c697668672122795cbd82142c9fe'])
raise SystemExit(subprocess.call(args))
