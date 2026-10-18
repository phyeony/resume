import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../model/types';
import { jobsFromSnapshot, jobsWithChecks, parseDates, parseMonthYear, splitOrg } from './experience';

describe('parseMonthYear', () => {
  it.each([
    ['November 2024', { month: 11, year: 2024 }],
    ['Nov. 2024', { month: 11, year: 2024 }],
    ['Sept 2021', { month: 9, year: 2021 }],
    ['11/2024', { month: 11, year: 2024 }],
    ['2024-03', { month: 3, year: 2024 }],
    ['2024', { year: 2024 }],
    ['Spring 2024', {}],
    ['13/2024', {}],
  ])('%s', (s, want) => {
    expect(parseMonthYear(s)).toEqual(want);
  });
});

describe('parseDates', () => {
  it('reads a range', () => {
    expect(parseDates('November 2024 – August 2026')).toEqual({ start: { month: 11, year: 2024 }, end: { month: 8, year: 2026 }, current: false, ok: true });
    expect(parseDates('Sep 2021 - Jun 2022').end).toEqual({ month: 6, year: 2022 });
    expect(parseDates('May 2021 to September 2021').start).toEqual({ month: 5, year: 2021 });
    expect(parseDates('2019–2021')).toMatchObject({ start: { year: 2019 }, end: { year: 2021 }, ok: true });
  });

  it('reads a current job', () => {
    expect(parseDates('September 2024 – Present')).toEqual({ start: { month: 9, year: 2024 }, end: {}, current: true, ok: true });
  });

  it('takes one month as start and end', () => {
    expect(parseDates('March 2023')).toMatchObject({ start: { month: 3, year: 2023 }, end: { month: 3, year: 2023 }, ok: true });
  });

  it("says when it can't read them", () => {
    expect(parseDates('Summer 2022').ok).toBe(false);
    expect(parseDates('').ok).toBe(false);
  });
});

describe('splitOrg', () => {
  it.each([
    ['Cambian Business Service Inc, BC', 'Cambian Business Service Inc', 'BC'],
    ['Korea Air Force', 'Korea Air Force', ''],
    ['Korea Air Force, Daejeon, Korea', 'Korea Air Force', 'Daejeon, Korea'],
    ['Acme, Inc.', 'Acme, Inc.', ''],
    ['Acme, Inc., Vancouver, BC', 'Acme, Inc.', 'Vancouver, BC'],
  ])('%s', (org, company, location) => {
    expect(splitOrg(org)).toEqual({ company, location });
  });
});

const snap = (entries: Snapshot['sections'][number]['entries']): Snapshot => ({
  name: 'Ada',
  contacts: [],
  sections: [
    { key: 'education', title: 'Education', entries: [{ title: 'BSc', org: 'SFU', orgRight: 'GPA: 3.40 / 4.33', dates: '2019 – 2027', bullets: [] }] },
    { key: 'work', title: 'Work Experience', entries },
  ],
});

describe('jobsFromSnapshot', () => {
  it('turns the work entries into jobs', () => {
    const jobs = jobsFromSnapshot(
      snap([
        { title: 'Software Developer', org: 'Korea Air Force', orgRight: 'Daejeon, Korea', dates: 'November 2024 – Present', bullets: ['Cut latency by **90%**', ' Built a spreadsheet '] },
        { title: 'Application Developer', org: 'Cambian Business Service Inc, BC', dates: 'November 2022 – July 2024', bullets: [] },
      ]),
    );
    expect(jobs).toEqual([
      { title: 'Software Developer', company: 'Korea Air Force', location: 'Daejeon, Korea', startMonth: 11, startYear: 2024, current: true, description: '• Cut latency by 90%\n• Built a spreadsheet' },
      { title: 'Application Developer', company: 'Cambian Business Service Inc', location: 'BC', startMonth: 11, startYear: 2022, endMonth: 7, endYear: 2024, current: false, description: '' },
    ]);
  });

  it('flags dates it could not read and keeps the job', () => {
    const [j] = jobsWithChecks(snap([{ title: 'Intern', org: 'Acme', dates: 'Summer 2022', bullets: [] }]));
    expect(j.datesOk).toBe(false);
    expect(j.startYear).toBeUndefined();
  });

  it('has no jobs without a work section', () => {
    expect(jobsFromSnapshot({ name: 'Ada', contacts: [], sections: [] })).toEqual([]);
  });
});
