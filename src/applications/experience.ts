// Work entries for the apply kit: forms like Workday's ask for each job's title, company, location, dates and
// description separately, and their resume parsers get them wrong.

import { plain } from '../model/richtext';
import type { KitJob, Snapshot, SnapshotEntry } from '../model/types';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const CURRENT = /^(present|current|now|ongoing|today)$/i;

interface MonthYear {
  month?: number;
  year?: number;
}

/** "November 2024", "Nov. 2024", "11/2024", "2024-11", "2024" → month and year; {} when it isn't a date. */
export function parseMonthYear(s: string): MonthYear {
  const t = s.trim().toLowerCase();
  let m = t.match(/^([a-z]+)\.?,?\s+(\d{4})$/);
  if (m) {
    const i = MONTHS.indexOf(m[1].slice(0, 3));
    // "Sept" and full names start like the short ones; anything else ("Spring 2024") isn't a month.
    return i >= 0 ? { month: i + 1, year: Number(m[2]) } : {};
  }
  m = t.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { month: Number(m[1]), year: Number(m[2]) };
  m = t.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { month: Number(m[2]), year: Number(m[1]) };
  m = t.match(/^(\d{4})$/);
  if (m) return { year: Number(m[1]) };
  return {};
}

export interface JobDates {
  start: MonthYear;
  end: MonthYear;
  current: boolean;
  /** False when the text didn't read as dates; the form's date boxes are then left for you. */
  ok: boolean;
}

/** "November 2024 – August 2026", "Sep 2021 - Present", "March 2023" (one month: start and end). */
export function parseDates(text: string): JobDates {
  const parts = text.split(/\s+(?:–|—|-|to)\s+|\s*[–—]\s*/i).filter((p) => p.trim());
  const none: JobDates = { start: {}, end: {}, current: false, ok: false };
  if (parts.length === 1) {
    const d = parseMonthYear(parts[0]);
    return d.year ? { start: d, end: d, current: false, ok: true } : none;
  }
  if (parts.length !== 2) return none;
  const start = parseMonthYear(parts[0]);
  if (!start.year) return none;
  if (CURRENT.test(parts[1].trim())) return { start, end: {}, current: true, ok: true };
  const end = parseMonthYear(parts[1]);
  return end.year ? { start, end, current: false, ok: true } : none;
}

// Parts after a comma that belong to the company's name, not its place.
const COMPANY_SUFFIX = /^(inc|llc|ltd|limited|co|corp|corporation|gmbh|lp|llp|plc|s\.?a|ag|pty|ulc)\.?$/i;

/** "Cambian Business Service Inc, BC" → company and "BC"; "Acme, Inc." stays one company. */
export function splitOrg(org: string): { company: string; location: string } {
  const parts = org.split(',').map((p) => p.trim()).filter(Boolean);
  let i = 1;
  while (i < parts.length && COMPANY_SUFFIX.test(parts[i])) i++;
  return { company: parts.slice(0, i).join(', '), location: parts.slice(i).join(', ') };
}

/** orgRight holds a place for jobs ("Daejeon, Korea") but a score for schools ("GPA: 3.40 / 4.33"). */
const NOT_A_PLACE = /gpa|grade|\d/i;

export function jobFromEntry(e: SnapshotEntry): KitJob & { datesOk: boolean } {
  const { company, location } = splitOrg(e.org ?? '');
  const right = e.orgRight?.trim() ?? '';
  const d = parseDates(e.dates);
  return {
    title: e.title.trim(),
    company,
    location: right && !NOT_A_PLACE.test(right) ? right : location,
    ...(d.start.month ? { startMonth: d.start.month } : {}),
    ...(d.start.year ? { startYear: d.start.year } : {}),
    ...(d.end.month ? { endMonth: d.end.month } : {}),
    ...(d.end.year ? { endYear: d.end.year } : {}),
    current: d.current,
    description: e.bullets.map((b) => `• ${plain(b).trim()}`).join('\n'),
    datesOk: d.ok,
  };
}

/** The version's work entries, in resume order, with whether each one's dates parsed. */
export function jobsWithChecks(s: Snapshot): (KitJob & { datesOk: boolean })[] {
  return (s.sections.find((x) => x.key === 'work')?.entries ?? []).map(jobFromEntry);
}

export function jobsFromSnapshot(s: Snapshot): KitJob[] {
  return jobsWithChecks(s).map(({ datesOk: _, ...job }) => job);
}
