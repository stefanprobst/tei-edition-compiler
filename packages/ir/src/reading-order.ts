import type { Edition } from './index';

export type DocumentEvent =
    | { kind: 'enter-part'; partId: string }
    | { kind: 'exit-part'; partId: string }
    | { kind: 'text'; partId: string; start: number; end: number; text: string }
    | { kind: 'anchor'; partId: string; anchorId: string };

type Marker = { kind: 'part' | 'anchor'; id: string; offset: number; order: number };

/** Consume validated IR. No source XML, selector parsing or project vocabulary is used. */
export function* documentEvents(edition: Edition, documentId: string): Generator<DocumentEvent> {
    const document = edition.documents.find(d => d.id === documentId);
    if (!document) throw new Error(`Unknown document ${documentId}`);
    const parts = new Map(document.parts.map(p => [p.id, p]));
    const markers = new Map<string, Marker[]>();
    const add = (ownerId: string, marker: Marker) => {
        const values = markers.get(ownerId) ?? [];
        values.push(marker);
        markers.set(ownerId, values);
    };
    for (const part of document.parts) if (part.parentId !== undefined) add(part.parentId, { kind: 'part', id: part.id, offset: part.parentOffset!, order: part.order });
    for (const anchor of edition.anchors) if (parts.has(anchor.partId)) add(anchor.partId, { kind: 'anchor', id: anchor.id, offset: anchor.offset, order: anchor.order });
    for (const values of markers.values()) values.sort((a, b) => a.order - b.order);
    function* visit(partId: string): Generator<DocumentEvent> {
        const part = parts.get(partId)!;
        const text = part.content?.text ?? '';
        yield { kind: 'enter-part', partId };
        let cursor = 0;
        for (const marker of markers.get(partId) ?? []) {
            if (marker.offset > cursor) yield { kind: 'text', partId, start: cursor, end: marker.offset, text: text.slice(cursor, marker.offset) };
            cursor = marker.offset;
            if (marker.kind === 'part') yield* visit(marker.id);
            else yield { kind: 'anchor', partId, anchorId: marker.id };
        }
        if (cursor < text.length) yield { kind: 'text', partId, start: cursor, end: text.length, text: text.slice(cursor) };
        yield { kind: 'exit-part', partId };
    }
    const roots = document.parts.filter(p => p.parentId === undefined).sort((a, b) => a.order - b.order);
    for (const root of roots) yield* visit(root.id);
}
