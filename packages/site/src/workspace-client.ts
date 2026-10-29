// Progressive enhancement of source-backed resource links; no source XML or alignment inference.
const workspace = document.querySelector<HTMLElement>('[data-image-workspace]');
if (workspace) {
    const select = workspace.querySelector<HTMLSelectElement>('select')!;
    const image = workspace.querySelector<HTMLImageElement>('img')!;
    const open = workspace.querySelector<HTMLAnchorElement>('[data-open-image]')!;
    const status = workspace.querySelector<HTMLElement>('[role="status"]')!;
    const close = workspace.querySelector<HTMLButtonElement>('[data-close-image]')!;
    const layout = workspace.closest<HTMLElement>('.reading-workspace')!;
    let returnFocus: HTMLElement | undefined;
    const render = () => {
        const id = new URL(location.href).searchParams.get('image');
        const option = [...select.options].find(option => option.value === id);
        const visible = !!option;
        workspace.hidden = !visible; layout.classList.toggle('with-image', visible);
        if (!option) { image.removeAttribute('src'); return; }
        select.value = option.value; open.href = option.dataset.src!;
        image.alt = 'Facsimile: ' + option.textContent;
        if (image.getAttribute('src') !== option.dataset.src) {
            status.textContent = 'Loading image…'; image.src = option.dataset.src!;
        }
    };
    const choose = (id?: string) => {
        const url = new URL(location.href);
        if (id) url.searchParams.set('image', id); else url.searchParams.delete('image');
        history.pushState(null, '', url); render();
    };
    document.querySelectorAll<HTMLAnchorElement>('[data-workspace-image]').forEach(link => {
        link.addEventListener('click', event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); returnFocus = link; choose(link.dataset.workspaceImage); select.focus();
        });
    });
    select.addEventListener('change', () => choose(select.value));
    close.addEventListener('click', () => { choose(); (returnFocus ?? document.querySelector<HTMLElement>('main'))?.focus(); });
    image.addEventListener('load', () => { status.textContent = 'Image loaded. Selection does not imply alignment with the visible text.'; });
    image.addEventListener('error', () => { status.textContent = 'Image unavailable. Try opening the image directly or choose another image.'; });
    window.addEventListener('popstate', render); window.addEventListener('pageshow', render);
    render();
}
