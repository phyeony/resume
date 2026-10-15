// Public job lists that "Import" turns into leads. All live on GitHub, whose raw files any page may
// fetch: SimplifyJobs keeps a JSON file, the others only markdown tables.

import type { Application, FeedSettings, Lead, LeadTier } from '../model/types';
import { TIER_RANK } from '../model/types';
import { companyKey } from './fame';
import { urlKey } from './model';

const DAY = 24 * 60 * 60 * 1000;

export interface Feed {
  id: string;
  label: string;
  /** Becomes the lead's source. */
  source: string;
  url: string;
  kind: 'simplify' | 'speedyapply' | 'negarprh' | 'hanzili';
}

const SPEEDY = 'https://raw.githubusercontent.com/speedyapply/2027-SWE-College-Jobs/main';

export const FEEDS: Feed[] = [
  {
    id: 'simplify-intern-2027',
    label: 'Simplify · Summer 2027 internships',
    source: 'Simplify',
    url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json',
    kind: 'simplify',
  },
  { id: 'speedy-intern-usa', label: 'SpeedyApply · internships, USA', source: 'SpeedyApply', url: `${SPEEDY}/README.md`, kind: 'speedyapply' },
  { id: 'speedy-newgrad-usa', label: 'SpeedyApply · new grad, USA', source: 'SpeedyApply', url: `${SPEEDY}/NEW_GRAD_USA.md`, kind: 'speedyapply' },
  { id: 'speedy-intern-intl', label: 'SpeedyApply · internships, international', source: 'SpeedyApply', url: `${SPEEDY}/INTERN_INTL.md`, kind: 'speedyapply' },
  { id: 'speedy-newgrad-intl', label: 'SpeedyApply · new grad, international', source: 'SpeedyApply', url: `${SPEEDY}/NEW_GRAD_INTL.md`, kind: 'speedyapply' },
  {
    id: 'negarprh-canada-2027',
    label: 'Canadian Tech Internships 2027 (negarprh)',
    source: 'Canadian Tech Internships',
    url: 'https://raw.githubusercontent.com/negarprh/Canadian-Tech-Internships-2027/main/README.md',
    kind: 'negarprh',
  },
  {
    id: 'hanzili-canada-intern',
    label: 'Canada SDE internships (hanzili)',
    source: 'hanzili Canada list',
    url: 'https://raw.githubusercontent.com/hanzili/canada_sde_intern_position/main/README.md',
    kind: 'hanzili',
  },
];

/** Simplify's categories, with the older spellings some listings still use. */
export const CATEGORIES: Record<string, string[]> = {
  Software: ['Software', 'Software Engineering'],
  'AI/ML/Data': ['AI/ML/Data', 'Data Science, AI & Machine Learning'],
  Hardware: ['Hardware', 'Hardware Engineering'],
  Product: ['Product', 'Product Management'],
  Quant: ['Quant', 'Quantitative Finance'],
};

export const DEFAULT_FEED_SETTINGS: FeedSettings = {
  feeds: ['simplify-intern-2027', 'speedy-intern-usa'],
  categories: ['Software'],
  terms: ['Summer 2027'],
  maxAgeDays: 7,
  include: '',
  exclude: 'PhD, High School',
  locations: '',
  prefer: '',
  preferPlaces: '',
};

/** One job from any feed, before filtering. */
export interface FeedJob {
  source: string;
  /** Stable within the feed: Simplify's id, else the posting's URL key. */
  sourceId: string;
  company: string;
  role: string;
  url: string;
  locations: string[];
  /** Absent when the list doesn't say (hanzili). */
  postedAt?: number;
  salary?: string;
  /** SpeedyApply's table, or hanzili's 🔥. */
  tier?: LeadTier;
  /** SpeedyApply only: the company's homepage. */
  companySite?: string;
  /** Simplify and hanzili; absent when the list doesn't sort jobs into categories. */
  category?: string;
  /** Absent when the job doesn't name a term. */
  terms?: string[];
}

// ---- parsing -----------------------------------------------------------------

