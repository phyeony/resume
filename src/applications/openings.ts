// When internships open: each company's past posting dates, per term, and the window they suggest
// for a term to come. The history comes from openings.json (tools/openings/build.py); your own leads
// add what the lists missed.

import type { Lead } from '../model/types';

const DAY = 24 * 60 * 60 * 1000;

export type Season = 'W' | 'Sp' | 'S' | 'F';

/** "S27" = Summer 2027. */
export interface Term {
  season: Season;
  year: number;
}

export const SEASON_LABELS: Record<Season, string> = { W: 'Winter', Sp: 'Spring', S: 'Summer', F: 'Fall' };

/** First month of each term, 0-based, the way Canadian co-op terms run (Spring as US lists use it). */
const SEASON_START: Record<Season, number> = { W: 0, Sp: 0, S: 4, F: 8 };

/** openings.json as the build script writes it. */
export interface OpeningsData {
  generatedAt: string;
  /** Posting days count from here, "2020-01-01". */
  epoch: string;
  sources: string[];
  /** Each distinct location, "Vancouver, BC / Toronto, ON"; postings point at one by index. */
  places: string[];
  /** p: [day, term code ("S27", "S27|W27|F27" for a job open to several, or ""), index into places]. */
  companies: { k: string; n: string; p: [number, string, number][]; t: string[] }[];
}

export interface Posting {
  at: number;
  /** Absent when the posting named no term. */
  term?: Term;
  /** A job open to several terms ("Summer, Winter or Fall 2027"): it shows each is open, but says nothing about when one usually opens. */
  anyOf?: Term[];
  /** As the list showed it; absent when it showed none. */
  where?: string;
}

export interface CompanyHistory {
  key: string;
  name: string;
  postings: Posting[];
  /** A few recent titles, newest first. */
  titles: string[];
}

export const termCode = (t: Term) => `${t.season}${String(t.year % 100).padStart(2, '0')}`;
export const termLabel = (t: Term) => `${SEASON_LABELS[t.season]} ${t.year}`;
export const sameTerm = (a: Term | undefined, b: Term) => !!a && a.season === b.season && a.year === b.year;

export function parseTermCode(code: string): Term | undefined {
  const m = /^(W|Sp|S|F)(\d\d)$/.exec(code);
  return m ? { season: m[1] as Season, year: 2000 + Number(m[2]) } : undefined;
}

/** Local midnight on the 1st of the term's first month. */
export const termStart = (t: Term) => new Date(t.year, SEASON_START[t.season], 1).getTime();

