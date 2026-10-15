// Ordering the leads list: a "best match" score from the owner's preferences, or plain sorts.

import type { CompanyInfo, FeedSettings, Lead, Library, SalaryPeriod } from '../model/types';
import { companyKey, fame } from './fame';
import { parseSalary } from './salary';

export type LeadSort = 'match' | 'known' | 'newest' | 'company' | 'salary';

export const SORT_LABELS: Record<LeadSort, string> = {
  match: 'Best match',
  known: 'Best known',
  newest: 'Newest',
  company: 'Company A–Z',
  salary: 'Salary',
};

export interface MatchPrefs {
  /** Title words that rank a lead higher. */
  prefer: string[];
  places: string[];
  /** Skills from the library, also looked for in titles. */
  skills: string[];
  /** Stars and fame, by companyKey. */
  companies: Map<string, CompanyInfo>;
}

const list = (s: string) =>
  s
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);

export function matchPrefs(
  settings: Pick<FeedSettings, 'prefer' | 'preferPlaces'>,
  library: Library | null,
  companies: Map<string, CompanyInfo> = new Map(),
): MatchPrefs {
  const prefer = list(settings.prefer);
  const skills = (library?.skills ?? [])
    .flatMap((c) => c.items.map((i) => i.text.trim().toLowerCase()))
    .filter((s) => s.length >= 2 && !prefer.includes(s));
  return { prefer, places: list(settings.preferPlaces), skills: [...new Set(skills)], companies };
}

/** `word` as a whole word: "go" is not in "google", "c++" is in "c++ developer". */
function hasWord(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${esc}($|[^a-z0-9+#])`).test(text);
}

export interface Match {
  score: number;
  /** What raised the score, to show beside the lead. */
  reasons: string[];
}

export function scoreLead(lead: Lead, p: MatchPrefs): Match {
  const title = lead.role.toLowerCase();
  const where = (lead.location ?? '').toLowerCase();
  const company = p.companies.get(companyKey(lead.company));
  let score = 0;
  const reasons: string[] = [];
  if (company?.starred) {
    score += 5;
    reasons.push('★ starred');
  }
  for (const w of p.prefer) {
    if (hasWord(title, w)) {
      score += 3;
      reasons.push(w);
    }
  }
  const place = p.places.find((pl) => where.includes(pl));
  if (place) {
    score += 2;
    reasons.push(place);
  }
  const skills = p.skills.filter((s) => hasWord(title, s)).slice(0, 3);
  score += skills.length;
  reasons.push(...skills);
  if (lead.tier) {
    score += 1;
    reasons.push(lead.tier === 'faang' ? 'FAANG+' : 'Quant');
  }
  const known = fame(company) ?? 0;
  if (known >= WELL_KNOWN) {
    score += 2;
    reasons.push('well known');
  } else if (known >= KNOWN) {
    score += 1;
    reasons.push('known');
  }
  return { score, reasons };
}

/** Monthly Wikipedia views (or the estimate) that count as known, and well known. */
const KNOWN = 10_000;
const WELL_KNOWN = 100_000;

const PER_YEAR: Record<SalaryPeriod, number> = { hour: 2080, day: 260, week: 52, month: 12, year: 1 };

/** Yearly pay from the listed salary, for comparing; null when there's none or it can't be read. */
export function yearlyPay(lead: Lead): number | null {
  const s = lead.salary ? parseSalary(lead.salary) : undefined;
  const amount = s?.max ?? s?.min;
  if (!s || amount === undefined) return null;
  return amount * PER_YEAR[s.period ?? 'year'];
}

const when = (l: Lead) => l.postedAt ?? l.addedAt;

/** Sorted copy. Ties fall back to newest first. */
export function sortLeads(leads: Lead[], sort: LeadSort, p: MatchPrefs): Lead[] {
  const byNewest = (a: Lead, b: Lead) => when(b) - when(a);
  if (sort === 'newest') return [...leads].sort(byNewest);
  if (sort === 'known') {
    const rank = new Map(
      leads.map((l) => {
        const c = p.companies.get(companyKey(l.company));
        return [l, [c?.starred ? 1 : 0, fame(c) ?? -1, l.tier === 'faang' ? 2 : l.tier === 'quant' ? 1 : 0]] as const;
      }),
    );
    return [...leads].sort((a, b) => {
      const [x, y] = [rank.get(a)!, rank.get(b)!];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || byNewest(a, b);
    });
  }
  if (sort === 'company') return [...leads].sort((a, b) => a.company.localeCompare(b.company) || byNewest(a, b));
  if (sort === 'salary') {
    const pay = new Map(leads.map((l) => [l, yearlyPay(l)]));
    // no salary goes last
    return [...leads].sort((a, b) => (pay.get(b) ?? -1) - (pay.get(a) ?? -1) || byNewest(a, b));
  }
  const score = new Map(leads.map((l) => [l, scoreLead(l, p).score]));
  return [...leads].sort((a, b) => score.get(b)! - score.get(a)! || byNewest(a, b));
}

/** Sorted leads grouped by company, groups in the order of their first (best) lead. */
export function groupByCompany(sorted: Lead[]): { company: string; leads: Lead[] }[] {
  const groups = new Map<string, { company: string; leads: Lead[] }>();
  for (const l of sorted) {
    const key = l.company.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const g = groups.get(key) ?? { company: l.company, leads: [] };
    groups.set(key, g);
    g.leads.push(l);
  }
  return [...groups.values()];
}