interface SimplifyListing {
  id: string;
  company_name: string;
  title: string;
  url: string;
  locations?: string[];
  date_posted: number; // epoch seconds
  active: boolean;
  is_visible: boolean;
  category?: string;
  terms?: string[];
}

/** Open, visible listings from Simplify's listings.json. */
export function parseSimplify(listings: SimplifyListing[], source = 'Simplify'): FeedJob[] {
  return listings
    .filter((l) => l.active && l.is_visible && l.url && l.id)
    .map((l) => ({
      source,
      sourceId: `simplify:${l.id}`,
      company: l.company_name.trim(),
      role: l.title.trim(),
      url: l.url,
      locations: l.locations ?? [],
      postedAt: l.date_posted * 1000,
      category: l.category,
      terms: l.terms,
    }));
}

/**
 * Rows of SpeedyApply's tables: Company | Position | Location | [Salary |] Posting | Age. The company
 * may be a link; the posting is a link around an "Apply" image; age is like "3d".
 */
export function parseSpeedyApply(markdown: string, now = Date.now(), source = 'SpeedyApply'): FeedJob[] {
  const jobs: FeedJob[] = [];
  let tier: LeadTier | undefined;
  for (const line of markdown.split('\n')) {
    // Each table opens with a marker: TABLE_FAANG_START, TABLE_QUANT_START, then TABLE_START for the rest.
    const marker = /<!--\s*TABLE_(\w*?)_?START\s*-->/.exec(line);
    if (marker) tier = marker[1] === 'FAANG' ? 'faang' : marker[1] === 'QUANT' ? 'quant' : undefined;
    if (!line.startsWith('|') || line.startsWith('|---') || /^\|\s*Company\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const posting = cells[cells.length - 2];
    const href = /href="([^"]+)"/.exec(posting)?.[1];
    const ageDays = parseAge(cells[cells.length - 1]);
    if (!href || ageDays === null) continue;
    const url = decodeEntities(href);
    const company = cellText(cells[0]);
    const companySite = /href="(https?:[^"]+)"/.exec(cells[0])?.[1];
    const role = cellText(cells[1]);
    if (!company || !role) continue;
    jobs.push({
      source,
      sourceId: `speedyapply:${urlKey(url) ?? url}`,
      company,
      role,
      url,
      locations: [cellText(cells[2])].filter(Boolean),
      postedAt: now - ageDays * DAY,
      ...(cells.length >= 6 && cellText(cells[3]) ? { salary: cellText(cells[3]) } : {}),
      ...(tier ? { tier } : {}),
      ...(companySite ? { companySite: decodeEntities(companySite) } : {}),
    });
  }
  return jobs;
}

/**
 * negarprh's Canadian list: Company | Role | Location | Apply | Date Posted. "↳" repeats the company
 * above; closed jobs say "Closed🔒" instead of a link; a term may follow the title, as "(Winter 2027)".
 */
export function parseNegarprh(markdown: string, source = 'Canadian Tech Internships'): FeedJob[] {
  const jobs: FeedJob[] = [];
  let company = '';
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|') || /^\|\s*:?-/.test(line) || /^\|\s*Company\s*\|/.test(line)) continue;
    const cells = rowCells(line);
    if (cells.length < 5) continue;
    const name = cellText(cells[0]);
    if (name && name !== '↳') company = name;
    // The link wraps a badge image; its address may itself hold parentheses.
    const url = /\]\((https?:\S+)\)$/.exec(cells[3].replace(/!\[[^\]]*\]\([^)]*\)/g, ''))?.[1];
    const postedAt = Date.parse(cellText(cells[4]));
    const role = cellText(cells[1]);
    if (!url || Number.isNaN(postedAt) || !company || !role) continue;
    const terms = termsIn(role);
    jobs.push({
      source,
      sourceId: `negarprh:${urlKey(url) ?? url}`,
      company,
      role,
      url,
      locations: cellText(cells[2]).split(/\s+\/\s+/).filter(Boolean),
      postedAt,
      ...(terms ? { terms } : {}),
    });
  }
  return jobs;
}

