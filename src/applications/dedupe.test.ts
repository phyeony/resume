import { describe, expect, it } from 'vitest';
import type { Application, Lead } from '../model/types';
import { jobKey, planImport, reconcileLeads, type FeedJob } from './feeds';
import { newApplication, urlKey } from './model';

const lead = (id: string, p: Partial<Lead>): Lead => ({ id, company: 'Acme', role: 'Software Engineer Intern', url: '', source: 'Simplify', addedAt: 0, status: 'new', ...p });
const app = (id: string, p: Partial<Application>): Application => ({ ...newApplication(id, 0), ...p });
const job = (p: Partial<FeedJob>): FeedJob => ({ source: 'SpeedyApply', sourceId: 's1', company: 'Acme', role: 'Software Engineer Intern', url: 'https://acme.com/jobs/9', locations: [], ...p });

describe('urlKey', () => {
  it('reads Workday addresses the same whatever their case or language', () => {
    expect(urlKey('https://cibc.wd3.myworkdayjobs.com/en-US/search/job/Toronto-ON/Developer-Co-op_2621523-1')).toBe(
      urlKey('https://cibc.wd3.myworkdayjobs.com/search/job/Toronto-ON/Developer-Co-op_2621523-1/apply'),
    );
    expect(urlKey('https://mbda.wd3.myworkdayjobs.com/en-US/mbda-uk/job/X_R1')).toBe(urlKey('https://mbda.wd3.myworkdayjobs.com/MBDA-UK/job/X_R1'));
  });
  it("drops Simplify's ats marker", () => {
    expect(urlKey('https://impulsespace.pinpointhq.com/en/postings/66?ats=pinpointhq')).toBe(urlKey('https://impulsespace.pinpointhq.com/en/postings/66'));
  });
});

describe('jobKey', () => {
  it('ignores the term lists append, and reads Internship as Intern', () => {
    expect(jobKey('SOTI', 'Software Developer Intern (Winter 2027)')).toBe(jobKey('SOTI', 'Software Developer Intern'));
    expect(jobKey('Skydio', 'Embedded Software Engineer Intern - Summer 2027')).toBe(jobKey('Skydio', 'Embedded Software Engineer Intern'));
    expect(jobKey('Palantir', 'Software Engineer - Internship - Query Engines')).toBe(jobKey('Palantir', 'Software Engineer Intern - Query Engines'));
    expect(jobKey('Waymo', '2027 Summer Intern - Multiple Teams')).toBe(jobKey('Waymo', 'Summer Intern - Multiple Teams'));
  });
  it('keeps co-ops and interns apart', () => {
    expect(jobKey('RTX', 'Software Engineer Co-op')).not.toBe(jobKey('RTX', 'Software Engineer Intern'));
  });
});

describe('planImport', () => {
  it('skips a job another list already gave under a different address or title', () => {
    const existing = { leads: [lead('l1', { role: 'Software Engineer Intern', status: 'dismissed' })], applications: [] };
    expect(planImport([job({ role: 'Software Engineer Intern - Summer 2027' })], existing, () => 'x').leads).toEqual([]);
  });
  it('skips a LinkedIn posting saved under another LinkedIn link', () => {
    const existing = { leads: [], applications: [app('a1', { company: 'Other', role: 'Other', url: 'https://ca.linkedin.com/jobs/view/dev-at-acme-4087654321' })] };
    expect(planImport([job({ source: 'LinkedIn', role: 'Dev', url: 'https://www.linkedin.com/jobs/view/4087654321/' })], existing, () => 'x').leads).toEqual([]);
  });
});

describe('reconcileLeads', () => {
  it('moves a new lead to Tracked when you applied from its page', () => {
    const l = lead('l1', { url: 'https://acme.com/jobs/9?utm_source=Simplify' });
    expect(reconcileLeads([l], [app('a1', { company: 'ACME', role: 'Intern', url: 'https://acme.com/jobs/9/apply' })])).toEqual([{ ...l, status: 'tracked', applicationId: 'a1' }]);
  });
  it('gives a repeat the status of the lead it repeats, keeping the older of two new ones', () => {
    const dismissed = lead('l1', { status: 'dismissed', addedAt: 5 });
    const older = lead('l2', { company: 'Globex', addedAt: 1 });
    const repeats = [
      lead('l3', { role: 'Software Engineer Intern - Summer 2027', addedAt: 9, source: 'SpeedyApply' }),
      lead('l4', { company: 'Globex', role: 'Software Engineer Internship', addedAt: 3 }),
    ];
    expect(reconcileLeads([...repeats, dismissed, older], []).map((l) => [l.id, l.status])).toEqual([
      ['l4', 'dismissed'],
      ['l3', 'dismissed'],
    ]);
  });
  it('leaves distinct leads alone, so a second pass changes nothing', () => {
    const leads = [lead('l1', {}), lead('l2', { role: 'Data Intern' }), lead('l3', { company: 'Globex' })];
    expect(reconcileLeads(leads, [])).toEqual([]);
  });
});
