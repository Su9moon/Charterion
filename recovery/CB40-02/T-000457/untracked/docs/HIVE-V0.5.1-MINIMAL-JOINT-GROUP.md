# Minimal joint group patch (T-000457)

Status: UNVERIFIED SOURCE PATCH. Neither SOURCE_READY nor DEPLOYED.

Registered checkout: Su9moon/Charterion, HEAD c60817276db782c5f36e518fce9739dae10a7e2d.
Requested baseline: 0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659.
No branch changes, commits, PRs, host writes or live registrations were performed.

Migration V28 adds rootless project_groups and project_group_members. Admin RPCs:
project-group.upsert (id, name, leadIdentity, leadConversationKey, members),
project-group.list and project-group.get (id). control.snapshot.projectGroups
projects the durable lead and two developer slot references. Browser runtime is
NOT_VERIFIED. Browser Default is unchanged. The chief is a group identity,
not a project AgentSlot or global PCP controller.

Remaining implementation: this repository has no Radar UI; consumers must render
projectGroups as expandable top-level nodes and resolve members from projects and
agents. Group browser delivery is not implemented. Native RPC exposure and release
version metadata have not been completed. Do not deploy this partial patch.

## Windows host completion workflow

After engineering acceptance, use only the isolated, user-approved Windows host
upgrade checkout/runtime; do not touch Trial, Blue/Green, production or main.
Run `npm ci`, `npm run check`, `npm run check:control`, and
`npm test -- control/tests/projectGroups.test.ts control/tests/controlPlane.test.ts`.
Then build with `npm run build:control`. Use the existing host upgrade procedure
and restart the approved Kernel only after its database backup. Migration is
applied when that Kernel opens its database. This is not authorization to select
or modify a production runtime.

Before registration, run read-only PowerShell checks:

```powershell
$HiveRoot = 'F:\0 codex\Hive-PCP'
$CbRoot = Read-Host 'Actual CB checkout path'
Get-Item -LiteralPath $HiveRoot, $CbRoot
 git -C $HiveRoot rev-parse --show-toplevel
 git -C $CbRoot rev-parse --show-toplevel
 git -C $CbRoot remote -v
```

Stop if CB identity or either root is unverified. Never infer CB root from WSL.
Use `node dist-control/gamctl.cjs <method> --admin --params-file <file>`.
Read `project.list` and `agent.list` first. Reuse the two matching ProjectCells.
If absent, `project.create` takes name and the verified rootPath; do not create a
group ProjectCell. Reuse/create a `developer` slot per project via `agent.create`
(projectId, role), then `agent.bind` (slotId, conversationKey):

* Hive: conversation:6ae37f99-31e4-83ea-9c50-10f89657dfbe
* CB: conversation:6ae37fdf-f4ac-83ea-9630-e7ad0159b595 (developer, never execution_coordinator)

Submit project-group.upsert with id `cb-hive`, name `CB × Hive 联合开发`,
leadIdentity `cb-hive-chief-engineer`, leadConversationKey
`conversation:6ae23bab-209c-83ea-b5d0-0bf543e64500`, and exactly two members
containing the returned projectId and developerSlotId values. Read back with
project-group.get, control.snapshot, restart the approved Kernel, then read again.
Metadata readback proves persistence only; it does not prove browser delivery.
This represents PCP #36's 1 group / 2 projects / 3 conversations.
