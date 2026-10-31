# Acceptance and evidence boundary

Status: offline implementation delivered; runtime acceptance NOT_RUN; deployment BLOCKED.

User-supplied Windows observations, not independently rerun here:

- Old SHA d2e8d1bf2d6cc9f20d9076e3cdb380fae6fc6e43; instance b7c82d2e8c4c1930; Host com.charterion.pcp_trial_b7c82d2e8c4c1930; extension kheifdlffdfcgmapmbbahdgkpccckmbn. Process/Host/pipe ownership preflight PASS, old release artifacts 24/24 matched.
- Kernel PID 7940 was running. DB/WAL/SHM sizes 2301952/4148872/32768 bytes. Locked file hashing was **UNAVAILABLE**, not OK: prior nonterminating PowerShell errors invalidated the earlier READHASH=OK claim. No consistent backup, DB health/schema or recoverability can be inferred.
- Candidate exact business SHA: npm ci/verify reported 0, 98 files/541 tests and fault34 PASS, control+extension build/fingerprint PASS. Later manual native publish SUCCESS; EXE SHA256 **9CB8893831511AFA9502EACCE30235A7755958B1E536A2712F90A6C0D76A6E82**. dist check/key/UTF8 PASS. Native runtime smoke NOT_RUN. Receipt must inventory the actual candidate, not a recreated/mock EXE.

Implemented acceptance rules: exact old identity/key/pipe/origin/registration binding; validated original build metadata and source artifact hashes; preserved metadata with explicit background rewrite evidence; exact installed file-set parity; all-file inventory; prepare requires new external directory; verify writes nothing; malformed/unproven inputs rejected; readiness always BLOCKED.

No live files, SQLite, tokens, registry, Chrome, Kernel or messages were accessed. No Git publication, commit, branch mutation, PR update or deployment performed. No real evidence receipt was supplied. The delivered result package consists of this report directory, standalone script and mock tests; the bridge handles Git/ACK/publication after review. No fabricated external ACK or result URL is claimed.
