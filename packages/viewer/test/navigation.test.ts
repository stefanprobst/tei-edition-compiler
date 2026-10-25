import { expect, test } from 'bun:test';
import { readReaderHash, readerHash } from '../src/navigation';

test('reader locations round-trip opaque identities and overlapping inspector selections', () => {
    const route = { documentId: 'doc #&?😀', recordIds: ['a:id("opaque")/x[1]', 'other&record'], partId: 'part/one#two' };
    expect(readReaderHash(readerHash(route))).toEqual(route);
    expect(readReaderHash(readerHash({ documentId: 'photo', recordIds: [] }))).toEqual({ documentId: 'photo', recordIds: [] });
});

test('missing or malformed reader routes do not select a fabricated document', () => {
    for (const hash of ['', '#', '#record=unknown', '#document=']) expect(readReaderHash(hash)).toBeUndefined();
    expect(readReaderHash('#document=unknown&record=missing')).toEqual({ documentId: 'unknown', recordIds: ['missing'] });
});

test('reading choices and candidate policies survive URL round trips without implying a choice', () => {
    const route = { documentId: 'doc', recordIds: [], choices: [{ groupId: 'group #?&', candidateId: 'candidate 😀' }], candidateDeletionText: 'omit' as const };
    expect(readReaderHash(readerHash(route))).toEqual(route);
    expect(readReaderHash('#document=doc&choice=bad&candidateDeletions=guess')).toEqual({ documentId: 'doc', recordIds: [] });
});
