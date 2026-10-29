import { createHash } from 'node:crypto';
const lock = await Bun.file('corpora/auden-musulin/manifest.json').json();
const jobs = [lock, lock.authorities].flatMap(group => Object.entries(group.files).map(([name, info]) => ({ name, info: info as {path: string; bytes: number; sha256: string; gitBlob: string}, repository: group.repository, commit: group.commit })));
let cursor = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < jobs.length) {
        const { name, info, repository, commit } = jobs[cursor++];
        const path = 'packages/site/dist/amp-sources/' + name;
        const cached = await Bun.file(path).exists();
        let bytes: Uint8Array;
        if (cached) bytes = await Bun.file(path).bytes();
        else {
            const repo = new URL(repository).pathname;
            const response = await fetch(`https://raw.githubusercontent.com${repo}/${commit}/${info.path}`, { signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(name + ': HTTP ' + response.status);
            bytes = new Uint8Array(await response.arrayBuffer());
        }
        if (bytes.length !== info.bytes || createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Pinned bytes differ: ' + name);
        if (!cached) await Bun.write(path, bytes);
    }
}));
console.log(`Verified ${jobs.length} explicit source inputs. No images fetched.`);
