"""Read-only V29 audit. Never opens a host database with SQLite or restores live data."""
import argparse
import hashlib
import json
import pathlib
import re
import sqlite3
import tempfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def capture(path):
    path = pathlib.Path(path).resolve(strict=True)
    before = {str(path) + s: pathlib.Path(str(path) + s).read_bytes()
              if pathlib.Path(str(path) + s).exists() else b'' for s in ('', '-wal', '-journal')}
    if before[str(path) + '-wal'] or before[str(path) + '-journal']:
        raise ValueError('Nonempty WAL/journal: require a separately authorized consistent snapshot')
    data = before[str(path)]
    with tempfile.TemporaryDirectory() as tmp:
        copy = pathlib.Path(tmp) / 'audit.db'
        copy.write_bytes(data)
        db = sqlite3.connect(copy.as_uri() + '?immutable=1', uri=True)
        try:
            if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)] or db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Integrity or FK check failed')
            version = db.execute("SELECT value FROM schema_meta WHERE key='schema_version'").fetchone()[0]
            if version != '29':
                raise ValueError('Expected V29')
            schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
            tables = {}
            for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
                quoted = '"' + name.replace('"', '""') + '"'
                cursor = db.execute('SELECT * FROM ' + quoted)
                tables[name] = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor]
        finally:
            db.close()
    for name, content in before.items():
        current = pathlib.Path(name).read_bytes() if pathlib.Path(name).exists() else b''
        if current != content:
            raise ValueError('Concurrent database drift')
    return {'sha256': digest(data), 'schema': schema, 'tables': tables}


def changes(old, new):
    if old['schema'] != new['schema']:
        raise ValueError('Schema differs')
    journal = []
    for table, rows in old['tables'].items():
        other = new['tables'][table]
        if rows == other:
            continue
        # Full row hashes retain evidence without leaking auth hashes or messages.
        encode = lambda row: json.dumps(row, sort_keys=True, default=str).encode()
        left = sorted(digest(encode(r)) for r in rows)
        right = sorted(digest(encode(r)) for r in other)
        if left != right:
            journal.append({'table': table, 'before': left, 'after': right})
    return journal


def runtime(tables):
    predicates = {
        'leases': lambda r: r['status'] == 'active',
        'browser_operations': lambda r: r['state'] != 'settled',
        'capabilities': lambda r: r['revoked_at'] is None,
        'agent_slots': lambda r: r['status'] != 'idle' or r['browser_state'] != 'absent' or r['browser_quarantined'] or r['rollover_state'] != 'idle' or r['browser_tab_id'] is not None or r['browser_lease_id'] is not None,
        'agent_workspaces': lambda r: r['status'] != 'retired',
        'agent_rollovers': lambda r: r['status'] in ('requested', 'opening', 'bootstrapping'),
        'organization_runtime_acquisitions': lambda r: r['status'] in ('requested', 'acquiring', 'acquired'),
        'browser_runtime': lambda r: True,
    }
    return {t: sum(bool(p(r)) for r in tables[t]) for t, p in predicates.items()}


def audit(source, destination, candidate, live_source, live_destination, expected, code):
    paths = [source, destination, candidate, live_source, live_destination]
    records = [capture(p) for p in paths]
    for record, sha in zip(records, expected):
        if record['sha256'] != sha:
            raise ValueError('Pinned snapshot SHA mismatch')
    old, dest, staged, live_old, live_dest = records
    journal = changes(old, staged)
    versions = [int(v) for v in re.findall(r'private migrateV(\d+)\(\)', pathlib.Path(code).read_text())]
    blockers = []
    if max(versions, default=0) != 29:
        blockers.append('Registered source is not V29; no runtime compatibility certification')
    if changes(old, live_old) or changes(dest, live_dest):
        blockers.append('Live database differs from snapshot')
    if any(runtime(staged['tables']).values()):
        blockers.append('Candidate runtime guard failed')
    # No approval of arbitrary candidate changes: every changed cell needs review.
    if journal:
        blockers.append('Candidate changed-row journal requires V29 field-level review')
    return {'liveCutoverAuthorized': False, 'blockers': blockers,
            'databases': [{'sha256': r['sha256'], 'integrity': 'ok', 'foreignKeys': 'ok',
                           'counts': {t: len(rows) for t, rows in r['tables'].items()}} for r in records],
            'runtime': runtime(staged['tables']), 'changedJournal': journal,
            'projectRoots': [r['root_path'] for r in old['tables']['projects']],
            'rollbackDryRun': {'destinationSnapshotVerified': True, 'writes': 0,
                              'note': 'No rollback executed; auth and extension configuration never opened'}}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'destination', 'candidate', 'live-source', 'live-destination', 'code'):
        p.add_argument('--' + name, required=True)
    p.add_argument('--sha', nargs=3, required=True)
    a = p.parse_args()
    try:
        report = audit(a.source, a.destination, a.candidate, a.live_source, a.live_destination, a.sha, a.code)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2 if report['blockers'] else 0
    except (ValueError, OSError, sqlite3.Error) as error:
        print(json.dumps({'error': str(error), 'liveCutoverAuthorized': False}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
