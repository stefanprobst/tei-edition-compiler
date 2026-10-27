import { EditionSchema, documentEvents, entityDisplayName, type Edition, type Provenance } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';

export interface SiteOptions { title: string; attribution: string; basePath: string; sourceLinks?: Record<string, string> }
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const http = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };

/** Publication consumes validated JSON only. Source selectors are displayed as opaque evidence. */
export async function generateSite(input: unknown, manifest: unknown, options: SiteOptions): Promise<Map<string, string>> {
    const edition = EditionSchema.parse(input);
    const binding = await verifyCompilationManifestArtifact(edition, manifest);
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(options.basePath)) throw new Error('Base path must be / or slash-delimited URL path segments');
    const sources = new Set(binding.sources.map(s => s.name));
    const sourceLinks = new Map<string, string>();
    for (const [name, value] of Object.entries(options.sourceLinks ?? {})) {
        const url = http(value); if (!sources.has(name) || !url) throw new Error('Invalid publication source link: ' + name);
        sourceLinks.set(name, url);
    }
    const files = new Map<string, string>();
    const href = (path: string) => options.basePath + path;
    const digestId = async (id: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))), byte => byte.toString(16).padStart(2, '0')).join('');
    const documentPaths = new Map(await Promise.all(edition.documents.map(async d => [d.id, `document-${await digestId(d.id)}.html`] as const)));
    const entityPaths = new Map(await Promise.all(edition.entities.map(async e => [e.id, `entity-${await digestId(e.id)}.html`] as const)));
    const records = [...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities, ...edition.mentions, ...edition.annotations, ...edition.resources, ...edition.anchors, ...edition.relations];
    const anchors = new Map(await Promise.all(records.map(async record => [record.id, `record-${await digestId(record.id)}`] as const)));
    const recordUrls = new Map<string, string>([...documentPaths].map(([id, path]) => [id, href(path)]));
    for (const [id, path] of entityPaths) recordUrls.set(id, href(path));
    for (const document of edition.documents) {
        const parts = new Set(document.parts.map(part => part.id));
        for (const id of [...parts, ...edition.annotations.filter(a => a.range && parts.has(a.range.partId)).map(a => a.id), ...edition.anchors.filter(a => parts.has(a.partId)).map(a => a.id)]) recordUrls.set(id, href(documentPaths.get(document.id)!) + '#' + anchors.get(id));
    }
    const link = (label: string, url: string) => `<a href="${escape(url)}">${escape(label)}</a>`;
    const evidence = (p: Provenance) => `<details><summary>Source evidence</summary><p>${escape(p.source)}</p><code>${escape(p.selector)}</code>${sourceLinks.has(p.source) ? `<p>${link('Canonical source', sourceLinks.get(p.source)!)}</p>` : ''}</details>`;
    const entityName = (id: string) => { const display = entityDisplayName(edition, id); return display.label + (display.source === 'text' ? ' (as written)' : ''); };
    const date = (d: Edition['documents'][number]) => [...new Set(d.metadata.dates.map(value => value.kind === 'exact' ? value.value + (value.label && value.label !== value.value ? ` (${value.label})` : '') : value.kind === 'interval' ? `${value.start ?? '?'} – ${value.end ?? '?'} (${value.label})` : value.label))].join('; ') || 'Date unknown';
    const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · ${escape(options.title)}</title><link rel="stylesheet" href="${href('style.css')}"><script src="${href('filter.js')}" defer></script></head><body><header><p>${escape(options.title)}</p><nav>${link('Documents', href('index.html'))} · ${link('Entities', href('entities.html'))} · ${link('Build diagnostics', href('diagnostics.html'))}</nav></header><main><h1>${escape(title)}</h1>${body}</main><footer><p>${escape(options.attribution)}</p><p>IR ${edition.version}. Artifact binding verified; source files were not inspected by this generator.</p></footer></body></html>`;
    const filter = '<label>Filter this list <input type="search" data-filter aria-label="Filter this list"></label>';
    files.set('index.html', page('Documents', `<p>Diplomatic text: deletions and source spacing retained. This sample does not infer a final reading.</p>${filter}<ul data-items>${edition.documents.map(d => `<li>${link(d.metadata.title, href(documentPaths.get(d.id)!))} <span>${escape(date(d))}</span></li>`).join('')}</ul><p>Order follows the supplied edition document array; this is not a claim about source-declared sequence.</p>`));
    files.set('entities.html', page('Entities', `<p>Names marked “as written” come from the text. They may be abbreviated or have several forms; no authority-register name was supplied for them.</p>${filter}<ul data-items>${edition.entities.map(e => `<li>${link(entityName(e.id), href(entityPaths.get(e.id)!))} · ${escape(e.kind)} · ${escape(e.authorityRef)}</li>`).join('')}</ul>`));
    for (const document of edition.documents) {
        const parts = new Set(document.parts.map(p => p.id));
        const mentions = edition.mentions.filter(m => parts.has(m.range.partId));
        const annotations = edition.annotations.filter(a => a.range && parts.has(a.range.partId));
        const noteNumbers = new Map(annotations.filter(a => a.kind === 'note').map((note, i) => [note.id, i + 1]));
        const emittedPoints = new Set<string>();
        const emittedMentions = new Set<string>();
        const mentionMarkers = (partId: string, offset: number) => {
            const names = mentions.filter(m => m.range.partId === partId && m.range.start === offset && !emittedMentions.has(m.id)).map(m => { emittedMentions.add(m.id); return `<span id="${anchors.get(m.id)}"></span>`; }).join('');
            const points = annotations.filter(a => a.range!.partId === partId && a.range!.start === offset && !emittedPoints.has(a.id) && (a.kind === 'reference-point' || (a.kind === 'note' && !edition.relations.some(r => r.subjectId === a.id && r.predicate === 'annotates')))).map(a => {
                emittedPoints.add(a.id);
                const notes = a.kind === 'note' ? [a.id] : edition.relations.filter(r => r.predicate === 'annotates' && r.objectIds.includes(a.id) && noteNumbers.has(r.subjectId)).map(r => r.subjectId);
                return (a.kind === 'reference-point' ? `<span id="${anchors.get(a.id)}"></span>` : '') + notes.map(id => `<a class="note-ref" href="#${anchors.get(id)}" aria-label="Note ${noteNumbers.get(id)}">[${noteNumbers.get(id)}]</a>`).join('');
            }).join('');
            return names + points;
        };
        const renderChunk = (partId: string, start: number, end: number, value: string) => {
            const localMentions = mentions.filter(m => m.range.partId === partId);
            const localAnnotations = annotations.filter(a => a.range!.partId === partId);
            const boundaries = [...new Set([start, end, ...[...localMentions, ...localAnnotations].flatMap(record => [record.range!.start, record.range!.end]).filter(offset => offset > start && offset < end)])].sort((a, b) => a - b);
            return boundaries.slice(0, -1).map((offset, i) => {
                const limit = boundaries[i + 1];
                const starts = mentionMarkers(partId, offset);
                const active = localMentions.filter(m => m.range.start <= offset && m.range.end >= limit);
                const kinds = localAnnotations.filter(a => a.range!.start <= offset && a.range!.end >= limit).map(a => a.kind).filter(kind => ['deletion', 'insertion', 'emphasis', 'uncertain-reading'].includes(kind));
                const sourceMarker = localAnnotations.some(a => a.range!.start <= offset && a.range!.end >= limit && ['spacing', 'missing-text', 'uncompiled-content', 'glyph'].includes(a.kind));
                const content = escape(value.slice(offset - start, limit - start)).replaceAll('\uFFFC', sourceMarker ? '<span title="Source marker; inspect annotation evidence for its meaning" aria-label="Source marker">◇</span>' : '\uFFFC');
                const marked = `<span class="${kinds.join(' ')}">${content}</span>`;
                const destination = active.flatMap(m => m.entityIds).find(id => entityPaths.has(id));
                return starts + (destination ? `<a href="${href(entityPaths.get(destination)!)}">${marked}</a>` : marked);
            }).join('') + mentionMarkers(partId, end);
        };
        let text = '';
        for (const event of documentEvents(edition, document.id)) {
            if (event.kind === 'enter-part') text += `<section id="${anchors.get(event.partId)}"><h2>${escape(document.parts.find(p => p.id === event.partId)!.kind)}</h2><div class="transcript">${mentionMarkers(event.partId, 0)}`;
            else if (event.kind === 'text') text += renderChunk(event.partId, event.start, event.end, event.text);
            else if (event.kind === 'exit-part') text += '</div></section>';
            else { const anchor = edition.anchors.find(a => a.id === event.anchorId)!; text += `<span class="page-marker" id="${anchors.get(event.anchorId)}"> [Page ${escape(anchor.label ?? 'boundary')}] </span>`; }
        }
        const occurrence = (m: Edition['mentions'][number]) => `<li id="evidence-${anchors.get(m.id)}"><q>${escape(m.label)}</q> — ${m.entityIds.map(id => { const entity = edition.entities.find(e => e.id === id)!; return link(entityName(entity.id), href(entityPaths.get(id)!)); }).join(', ')} ${link('Passage', '#' + anchors.get(m.id))}${evidence(m.provenance)}</li>`;
        const related = (annotationId: string) => edition.relations.filter(r => r.subjectId === annotationId && ['annotates', 'references'].includes(r.predicate)).map(r => `<p>${r.predicate === 'annotates' ? 'Attached at' : 'References'}: ${r.objectIds.map(id => { const target = edition.documents.find(d => d.id === id); return target ? link(target.metadata.title, href(documentPaths.get(id)!)) : recordUrls.has(id) ? link(r.predicate === 'annotates' ? 'Source attachment point' : 'Referenced record', recordUrls.get(id)!) : escape(id); }).join(', ')}${(r.externalTargets ?? []).map(target => http(target.sourceId) ? link(target.sourceId, http(target.sourceId)!) : escape(target.sourceId)).join(', ')}</p>${evidence(r.provenance)}`).join('');
        const renderAnnotation = (a: Edition['annotations'][number]) => `<li id="${a.kind === 'reference-point' ? 'evidence-' : ''}${anchors.get(a.id)}"><strong>${a.kind === 'note' ? 'Note ' + noteNumbers.get(a.id) : escape(a.kind === 'name-component' ? a.details.component?.replaceAll('-', ' ') ?? 'name component' : a.kind)}</strong>${a.range && a.kind !== 'note' ? ` · UTF-16 ${a.range.start}–${a.range.end}` : ''}${a.content ? `<div class="${a.kind === 'note' ? 'note-body' : 'transcript'}">${escape(a.content.text)}</div>${a.content.annotations.length ? `<details><summary>Content annotations</summary>${a.content.annotations.map(local => `<p>${escape(local.kind)}${local.language !== undefined ? ' · ' + escape(local.language) : ''} · ${local.range.start}–${local.range.end}</p>${evidence(local.provenance)}`).join('')}</details>` : ''}` : a.body ? `<p>${escape(a.body)}</p>` : ''}${related(a.id)}${evidence(a.provenance)}</li>`;
        const notes = annotations.filter(a => a.kind === 'note').map(renderAnnotation).join('');
        const otherAnnotations = annotations.filter(a => a.kind !== 'note').map(renderAnnotation).join('');
        const resources = edition.resources.filter(r => document.resourceIds.includes(r.id)).map(r => `<li id="${anchors.get(r.id)}">${http(r.uri) ? link('Open facsimile resource', http(r.uri)!) : escape(r.uri)}<p>Original resource URI; browser image support and remote availability may vary. No page alignment is inferred.</p>${evidence(r.provenance)}</li>`).join('');
        const diagnostics = edition.diagnostics.filter(d => d.provenance.source === document.provenance.source);
        const sequence = edition.relations.filter(r => r.subjectId === document.id && ['previous-document', 'next-document'].includes(r.predicate)).map(r => `<li>${escape(r.predicate)}: ${r.objectIds.map(id => { const target = edition.documents.find(d => d.id === id); return target ? link(target.metadata.title, href(documentPaths.get(id)!)) : escape(id); }).join(', ')}${(r.externalTargets ?? []).map(target => ` External: ${http(target.sourceId) ? link(target.sourceId, http(target.sourceId)!) : escape(target.sourceId)}`).join('')}${evidence(r.provenance)}</li>`).join('');
        const position = edition.documents.indexOf(document);
        const adjacent = [position > 0 ? link('Previous in overview', href(documentPaths.get(edition.documents[position - 1].id)!)) : '', position + 1 < edition.documents.length ? link('Next in overview', href(documentPaths.get(edition.documents[position + 1].id)!)) : ''].filter(Boolean).join(' · ');
        files.set(documentPaths.get(document.id)!, page(document.metadata.title, `<nav>${adjacent}</nav><details><summary>Source-declared sequence</summary><ul>${sequence}</ul></details>` + `<p>${escape(date(document))}</p><details><summary>Rights and attribution</summary><p>${escape(document.metadata.rights.join('\n'))}</p></details>${evidence(document.provenance)}${text}<h2>Entity occurrences</h2><ul>${mentions.map(occurrence).join('')}</ul><h2>Notes</h2><ol class="notes">${notes}</ol><details><summary>Other annotations (${annotations.length - noteNumbers.size})</summary><ul>${otherAnnotations}</ul></details><h2>Facsimiles</h2><ul>${resources}</ul><h2>Compiler diagnostics (${diagnostics.length})</h2><ul>${diagnostics.map(d => `<li>${escape(d.code + ': ' + d.message)}${evidence(d.provenance)}</li>`).join('')}</ul>`));
    }
    for (const entity of edition.entities) {
        const occurrences = edition.mentions.filter(m => m.entityIds.includes(entity.id)).map(m => { const document = edition.documents.find(d => d.parts.some(p => p.id === m.range.partId))!; return `<li>${link(`${document.metadata.title}: ${m.label}`, href(documentPaths.get(document.id)!) + '#' + anchors.get(m.id))}</li>`; });
        const display = entityDisplayName(edition, entity.id);
        const explanation = display.source === 'register' ? 'Name from the supplied authority register.' : display.source === 'text' ? 'Names as written in the text. No authority-register name was supplied for this entity; these forms are not a verified full name.' : 'No name from an authority register or linked text was supplied for this entity.';
        files.set(entityPaths.get(entity.id)!, page(entityName(entity.id), `<p>${explanation}</p>` + `<p>${escape(entity.kind)}</p><p>${escape(entity.authorityRef)}</p>${evidence(entity.provenance)}<h2>Occurrences (${occurrences.length})</h2><ul>${occurrences.join('')}</ul>`));
    }
    files.set('diagnostics.html', page('Build diagnostics', `<p>${edition.diagnostics.length} compiler diagnostics. All diagnostics, including those outside document sources, are retained.</p><ul>${edition.diagnostics.map(d => `<li>${escape(d.code + ': ' + d.message)}${evidence(d.provenance)}</li>`).join('')}</ul>`));
    files.set('style.css', 'body{font:18px/1.6 system-ui;max-width:70rem;margin:auto;padding:1rem;color:#243337;background:#faf9f4}nav a{margin-right:1rem}a{color:#884222}h1{line-height:1.2}li{margin:.8rem 0}code,p,li{overflow-wrap:anywhere}.transcript{white-space:pre-wrap}.note-body{white-space:pre-line}.note-ref{font-size:.75em;vertical-align:super;margin:0 .15em}.deletion{text-decoration:line-through}.insertion{color:#286136}.emphasis{font-style:italic}.uncertain-reading{text-decoration:underline dotted}.page-marker{font-size:.8em;background:#e4e7dc}section{margin:2rem 0}details{font-size:.9rem}footer{border-top:1px solid #aaa;margin-top:3rem}input{font:inherit;max-width:100%;box-sizing:border-box} :target{outline:2px solid #884222;scroll-margin:1rem}');
    files.set('filter.js', 'document.querySelectorAll("[data-filter]").forEach(input=>input.addEventListener("input",()=>{const query=input.value.toLocaleLowerCase();document.querySelectorAll("[data-items]>li").forEach(item=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query)})}));');
    return files;
}
