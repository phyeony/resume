// How well known a company is, from Wikipedia: which article is the company's (one Wikidata query for
// many companies), how many Wikipedias have it (known at once), and its monthly page views (fetched
// one at a time, gently: Wikimedia rate-limits clients that hurry).

import type { CompanyInfo, Lead } from '../model/types';

export const companyKey = (company: string) => company.toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---- domains -------------------------------------------------------------------

/** Job boards: their host names the board, not the company. */
const JOB_BOARDS = new Set([
  'greenhouse', 'lever', 'ashbyhq', 'myworkdayjobs', 'myworkdaysite', 'smartrecruiters', 'icims', 'jobvite', 'workable', 'bamboohr',
  'recruitee', 'breezy', 'applytojob', 'paylocity', 'ultipro', 'ukg', 'taleo', 'oraclecloud', 'successfactors', 'eightfold',
  'rippling', 'gem', 'dover', 'wellfound', 'linkedin', 'indeed', 'simplify', 'careerpuck', 'phenompeople', 'avature', 'brassring',
  'csod', 'adp', 'teamtailor', 'personio', 'pinpointhq', 'jazzhr', 'glassdoor', 'handshake', 'joinhandshake', 'ycombinator',
  'workatastartup', 'hire', 'trinethire', 'paycomonline', 'dayforcehcm', 'jobs',
]);

const SECTION = new Set(['about', 'careers', 'career', 'jobs', 'corporate', 'investors', 'ir', 'global', 'company']);

/** The name part of a host: "careers.microsoft.com" → "microsoft", "lifefitness.com.cn" → "lifefitness". */
export function siteLabel(url: string | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const parts = nameParts(host);
  return parts[nameIndex(parts)] ?? null;
}

/** Host parts without "www" and leading sections: about.google → [google], careers.acme.co.uk → [acme, co, uk]. */
function nameParts(host: string): string[] {
  let parts = host.split('.').filter((p) => p && p !== 'www');
  // a section only when something name-like follows ("jobs.com" stays)
  while (parts.length >= 2 && SECTION.has(parts[0]) && !(parts.length === 2 && parts[1].length <= 3)) parts = parts.slice(1);
  return parts;
}

/** Which part is the name: before the TLD, or before a two-level one (co.uk, com.cn). */
function nameIndex(parts: string[]): number {
  if (parts.length < 2) return 0;
  const n = parts.length;
  const twoLevel = n >= 3 && parts[n - 1].length === 2 && ['com', 'co', 'org', 'net', 'ac', 'gov', 'edu'].includes(parts[n - 2]);
  return n - (twoLevel ? 3 : 2);
}

/** The registrable domain: "careers.microsoft.com" → "microsoft.com", "x.lifefitness.com.cn" → "lifefitness.com.cn". */
export function siteDomain(url: string | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const parts = nameParts(host);
  return parts.length ? parts.slice(nameIndex(parts)).join('.') : null;
}

/**
 * Where the company's own website might be, from what a lead knows: full domains ("ramp.com") from
 * its site or a posting host that isn't a job board, or a bare name ("nvidia") from a board subdomain.
 */
export function domainHints(lead: Pick<Lead, 'url' | 'companySite'>): string[] {
  const hints = new Set<string>();
  const site = siteDomain(lead.companySite);
  if (site) hints.add(site);
  try {
    const u = new URL(lead.url);
    const label = siteLabel(lead.url);
    if (label && !JOB_BOARDS.has(label)) hints.add(siteDomain(lead.url)!);
    // nvidia.wd5.myworkdayjobs.com, acme.icims.com
    else if (label && u.hostname.split('.').length > 2) {
      const sub = u.hostname.split('.')[0].replace(/^(careers|jobs)-/, '');
      if (!['www', 'jobs', 'careers', 'boards', 'job-boards', 'apply', 'app'].includes(sub)) hints.add(sub.replace(/[^a-z0-9]/g, ''));
    }
  } catch {
    // no URL
  }
  return [...hints];
}

// ---- finding the article -------------------------------------------------------

const SUFFIX = /[,\s]+(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|company|technologies|technology|labs|group|holdings|industries|plc|gmbh|ag|sa)\.?$/i;

/**
 * The names to look for. Full: as listed, in normal case if it's all capitals ("NVIDIA" → "Nvidia"),
 * and with a legal suffix added ("KLA Corporation"). Short: without "Inc.", "Labs"… ("Tessera Labs" →
 * "Tessera"), which may name something else, so it needs stronger evidence.
 */