const SEASON_WORDS: Record<string, Season> = { winter: 'W', spring: 'Sp', summer: 'S', fall: 'F', autumn: 'F' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * The term a posting is for: "Summer 2027" → S27, "8mo · Sept 2026 - Apr 2027" → F26. The first one
 * named wins, so an 8-month term counts as the term it starts in. Same rules as the build script.
 */
export function parseTerm(text: string): Term | undefined {
  const s = /\b(winter|spring|summer|fall|autumn)\s*['’]?\s*(20)?(\d\d)\b/i.exec(text);
  const m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(20\d\d)\b/i.exec(text);
  if (m && (!s || m.index < s.index)) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    return { season: month <= 3 ? 'W' : month <= 7 ? 'S' : 'F', year: Number(m[2]) };
  }
  return s ? { season: SEASON_WORDS[s[1].toLowerCase()], year: 2000 + Number(s[3]) } : undefined;
}

const SUFFIX = /\b(inc|incorporated|ltd|limited|llc|corp|corporation|co|plc|gmbh|ag|sa|lp|llp)\b\.?/gi;

/** "SAP SE", "Sap Inc." → "sapse", "sap". Same rules as the build script. */
export function openingKey(name: string): string {
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return plain(name.replace(SUFFIX, '')) || plain(name);
}

/** The bundled history, plus each lead's posting date (or the day it was added) where the lists lack it. */
export function buildHistory(data: OpeningsData, leads: Lead[] = []): CompanyHistory[] {
  const epoch = Date.parse(`${data.epoch}T00:00:00`);
  const byKey = new Map<string, CompanyHistory>();
  for (const c of data.companies) {
    byKey.set(c.k, {
      key: c.k,
      name: c.n,
      titles: c.t,
      postings: c.p.map(([day, code, place]) => {
        const term = parseTermCode(code);
        const anyOf = code.includes('|') ? code.split('|').map(parseTermCode).filter((t): t is Term => !!t) : [];
        const where = data.places[place];
        return { at: epoch + day * DAY, ...(term ? { term } : {}), ...(anyOf.length ? { anyOf } : {}), ...(where ? { where } : {}) };
      }),
    });
  }
  for (const l of leads) {
    const key = openingKey(l.company);
    if (!key) continue;
    const at = l.postedAt ?? l.addedAt;
    const term = parseTerm(l.role);
    const h = byKey.get(key) ?? { key, name: l.company, titles: [], postings: [] };
    byKey.set(key, h);
    // The lists already hold most leads; only add one a week or more away from what's known for its term.
    const known = h.postings.some((p) => Math.abs(p.at - at) < 7 * DAY && (term ? sameTerm(p.term, term) : !p.term));
    if (known) continue;
    h.postings.push({ at, ...(term ? { term } : {}), ...(l.location ? { where: l.location } : {}) });
    if (!h.titles.includes(l.role)) h.titles = [l.role, ...h.titles].slice(0, 4);
  }
  for (const h of byKey.values()) h.postings.sort((a, b) => a.at - b.at);
  return [...byKey.values()];
}

// ---- where ------------------------------------------------------------------------

export type Region = 'canada' | 'usa' | 'remote' | 'elsewhere';

export const REGION_LABELS: Record<Region, string> = { canada: 'Canada', usa: 'USA', remote: 'Remote', elsewhere: 'Elsewhere' };

const CANADA =
  /\b(canada|british columbia|alberta|saskatchewan|manitoba|ontario|qu[eé]bec|nova scotia|new brunswick|newfoundland|prince edward island|yukon|vancouver|burnaby|richmond, bc|victoria, bc|toronto|mississauga|markham|waterloo|kitchener|ottawa|montr[eé]al|calgary|edmonton|winnipeg|halifax)\b|,\s*(bc|ab|sk|mb|on|qc|ns|nb|nl|pe|yt|nt|nu)\b/i;
const USA =
  /\b(usa|u\.s\.a?\.?|united states|nyc|bay area|new york|san francisco|seattle|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b|,\s*(al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i;

/** Which regions a location names; several for "Toronto, ON / Seattle, WA". Empty when there's no location. */
export function regionsOf(where: string | undefined): Region[] {
  if (!where?.trim()) return [];
  const out: Region[] = [];
  if (CANADA.test(where)) out.push('canada');
  if (USA.test(where)) out.push('usa');
  // "Toronto, ON (Remote)" is a Canadian job you can do from home; "Remote" alone is anywhere.
  if (/\bremote\b/i.test(where)) out.push('remote');
  if (!out.length) out.push('elsewhere');
  return out;
}

export interface PlaceFilter {
  /** Any of these; empty keeps every region. */
  regions: Region[];
  /** Words a location must contain one of, e.g. "vancouver"; empty keeps all. */
  places: string[];
}

export const isPlaceFilterEmpty = (f: PlaceFilter) => !f.regions.length && !f.places.length;

/** The company with only postings in the chosen places. A posting with no location is left out once any filter is set. */
export function inPlaces(h: CompanyHistory, f: PlaceFilter): CompanyHistory {
  if (isPlaceFilterEmpty(f)) return h;
  const places = f.places.map((p) => p.toLowerCase());
  return {
    ...h,
    postings: h.postings.filter((p) => {
      if (!p.where) return false;
      const regions = regionsOf(p.where);
      const where = p.where.toLowerCase();
      return (!f.regions.length || f.regions.some((r) => regions.includes(r))) && (!places.length || places.some((x) => where.includes(x)));
    }),
  };
}

// ---- predicting ----------------------------------------------------------------------

/** One past term of the same season: when its postings went up, as days before the term started. */
export interface PastCycle {
  term: Term;
  count: number;
  first: number;
  /** The middle half of its postings. */
  p25: number;
  p75: number;
  /** Each posting, as an offset. */
  offsets: number[];
}

export type OpeningStatus = 'open' | 'due' | 'soon' | 'later' | 'passed' | 'unknown';

export const STATUS_LABELS: Record<OpeningStatus, string> = {
  open: 'Open now',
  due: 'Expected by now',
  soon: 'Opening soon',
  later: 'Later',
  passed: 'Window passed',
  unknown: 'No history',
};

export interface Prediction {
  company: CompanyHistory;
  target: Term;
  cycles: PastCycle[];
  /** Postings for the target term itself, already seen. */
  seen: Posting[];
  /** Expected first posting and the window most postings fall in, as dates; absent with no past cycle. */
  expectedFirst?: number;
  windowStart?: number;
  windowEnd?: number;
  /** high: 2+ past terms that agree within a month; low: one term, or terms far apart. */
  confidence?: 'high' | 'medium' | 'low';
  status: OpeningStatus;
}

/** How far ahead "Opening soon" looks. */
export const SOON_DAYS = 45;

/** Offsets are days relative to the term's start: -240 = posted eight months before it began. */
const offsetOf = (at: number, t: Term) => Math.round((at - termStart(t)) / DAY);

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return Math.round(sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo));
}

const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);

/** Postings dated more than this after their term began were mislabeled or re-listed; they say nothing about timing. */
const LATE_DAYS = 30;

/** The same season in earlier years, at most `years` back, with its postings' offsets. */
export function pastCycles(h: CompanyHistory, target: Term, years = 4): PastCycle[] {
  const out: PastCycle[] = [];
  for (let year = target.year - years; year < target.year; year++) {
    const term: Term = { season: target.season, year };
    const offsets = h.postings
      .filter((p) => sameTerm(p.term, term))
      .map((p) => offsetOf(p.at, term))
      .filter((o) => o <= LATE_DAYS)
      .sort((a, b) => a - b);
    if (!offsets.length) continue;
    out.push({ term, count: offsets.length, first: offsets[0], p25: quantile(offsets, 0.25), p75: quantile(offsets, 0.75), offsets });
  }
  return out;
}

