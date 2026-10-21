import { describe, expect, it } from 'vitest';
import type { Lead } from '../model/types';
import { buildHistory, defaultTerm, inPlaces, openingKey, parseTerm, predict, regionsOf, sortPredictions, upcomingTerms, type CompanyHistory, type OpeningsData, type Term } from './openings';

const S = (year: number): Term => ({ season: 'S', year });
const at = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

function history(postings: [string, Term?][]): CompanyHistory {
  return { key: 'sap', name: 'SAP', titles: [], postings: postings.map(([d, term]) => ({ at: at(d), ...(term ? { term } : {}) })) };
}

describe('parseTerm', () => {
  it('reads seasons and start months', () => {
    expect(parseTerm('Software Engineering Intern (Summer 2027)')).toEqual(S(2027));
    expect(parseTerm('SAP iXp Intern · 8mo · Sept 2026 - Apr 2027')).toEqual({ season: 'F', year: 2026 });
    expect(parseTerm('Intern · Fall 2026-Spring 2027')).toEqual({ season: 'F', year: 2026 });
    expect(parseTerm('Co-op · 4mo · Winter 2027')).toEqual({ season: 'W', year: 2027 });
    expect(parseTerm('Intern · May 2027')).toEqual(S(2027));
    expect(parseTerm('Software Developer Intern')).toBeUndefined();
  });
});

describe('openingKey', () => {
  it('drops company suffixes', () => {
    expect(openingKey('Sap Inc.')).toBe('sap');
    expect(openingKey('Royal Bank of Canada')).toBe('royalbankofcanada');
    expect(openingKey('Co')).toBe('co');
  });
});

describe('predict', () => {
  const sap = history([
    ['2024-09-10', S(2025)],
    ['2024-10-01', S(2025)],
    ['2024-12-01', S(2025)],
    ['2025-09-02', S(2026)],
    ['2025-09-20', S(2026)],
    ['2026-01-15', S(2026)],
    ['2025-06-01', { season: 'F', year: 2025 }],
  ]);

  it('moves past first postings into the target year', () => {
    const p = predict(sap, S(2027), at('2026-07-01'));
    expect(p.cycles.map((c) => c.term.year)).toEqual([2025, 2026]);
    // Sep 10 and Sep 2 before their summers: about Sep 6 2026.
    expect(new Date(p.expectedFirst!).toDateString()).toMatch(/Sep 0[5-7] 2026/);
    expect(p.confidence).toBe('high');
    expect(p.status).toBe('later');
  });

  it('says soon, due, then open as the term nears', () => {
    expect(predict(sap, S(2027), at('2026-08-15')).status).toBe('soon');
    expect(predict(sap, S(2027), at('2026-10-01')).status).toBe('due');
    const open = { ...sap, postings: [...sap.postings, { at: at('2026-09-12'), term: S(2027) }] };
    const p = predict(open, S(2027), at('2026-10-01'));
    expect(p.status).toBe('open');
    expect(p.seen).toHaveLength(1);
  });

  it('ignores postings dated well after their term began', () => {
    const late = history([['2026-09-15', S(2026)], ['2025-09-02', S(2026)]]);
    expect(predict(late, S(2027), at('2026-07-01')).cycles[0].count).toBe(1);
  });

  it('counts a job open to several terms as open, but not toward past windows', () => {
    const multi = { ...sap, postings: [...sap.postings, { at: at('2026-09-11'), anyOf: [S(2027), { season: 'F' as const, year: 2027 }] }] };
    const p = predict(multi, S(2027), at('2026-10-01'));
    expect(p.status).toBe('open');
    expect(predict(multi, { season: 'F', year: 2027 }, at('2026-10-01')).seen).toHaveLength(1);
    expect(p.cycles).toEqual(predict(sap, S(2027), at('2026-10-01')).cycles);
  });

  it('ignores an evergreen posting from long before the term', () => {
    const old = { ...sap, postings: [...sap.postings, { at: at('2024-10-17'), anyOf: [S(2026), S(2027), S(2028)] }] };
    expect(predict(old, S(2027), at('2026-10-01')).seen).toHaveLength(0);
  });

  it('has no window without the same season before', () => {
    const p = predict(sap, { season: 'W', year: 2027 }, at('2026-07-01'));
    expect(p.status).toBe('unknown');
    expect(p.expectedFirst).toBeUndefined();
  });
});

