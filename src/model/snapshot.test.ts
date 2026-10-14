import { describe, expect, it } from 'vitest';
import { seedLibrary, seedProfile } from '../data/seed';
import { buildSnapshot, defaultLayout, defaultSelection, linkHref, linkLabel } from './snapshot';

describe('buildSnapshot', () => {
  it('uses only default items for a fresh selection', () => {
    const snap = buildSnapshot(seedProfile, seedLibrary, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const work = snap.sections.find((s) => s.key === 'work')!;
    const scotia = work.entries!.find((e) => e.org === 'Scotiabank, ON')!;
    expect(scotia.bullets).toHaveLength(4);
    expect(scotia.bullets.join(' ')).not.toContain('12%');
    expect(snap.contacts.map((c) => c.id)).not.toContain('c-sfu');
  });

  it('applies per-version wording overrides without touching the library', () => {
    const sel = defaultSelection(seedLibrary);
    const snap = buildSnapshot(seedProfile, seedLibrary, sel, { 'b-cam-1': 'Reworded' }, defaultLayout(seedProfile));
    const cambian = snap.sections.find((s) => s.key === 'work')!.entries![1];
    expect(cambian.bullets[0]).toBe('Reworded');
    expect(seedLibrary.entries.find((e) => e.id === 'e-cambian')!.bullets[0].text).not.toBe('Reworded');
  });

  it('follows section order and drops empty sections', () => {
    const sel = { ...defaultSelection(seedLibrary), entryIds: ['e-sfu', 'e-kaf'] };
    const layout = { sectionOrder: ['education', 'work', 'projects', 'skills'] as const, contactIds: ['c-github'] };
    const snap = buildSnapshot(seedProfile, seedLibrary, sel, {}, { ...layout, sectionOrder: [...layout.sectionOrder] });
    expect(snap.sections.map((s) => s.key)).toEqual(['education', 'work', 'skills']);
    expect(snap.contacts.map((c) => c.label)).toEqual(['phyeony']);
  });

  it('skips archived entries even if selected', () => {
    const lib = { ...seedLibrary, entries: seedLibrary.entries.map((e) => (e.id === 'e-byo' ? { ...e, archived: true } : e)) };
    const snap = buildSnapshot(seedProfile, lib, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const titles = snap.sections.flatMap((s) => s.entries ?? []).map((e) => e.title);
    expect(titles).not.toContain('BYO (Bring Your Own Cup)');
  });

  it('turns a typed project link into a full address', () => {
    const lib = { ...seedLibrary, entries: seedLibrary.entries.map((e) => (e.id === 'e-byo' ? { ...e, url: ' goshiwonseoul.com ' } : e)) };
    const snap = buildSnapshot(seedProfile, lib, defaultSelection(seedLibrary), {}, defaultLayout(seedProfile));
    const byo = snap.sections.flatMap((s) => s.entries ?? []).find((e) => e.title.startsWith('BYO'))!;
    expect(byo.url).toBe('https://goshiwonseoul.com');
    const others = snap.sections.flatMap((s) => s.entries ?? []).filter((e) => e !== byo);
    expect(others.every((e) => !('url' in e))).toBe(true);
  });
});

describe('project links', () => {
  it('keeps http(s) addresses and adds https:// otherwise', () => {
    expect(linkHref('goshiwonseoul.com')).toBe('https://goshiwonseoul.com');
    expect(linkHref('http://example.com/a')).toBe('http://example.com/a');
    expect(linkHref('example.com:8080')).toBe('https://example.com:8080');
  });

  it('shows a short label', () => {
    expect(linkLabel('https://www.goshiwonseoul.com/')).toBe('goshiwonseoul.com');
    expect(linkLabel('https://example.com/app')).toBe('example.com/app');
  });
});
