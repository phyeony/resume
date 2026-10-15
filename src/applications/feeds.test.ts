import { describe, expect, it } from 'vitest';
import type { Lead } from '../model/types';
import { newApplication } from './model';
import {
  DEFAULT_FEED_SETTINGS,
  filterJobs,
  parseHanzili,
  parseNegarprh,
  parseSimplify,
  parseSpeedyApply,
  planImport,
  companyFacts,
  type FeedJob,
} from './feeds';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 15);

describe('parseSimplify', () => {
  it('keeps open, visible listings', () => {
    const base = { company_name: 'Tessera Labs ', title: 'SWE Intern', url: 'https://jobs.ashbyhq.com/t/1', locations: ['NYC'], date_posted: NOW / 1000, category: 'Software', terms: ['Summer 2027'] };
    const jobs = parseSimplify([
      { ...base, id: 'a', active: true, is_visible: true },
      { ...base, id: 'b', active: false, is_visible: true },
      { ...base, id: 'c', active: true, is_visible: false },
    ]);
    expect(jobs).toEqual([
      { source: 'Simplify', sourceId: 'simplify:a', company: 'Tessera Labs', role: 'SWE Intern', url: base.url, locations: ['NYC'], postedAt: NOW, category: 'Software', terms: ['Summer 2027'] },
    ]);
  });
});

describe('parseSpeedyApply', () => {
  const md = [
    '| Company | Position | Location | Salary | Posting | Age |',
    '|---|---|---|---|---|---|',
    '| <a href="https://www.figma.com"><strong>Figma</strong></a> | PhD Intern - Graphics | San Francisco, CA +1 | $60/hr | <a href="https://boards.greenhouse.io/figma/jobs/62?gh_jid=62&amp;x=1"><img src="i.png" alt="Apply" width="70"/></a> | 1d |',
    '| Company | Position | Location | Posting | Age |',
    '|---|---|---|---|---|',
    '| <a href="http://lifefitness.com"><strong>Life Fitness</strong></a> | Android Software Intern | Schaumburg, IL | <a href="https://lf.wd1.myworkdayjobs.com/job/1"><img alt="Apply"/></a> | 2d |',
    '| <strong>AT&amp;T</strong> | Intern | Dallas, TX | <a href="https://att.jobs/2"><img alt="Apply"/></a> | 3w |',
    '| broken row | no link | x | y | 1d |',
  ].join('\n');

  it('reads both table shapes', () => {
    const jobs = parseSpeedyApply(md, NOW);
    expect(jobs.map((j) => [j.company, j.role, j.locations[0], j.salary, j.url, (NOW - j.postedAt!) / DAY])).toEqual([
      ['Figma', 'PhD Intern - Graphics', 'San Francisco, CA +1', '$60/hr', 'https://boards.greenhouse.io/figma/jobs/62?gh_jid=62&x=1', 1],
      ['Life Fitness', 'Android Software Intern', 'Schaumburg, IL', undefined, 'https://lf.wd1.myworkdayjobs.com/job/1', 2],
      ['AT&T', 'Intern', 'Dallas, TX', undefined, 'https://att.jobs/2', 21],
    ]);
    expect(jobs[0].sourceId).toBe('speedyapply:boards.greenhouse.io/figma/jobs/62?gh_jid=62&x=1');
  });
});

function job(p: Partial<FeedJob>): FeedJob {
  return { source: 'Simplify', sourceId: `s:${Math.random()}`, company: 'Acme', role: 'Software Engineer Intern', url: `https://acme.com/${Math.random()}`, locations: ['New York, NY'], postedAt: NOW - DAY, ...p };
}

