import { describe, expect, it } from 'vitest';
import type { CompanyInfo, Lead, Library } from '../model/types';
import { groupByCompany, matchPrefs, scoreLead, sortLeads, yearlyPay } from './leadSort';

const lead = (p: Partial<Lead>): Lead => ({ id: Math.random().toString(), company: 'Acme', role: 'Software Engineer Intern', url: 'https://a.com', source: 'Simplify', addedAt: 0, postedAt: 0, status: 'new', ...p });
const library = { skills: [{ id: 'c', name: 'Languages', items: [{ id: '1', text: 'Go', isDefault: true }, { id: '2', text: 'C++', isDefault: true }, { id: '3', text: 'iOS', isDefault: true }] }] } as unknown as Library;

describe('scoreLead', () => {
  const p = matchPrefs({ prefer: 'backend, full stack', preferPlaces: 'new york, remote' }, library);

  it('adds up preferred words, place, skills and tier, and says why', () => {
    expect(scoreLead(lead({ role: 'Backend Engineer Intern (Go, C++)', location: 'New York, NY', tier: 'faang' }), p)).toEqual({
      score: 3 + 2 + 2 + 1,
      reasons: ['backend', 'new york', 'go', 'c++', 'FAANG+'],
    });
  });
  it('matches whole words only', () => {
    expect(scoreLead(lead({ role: 'Google Software Intern', company: 'Google' }), p).score).toBe(0);
    expect(scoreLead(lead({ role: 'Full Stack / iOS Intern' }), p).reasons).toEqual(['full stack', 'ios']);
  });
});

describe('sortLeads', () => {
  const a = lead({ company: 'Zeta', role: 'Backend Intern', postedAt: 1, salary: '$40/hr' });
  const b = lead({ company: 'Alpha', role: 'Intern', postedAt: 3 });
  const c = lead({ company: 'Mid', role: 'Intern', postedAt: 2, salary: '$120,000 / year' });
  const p = matchPrefs({ prefer: 'backend', preferPlaces: '' }, null);

  it('sorts four ways, newest breaking ties', () => {
    expect(sortLeads([a, b, c], 'match', p)).toEqual([a, b, c]);
    expect(sortLeads([a, b, c], 'newest', p)).toEqual([b, c, a]);
    expect(sortLeads([a, b, c], 'company', p)).toEqual([b, c, a]);
    expect(sortLeads([a, b, c], 'salary', p)).toEqual([c, a, b]);
  });
  it('compares pay per year', () => {
    expect(yearlyPay(a)).toBe(40 * 2080);
    expect(yearlyPay(b)).toBeNull();
  });
  it('groups by company in sorted order', () => {
    const x = lead({ company: 'Amazon', postedAt: 9 });
    const y = lead({ company: 'amazon ', postedAt: 1 });
    expect(groupByCompany(sortLeads([y, b, x], 'newest', p)).map((g) => [g.company, g.leads.length])).toEqual([
      ['Amazon', 2],
      ['Alpha', 1],
    ]);
  });
});

describe('best known', () => {
  const info = (name: string, p: Partial<CompanyInfo>): [string, CompanyInfo] => [name.toLowerCase(), { key: name.toLowerCase(), name, ...p }];
  const companies = new Map([
    info('Amazon', { article: 'Amazon (company)', views: 400_000 }),
    info('Ramp', { article: 'Ramp (company)', langs: 3 }),
    info('Tiny', { article: null, starred: true }),
    info('Databricks', { article: 'Databricks', views: 29_000 }),
  ]);
  const p = matchPrefs({ prefer: '', preferPlaces: '' }, null, companies);
  const [amazon, ramp, tiny, dbx, nobody, quant] = ['Amazon', 'Ramp', 'Tiny', 'Databricks', 'Nobody', 'Quanty'].map((company) =>
    lead({ company, tier: company === 'Quanty' ? 'quant' : undefined }),
  );

  it('puts stars first, then fame, then tier', () => {
    expect(sortLeads([nobody, ramp, quant, dbx, tiny, amazon], 'known', p).map((l) => l.company)).toEqual([
      'Tiny', 'Amazon', 'Databricks', 'Ramp', 'Quanty', 'Nobody',
    ]);
  });
  it('counts stars and fame in best match', () => {
    expect(scoreLead(tiny, p)).toEqual({ score: 5, reasons: ['★ starred'] });
    expect(scoreLead(amazon, p)).toEqual({ score: 2, reasons: ['well known'] });
    expect(scoreLead(dbx, p)).toEqual({ score: 1, reasons: ['known'] });
    expect(scoreLead(ramp, p).score).toBe(0);
  });
});
