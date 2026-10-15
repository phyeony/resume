import { describe, expect, it } from 'vitest';
import { articleFromUrl, buildQuery, domainHints, fame, lastMonth, nameVariants, parseResults, pickArticle, siteDomain, siteLabel, type Candidate } from './fame';

describe('siteLabel and domainHints', () => {
  it('takes the name part of a host', () => {
    expect(siteLabel('https://careers.microsoft.com/x')).toBe('microsoft');
    expect(siteLabel('http://www.lifefitness.com.cn/index')).toBe('lifefitness');
    expect(siteLabel('https://ramp.com/')).toBe('ramp');
    expect(siteLabel('https://about.google/')).toBe('google');
    expect(siteLabel('https://careers.acme.co.uk/x')).toBe('acme');
    expect(siteLabel('nope')).toBeNull();
    expect(siteLabel('https://jobs.com/x')).toBe('jobs');
    expect(siteDomain('https://about.google/')).toBe('google');
    expect(siteDomain('http://www.lifefitness.com.cn/index')).toBe('lifefitness.com.cn');
    expect(siteDomain('https://careers.microsoft.com/x')).toBe('microsoft.com');
  });
  it('uses the company site and non-board posting hosts', () => {
    expect(domainHints({ url: 'https://jobs.ashbyhq.com/ramp/1', companySite: 'https://www.ramp.com' })).toEqual(['ramp.com']);
    expect(domainHints({ url: 'https://www.amazon.jobs/jobs/1/apply' })).toEqual(['amazon.jobs']);
    expect(domainHints({ url: 'https://nvidia.wd5.myworkdayjobs.com/en-US/x' })).toEqual(['nvidia']);
    expect(domainHints({ url: 'https://boards.greenhouse.io/figma/jobs/1' })).toEqual([]);
  });
});

it('nameVariants adds legal suffixes and normal case, and keeps shortened names apart', () => {
  expect(nameVariants('Anduril Industries')).toEqual({ full: ['Anduril Industries'], short: ['Anduril'] });
  expect(nameVariants('Acme Labs, Inc.')).toEqual({ full: ['Acme Labs, Inc.'], short: ['Acme Labs', 'Acme'] });
  expect(nameVariants('KLA')).toEqual({ full: ['KLA', 'KLA Corporation', 'KLA Inc.', 'KLA Company', 'KLA Group'], short: [] });
  expect(nameVariants('NVIDIA').full.slice(0, 2)).toEqual(['NVIDIA', 'Nvidia']);
});

it('buildQuery escapes names and asks for both label languages', () => {
  const q = buildQuery(['Say "Hi"']);
  expect(q).toContain('"Say \\"Hi\\""@en "Say \\"Hi\\""@mul');
});

// Shaped like real Wikidata answers.
const row = (name: string, item: string, title: string, langs: number, site?: string, desc = '') => ({
  name: { value: name },
  item: { value: `http://www.wikidata.org/entity/${item}` },
  article: { value: `https://en.wikipedia.org/wiki/${title}` },
  langs: { value: String(langs) },
  ...(site ? { site: { value: site } } : {}),
  desc: { value: desc },
});
const cands: Candidate[] = parseResults({
  results: {
    bindings: [
      row('Ramp', 'Q1', 'Ramp_(Portuguese_band)', 5, 'http://rampmetal.com/', 'Portuguese thrash metal band'),
      row('Ramp', 'Q2', 'Ramp_(disambiguation)', 6, undefined, 'Wikimedia disambiguation page'),
      row('Ramp', 'Q3', 'Ramp_(company)', 3, 'https://ramp.com/', 'American financial technology company'),
      row('Wing', 'Q4', 'Wing_(singer)', 14, 'https://wingmusic.co.nz/', 'singer'),
      row('Wing', 'Q5', 'Wing_Aviation', 4, 'https://x.company/wing', 'drone freight delivery company by alphabet inc.'),
      row('Wing', 'Q5', 'Wing_Aviation', 4, 'https://wing.com/', 'drone freight delivery company by alphabet inc.'),
      row('Anduril', 'Q6', 'Anduril_(workflow_engine)', 1, 'http://anduril.org/site/', 'data analysis framework'),
      row('Anduril Industries', 'Q7', 'Anduril_Industries', 12, 'https://www.anduril.com/', 'American defense technology company'),
      row('Figma', 'Q8', 'Figma_(toy)', 8, undefined, 'brand of Japanese action figures'),
      row('Figma', 'Q9', 'Figma', 32, 'https://www.figma.com', 'online vector graphics editor and prototyping tool'),
      row('RTX', 'Q10', 'RTX_(operating_system)', 5, 'http://www.intervalzero.com/', 'operating system'),
      row('RTX', 'Q11', 'RTX_Corporation', 25, 'https://www.rtx.com/', 'American multinational aerospace and defense conglomerate'),
      row('Notion', 'Q12', 'Notion_(music_software)', 2, 'http://www.presonus.com/products/notion', 'music notation software program'),
      row('Notion', 'Q13', 'Notion_(productivity_software)', 23, 'https://www.notion.com', 'productivity software'),
      row('Jane Street', 'Q14', 'Jane_Street_Capital', 5, 'https://www.janestreet.com', 'wholesaling platform'),
      row('Tessera', 'Q15', 'Xperi', 3, 'https://www.xperi.com', 'American technology company'),
      row('CAI', 'Q16', 'Club_Alpino_Italiano', 16, 'https://www.cai.it', 'Italian mountaineering club'),
      row('Google', 'Q17', 'Google_Search', 128, 'https://www.google.com', 'search engine from Google'),
      row('Google', 'Q18', 'Google', 211, 'https://about.google/', 'American multinational technology company, a subsidiary of Alphabet Inc.'),
      row('CAI', 'Q20', 'Corendon_Airlines', 26, 'https://www.corendonairlines.com', 'Turkish airline company'),
      row('KLA Corporation', 'Q19', 'KLA_Corporation', 9, 'https://www.kla.com', 'American capital equipment company'),
    ],
  },
});