export function nameVariants(name: string): { full: string[]; short: string[] } {
  const base = name.trim();
  if (!base) return { full: [], short: [] };
  const full = new Set([base]);
  if (base.length > 4 && base === base.toUpperCase() && /[A-Z]/.test(base)) full.add(base[0] + base.slice(1).toLowerCase());
  if (!SUFFIX.test(base)) for (const sfx of ['Corporation', 'Inc.', 'Company', 'Group']) full.add(`${base} ${sfx}`);
  const short = new Set<string>();
  let n = base;
  while (SUFFIX.test(n)) {
    n = n.replace(SUFFIX, '').trim();
    if (n && !full.has(n)) short.add(n);
  }
  return { full: [...full], short: [...short] };
}

const allVariants = (name: string) => {
  const v = nameVariants(name);
  return [...v.full, ...v.short];
};

const sparqlString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Items labelled with any of the names (English or language-neutral label, or an alias) that have an English article. */
export function buildQuery(names: string[]): string {
  const values = names.flatMap((n) => [`${sparqlString(n)}@en`, `${sparqlString(n)}@mul`]).join(' ');
  return `SELECT ?name ?item ?article ?site ?langs ?desc WHERE {
  VALUES ?name { ${values} }
  { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  ?item wikibase:sitelinks ?langs .
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = "en") }
}`;
}

export interface Candidate {
  /** The name it was found under. */
  name: string;
  item: string;
  /** en.wikipedia title, with spaces. */
  article: string;
  langs: number;
  sites: string[];
  desc: string;
}

interface Binding {
  [k: string]: { value: string } | undefined;
}

/** One candidate per (name, item), its websites collected. */
export function parseResults(json: { results: { bindings: Binding[] } }): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const b of json.results.bindings) {
    const name = b.name?.value;
    const item = b.item?.value;
    const article = b.article?.value;
    if (!name || !item || !article) continue;
    const k = `${name}|${item}`;
    const c = out.get(k) ?? {
      name,
      item,
      article: decodeURIComponent(article.slice(article.lastIndexOf('/wiki/') + 6)).replace(/_/g, ' '),
      langs: Number(b.langs?.value ?? 0),
      sites: [],
      desc: b.desc?.value ?? '',
    };
    out.set(k, c);
    if (b.site?.value && !c.sites.includes(b.site.value)) c.sites.push(b.site.value);
  }
  return [...out.values()];
}

const COMPANYISH = /\b(company|companies|corporation|conglomerate|firm|manufacturer|startup|bank|enterprise|business|developer|provider|retailer|platform|contractor|software|subsidiary|airline|maker|fund|brand|automaker|insurer|operator|marketplace|service)\b/i;
const NOT_A_COMPANY = /disambiguation page|list article|^family name|^given name/i;

export interface ArticleMatch {
  article: string;
  langs: number;
  matchedBy: 'site' | 'name' | 'description';
}

/**
 * The company's article among the candidates: its website matches what the lead points at, else its
 * website is the company's name (figma.com for Figma), else it describes itself as a company. The
 * most-linked wins a tie. Null when nothing is convincing; a wrong article is worse than none.
 */
export function pickArticle(company: string, hints: string[], all: Candidate[]): ArticleMatch | null {
  const { full, short } = nameVariants(company);
  const fullSet = new Set(full);
  const variants = new Set([...full, ...short]);
  const names = new Set([company, ...short].map(companyKey));
  const cands = all.filter((c) => variants.has(c.name) && !NOT_A_COMPANY.test(c.desc));
  const labels = (c: Candidate) => c.sites.map(siteLabel).filter((l): l is string => !!l);
  const domains = (c: Candidate) => c.sites.map(siteDomain).filter((d): d is string => !!d);
  const companyish = (c: Candidate) => COMPANYISH.test(c.desc);
  // Several match: a company over its product (Google over Google Search), then the most-linked.
  const best = (cs: Candidate[]) => cs.sort((a, b) => Number(companyish(b)) - Number(companyish(a)) || b.langs - a.langs)[0];
  const domainHints = hints.filter((h) => h.includes('.'));
  const labelHints = hints.filter((h) => !h.includes('.'));
  // A short name as a website (cai.it for CAI) is common; then the description must say company too.
  const shortOk = (l: string, c: Candidate) => l.length > 4 || companyish(c);
  const bySite = (c: Candidate) => domains(c).some((d) => domainHints.includes(d)) || labels(c).some((l) => labelHints.includes(l) && shortOk(l, c));
  const byName = (c: Candidate) => labels(c).some((l) => names.has(l) && shortOk(l, c));
  // Site and name together: a company beats its product (Google over Google Search, both on
  // google.com), then the site match, then the most-linked.
  const pool = cands.filter((c) => bySite(c) || byName(c));
  pool.sort((a, b) => Number(companyish(b)) - Number(companyish(a)) || Number(bySite(b)) - Number(bySite(a)) || b.langs - a.langs);
  if (pool[0]) return { article: pool[0].article, langs: pool[0].langs, matchedBy: bySite(pool[0]) ? 'site' : 'name' };
  // By description alone only for a name long enough not to be someone else's acronym (CAI).
  if (companyKey(company).length <= 4) return null;
  const c = best(cands.filter((x) => fullSet.has(x.name) && x.sites.length > 0 && companyish(x)));
  return c ? { article: c.article, langs: c.langs, matchedBy: 'description' } : null;
}

