import { expect, test } from 'bun:test';
import { partLanguageRuns, projectDocumentText, projectSourceRange } from '@tei-edition/ir';
import { compile, createSourceIndex } from '../src';

function source(body: string, language = 'en', header = '') {
    return { name: 'language.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="language"><teiHeader><fileDesc><titleStmt><title>Language</title></titleStmt></fileDesc>${header}</teiHeader><text><body><div type="transcription"${language === 'absent' ? '' : ` xml:lang="${language}"`}>${body}</div></body></text></TEI>` };
}

test('inherited part defaults and transparent block declarations survive without duplicating text', () => {
    const input = source('English<ab xml:lang="de">Deutsch</ab>English');
    const edition = compile([input]), part = edition.documents[0].parts[0];
    const runs = partLanguageRuns(edition, part.id);
    expect(runs.map(r => [part.content!.text.slice(r.start, r.end), r.language])).toEqual([['English', 'en'], ['Deutsch\n', 'de'], ['English', 'en']]);
    const declarations = edition.annotations.filter(a => a.kind === 'language');
    expect(declarations.every(a => a.body === undefined)).toBe(true);
    const index = createSourceIndex(input);
    expect(declarations.filter(a => a.details.scope === 'part').every(a => index.resolve(a.provenance)?.getAttribute('xml:lang') === 'en')).toBe(true);
});

test('nested declarations override enclosing declarations even when their ranges coincide', () => {
    const edition = compile([source('<ab xml:lang="de"><foreign xml:lang="fr">mot</foreign></ab>')]);
    const part = edition.documents[0].parts[0], runs = partLanguageRuns(edition, part.id);
    expect(runs[0].language).toBe('fr');
    expect(runs.at(-1)?.language).toBe('de');
    const inner = edition.annotations.find(a => a.kind === 'language' && a.details.language === 'fr')!;
    expect(inner.details.depth).toBe('2');
    expect(runs[0].annotationIds).toEqual([inner.id]);
});

test('explicit unknown resets stop inheritance and nested parts inherit their nearest declaration', () => {
    const edition = compile([source('A<seg xml:lang="">unknown<div type="letter">letter</div></seg>B')]);
    const [parent, child] = edition.documents[0].parts;
    expect(partLanguageRuns(edition, parent.id).map(r => r.language)).toEqual(['en', undefined, 'en']);
    expect(partLanguageRuns(edition, child.id)).toMatchObject([{ conflicted: false }]);
    expect(partLanguageRuns(edition, child.id)[0].language).toBeUndefined();
    const inherited = edition.annotations.find(a => a.kind === 'language' && a.details.scope === 'part' && a.range?.partId === child.id)!;
    expect(inherited.details.language).toBe('');
    expect(inherited.provenance.selector).toContain('/seg[1]');
});

test('document language inventories do not invent a default for undeclared text', () => {
    const edition = compile([source('Unknown', 'absent', '<profileDesc><langUsage><language ident="en">English</language></langUsage></profileDesc>')]);
    const part = edition.documents[0].parts[0];
    expect(edition.documents[0].metadata.languages).toEqual(['en']);
    expect(partLanguageRuns(edition, part.id)).toEqual([{ start: 0, end: 7, annotationIds: [], conflicted: false }]);
});

test('tied contradictory declarations remain unknown with explicit conflict evidence', () => {
    const edition = compile([source('text')]);
    const declaration = edition.annotations.find(a => a.kind === 'language')!;
    edition.annotations.push({ ...declaration, id: 'conflict', details: { ...declaration.details, language: 'fr' } });
    const runs = partLanguageRuns(edition, edition.documents[0].parts[0].id);
    expect(runs[0].language).toBeUndefined(); expect(runs[0].conflicted).toBe(true);
    expect(runs[0].annotationIds).toHaveLength(2);
    edition.annotations.at(-1)!.details.language = 'EN';
    expect(partLanguageRuns(edition, edition.documents[0].parts[0].id)[0].conflicted).toBe(false);
});

test('language ranges map through deleted text and explicit spacing projections', () => {
    const edition = compile([source('A<ab xml:lang="de">B<space quantity="2" unit="char"/><del>X</del>C</ab>D')]);
    const part = edition.documents[0].parts[0];
    const german = partLanguageRuns(edition, part.id).find(r => r.language === 'de')!;
    const projection = projectDocumentText(edition, 'language', { deletionText: 'omit', spacing: 'characters' });
    expect(projection.text).toBe('AB  C\nD');
    expect(projectSourceRange(projection, { partId: part.id, start: german.start, end: german.end }).map(r => projection.text.slice(r.start, r.end)).join('')).toBe('B  C\n');
});

test('empty parts and unknown part IDs behave explicitly', () => {
    const edition = compile([source('<div type="photo"><pb/></div>')]);
    for (const part of edition.documents[0].parts) expect(partLanguageRuns(edition, part.id)).toEqual([]);
    expect(() => partLanguageRuns(edition, 'missing')).toThrow('Unknown part');
});

test('real corpus German blocks, inherited English and unlabelled photographs stay distinct', async () => {
    const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = compile(sources);
    for (const document of edition.documents) {
        for (const part of document.parts) {
            const runs = partLanguageRuns(edition, part.id);
            expect(runs.every(r => !r.conflicted)).toBe(true);
            expect(runs.reduce((count, r) => count + r.end - r.start, 0)).toBe(part.content?.text.length ?? 0);
        }
    }
    const letter = edition.documents[0];
    expect(letter.parts.flatMap(p => partLanguageRuns(edition, p.id)).some(r => r.language === 'de')).toBe(true);
    expect(letter.parts.flatMap(p => partLanguageRuns(edition, p.id)).some(r => r.language === 'en')).toBe(true);
    expect(edition.documents[2].parts.flatMap(p => partLanguageRuns(edition, p.id))).toEqual([]);
    const index = createSourceIndex(sources[0]);
    const blocks = edition.annotations.filter(a => a.kind === 'language' && a.details.scope === 'span' && a.provenance.source === 'amp-transcript__0001.xml' && index.resolve(a.provenance)?.localName === 'ab');
    expect(blocks).toHaveLength(2);
});
