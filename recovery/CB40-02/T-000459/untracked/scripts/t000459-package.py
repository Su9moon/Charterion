"""Produce an uncommitted mail-format patch against the verified PR13 text tree."""
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
base = root / '.build-cache/T-000459-pr13-base'
candidate = root / '.build-cache/T-000459-pr13-candidate'
out = root / 'reports/T-000459'
manifest = json.loads((out / 'pr13-tree.json').read_text())
entries = {e['path']: e for e in manifest['files']}
new = ['control/tests/projectGroups.test.ts', 'control/tests/projectGroupContracts.test.ts',
       'control/tests/projectGroupMigration.test.ts', 'src/projectGroupCards.ts',
       'tests/projectGroupCards.test.ts', 'tests/radarProjectGroups.test.ts', 'docs/T-000459-CLOSEOUT.md']
shutil.copyfile(root / 'docs/T-000459-CLOSEOUT.md', candidate / 'docs/T-000459-CLOSEOUT.md')
def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
for name, entry in entries.items():
    assert blob((base / name).read_bytes()) == entry['sha'], name

patches, files = [], []
for name in sorted(set(entries) | set(new)):
    before = (base / name).read_bytes() if name in entries else b''
    after = (candidate / name).read_bytes()
    if before == after:
        continue
    oldsha, newsha = blob(before) if name in entries else '0' * 40, blob(after)
    diff = ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
        fromfile='a/' + name if name in entries else '/dev/null', tofile='b/' + name))
    header = f'diff --git a/{name} b/{name}\n'
    if name not in entries:
        header += 'new file mode 100644\n'
    header += f'index {oldsha}..{newsha}' + (' 100644' if name in entries else '') + '\n'
    patches.append(header + diff)
    files.append(dict(path=name, baseline_blob=oldsha, candidate_blob=newsha,
                      sha256=hashlib.sha256(after).hexdigest()))

mail = ('From ' + '0' * 40 + ' Mon Sep 17 00:00:00 2001\n'
        'From: Hive candidate <uncommitted@localhost>\n'
        'Date: Fri, 30 Oct 2026 00:00:00 +0000\n'
        'Subject: [PATCH] Persist rootless joint groups and render them in standalone Radar\n\n'
        'UNCOMMITTED CANDIDATE. Null marker is not a commit SHA. Publication belongs to the bridge.\n'
        'Base-commit: 0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659\n'
        'V30 preserves PCP V28/V29. Four sandbox socket acceptance cases remain failed.\n\n---\n')
(out / 'pr13-candidate.patch').write_text(mail + ''.join(patches) + '-- \n2.0.0\n')
(out / 'candidate-files.json').write_text(json.dumps(files, indent=2) + '\n')
# Apply to a fresh copy of the pinned baseline, without touching Git index or branches.
replay = Path(tempfile.mkdtemp(prefix='T-000459-pr13-replay-', dir=root / '.build-cache'))
shutil.copytree(base, replay, dirs_exist_ok=True)
result = subprocess.run(['git', 'apply', '--check', '--directory=' + str(replay.relative_to(root)), str(out / 'pr13-candidate.patch')], cwd=root, capture_output=True, text=True)
assert result.returncode == 0, result.stderr
result = subprocess.run(['git', 'apply', '--directory=' + str(replay.relative_to(root)), str(out / 'pr13-candidate.patch')], cwd=root, capture_output=True, text=True)
assert result.returncode == 0, result.stderr
for f in files:
    assert hashlib.sha256((replay / f['path']).read_bytes()).hexdigest() == f['sha256'], f['path']
(out / 'logs/patch-replay.txt').write_text(f'PASS: verified {len(entries)} baseline text blobs; patch applied to exact pinned text tree; {len(files)} changed files match tested candidate SHA256.\n')
tracked = subprocess.check_output(['git', 'diff', '--name-only'], cwd=root, text=True).splitlines()
tracked += ['control/tests/projectGroups.test.ts', 'control/tests/projectGroupContracts.test.ts', 'src/projectGroupCards.ts', 'tests/projectGroupCards.test.ts']
(out / 'registered-files.json').write_text(json.dumps([dict(path=n, sha256=hashlib.sha256((root/n).read_bytes()).hexdigest()) for n in sorted(set(tracked))], indent=2) + '\n')
print((out / 'logs/patch-replay.txt').read_text())
