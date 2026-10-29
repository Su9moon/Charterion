"""Verify retained PR13 blobs, export a plain git-apply patch, replay and verify."""
from pathlib import Path
import hashlib,json,subprocess,shutil,tempfile
root=Path(__file__).resolve().parent
prior=root.parents[1].parent/'T-000459-workspace'
# Read-only historical source; no git repository mutations.
base=prior/'.build-cache/T-000459-pr13-base'
source=root.parents[1]/'.build-cache/T-000463-source'
if not source.exists(): source=root/'source'
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
tree=json.loads((prior/'reports/T-000459/pr13-tree.json').read_text())
missing=[]
for x in tree['files']:
 p=base/x['path']
 if not p.is_file(): missing.append(x['path']);continue
 assert blob(p.read_bytes())==x['sha'],x['path']
paths={str(p.relative_to(base)) for p in base.rglob('*') if p.is_file() and '.build-cache' not in p.relative_to(base).parts}
paths|={str(p.relative_to(source)) for p in source.rglob('*') if p.is_file() and not any(x in p.relative_to(source).parts for x in ['node_modules','dist','dist-control','.build-cache'])}
changes=[];patch=[]
oldfiles=json.loads((prior/'reports/T-000459/candidate-files.json').read_text())
for name in sorted(paths):
 a=base/name;b=source/name
 av=a.read_bytes() if a.is_file() else b'';bv=b.read_bytes() if b.is_file() else b''
 if av==bv: continue
 # git diff is read-only; --no-index does not touch the index.
 result=subprocess.run(['git','diff','--no-index','--no-renames','--',str(a) if a.is_file() else '/dev/null',str(b) if b.is_file() else '/dev/null'],capture_output=True)
 assert result.returncode==1,(name,result.stderr)
 text=result.stdout.decode().replace('a/'+str(a).lstrip('/'),'a/'+name).replace('b/'+str(b).lstrip('/'),'b/'+name)
 # Added/deleted files have an extra temporary absolute path in diff header.
 lines=text.splitlines(True);lines[0]=f'diff --git a/{name} b/{name}\n';text=''.join(lines)
 patch.append(text)
 reasons=[]
 if name in {x['path'] for x in oldfiles}: reasons.append('T-000459 candidate-files.json: '+name)
 if name in ['src/projectGroupCards.ts','control/src/database.ts','tests/radarControlsUI.test.ts','tests/radarUI.test.ts','control/tests/pcpProjectFleetControl.test.ts']: reasons.append('Windows user-reported repair reconstructed; see windows-receipt.json')
 if name.startswith(('README','docs/readme','scripts/check-hive','scripts/check-readme','tests/activeLanguages')): reasons.append('Active en/zh-CN convergence or preserved archive')
 if not reasons: reasons.append('Retained T-000459 candidate change')
 changes.append(dict(t459_sha256=next((x['sha256'] for x in oldfiles if x['path']==name),None),path=name,old_blob=blob(av) if a.is_file() else None,new_sha256=sha(bv) if b.is_file() else None,reasons=reasons))
(root/'candidate.patch').write_text(''.join(patch))
manifest=dict(parent=tree['sha'],registered_head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),patch_sha256=sha((root/'candidate.patch').read_bytes()),verified_baseline_files=len(tree['files'])-len(missing),baseline_absent=missing,files=changes)
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
replay=Path(tempfile.mkdtemp(prefix='T-000463-replay-',dir=root.parents[1]/'.build-cache'))
shutil.copytree(base,replay,dirs_exist_ok=True)
subprocess.run(['git','apply','--check','--directory='+str(replay.relative_to(root.parents[1])),str(root/'candidate.patch')],check=True,cwd=root.parents[1])
subprocess.run(['git','apply','--directory='+str(replay.relative_to(root.parents[1])),str(root/'candidate.patch')],check=True,cwd=root.parents[1])
for item in changes:
 p=replay/item['path']
 assert (sha(p.read_bytes()) if p.is_file() else None)==item['new_sha256'],item['path']
print(f'PASS baseline blob verification; {len(missing)} absent historical files; patch apply/replay {len(changes)} file hashes')