describe('parseNegarprh', () => {
  const badge = '[![Apply](https://img.shields.io/badge/-Apply-blue?style=for-the-badge)]';
  const md = [
    '| Company | Role | Location | Apply | Date Posted |',
    '|--------|------|----------|:-----:|--------------|',
    `| Electronic Arts | Software Engineer Intern (Summer 2027) | Vancouver, BC | ${badge}(https://jobs.ea.com/1) | Oct 9, 2026 | `,
    ` | ↳ | Product Intern (Winter 2027/ Summer 2027) | Toronto, ON / Remote | ${badge}(https://jobs.ea.com/2) | Oct 8, 2026 |`,
    '| Varian | Co-op | Ottawa, ON | Closed🔒 | Oct 9, 2026 |',
    `| ↳ | Developer Co-op | Ottawa, ON | ${badge}(https://jobs.l3harris.com/job/Co-Op-(Waterdown,-CAN)/14/?ats=sf) | Sep 15, 2026 |`,
  ].join('\n');

  it('repeats the company for ↳, skips closed jobs and reads terms from the title', () => {
    const jobs = parseNegarprh(md);
    expect(jobs.map((j) => [j.company, j.role, j.locations, j.url, j.terms])).toEqual([
      ['Electronic Arts', 'Software Engineer Intern (Summer 2027)', ['Vancouver, BC'], 'https://jobs.ea.com/1', ['Summer 2027']],
      ['Electronic Arts', 'Product Intern (Winter 2027/ Summer 2027)', ['Toronto, ON', 'Remote'], 'https://jobs.ea.com/2', ['Winter 2027', 'Summer 2027']],
      ['Varian', 'Developer Co-op', ['Ottawa, ON'], 'https://jobs.l3harris.com/job/Co-Op-(Waterdown,-CAN)/14/?ats=sf', undefined],
    ]);
    expect(new Date(jobs[0].postedAt!).getDate()).toBe(9);
  });
});

describe('parseHanzili', () => {
  const md = [
    '## Software Engineering',
    '| Title | Company | Role | Company Info | Details | Location | Apply |',
    '|-------|---------|------|--------------|---------|----------|:-----:|',
    "| 🆕 🔥 Intern - Software Engineer <!--id:874195771--> | EQ Bank \\| Canada's Challenger Bank | Build APIs | Bank | Intern · 8mo · $67K CAD · Hiver/Winter 2027 | Toronto, ON (Hybrid) | [Apply](<https://jobs.lever.co/eqbank/c9?lever-source=Indeed>) |",
    '## Data / ML',
    '| Title | Company | Role | Company Info | Details | Location | Apply |',
    '|-------|---------|------|--------------|---------|----------|:-----:|',
    '| 🆕 ML Intern <!--id:12--> | Cohere | Train | AI | Intern | Remote | [Apply](<https://jobs.ashbyhq.com/cohere/1>) |',
    '## Startup / VC / Ops',
    '_No roles currently_',
  ].join('\n');

  it('reads the section as category, 🔥 as tier, salary and term from the details', () => {
    expect(parseHanzili(md)).toEqual([
      {
        source: 'hanzili Canada list',
        sourceId: 'hanzili:874195771',
        company: 'EQ Bank',
        role: 'Intern - Software Engineer',
        url: 'https://jobs.lever.co/eqbank/c9?lever-source=Indeed',
        locations: ['Toronto, ON (Hybrid)'],
        category: 'Software',
        salary: '$67K CAD',
        terms: ['Winter 2027'],
        tier: 'hot',
      },
      { source: 'hanzili Canada list', sourceId: 'hanzili:12', company: 'Cohere', role: 'ML Intern', url: 'https://jobs.ashbyhq.com/cohere/1', locations: ['Remote'], category: 'AI/ML/Data' },
    ]);
  });

  it('matches a term by any part of it', () => {
    const jobs = parseHanzili(md);
    expect(filterJobs(jobs, { ...DEFAULT_FEED_SETTINGS, categories: [], terms: ['2027'] }, NOW)).toHaveLength(2);
    expect(filterJobs(jobs, { ...DEFAULT_FEED_SETTINGS, categories: [], terms: ['summer 2027'] }, NOW)).toHaveLength(1);
  });

  it('passes the age filter without a posting date', () => {
    const jobs = parseHanzili(md);
    expect(filterJobs(jobs, { ...DEFAULT_FEED_SETTINGS, categories: [], terms: [] }, NOW)).toHaveLength(2);
  });
});

