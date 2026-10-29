import net from 'node:net';
for (const address of [{ port: 0, host: '127.0.0.1' }, { path: `/tmp/hive-t463-${process.pid}.sock` }]) {
  await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => { console.log(JSON.stringify({ address, code: error.code, message: error.message })); resolve(); });
    server.listen(address, () => server.close(() => { console.log(JSON.stringify({ address, listen: 'allowed' })); resolve(); }));
  });
}
