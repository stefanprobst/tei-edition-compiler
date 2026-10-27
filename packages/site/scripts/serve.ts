import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'packages/site/dist/public');
const basePath = process.argv[3] ?? '/diary/';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(basePath)) throw new Error('Invalid base path');
const files = new Set((await readdir(directory)).filter(name => /^[a-z0-9-]+\.(html|css|js)$/.test(name)));
const server = Bun.serve({ hostname: '127.0.0.1', port: Number(process.env.PORT ?? 3001), async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === basePath.slice(0, -1) && basePath !== '/') return Response.redirect(new URL(basePath, url), 302);
    if (!url.pathname.startsWith(basePath)) return new Response('Not found', { status: 404 });
    const name = url.pathname.slice(basePath.length) || 'index.html';
    if (!files.has(name)) return new Response('Not found', { status: 404 });
    return new Response(Bun.file(resolve(directory, name)));
} });
console.log(`Static files only: ${server.url.origin}${basePath}`);