describe('filterJobs', () => {
  const s = { ...DEFAULT_FEED_SETTINGS };
  it('applies age, words, places, and Simplify categories and terms', () => {
    const keep = [
      job({ category: 'Software', terms: ['Summer 2027'] }),
      job({ category: 'Software Engineering', terms: ['Fall 2026', 'Summer 2027'] }),
      job({ source: 'SpeedyApply' }), // no category or terms: those filters don't apply
    ];
    const drop = [
      job({ postedAt: NOW - 8 * DAY }),
      job({ role: 'PhD Software Intern' }),
      job({ category: 'Hardware', terms: ['Summer 2027'] }),
      job({ category: 'Software', terms: ['Summer 2026'] }),
    ];
    expect(filterJobs([...keep, ...drop], s, NOW)).toEqual(keep);
    expect(filterJobs(keep, { ...s, locations: 'seattle, remote' }, NOW)).toEqual([]);
    expect(filterJobs(keep, { ...s, locations: 'new york' }, NOW)).toEqual(keep);
    expect(filterJobs(keep, { ...s, include: 'backend' }, NOW)).toEqual([]);
  });
});

describe('planImport', () => {
  let n = 0;
  const makeId = () => `l${++n}`;
  const lead = (p: Partial<Lead>): Lead => ({ id: 'x', company: '', role: '', url: '', source: 'Simplify', addedAt: 0, status: 'dismissed', ...p });

  it('skips what is already a lead, an application, or listed twice', () => {
    const app = { ...newApplication('a'), company: 'Ramp', role: 'SWE Intern - iOS', url: 'https://jobs.ashbyhq.com/ramp/1' };
    const plan = planImport(
      [
        job({ sourceId: 'simplify:seen' }), // dismissed lead with this id
        job({ url: 'https://jobs.ashbyhq.com/ramp/1/application?embed=true' }), // the application's posting
        job({ company: 'Figma', role: 'Software Engineer Intern', url: 'https://boards.greenhouse.io/figma/jobs/1?gh_jid=1', postedAt: NOW - 2 * DAY }),
        job({ company: 'Figma', role: 'Software Engineer, Intern', url: 'https://job-boards.greenhouse.io/figma/jobs/1', source: 'SpeedyApply', postedAt: NOW - 3 * DAY }), // same job, other list
        job({ company: 'Notion', role: 'SWE Intern' }),
      ],
      { leads: [lead({ sourceId: 'simplify:seen' })], applications: [app] },
      makeId,
      NOW,
    );
    expect(plan.matched).toBe(5);
    expect(plan.known).toBe(3);
    expect(plan.leads.map((l) => [l.company, l.source, l.status])).toEqual([
      ['Notion', 'Simplify', 'new'],
      ['Figma', 'Simplify', 'new'],
    ]);
  });
});

describe('tiers', () => {
  const md = [
    '<!-- TABLE_FAANG_START -->',
    '| <a href="https://www.figma.com"><strong>Figma</strong></a> | Intern | SF | $60/hr | <a href="https://f.com/1">Apply</a> | 1d |',
    '<!-- TABLE_FAANG_END -->',
    '<!-- TABLE_QUANT_START -->',
    '| <strong>Jane Street</strong> | Intern | NYC | $90/hr | <a href="https://j.com/1">Apply</a> | 1d |',
    '<!-- TABLE_QUANT_END -->',
    '<!-- TABLE_START -->',
    '| <strong>Acme</strong> | Intern | NYC | <a href="https://a.com/1">Apply</a> | 1d |',
  ].join('\n');

  it('records the SpeedyApply table and lends it to other lists and older leads', () => {
    const speedy = parseSpeedyApply(md, NOW);
    expect(speedy.map((j) => j.tier)).toEqual(['faang', 'quant', undefined]);
    const facts = companyFacts(speedy);
    const older: Lead = { id: 'old', company: 'Jane Street', role: 'Other intern', url: 'https://j.com/9', source: 'Simplify', addedAt: 0, status: 'new' };
    const plan = planImport([job({ company: 'FIGMA', role: 'Software Intern' })], { leads: [older], applications: [] }, () => 'n', NOW, facts);
    expect(plan.leads[0].tier).toBe('faang');
    expect(plan.leads[0].companySite).toBe('https://www.figma.com');
    expect(plan.updated).toEqual([{ ...older, tier: 'quant' }]);
  });
});
