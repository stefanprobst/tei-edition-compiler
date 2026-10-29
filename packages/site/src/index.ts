import { createSearchIndex } from './search';
import { EditionSchema, annotatedTextRuns, documentEvents, entityDisplayName, type Edition, type Provenance } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';

export interface SiteOptions { title: string; attribution: string; basePath: string; sourceLinks?: Record<string, string>; documentRoutes?: Record<string, string>; previews?: Record<string, string>; search?: boolean; about?: { title: string; paragraphs: string[] } }
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
    const documentPaths = new Map<string, string>(await Promise.all(edition.documents.map(async d => [d.id, `document-${await digestId(d.id)}.html`] as const)));
    const entityPaths = new Map(await Promise.all(edition.entities.map(async e => [e.id, `entity-${await digestId(e.id)}.html`] as const)));
    const occupied = new Set(['index.html', 'entities.html', 'diagnostics.html', 'search.html', 'about.html', ...entityPaths.values()]);
    for (const [id, path] of Object.entries(options.documentRoutes ?? {})) {
        if (!documentPaths.has(id) || typeof path !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(path) || occupied.has(path)) throw new Error('Invalid or conflicting document route: ' + id);
        if ([...documentPaths].some(([other, existing]) => other !== id && existing === path)) throw new Error('Duplicate document route');
        documentPaths.set(id, path); occupied.add(path);
    }
    const previews = new Map<string, string>();
    for (const [id, value] of Object.entries(options.previews ?? {})) {
        const uri = http(value);
        if (!edition.resources.some(r => r.id === id) || !uri) throw new Error('Invalid preview resource: ' + id);
        previews.set(id, uri);
    }
    if (previews.size) {
        const bundle = await Bun.build({ entrypoints: [new URL('./workspace-client.ts', import.meta.url).pathname], target: 'browser', minify: true });
        if (!bundle.success) throw new Error('Image workspace asset build failed');
        files.set('workspace.js', await bundle.outputs[0].text());
    }
    const records = [...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities, ...edition.mentions, ...edition.annotations, ...edition.annotations.flatMap(a => a.content?.annotations ?? []), ...edition.resources, ...edition.anchors, ...edition.relations];
    const anchors = new Map(await Promise.all(records.map(async record => [record.id, `record-${await digestId(record.id)}`] as const)));
    const recordUrls = new Map<string, string>([...documentPaths].map(([id, path]) => [id, href(path)]));
    for (const [id, path] of entityPaths) recordUrls.set(id, href(path));
    for (const document of edition.documents) {
        const parts = new Set(document.parts.map(part => part.id));
        for (const id of [...parts, ...edition.annotations.filter(a => a.range ? parts.has(a.range.partId) : document.annotationIds.includes(a.id)).map(a => a.id), ...edition.anchors.filter(a => parts.has(a.partId)).map(a => a.id)]) recordUrls.set(id, href(documentPaths.get(document.id)!) + '#' + anchors.get(id));
    }
    const link = (label: string, url: string) => `<a href="${escape(url)}">${escape(label)}</a>`;
    const evidence = (p: Provenance) => `<details><summary>Source evidence</summary><p>${escape(p.source)}</p><code>${escape(p.selector)}</code>${sourceLinks.has(p.source) ? `<p>${link('Canonical source', sourceLinks.get(p.source)!)}</p>` : ''}</details>`;
    const entityName = (id: string) => { const display = entityDisplayName(edition, id); return display.label + (display.source === 'text' ? ' (as written)' : ''); };
    const date = (d: Edition['documents'][number]) => [...new Set(d.metadata.dates.map(value => value.kind === 'exact' ? value.value + (value.label && value.label !== value.value ? ` (${value.label})` : '') : value.kind === 'interval' ? `${value.start ?? '?'} – ${value.end ?? '?'} (${value.label})` : value.label))].join('; ') || 'Date unknown';
    const page = (title: string, body: string, extraScript = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="edition-sha256" content="${binding.editionSha256}"><title>${escape(title)} · ${escape(options.title)}</title><link rel="stylesheet" href="${href('style.css')}"><script src="${href('filter.js')}" defer></script>${extraScript}</head><body><a class="skip-link" href="#main-content">Skip to main content</a><header><p>${escape(options.title)}</p><nav>${link('Documents', href('index.html'))} · ${link('Entities', href('entities.html'))}${options.search ? ' · ' + link('Search', href('search.html')) : ''}${options.about ? ' · ' + link('About', href('about.html')) : ''} · ${link('Build diagnostics', href('diagnostics.html'))}</nav></header><main id="main-content" tabindex="-1"><h1>${escape(title)}</h1>${body}</main><footer><p>${escape(options.attribution)}</p><p>IR ${edition.version}. Artifact binding verified; source files were not inspected by this generator.</p></footer></body></html>`;
    const filter = '<label>Filter this list <input type="search" name="filter" autocomplete="off" data-filter aria-label="Filter this list"></label>';
    files.set('index.html', page('Documents', `<p>Diplomatic text: deletions and source spacing retained. No final reading is inferred.</p>${filter}<ul data-items>${edition.documents.map(d => `<li>${link(d.metadata.title, href(documentPaths.get(d.id)!))} <span>${escape(date(d))}</span><small> · Includes: ${escape([...new Set(d.parts.map(part => part.kind.replaceAll('-', ' ')))].join(', '))}</small></li>`).join('')}</ul><p>Order follows the supplied edition document array; this is not a claim about source-declared sequence.</p>`));
    files.set('entities.html', page('Entities', `<p>Names marked “as written” come from the text. They may be abbreviated or have several forms; no authority-register name was supplied for them.</p>${filter}<ul data-items>${edition.entities.map(e => `<li>${link(entityName(e.id), href(entityPaths.get(e.id)!))} · ${escape(e.kind)} · ${escape(e.authorityRef)}</li>`).join('')}</ul>`));
    for (const document of edition.documents) {
        const parts = new Set(document.parts.map(p => p.id));
        const mentions = edition.mentions.filter(m => parts.has(m.range.partId));
        const annotations = edition.annotations.filter(a => a.range ? parts.has(a.range.partId) : document.annotationIds.includes(a.id));
        const noteNumbers = new Map(annotations.filter(a => a.kind === 'note').map((note, i) => [note.id, i + 1]));
        const commentNumbers = new Map(annotations.filter(a => a.kind === 'interpretation-link').map((a, i) => [a.id, i + 1]));
        const emittedPoints = new Set<string>();
        const emittedMentions = new Set<string>();
        const mentionMarkers = (partId: string, offset: number) => {
            const names = mentions.filter(m => m.range.partId === partId && m.range.start === offset && !emittedMentions.has(m.id)).map(m => { emittedMentions.add(m.id); return `<span id="${anchors.get(m.id)}"></span>`; }).join('');
            const points = annotations.filter(a => a.range?.partId === partId && a.range.start === offset && !emittedPoints.has(a.id) && (a.kind === 'reference-point' || a.kind === 'column-boundary' || a.kind === 'interpretation-link' || (a.kind === 'note' && !edition.relations.some(r => r.subjectId === a.id && r.predicate === 'annotates')))).map(a => {
                emittedPoints.add(a.id);
                if (a.kind === 'interpretation-link') {
                    const targets = a.targetIds.filter(id => recordUrls.has(id) && edition.annotations.some(target => target.id === id && target.kind === 'interpretation'));
                    return `<span id="${anchors.get(a.id)}"></span>` + targets.map((id, i) => `<a class="source-comment-ref note-ref" href="${recordUrls.get(id)}">[Comment ${commentNumbers.get(a.id)}${targets.length > 1 ? '.' + (i + 1) : ''}]</a>`).join('');
                }
                const notes = a.kind === 'note' ? [a.id] : edition.relations.filter(r => r.predicate === 'annotates' && r.objectIds.includes(a.id) && noteNumbers.has(r.subjectId)).map(r => r.subjectId);
                return (a.kind === 'column-boundary' ? `<span class="column-marker" id="${anchors.get(a.id)}">[Column ${escape(a.details.label || 'boundary')}]</span>` : a.kind === 'reference-point' ? `<span id="${anchors.get(a.id)}"></span>` : '') + notes.map(id => `<a class="note-ref" href="#${anchors.get(id)}" aria-label="Note ${noteNumbers.get(id)}">[${noteNumbers.get(id)}]</a>`).join('');
            }).join('');
            return names + points;
        };
        const markerEntries: { id: string; sourceId: string; annotations: Edition['annotations'] }[] = [];
        const renderChunk = (partId: string, start: number, end: number, value: string) => {
            const localMentions = mentions.filter(m => m.range.partId === partId);
            const localAnnotations = annotations.filter(a => a.range?.partId === partId);
            const boundaries = [...new Set([start, end, ...[...localMentions, ...localAnnotations].flatMap(record => [record.range!.start, record.range!.end]).filter(offset => offset > start && offset < end)])].sort((a, b) => a - b);
            return boundaries.slice(0, -1).map((offset, i) => {
                const limit = boundaries[i + 1];
                const starts = mentionMarkers(partId, offset);
                const active = localMentions.filter(m => m.range.start <= offset && m.range.end >= limit);
                const kinds = localAnnotations.filter(a => a.range!.start <= offset && a.range!.end >= limit).map(a => a.kind).filter(kind => ['deletion', 'insertion', 'emphasis', 'uncertain-reading'].includes(kind));
                const destination = active.flatMap(m => m.entityIds).find(id => entityPaths.has(id));
                const renderText = (value: string) => {
                    if (!value) return '';
                    const marked = `<span class="${kinds.join(' ')}">${escape(value)}</span>`;
                    return destination ? `<a href="${href(entityPaths.get(destination)!)}">${marked}</a>` : marked;
                };
                const pieces = value.slice(offset - start, limit - start).split('\uFFFC');
                const content = pieces.map((piece, index) => {
                    if (index === 0) return renderText(piece);
                    const position = offset + pieces.slice(0, index).reduce((sum, part) => sum + part.length, 0) + index - 1;
                    const markers = localAnnotations.filter(a => a.range!.start <= position && a.range!.end > position && ['spacing', 'missing-text', 'uncompiled-content', 'glyph'].includes(a.kind));
                    if (!markers.length) return renderText('\uFFFC' + piece);
                    const id = `${anchors.get(partId)}-marker-${position}`;
                    const sourceId = id + '-source';
                    markerEntries.push({ id, sourceId, annotations: markers });
                    const label = [...new Set(markers.map(a => a.kind.replaceAll('-', ' ')))].join(', ');
                    return `<a class="source-marker" id="${sourceId}" href="#${id}" aria-label="Inspect ${escape(label)} marker" title="Inspect ${escape(label)}">◇</a>` + renderText(piece);
                }).join('');
                return starts + content;
            }).join('') + mentionMarkers(partId, end);
        };
        const events = [...documentEvents(edition, document.id)];
        const partById = new Map(document.parts.map(part => [part.id, part]));
        const orderedParts = events.filter(event => event.kind === 'enter-part').map(event => partById.get(event.partId)!);
        const partLabel = (kind: string) => { const label = kind.replaceAll('-', ' '); return label.charAt(0).toUpperCase() + label.slice(1); };
        const partDepth = (id: string): number => { const parent = partById.get(id)?.parentId; return parent ? 1 + partDepth(parent) : 0; };
        const partContents = (parentId?: string): string => {
            const children = orderedParts.filter(part => part.parentId === parentId);
            return children.length ? `<ol>${children.map(part => `<li>${link(partLabel(part.kind), '#' + anchors.get(part.id))}${partContents(part.id)}</li>`).join('')}</ol>` : '';
        };
        const contents = orderedParts.length ? `<nav class="document-contents" aria-label="Document parts"><details open><summary>In this document</summary>${partContents()}</details></nav>` : '';
        let text = '';
        for (const event of events) {
            if (event.kind === 'enter-part') {
                const level = 2 + partDepth(event.partId);
                const tag = level <= 6 ? 'h' + level : 'div';
                text += `<section class="document-part" id="${anchors.get(event.partId)}" tabindex="-1"><${tag}${level > 6 ? ` role="heading" aria-level="${level}"` : ''}>${escape(partLabel(partById.get(event.partId)!.kind))}</${tag}><div class="transcript">${mentionMarkers(event.partId, 0)}`;
            }
            else if (event.kind === 'text') text += renderChunk(event.partId, event.start, event.end, event.text);
            else if (event.kind === 'exit-part') text += '</div></section>';
            else { const anchor = edition.anchors.find(a => a.id === event.anchorId)!; text += `<span class="page-marker" id="${anchors.get(event.anchorId)}"> [Page ${escape(anchor.label ?? 'boundary')}] ${anchor.resourceIds.filter(id => document.resourceIds.includes(id)).map(id => (previews.has(id) ? `<a href="#${anchors.get(id)}" data-workspace-image="${anchors.get(id)}">View image</a>` : link('View image', '#' + anchors.get(id)))).join(', ')}</span>`; }
        }
        const occurrence = (m: Edition['mentions'][number]) => `<li id="evidence-${anchors.get(m.id)}"><q>${escape(m.label)}</q> — ${m.entityIds.map(id => { const entity = edition.entities.find(e => e.id === id)!; return link(entityName(entity.id), href(entityPaths.get(id)!)); }).join(', ')} ${link('Passage', '#' + anchors.get(m.id))}${evidence(m.provenance)}</li>`;
        const related = (annotationId: string) => edition.relations.filter(r => r.subjectId === annotationId && ['annotates', 'references'].includes(r.predicate)).map(r => `<p>${r.predicate === 'annotates' ? 'Attached at' : 'References'}: ${r.objectIds.map(id => { const target = edition.documents.find(d => d.id === id); return target ? link(target.metadata.title, href(documentPaths.get(id)!)) : recordUrls.has(id) ? link(r.predicate === 'annotates' ? 'Source attachment point' : 'Referenced record', recordUrls.get(id)!) : escape(id); }).join(', ')}${(r.externalTargets ?? []).map(target => http(target.sourceId) ? link(target.sourceId, http(target.sourceId)!) : escape(target.sourceId)).join(', ')}</p>${evidence(r.provenance)}`).join('');
        const renderLocalContent = (content: NonNullable<Edition['annotations'][number]['content']>) => annotatedTextRuns(content).map(run => `<span class="${[...new Set(run.annotations.map(a => a.kind))].join(' ')}"${run.language !== undefined ? ` lang="${escape(run.language)}"` : ''}${run.annotations.length ? ` title="${escape([...new Set(run.annotations.map(a => a.kind.replaceAll('-', ' '))), ...(run.languageConflict ? ['conflicting language declarations'] : [])].join(', '))}"` : ''}>${escape(run.text).replaceAll('\uFFFC', run.annotations.some(a => a.kind === 'missing-text') ? `<a href="#${anchors.get(run.annotations.find(a => a.kind === 'missing-text')!.id)}" aria-label="Inspect missing text in note">◇</a>` : '\uFFFC')}</span>`).join('');
        const renderAnnotation = (a: Edition['annotations'][number]) => `<li id="${['reference-point', 'column-boundary', 'interpretation-link'].includes(a.kind) ? 'evidence-' : ''}${anchors.get(a.id)}"><strong>${a.kind === 'note' ? 'Note ' + noteNumbers.get(a.id) : escape(a.kind === 'name-component' ? a.details.component?.replaceAll('-', ' ') ?? 'name component' : a.kind)}</strong>${a.range && a.kind !== 'note' ? ` · UTF-16 ${a.range.start}–${a.range.end}` : ''}${a.content ? `<div class="${a.kind === 'note' ? 'note-body' : 'transcript'}">${renderLocalContent(a.content)}</div>${a.content.annotations.length ? `<details><summary>Content annotations</summary>${a.content.annotations.map(local => `<p id="${anchors.get(local.id)}">${escape(local.kind)}${local.language !== undefined ? ' · ' + escape(local.language) : ''} · ${local.range.start}–${local.range.end}</p>${local.certainty ? `<p>Certainty: ${escape(local.certainty)}</p>` : ''}${Object.entries(local.details).map(([key, value]) => `<p>${escape(key)}: ${escape(value)}</p>`).join('')}${evidence(local.provenance)}`).join('')}</details>` : ''}` : a.body ? `<p>${escape(a.body)}</p>` : ''}${a.kind === 'interpretation' ? `<p>Referenced passages: ${edition.annotations.filter(reference => reference.kind === 'interpretation-link' && reference.targetIds.includes(a.id) && recordUrls.has(reference.id)).map(reference => link((reference.body || 'Source passage').slice(0, 80), recordUrls.get(reference.id)!)).join('; ')}</p>` : ''}${a.certainty ? `<p>Certainty: ${escape(a.certainty)}</p>` : ''}${edition.relations.filter(r => r.predicate === 'responsible-for' && r.objectIds.includes(a.id)).map(r => `<p>Responsibility: ${recordUrls.has(r.subjectId) ? link(entityName(r.subjectId), recordUrls.get(r.subjectId)!) : escape(r.subjectId)}</p>${evidence(r.provenance)}`).join('')}${related(a.id)}${evidence(a.provenance)}</li>`;
        const notes = annotations.filter(a => a.kind === 'note').map(renderAnnotation).join('');
        const commentary = annotations.filter(a => a.kind === 'interpretation');
        const commentaryHtml = commentary.map(renderAnnotation).join('');
        const otherAnnotations = annotations.filter(a => !['note', 'interpretation'].includes(a.kind)).map(renderAnnotation).join('');
        const imageOptions = edition.resources.filter(r => document.resourceIds.includes(r.id) && previews.has(r.id)).map((r, i) => {
            const labels = edition.anchors.filter(a => parts.has(a.partId) && a.resourceIds.includes(r.id)).map(a => a.label).filter(Boolean);
            return `<option value="${anchors.get(r.id)}" data-src="${escape(previews.get(r.id)!)}">Image ${i + 1}${labels.length ? ' · Page ' + escape([...new Set(labels)].join(', ')) : ' · No page link supplied'}</option>`;
        }).join('');
        const workspaceText = imageOptions ? `<div class="reading-workspace"><div class="reading-text">${text}</div><aside data-image-workspace hidden aria-label="Facsimile workspace"><h2>Facsimile</h2><label>Choose image <select autocomplete="off">${imageOptions}</select></label><button type="button" data-close-image>Close image</button><p><a data-open-image>Open image directly</a></p><p role="status"></p><div class="workspace-image"><img alt="Selected facsimile"></div><p>Images follow the supplied resource list. No alignment is inferred. Use page markers for explicit source links.</p></aside></div>` : text;
        const resources = edition.resources.filter(r => document.resourceIds.includes(r.id)).map(r => `<li id="${anchors.get(r.id)}">${http(previews.get(r.id) ?? r.uri) ? link('Open facsimile resource', http(previews.get(r.id) ?? r.uri)!) : escape(r.uri)}<p>Original resource URI; browser image support and remote availability may vary. No page alignment is inferred.</p>${previews.has(r.id) ? `<p><a href="#${anchors.get(r.id)}" data-workspace-image="${anchors.get(r.id)}">Read beside transcription</a></p><details class="facsimile-preview"><summary>View facsimile preview</summary><img loading="lazy" src="${escape(previews.get(r.id)!)}" alt="Facsimile image; use the original resource link if preview fails"><p>External preview. Original source URI: <code>${escape(r.uri)}</code></p></details>` : ''}${edition.anchors.filter(a => parts.has(a.partId) && a.resourceIds.includes(r.id)).map(a => `<p>${link('Back to page marker ' + (a.label ?? 'in source'), '#' + anchors.get(a.id))}</p>`).join('')}${evidence(r.provenance)}</li>`).join('');
        const markerInspection = markerEntries.length ? `<details class="source-marker-inspection"><summary>Source markers (${markerEntries.length})</summary><ol>${markerEntries.map(marker => `<li id="${marker.id}" tabindex="-1">${marker.annotations.map(a => `<strong>${escape(a.kind.replaceAll('-', ' '))}</strong>${a.body ? `<p>${escape(a.body)}</p>` : ''}${Object.keys(a.details).length ? `<dl>${Object.entries(a.details).map(([key, value]) => `<dt>${escape(key.replaceAll('-', ' '))}</dt><dd>${escape(value)}</dd>`).join('')}</dl>` : ''}<p>${link('Full annotation evidence', '#' + anchors.get(a.id))}</p>${evidence(a.provenance)}`).join('')}<p>${link('Back to source marker', '#' + marker.sourceId)}</p></li>`).join('')}</ol></details>` : '';
        const diagnostics = edition.diagnostics.filter(d => d.provenance.source === document.provenance.source);
        const uncompiled = annotations.filter(a => a.kind === 'uncompiled-content').length;
        const incomplete = uncompiled ? `<p class="notice">Incomplete transcription: ${uncompiled} source entries remain uncompiled. ◇ marks their positions. ${link('Compiler diagnostics', '#compiler-diagnostics')}</p>` : '';

        const sequence = edition.relations.filter(r => r.subjectId === document.id && ['previous-document', 'next-document'].includes(r.predicate)).map(r => `<li>${escape(r.predicate)}: ${r.objectIds.map(id => { const target = edition.documents.find(d => d.id === id); return target ? link(target.metadata.title, href(documentPaths.get(id)!)) : escape(id); }).join(', ')}${(r.externalTargets ?? []).map(target => ` External: ${http(target.sourceId) ? link(target.sourceId, http(target.sourceId)!) : escape(target.sourceId)}`).join('')}${evidence(r.provenance)}</li>`).join('');
        const context = edition.relations.filter(r => document.relationIds.includes(r.id) && r.subjectId === document.id).map(r => `<li><strong>${escape(r.predicate.replaceAll(/[-_:]/g, ' '))}</strong>${r.description ? ': ' + escape(r.description) : ''}${r.date ? ' · ' + escape(r.date.label) : ''}: ${r.objectIds.map(id => { const target = edition.documents.find(d => d.id === id); const entity = edition.entities.find(e => e.id === id); return recordUrls.has(id) ? link(target?.metadata.title ?? (entity ? entityName(id) : 'Referenced record'), recordUrls.get(id)!) : escape(id); }).join(', ')}${(r.externalTargets ?? []).map(target => http(target.sourceId) ? link(target.sourceId, http(target.sourceId)!) : escape(target.sourceId)).join(', ')}${evidence(r.provenance)}</li>`).join('');
        const position = edition.documents.indexOf(document);
        const adjacent = [position > 0 ? link('Previous in overview', href(documentPaths.get(edition.documents[position - 1].id)!)) : '', position + 1 < edition.documents.length ? link('Next in overview', href(documentPaths.get(edition.documents[position + 1].id)!)) : ''].filter(Boolean).join(' · ');
        files.set(documentPaths.get(document.id)!, page(document.metadata.title, `<nav>${adjacent}</nav><details><summary>Source-declared sequence</summary><ul>${sequence}</ul></details>` + `${incomplete}<p class="reading-policy">Reading policy: deletions and source spacing are retained. Select ◇ to inspect source-backed spacing, missing text, glyph or uncompiled-content evidence. No final reading is inferred.</p><p>${escape(date(document))}</p><details><summary>Rights, identifiers and attribution</summary><p>${escape(document.metadata.rights.join('\n'))}</p><p>Identifiers: ${document.metadata.identifiers.map(value => http(value) ? link(value, http(value)!) : escape(value)).join('; ')}</p></details>${evidence(document.provenance)}${context ? `<details class="document-context"><summary>Document relationships and participants</summary><ul>${context}</ul></details>` : ''}${contents}${workspaceText}${markerInspection}<h2>Entity occurrences</h2><ul>${mentions.map(occurrence).join('')}</ul><h2>Notes</h2><ol class="notes">${notes}</ol>${commentary.length ? `<h2>Editorial commentary</h2><ol class="commentary">${commentaryHtml}</ol>` : ''}<details><summary>Other annotations (${annotations.length - noteNumbers.size - commentary.length})</summary><ul>${otherAnnotations}</ul></details><h2>Facsimiles</h2><ul>${resources}</ul><h2 id="compiler-diagnostics">Compiler diagnostics (${diagnostics.length})</h2><ul>${diagnostics.map(d => `<li>${escape(d.code + ': ' + d.message)}${evidence(d.provenance)}</li>`).join('')}</ul>`, imageOptions ? `<script type="module" src="${href('workspace.js')}"></script>` : ''));
    }
    for (const entity of edition.entities) {
        const occurrences = edition.mentions.filter(m => m.entityIds.includes(entity.id)).map(m => { const document = edition.documents.find(d => d.parts.some(p => p.id === m.range.partId))!; return `<li>${link(`${document.metadata.title}: ${m.label}`, href(documentPaths.get(document.id)!) + '#' + anchors.get(m.id))}</li>`; });
        const display = entityDisplayName(edition, entity.id);
        const explanation = display.source === 'supplied' ? 'Name supplied by the edition data.' : display.source === 'text' ? 'Names as written in the text. No authority-register name was supplied for this entity; these forms are not a verified full name.' : 'No name from an authority register or linked text was supplied for this entity.';
        files.set(entityPaths.get(entity.id)!, page(entityName(entity.id), `<p>${explanation}</p>` + `<p>${escape(entity.kind)}</p><p>${escape(entity.authorityRef)}</p>${evidence(entity.provenance)}<h2>Occurrences (${occurrences.length})</h2><ul>${occurrences.join('')}</ul>`));
    }
    files.set('diagnostics.html', page('Build diagnostics', `<p>${edition.diagnostics.length} compiler diagnostics. All diagnostics, including those outside document sources, are retained.</p><ul>${edition.diagnostics.map(d => `<li>${escape(d.code + ': ' + d.message)}${evidence(d.provenance)}</li>`).join('')}</ul>`));
    if (options.about) files.set('about.html', page(options.about.title, options.about.paragraphs.map(paragraph => `<p>${escape(paragraph)}</p>`).join('')));
    if (options.search) {
        const searchJson = JSON.stringify(createSearchIndex(edition, binding.editionSha256, options.basePath, documentPaths, anchors));
        const searchDigest = await digestId(searchJson);
        files.set('search-index.json', searchJson);
        const bundle = await Bun.build({ entrypoints: [new URL('./search-client.ts', import.meta.url).pathname], target: 'browser', minify: true });
        if (!bundle.success) throw new Error('Search asset build failed');
        files.set('search.js', await bundle.outputs[0].text());
        files.set('search.html', page('Search', '<p>Search transcriptions as literal text, ignoring case and allowing flexible whitespace. Use document and entity filters for titles, dates and register names. Deleted text is included; source spacing and source markers remain. No final reading is inferred. Results link to the source part.</p><form id="search-form"><label>Search text <input id="search-query" name="q" autocomplete="off" type="search" maxlength="256" required></label><button type="submit">Search</button></form><p id="search-status" role="status">Loading search index…</p><ol id="search-results"></ol><noscript><p>Text search requires JavaScript. Document and entity navigation remain available.</p></noscript>', `<meta name="search-index-sha256" content="${searchDigest}"><script type="module" src="${href('search.js')}" defer></script>`));
    }
    files.set('style.css', '.source-marker{padding-inline:.1em;text-decoration:underline dotted}.source-marker-inspection dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:.25rem}.source-marker-inspection dd{margin:0;overflow-wrap:anywhere}.document-contents{border-block:1px solid #c7c9bf;margin-block:1rem;padding-block:.5rem}.document-contents li{margin:.25rem 0}.document-part{scroll-margin-top:1rem}.document-part .document-part{border-inline-start:2px solid #d6d8cf;padding-inline-start:1rem}.document-part h3,.document-part h4,.document-part h5,.document-part h6{font-size:1.15em}.reading-workspace{min-width:0}.reading-text{min-width:0}[data-image-workspace]{border:1px solid #a5aaa0;padding:1rem;background:#f0f1e9;min-width:0}select{font:inherit;max-width:100%}.workspace-image{min-height:12rem}button,select{margin:.25rem} @media(min-width:60rem){.reading-workspace.with-image{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem;align-items:start}[data-image-workspace]{position:sticky;top:1rem;max-height:calc(100vh - 4rem);overflow:auto}.workspace-image img{max-height:65vh;object-fit:contain}}.skip-link{position:absolute;left:1rem;top:-5rem;background:#faf9f4;padding:.5rem;z-index:1}.skip-link:focus{top:0}a:focus-visible,input:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #884222;outline-offset:3px}body{font:18px/1.6 system-ui;max-width:70rem;margin:auto;padding:1rem;color:#243337;background:#faf9f4}nav a{margin-right:1rem}a{color:#884222}h1{line-height:1.2}li{margin:.8rem 0}code,p,li{overflow-wrap:anywhere}.transcript{white-space:pre-wrap}.note-body{white-space:pre-line}.note-ref{font-size:.75em;vertical-align:super;margin:0 .15em}.deletion{text-decoration:line-through}.insertion{color:#286136}.emphasis{font-style:italic}.superscript{vertical-align:super;font-size:.75em}.work-title{font-style:italic}.supplied-text{text-decoration:underline dotted}.abbreviation-marker{border-bottom:1px dotted currentColor}.uncertain-reading{text-decoration:underline dotted}.column-marker{display:block;font-size:.8em;background:#e4e7dc}.page-marker{font-size:.8em;background:#e4e7dc;margin-inline:.25em;padding-inline:.2em}section{margin:2rem 0}details{font-size:.9rem}.notice{border-left:4px solid #884222;padding:.5rem 1rem;background:#f2ebdf}footer{border-top:1px solid #aaa;margin-top:3rem}img{max-width:100%;height:auto}input{font:inherit;max-width:100%;box-sizing:border-box} :target{outline:2px solid #884222;scroll-margin:1rem}');
    files.set('filter.js', 'document.querySelectorAll("[data-filter]").forEach(input=>{const items=[...document.querySelectorAll("[data-items]>li")];const status=document.createElement("p");status.setAttribute("role","status");input.closest("label").after(status);const apply=()=>{const query=input.value.toLocaleLowerCase();items.forEach(item=>{item.hidden=!item.textContent.toLocaleLowerCase().includes(query)});status.textContent=items.filter(item=>!item.hidden).length+" of "+items.length+" entries shown"};const restore=()=>{input.value=new URL(location.href).searchParams.get("filter")??"";apply()};input.addEventListener("input",()=>{const url=new URL(location.href);if(input.value)url.searchParams.set("filter",input.value);else url.searchParams.delete("filter");history.replaceState(null,"",url);apply()});window.addEventListener("popstate",restore);window.addEventListener("pageshow",restore);restore()});');
    return files;
}
