const files = new Set(['index.html', 'app.js', 'style.css', 'edition.json', 'edition.manifest.json', 'presentation.json', 'study-edition.json', 'study.json', 'study-presentation.json']);
const server = Bun.serve({
    hostname: '127.0.0.1', port: Number(process.env.PORT ?? 3000),
    async fetch(request) {
        const path = new URL(request.url).pathname.slice(1) || 'index.html';
        if (!files.has(path)) return new Response('Not found', { status: 404 });
        const file = Bun.file('packages/viewer/dist/' + path);
        if (!await file.exists()) return new Response('Run bun run viewer:build first.', { status: 404 });
        return new Response(file, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    },
});
console.log('Reference viewer: ' + server.url);
