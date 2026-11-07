// Упаковывает собранное приложение (dist/) в один Cloudflare Worker.
// Так сайт публикуется одной загрузкой скрипта, без отдельной загрузки файлов.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DIST = 'dist';
const OUT = '.worker/worker.js';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};
const BINARY = new Set(['.png', '.woff2']);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = {};
for (const file of walk(DIST)) {
  const path = '/' + relative(DIST, file).split('\\').join('/');
  const ext = extname(file);
  const type = TYPES[ext] ?? 'application/octet-stream';
  const buf = readFileSync(file);
  files[path] = BINARY.has(ext) ? { type, b64: buf.toString('base64') } : { type, text: buf.toString('utf8') };
}

const code = `// Сгенерировано scripts/build-worker.mjs — не редактировать вручную.
const FILES = ${JSON.stringify(files)};
const decoded = new Map();
function body(f) {
  if (f.text !== undefined) return f.text;
  let b = decoded.get(f);
  if (!b) {
    const s = atob(f.b64);
    b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    decoded.set(f, b);
  }
  return b;
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    let f = FILES[path];
    // Одностраничное приложение: любые адреса без расширения отдают index.html
    if (!f && !/\\.[a-z0-9]+$/i.test(path)) { f = FILES['/index.html']; path = '/index.html'; }
    if (!f) return new Response('Not found', { status: 404 });
    const headers = {
      'content-type': f.type,
      'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin'
    };
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(body(f), { headers });
  }
};
`;
mkdirSync('.worker', { recursive: true });
writeFileSync(OUT, code);
console.log(`Worker: ${OUT}, файлов: ${Object.keys(files).length}, размер: ${(code.length / 1024).toFixed(0)} КБ`);
