import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { seedLibrary, seedProfile } from '../data/seed';
import { buildSnapshot, defaultLayout, defaultSelection } from '../model/snapshot';
import { buildDocx } from './docx';

const template = readFileSync(new URL('./template.docx', import.meta.url));

describe('buildDocx', () => {
  it('writes the resume into the template', async () => {
    const snap = buildSnapshot(seedProfile, seedLibrary, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const bytes = await buildDocx(snap, template);
    if (process.env.DOCX_OUT) writeFileSync(process.env.DOCX_OUT, bytes);

    const zip = await JSZip.loadAsync(bytes);
    const doc = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');

    expect(doc).not.toContain('{{BODY}}');
    expect(doc).toContain('Work Experience');
    expect(doc).toContain('Data Structures &amp; Algorithm');
    expect(doc).toContain('<w:numId w:val="3"/>');
    expect(doc).not.toContain('Volunteer');
    expect(rels).toContain('https://github.com/phyeony');
    // every hyperlink r:id must have a relationship
    for (const [, id] of doc.matchAll(/<w:hyperlink r:id="([^"]+)"/g)) expect(rels).toContain(`Id="${id}"`);
    // contact icons only reference images that exist in the template
    for (const [, id] of doc.matchAll(/r:embed="([^"]+)"/g)) expect(rels).toContain(`Id="${id}"`);
  });

  it('links a project to its address', async () => {
    const lib = { ...seedLibrary, entries: seedLibrary.entries.map((e) => (e.id === 'e-byo' ? { ...e, url: 'goshiwonseoul.com' } : e)) };
    const snap = buildSnapshot(seedProfile, lib, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const zip = await JSZip.loadAsync(await buildDocx(snap, template));
    const doc = await zip.file('word/document.xml')!.async('string');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    expect(doc).toContain('>goshiwonseoul.com</w:t>');
    expect(rels).toContain('Target="https://goshiwonseoul.com"');
  });
});
