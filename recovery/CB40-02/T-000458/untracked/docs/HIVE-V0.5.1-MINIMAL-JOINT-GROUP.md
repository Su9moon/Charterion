# T-000458 joint group candidate — Draft, NOT SOURCE_READY

Registered source HEAD: `f4ae3d33b6845ed73f9f2abadef4bf6c55b9028e`.
Requested PR #13 baseline `0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659` is
not an object in this registered checkout. No branch operations were performed.
Minimal retained T-000457 changes were applied as a diff, then extended here.
The registered baseline has a side panel, no separate Radar application; its
control projection now renders expandable joint groups. Integration with PR #13's
separate Radar must be reviewed on the host before upgrade; this candidate does
not claim that UI has been updated on the PR branch.

Authorities read on 2026-10-30:
[PCP #35](https://github.com/Su9moon/personal-ai-control-plane/issues/35),
[PCP #36](https://github.com/Su9moon/personal-ai-control-plane/issues/36),
[Hive Draft PR #13](https://github.com/Su9moon/Charterion/pull/13).
Latest developer rule overrides older execution_coordinator wording.

V28 stores rootless project_groups and project_group_members. Admin-only
project-group.upsert/list/get are included in the generated native contract;
control.snapshot projects groups to browser consumers. Group chief_engineer is
not an AgentSlot or a third ProjectCell. Groups accept N distinct technical
projects; the current registration is exactly Hive + CB, each with one developer.
Same-project unique active role remains unchanged. No agents are eagerly created.
Rebinding lead/member identity or crossing project scope is rejected; browser
observations never follow from metadata persistence. Existing standalone cards
remain top level. Version metadata is synchronized to 0.5.1.

## Validation

Linux runtime selected per command only:

```bash
PATH=/home/jjyy/.local/opt/node-v22.23.4-linux-x64/bin:/usr/bin:/bin npm --version
# 10.9.9; node v22.23.4, Linux-native
```

The default npm was `/mnt/g/docker/nodejs/npm` and failed with the WSL1 shim.
No configuration or global PATH was changed. Typecheck initially caught an
optional-property test error and a browser-module import in a control-only test;
both were repaired. Migration replay initially failed because its test fixture
retains newer tables while resetting schema_version; V28 table/trigger creation
was made idempotent and the migration tests reran successfully.

Final commands use the PATH prefix above:

- `npm test -- control/tests/projectGroups.test.ts control/tests/databaseMigration.test.ts tests/projectGroupCards.test.ts`: 3 files, 6 tests passed. Covers rerun, restart, cross-project identity, collisions, admin authorization, snapshot and expandable cards/standalone preservation.
- `npm run check`: extension typecheck, native contract (32 methods), routing and version metadata pass.
- `npm run check:control`: pass.
- `npm run build` and `npm run build:control`: pass.
- `npm test -- control/tests tests/projectGroupCards.test.ts`: 38 files; 37 passed, 1 failed; 181 tests passed, 4 IPC tests failed (final rerun). Unix-domain socket listen is denied by this sandbox (`EPERM`); IPC acceptance cannot pass here. Do not skip/mock it to claim acceptance.

No SOURCE_READY, DEPLOYED or REGISTERED claim. No Windows changes, test data
migration, ChatCMD, commits or publication. The bridge owns subsequent commit and
publication. All candidate files remain in the registered T-000458 workspace.

## Windows host procedure (not executed)

Prerequisites: finish the full suite outside the restricted sandbox, reconcile
this candidate with Draft PR #13, review Radar there, and obtain an approved
source pin from the bridge. Do not install this unaccepted candidate. Use the
existing Windows host and Chrome Dev Default/profile. Never edit CB through its
read-only mounted workspace. No third joint source folder.

Read-only verification first (do not guess the CB root):

```powershell
$HiveRoot = 'F:\0 codex\Hive-PCP'
$CbRoot = Read-Host 'Exact existing CB Green Windows checkout path'
Get-Item -LiteralPath $HiveRoot, $CbRoot | Select-Object FullName, Attributes
 git -C $HiveRoot rev-parse --show-toplevel
 git -C $CbRoot rev-parse --show-toplevel
 git -C $CbRoot remote -v
 git -C $CbRoot rev-parse HEAD
 git -C $CbRoot status --short
```

Stop until the operator verifies the exact CB root and remote against the Green
registry. Do not infer it from WSL paths or substitute HiveRoot. Preserve both
checkouts and all existing changes. Have the host's existing upgrade workflow
supply the reviewed pin in HiveRoot; no pull/reset/checkout command is prescribed.

```powershell
Set-Location -LiteralPath $HiveRoot
$ExpectedPin = Read-Host 'Reviewed bridge source SHA'
if ((git rev-parse HEAD).Trim() -ne $ExpectedPin) { throw 'Source pin mismatch' }
node --version; npm --version
npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' }
npm run check; if ($LASTEXITCODE) { throw 'check failed' }
npm run check:control; if ($LASTEXITCODE) { throw 'control typecheck failed' }
npm test -- control/tests tests/projectGroupCards.test.ts
if ($LASTEXITCODE) { throw 'acceptance failed' }
npm run build; if ($LASTEXITCODE) { throw 'extension build failed' }
npm run build:control; if ($LASTEXITCODE) { throw 'Kernel build failed' }
npm run publish:native; if ($LASTEXITCODE) { throw 'native build failed' }
```

Host operator: identify the existing pinned Hive Kernel's exact home, process and
Native Host registration via the existing deployment inventory. Back up that
home/database while the approved Kernel is stopped using the existing host
lifecycle (this CLI has no stop command). Update only that approved pin, then
restart that same instance and reload the existing extension from its approved
pinned directory. Preserve extension key, profile, home and instance identity;
verify `gam.cjs doctor --json` and health before binding. Do not run a default
setup installer that might select a different home or profile. Blue/Green and
other running instances remain untouched.

For the verified instance only, set its existing home in this PowerShell session:

```powershell
$env:GAM_HOME = Read-Host 'Verified existing Hive Kernel home'
function Invoke-HiveRpc([string]$Method, [hashtable]$Params = @{}) {
  $json = ConvertTo-Json -InputObject $Params -Depth 10 -Compress
  $raw = $json | node .\dist-control\gamctl.cjs $Method --admin --stdin
  if ($LASTEXITCODE) { throw "RPC failed: $Method" }
  $reply = ($raw -join "`n") | ConvertFrom-Json
  if (-not $reply.ok) { throw "RPC rejected: $Method" }
  return $reply.result
}
$projects = @(Invoke-HiveRpc 'project.list')
$agents = @(Invoke-HiveRpc 'agent.list')
$projects | Select-Object id, name, rootPath
$agents | Select-Object id, projectId, role, conversationKey
```

Reuse exact matching roots and developer slots. If a root has multiple matches,
or a developer is already bound elsewhere, stop; do not overwrite or reconstruct.
Only when absent, create one ProjectCell and one developer per verified root:

```powershell
# Run each creation only after checking that the corresponding record is absent.
# $hive = Invoke-HiveRpc 'project.create' @{ name='Hive'; rootPath=$HiveRoot; minSlots=0 }
# $cb = Invoke-HiveRpc 'project.create' @{ name='CB'; rootPath=$CbRoot; minSlots=0 }
# $hiveDev = Invoke-HiveRpc 'agent.create' @{ projectId=$hive.id; role='developer' }
# $cbDev = Invoke-HiveRpc 'agent.create' @{ projectId=$cb.id; role='developer' }
$HiveProjectId = Read-Host 'Verified Hive ProjectCell ID'
$CbProjectId = Read-Host 'Verified CB ProjectCell ID'
$HiveDeveloperId = Read-Host 'Verified Hive developer slot ID'
$CbDeveloperId = Read-Host 'Verified CB developer slot ID'
# Use the three user-approved canonical conversation keys privately; do not log tokens.
$HiveConversation = Read-Host 'Approved Hive developer conversation key'
$CbConversation = Read-Host 'Approved CB developer conversation key'
$ChiefConversation = Read-Host 'Approved group chief_engineer conversation key'
Invoke-HiveRpc 'agent.bind' @{ slotId=$HiveDeveloperId; conversationKey=$HiveConversation }
Invoke-HiveRpc 'agent.bind' @{ slotId=$CbDeveloperId; conversationKey=$CbConversation }
Invoke-HiveRpc 'project-group.upsert' @{
  id='cb-hive'; name='CB × Hive 联合开发'; leadIdentity='cb-hive-chief-engineer'
  leadConversationKey=$ChiefConversation
  members=@(@{projectId=$HiveProjectId;developerSlotId=$HiveDeveloperId},
            @{projectId=$CbProjectId;developerSlotId=$CbDeveloperId})
}
Invoke-HiveRpc 'project-group.get' @{ id='cb-hive' }
Invoke-HiveRpc 'control.snapshot'
```

Repeat upsert unchanged to verify idempotence; restart only the approved Kernel
through the host lifecycle, then repeat get/snapshot. Confirm one group, two
real ProjectCells, two developer slots and one group chief. Observe browser
statuses separately on the existing Chrome profile. RPC persistence proves
metadata binding, not online delivery. Until these host readbacks exist:
NOT_REGISTERED; exact CB root UNKNOWN and runtime pin UNKNOWN.
