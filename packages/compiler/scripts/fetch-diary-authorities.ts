import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
const manifest = await Bun.file('fixtures/schnitzler-diary/manifest.json').json();
const output = 'packages/site/dist/sources';
await mkdir(output, { recursive: true });
for (const [name, info] of Object.entries(manifest.authorityFiles) as [string, { path: string; sha256: string; gitBlob: string; bytes: number }][]) {
    const destination = output + '/' + name;
    let bytes: Uint8Array;
    const cached = await Bun.file(destination).exists();
    if (cached) bytes = await Bun.file(destination).bytes();
    else {
        const response = await fetch(`https://raw.githubusercontent.com/arthur-schnitzler/schnitzler-tagebuch-data/${manifest.commit}/${info.path}`);
        if (!response.ok) throw new Error('Authority download failed: ' + response.status);
        bytes = new Uint8Array(await response.arrayBuffer());
    }
    if (bytes.length !== info.bytes || createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Authority file does not match pinned upstream bytes: ' + name);
    if (!cached) await Bun.write(destination, bytes);
    console.log(`${cached ? 'Verified cached' : 'Downloaded and verified'} ${destination}`);
}