/**
 * When `target`'s postings should go up: each past term's first posting and middle half, moved to the
 * target year, then the median across terms. Recent terms count as much as old ones.
 */
export function predict(h: CompanyHistory, target: Term, now = Date.now()): Prediction {
  const cycles = pastCycles(h, target);
  // An evergreen posting tagged with years of terms isn't news that this one opened; only count it from a year out.
  const yearOut = termStart(target) - 365 * DAY;
  const seen = h.postings.filter(
    (p) => sameTerm(p.term, target) || (p.at >= yearOut && !!p.anyOf?.some((t) => sameTerm(t, target))),
  );
  const base: Prediction = { company: h, target, cycles, seen, status: seen.length ? 'open' : 'unknown' };
  if (!cycles.length) return base;
  const start = termStart(target);
  const first = median(cycles.map((c) => c.first));
  const from = median(cycles.map((c) => c.p25));
  const to = median(cycles.map((c) => c.p75));
  const firsts = cycles.map((c) => c.first);
  const spread = Math.max(...firsts) - Math.min(...firsts);
  const confidence = cycles.length >= 2 && spread <= 31 ? 'high' : cycles.length >= 2 && spread <= 90 ? 'medium' : 'low';
  const expectedFirst = start + first * DAY;
  const p: Prediction = {
    ...base,
    expectedFirst,
    windowStart: start + Math.min(first, from) * DAY,
    windowEnd: start + Math.max(to, first) * DAY,
    confidence,
  };
  if (seen.length) return { ...p, status: 'open' };
  if (expectedFirst <= now) return { ...p, status: p.windowEnd! < now - 30 * DAY ? 'passed' : 'due' };
  return { ...p, status: expectedFirst - now <= SOON_DAYS * DAY ? 'soon' : 'later' };
}

const STATUS_ORDER: OpeningStatus[] = ['due', 'soon', 'open', 'later', 'passed', 'unknown'];

export type OpeningSort = 'soonest' | 'known' | 'postings' | 'company';

export const SORT_LABELS: Record<OpeningSort, string> = {
  soonest: 'Opening soonest',
  known: 'Best known',
  postings: 'Most postings',
  company: 'Company A–Z',
};

const bySoonest = (a: Prediction, b: Prediction) =>
  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
  (a.expectedFirst ?? Infinity) - (b.expectedFirst ?? Infinity) ||
  b.company.postings.length - a.company.postings.length;

/**
 * Sorted copy. Opening soonest: expected by now and opening soon first, by expected date; then open,
 * later, passed, and no history. Best known takes [starred, fame] per company key, higher first.
 * Ties fall back to opening soonest.
 */
export function sortPredictions(ps: Prediction[], sort: OpeningSort = 'soonest', known?: (p: Prediction) => [number, number]): Prediction[] {
  if (sort === 'company') return [...ps].sort((a, b) => a.company.name.localeCompare(b.company.name) || bySoonest(a, b));
  if (sort === 'postings') {
    const n = (p: Prediction) => p.cycles.reduce((sum, c) => sum + c.count, 0) + p.seen.length;
    return [...ps].sort((a, b) => n(b) - n(a) || bySoonest(a, b));
  }
  if (sort === 'known' && known) {
    const rank = new Map(ps.map((p) => [p, known(p)]));
    return [...ps].sort((a, b) => {
      const [x, y] = [rank.get(a)!, rank.get(b)!];
      return y[0] - x[0] || y[1] - x[1] || bySoonest(a, b);
    });
  }
  return [...ps].sort(bySoonest);
}

/** Terms worth asking about: the next `count` from `now`, Winter, Summer and Fall. */
export function upcomingTerms(now = Date.now(), count = 6): Term[] {
  const out: Term[] = [];
  const d = new Date(now);
  let year = d.getFullYear();
  let i = (['W', 'S', 'F'] as Season[]).findIndex((s) => SEASON_START[s] > d.getMonth());
  if (i < 0) {
    i = 0;
    year++;
  }
  while (out.length < count) {
    out.push({ season: (['W', 'S', 'F'] as Season[])[i], year });
    i = (i + 1) % 3;
    if (i === 0) year++;
  }
  return out;
}

/** The term most worth planning for: the first starting at least five months out. */
export function defaultTerm(now = Date.now()): Term {
  return upcomingTerms(now).find((t) => termStart(t) - now >= 150 * DAY) ?? upcomingTerms(now)[0];
}

/** How many postings went up in each calendar month, over every year and term: when a company hires at all. */
export function monthCounts(h: CompanyHistory): number[] {
  const out = Array<number>(12).fill(0);
  for (const p of h.postings) out[new Date(p.at).getMonth()]++;
  return out;
}
