// Lawchart 개발 서버 — 의존성 0, app/ 정적 호스팅 (file:// 직접 열기는 ES 모듈 제약이 있어 로컬 확인용)
// 사용법: node phase3/dev-server.mjs  → http://localhost:8123
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, url === '/' ? 'index.html' : url));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(8123, () => console.log('Lawchart dev server → http://localhost:8123'));
