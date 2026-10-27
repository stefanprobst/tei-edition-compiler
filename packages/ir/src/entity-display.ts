import type { Edition } from './index';

/** A presentation fallback, never an inferred authority label or a mutation of the IR. */
export function entityDisplayName(edition: Pick<Edition, 'entities' | 'mentions'>, entityId: string) {
    const entity = edition.entities.find(entity => entity.id === entityId);
    if (!entity) throw new Error('Unknown entity ' + entityId);
    const forms = [...new Set(edition.mentions.filter(mention => mention.entityIds.includes(entityId)).map(mention => mention.label.replace(/\s+/g, ' ').trim()).filter(Boolean))].sort();
    if (entity.label?.trim()) return { label: entity.label, source: 'register' as const, forms };
    if (forms.length) return { label: forms.join(' / '), source: 'text' as const, forms };
    return { label: `Unnamed ${entity.kind}`, source: 'missing' as const, forms };
}
