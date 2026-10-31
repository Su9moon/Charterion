"""Source/SQL checks only. Does not execute TypeScript, Vitest or ControlDatabase."""
import hashlib
import json
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parent.parent
source = (root / 'control/src/jointRoleCharter.ts').read_text()
contract = json.loads(source.split('export const JOINT_ROLE_CHARTER = ', 1)[1].split(' as const;', 1)[0])
for pin, name in zip(contract['sources'], ['PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md', 'ROADMAP.md']):
    content = (root / 'reports/HIVE06-ROLE-CHARTER/inputs' / name).read_bytes()
    assert hashlib.sha256(content).hexdigest() == pin['sha256']
print('PASS source content SHA256')
assert len(contract['roles']) == len({r['conversationKey'] for r in contract['roles']}) == 3
assert sum(r['slotId'] is not None for r in contract['roles']) == 2
assert len(contract['globalAuthority']['roles']) == 5
print('PASS fixed global/project fixture separation')
database = (root / 'control/src/database.ts').read_text()
assert sorted(map(int, re.findall(r'private migrateV(\d+)\(', database))) == list(range(1, 32))
print('PASS contiguous migration registry')
sql = database.split('private migrateV31(): void {', 1)[1].split('`', 2)[1]
connection = sqlite3.connect(':memory:')
connection.executescript('CREATE TABLE project_groups(id TEXT PRIMARY KEY); CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE agent_slots(id TEXT PRIMARY KEY);' + sql)
connection.execute("INSERT INTO role_charter_snapshots VALUES('digest','v1','content')")
for statement in ["UPDATE role_charter_snapshots SET content='tamper'", 'DELETE FROM role_charter_snapshots']:
    try:
        connection.execute(statement)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError('Snapshot mutation succeeded')
connection.close()
print('PASS extracted V31 SQLite snapshot immutability')
print('4 passed; TypeScript/Vitest/build NOT_RUN')
