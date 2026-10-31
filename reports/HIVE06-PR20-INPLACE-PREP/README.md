# HIVE06 PR20 offline in-place preparation — BLOCKED

Business source: **0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a**. This is the initial repository HEAD, checked read-only. The bridge owns the subsequent tool/evidence commit; that commit is not the business source SHA. PR20 remains Draft; PR21 Role Charter remains NOT_READY. No PCP FIXED, Role Charter, CB Host or application implementation changes.

Reviewed `scripts/pcp-trial.mjs` install/verify/start/stop and `docs/pcp/PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md`, `PCP_CHARTERION_DEPLOYMENT_V0.2.md`. Install refuses existing roots, derives identity from absolute data path, copies an app under versions/SHA, rewrites background Host, records hashes, then registers HKCU. Verify checks installed hashes/registry/Node but does not enforce an exact directory set. Start can invoke RPC and spawn Kernel; stop can close Chrome and stop owned Kernel. None are called by the new tool. Their code is unchanged.

`scripts/pcp-inplace-prep.mjs` is a standalone offline packager and verifier. It never imports the operational trial script, spawns commands, accesses registry/SQLite/Profile, reads token contents, starts/stops processes, or sends messages. It copies the existing trial script as an inert release asset to match the old install file set; **do not execute that asset**. There are no launchers, active root trial.json, installation, switch or rollback actions. The original trial/config copies live only under candidate evidence/.

## Inputs supplied independently by the caller

Use a protected offline evidence directory, outside the live TrialRoot, containing byte-exact read-only copies named:

- `trial.json`, installed `release.json`, installed extension `manifest.json` including key;
- `native-host/gam-native-host.json` (only token *path*, never its value);
- `registration.json`: actual current Host registration manifest JSON;
- `evidence.json`: separately reviewed provenance receipt described below.

Do not give the tool a live root as source/evidence. The tool does not collect evidence from live Windows, establish that a supplied copy is current/authentic, or cryptographically authenticate the receipt. Copy hashes are checked against the caller's independent receipt, not treated as live observation. Unknown/missing provenance, incomplete inventory, inconsistent metadata and bindings fail closed. Even a complete receipt cannot lift readiness above BLOCKED. Keep these local artifacts out of public Git: they contain private absolute paths, though not token values.

Receipt schema (JSON object; all hashes lowercase SHA256):

| Field | Required value |
| --- | --- |
| schemaVersion | 1 |
| targetSourceSha, buildSourceSha | exact business SHA above |
| readOnlyCopies | true |
| observedAt | ISO timestamp of independent evidence collection |
| provenance | nonempty reference to actual reviewed evidence, not an invented assertion |
| copies | exact relative-name → hash map for the five copied JSONs above |
| registrationPath | observed HKCU default value pointing to old versions/SHA/native-host/HOST.json |
| oldReleaseReadHash | PASS only for actual old release artifact read/hash verification |
| oldReleaseFiles | exact old release.files map attested by that verification |
| verify, distFingerprint, nativePublish | PASS, backed by actual candidate Windows results |
| artifacts | exact full inventory of every file under source dist/, dist-control/, dist-native-host/, plus manifest.json, scripts/pcp-trial.mjs, shared/native-rpc-protocol.json |

The receipt is an explicit interface, not an automatic evidence collector. Do not include DB, WAL/SHM, data/, Chrome profiles, tokens or credentials in either directory. No fixture receipt is valid production evidence. See the Node mock fixture for a complete synthetic schema example. Actual Windows artifacts are not present in this workspace; no real candidate package has been fabricated.

## Offline invocation

Node 22+ on the user's isolated Windows candidate worktree, using explicit absolute paths selected by the caller:

```powershell
node scripts/pcp-inplace-prep.mjs prepare --source "<offline-built-worktree>" --evidence "<offline-evidence-copies>" --target-sha 0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a --out-dir "<new-external-candidate-directory>"
node scripts/pcp-inplace-prep.mjs verify --source "<same-offline-built-worktree>" --evidence "<same-offline-evidence-copies>" --target-sha 0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a --out-dir "<existing-candidate-directory>"
```

Exit **2** means file integrity PASS / readiness BLOCKED; exit **1** means rejection/error (possibly partial output on I/O failure; never reuse it). There is deliberately no deployment-success exit. Verify requires the original independent inputs and reconstructs expected bytes without writing anything. OutDir's parent must exist and be canonical, with no links/junctions. OutDir must be outside TrialRoot, source and evidence, and must not exist for prepare. No concurrent adversarial filesystem mutation is supported; run only in a caller-controlled offline directory. Do not point any source/input/output at network/reparse locations.

The candidate application is under `versions/<business SHA>/` with the old installation's exact release file set. Additional/missing Native publish files block rather than silently change the old installation format. Background native Host strings are rewritten using old install semantics; original dist/build-meta.json remains byte-for-byte unchanged, so its background hash intentionally describes the pre-rewrite build. release.json records pre-rewrite background hash plus post-rewrite installed hashes. A separate installation-manifest.json explains the mapping and BLOCKED gates. SHA256SUMS.json inventories every other package file (it cannot hash itself). Verify rejects extra, missing and modified files and compares this manifest too. Registration JSON targets the original identity's future version path, never the staging outDir, and is not registered.

## Independent evidence required before any separate upgrade proposal

- Logged-in Chrome Dev **Default** actual loaded unpacked-extension path, observed directly; no cached path inference. Prove a reversible same-ID reload and storage.local/storage.session retention behavior in an isolated rehearsal; key equality alone does not prove storage preservation.
- Actual controlled Kernel-authorized SQLite **consistent backup and restore rehearsal**, with actual supported mechanism and recovery evidence. This tool invents no RPC. Never unlock or copy live DB/WAL/SHM and call that a backup.
- Current production schema/health and candidate compatibility, including backward/forward recovery strategy.
- Fresh read-only lease/attempt snapshot, binding/lock ownership and audit sequence; do not assume idle or clear locks.
- Real Native Host runtime smoke and candidate artifact provenance tied to the exact business SHA.

Until these are independently established: **BLOCKED; no installation or reload authorized by this package**.
