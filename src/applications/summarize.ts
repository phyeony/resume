// Fills an application's fields from a captured posting.
//
// `Summarizer` is the seam for doing this with AI later: same input, same draft out. The rules version
// below only pattern-matches; whatever it fills is a suggestion the owner checks before saving.

import type { PostingSummary, SalaryPeriod, WorkMode } from '../model/types';
import { htmlToLines, type Block, type Capture, type Line } from './capture';
import { formatSalary, parseSalary } from './salary';

export interface SummaryInput {
  capture: Capture;
  /** The block the owner kept as the posting. */
  block: Block;
  url?: string;
}

export interface Draft {
  company: string;
  role: string;
  summary: PostingSummary;
}

export type Summarizer = (input: SummaryInput) => Promise<Draft>;

export const summarize: Summarizer = async (input) => summarizeWithRules(input);

// ---- sections ---------------------------------------------------------------------

type SectionKey = 'responsibilities' | 'requirements' | 'niceToHave' | 'benefits';

// Checked in this order: "Preferred qualifications" is nice-to-have, not requirements.
const SECTION_WORDS: [SectionKey, RegExp][] = [
  ['niceToHave', /nice[- ]to[- ]have|bonus|preferred|good to have|\bplus\b|ideally|extra credit/i],
  ['benefits', /benefit|perks|what we offer|why join|in it for you|we offer|rewards|total rewards/i],
  [
    'requirements',
    /requirement|qualification|who you are|you('|’)ll bring|you will bring|looking for|you have|you bring|about you|what you need|must[- ]have|skills|experience you|what it takes/i,
  ],
  [
    'responsibilities',
    /what you('|’)ll do|what you will do|you('|’)ll be doing|responsibilit|duties|the role|your role|in this role|day[- ]to[- ]day|your impact|what you('|’)ll work on|the job|the opportunity|you will/i,
  ],
];

const FIELD_LINE =
  /^(job\s+)?(locations?|salary|compensation|pay|base pay|pay range|job type|employment type|work model|schedule|start date|department|team|reports to)\s*[:\-–]/i;

export function sectionOf(heading: string): SectionKey | null {
  if (heading.length > 80) return null;
  for (const [key, re] of SECTION_WORDS) if (re.test(heading)) return key;
  return null;
}

export function extractSections(lines: Line[]): Record<SectionKey, string[]> {
  const out: Record<SectionKey, string[]> = { responsibilities: [], requirements: [], niceToHave: [], benefits: [] };
  let current: SectionKey | null = null;
  let hadItems = false;
  for (const l of lines) {
    if (l.kind === 'heading') {
      current = sectionOf(l.text);
      hadItems = false;
      continue;
    }
    // A section ends at a "Location: …" style line, or at prose that follows its list.
    if (FIELD_LINE.test(l.text) || (l.kind === 'para' && hadItems)) current = null;
    if (!current) continue;
    if (l.kind === 'item') hadItems = true;
    if (!out[current].includes(l.text)) out[current].push(l.text);
  }
  return out;
}

// ---- location / work mode ------------------------------------------------------------

export function workModeOf(text: string): WorkMode | undefined {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (/\bremote\b/i.test(text) && !/\b(not|no|non)[- ]remote\b/i.test(text)) return 'remote';
  if (/\b(on[- ]?site|in[- ]office|in the office)\b/i.test(text)) return 'onsite';
  return undefined;
}

function locationOf(lines: Line[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:job\s+)?locations?\s*[:\-–]\s*(.{2,100})$/i.exec(lines[i].text);
    if (m) return m[1].trim();
    if (lines[i].kind === 'heading' && /^locations?$/i.test(lines[i].text) && lines[i + 1]?.kind !== 'heading') {
      return lines[i + 1]?.text.slice(0, 100);
    }
  }
  return undefined;
}

/** "Toronto, ON · Posted 3 days ago" → "Toronto, ON". Only when it looks like a place. */
export function placeFromLine(line: string | undefined): string | undefined {
  if (!line) return undefined;
  const parts = line
    .split(/\s+[·•|]\s+/)
    .map((p) => p.trim())
    .filter((p) => p && !/\bago\b|posted|applicants?|apply|full[- ]time|part[- ]time|contract|\$/i.test(p));
  const place = parts.filter((p) => /,|\bremote\b|\bhybrid\b/i.test(p));
  return place.length ? place.join(' · ') : undefined;
}

// ---- company / role ----------------------------------------------------------------------

/** Job boards that put the company in the address. */
const HOST_PATTERNS: [RegExp, number][] = [
  [/^(?:boards|job-boards)\.(?:eu\.)?greenhouse\.io\/([^/?#]+)/i, 1],
  [/^jobs\.(?:eu\.)?lever\.co\/([^/?#]+)/i, 1],
  [/^jobs\.ashbyhq\.com\/([^/?#]+)/i, 1],
  [/^jobs\.smartrecruiters\.com\/([^/?#]+)/i, 1],
  [/^apply\.workable\.com\/([^/?#]+)/i, 1],
  [/^([^./]+)\.wd\d+\.myworkdayjobs\.com/i, 1],
  [/^([^./]+)\.bamboohr\.com/i, 1],
];
const AGGREGATORS = /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|monster|wellfound|angel|google)\./i;

const prettify = (s: string) =>
  decodeURIComponent(s)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

export function companyFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return undefined;
  }
  const hostPath = u.host + u.pathname;
  for (const [re, g] of HOST_PATTERNS) {
    const m = re.exec(hostPath);
    if (m) return prettify(m[g]);
  }
  if (AGGREGATORS.test(u.host)) return undefined;
  // careers.acme.com, jobs.acme.co.uk, acme.com/careers
  const parts = u.host.replace(/^www\./, '').split('.');
  const label = parts.length > 2 && /^(careers?|jobs?|work|apply|join|talent)$/i.test(parts[0]) ? parts[1] : parts[0];
  return label ? prettify(label) : undefined;
}

const clip = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Splits a page title into role and company. `company` (from elsewhere) helps decide which side is which. */
export function fromTitle(title: string, company?: string): { role?: string; company?: string } {
  const t = clip(title);
  let m = /^(.+?) hiring (.+?)(?: in .+?)?(?: \| LinkedIn)?$/i.exec(t);
  if (m) return { company: m[1], role: m[2] };
  m = /^(?:job application for )?(.+?) (?:at|@) (.+?)(?: [|–-] .*)?$/i.exec(t);
  if (m) return { role: m[1], company: m[2] };
  const parts = t.split(/ [|–—-] /).map(clip).filter(Boolean);
  const generic = /^(careers?|jobs?|job board|linkedin|indeed|workday|greenhouse|lever|apply)$/i;
  const useful = parts.filter((p) => !generic.test(p) && !/careers|jobs at/i.test(p));
  if (company) {
    const c = company.toLowerCase();
    const rest = useful.filter((p) => p.toLowerCase() !== c);
    if (rest.length < useful.length) return { role: rest[0], company };
  }
  if (useful.length >= 2) return { role: useful[0], company: useful[1] };
  return { role: useful[0] };
}

// ---- rules summarizer --------------------------------------------------------------------

const LD_UNITS: Record<string, SalaryPeriod> = { HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

export function summarizeWithRules({ capture, block, url }: SummaryInput): Draft {
  const lines = htmlToLines(block.html);
  const sections = extractSections(lines);
  const ld = capture.ld;

  const urlCompany = companyFromUrl(url);
  const titled = capture.docTitle ? fromTitle(capture.docTitle, ld?.company ?? urlCompany ?? capture.siteName) : {};
  const company = ld?.company ?? titled.company ?? capture.siteName ?? urlCompany ?? '';
  const role = ld?.title ?? titled.role ?? capture.firstHeading ?? '';

  const summary: PostingSummary = { ...sections, filledBy: 'rules' };

  if (ld?.salary?.min !== undefined) {
    const s = ld.salary;
    const period = s.unit ? LD_UNITS[s.unit.toUpperCase()] : undefined;
    const base = { min: s.min, ...(s.max !== undefined && s.max !== s.min ? { max: s.max } : {}), ...(s.currency ? { currency: s.currency } : {}), ...(period ? { period } : {}) };
    summary.salary = { ...base, text: formatSalary(base) };
  } else {
    const salary = parseSalary(block.text);
    if (salary) summary.salary = salary;
  }

  const location = ld?.location ?? locationOf(lines) ?? placeFromLine(capture.underHeading);
  if (location) summary.location = location;
  const mode = ld?.remote ? 'remote' : workModeOf(`${location ?? ''}\n${block.text}`);
  if (mode) summary.workMode = mode;

  return { company: clip(company), role: clip(role), summary };
}
