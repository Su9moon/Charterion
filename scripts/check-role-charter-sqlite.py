"""Isolated V31 SQL acceptance. Does not run ControlDatabase or TypeScript."""
from pathlib import Path
import sqlite3
import tempfile
import unittest

SQL = (Path(__file__).resolve().parent.parent / 'control/src/database.ts').read_text().split('private migrateV31(): void {', 1)[1].split('`', 2)[1]

class CharterSQLite(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='hive-charter-sqlite-')
        self.path = str(Path(self.directory.name) / 'isolated.db')
        self.db = self.connect()
        self.db.executescript('CREATE TABLE project_groups(id TEXT PRIMARY KEY); CREATE TABLE projects(id TEXT PRIMARY KEY); CREATE TABLE agent_slots(id TEXT PRIMARY KEY);' + SQL)
        self.db.executescript("INSERT INTO project_groups VALUES('g'); INSERT INTO projects VALUES('hive'),('cb'); INSERT INTO agent_slots VALUES('h'),('c');")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=0, isolation_level=None)
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        return db

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def snapshot(self):
        self.db.execute("INSERT OR IGNORE INTO role_charter_snapshots VALUES('d','v1','content')")

    def binding(self):
        self.db.execute("INSERT INTO role_charter_bindings VALUES('hive','g','hive','h','conversation:h','d')")

    def test_restart_and_migration_idempotency(self):
        self.snapshot()
        self.binding()
        self.db.close()
        self.db = self.connect()
        self.db.executescript(SQL)
        self.snapshot()
        self.assertEqual(self.db.execute('SELECT count(*) FROM role_charter_bindings').fetchone()[0], 1)
        self.assertEqual(self.db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_immutable_history_and_binding(self):
        self.snapshot()
        self.binding()
        for statement in ["UPDATE role_charter_snapshots SET content='bad'", 'DELETE FROM role_charter_snapshots', "UPDATE role_charter_bindings SET digest='other'", 'DELETE FROM role_charter_bindings']:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)

    def test_partial_transaction_rolls_back(self):
        self.db.execute('BEGIN IMMEDIATE')
        self.snapshot()
        self.binding()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO role_charter_bindings VALUES('cb','g','cb','c','conversation:h','d')")
        self.db.execute('ROLLBACK')
        self.assertEqual(self.db.execute('SELECT count(*) FROM role_charter_snapshots').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT count(*) FROM role_charter_bindings').fetchone()[0], 0)

    def test_concurrent_writer_cannot_partially_publish(self):
        other = self.connect()
        try:
            self.db.execute('BEGIN IMMEDIATE')
            self.snapshot()
            self.binding()
            self.assertEqual(other.execute('SELECT count(*) FROM role_charter_bindings').fetchone()[0], 0)
            with self.assertRaisesRegex(sqlite3.OperationalError, 'locked'):
                other.execute('BEGIN IMMEDIATE')
            self.db.execute('COMMIT')
            other.execute('BEGIN IMMEDIATE')
            with self.assertRaises(sqlite3.IntegrityError):
                other.execute("INSERT INTO role_charter_bindings VALUES('hive','g','hive','h','conversation:h','d')")
            other.execute('ROLLBACK')
            self.assertEqual(other.execute('SELECT count(*) FROM role_charter_bindings').fetchone()[0], 1)
        finally:
            other.close()

    def test_schema_does_not_enforce_project_slot_pair(self):
        # Honest schema limitation: both FKs exist but their relationship is not checked.
        # importApproved must validate the complete tuple, even for an existing binding.
        self.snapshot()
        self.db.execute("INSERT INTO role_charter_bindings VALUES('hive','g','cb','h','conversation:h','d')")
        self.assertEqual(self.db.execute('SELECT project_id,slot_id FROM role_charter_bindings').fetchone(), ('cb', 'h'))

if __name__ == '__main__':
    unittest.main(verbosity=2)