/** hanzili's sections, as the categories the filters offer; the rest keep their own names. */
const HANZILI_CATEGORIES: Record<string, string> = {
  'Software Engineering': 'Software',
  'DevOps / SRE / Platform': 'Software',
  Mobile: 'Software',
  'QA / Test / Automation': 'Software',
  Security: 'Software',
  'Data / ML': 'AI/ML/Data',
  'Hardware / Firmware': 'Hardware',
  'Product / TPM': 'Product',
};

/**
 * hanzili's Canadian list, one table per "## Category": Title | Company | Role | Company Info | Details |
 * Location | Apply. The title carries 🆕/🔥/💤 and an <!--id:n--> comment; details read like
 * "Co-op · 4mo · $30/hr · Winter 2027". No posting dates.
 */
export function parseHanzili(markdown: string, source = 'hanzili Canada list'): FeedJob[] {
  const jobs: FeedJob[] = [];
  let section = '';
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) section = heading[1].trim();
    if (!line.startsWith('|') || /^\|\s*:?-/.test(line) || /^\|\s*Title\s*\|/.test(line)) continue;
    const cells = rowCells(line);
    if (cells.length < 7) continue;
    const id = /<!--\s*id:(\w+)\s*-->/.exec(cells[0])?.[1];
    const link = /\]\(<([^>]+)>\)|\]\((https?:[^\s)]+)\)/.exec(cells[6]);
    const url = link?.[1] ?? link?.[2];
    const role = cellText(cells[0]).replace(/^[\s🆕🔥💤]+/u, '');
    // "EQ Bank | Canada's Challenger Bank": the name, then a tagline.
    const company = cellText(cells[1]).split(' | ')[0].trim();
    if (!id || !url || !role || !company) continue;
    const details = cellText(cells[4]).split('·').map((d) => d.trim());
    const salary = details.find((d) => /\$|\d\s*k\b/i.test(d));
    const terms = termsIn(`${role} ${cells[4]}`);
    jobs.push({
      source,
      sourceId: `hanzili:${id}`,
      company,
      role,
      url,
      locations: [cellText(cells[5])].filter(Boolean),
      category: HANZILI_CATEGORIES[section] ?? section,
      ...(salary ? { salary } : {}),
      ...(terms ? { terms } : {}),
      ...(cells[0].includes('🔥') ? { tier: 'hot' as const } : {}),
    });
  }
  return jobs;
}

/** Cells of a markdown table row; "\\|" inside a cell is a literal bar. */
function rowCells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** "Winter 2027", "Summer 2027"… named anywhere in the text, or undefined when none is. */
function termsIn(text: string): string[] | undefined {
  const found = [...text.matchAll(/\b(winter|spring|summer|fall)\s*(20\d\d)\b/gi)].map(
    (m) => `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`,
  );
  return found.length ? [...new Set(found)] : undefined;
}

/** "3d", "5h", "2w", "1mo" as days. */
function parseAge(s: string): number | null {
  const m = /^(\d+)\s*(h|d|w|mo)$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return { h: n / 24, d: n, w: 7 * n, mo: 30 * n }[m[2].toLowerCase() as 'h' | 'd' | 'w' | 'mo'];
}

const cellText = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

// ---- choosing -------------------------------------------------------------------

const words = (s: string) =>
  s
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

/** The jobs that match the settings. A filter skips jobs whose list doesn't give what it checks. */
export function filterJobs(jobs: FeedJob[], s: FeedSettings, now = Date.now()): FeedJob[] {
  const include = words(s.include);
  const exclude = words(s.exclude);
  const places = words(s.locations);
  const categories = new Set(s.categories.flatMap((c) => CATEGORIES[c] ?? [c]));
  return jobs.filter((j) => {
    if (j.postedAt !== undefined && now - j.postedAt > s.maxAgeDays * DAY) return false;
    const title = j.role.toLowerCase();
    if (include.length && !include.some((w) => title.includes(w))) return false;
    if (exclude.some((w) => title.includes(w))) return false;
    if (places.length && !j.locations.some((l) => places.some((p) => l.toLowerCase().includes(p)))) return false;
    if (j.category !== undefined && categories.size && !categories.has(j.category)) return false;
    if (j.terms !== undefined && s.terms.length && !j.terms.some((t) => s.terms.includes(t))) return false;
    return true;
  });
}

