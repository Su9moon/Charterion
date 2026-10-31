# Validation

Necessary command: `node --test scripts/tests/pcp-inplace-prep.test.mjs` — **NOT_RUN**: this environment has no node or nodejs executable. No mock PASS is claimed. This leaves task acceptance incomplete.

Fixtures cover deterministic preparation and read-only verification, BLOCKED status, original input/build-meta preservation, no active trial.json, refusal to overwrite, missing/extra/modified files, provenance/inventory rejection, wrong source SHA, traversal/overlap, Host/key/pipe/build-meta/file-set mismatch with updated receipt hashes, and symlink input/output parents. Windows privileged symlink case is explicitly skipped by the mock test; real Windows junction/reparse and runtime smoke evidence remains unavailable.

Supplemental `git diff --check` is used for patch whitespace only; it is not JavaScript execution or Windows acceptance. No existing application implementation changed, so application builds and live fault/browser/DB tests were not run. User-provided earlier business build results are recorded separately in acceptance.md and do not validate this new tool.

Observed supplemental results: `git diff --check` exit 0; Python UTF-8/final-newline/trailing-whitespace inspection PASS for all six new files. The Node acceptance command was attempted and exited 127 (`node: command not found`); the tests themselves did not execute. No repair or subsequent passing runtime test is claimed.
