import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist-web');
const base = '/PetePrep';
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== base && !url.pathname.startsWith(base + '/')) { res.writeHead(404).end('Not found'); return; }
  let pathname = decodeURIComponent(url.pathname.slice(base.length)) || '/';
  if (pathname === '/') pathname = '/index.html';
  let file = resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end('Forbidden'); return; }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (req.headers.accept?.includes('text/html')) file = resolve(root, 'index.html');
    else { res.writeHead(404).end('Not found'); return; }
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Pages preview at http://127.0.0.1:4173/PetePrep/'));
