# T-000402 source readiness evidence

Status: PARTIAL_SOURCE_TESTED. This is a source report, with no side-ready or joint-pass declaration.
Verified INPUT SHA: `b4febe9a3937b56abc32ce0a687ba19b3817557c` on `feature/charterion-cb-v01-r1-20261028`;
origin `https://github.com/Su9moon/Charterion.git`, initially clean.
The bridge's pending T-000402 report commit has no assigned SHA here.
Contract: `61402b2d2e042f5b950e58bcb230901e3c58fb12`, `charterion-cb/1.0`.
All five pinned snapshot hashes were verified; snapshots and contract remain unchanged.

Fresh isolated Green-workspace checks with native Linux Node v22.13.0:
- `npx --offline vitest run control/tests/charterionCbDispatchJournal.test.ts control/tests/charterionCbDispatchRpc.test.ts control/tests/charterionCbReconciler.test.ts control/tests/charterionCbEvidence.test.ts --pool=forks --fileParallelism=false`: exit 0, 4 files / 19 tests passed (journal 6, RPC 3, reconciler 5, evidence 5).
- `npm run check:control`: exit 0.

See adjacent logs and `joint-readiness.json` for exact commands, paths and provenance.
Offline cache install succeeded with engine warnings. Initial checks could not start due to
missing Linux optional binaries. Offline repair requests returned ENOTCACHED; matching
prewarmed Linux artifacts were copied into the disposable workspace only. Both checks
were actually rerun successfully. Engine warnings remain unresolved.

Existing task receipts are the exact Git commits for T-000381, T-000385, T-000393 and
T-000395 listed in the manifest; they establish source history, not fresh test passes.
T-000385's commit message mentions four mock tests; current reconciliation coverage is five.
No unavailable historical test count is inferred or carried forward to this input SHA.

## Runtime scenarios

C01–C18 all remain NOT_RUN as canonical runtime scenarios. Focused local tests exercise
journal persistence, admin authorization, mock reconciliation and typed projection only.
Exact-byte projection is not result-package transport verification. Mock identities and
cursor tests do not prove CB dispatch/start deduplication or browser recovery. No real
MCP dispatch, authenticated host client, live events, result/handoff verification or
independent live Reviewer loop was run. Runtime version is unknown (null).
Browser-only Chrome Dev UAT is NOT_RUN. No Chrome Stable/Dev, Native Host, Blue or CI
was used, and no Green service was changed. The previously reported full suite 145/149
with IPC EPERM was not rerun and is not claimed fixed. Publication remains bridge-owned.
