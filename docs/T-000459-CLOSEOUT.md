# T-000459 release candidate closeout — blocked

Source checks passed; transport acceptance failed. NOT_SOURCE_READY,
NOT_PUBLISHED, NOT_DEPLOYED, NOT_REGISTERED. No candidate commit SHA or PR URL
exists. [PR #13](https://github.com/Su9moon/Charterion/pull/13) remains the
separate rename Draft at `0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659`.
[PCP #36](https://github.com/Su9moon/personal-ai-control-plane/issues/36)
was read again on 2026-10-30; its latest single Developer rule governs this work.
Raw authority metadata is in `reports/T-000459/authorities.json`.

There are two explicitly different source contexts:

* Registered input HEAD `26fab27ef6af399f2d07cfb3815b123a9692db99`:
  reviewed T-000458 delta retained, hardened binding constraints and browser
  authorization tests. It has a side panel, **no standalone Radar**. Do not deploy
  this older context over PR #13.
* PR #13 pinned source reconstructed inside `.build-cache/T-000459-pr13-base`
  and copied to `.build-cache/T-000459-pr13-candidate`, without Git branch,
  index or commit operations. Every reconstructed text file was checked against
  the Git blob SHA in `reports/T-000459/pr13-tree.json`. Binary review screenshots
  were not downloaded; source builds do not consume them. The mail-format patch
  `reports/T-000459/pr13-candidate.patch` is the portable deliverable for this
  context. It preserves all unrelated PCP/rebrand code. The cache is disposable;
  the patch, manifest and checksums are retained repository artifacts.

The prior diff and exact file inventory are `prior-tracked.diff` and
`prior-files.txt` under that report directory. `candidate-files.json` enumerates
each pinned-source change with old Git blob and new SHA-256. `registered-files.json`
enumerates the retained older-context source delta. README/manifest/package
changes only synchronize 0.5.1 metadata. No independent CB source/runtime was
changed. No developer was added, dispatched or registered.

The pinned patch fixes standalone Radar projection, validated snapshot parsing,
expandable hierarchy, stable expansion on refresh, project/slot/lead identity
display, filtering, ungrouped project preservation and safe text rendering.
Group leads remain binding metadata with browser NOT_VERIFIED, never a fabricated
online AgentSlot. Existing browser-observation counts remain independent.

PR #13 already owns V28 (fleet) and V29 (conversation bootstrap), so its group
migration is **V30**, not the prior candidate's V28. It preserves those tables
and bindings. SQLite and application checks prevent lead/member rebinding and
duplicate conversations/identities. Admin upsert/list/get remain on the admin
CLI/RPC path. They are deliberately absent from the browser native allowlist;
browser consumers read group projections through authenticated snapshots. Native
generated-contract/routing checks pass (29 methods in registered input, 30 in
pinned PR #13 context). No native binary build or Windows host execution claimed.

Validation commands, working directories, exit codes, counts and log paths are
in `reports/T-000459/checks.json`. Linux command-local PATH selected Node
v22.23.4 / npm 10.9.9; exact executable paths are in `logs/runtime.txt`.
Registered context: 9 focused tests; both typechecks and both builds passed.
Pinned context: 6 migration, 4 group/admin/binding/restart and 2 static
panel/Radar tests passed; both typechecks and extension/control/Radar builds
passed. These are source tests, not browser E2E or full-suite acceptance.

An initial added binding test expected a SQL `rebind` error, but the application
correctly rejected it earlier with the existing durable-conversation `rollover`
guard. The assertion now accepts either protective rejection; it was rerun and
passed. The original failure log is retained as `logs/registered-focused.txt`.
The first patch replay also failed its checksum assertion because Git skipped
paths when invoked from a nested directory. Replay now uses an explicit
`--directory` from the repository root; all changed-file hashes matched on rerun.
The final older-context test command explicitly excludes `.build-cache` so its
counts cannot accidentally include the isolated candidate's tests.

Four unresolved cases in `control/tests/ipc.test.ts`, describe `named-pipe transport`:

1. `survives clients that disconnect after sending a request`
2. `rejects malformed request envelopes before routing`
3. `round-trips one RPC request over the daemon transport`
4. `rejects a response whose id does not match the request`

All four failed on real `server.listen` with EPERM before transport assertions.
`scripts/t000459-socket-probe.mjs`, which imports no Hive code, independently
gets EPERM for both Unix sockets and loopback TCP. This establishes sandbox
listen denial, **not** a host transport pass or proof that no transport bug exists.
No test was skipped/mocked to claim a pass. Full suite, loopback HTTP acceptance,
native binary smoke, browser E2E and Windows registration remain unverified.

Publication is blocked by the execution envelope explicitly forbidding branch
creation, add/commit/push/PR operations and assigning publication to the bridge.
Authentication was not probed or changed; this is not an auth-failure claim.
The patch mail header uses a null commit marker because no commit exists.
Its parent is the exact PR #13 SHA above. Checksums are in `SHA256SUMS`.
There is no download URL to substitute for a published candidate.

## Windows source verification and ONLY the four pending tests

Not executed here. Use a separate, approved Hive source copy already at the exact
PR #13 pin, supplied by the bridge/operator; preserve existing checkouts and WIP.
Copy the actual patch and its recorded checksum from the task artifact. This does
not install, start or register a runtime:

```powershell
$ErrorActionPreference = 'Stop'
$Source = Read-Host 'Absolute isolated Hive source path at PR13 HEAD'
$Patch = Read-Host 'Absolute local path to pr13-candidate.patch'
$ExpectedHash = Read-Host 'SHA256 from task SHA256SUMS'
if ((Get-FileHash -LiteralPath $Patch -Algorithm SHA256).Hash -ne $ExpectedHash) { throw 'Patch hash mismatch' }
if ((git -C $Source rev-parse HEAD).Trim() -ne '0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659') { throw 'Wrong baseline' }
if (git -C $Source status --porcelain) { throw 'Use a clean isolated source copy' }
git -C $Source apply --check -- $Patch
if ($LASTEXITCODE) { throw 'Patch does not apply' }
git -C $Source apply -- $Patch
if ($LASTEXITCODE) { throw 'Patch application failed' }
Set-Location -LiteralPath $Source
node --version
npm --version
npm ci
if ($LASTEXITCODE) { throw 'Dependency installation failed' }
# Exactly four transport cases, no broad suite and no runtime installation:
npm test -- control/tests/ipc.test.ts -t '^named-pipe transport'
if ($LASTEXITCODE) { throw 'Pending transport acceptance FAILED; do not upgrade' }
```

Capture the terminal output, source/patch hashes, OS/Node/npm versions and the
four names with PASS before closing transport acceptance. Other IPC cases are
excluded by this exact describe filter; exclusions are not passes.

## Host upgrade gates and rollback

This is a source-reviewed procedure, **not a verified Windows upgrade receipt**.
Read-only preflight uses the actual installed entry point:

```powershell
$Install = 'F:\0 codex\Hive-PCP-Dev-Trial-001'
$Ctl = Join-Path $Install 'PCP-Control.cmd'
Get-Item -LiteralPath $Ctl
Get-Content -LiteralPath (Join-Path $Install 'trial.json')
& $Ctl health
if ($LASTEXITCODE) { throw 'Installed Kernel unavailable' }
& $Ctl project.list --admin
& $Ctl agent.list --admin
```

Expected prior inventory from PCP #36: instance `b7c82d2e8c4c1930`, prior installed
SHA `0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659`. These are authoritative expected
values, not observations made by this task. Compare real host readbacks. Do not
use the old withdrawn joint-ProjectCell script.

Upgrade must wait for a bridge-reviewed candidate source commit, four transport
passes and host release packaging/native validation. The pinned installer
`scripts/pcp-trial.mjs install` refuses an existing installation root; it is NOT
an in-place updater. Do not bypass it by replacing bundles or editing release
hashes/trial.json by hand. No safe in-place update command has been verified in
this sandbox, so none is fabricated here.

For an authorized host upgrade of this **existing new Dev Trial only**, the
operator must use the approved host lifecycle/package workflow: verify PID,
instance, external Chrome Dev mode and current pin; stop only that Kernel;
take a consistent stopped backup of its entire data directory (including any
WAL/SHM), trial/release metadata, launchers and registration targets; record
SHA-256 hashes. Retain the prior version directory. Stage the reviewed new
version with its generated release hashes and native manifest; preserve the
same home/instance, extension key/ID, tokens and Native Host identity. Switch
using the trusted package workflow, then start only that same Kernel. Never
run the legacy installer, import an old Trial DB, replace an old Trial, change
Chrome Dev Default, launch a new profile, or alter CB Blue/Green.

Before binding, `PCP-Control.cmd health` must report that same instance and the
host inventory must show the reviewed new commit and manifest version 0.5.1.
Open Radar from the existing extension on the existing Chrome Dev profile; verify
the group UI and source pin. Preserve separate evidence for browser delivery.

On upgrade failure, stop only the candidate Kernel; restore the **complete
stopped pre-upgrade data snapshot plus prior package/metadata/launchers and
registration targets together**, and start that prior pin. Do not open a V30
database with a V29 binary or copy only global.db from a live instance. Confirm
health, original instance and original inventory after rollback. Retain failed
candidate evidence. No rollback or host changes were executed by this task.

## Registration after verified upgrade

Use this only after the gates above. CB's true Windows code root is UNKNOWN
here; obtain it from the host Green registry and verify its remote/HEAD read-only.
The two roots must be distinct real checkouts. Both technical roles are
`developer`; the group lead is `chief_engineer`, never a third ProjectCell.
The following function uses the actual installed PCP wrapper (which selects its
existing home/instance), not a guessed default GAM_HOME:

```powershell
$ErrorActionPreference = 'Stop'
$Install = 'F:\0 codex\Hive-PCP-Dev-Trial-001'
$Ctl = Join-Path $Install 'PCP-Control.cmd'
$Trial = Get-Content -Raw -LiteralPath (Join-Path $Install 'trial.json') | ConvertFrom-Json
$ApprovedPin = Read-Host 'Reviewed installed candidate SHA from bridge'
if ($ApprovedPin -notmatch '^[0-9a-f]{40}$' -or $ApprovedPin -eq '0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659') { throw 'Candidate pin required' }
if ($Trial.instanceId -ne 'b7c82d2e8c4c1930' -or $Trial.sourceSha -ne $ApprovedPin) { throw 'Installed identity/pin mismatch' }
$Manifest = Get-Content -Raw -LiteralPath (Join-Path $Install "versions\$ApprovedPin\manifest.json") | ConvertFrom-Json
if ($Manifest.version -ne '0.5.1') { throw 'Wrong runtime version' }
function Invoke-HiveRpc([string]$Method, [hashtable]$Params = @{}) {
  $raw = ($Params | ConvertTo-Json -Depth 10 -Compress) | & $Ctl $Method --admin --stdin
  if ($LASTEXITCODE) { throw "RPC failed: $Method" }
  $reply = ($raw -join "`n") | ConvertFrom-Json
  if (-not $reply.ok) { throw "RPC rejected: $Method" }
  return $reply.result
}
if ((Invoke-HiveRpc 'health').instanceId -ne $Trial.instanceId) { throw 'Wrong Kernel' }
$HiveRoot = (Get-Item -LiteralPath 'F:\0 codex\Hive-PCP').FullName
$CbRoot = (Get-Item -LiteralPath (Read-Host 'CB real Windows root verified against Green registry')).FullName
if ($HiveRoot -eq $CbRoot) { throw 'Independent roots required' }
foreach ($root in @($HiveRoot, $CbRoot)) {
  $top = git -C $root rev-parse --show-toplevel
  if ($LASTEXITCODE -or (($top -replace '/', '\').TrimEnd('\') -ne $root.TrimEnd('\'))) { throw 'Root is not checkout top level' }
  git -C $root remote -v
  git -C $root rev-parse HEAD
  git -C $root status --short
}
function Ensure-Developer([string]$Name, [string]$Root, [string]$Conversation) {
  $matches = @(Invoke-HiveRpc 'project.list' | Where-Object { ($_.rootPath -replace '/', '\').TrimEnd('\') -eq $Root.TrimEnd('\') })
  if ($matches.Count -gt 1) { throw 'Ambiguous project root' }
  $project = if ($matches.Count -eq 1) { $matches[0] } else { Invoke-HiveRpc 'project.create' @{ name=$Name; rootPath=$Root; minSlots=0; maxSlots=1 } }
  if ($project.status -eq 'archived') { throw 'Archived project requires review' }
  $slots = @(Invoke-HiveRpc 'agent.list' | Where-Object { $_.projectId -eq $project.id -and $_.role -eq 'developer' })
  if ($slots.Count -gt 1) { throw 'Multiple developers require explicit review' }
  $slot = if ($slots.Count -eq 1) { $slots[0] } else { Invoke-HiveRpc 'agent.create' @{ projectId=$project.id; role='developer' } }
  if ($slot.desiredState -ne 'active') { throw 'Inactive slot requires review' }
  if ($slot.conversationKey -and $slot.conversationKey -ne $Conversation) { throw 'Refusing conversation rebind' }
  if (-not $slot.conversationKey) { $slot = Invoke-HiveRpc 'agent.bind' @{ slotId=$slot.id; conversationKey=$Conversation } }
  return @{ projectId=$project.id; developerSlotId=$slot.id }
}
$hive = Ensure-Developer 'Hive' $HiveRoot 'conversation:6ae37f99-31e4-83ea-9c50-10f89657dfbe'
$cb = Ensure-Developer 'Codex Bridge' $CbRoot 'conversation:6ae37fdf-f4ac-83ea-9630-e7ad0159b595'
$group = @{
  id='cb-hive'; name='CB × Hive 联合开发'; leadIdentity='cb-hive-chief-engineer'
  leadConversationKey='conversation:6ae23bab-209c-83ea-b5d0-0bf543e64500'
  members=@($hive, $cb)
}
Invoke-HiveRpc 'project-group.upsert' $group
Invoke-HiveRpc 'project-group.upsert' $group
Invoke-HiveRpc 'project-group.get' @{ id='cb-hive' }
Invoke-HiveRpc 'control.snapshot'
```

`cb-hive` and `cb-hive-chief-engineer` above are proposed logical metadata keys,
not claims of host-issued identities. Project/AgentSlot IDs come only from real
RPC responses. Stop on any existing conflicting binding; never rebind/delete to
make this script succeed. The helper creates at most one missing Developer per
verified project; it does not implement future `+ Developer` expansion.

Record the actual two Project IDs, their independent roots, two developer Slot
IDs, canonical keys, group chief identity and snapshot; repeat get/snapshot after
a host-owned Kernel-only restart using verified launchers. Inspect standalone
Radar with one expandable logical group, two real projects and preserved keys;
inspect counts and browser online state separately. Only real post-restart host
readbacks can close registration. Future additional Developers require explicit
user action/authorization and confirmation, outside this release slice.
