export function validatedRadarUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password ||
    url.pathname !== '/pcp/' || url.search || !/^#read=[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error('Kernel returned an invalid local radar URL');
  return url.href;
}