/** Same job, whichever list it came from: company and title without punctuation or case. */
const jobKey = (company: string, role: string) => `${company}|${role}`.toLowerCase().replace(/[^a-z0-9|]+/g, '');

/** What lists say about companies, from every job fetched (before filtering), to lend to other lists. */
export interface CompanyFacts {
  tiers: Map<string, LeadTier>;
  sites: Map<string, string>;
}

export function companyFacts(jobs: FeedJob[]): CompanyFacts {
  const facts: CompanyFacts = { tiers: new Map(), sites: new Map() };
  for (const j of jobs) {
    const had = facts.tiers.get(companyKey(j.company));
    if (j.tier && (!had || TIER_RANK[j.tier] > TIER_RANK[had])) facts.tiers.set(companyKey(j.company), j.tier);
    if (j.companySite) facts.sites.set(companyKey(j.company), j.companySite);
  }
  return facts;
}

export interface ImportPlan {
  /** New leads to save. */
  leads: Lead[];
  matched: number;
  /** Matched, but already a lead (including dismissed ones) or an application. */
  known: number;
  /** New leads from earlier imports that now get their company's tier or website. */
  updated: Lead[];
}

/** Turns matching jobs into new leads, skipping anything already seen in any form. */
export function planImport(
  jobs: FeedJob[],
  existing: { leads: Lead[]; applications: Application[] },
  makeId: () => string,
  now = Date.now(),
  facts: CompanyFacts = companyFacts(jobs),
): ImportPlan {
  const { tiers, sites } = facts;
  const ids = new Set(existing.leads.map((l) => l.sourceId).filter(Boolean));
  const urls = new Set([...existing.leads, ...existing.applications].map((x) => urlKey(x.url)).filter(Boolean));
  const keys = new Set([...existing.leads, ...existing.applications].map((x) => jobKey(x.company, x.role)));
  const leads: Lead[] = [];
  let known = 0;
  for (const j of [...jobs].sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0))) {
    const url = urlKey(j.url);
    const key = jobKey(j.company, j.role);
    if (ids.has(j.sourceId) || (url && urls.has(url)) || keys.has(key)) {
      known++;
      continue;
    }
    ids.add(j.sourceId);
    if (url) urls.add(url);
    keys.add(key);
    leads.push({
      id: makeId(),
      company: j.company,
      role: j.role,
      url: j.url,
      ...(j.locations.length ? { location: j.locations.join('; ') } : {}),
      ...(j.salary ? { salary: j.salary } : {}),
      ...((j.tier ?? tiers.get(companyKey(j.company))) ? { tier: j.tier ?? tiers.get(companyKey(j.company)) } : {}),
      ...((j.companySite ?? sites.get(companyKey(j.company))) ? { companySite: j.companySite ?? sites.get(companyKey(j.company)) } : {}),
      source: j.source,
      sourceId: j.sourceId,
      ...(j.postedAt !== undefined ? { postedAt: j.postedAt } : {}),
      addedAt: now,
      status: 'new',
    });
  }
  const updated = existing.leads.flatMap((l) => {
    if (l.status !== 'new') return [];
    const tier = !l.tier ? tiers.get(companyKey(l.company)) : undefined;
    const companySite = !l.companySite ? sites.get(companyKey(l.company)) : undefined;
    return tier || companySite ? [{ ...l, ...(tier ? { tier } : {}), ...(companySite ? { companySite } : {}) }] : [];
  });
  return { leads, matched: jobs.length, known, updated };
}

// ---- fetching --------------------------------------------------------------------

export async function fetchFeed(feed: Feed, now = Date.now()): Promise<FeedJob[]> {
  const res = await fetch(feed.url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${feed.label}: ${res.status} ${res.statusText}`);
  if (feed.kind === 'simplify') return parseSimplify((await res.json()) as SimplifyListing[], feed.source);
  const text = await res.text();
  if (feed.kind === 'negarprh') return parseNegarprh(text, feed.source);
  if (feed.kind === 'hanzili') return parseHanzili(text, feed.source);
  return parseSpeedyApply(text, now, feed.source);
}
