import { searchText, parseSearchIndex, type SearchIndex } from './search-model';
const form = document.querySelector<HTMLFormElement>('#search-form');
if (form) {
    const input = document.querySelector<HTMLInputElement>('#search-query')!;
    const status = document.querySelector<HTMLElement>('#search-status')!;
    const results = document.querySelector<HTMLOListElement>('#search-results')!;
    const base = new URL('./', location.href);
    let index: SearchIndex | undefined;
    const run = () => {
        results.replaceChildren();
        if (!index) return;
        const query = input.value.trim();
        const matches = searchText(index, query);
        status.textContent = query.length < 2 ? 'Enter at least two characters.' : `${matches.length} results${matches.length === 100 ? ' shown (limit reached)' : ''}. Deleted text is included; source spacing is retained.`;
        for (const match of matches) {
            const uri = new URL(match.href, base);
            if (uri.origin !== base.origin || !uri.pathname.startsWith(base.pathname)) continue;
            const item = document.createElement('li'), link = document.createElement('a'), snippet = document.createElement('p'), mark = document.createElement('mark');
            link.href = uri.href; link.textContent = match.title;
            mark.textContent = match.match; snippet.append(document.createTextNode(match.before), mark, document.createTextNode(match.after));
            item.append(link, snippet); results.append(item);
        }
    };
    form.onsubmit = event => {
        event.preventDefault(); const uri = new URL(location.href); uri.searchParams.set('q', input.value); history.pushState(null, '', uri); run();
    };
    window.addEventListener('popstate', () => { input.value = new URL(location.href).searchParams.get('q') ?? ''; run(); });
    try {
        const response = await fetch(new URL('search-index.json', base));
        if (!response.ok) throw new Error('Missing search index');
        const raw = await response.text();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), byte => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== document.querySelector<HTMLMetaElement>('meta[name="search-index-sha256"]')?.content) throw new Error('Search index artifact differs');
        const data = JSON.parse(raw);
        const expected = document.querySelector<HTMLMetaElement>('meta[name="edition-sha256"]')!.content;
        index = parseSearchIndex(data, expected, base.pathname);
        input.value = new URL(location.href).searchParams.get('q') ?? ''; status.textContent = 'Search ready. Deleted text is included; source spacing is retained.';
        if (input.value) run();
    } catch { status.textContent = 'Search index unavailable or from a different build. Document navigation remains available.'; }
}