describe('buildHistory', () => {
  const data: OpeningsData = {
    generatedAt: '2026-10-21',
    epoch: '2020-01-01',
    sources: [],
    places: ['', 'Vancouver, BC'],
    companies: [{ k: 'sap', n: 'SAP', p: [[2000, 'S25', 1], [2010, '', 0], [2020, 'F27|S27|W27', 1]], t: ['SAP iXp Intern'] }],
  };

  it('decodes days and terms', () => {
    const [h] = buildHistory(data);
    expect(h.postings[0].term).toEqual(S(2025));
    expect(h.postings[1].term).toBeUndefined();
    expect(h.postings[0].where).toBe('Vancouver, BC');
    expect(h.postings[1].where).toBeUndefined();
    expect(h.postings[2].term).toBeUndefined();
    expect(h.postings[2].anyOf).toHaveLength(3);
    expect(new Date(h.postings[0].at).getFullYear()).toBe(2025);
  });

  it('adds leads the lists missed', () => {
    const lead: Lead = { id: 'l', company: 'SAP', role: 'SAP iXp Intern (Summer 2027)', url: 'https://x', source: 'LinkedIn', addedAt: at('2026-09-01'), status: 'new' };
    const h = buildHistory(data, [lead]).find((c) => c.key === 'sap')!;
    expect(h.postings.at(-1)?.term).toEqual(S(2027));
    expect(h.titles[0]).toBe(lead.role);
    expect(buildHistory(data, [{ ...lead, company: 'Shopify' }]).map((c) => c.name)).toContain('Shopify');
  });
});

describe('terms', () => {
  it('lists upcoming terms and picks one far enough out to plan for', () => {
    expect(upcomingTerms(at('2026-10-21'), 3).map((t) => `${t.season}${t.year}`)).toEqual(['W2027', 'S2027', 'F2027']);
    expect(defaultTerm(at('2026-10-21'))).toEqual(S(2027));
  });
});

describe('places', () => {
  it('reads regions from locations', () => {
    expect(regionsOf('Vancouver, British Columbia (Hybrid)')).toEqual(['canada']);
    expect(regionsOf('Montréal, QC (Onsite)')).toEqual(['canada']);
    expect(regionsOf('Toronto, ON / Seattle, WA')).toEqual(['canada', 'usa']);
    expect(regionsOf('Palo Alto, CA')).toEqual(['usa']);
    expect(regionsOf('Remote in Canada')).toEqual(['canada', 'remote']);
    expect(regionsOf('London, UK')).toEqual(['elsewhere']);
    expect(regionsOf(undefined)).toEqual([]);
  });

  it('keeps only postings in the chosen places', () => {
    const h: CompanyHistory = {
      key: 'sap',
      name: 'SAP',
      titles: [],
      postings: [
        { at: at('2025-01-10'), term: S(2025), where: 'Palo Alto, CA' },
        { at: at('2026-01-14'), term: S(2026), where: 'Vancouver, BC' },
        { at: at('2026-02-01'), term: S(2026), where: 'Montreal, QC' },
        { at: at('2026-02-02'), term: S(2026) },
      ],
    };
    expect(inPlaces(h, { regions: [], places: [] })).toBe(h);
    expect(inPlaces(h, { regions: ['canada'], places: [] }).postings).toHaveLength(2);
    expect(inPlaces(h, { regions: ['canada'], places: ['vancouver'] }).postings).toHaveLength(1);
    expect(predict(inPlaces(h, { regions: ['canada'], places: [] }), S(2027)).cycles.map((c) => c.term.year)).toEqual([2026]);
  });
});

describe('sortPredictions', () => {
  const mk = (first: string, n: number) =>
    predict(history(Array.from({ length: n }, () => [first, S(2026)] as [string, Term])), S(2027), at('2026-06-01'));
  const a = { ...mk('2025-09-01', 1), company: { key: 'b', name: 'Beta', titles: [], postings: [] } };
  const b = { ...mk('2026-01-10', 3), company: { key: 'a', name: 'Alpha', titles: [], postings: [] } };

  it('sorts soonest, by postings, by name, and by fame', () => {
    expect(sortPredictions([b, a]).map((p) => p.company.name)).toEqual(['Beta', 'Alpha']);
    expect(sortPredictions([a, b], 'postings').map((p) => p.company.name)).toEqual(['Alpha', 'Beta']);
    expect(sortPredictions([a, b], 'company').map((p) => p.company.name)).toEqual(['Alpha', 'Beta']);
    expect(sortPredictions([a, b], 'known', (p) => (p.company.name === 'Alpha' ? [1, 0] : [0, 9e9])).map((p) => p.company.name)).toEqual(['Alpha', 'Beta']);
  });
});
