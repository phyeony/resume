import { describe, expect, it } from 'vitest';
import { seedLibrary, seedProfile } from '../data/seed';
import { buildSnapshot, defaultLayout, defaultSelection } from './snapshot';

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
});