// ---- how well known ---------------------------------------------------------------

/** "2026-09": the last full month, whose views are complete. */
export function lastMonth(now = Date.now()): string {
  const d = new Date(now);
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * A number to rank by: monthly views, else an estimate from how many Wikipedias have the article
 * (about a thousand views a month per language, roughly right for companies). Null: not known.
 */
export function fame(info: CompanyInfo | undefined): number | null {
  if (!info?.article) return null;
  if (info.views !== undefined) return info.views;
  return info.langs ? info.langs * 1000 : null;
}

export function fameLabel(info: CompanyInfo | undefined): string | null {
  if (!info) return null;
  if (info.article === null) return 'Not on Wikipedia';
  if (!info.article) return null;
  if (info.views !== undefined) return `${compact(info.views)} Wikipedia views/mo`;
  return info.langs ? `On ${info.langs} Wikipedia${info.langs === 1 ? '' : 's'}` : 'On Wikipedia';
}

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export const articleUrl = (article: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, '_'))}`;

/** "https://en.wikipedia.org/wiki/Ramp_(company)" → "Ramp (company)"; null if it isn't such a link. */
export function articleFromUrl(url: string): string | null {
  const m = /^https?:\/\/(?:en\.)?(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i.exec(url.trim());
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
}

// ---- fetching -----------------------------------------------------------------------

const SPARQL = 'https://query.wikidata.org/sparql';
const RETRY_WAIT = 30_000;

export class RateLimited extends Error {
  constructor() {
    super('Wikipedia asked us to slow down. Try again in a few minutes.');
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, init?: RequestInit, tries = 3): Promise<unknown | null> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, init);
    if (res.status === 404) return null;
    if (res.status === 429 || res.status === 503) {
      if (i < tries - 1) await wait(RETRY_WAIT);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }
  throw new RateLimited();
}

/** Articles for many companies, in as few queries as possible (40 companies per query). */
export async function findArticles(companies: { name: string; hints: string[] }[]): Promise<Map<string, ArticleMatch | null>> {
  const out = new Map<string, ArticleMatch | null>();
  // Each company asks for up to ~7 names, twice (two label languages); 40 keeps a query quick.
  for (let i = 0; i < companies.length; i += 40) {
    const chunk = companies.slice(i, i + 40);
    const names = [...new Set(chunk.flatMap((c) => allVariants(c.name)))];
    // A form POST: the query is too long for a URL, and a form needs no CORS preflight.
    const json = (await getJson(SPARQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
      body: new URLSearchParams({ query: buildQuery(names), format: 'json' }),
    })) as { results: { bindings: Binding[] } };
    const cands = parseResults(json);
    for (const c of chunk) out.set(companyKey(c.name), pickArticle(c.name, c.hints, cands));
  }
  return out;
}

/** Views by people of the article on English Wikipedia during `month` ("2026-09"); null when none are recorded. */
export async function monthlyViews(article: string, month: string): Promise<number | null> {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = `${y}${String(m).padStart(2, '0')}`;
  const title = encodeURIComponent(article.replace(/ /g, '_'));
  const json = (await getJson(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/monthly/${ym}01/${ym}${last}`,
  )) as { items?: { views: number }[] } | null;
  return json?.items?.reduce((n, x) => n + x.views, 0) ?? null;
}
