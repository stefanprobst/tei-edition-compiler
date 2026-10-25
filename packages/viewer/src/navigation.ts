/** Reader URLs encode opaque IR identities, never source selectors or XML instructions. */
export type ReaderLocation = { documentId: string; recordIds: string[]; partId?: string; choices?: { groupId: string; candidateId: string }[]; candidateDeletionText?: 'retain' | 'omit' };

export function readerHash(location: ReaderLocation): string {
    const parameters = new URLSearchParams({ document: location.documentId });
    for (const id of location.recordIds) parameters.append('record', id);
    if (location.partId) parameters.set('part', location.partId);
    for (const choice of location.choices ?? []) parameters.append('choice', JSON.stringify([choice.groupId, choice.candidateId]));
    if (location.candidateDeletionText) parameters.set('candidateDeletions', location.candidateDeletionText);
    return '#' + parameters.toString();
}

export function readReaderHash(hash: string): ReaderLocation | undefined {
    const parameters = new URLSearchParams(hash.replace(/^#/, ''));
    const documentId = parameters.get('document');
    if (!documentId) return undefined;
    const choices: NonNullable<ReaderLocation['choices']> = [];
    for (const token of parameters.getAll('choice')) {
        try { const pair: unknown = JSON.parse(token); if (Array.isArray(pair) && pair.length === 2 && pair.every(id => typeof id === 'string')) choices.push({ groupId: pair[0], candidateId: pair[1] }); } catch {}
    }
    const policy = parameters.get('candidateDeletions');
    return { documentId, ...(choices.length ? { choices } : {}), ...(['retain', 'omit'].includes(policy ?? '') ? { candidateDeletionText: policy as 'retain' | 'omit' } : {}), recordIds: parameters.getAll('record'), ...(parameters.get('part') ? { partId: parameters.get('part')! } : {}) };
}
