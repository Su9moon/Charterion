# T-000490 result

Input SHA: bf13ab0c2382e31089316d46d4d0fe0c8c48ac9f (exact pinned source from evidence/T-000489-3faa28f1dd38173376fc).
Output SHA / Git publication ACK: pending bridge publication; no commit or Git metadata changes made by this task. No V0.6 acceptance claim.

Changes: permit Kernel active bound assigned slots as well as idle slots in Select Idle, while preserving fresh direct idle browser/runtime evidence and all lease fences. Compare local role and project name against Kernel authority before marking managed. Added regression coverage for wrong metadata, assigned idle selection, busy/unknown observations, duplicate conversation grouping and explicit ordinary-tab sending. Only sidebar identity production code changed; no automatic sends, slot changes, profile, DB or server changes.

## Actual acceptance results

- PASS: git diff --check.
- PASS: direct production TypeScript identity smoke (`node --experimental-strip-types reports/T-000490/identity-smoke.ts`). This does not run DOM or send integration tests, nor typecheck.
- PASS: brand, native RPC contract/routing and version metadata static subchecks, as recorded in check.txt.
- FAILED: npm run check (exit 127: tsc missing; TypeScript check NOT_RUN).
- FAILED: npm test -- tests/sidebarIdentity.test.ts tests/sidepanelSend.test.ts tests/managedTabProjection.test.ts tests/replyCorrelation.test.ts tests/attemptLedger.test.ts tests/contentReplyRevision.test.ts (exit 127: vitest missing; all Vitest cases NOT_RUN).
- FAILED: npm run build (exit 1: esbuild missing).
- BLOCKED_DNS: registry resolution failed, see environment.txt. Located usable Linux Node/npm, but no cached dependencies found. Did not repeat the inherited failed network install. These are tooling/environment failures; code correctness beyond the smoke remains unverified. No 14-test PASS claim.
- NOT_RUN: Windows Chrome Dev manual E2E.

## Windows verification remaining

Using this bridge-published output baseline with installed dependencies, run npm run check, the targeted test command above and npm run build. In the user's Windows Chrome Dev setup: confirm an active bound assigned slot with valid lease and fresh idle direct evidence is selected by Select Idle; generating/unknown tabs are excluded; mismatched local role/project metadata appears non-verified; with two tabs sharing a conversation only the lease owner appears managed. Expand ordinary tabs, explicitly select the duplicate and send one instruction; verify no send occurs from Select Idle itself, and the explicit send/reply history is attributed to that tab. Do not rebind slots or modify persistent production state as part of automated acceptance.

The bridge owns feature/evidence publication, output commit SHA and Git ACK. Result package SHA256 is archived separately in /tmp/T-000490-result.tar.gz.sha256; no remote publication is claimed here.
