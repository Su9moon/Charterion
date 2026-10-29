import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// No Hive imports: isolates OS listen permission from the application transport.
for (const [kind, address] of [
  ['unix', join(tmpdir(), `T-000459-${randomUUID()}.sock`)],
  ['tcp', { host: '127.0.0.1', port: 0 }],
]) {
  await new Promise(resolve => {
    const server = createServer();
    server.once('error', error => { console.log(JSON.stringify({ kind, code: error.code, syscall: error.syscall })); resolve(); });
    server.listen(address, () => { console.log(JSON.stringify({ kind, listening: true })); server.close(resolve); });
  });
}
