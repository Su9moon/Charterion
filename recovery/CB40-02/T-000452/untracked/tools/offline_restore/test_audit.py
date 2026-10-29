import importlib.util
import pathlib
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('audit', pathlib.Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = pathlib.Path(self.tmp.name) / 'source.db'
        with sqlite3.connect(self.path) as db:
            db.executescript("CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO schema_meta VALUES('schema_version','29'); CREATE TABLE history(id TEXT PRIMARY KEY, message TEXT);")

    def test_capture_preserves_bytes_and_sidecars(self):
        before = self.path.read_bytes()
        result = audit.capture(self.path)
        self.assertEqual(result['sha256'], audit.digest(before))
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(pathlib.Path(str(self.path) + '-wal').exists())

    def test_nonempty_wal_rejected(self):
        pathlib.Path(str(self.path) + '-wal').write_bytes(b'pending')
        with self.assertRaisesRegex(ValueError, 'Nonempty WAL'):
            audit.capture(self.path)

    def test_wrong_schema_rejected(self):
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE schema_meta SET value='27'")
        with self.assertRaisesRegex(ValueError, 'Expected V29'):
            audit.capture(self.path)

    def test_corruption_rejected(self):
        self.path.write_bytes(b'not sqlite')
        with self.assertRaises(sqlite3.DatabaseError):
            audit.capture(self.path)

    def test_journal_detects_history_change_without_content_disclosure(self):
        before = audit.capture(self.path)
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO history VALUES('attempt-1','secret')")
        journal = audit.changes(before, audit.capture(self.path))
        self.assertEqual(journal[0]['table'], 'history')
        self.assertNotIn('secret', str(journal))

    def test_schema_difference_rejected(self):
        before = audit.capture(self.path)
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE extra(id TEXT)')
        with self.assertRaisesRegex(ValueError, 'Schema differs'):
            audit.changes(before, audit.capture(self.path))


if __name__ == '__main__':
    unittest.main()
