import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { browserEndpoint, ownedProcess, verifyFiles, install } from '../scripts/pcp-trial.mjs';
const dirs=[];afterEach(()=>{while(dirs.length)rmSync(dirs.pop(),{recursive:true,force:true});});
describe('isolated PCP trial protection',()=>{
  it('accepts only the recorded loopback browser endpoint before graceful shutdown',()=>{
    expect(browserEndpoint('ws://127.0.0.1:12345/devtools/browser/abc-123',12345)).toBe('ws://127.0.0.1:12345/devtools/browser/abc-123');
    for(const url of ['ws://evil.invalid:12345/devtools/browser/abc','ws://127.0.0.1:12346/devtools/browser/abc','ws://127.0.0.1:12345/devtools/page/abc','ws://user:pass@127.0.0.1:12345/devtools/browser/abc','ws://127.0.0.1:12345/devtools/browser/abc?redirect=other'])expect(()=>browserEndpoint(url,12345)).toThrow();
    expect(()=>browserEndpoint('ws://127.0.0.1:12345/devtools/browser/abc',NaN)).toThrow();
  });
  it('refuses a modified release asset before startup',()=>{
    const root=mkdtempSync(join(tmpdir(),'pcp-trial-'));dirs.push(root);writeFileSync(join(root,'bundle'),'verified');
    const hashes={bundle:createHash('sha256').update('verified').digest('hex')};expect(()=>verifyFiles(root,hashes)).not.toThrow();
    writeFileSync(join(root,'bundle'),'tampered');expect(()=>verifyFiles(root,hashes)).toThrow('hash mismatch');
  });
  it('rejects a package manifest escaping the installed version',()=>{
    const root=mkdtempSync(join(tmpdir(),'pcp-trial-'));dirs.push(root);
    expect(()=>verifyFiles(root,{'../outside':'bad'})).toThrow('Unsafe package path');
  });
  it('refuses PID reuse, another executable, changed arguments and an unrelated profile',()=>{
    const owned={ProcessId:123,CreationDate:'original',ExecutablePath:'C:\\Chrome\\chrome.exe',CommandLine:'chrome --user-data-dir=F:\\PCP-Trial\\profile'};
    const valid=p=>ownedProcess(p,owned,owned.ExecutablePath,'--user-data-dir=F:\\PCP-Trial\\profile');
    expect(valid({...owned})).toBe(true);
    for(const edit of[{CreationDate:'reused'},{ProcessId:124},{ExecutablePath:'C:\\other.exe'},{CommandLine:'chrome --user-data-dir=C:\\original-profile'}])expect(valid({...owned,...edit})).toBe(false);
    expect(ownedProcess(owned,owned,owned.ExecutablePath,'--user-data-dir=C:\\original-profile')).toBe(false);
  });
  it('will not install over an existing data/profile root',()=>{
    const root=mkdtempSync(join(tmpdir(),'pcp-trial-'));dirs.push(root);writeFileSync(join(root,'sentinel'),'keep');
    expect(()=>install('.',root,'unused','unused')).toThrow('refusing to overwrite');
  });
});