describe('pickArticle', () => {
  it('collects websites per item', () => {
    expect(cands.find((c) => c.item.endsWith('Q5'))!.sites).toEqual(['https://x.company/wing', 'https://wing.com/']);
    expect(cands.find((c) => c.item.endsWith('Q3'))!.article).toBe('Ramp (company)');
  });
  it('prefers the website the lead points at', () => {
    expect(pickArticle('Wing', ['wing.com'], cands)).toEqual({ article: 'Wing Aviation', langs: 4, matchedBy: 'site' });
    expect(pickArticle('Wing', ['wing'], cands)?.matchedBy).toBe('site');
  });
  it('compares whole domains, not just names', () => {
    expect(pickArticle('CAI', ['cai.io'], cands)).toBeNull();
    expect(pickArticle('CAI', ['cai'], cands)).toBeNull(); // a bare short name needs a company description
  });
  it('finds a company under its legal name', () => {
    expect(pickArticle('KLA', [], cands)?.article).toBe('KLA Corporation');
  });
  it('prefers the company to its product', () => {
    expect(pickArticle('Google', ['google.com'], cands)?.article).toBe('Google');
  });
  it('then a website named like the company', () => {
    expect(pickArticle('Ramp', [], cands)?.article).toBe('Ramp (company)');
    expect(pickArticle('Figma', [], cands)).toEqual({ article: 'Figma', langs: 32, matchedBy: 'name' });
    expect(pickArticle('RTX', [], cands)?.article).toBe('RTX Corporation');
    expect(pickArticle('Notion', [], cands)?.article).toBe('Notion (productivity software)');
    expect(pickArticle('Jane Street', [], cands)?.article).toBe('Jane Street Capital');
  });
  it('picks the most-linked when several match', () => {
    expect(pickArticle('Anduril Industries', [], cands)?.article).toBe('Anduril Industries');
  });
  it('gives up rather than guess', () => {
    expect(pickArticle('Wing', [], cands)).toEqual({ article: 'Wing Aviation', langs: 4, matchedBy: 'name' });
    expect(pickArticle('Tessera Labs', [], cands)).toBeNull(); // "Tessera" is Xperi's old name
    expect(pickArticle('CAI', [], cands)).toBeNull(); // cai.it, but a club
  });
});

describe('fame', () => {
  it('uses views, else estimates from languages', () => {
    expect(fame({ key: 'a', name: 'A', article: 'A', views: 29_525, langs: 13 })).toBe(29_525);
    expect(fame({ key: 'a', name: 'A', article: 'A', langs: 13 })).toBe(13_000);
    expect(fame({ key: 'a', name: 'A', article: null })).toBeNull();
    expect(fame(undefined)).toBeNull();
  });
  it('knows last month and article links', () => {
    expect(lastMonth(Date.UTC(2026, 0, 15))).toBe('2025-12');
    expect(articleFromUrl('https://en.m.wikipedia.org/wiki/Ramp_(company)?x=1')).toBe('Ramp (company)');
    expect(articleFromUrl('https://example.com')).toBeNull();
  });
});
