# README Translation Policy

`README.md` is the semantic Source of Truth for README structure and technical facts. Localized README files are Git-tracked artifacts, not runtime machine translations.

## Invariants

- Keep the canonical project name `Hive` unchanged in every locale.
- Preserve section IDs, section order, commands, code blocks, paths, identifiers, JSON keys, environment variables, protocol names, database tables, SHAs, branches, and API symbols.
- Translate explanatory prose naturally; do not force word-for-word translations of architecture terms.
- Keep `fail-closed`, `Source of Truth`, `AgentSlot`, `ProjectCell`, `WorkClaim`, `GAM_HOME`, and other canonical contract tokens when translation would weaken precision.
- Relative link destinations must remain synchronized with the English source.
- The legal authority for licensing is the root `LICENSE` file containing the official English Apache License 2.0 text.

## Workflow

1. Edit `README.md`.
2. Run `python scripts/readme_i18n.py status`.
3. Update only the affected localized sections.
4. Run `python scripts/readme_i18n.py sync-navigation`.
5. Mark reviewed locales current with `python scripts/readme_i18n.py mark-current <locale> ...`.
6. Run `python scripts/check_readme_i18n.py`.
7. Before release, run `python scripts/check_readme_i18n.py --release`.

Active languages are exactly en and zh-CN. Both must be current for release. Historical translations are frozen under archive/ and excluded from navigation, generation, version metadata and acceptance.
活跃语言仅为英文和简体中文；历史译文仅归档。
